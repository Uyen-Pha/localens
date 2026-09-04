BEGIN;

CREATE TABLE private.booking_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE RESTRICT,
  customer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  source_kind text NOT NULL CHECK (source_kind IN ('departure', 'quote')),
  reason_code text,
  other_reason text,
  request_idempotency_key text NOT NULL CHECK (
    request_idempotency_key = btrim(request_idempotency_key)
    AND request_idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$'
  ),
  cancelled_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  UNIQUE (customer_user_id, request_idempotency_key),
  CONSTRAINT booking_cancellations_reason_pair_check CHECK (
    (reason_code IS NULL AND other_reason IS NULL)
    OR
    (
      reason_code IN (
        'trip_plan_changed',
        'wrong_tour_or_departure',
        'booking_details_change',
        'tour_details_unsuitable',
        'price_unsuitable',
        'payment_unavailable'
      )
      AND other_reason IS NULL
    )
    OR
    (
      reason_code = 'other'
      AND other_reason = btrim(other_reason)
      AND length(other_reason) BETWEEN 3 AND 500
      AND other_reason !~ '[[:cntrl:]]'
    )
  )
);

CREATE TYPE public.booking_cancellation_result AS (
  id uuid,
  booking_id uuid,
  customer_user_id uuid,
  source_kind text,
  reason_code text,
  other_reason text,
  idempotency_key text,
  cancelled_at timestamptz,
  booking_status public.booking_status,
  state text
);

ALTER TABLE private.booking_cancellations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.booking_cancellations FORCE ROW LEVEL SECURITY;

CREATE POLICY booking_cancellations_customer_rpc_select
  ON private.booking_cancellations FOR SELECT
  TO localens_cancellation_customer_rpc_owner
  USING (current_user = 'localens_cancellation_customer_rpc_owner');
CREATE POLICY booking_cancellations_customer_rpc_insert
  ON private.booking_cancellations FOR INSERT
  TO localens_cancellation_customer_rpc_owner
  WITH CHECK (current_user = 'localens_cancellation_customer_rpc_owner');
CREATE POLICY booking_cancellations_customer_projection_select
  ON private.booking_cancellations FOR SELECT
  TO localens_cancellation_customer_projection_owner
  USING (true);
CREATE POLICY booking_cancellations_admin_projection_select
  ON private.booking_cancellations FOR SELECT
  TO localens_cancellation_admin_projection_owner
  USING (true);
CREATE POLICY booking_cancellations_guard_select
  ON private.booking_cancellations FOR SELECT
  TO localens_cancellation_guard_owner
  USING (current_user = 'localens_cancellation_guard_owner');
CREATE POLICY booking_cancellations_guard_insert
  ON private.booking_cancellations FOR INSERT
  TO localens_cancellation_guard_owner
  WITH CHECK (current_user = 'localens_cancellation_guard_owner');
CREATE POLICY bookings_cancellation_guard_select
  ON public.bookings FOR SELECT
  TO localens_cancellation_guard_owner
  USING (current_user = 'localens_cancellation_guard_owner');

CREATE POLICY custom_quotes_cancellation_customer_select
  ON public.custom_quotes FOR SELECT
  TO localens_cancellation_customer_rpc_owner
  USING (current_user = 'localens_cancellation_customer_rpc_owner');
CREATE POLICY custom_quotes_cancellation_customer_update
  ON public.custom_quotes FOR UPDATE
  TO localens_cancellation_customer_rpc_owner
  USING (current_user = 'localens_cancellation_customer_rpc_owner')
  WITH CHECK (current_user = 'localens_cancellation_customer_rpc_owner');

REVOKE ALL ON TABLE private.booking_cancellations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE private.booking_cancellations TO localens_cancellation_customer_rpc_owner;
GRANT SELECT ON TABLE private.booking_cancellations TO
  localens_cancellation_customer_projection_owner,
  localens_cancellation_admin_projection_owner,
  localens_cancellation_guard_owner;
GRANT INSERT ON TABLE private.booking_cancellations TO localens_cancellation_guard_owner;
GRANT SELECT (id, source_kind) ON TABLE public.bookings TO localens_cancellation_guard_owner;

