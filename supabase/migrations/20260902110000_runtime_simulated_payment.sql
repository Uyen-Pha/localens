BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'localens_simulated_payment_rpc_owner'
  ) THEN
    EXECUTE 'CREATE ROLE localens_simulated_payment_rpc_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'localens_simulated_payment_projection_owner'
  ) THEN
    EXECUTE 'CREATE ROLE localens_simulated_payment_projection_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS';
  END IF;
END
$roles$;

GRANT localens_simulated_payment_rpc_owner TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT localens_simulated_payment_projection_owner TO postgres WITH SET TRUE, INHERIT FALSE;

REVOKE ALL ON SCHEMA public, private, auth
  FROM localens_simulated_payment_rpc_owner, localens_simulated_payment_projection_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA public, private, auth
  FROM localens_simulated_payment_rpc_owner, localens_simulated_payment_projection_owner;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public, private
  FROM localens_simulated_payment_rpc_owner, localens_simulated_payment_projection_owner;
CREATE TABLE private.simulated_payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  checkout_attempt_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (
    idempotency_key = btrim(idempotency_key)
    AND length(idempotency_key) BETWEEN 1 AND 255
    AND idempotency_key !~ '[[:cntrl:]]'
  ),
  result_booking_status public.booking_status NOT NULL CHECK (
    result_booking_status IN ('confirmed'::public.booking_status, 'expired'::public.booking_status)
  ),
  result_payment_status public.payment_status,
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 9007199254740991),
  currency public.checkout_currency NOT NULL,
  simulated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  FOREIGN KEY (checkout_attempt_id, booking_id)
    REFERENCES private.checkout_attempts(id, booking_id) ON DELETE RESTRICT,
  UNIQUE (owner_user_id, idempotency_key),
  CHECK (
    (result_booking_status = 'confirmed'::public.booking_status
      AND result_payment_status = 'paid'::public.payment_status
      AND simulated_at IS NOT NULL)
    OR
    (result_booking_status = 'expired'::public.booking_status
      AND result_payment_status IS NULL
      AND simulated_at IS NOT NULL)
  )
);

CREATE TYPE public.simulated_payment_result AS (
  booking_id uuid,
  booking_status public.booking_status,
  payment_status public.payment_status,
  simulated_at timestamptz,
  state text
);

ALTER TABLE private.simulated_payment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.simulated_payment_receipts FORCE ROW LEVEL SECURITY;

CREATE POLICY simulated_payment_receipts_rpc_owner_all
  ON private.simulated_payment_receipts
  FOR ALL TO localens_simulated_payment_rpc_owner
  USING (current_user = 'localens_simulated_payment_rpc_owner')
  WITH CHECK (current_user = 'localens_simulated_payment_rpc_owner');
CREATE POLICY simulated_payment_receipts_checkout_owner_select
  ON private.simulated_payment_receipts
  FOR SELECT TO localens_checkout_rpc_owner
  USING (current_user = 'localens_checkout_rpc_owner');
CREATE POLICY simulated_payment_receipts_projection_owner_select
  ON private.simulated_payment_receipts
  FOR SELECT TO localens_simulated_payment_projection_owner
  USING (
    COALESCE(
      NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
      pg_catalog.jsonb_extract_path_text(
        NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
        'sub'
      )
    )::uuid = owner_user_id
  );
CREATE POLICY simulated_payment_receipts_payment_guard_select
  ON private.simulated_payment_receipts
  FOR SELECT TO localens_payment_guard_owner
  USING (current_user = 'localens_payment_guard_owner');

CREATE POLICY user_roles_simulated_payment_owner_select
  ON private.user_roles
  FOR SELECT TO localens_simulated_payment_rpc_owner
  USING (current_user = 'localens_simulated_payment_rpc_owner');
CREATE POLICY checkout_idempotency_simulated_payment_owner_all
  ON private.checkout_idempotency
  FOR ALL TO localens_simulated_payment_rpc_owner
  USING (current_user = 'localens_simulated_payment_rpc_owner')
  WITH CHECK (current_user = 'localens_simulated_payment_rpc_owner');
CREATE POLICY checkout_idempotency_simulated_payment_guard_select
  ON private.checkout_idempotency
  FOR SELECT TO localens_payment_guard_owner
  USING (current_user = 'localens_payment_guard_owner');
