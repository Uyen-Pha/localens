BEGIN;

-- Priority 1 only: align booking cancellation authority with the Word
-- specification.  This migration does not change quote expiry calculation;
-- it consumes the quote's already persisted valid_until as the payment
-- deadline for a personalized booking.

-- Existing rows are retained.  Only active checkout rows are normalized to
-- the new source-derived deadlines; terminal historical rows keep their
-- original policy snapshots while the exact 35-minute constraints are
-- removed.
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_hold_duration_seconds_check,
  DROP CONSTRAINT IF EXISTS bookings_hold_expires_at_check;
ALTER TABLE private.capacity_holds
  DROP CONSTRAINT IF EXISTS capacity_holds_expires_at_check;

UPDATE public.bookings
SET hold_duration_seconds = 900,
    hold_expires_at = created_at + interval '15 minutes'
WHERE source_kind = 'departure'
  AND status IN (
    'pending_payment'::public.booking_status,
    'payment_processing'::public.booking_status,
    'payment_review'::public.booking_status
  );

UPDATE public.bookings AS bookings
SET hold_expires_at = quotes.valid_until,
    hold_duration_seconds = GREATEST(
      1,
      pg_catalog.floor(pg_catalog.extract(epoch FROM quotes.valid_until - bookings.created_at))
    )::integer
FROM public.custom_quotes AS quotes
WHERE bookings.source_kind = 'quote'
  AND bookings.status IN (
    'pending_payment'::public.booking_status,
    'payment_processing'::public.booking_status,
    'payment_review'::public.booking_status
  )
  AND bookings.quote_id = quotes.id
  AND quotes.valid_until > bookings.created_at;

UPDATE private.capacity_holds AS holds
SET expires_at = bookings.created_at + interval '15 minutes'
FROM public.bookings AS bookings
WHERE holds.booking_id = bookings.id
  AND bookings.source_kind = 'departure'
  AND holds.status = 'active'::public.hold_status
  AND bookings.status IN (
    'pending_payment'::public.booking_status,
    'payment_processing'::public.booking_status,
    'payment_review'::public.booking_status
  );

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_hold_duration_seconds_positive_check
    CHECK (hold_duration_seconds > 0),
  ADD CONSTRAINT bookings_hold_expires_after_created_check
    CHECK (hold_expires_at > created_at);
ALTER TABLE private.capacity_holds
  ADD CONSTRAINT capacity_holds_expires_after_created_check
    CHECK (expires_at > created_at);

CREATE OR REPLACE FUNCTION private.normalize_booking_payment_deadline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  quote_deadline timestamptz;
BEGIN
  IF NEW.source_kind = 'departure' THEN
    NEW.hold_duration_seconds := 900;
    NEW.hold_expires_at := NEW.created_at + interval '15 minutes';
  ELSIF NEW.source_kind = 'quote' THEN
    SELECT quotes.valid_until
    INTO quote_deadline
    FROM public.custom_quotes AS quotes
    WHERE quotes.id = NEW.quote_id;
    IF quote_deadline IS NULL OR quote_deadline <= NEW.created_at THEN
      RAISE EXCEPTION 'quote payment deadline unavailable' USING ERRCODE = 'P0001';
    END IF;
    NEW.hold_expires_at := quote_deadline;
    NEW.hold_duration_seconds := GREATEST(
      1,
      pg_catalog.floor(pg_catalog.extract(epoch FROM quote_deadline - NEW.created_at))
    )::integer;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.normalize_booking_payment_deadline()
  OWNER TO localens_checkout_rpc_owner;
REVOKE ALL ON FUNCTION private.normalize_booking_payment_deadline()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS booking_payment_deadline_normalizer ON public.bookings;
CREATE TRIGGER booking_payment_deadline_normalizer
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION private.normalize_booking_payment_deadline();

CREATE OR REPLACE FUNCTION private.normalize_capacity_hold_deadline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  booking_source text;
  booking_departure_id uuid;
  booking_deadline timestamptz;