GRANT SELECT ON TABLE public.custom_quotes TO localens_cancellation_customer_rpc_owner;
GRANT UPDATE (status) ON TABLE public.custom_quotes TO localens_cancellation_customer_rpc_owner;
REVOKE UPDATE (id) ON TABLE public.bookings FROM localens_cancellation_customer_rpc_owner;
GRANT UPDATE (status) ON TABLE public.bookings TO localens_cancellation_customer_rpc_owner;
REVOKE UPDATE (id) ON TABLE private.capacity_holds FROM localens_cancellation_customer_rpc_owner;
GRANT UPDATE (status, released_at) ON TABLE private.capacity_holds TO localens_cancellation_customer_rpc_owner;
REVOKE UPDATE (id) ON TABLE private.checkout_attempts FROM localens_cancellation_customer_rpc_owner;
GRANT UPDATE (status, updated_at) ON TABLE private.checkout_attempts TO localens_cancellation_customer_rpc_owner;

GRANT CREATE ON SCHEMA private TO localens_cancellation_guard_owner;
SET LOCAL ROLE localens_cancellation_guard_owner;
CREATE OR REPLACE FUNCTION private.reject_booking_cancellation_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
BEGIN
  RAISE EXCEPTION 'booking cancellations are immutable' USING ERRCODE = '42501';
END;
$function$;

CREATE OR REPLACE FUNCTION private.reject_payment_after_booking_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
BEGIN
  -- Payment, webhook, simulation, and cancellation all serialize on this
  -- durable checkout row before consulting terminal authority facts.
  PERFORM idempotency.id
  FROM private.checkout_idempotency AS idempotency
  WHERE idempotency.booking_id = NEW.booking_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM private.booking_cancellations AS cancellations
    WHERE cancellations.booking_id = NEW.booking_id
  ) THEN
    RAISE EXCEPTION 'CANCELLATION_EXISTS' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.backfill_approved_booking_cancellations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  inserted_count integer;
BEGIN
  INSERT INTO private.booking_cancellations (
    booking_id,
    customer_user_id,
    source_kind,
    reason_code,
    other_reason,
    request_idempotency_key,
    cancelled_at
  )
  SELECT
    requests.booking_id,
    requests.owner_user_id,
    bookings.source_kind,
    CASE
      WHEN requests.reason IN (
        'trip_plan_changed',
        'wrong_tour_or_departure',
        'booking_details_change',
        'tour_details_unsuitable',
        'price_unsuitable',
        'payment_unavailable'
      ) THEN requests.reason
      WHEN length(requests.reason) BETWEEN 3 AND 500
        AND requests.reason = btrim(requests.reason)
        AND requests.reason !~ '[[:cntrl:]]' THEN 'other'
      ELSE NULL
    END,
    CASE
      WHEN requests.reason IN (
        'trip_plan_changed',
        'wrong_tour_or_departure',
        'booking_details_change',
        'tour_details_unsuitable',
        'price_unsuitable',
        'payment_unavailable'
      ) THEN NULL
      WHEN length(requests.reason) BETWEEN 3 AND 500
        AND requests.reason = btrim(requests.reason)
        AND requests.reason !~ '[[:cntrl:]]' THEN requests.reason
      ELSE NULL
    END,
    requests.request_idempotency_key,
    requests.decided_at
  FROM private.fixed_tour_cancellation_requests AS requests
  JOIN public.bookings AS bookings ON bookings.id = requests.booking_id
  WHERE requests.status = 'approved'
    AND requests.decided_at IS NOT NULL
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$function$;
RESET ROLE;

ALTER FUNCTION private.reject_booking_cancellation_mutation() OWNER TO localens_cancellation_guard_owner;
ALTER FUNCTION private.reject_payment_after_booking_cancellation() OWNER TO localens_cancellation_guard_owner;
ALTER FUNCTION private.backfill_approved_booking_cancellations() OWNER TO localens_cancellation_guard_owner;
REVOKE ALL ON FUNCTION private.reject_booking_cancellation_mutation() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.reject_payment_after_booking_cancellation() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.backfill_approved_booking_cancellations() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.backfill_approved_booking_cancellations() TO postgres;

CREATE TRIGGER booking_cancellations_update_delete_guard
  BEFORE UPDATE OR DELETE ON private.booking_cancellations
  FOR EACH ROW EXECUTE FUNCTION private.reject_booking_cancellation_mutation();