CREATE POLICY checkout_idempotency_simulated_payment_guard_lock
  ON private.checkout_idempotency
  FOR UPDATE TO localens_payment_guard_owner
  USING (current_user = 'localens_payment_guard_owner')
  WITH CHECK (current_user = 'localens_payment_guard_owner');
CREATE POLICY departures_simulated_payment_owner_all
  ON public.departures
  FOR ALL TO localens_simulated_payment_rpc_owner
  USING (current_user = 'localens_simulated_payment_rpc_owner')
  WITH CHECK (current_user = 'localens_simulated_payment_rpc_owner');
CREATE POLICY bookings_simulated_payment_owner_all
  ON public.bookings
  FOR ALL TO localens_simulated_payment_rpc_owner
  USING (current_user = 'localens_simulated_payment_rpc_owner')
  WITH CHECK (current_user = 'localens_simulated_payment_rpc_owner');
CREATE POLICY capacity_holds_simulated_payment_owner_all
  ON private.capacity_holds
  FOR ALL TO localens_simulated_payment_rpc_owner
  USING (current_user = 'localens_simulated_payment_rpc_owner')
  WITH CHECK (current_user = 'localens_simulated_payment_rpc_owner');
CREATE POLICY checkout_attempts_simulated_payment_owner_all
  ON private.checkout_attempts
  FOR ALL TO localens_simulated_payment_rpc_owner
  USING (current_user = 'localens_simulated_payment_rpc_owner')
  WITH CHECK (current_user = 'localens_simulated_payment_rpc_owner');
CREATE POLICY payments_simulated_payment_owner_select
  ON public.payments
  FOR SELECT TO localens_simulated_payment_rpc_owner
  USING (current_user = 'localens_simulated_payment_rpc_owner');
CREATE POLICY bookings_simulated_payment_projection_select
  ON public.bookings
  FOR SELECT TO localens_simulated_payment_projection_owner
  USING (
    COALESCE(
      NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
      pg_catalog.jsonb_extract_path_text(
        NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
        'sub'
      )
    )::uuid = owner_user_id
  );

REVOKE ALL ON TABLE private.simulated_payment_receipts FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public, private, auth
  TO localens_simulated_payment_rpc_owner, localens_simulated_payment_projection_owner;
GRANT SELECT ON TABLE private.user_roles TO localens_simulated_payment_rpc_owner;
GRANT SELECT ON TABLE private.checkout_idempotency TO localens_simulated_payment_rpc_owner;
GRANT UPDATE (id) ON TABLE private.checkout_idempotency TO localens_simulated_payment_rpc_owner;
GRANT SELECT ON TABLE public.departures TO localens_simulated_payment_rpc_owner;
GRANT UPDATE (id) ON TABLE public.departures TO localens_simulated_payment_rpc_owner;
GRANT SELECT ON TABLE public.bookings TO localens_simulated_payment_rpc_owner;
GRANT UPDATE (status) ON TABLE public.bookings TO localens_simulated_payment_rpc_owner;
GRANT SELECT ON TABLE private.capacity_holds TO localens_simulated_payment_rpc_owner;
GRANT UPDATE (status, consumed_at, released_at) ON TABLE private.capacity_holds TO localens_simulated_payment_rpc_owner;
GRANT SELECT ON TABLE private.checkout_attempts TO localens_simulated_payment_rpc_owner;
GRANT UPDATE (id) ON TABLE private.checkout_attempts TO localens_simulated_payment_rpc_owner;
GRANT SELECT ON TABLE public.payments TO localens_simulated_payment_rpc_owner;
GRANT SELECT, INSERT ON TABLE private.simulated_payment_receipts TO localens_simulated_payment_rpc_owner;

GRANT SELECT (id, status, source_kind, owner_user_id, checkout_amount_minor, checkout_currency)
  ON TABLE public.bookings TO localens_simulated_payment_projection_owner;
GRANT SELECT (booking_id, owner_user_id, result_payment_status, simulated_at)
  ON TABLE private.simulated_payment_receipts TO localens_simulated_payment_projection_owner;
GRANT SELECT ON TABLE private.simulated_payment_receipts TO localens_checkout_rpc_owner;

-- Every real-payment insert serializes on the same checkout routing row used by
-- simulated terminalization. This closes both orderings: a committed real
-- payment makes simulation fail closed, while a committed simulation prevents
-- any later provider-payment row from being created.
GRANT USAGE ON SCHEMA private TO localens_payment_guard_owner;
GRANT SELECT ON TABLE private.simulated_payment_receipts, private.checkout_idempotency
  TO localens_payment_guard_owner;