BEGIN
  SELECT bookings.source_kind, bookings.departure_id, bookings.hold_expires_at
  INTO booking_source, booking_departure_id, booking_deadline
  FROM public.bookings AS bookings
  WHERE bookings.id = NEW.booking_id;
  IF booking_source IS DISTINCT FROM 'departure'
     OR booking_departure_id IS DISTINCT FROM NEW.departure_id
     OR booking_deadline IS NULL THEN
    RAISE EXCEPTION 'capacity hold booking mismatch' USING ERRCODE = 'P0001';
  END IF;
  NEW.expires_at := booking_deadline;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.normalize_capacity_hold_deadline()
  OWNER TO localens_checkout_rpc_owner;
REVOKE ALL ON FUNCTION private.normalize_capacity_hold_deadline()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS capacity_hold_deadline_normalizer ON private.capacity_holds;
CREATE TRIGGER capacity_hold_deadline_normalizer
  BEFORE INSERT ON private.capacity_holds
  FOR EACH ROW EXECUTE FUNCTION private.normalize_capacity_hold_deadline();

-- The checkout function is kept on the existing runtime and only changes the
-- source-derived deadline: fixed departures get 15 minutes, while a quote
-- booking inherits custom_quotes.valid_until.  The returned value is read
-- from the inserted booking so the browser cannot receive a stale deadline
-- from an older checkout implementation.
CREATE OR REPLACE FUNCTION private.start_checkout_tx(
  p_source_kind text,
  p_source_id uuid,
  p_party_size integer,
  p_locale public.locale,
  p_idempotency_key text,
  p_canonical_request_hash text
)
RETURNS TABLE (
  booking_id uuid,
  attempt_id uuid,
  provider_idempotency_key text,
  amount_minor text,
  currency public.checkout_currency,
  hold_expires_at timestamptz,
  state text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  actor_user_id uuid := NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid;
  idempotency_id uuid := gen_random_uuid();
  new_booking_id uuid := gen_random_uuid();
  new_attempt_id uuid := gen_random_uuid();
  idempotency_row private.checkout_idempotency%ROWTYPE;
  booking_row public.bookings%ROWTYPE;
  retry_attempt_row private.checkout_attempts%ROWTYPE;
  departure_row public.departures%ROWTYPE;
  quote_row public.custom_quotes%ROWTYPE;
  request_row public.custom_requests%ROWTYPE;
  plan_row public.trip_plans%ROWTYPE;
  revision_row public.trip_plan_revisions%ROWTYPE;
  tour_version_row public.tour_versions%ROWTYPE;
  tour_row public.tours%ROWTYPE;
  tour_translation_row public.tour_version_translations%ROWTYPE;
  travel_snapshot_row public.travel_snapshots%ROWTYPE;
  confirmed_party integer;
  held_party integer;
  derived_party_size integer;
  created_time timestamptz;
  hold_end timestamptz;
  hold_duration integer;
  amount_value bigint;
  vnd_total bigint;
  canonical_hash text;
  inserted boolean;
  source_title_en text;
  source_title_vi text;
  source_meeting_point text;
  source_policy text;
  source_catalog_id uuid;
  source_travel_id uuid;
  source_tour_version_id uuid;
  source_quote_id uuid;
  source_departure_id uuid;
  source_fx_id uuid;
  source_fx numeric(20,8);
  checkout_currency_value public.checkout_currency;
BEGIN
  IF actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM private.user_roles WHERE user_id = actor_user_id AND role = 'customer'::public.app_role
  ) THEN
    RAISE EXCEPTION 'checkout authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_source_kind NOT IN ('departure', 'quote') OR p_source_id IS NULL OR p_party_size NOT BETWEEN 1 AND 100
     OR p_locale IS NULL OR p_idempotency_key IS NULL OR p_idempotency_key <> btrim(p_idempotency_key)
     OR length(p_idempotency_key) NOT BETWEEN 1 AND 255 OR p_idempotency_key ~ '[[:cntrl:]]'
     OR p_canonical_request_hash IS NULL OR p_canonical_request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'checkout input rejected' USING ERRCODE = '22023';
  END IF;

  canonical_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    private.checkout_canonical_payload(actor_user_id, p_source_kind, p_source_id, p_party_size, p_locale), 'UTF8'
  ), 'sha256'), 'hex');
  IF NOT private.checkout_hash_equal(canonical_hash, p_canonical_request_hash) THEN
    RAISE EXCEPTION 'checkout request hash mismatch' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO private.checkout_idempotency (
    id, owner_user_id, idempotency_key, canonical_request_hash,
    booking_id, checkout_attempt_id, provider_idempotency_key
  ) VALUES (
    idempotency_id, actor_user_id, p_idempotency_key, p_canonical_request_hash,
    new_booking_id, new_attempt_id, 'localens:stripe-checkout:v1:' || new_attempt_id::text
  ) ON CONFLICT (owner_user_id, idempotency_key) DO NOTHING;
  inserted := FOUND;
  SELECT * INTO idempotency_row
  FROM private.checkout_idempotency
  WHERE owner_user_id = actor_user_id AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'checkout idempotency unavailable' USING ERRCODE = 'P0001'; END IF;
  IF NOT private.checkout_hash_equal(idempotency_row.canonical_request_hash, p_canonical_request_hash) THEN
    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF NOT inserted THEN
    IF p_source_kind = 'departure' THEN
      SELECT * INTO departure_row FROM public.departures WHERE id = p_source_id FOR UPDATE;
    ELSE
      SELECT * INTO quote_row FROM public.custom_quotes WHERE id = p_source_id FOR UPDATE;
    END IF;
    SELECT * INTO booking_row FROM public.bookings WHERE id = idempotency_row.booking_id FOR UPDATE;
    SELECT * INTO retry_attempt_row FROM private.checkout_attempts WHERE id = idempotency_row.checkout_attempt_id FOR UPDATE;
    IF NOT FOUND OR booking_row.owner_user_id IS DISTINCT FROM actor_user_id
       OR booking_row.source_kind IS DISTINCT FROM p_source_kind
       OR booking_row.source_id IS DISTINCT FROM p_source_id
       OR booking_row.party_size IS DISTINCT FROM p_party_size
       OR booking_row.language IS DISTINCT FROM p_locale
       OR retry_attempt_row.booking_id IS DISTINCT FROM booking_row.id
       OR retry_attempt_row.owner_user_id IS DISTINCT FROM actor_user_id
       OR retry_attempt_row.source_kind IS DISTINCT FROM p_source_kind
       OR (p_source_kind = 'departure' AND retry_attempt_row.departure_id IS DISTINCT FROM p_source_id)
       OR (p_source_kind = 'quote' AND retry_attempt_row.quote_id IS DISTINCT FROM p_source_id)
       OR retry_attempt_row.provider_idempotency_key IS DISTINCT FROM idempotency_row.provider_idempotency_key THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    canonical_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      private.checkout_canonical_payload(
        booking_row.owner_user_id, booking_row.source_kind, booking_row.source_id,
        booking_row.party_size, booking_row.language
      ), 'UTF8'
    ), 'sha256'), 'hex');
    IF NOT private.checkout_hash_equal(canonical_hash, idempotency_row.canonical_request_hash)
       OR NOT private.checkout_hash_equal(canonical_hash, p_canonical_request_hash) THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    booking_id := booking_row.id;
    attempt_id := idempotency_row.checkout_attempt_id;
    provider_idempotency_key := idempotency_row.provider_idempotency_key;
    amount_minor := booking_row.checkout_amount_minor::text;
    currency := booking_row.checkout_currency;
    hold_expires_at := booking_row.hold_expires_at;
    state := 'resumed';
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_source_kind = 'departure' THEN
    SELECT * INTO departure_row FROM public.departures WHERE id = p_source_id FOR UPDATE;
    IF NOT FOUND OR departure_row.status <> 'scheduled'::public.departure_status THEN
      RAISE EXCEPTION 'departure unavailable' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO tour_version_row FROM public.tour_versions WHERE id = departure_row.tour_version_id FOR SHARE;
    IF NOT FOUND OR tour_version_row.status <> 'published'::public.tour_version_status THEN
      RAISE EXCEPTION 'tour unavailable' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO tour_row FROM public.tours WHERE id = tour_version_row.tour_id FOR SHARE;
    IF NOT FOUND OR tour_row.status <> 'published'::public.tour_status THEN
      RAISE EXCEPTION 'tour unavailable' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO tour_translation_row
    FROM public.tour_version_translations
    WHERE tour_version_id = tour_version_row.id AND locale = p_locale;
    IF NOT FOUND THEN RAISE EXCEPTION 'tour translation unavailable' USING ERRCODE = 'P0001'; END IF;
    SELECT * INTO travel_snapshot_row
    FROM public.travel_snapshots
    WHERE catalog_snapshot_id = tour_version_row.catalog_snapshot_id AND status = 'published'::public.snapshot_status
    ORDER BY published_at DESC NULLS LAST, id DESC LIMIT 1 FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'travel snapshot unavailable' USING ERRCODE = 'P0001'; END IF;
    created_time := pg_catalog.clock_timestamp();
    IF departure_row.start_at <= created_time THEN
      RAISE EXCEPTION 'departure unavailable' USING ERRCODE = 'P0001';
    END IF;
    SELECT COALESCE(sum(b.party_size), 0)::integer INTO confirmed_party
    FROM public.bookings AS b
    WHERE b.departure_id = departure_row.id AND b.status IN ('confirmed'::public.booking_status, 'completed'::public.booking_status);
    SELECT COALESCE(sum(h.party_size), 0)::integer INTO held_party
    FROM private.capacity_holds AS h
    JOIN public.bookings AS hb ON hb.id = h.booking_id
    WHERE h.departure_id = departure_row.id AND h.status = 'active'::public.hold_status AND h.expires_at > created_time
      AND hb.status NOT IN ('confirmed'::public.booking_status, 'completed'::public.booking_status);
    IF confirmed_party + held_party + p_party_size > departure_row.capacity THEN
      RAISE EXCEPTION 'departure sold out' USING ERRCODE = 'P0001';
    END IF;
    IF tour_version_row.price_vnd_per_person::numeric * p_party_size > 9007199254740991 THEN
      RAISE EXCEPTION 'checkout amount unsafe' USING ERRCODE = '22003';
    END IF;
    source_title_en := (SELECT title FROM public.tour_version_translations WHERE tour_version_id = tour_version_row.id AND locale = 'en'::public.locale);
    source_title_vi := (SELECT title FROM public.tour_version_translations WHERE tour_version_id = tour_version_row.id AND locale = 'vi'::public.locale);
    source_meeting_point := tour_translation_row.meeting_point;
    source_policy := tour_version_row.cancellation_policy;
    source_catalog_id := tour_version_row.catalog_snapshot_id;
    source_travel_id := travel_snapshot_row.id;
    source_tour_version_id := tour_version_row.id;
    source_departure_id := departure_row.id;
    source_quote_id := NULL;
    source_fx_id := NULL;
    source_fx := NULL;
    checkout_currency_value := 'vnd'::public.checkout_currency;
    derived_party_size := p_party_size;
    vnd_total := tour_version_row.price_vnd_per_person * p_party_size;
    amount_value := vnd_total;
  ELSE
    SELECT * INTO quote_row FROM public.custom_quotes WHERE id = p_source_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'quote unavailable' USING ERRCODE = 'P0001'; END IF;
    SELECT * INTO request_row FROM public.custom_requests WHERE id = quote_row.request_id FOR SHARE;
    IF NOT FOUND OR request_row.owner_user_id IS DISTINCT FROM actor_user_id THEN RAISE EXCEPTION 'quote unavailable' USING ERRCODE = '42501'; END IF;
    SELECT * INTO plan_row FROM public.trip_plans WHERE id = request_row.plan_id FOR SHARE;
    SELECT * INTO revision_row FROM public.trip_plan_revisions WHERE id = request_row.revision_id FOR SHARE;
    IF NOT FOUND OR plan_row.id IS NULL OR revision_row.plan_id IS DISTINCT FROM plan_row.id
       OR jsonb_typeof(revision_row.request_json->'partySize') IS DISTINCT FROM 'number'
       OR revision_row.request_json->>'partySize' !~ '^[1-9][0-9]{0,2}$' THEN
      RAISE EXCEPTION 'quote party size unavailable' USING ERRCODE = 'P0001';
    END IF;
    created_time := pg_catalog.clock_timestamp();
    derived_party_size := (revision_row.request_json->>'partySize')::integer;
    IF derived_party_size NOT BETWEEN 1 AND 100 OR p_party_size <> derived_party_size THEN
      RAISE EXCEPTION 'quote party size mismatch' USING ERRCODE = 'P0001';
    END IF;
    IF quote_row.status <> 'active'::public.quote_status OR quote_row.valid_until <= created_time THEN
      RAISE EXCEPTION 'quote expired' USING ERRCODE = 'P0001';
    END IF;
    source_title_en := quote_row.title_en;
    source_title_vi := quote_row.title_vi;
    source_meeting_point := 'To be confirmed by LocalLens';
    source_policy := quote_row.policy;
    source_catalog_id := quote_row.catalog_snapshot_id;
    source_travel_id := quote_row.travel_snapshot_id;
    source_tour_version_id := NULL;
    source_departure_id := NULL;
    source_quote_id := quote_row.id;
    source_fx_id := quote_row.fx_snapshot_id;
    source_fx := quote_row.fx_vnd_per_usd;
    checkout_currency_value := quote_row.checkout_currency;
    vnd_total := quote_row.amount_vnd_minor;
    amount_value := quote_row.checkout_amount_minor;
    hold_end := quote_row.valid_until;
  END IF;

  canonical_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    private.checkout_canonical_payload(actor_user_id, p_source_kind, p_source_id, derived_party_size, p_locale), 'UTF8'
  ), 'sha256'), 'hex');
  IF NOT private.checkout_hash_equal(canonical_hash, p_canonical_request_hash) THEN
    RAISE EXCEPTION 'checkout request hash mismatch' USING ERRCODE = 'P0001';
  END IF;
  IF p_source_kind = 'departure' THEN
    hold_end := created_time + interval '15 minutes';
  END IF;
  hold_duration := GREATEST(
    1,
    pg_catalog.floor(pg_catalog.extract(epoch FROM hold_end - created_time))
  )::integer;

  INSERT INTO public.bookings (
    id, owner_user_id, source_kind, source_id, departure_id, quote_id, status, tour_version_id,
    title_en, title_vi, cancellation_policy, catalog_snapshot_id, travel_snapshot_id,
    fx_snapshot_id, fx_vnd_per_usd, per_person_vnd_minor, total_vnd_minor,
    checkout_currency, checkout_amount_minor, party_size, language, meeting_point,
    hold_duration_seconds, hold_expires_at, created_at
  ) VALUES (
    new_booking_id, actor_user_id, p_source_kind, p_source_id, source_departure_id, source_quote_id,
    'pending_payment'::public.booking_status, source_tour_version_id, source_title_en, source_title_vi,
    source_policy, source_catalog_id, source_travel_id, source_fx_id, source_fx,
    CASE WHEN p_source_kind = 'departure' THEN tour_version_row.price_vnd_per_person ELSE NULL END,
    vnd_total, checkout_currency_value, amount_value, derived_party_size, p_locale,
    source_meeting_point, hold_duration, hold_end, created_time
  ) RETURNING * INTO booking_row;

  IF p_source_kind = 'quote' THEN
    PERFORM pg_catalog.set_config('localens.checkout_transition', 'on', true);
    PERFORM pg_catalog.set_config('localens.quote_transition', 'on', true);
    UPDATE public.custom_quotes SET status = 'checkout_pending'::public.quote_status WHERE id = quote_row.id;
  END IF;
  INSERT INTO private.checkout_attempts (
    id, booking_id, owner_user_id, source_kind, departure_id, quote_id, provider_idempotency_key, created_at, updated_at
  ) VALUES (
    new_attempt_id, new_booking_id, actor_user_id, p_source_kind, source_departure_id, source_quote_id,
    'localens:stripe-checkout:v1:' || new_attempt_id::text, created_time, created_time
  );
  INSERT INTO private.capacity_holds (booking_id, departure_id, party_size, status, expires_at, created_at)
  SELECT new_booking_id, departure_row.id, derived_party_size, 'active'::public.hold_status, hold_end, created_time
  WHERE p_source_kind = 'departure';

  PERFORM private.record_checkout_audit_event(
    CASE WHEN p_source_kind = 'quote' THEN 'quote_checkout_started'::public.audit_event_type ELSE 'checkout_started'::public.audit_event_type END,
    actor_user_id, CASE WHEN p_source_kind = 'quote' THEN 'custom_quote'::public.audit_target_type ELSE 'checkout_attempt'::public.audit_target_type END,
    CASE WHEN p_source_kind = 'quote' THEN source_quote_id ELSE new_attempt_id END,
    CASE WHEN p_source_kind = 'quote' THEN 'active' ELSE NULL END,
    CASE WHEN p_source_kind = 'quote' THEN 'checkout_pending' ELSE 'created' END,
    'currency'::public.audit_metadata_key, booking_row.checkout_currency::text, NULL, NULL
  );
  booking_id := new_booking_id;
  attempt_id := new_attempt_id;
  provider_idempotency_key := 'localens:stripe-checkout:v1:' || new_attempt_id::text;
  amount_minor := amount_value::text;
  currency := booking_row.checkout_currency;
  hold_expires_at := booking_row.hold_expires_at;
  state := 'created';
  RETURN NEXT;