CREATE TRIGGER booking_cancellations_truncate_guard
  BEFORE TRUNCATE ON private.booking_cancellations
  FOR EACH STATEMENT EXECUTE FUNCTION private.reject_booking_cancellation_mutation();

DROP TRIGGER IF EXISTS payments_cancellation_approval_exclusion ON public.payments;
CREATE TRIGGER payments_booking_cancellation_exclusion
  BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION private.reject_payment_after_booking_cancellation();
CREATE TRIGGER simulated_receipts_booking_cancellation_exclusion
  BEFORE INSERT ON private.simulated_payment_receipts
  FOR EACH ROW EXECUTE FUNCTION private.reject_payment_after_booking_cancellation();

GRANT SELECT ON TABLE private.fixed_tour_cancellation_requests TO localens_cancellation_guard_owner;
SELECT private.backfill_approved_booking_cancellations();

GRANT CREATE ON SCHEMA public TO localens_cancellation_customer_projection_owner;
SET LOCAL ROLE localens_cancellation_customer_projection_owner;
CREATE OR REPLACE VIEW public.customer_booking_cancellations_v
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  cancellations.id,
  cancellations.booking_id,
  cancellations.customer_user_id,
  cancellations.source_kind,
  cancellations.reason_code,
  cancellations.other_reason,
  cancellations.request_idempotency_key AS idempotency_key,
  cancellations.cancelled_at
FROM private.booking_cancellations AS cancellations
WHERE cancellations.customer_user_id = COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
    pg_catalog.jsonb_extract_path_text(
      NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
      'sub'
    )
  )::uuid
  AND EXISTS (
    SELECT 1 FROM private.user_roles AS roles
    WHERE roles.user_id = cancellations.customer_user_id
      AND roles.role = 'customer'::public.app_role
  )
  AND NOT EXISTS (
    SELECT 1 FROM private.user_roles AS roles
    WHERE roles.user_id = cancellations.customer_user_id
      AND roles.role <> 'customer'::public.app_role
  );
ALTER VIEW public.customer_booking_cancellations_v OWNER TO localens_cancellation_customer_projection_owner;
REVOKE ALL ON public.customer_booking_cancellations_v FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.customer_booking_cancellations_v TO authenticated;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM localens_cancellation_customer_projection_owner;

GRANT CREATE ON SCHEMA public TO localens_cancellation_admin_projection_owner;
SET LOCAL ROLE localens_cancellation_admin_projection_owner;
CREATE OR REPLACE VIEW public.admin_booking_cancellations_v
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  cancellations.id,
  cancellations.booking_id,
  cancellations.customer_user_id,
  cancellations.source_kind,
  cancellations.reason_code,
  cancellations.other_reason,
  cancellations.request_idempotency_key AS idempotency_key,
  cancellations.cancelled_at
FROM private.booking_cancellations AS cancellations
WHERE EXISTS (
    SELECT 1 FROM private.user_roles AS roles
    WHERE roles.user_id = COALESCE(
        NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        pg_catalog.jsonb_extract_path_text(
          NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
          'sub'
        )
      )::uuid
      AND roles.role = 'admin'::public.app_role
  )
  AND NOT EXISTS (
    SELECT 1 FROM private.user_roles AS roles
    WHERE roles.user_id = COALESCE(
        NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        pg_catalog.jsonb_extract_path_text(
          NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
          'sub'
        )
      )::uuid
      AND roles.role <> 'admin'::public.app_role
  );
ALTER VIEW public.admin_booking_cancellations_v OWNER TO localens_cancellation_admin_projection_owner;
REVOKE ALL ON public.admin_booking_cancellations_v FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.admin_booking_cancellations_v TO authenticated;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM localens_cancellation_admin_projection_owner;