GRANT UPDATE (id) ON TABLE private.checkout_idempotency TO localens_payment_guard_owner;
GRANT CREATE ON SCHEMA private TO localens_payment_guard_owner;
SET LOCAL ROLE localens_payment_guard_owner;
CREATE OR REPLACE FUNCTION private.reject_real_payment_after_simulation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
BEGIN
  PERFORM idempotency.id
  FROM private.checkout_idempotency AS idempotency
  WHERE idempotency.booking_id = NEW.booking_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM private.simulated_payment_receipts AS receipts
    WHERE receipts.booking_id = NEW.booking_id
  ) THEN
    RAISE EXCEPTION 'SIMULATED_PAYMENT_EXISTS' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;
RESET ROLE;
SET LOCAL ROLE postgres;
ALTER FUNCTION private.reject_real_payment_after_simulation()
  OWNER TO localens_payment_guard_owner;
CREATE TRIGGER payments_simulated_payment_exclusion
  BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION private.reject_real_payment_after_simulation();
SET LOCAL ROLE localens_payment_guard_owner;
REVOKE ALL ON FUNCTION private.reject_real_payment_after_simulation()
  FROM PUBLIC, anon, authenticated;
RESET ROLE;
SET LOCAL ROLE postgres;
REVOKE CREATE ON SCHEMA private FROM localens_payment_guard_owner;

GRANT CREATE ON SCHEMA public TO localens_simulated_payment_projection_owner;
CREATE OR REPLACE VIEW public.customer_simulated_payment_status_v
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  bookings.id AS booking_id,
  bookings.status AS booking_status,
  receipts.result_payment_status AS payment_status,
  bookings.checkout_amount_minor::text AS amount_minor,
  bookings.checkout_currency AS currency,
  receipts.simulated_at
FROM public.bookings AS bookings
JOIN private.simulated_payment_receipts AS receipts
  ON receipts.booking_id = bookings.id
WHERE bookings.source_kind = 'departure'
  AND bookings.owner_user_id = COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
    pg_catalog.jsonb_extract_path_text(
      NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
      'sub'
    )
  )::uuid;
ALTER VIEW public.customer_simulated_payment_status_v
  OWNER TO localens_simulated_payment_projection_owner;
SET LOCAL ROLE localens_simulated_payment_projection_owner;
REVOKE ALL ON public.customer_simulated_payment_status_v FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.customer_simulated_payment_status_v TO authenticated;
RESET ROLE;
SET LOCAL ROLE postgres;
REVOKE CREATE ON SCHEMA public FROM localens_simulated_payment_projection_owner;

GRANT CREATE ON SCHEMA public TO localens_simulated_payment_rpc_owner;
SET LOCAL ROLE localens_simulated_payment_rpc_owner;
CREATE OR REPLACE FUNCTION public.complete_simulated_fixed_tour_payment(
  booking_id uuid,
  idempotency_key text
)
RETURNS SETOF public.simulated_payment_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  requested_booking_id uuid := $1;
  requested_idempotency_key text := $2;
  actor_user_id uuid;
  idempotency_row private.checkout_idempotency%ROWTYPE;
  routing_attempt private.checkout_attempts%ROWTYPE;
  attempt_row private.checkout_attempts%ROWTYPE;
  departure_row public.departures%ROWTYPE;
  booking_row public.bookings%ROWTYPE;
  hold_row private.capacity_holds%ROWTYPE;
  receipt_row private.simulated_payment_receipts%ROWTYPE;
  real_payment_id uuid;
  authority_time timestamptz;