END;
$function$;
ALTER FUNCTION private.start_checkout_tx(text, uuid, integer, public.locale, text, text)
  OWNER TO localens_checkout_rpc_owner;
REVOKE ALL ON FUNCTION private.start_checkout_tx(text, uuid, integer, public.locale, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.start_checkout_tx(text, uuid, integer, public.locale, text, text)
  TO localens_checkout_rpc_owner;

-- The projection owner may read only the immutable source facts needed to
-- render cancellation eligibility.  The view still filters bookings by the
-- authenticated customer subject; these policies do not grant browser roles
-- direct base-table access.
GRANT USAGE ON SCHEMA private TO localens_booking_projection_owner;
CREATE POLICY departures_booking_projection_select
  ON public.departures FOR SELECT TO localens_booking_projection_owner
  USING (true);
CREATE POLICY custom_quotes_booking_projection_select
  ON public.custom_quotes FOR SELECT TO localens_booking_projection_owner
  USING (true);
CREATE POLICY custom_requests_booking_projection_select
  ON public.custom_requests FOR SELECT TO localens_booking_projection_owner
  USING (true);
CREATE POLICY trip_plan_revisions_booking_projection_select
  ON public.trip_plan_revisions FOR SELECT TO localens_booking_projection_owner
  USING (true);
CREATE POLICY trip_plan_items_booking_projection_select
  ON public.trip_plan_items FOR SELECT TO localens_booking_projection_owner
  USING (true);
CREATE POLICY payments_booking_projection_select
  ON public.payments FOR SELECT TO localens_booking_projection_owner
  USING (true);
CREATE POLICY simulated_receipts_booking_projection_select
  ON private.simulated_payment_receipts FOR SELECT TO localens_booking_projection_owner
  USING (true);
GRANT SELECT (id, start_at) ON public.departures TO localens_booking_projection_owner;
GRANT SELECT (id, valid_until) ON public.custom_quotes TO localens_booking_projection_owner;
GRANT SELECT (id, revision_id) ON public.custom_requests TO localens_booking_projection_owner;
GRANT SELECT (id) ON public.trip_plan_revisions TO localens_booking_projection_owner;
GRANT SELECT (revision_id, start_at) ON public.trip_plan_items TO localens_booking_projection_owner;
GRANT SELECT (booking_id, status) ON public.payments TO localens_booking_projection_owner;
GRANT SELECT (booking_id, result_payment_status)
  ON private.simulated_payment_receipts TO localens_booking_projection_owner;

-- Cancellation authority reads the approved personalized itinerary start
-- from its first normalized itinerary item.  No planner or admin mutation is
-- introduced here.
CREATE POLICY custom_requests_cancellation_customer_select
  ON public.custom_requests FOR SELECT TO localens_cancellation_customer_rpc_owner
  USING (current_user = 'localens_cancellation_customer_rpc_owner');
CREATE POLICY trip_plan_revisions_cancellation_customer_select
  ON public.trip_plan_revisions FOR SELECT TO localens_cancellation_customer_rpc_owner
  USING (current_user = 'localens_cancellation_customer_rpc_owner');
CREATE POLICY trip_plan_items_cancellation_customer_select
  ON public.trip_plan_items FOR SELECT TO localens_cancellation_customer_rpc_owner
  USING (current_user = 'localens_cancellation_customer_rpc_owner');
GRANT SELECT ON public.custom_requests, public.trip_plan_revisions, public.trip_plan_items
  TO localens_cancellation_customer_rpc_owner;

CREATE OR REPLACE VIEW public.customer_bookings_v
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  bookings.id,
  bookings.status,
  bookings.source_kind,
  bookings.source_id,
  bookings.tour_version_id,
  bookings.quote_id,
  bookings.title_en,
  bookings.title_vi,
  bookings.cancellation_policy,
  bookings.catalog_snapshot_id,
  bookings.travel_snapshot_id,
  bookings.fx_snapshot_id,
  bookings.fx_vnd_per_usd,
  bookings.per_person_vnd_minor::text AS per_person_vnd_minor,
  bookings.total_vnd_minor::text AS total_vnd_minor,
  bookings.checkout_currency,
  bookings.checkout_amount_minor::text AS checkout_amount_minor,
  bookings.party_size,
  bookings.language,
  bookings.meeting_point,
  COALESCE(payments.status, receipts.result_payment_status) AS payment_status,
  CASE
    WHEN bookings.source_kind = 'departure' THEN bookings.hold_expires_at
    ELSE quotes.valid_until
  END AS payment_deadline_at,
  CASE
    WHEN bookings.source_kind = 'departure' THEN departures.start_at
    ELSE itinerary.start_at
  END AS trip_start_at,
  bookings.hold_expires_at,
  bookings.created_at
FROM public.bookings AS bookings
LEFT JOIN public.departures AS departures
  ON departures.id = bookings.departure_id
LEFT JOIN public.custom_quotes AS quotes
  ON quotes.id = bookings.quote_id
LEFT JOIN public.custom_requests AS requests
  ON requests.id = quotes.request_id
LEFT JOIN LATERAL (
  SELECT pg_catalog.min(items.start_at) AS start_at
  FROM public.trip_plan_items AS items
  WHERE items.revision_id = requests.revision_id
) AS itinerary ON true
LEFT JOIN public.payments AS payments
  ON payments.booking_id = bookings.id
LEFT JOIN private.simulated_payment_receipts AS receipts
  ON receipts.booking_id = bookings.id;
ALTER VIEW public.customer_bookings_v OWNER TO localens_booking_projection_owner;
REVOKE ALL ON public.customer_bookings_v FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.customer_bookings_v TO authenticated;

-- The existing manual cancellation request/decision functions remain an
-- unreachable immutable archive: this runtime continues to expose only the
-- direct cancel_booking RPC below.

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
  departure_row public.departures%ROWTYPE;
  request_row public.custom_requests%ROWTYPE;
  revision_row public.trip_plan_revisions%ROWTYPE;
  payment_row public.payments%ROWTYPE;
  cancellation_row private.booking_cancellations%ROWTYPE;
  payment_status_value public.payment_status;
  simulated_payment_status_value public.payment_status;
  payment_id uuid;
  simulated_receipt_id uuid;
  source_found boolean := false;
  trip_start_at timestamptz;
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

  -- Keep the established idempotency/ownership lock order.  Every
  -- eligibility fact is read after the booking route is locked.
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
    SELECT * INTO departure_row
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

  SELECT * INTO payment_row
  FROM public.payments AS payments
  WHERE payments.booking_id = booking_row.id;
  payment_id := payment_row.id;
  payment_status_value := payment_row.status;
  SELECT receipts.id, receipts.result_payment_status
  INTO simulated_receipt_id, simulated_payment_status_value
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
  IF booking_row.status = 'pending_payment'::public.booking_status THEN
    -- Pending fixed bookings use the active 15-minute hold.  Pending
    -- personalized bookings use the quote deadline inherited into the
    -- booking, and also re-check the source quote deadline.
    IF attempt_row.status <> 'created'
       OR attempt_row.provider_session_id IS NOT NULL
       OR payment_row.status IN (
         'pending'::public.payment_status,
         'review'::public.payment_status,
         'paid'::public.payment_status
       )
       OR simulated_receipt_id IS NOT NULL THEN
      RAISE EXCEPTION 'cancellation unavailable' USING ERRCODE = 'P0001';
    END IF;
    IF booking_row.source_kind = 'departure' THEN
      IF hold_row.id IS NULL
         OR hold_row.status <> 'active'::public.hold_status
         OR hold_row.expires_at <= authority_time
         OR booking_row.hold_expires_at <= authority_time THEN
        RAISE EXCEPTION 'cancellation unavailable' USING ERRCODE = 'P0001';
      END IF;
    ELSIF quote_row.id IS NULL
       OR quote_row.status <> 'checkout_pending'::public.quote_status
       OR quote_row.valid_until <= authority_time
       OR booking_row.hold_expires_at <= authority_time THEN
      RAISE EXCEPTION 'cancellation unavailable' USING ERRCODE = 'P0001';
    END IF;
  ELSIF booking_row.status = 'confirmed'::public.booking_status THEN
    -- A confirmed booking is cancellable only after payment is authoritative
    -- and at least 48 hours remain before the actual trip start.
    IF payment_status_value IS DISTINCT FROM 'paid'::public.payment_status
       AND simulated_payment_status_value IS DISTINCT FROM 'paid'::public.payment_status THEN
      RAISE EXCEPTION 'cancellation unavailable' USING ERRCODE = 'P0001';
    END IF;
    IF booking_row.source_kind = 'departure' THEN
      IF departure_row.start_at IS NULL
         OR departure_row.start_at < authority_time + interval '48 hours' THEN
        RAISE EXCEPTION 'cancellation unavailable' USING ERRCODE = 'P0001';
      END IF;
    ELSE
      SELECT * INTO request_row
      FROM public.custom_requests AS requests
      WHERE requests.id = quote_row.request_id;
      SELECT * INTO revision_row
      FROM public.trip_plan_revisions AS revisions
      WHERE revisions.id = request_row.revision_id;
      IF request_row.id IS NULL OR revision_row.id IS NULL THEN
        RAISE EXCEPTION 'cancellation unavailable' USING ERRCODE = 'P0001';
      END IF;
      SELECT pg_catalog.min(items.start_at)
      INTO trip_start_at
      FROM public.trip_plan_items AS items
      WHERE items.revision_id = revision_row.id;
      IF trip_start_at IS NULL OR trip_start_at < authority_time + interval '48 hours' THEN
        RAISE EXCEPTION 'cancellation unavailable' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'cancellation unavailable' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_catalog.set_config('localens.checkout_transition', 'on', true);
  IF booking_row.source_kind = 'quote' AND booking_row.status = 'pending_payment'::public.booking_status THEN
    PERFORM pg_catalog.set_config('localens.quote_transition', 'on', true);
  END IF;

  UPDATE public.bookings
  SET status = 'cancelled'::public.booking_status
  WHERE id = booking_row.id;

  IF booking_row.status = 'pending_payment'::public.booking_status
     AND booking_row.source_kind = 'departure' THEN
    -- The booking transition removes the reserved capacity.  This update is
    -- deliberately guarded so an active hold is released exactly once.
    UPDATE private.capacity_holds
    SET status = 'released'::public.hold_status,
        released_at = authority_time
    WHERE id = hold_row.id
      AND status = 'active'::public.hold_status;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'cancellation unavailable' USING ERRCODE = 'P0001';
    END IF;
  ELSIF booking_row.status = 'pending_payment'::public.booking_status
        AND booking_row.source_kind = 'quote' THEN
    UPDATE public.custom_quotes
    SET status = 'revoked'::public.quote_status
    WHERE id = quote_row.id;
  END IF;

  IF booking_row.status = 'pending_payment'::public.booking_status THEN
    UPDATE private.checkout_attempts
    SET status = 'compensated', updated_at = authority_time
    WHERE id = attempt_row.id;
  END IF;

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
ALTER FUNCTION public.cancel_booking(uuid, text, text, text)
  OWNER TO localens_cancellation_customer_rpc_owner;
REVOKE ALL ON FUNCTION public.cancel_booking(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid, text, text, text)
  TO authenticated;

COMMIT;