GRANT CREATE ON SCHEMA public TO localens_cancellation_customer_rpc_owner;
SET LOCAL ROLE localens_cancellation_customer_rpc_owner;
CREATE OR REPLACE FUNCTION public.cancel_booking(
  booking_id uuid,
  reason_code text DEFAULT NULL,
  other_reason text DEFAULT NULL,
  idempotency_key text DEFAULT NULL
)
RETURNS SETOF public.booking_cancellation_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  requested_booking_id uuid := $1;
  requested_reason_code text := $2;
  requested_other_reason text := $3;
  requested_idempotency_key text := $4;
  actor_user_id uuid;
  idempotency_row private.checkout_idempotency%ROWTYPE;
  routing_attempt private.checkout_attempts%ROWTYPE;
  attempt_row private.checkout_attempts%ROWTYPE;
  booking_row public.bookings%ROWTYPE;
  hold_row private.capacity_holds%ROWTYPE;
  quote_row public.custom_quotes%ROWTYPE;
  cancellation_row private.booking_cancellations%ROWTYPE;
  payment_id uuid;
  simulated_receipt_id uuid;
  source_found boolean := false;
  authority_time timestamptz;
BEGIN
  actor_user_id := COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
    pg_catalog.jsonb_extract_path_text(
      NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
      'sub'
    )
  )::uuid;
  IF actor_user_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM private.user_roles AS roles
       WHERE roles.user_id = actor_user_id AND roles.role = 'customer'::public.app_role
     )
     OR EXISTS (
       SELECT 1 FROM private.user_roles AS roles
       WHERE roles.user_id = actor_user_id AND roles.role <> 'customer'::public.app_role
     ) THEN
    RAISE EXCEPTION 'cancellation customer role required' USING ERRCODE = '42501';
  END IF;

  IF requested_booking_id IS NULL
     OR requested_idempotency_key IS NULL
     OR requested_idempotency_key <> btrim(requested_idempotency_key)
     OR requested_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$'
     OR NOT COALESCE((
       (requested_reason_code IS NULL AND requested_other_reason IS NULL)
       OR
       (
         requested_reason_code IN (
           'trip_plan_changed',
           'wrong_tour_or_departure',
           'booking_details_change',
           'tour_details_unsuitable',
           'price_unsuitable',
           'payment_unavailable'
         )
         AND requested_other_reason IS NULL
       )
       OR
       (
         requested_reason_code = 'other'
         AND requested_other_reason = btrim(requested_other_reason)
         AND length(requested_other_reason) BETWEEN 3 AND 500
         AND requested_other_reason !~ '[[:cntrl:]]'
       )
     ), false) THEN
    RAISE EXCEPTION 'cancellation input rejected' USING ERRCODE = '22023';
  END IF;

  -- Shared terminalization order: checkout idempotency, actor/key advisory,
  -- source row, booking, source-dependent hold, attempt, payment authorities,
  -- and finally the cancellation fact.
  SELECT * INTO idempotency_row
  FROM private.checkout_idempotency AS idempotency
  WHERE idempotency.booking_id = requested_booking_id
    AND idempotency.owner_user_id = actor_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cancellation unavailable' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_user_id::text || ':' || requested_idempotency_key, 0)
  );

  SELECT * INTO routing_attempt
  FROM private.checkout_attempts AS attempts
  WHERE attempts.id = idempotency_row.checkout_attempt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cancellation unavailable' USING ERRCODE = 'P0001';
  END IF;

  IF routing_attempt.source_kind = 'departure'
     AND routing_attempt.departure_id IS NOT NULL
     AND routing_attempt.quote_id IS NULL THEN
    PERFORM departures.id
    FROM public.departures AS departures
    WHERE departures.id = routing_attempt.departure_id
    FOR UPDATE;
    source_found := FOUND;
  ELSIF routing_attempt.source_kind = 'quote'
     AND routing_attempt.quote_id IS NOT NULL
     AND routing_attempt.departure_id IS NULL THEN
    SELECT * INTO quote_row
    FROM public.custom_quotes AS quotes
    WHERE quotes.id = routing_attempt.quote_id
    FOR UPDATE;
    source_found := FOUND;
  END IF;
  IF NOT source_found THEN
    RAISE EXCEPTION 'cancellation unavailable' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO booking_row
  FROM public.bookings AS bookings
  WHERE bookings.id = requested_booking_id
  FOR UPDATE;
  IF NOT FOUND
     OR booking_row.owner_user_id IS DISTINCT FROM actor_user_id
     OR booking_row.source_kind IS DISTINCT FROM routing_attempt.source_kind
     OR booking_row.departure_id IS DISTINCT FROM routing_attempt.departure_id
     OR booking_row.quote_id IS DISTINCT FROM routing_attempt.quote_id THEN
    RAISE EXCEPTION 'cancellation unavailable' USING ERRCODE = '42501';
  END IF;

  IF booking_row.source_kind = 'departure' THEN
    SELECT * INTO hold_row
    FROM private.capacity_holds AS holds
    WHERE holds.booking_id = booking_row.id
    ORDER BY holds.created_at DESC, holds.id DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  SELECT * INTO attempt_row
  FROM private.checkout_attempts AS attempts
  WHERE attempts.id = idempotency_row.checkout_attempt_id
  FOR UPDATE;
  IF NOT FOUND
     OR attempt_row.booking_id IS DISTINCT FROM booking_row.id
     OR attempt_row.owner_user_id IS DISTINCT FROM actor_user_id THEN
    RAISE EXCEPTION 'cancellation unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT payments.id INTO payment_id
  FROM public.payments AS payments
  WHERE payments.booking_id = booking_row.id;
  SELECT receipts.id INTO simulated_receipt_id
  FROM private.simulated_payment_receipts AS receipts
  WHERE receipts.booking_id = booking_row.id;

  SELECT * INTO cancellation_row
  FROM private.booking_cancellations AS cancellations
  WHERE cancellations.booking_id = booking_row.id
     OR (
       cancellations.customer_user_id = actor_user_id
       AND cancellations.request_idempotency_key = requested_idempotency_key
     )
  ORDER BY CASE WHEN cancellations.booking_id = booking_row.id THEN 0 ELSE 1 END
  LIMIT 1;
  IF FOUND THEN
    IF cancellation_row.booking_id IS DISTINCT FROM booking_row.id
       OR cancellation_row.customer_user_id IS DISTINCT FROM actor_user_id
       OR cancellation_row.request_idempotency_key IS DISTINCT FROM requested_idempotency_key
       OR cancellation_row.reason_code IS DISTINCT FROM requested_reason_code
       OR cancellation_row.other_reason IS DISTINCT FROM requested_other_reason THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEXT (
      cancellation_row.id,
      cancellation_row.booking_id,
      cancellation_row.customer_user_id,
      cancellation_row.source_kind,
      cancellation_row.reason_code,
      cancellation_row.other_reason,
      cancellation_row.request_idempotency_key,
      cancellation_row.cancelled_at,
      'cancelled'::public.booking_status,
      'replayed'
    )::public.booking_cancellation_result;
    RETURN;
  END IF;

  authority_time := pg_catalog.clock_timestamp();
  IF booking_row.status <> 'pending_payment'::public.booking_status
     OR attempt_row.status <> 'created'
     OR attempt_row.provider_session_id IS NOT NULL
     OR payment_id IS NOT NULL
     OR simulated_receipt_id IS NOT NULL
     OR (
       booking_row.source_kind = 'departure'
       AND (
         hold_row.id IS NULL
         OR hold_row.status <> 'active'::public.hold_status
         OR hold_row.expires_at <= authority_time
       )
     )
     OR (
       booking_row.source_kind = 'quote'
       AND (
         quote_row.id IS NULL
         OR quote_row.status <> 'checkout_pending'::public.quote_status
         OR quote_row.valid_until <= authority_time
       )
     ) THEN
    RAISE EXCEPTION 'cancellation unavailable' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_catalog.set_config('localens.checkout_transition', 'on', true);
  IF booking_row.source_kind = 'quote' THEN
    PERFORM pg_catalog.set_config('localens.quote_transition', 'on', true);
  END IF;

  UPDATE public.bookings
  SET status = 'cancelled'::public.booking_status
  WHERE id = booking_row.id;
  IF booking_row.source_kind = 'departure' THEN
    UPDATE private.capacity_holds
    SET status = 'released'::public.hold_status,
        released_at = authority_time
    WHERE id = hold_row.id;
  ELSE
    UPDATE public.custom_quotes
    SET status = 'revoked'::public.quote_status
    WHERE id = quote_row.id;
  END IF;
  UPDATE private.checkout_attempts
  SET status = 'compensated', updated_at = authority_time
  WHERE id = attempt_row.id;

  INSERT INTO private.booking_cancellations (
    booking_id,
    customer_user_id,
    source_kind,
    reason_code,
    other_reason,
    request_idempotency_key,
    cancelled_at
  ) VALUES (
    booking_row.id,
    actor_user_id,
    booking_row.source_kind,
    requested_reason_code,
    requested_other_reason,
    requested_idempotency_key,
    authority_time
  )
  RETURNING * INTO cancellation_row;

  RETURN NEXT (
    cancellation_row.id,
    cancellation_row.booking_id,
    cancellation_row.customer_user_id,
    cancellation_row.source_kind,
    cancellation_row.reason_code,
    cancellation_row.other_reason,
    cancellation_row.request_idempotency_key,
    cancellation_row.cancelled_at,
    'cancelled'::public.booking_status,
    'created'
  )::public.booking_cancellation_result;