BEGIN
  actor_user_id := COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
    pg_catalog.jsonb_extract_path_text(
      NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
      'sub'
    )
  )::uuid;

  IF actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM private.user_roles AS roles
    WHERE roles.user_id = actor_user_id
      AND roles.role = 'customer'::public.app_role
  ) THEN
    RAISE EXCEPTION 'simulated payment authentication required' USING ERRCODE = '42501';
  END IF;
  IF requested_booking_id IS NULL
     OR requested_idempotency_key IS NULL
     OR requested_idempotency_key <> btrim(requested_idempotency_key)
     OR length(requested_idempotency_key) NOT BETWEEN 1 AND 255
     OR requested_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$' THEN
    RAISE EXCEPTION 'simulated payment input rejected' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO idempotency_row
  FROM private.checkout_idempotency AS receipts
  WHERE receipts.booking_id = requested_booking_id
    AND receipts.owner_user_id = actor_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'simulated payment unavailable' USING ERRCODE = '42501';
  END IF;

  -- Serialize the same customer key even when two different booking rows are
  -- targeted concurrently. The durable row locks below keep the shared order.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_user_id::text || ':' || requested_idempotency_key, 0)
  );

  SELECT * INTO routing_attempt
  FROM private.checkout_attempts AS attempts
  WHERE attempts.id = idempotency_row.checkout_attempt_id;
  IF NOT FOUND OR routing_attempt.departure_id IS NULL OR routing_attempt.quote_id IS NOT NULL THEN
    RAISE EXCEPTION 'simulated payment unavailable' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO departure_row
  FROM public.departures AS departures
  WHERE departures.id = routing_attempt.departure_id
  FOR UPDATE;
  SELECT * INTO booking_row
  FROM public.bookings AS bookings
  WHERE bookings.id = requested_booking_id
  FOR UPDATE;
  IF NOT FOUND
     OR booking_row.owner_user_id IS DISTINCT FROM actor_user_id
     OR booking_row.source_kind IS DISTINCT FROM 'departure'
     OR booking_row.departure_id IS DISTINCT FROM routing_attempt.departure_id THEN
    RAISE EXCEPTION 'simulated payment unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO hold_row
  FROM private.capacity_holds AS holds
  WHERE holds.booking_id = booking_row.id
  ORDER BY holds.created_at DESC, holds.id DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'simulated payment hold unavailable' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO attempt_row
  FROM private.checkout_attempts AS attempts
  WHERE attempts.id = idempotency_row.checkout_attempt_id
  FOR UPDATE;
  IF NOT FOUND
     OR attempt_row.booking_id IS DISTINCT FROM booking_row.id
     OR attempt_row.owner_user_id IS DISTINCT FROM actor_user_id
     OR attempt_row.departure_id IS DISTINCT FROM booking_row.departure_id THEN
    RAISE EXCEPTION 'simulated payment unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT payments.id INTO real_payment_id
  FROM public.payments AS payments
  WHERE payments.booking_id = booking_row.id;
  IF real_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'REAL_PAYMENT_EXISTS' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO receipt_row
  FROM private.simulated_payment_receipts AS receipts
  WHERE receipts.booking_id = booking_row.id
     OR (receipts.owner_user_id = actor_user_id
         AND receipts.idempotency_key = requested_idempotency_key)
  ORDER BY CASE WHEN receipts.booking_id = booking_row.id THEN 0 ELSE 1 END
  LIMIT 1;
  IF FOUND THEN
    IF receipt_row.booking_id IS DISTINCT FROM booking_row.id
       OR receipt_row.owner_user_id IS DISTINCT FROM actor_user_id
       OR receipt_row.idempotency_key IS DISTINCT FROM requested_idempotency_key THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEXT (
      receipt_row.booking_id,
      receipt_row.result_booking_status,
      receipt_row.result_payment_status,
      receipt_row.simulated_at,
      'replayed'::text
    )::public.simulated_payment_result;
    RETURN;
  END IF;

  authority_time := pg_catalog.clock_timestamp();
  IF hold_row.expires_at <= authority_time
     OR hold_row.status = 'expired'::public.hold_status
     OR booking_row.status = 'expired'::public.booking_status THEN
    PERFORM pg_catalog.set_config('localens.checkout_transition', 'on', true);
    IF hold_row.status = 'active'::public.hold_status THEN
      UPDATE private.capacity_holds
      SET status = 'expired'::public.hold_status,
          released_at = authority_time
      WHERE id = hold_row.id;
    ELSIF hold_row.status <> 'expired'::public.hold_status THEN
      RAISE EXCEPTION 'simulated payment unavailable' USING ERRCODE = 'P0001';
    END IF;
    IF booking_row.status = 'pending_payment'::public.booking_status THEN
      UPDATE public.bookings
      SET status = 'expired'::public.booking_status
      WHERE id = booking_row.id;
    ELSIF booking_row.status <> 'expired'::public.booking_status THEN
      RAISE EXCEPTION 'simulated payment unavailable' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO private.simulated_payment_receipts (
      booking_id, owner_user_id, checkout_attempt_id, idempotency_key,
      result_booking_status, result_payment_status, amount_minor, currency,
      simulated_at, created_at
    ) VALUES (
      booking_row.id, actor_user_id, attempt_row.id, requested_idempotency_key,
      'expired'::public.booking_status, NULL, booking_row.checkout_amount_minor,
      booking_row.checkout_currency, authority_time, authority_time
    ) RETURNING * INTO receipt_row;
  ELSE
    IF booking_row.status <> 'pending_payment'::public.booking_status
       OR hold_row.status <> 'active'::public.hold_status
       OR attempt_row.status <> 'created'
       OR attempt_row.provider_session_id IS NOT NULL THEN
      RAISE EXCEPTION 'simulated payment unavailable' USING ERRCODE = 'P0001';
    END IF;
    PERFORM pg_catalog.set_config('localens.checkout_transition', 'on', true);
    UPDATE public.bookings
    SET status = 'payment_processing'::public.booking_status
    WHERE id = booking_row.id;
    UPDATE private.capacity_holds
    SET status = 'consumed'::public.hold_status,
        consumed_at = authority_time
    WHERE id = hold_row.id;
    UPDATE public.bookings
    SET status = 'confirmed'::public.booking_status
    WHERE id = booking_row.id;
    INSERT INTO private.simulated_payment_receipts (
      booking_id, owner_user_id, checkout_attempt_id, idempotency_key,
      result_booking_status, result_payment_status, amount_minor, currency,
      simulated_at, created_at
    ) VALUES (
      booking_row.id, actor_user_id, attempt_row.id, requested_idempotency_key,
      'confirmed'::public.booking_status, 'paid'::public.payment_status,
      booking_row.checkout_amount_minor, booking_row.checkout_currency,
      authority_time, authority_time
    ) RETURNING * INTO receipt_row;
  END IF;

  RETURN NEXT (
    receipt_row.booking_id,
    receipt_row.result_booking_status,
    receipt_row.result_payment_status,
    receipt_row.simulated_at,
    CASE
      WHEN receipt_row.result_booking_status = 'expired'::public.booking_status THEN 'expired'
      ELSE 'completed'
    END
  )::public.simulated_payment_result;