END;
$function$;
RESET ROLE;

ALTER FUNCTION public.cancel_booking(uuid, text, text, text)
  OWNER TO localens_cancellation_customer_rpc_owner;
REVOKE ALL ON FUNCTION public.cancel_booking(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid, text, text, text)
  TO authenticated;
REVOKE CREATE ON SCHEMA public FROM localens_cancellation_customer_rpc_owner;

SET LOCAL ROLE localens_cancellation_customer_rpc_owner;
REVOKE ALL ON FUNCTION public.request_fixed_tour_cancellation(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
RESET ROLE;
SET LOCAL ROLE localens_cancellation_admin_rpc_owner;
REVOKE ALL ON FUNCTION public.decide_fixed_tour_cancellation(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
RESET ROLE;
REVOKE ALL ON public.customer_fixed_tour_cancellation_requests_v
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.admin_fixed_tour_cancellation_queue_v
  FROM PUBLIC, anon, authenticated, service_role;
DROP VIEW IF EXISTS public.customer_fixed_tour_cancellation_requests_v;
DROP VIEW IF EXISTS public.admin_fixed_tour_cancellation_queue_v;

DROP POLICY IF EXISTS cancellation_requests_customer_rpc_select ON private.fixed_tour_cancellation_requests;
DROP POLICY IF EXISTS cancellation_requests_customer_rpc_insert ON private.fixed_tour_cancellation_requests;
DROP POLICY IF EXISTS cancellation_requests_customer_rpc_lock ON private.fixed_tour_cancellation_requests;
DROP POLICY IF EXISTS cancellation_requests_admin_rpc_select ON private.fixed_tour_cancellation_requests;
DROP POLICY IF EXISTS cancellation_requests_admin_rpc_update ON private.fixed_tour_cancellation_requests;
DROP POLICY IF EXISTS cancellation_requests_customer_projection_select ON private.fixed_tour_cancellation_requests;
DROP POLICY IF EXISTS cancellation_requests_admin_projection_select ON private.fixed_tour_cancellation_requests;
REVOKE ALL ON TABLE private.fixed_tour_cancellation_requests FROM
  PUBLIC,
  anon,
  authenticated,
  service_role,
  localens_cancellation_customer_rpc_owner,
  localens_cancellation_admin_rpc_owner,
  localens_cancellation_customer_projection_owner,
  localens_cancellation_admin_projection_owner;

GRANT CREATE ON SCHEMA private TO localens_cancellation_guard_owner;
SET LOCAL ROLE localens_cancellation_guard_owner;
CREATE OR REPLACE FUNCTION private.assert_fixed_tour_cancellation_request_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
BEGIN
  RAISE EXCEPTION 'legacy cancellation archive is immutable' USING ERRCODE = '42501';
END;
$function$;
CREATE OR REPLACE FUNCTION private.reject_fixed_tour_cancellation_truncate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
BEGIN
  RAISE EXCEPTION 'legacy cancellation archive is immutable' USING ERRCODE = '42501';
END;
$function$;
RESET ROLE;
ALTER FUNCTION private.assert_fixed_tour_cancellation_request_mutation() OWNER TO localens_cancellation_guard_owner;
ALTER FUNCTION private.reject_fixed_tour_cancellation_truncate() OWNER TO localens_cancellation_guard_owner;
REVOKE CREATE ON SCHEMA private FROM localens_cancellation_guard_owner;

COMMIT;