END;
$function$;
RESET ROLE;
SET LOCAL ROLE postgres;
ALTER FUNCTION public.complete_simulated_fixed_tour_payment(uuid, text)
  OWNER TO localens_simulated_payment_rpc_owner;
SET LOCAL ROLE localens_simulated_payment_rpc_owner;
REVOKE ALL ON FUNCTION public.complete_simulated_fixed_tour_payment(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_simulated_fixed_tour_payment(uuid, text)
  TO authenticated;
RESET ROLE;
SET LOCAL ROLE postgres;
REVOKE CREATE ON SCHEMA public FROM localens_simulated_payment_rpc_owner;

GRANT CREATE ON SCHEMA private TO localens_checkout_rpc_owner;
SET LOCAL ROLE localens_checkout_rpc_owner;
CREATE OR REPLACE FUNCTION private.compensate_checkout_failure(p_attempt_id uuid)
RETURNS TABLE (
  booking_id uuid,
  booking_status public.booking_status,
  quote_status public.quote_status,
  state text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  actor_user_id uuid := NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid;
  idempotency_row private.checkout_idempotency%ROWTYPE;
  attempt_row private.checkout_attempts%ROWTYPE;
  booking_row public.bookings%ROWTYPE;
  hold_row private.capacity_holds%ROWTYPE;
  quote_row public.custom_quotes%ROWTYPE;
  departure_row public.departures%ROWTYPE;
  simulated_receipt_id uuid;
  real_payment_id uuid;
  has_hold boolean := false;
  now_time timestamptz;
BEGIN
  IF actor_user_id IS NULL OR p_attempt_id IS NULL THEN
    RAISE EXCEPTION 'checkout authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO idempotency_row
  FROM private.checkout_idempotency
  WHERE owner_user_id = actor_user_id AND checkout_attempt_id = p_attempt_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'checkout attempt unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO attempt_row FROM private.checkout_attempts WHERE id = p_attempt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'checkout attempt unavailable' USING ERRCODE = '42501';
  END IF;
  IF attempt_row.departure_id IS NOT NULL THEN
    SELECT * INTO departure_row
    FROM public.departures WHERE id = attempt_row.departure_id FOR UPDATE;
  ELSE
    SELECT * INTO quote_row
    FROM public.custom_quotes WHERE id = attempt_row.quote_id FOR UPDATE;
  END IF;
  SELECT * INTO booking_row
  FROM public.bookings WHERE id = attempt_row.booking_id FOR UPDATE;
  IF NOT FOUND OR booking_row.owner_user_id IS DISTINCT FROM actor_user_id THEN
    RAISE EXCEPTION 'checkout attempt unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO hold_row
  FROM private.capacity_holds AS holds
  WHERE holds.booking_id = booking_row.id
    AND holds.status = 'active'::public.hold_status
  FOR UPDATE;
  has_hold := FOUND;
  SELECT * INTO attempt_row
  FROM private.checkout_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND
     OR attempt_row.booking_id IS DISTINCT FROM booking_row.id
     OR attempt_row.owner_user_id IS DISTINCT FROM actor_user_id THEN
    RAISE EXCEPTION 'checkout attempt unavailable' USING ERRCODE = '42501';
  END IF;

  -- The shared terminalization order checks any real payment before the
  -- simulated receipt. Either authority makes checkout compensation replay.
  SELECT payments.id INTO real_payment_id
  FROM public.payments AS payments
  WHERE payments.booking_id = booking_row.id;
  SELECT receipts.id INTO simulated_receipt_id
  FROM private.simulated_payment_receipts AS receipts
  WHERE receipts.booking_id = booking_row.id;
  IF real_payment_id IS NOT NULL OR simulated_receipt_id IS NOT NULL THEN
    booking_id := booking_row.id;
    booking_status := booking_row.status;
    quote_status := CASE WHEN quote_row.id IS NULL THEN NULL ELSE quote_row.status END;
    state := 'replayed';
    RETURN NEXT;
    RETURN;
  END IF;

  now_time := pg_catalog.clock_timestamp();
  IF attempt_row.status <> 'created' OR attempt_row.provider_session_id IS NOT NULL THEN
    booking_id := booking_row.id;
    booking_status := booking_row.status;
    quote_status := CASE WHEN quote_row.id IS NULL THEN NULL ELSE quote_row.status END;
    state := 'replayed';
    RETURN NEXT;
    RETURN;
  END IF;
  PERFORM pg_catalog.set_config('localens.checkout_transition', 'on', true);
  IF attempt_row.quote_id IS NOT NULL THEN
    PERFORM pg_catalog.set_config('localens.quote_transition', 'on', true);
  END IF;
  IF has_hold THEN
    UPDATE private.capacity_holds
    SET status = CASE
          WHEN expires_at <= now_time THEN 'expired'::public.hold_status
          ELSE 'released'::public.hold_status
        END,
        released_at = now_time
    WHERE id = hold_row.id;
  END IF;
  UPDATE public.bookings
  SET status = CASE
        WHEN has_hold AND hold_row.expires_at <= now_time THEN 'expired'::public.booking_status
        ELSE 'cancelled'::public.booking_status
      END
  WHERE id = booking_row.id;
  IF attempt_row.quote_id IS NOT NULL
     AND quote_row.status = 'checkout_pending'::public.quote_status THEN
    IF quote_row.valid_until > now_time THEN
      UPDATE public.custom_quotes SET status = 'active'::public.quote_status
      WHERE id = quote_row.id;
    ELSE
      UPDATE public.custom_quotes SET status = 'expired'::public.quote_status
      WHERE id = quote_row.id;
    END IF;
  END IF;
  UPDATE private.checkout_attempts
  SET status = 'compensated', updated_at = now_time
  WHERE id = attempt_row.id;
  PERFORM private.record_checkout_audit_event(
    'checkout_compensated'::public.audit_event_type,
    actor_user_id,
    'checkout_attempt'::public.audit_target_type,
    attempt_row.id,
    'created',
    'compensated',
    'source'::public.audit_metadata_key,
    'stripe',
    NULL,
    NULL
  );
  booking_id := booking_row.id;
  booking_status := CASE
    WHEN has_hold AND hold_row.expires_at <= now_time THEN 'expired'::public.booking_status
    ELSE 'cancelled'::public.booking_status
  END;
  quote_status := CASE WHEN quote_row.id IS NULL THEN NULL ELSE quote_row.status END;
  state := 'compensated';
  RETURN NEXT;
END;
$function$;
REVOKE ALL ON FUNCTION private.compensate_checkout_failure(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.compensate_checkout_failure(uuid)
  TO localens_checkout_rpc_owner;
RESET ROLE;
SET LOCAL ROLE postgres;
REVOKE CREATE ON SCHEMA private FROM localens_checkout_rpc_owner;

COMMIT;
