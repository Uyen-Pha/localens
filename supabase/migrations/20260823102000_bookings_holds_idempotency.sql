BEGIN;

-- Task 9 uses a dedicated non-login, non-bypass owner.  The owner is granted
-- only the rows needed by the checkout transaction; browser roles never call
-- these tables or functions directly.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_checkout_rpc_owner') THEN
    CREATE ROLE localens_checkout_rpc_owner NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_availability_rpc_owner') THEN
    CREATE ROLE localens_availability_rpc_owner NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_booking_projection_owner') THEN
    CREATE ROLE localens_booking_projection_owner NOLOGIN NOBYPASSRLS;
  END IF;
END
$roles$;

ALTER ROLE localens_checkout_rpc_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS;
ALTER ROLE localens_availability_rpc_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS;
ALTER ROLE localens_booking_projection_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS;

REVOKE ALL ON SCHEMA public, private, auth FROM localens_checkout_rpc_owner, localens_availability_rpc_owner, localens_booking_projection_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA public, private, auth FROM localens_checkout_rpc_owner, localens_availability_rpc_owner, localens_booking_projection_owner;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public, private FROM localens_checkout_rpc_owner, localens_availability_rpc_owner, localens_booking_projection_owner;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public, private, auth FROM localens_checkout_rpc_owner, localens_availability_rpc_owner, localens_booking_projection_owner;

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  source_kind text NOT NULL CHECK (source_kind IN ('departure', 'quote')),
  source_id uuid NOT NULL,
  departure_id uuid REFERENCES public.departures(id) ON DELETE RESTRICT,
  quote_id uuid REFERENCES public.custom_quotes(id) ON DELETE RESTRICT,
  status public.booking_status NOT NULL DEFAULT 'pending_payment',
  tour_version_id uuid REFERENCES public.tour_versions(id) ON DELETE RESTRICT,
  title_en text NOT NULL CHECK (title_en = btrim(title_en) AND length(title_en) BETWEEN 1 AND 240 AND title_en !~ '[[:cntrl:]]'),
  title_vi text NOT NULL CHECK (title_vi = btrim(title_vi) AND length(title_vi) BETWEEN 1 AND 240 AND title_vi !~ '[[:cntrl:]]'),
  cancellation_policy text NOT NULL CHECK (cancellation_policy = btrim(cancellation_policy) AND length(cancellation_policy) BETWEEN 1 AND 4000 AND cancellation_policy !~ '[[:cntrl:]]'),
  catalog_snapshot_id uuid NOT NULL REFERENCES public.catalog_snapshots(id) ON DELETE RESTRICT,
  travel_snapshot_id uuid NOT NULL REFERENCES public.travel_snapshots(id) ON DELETE RESTRICT,
  fx_snapshot_id uuid REFERENCES public.fx_snapshots(id) ON DELETE RESTRICT,
  fx_vnd_per_usd numeric(20,8),
  per_person_vnd_minor bigint,
  total_vnd_minor bigint NOT NULL CHECK (total_vnd_minor BETWEEN 0 AND 9007199254740991),
  checkout_currency public.checkout_currency NOT NULL,
  checkout_amount_minor bigint NOT NULL CHECK (checkout_amount_minor BETWEEN 1 AND 9007199254740991),
  party_size integer NOT NULL CHECK (party_size BETWEEN 1 AND 100),
  language public.locale NOT NULL,
  meeting_point text NOT NULL CHECK (meeting_point = btrim(meeting_point) AND length(meeting_point) BETWEEN 1 AND 500 AND meeting_point !~ '[[:cntrl:]]'),
  hold_duration_seconds integer NOT NULL DEFAULT 2100 CHECK (hold_duration_seconds = 2100),
  hold_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CHECK ((departure_id IS NOT NULL) <> (quote_id IS NOT NULL)),
  CHECK (
    (source_kind = 'departure' AND departure_id = source_id AND quote_id IS NULL AND tour_version_id IS NOT NULL)
    OR
    (source_kind = 'quote' AND quote_id = source_id AND departure_id IS NULL AND tour_version_id IS NULL AND per_person_vnd_minor IS NULL)
  ),
  CHECK (hold_expires_at = created_at + interval '35 minutes'),
  CHECK (per_person_vnd_minor IS NULL OR per_person_vnd_minor BETWEEN 0 AND 9007199254740991),
  CHECK (fx_vnd_per_usd IS NULL OR fx_vnd_per_usd > 0),
  CHECK (
    (checkout_currency = 'vnd'::public.checkout_currency AND fx_snapshot_id IS NULL AND fx_vnd_per_usd IS NULL)
    OR
    (checkout_currency = 'usd'::public.checkout_currency AND fx_snapshot_id IS NOT NULL AND fx_vnd_per_usd IS NOT NULL)
  ),
  CHECK ((source_kind = 'departure' AND per_person_vnd_minor IS NOT NULL) OR (source_kind = 'quote' AND per_person_vnd_minor IS NULL)),
  UNIQUE (id, quote_id),
  UNIQUE (id, departure_id)
);

CREATE TABLE private.checkout_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  source_kind text NOT NULL CHECK (source_kind IN ('departure', 'quote')),
  departure_id uuid REFERENCES public.departures(id) ON DELETE RESTRICT,
  quote_id uuid REFERENCES public.custom_quotes(id) ON DELETE RESTRICT,
  provider_idempotency_key text NOT NULL UNIQUE CHECK (provider_idempotency_key = 'localens:stripe-checkout:v1:' || id::text),
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'session_recorded', 'compensated', 'failed')),
  provider_session_id text,
  provider_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CHECK ((source_kind = 'departure' AND departure_id IS NOT NULL AND quote_id IS NULL) OR (source_kind = 'quote' AND departure_id IS NULL AND quote_id IS NOT NULL)),
  CHECK ((provider_session_id IS NULL AND provider_expires_at IS NULL) OR (provider_session_id IS NOT NULL AND provider_expires_at IS NOT NULL)),
  UNIQUE (booking_id)
);

CREATE TABLE private.checkout_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (idempotency_key = btrim(idempotency_key) AND length(idempotency_key) BETWEEN 1 AND 255 AND idempotency_key !~ '[[:cntrl:]]'),
  canonical_request_hash text NOT NULL CHECK (canonical_request_hash ~ '^[0-9a-f]{64}$'),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  checkout_attempt_id uuid NOT NULL REFERENCES private.checkout_attempts(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  provider_idempotency_key text NOT NULL CHECK (provider_idempotency_key = 'localens:stripe-checkout:v1:' || checkout_attempt_id::text),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  UNIQUE (owner_user_id, idempotency_key),
  UNIQUE (checkout_attempt_id),
  UNIQUE (booking_id)
);

CREATE TABLE private.capacity_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  departure_id uuid NOT NULL REFERENCES public.departures(id) ON DELETE RESTRICT,
  party_size integer NOT NULL CHECK (party_size BETWEEN 1 AND 100),
  status public.hold_status NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  consumed_at timestamptz,
  released_at timestamptz,
  UNIQUE (booking_id),
  CHECK (expires_at = created_at + interval '35 minutes'),
  CHECK ((status = 'active'::public.hold_status AND consumed_at IS NULL AND released_at IS NULL)
    OR (status = 'consumed'::public.hold_status AND consumed_at IS NOT NULL AND released_at IS NULL)
    OR (status IN ('released'::public.hold_status, 'expired'::public.hold_status) AND released_at IS NOT NULL AND consumed_at IS NULL))
);

CREATE UNIQUE INDEX checkout_attempts_one_active_quote
  ON private.checkout_attempts (quote_id)
  WHERE quote_id IS NOT NULL AND status IN ('created', 'session_recorded');
CREATE UNIQUE INDEX capacity_holds_one_active_booking
  ON private.capacity_holds (booking_id)
  WHERE status = 'active'::public.hold_status;
CREATE INDEX capacity_holds_departure_status_expiry_idx
  ON private.capacity_holds (departure_id, status, expires_at);
CREATE INDEX bookings_departure_status_idx
  ON public.bookings (departure_id, status, created_at);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings FORCE ROW LEVEL SECURITY;
ALTER TABLE private.checkout_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.checkout_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE private.checkout_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.checkout_idempotency FORCE ROW LEVEL SECURITY;
ALTER TABLE private.capacity_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.capacity_holds FORCE ROW LEVEL SECURITY;

CREATE POLICY bookings_projection_owner_select ON public.bookings
  FOR SELECT TO localens_booking_projection_owner USING ((SELECT auth.uid()) = owner_user_id);
CREATE POLICY bookings_checkout_owner_all ON public.bookings
  FOR ALL TO localens_checkout_rpc_owner
  USING (current_user = 'localens_checkout_rpc_owner')
  WITH CHECK (current_user = 'localens_checkout_rpc_owner');
CREATE POLICY checkout_attempts_owner_all ON private.checkout_attempts
  FOR ALL TO localens_checkout_rpc_owner
  USING (current_user = 'localens_checkout_rpc_owner')
  WITH CHECK (current_user = 'localens_checkout_rpc_owner');
CREATE POLICY checkout_idempotency_owner_all ON private.checkout_idempotency
  FOR ALL TO localens_checkout_rpc_owner
  USING (current_user = 'localens_checkout_rpc_owner')
  WITH CHECK (current_user = 'localens_checkout_rpc_owner');
CREATE POLICY capacity_holds_owner_all ON private.capacity_holds
  FOR ALL TO localens_checkout_rpc_owner
  USING (current_user = 'localens_checkout_rpc_owner')
  WITH CHECK (current_user = 'localens_checkout_rpc_owner');
CREATE POLICY departures_availability_owner_select ON public.departures
  FOR SELECT TO localens_availability_rpc_owner
  USING (current_user = 'localens_availability_rpc_owner');
CREATE POLICY departures_checkout_owner_select ON public.departures
  FOR SELECT TO localens_checkout_rpc_owner
  USING (current_user = 'localens_checkout_rpc_owner');
CREATE POLICY tour_versions_checkout_owner_select ON public.tour_versions
  FOR SELECT TO localens_checkout_rpc_owner
  USING (current_user = 'localens_checkout_rpc_owner');
CREATE POLICY tour_version_translations_checkout_owner_select ON public.tour_version_translations
  FOR SELECT TO localens_checkout_rpc_owner
  USING (current_user = 'localens_checkout_rpc_owner');
CREATE POLICY tours_checkout_owner_select ON public.tours
  FOR SELECT TO localens_checkout_rpc_owner
  USING (current_user = 'localens_checkout_rpc_owner');
CREATE POLICY catalog_snapshots_checkout_owner_select ON public.catalog_snapshots
  FOR SELECT TO localens_checkout_rpc_owner
  USING (current_user = 'localens_checkout_rpc_owner');
CREATE POLICY travel_snapshots_checkout_owner_select ON public.travel_snapshots
  FOR SELECT TO localens_checkout_rpc_owner
  USING (current_user = 'localens_checkout_rpc_owner');
CREATE POLICY custom_quotes_checkout_owner_select ON public.custom_quotes
  FOR SELECT TO localens_checkout_rpc_owner
  USING (current_user = 'localens_checkout_rpc_owner');
CREATE POLICY custom_quotes_checkout_owner_update ON public.custom_quotes
  FOR UPDATE TO localens_checkout_rpc_owner
  USING (current_user = 'localens_checkout_rpc_owner')
  WITH CHECK (current_user = 'localens_checkout_rpc_owner');
CREATE POLICY custom_requests_checkout_owner_select ON public.custom_requests
  FOR SELECT TO localens_checkout_rpc_owner
  USING (current_user = 'localens_checkout_rpc_owner');
CREATE POLICY trip_plans_checkout_owner_select ON public.trip_plans
  FOR SELECT TO localens_checkout_rpc_owner
  USING (current_user = 'localens_checkout_rpc_owner');
CREATE POLICY trip_plan_revisions_checkout_owner_select ON public.trip_plan_revisions
  FOR SELECT TO localens_checkout_rpc_owner
  USING (current_user = 'localens_checkout_rpc_owner');
CREATE POLICY fx_snapshots_checkout_owner_select ON public.fx_snapshots
  FOR SELECT TO localens_checkout_rpc_owner
  USING (current_user = 'localens_checkout_rpc_owner');
CREATE POLICY user_roles_checkout_owner_select ON private.user_roles
  FOR SELECT TO localens_checkout_rpc_owner
  USING (current_user = 'localens_checkout_rpc_owner');
CREATE POLICY bookings_availability_owner_select ON public.bookings
  FOR SELECT TO localens_availability_rpc_owner
  USING (current_user = 'localens_availability_rpc_owner');
CREATE POLICY capacity_holds_availability_owner_select ON private.capacity_holds
  FOR SELECT TO localens_availability_rpc_owner
  USING (current_user = 'localens_availability_rpc_owner');
CREATE POLICY tour_versions_availability_owner_select ON public.tour_versions
  FOR SELECT TO localens_availability_rpc_owner
  USING (current_user = 'localens_availability_rpc_owner');
CREATE POLICY tours_availability_owner_select ON public.tours
  FOR SELECT TO localens_availability_rpc_owner
  USING (current_user = 'localens_availability_rpc_owner');
CREATE POLICY catalog_snapshots_availability_owner_select ON public.catalog_snapshots
  FOR SELECT TO localens_availability_rpc_owner
  USING (current_user = 'localens_availability_rpc_owner');

REVOKE ALL ON TABLE public.bookings, private.checkout_attempts, private.checkout_idempotency, private.capacity_holds FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.bookings FROM authenticated;
GRANT USAGE ON SCHEMA public, private, auth TO localens_checkout_rpc_owner;
GRANT USAGE ON SCHEMA public, private TO localens_availability_rpc_owner;
GRANT USAGE ON SCHEMA public, auth TO localens_booking_projection_owner;
GRANT SELECT, INSERT ON TABLE public.bookings TO localens_checkout_rpc_owner;
GRANT UPDATE (status) ON TABLE public.bookings TO localens_checkout_rpc_owner;
GRANT SELECT, INSERT ON TABLE private.checkout_attempts TO localens_checkout_rpc_owner;
GRANT UPDATE (provider_session_id, provider_expires_at, status, updated_at) ON TABLE private.checkout_attempts TO localens_checkout_rpc_owner;
GRANT SELECT, INSERT ON TABLE private.checkout_idempotency TO localens_checkout_rpc_owner;
GRANT SELECT, INSERT ON TABLE private.capacity_holds TO localens_checkout_rpc_owner;
GRANT UPDATE (status, consumed_at, released_at) ON TABLE private.capacity_holds TO localens_checkout_rpc_owner;
GRANT SELECT ON TABLE public.departures, public.tour_versions, public.tour_version_translations, public.tours, public.catalog_snapshots, public.travel_snapshots TO localens_checkout_rpc_owner;
GRANT SELECT ON TABLE public.custom_quotes, public.custom_requests, public.trip_plans, public.trip_plan_revisions, public.fx_snapshots TO localens_checkout_rpc_owner;
GRANT UPDATE (status) ON TABLE public.custom_quotes TO localens_checkout_rpc_owner;
GRANT SELECT ON TABLE private.user_roles TO localens_checkout_rpc_owner;
GRANT SELECT ON TABLE public.departures TO localens_availability_rpc_owner;
GRANT SELECT ON TABLE public.bookings, private.capacity_holds TO localens_availability_rpc_owner;
GRANT SELECT ON TABLE public.tour_versions, public.tours, public.catalog_snapshots TO localens_availability_rpc_owner;
GRANT EXECUTE ON FUNCTION auth.uid() TO localens_checkout_rpc_owner;
GRANT EXECUTE ON FUNCTION auth.uid() TO localens_booking_projection_owner;
GRANT SELECT (
  id, status, source_kind, source_id, tour_version_id, quote_id, title_en, title_vi,
  cancellation_policy, catalog_snapshot_id, travel_snapshot_id, fx_snapshot_id, fx_vnd_per_usd,
  per_person_vnd_minor, total_vnd_minor, checkout_currency, checkout_amount_minor, party_size,
  language, meeting_point, hold_expires_at, created_at
) ON TABLE public.bookings TO localens_booking_projection_owner;

-- Append-only idempotency receipts make a retry provably reuse the same
-- provider key and attempt.  The attempt/session rows remain mutable only via
-- the named checkout functions below.
CREATE OR REPLACE FUNCTION private.reject_checkout_idempotency_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'checkout idempotency records are append-only' USING ERRCODE = '42501';
END;
$function$;
ALTER FUNCTION private.reject_checkout_idempotency_mutation() OWNER TO localens_checkout_rpc_owner;
REVOKE ALL ON FUNCTION private.reject_checkout_idempotency_mutation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER checkout_idempotency_append_only
  BEFORE UPDATE OR DELETE ON private.checkout_idempotency
  FOR EACH ROW EXECUTE FUNCTION private.reject_checkout_idempotency_mutation();
CREATE TRIGGER checkout_idempotency_append_only_truncate
  BEFORE TRUNCATE ON private.checkout_idempotency
  FOR EACH STATEMENT EXECUTE FUNCTION private.reject_checkout_idempotency_mutation();

CREATE OR REPLACE FUNCTION private.assert_checkout_attempt_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF current_setting('localens.checkout_transition', true) <> 'on'
     OR OLD.id IS DISTINCT FROM NEW.id
     OR OLD.booking_id IS DISTINCT FROM NEW.booking_id
     OR OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id
     OR OLD.source_kind IS DISTINCT FROM NEW.source_kind
     OR OLD.departure_id IS DISTINCT FROM NEW.departure_id
     OR OLD.quote_id IS DISTINCT FROM NEW.quote_id
     OR OLD.provider_idempotency_key IS DISTINCT FROM NEW.provider_idempotency_key
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR NOT ((OLD.status = 'created' AND NEW.status IN ('session_recorded', 'compensated', 'failed')))
  THEN
    RAISE EXCEPTION 'checkout attempt facts are immutable or transition is invalid' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.assert_checkout_attempt_mutation() OWNER TO localens_checkout_rpc_owner;
REVOKE ALL ON FUNCTION private.assert_checkout_attempt_mutation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER checkout_attempt_mutation_guard
  BEFORE UPDATE ON private.checkout_attempts
  FOR EACH ROW EXECUTE FUNCTION private.assert_checkout_attempt_mutation();

CREATE OR REPLACE FUNCTION private.assert_checkout_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  allowed boolean := false;
BEGIN
  IF current_setting('localens.checkout_transition', true) <> 'on' THEN
    RAISE EXCEPTION 'checkout state changes require a named RPC' USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'bookings' THEN
    allowed := (OLD.status, NEW.status) IN (
      ('pending_payment'::public.booking_status, 'payment_processing'::public.booking_status),
      ('pending_payment'::public.booking_status, 'expired'::public.booking_status),
      ('pending_payment'::public.booking_status, 'cancelled'::public.booking_status),
      ('payment_processing'::public.booking_status, 'confirmed'::public.booking_status),
      ('payment_processing'::public.booking_status, 'payment_failed'::public.booking_status),
      ('payment_processing'::public.booking_status, 'expired'::public.booking_status),
      ('payment_processing'::public.booking_status, 'payment_review'::public.booking_status),
      ('payment_processing'::public.booking_status, 'cancelled'::public.booking_status),
      ('confirmed'::public.booking_status, 'completed'::public.booking_status),
      ('confirmed'::public.booking_status, 'cancelled'::public.booking_status),
      ('payment_review'::public.booking_status, 'confirmed'::public.booking_status),
      ('payment_review'::public.booking_status, 'cancelled'::public.booking_status)
    );
  ELSIF TG_TABLE_NAME = 'capacity_holds' THEN
    allowed := (OLD.status, NEW.status) IN (
      ('active'::public.hold_status, 'consumed'::public.hold_status),
      ('active'::public.hold_status, 'released'::public.hold_status),
      ('active'::public.hold_status, 'expired'::public.hold_status)
    );
  ELSE
    allowed := (OLD.status, NEW.status) IN (
      ('active'::public.quote_status, 'checkout_pending'::public.quote_status),
      ('active'::public.quote_status, 'expired'::public.quote_status),
      ('active'::public.quote_status, 'revoked'::public.quote_status),
      ('checkout_pending'::public.quote_status, 'accepted'::public.quote_status),
      ('checkout_pending'::public.quote_status, 'active'::public.quote_status),
      ('checkout_pending'::public.quote_status, 'expired'::public.quote_status),
      ('checkout_pending'::public.quote_status, 'revoked'::public.quote_status)
    );
  END IF;
  IF NOT allowed THEN
    RAISE EXCEPTION 'invalid checkout state transition' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.assert_checkout_transition() OWNER TO localens_checkout_rpc_owner;
REVOKE ALL ON FUNCTION private.assert_checkout_transition() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER bookings_transition_guard BEFORE UPDATE OF status ON public.bookings FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION private.assert_checkout_transition();
CREATE TRIGGER capacity_holds_transition_guard BEFORE UPDATE OF status ON private.capacity_holds FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION private.assert_checkout_transition();
CREATE TRIGGER custom_quotes_checkout_transition_guard BEFORE UPDATE OF status ON public.custom_quotes FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION private.assert_checkout_transition();

CREATE OR REPLACE FUNCTION private.checkout_canonical_payload(
  p_owner_user_id uuid,
  p_source_kind text,
  p_source_id uuid,
  p_party_size integer,
  p_locale public.locale
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT 'localens-checkout-v1|' || p_owner_user_id::text || '|' || p_source_kind || '|' || p_source_id::text || '|' || p_party_size::text || '|' || p_locale::text;
$function$;
ALTER FUNCTION private.checkout_canonical_payload(uuid, text, uuid, integer, public.locale) OWNER TO localens_checkout_rpc_owner;
REVOKE ALL ON FUNCTION private.checkout_canonical_payload(uuid, text, uuid, integer, public.locale) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.checkout_hash_equal(p_expected text, p_actual text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  expected_bytes bytea;
  actual_bytes bytea;
  difference integer := 0;
  index_no integer;
BEGIN
  IF p_expected IS NULL OR p_actual IS NULL OR length(p_expected) <> 64 OR length(p_actual) <> 64 THEN
    RETURN false;
  END IF;
  BEGIN
    expected_bytes := pg_catalog.decode(p_expected, 'hex');
    actual_bytes := pg_catalog.decode(p_actual, 'hex');
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  IF length(expected_bytes) <> length(actual_bytes) THEN RETURN false; END IF;
  FOR index_no IN 0..length(expected_bytes) - 1 LOOP
    difference := difference | (get_byte(expected_bytes, index_no) # get_byte(actual_bytes, index_no));
  END LOOP;
  RETURN difference = 0;
END;
$function$;
ALTER FUNCTION private.checkout_hash_equal(text, text) OWNER TO localens_checkout_rpc_owner;
REVOKE ALL ON FUNCTION private.checkout_hash_equal(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.record_checkout_audit_event(
  p_event_type public.audit_event_type,
  p_actor_user_id uuid,
  p_target_type public.audit_target_type,
  p_target_id uuid,
  p_from_state text,
  p_to_state text,
  p_metadata_key public.audit_metadata_key,
  p_metadata_text text,
  p_metadata_number numeric,
  p_metadata_boolean boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_event_type NOT IN (
    'checkout_started'::public.audit_event_type,
    'checkout_session_recorded'::public.audit_event_type,
    'checkout_compensated'::public.audit_event_type,
    'booking_status_changed'::public.audit_event_type,
    'quote_checkout_started'::public.audit_event_type,
    'quote_accepted'::public.audit_event_type,
    'quote_reactivated'::public.audit_event_type
  ) OR p_actor_user_id IS NULL OR p_target_id IS NULL
    OR p_target_type NOT IN ('checkout_attempt'::public.audit_target_type, 'booking'::public.audit_target_type, 'custom_quote'::public.audit_target_type)
    OR p_from_state IS NOT NULL AND p_from_state !~ '^[a-z][a-z0-9_]*$'
    OR p_to_state IS NOT NULL AND p_to_state !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'checkout audit rejected' USING ERRCODE = '42501';
  END IF;
  INSERT INTO private.audit_events (
    event_type, actor_user_id, actor_role, target_type, target_id,
    from_state, to_state, metadata_key, metadata_text, metadata_number, metadata_boolean
  ) VALUES (
    p_event_type, p_actor_user_id, 'customer'::public.app_role, p_target_type, p_target_id,
    p_from_state, p_to_state, p_metadata_key, p_metadata_text, p_metadata_number, p_metadata_boolean
  );
END;
$function$;
ALTER FUNCTION private.record_checkout_audit_event(public.audit_event_type, uuid, public.audit_target_type, uuid, text, text, public.audit_metadata_key, text, numeric, boolean) OWNER TO localens_identity_rpc_owner;
REVOKE ALL ON FUNCTION private.record_checkout_audit_event(public.audit_event_type, uuid, public.audit_target_type, uuid, text, text, public.audit_metadata_key, text, numeric, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.record_checkout_audit_event(public.audit_event_type, uuid, public.audit_target_type, uuid, text, text, public.audit_metadata_key, text, numeric, boolean) TO localens_checkout_rpc_owner;

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
AS $function$
DECLARE
  actor_user_id uuid := auth.uid();
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

  -- Recompute the request hash from the authenticated actor and every
  -- normalized source fact before consulting the idempotency receipt.  A
  -- retry that reuses the old hash with changed parameters must conflict even
  -- when the idempotency key itself is already present.
  canonical_hash := pg_catalog.encode(pg_catalog.digest(pg_catalog.convert_to(
    private.checkout_canonical_payload(actor_user_id, p_source_kind, p_source_id, p_party_size, p_locale), 'UTF8'
  ), 'sha256'), 'hex');
  IF NOT private.checkout_hash_equal(canonical_hash, p_canonical_request_hash) THEN
    RAISE EXCEPTION 'checkout request hash mismatch' USING ERRCODE = 'P0001';
  END IF;

  -- This insert is the first lock in every checkout path.  Target IDs are
  -- allocated before it so the immutable receipt is complete on first write.
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
    -- Preserve the common lock order on a retry: idempotency -> source ->
    -- booking.  The source and attempt facts are then checked against the
    -- authenticated request before any durable response is replayed.
    IF p_source_kind = 'departure' THEN
      SELECT * INTO departure_row FROM public.departures WHERE id = p_source_id FOR UPDATE;
    ELSE
      SELECT * INTO quote_row FROM public.custom_quotes WHERE id = p_source_id FOR UPDATE;
    END IF;
    SELECT * INTO booking_row FROM public.bookings WHERE id = idempotency_row.booking_id;
    SELECT * INTO retry_attempt_row FROM private.checkout_attempts WHERE id = idempotency_row.checkout_attempt_id;
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
    canonical_hash := pg_catalog.encode(pg_catalog.digest(pg_catalog.convert_to(
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

  -- Lock the source before creating the booking.  Departure capacity is
  -- serialized by its row lock; quote checkouts intentionally take no hold.
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
    -- Sample the database clock only after every source row is locked.  A
    -- wait on a departure lock must not shorten or bypass the hold window.
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
  END IF;

  canonical_hash := pg_catalog.encode(pg_catalog.digest(pg_catalog.convert_to(
    private.checkout_canonical_payload(actor_user_id, p_source_kind, p_source_id, derived_party_size, p_locale), 'UTF8'
  ), 'sha256'), 'hex');
  IF NOT private.checkout_hash_equal(canonical_hash, p_canonical_request_hash) THEN
    RAISE EXCEPTION 'checkout request hash mismatch' USING ERRCODE = 'P0001';
  END IF;
  hold_end := created_time + interval '35 minutes';

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
    source_meeting_point, 2100, hold_end, created_time
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
  hold_expires_at := hold_end;
  state := 'created';
  RETURN NEXT;
END;
$function$;
ALTER FUNCTION private.start_checkout_tx(text, uuid, integer, public.locale, text, text) OWNER TO localens_checkout_rpc_owner;
REVOKE ALL ON FUNCTION private.start_checkout_tx(text, uuid, integer, public.locale, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.start_checkout_tx(text, uuid, integer, public.locale, text, text) TO localens_checkout_rpc_owner;

CREATE OR REPLACE FUNCTION private.record_checkout_session(
  p_booking_id uuid,
  p_attempt_id uuid,
  p_provider_session_id text,
  p_provider_expires_at timestamptz
)
RETURNS TABLE (
  booking_id uuid,
  booking_status public.booking_status,
  payment_status public.payment_status,
  quote_status public.quote_status,
  provider_session_id text,
  state text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor_user_id uuid := auth.uid();
  attempt_row private.checkout_attempts%ROWTYPE;
  idempotency_row private.checkout_idempotency%ROWTYPE;
  booking_row public.bookings%ROWTYPE;
  hold_row private.capacity_holds%ROWTYPE;
  quote_row public.custom_quotes%ROWTYPE;
  departure_row public.departures%ROWTYPE;
  has_hold boolean := false;
  quote_update_count integer := 0;
  now_time timestamptz;
BEGIN
  IF actor_user_id IS NULL OR p_booking_id IS NULL OR p_attempt_id IS NULL OR p_provider_session_id IS NULL
     OR p_provider_session_id !~ '^cs_[A-Za-z0-9_-]{6,255}$' OR p_provider_expires_at IS NULL THEN
    RAISE EXCEPTION 'checkout session input rejected' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO idempotency_row FROM private.checkout_idempotency
  WHERE owner_user_id = actor_user_id AND checkout_attempt_id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'checkout attempt unavailable' USING ERRCODE = '42501'; END IF;
  -- Read immutable routing facts without locking; the shared lock order is
  -- idempotency -> quote/departure -> booking -> hold -> attempt/payment.
  SELECT * INTO attempt_row FROM private.checkout_attempts WHERE id = p_attempt_id;
  IF NOT FOUND OR attempt_row.booking_id IS DISTINCT FROM p_booking_id OR attempt_row.owner_user_id IS DISTINCT FROM actor_user_id THEN
    RAISE EXCEPTION 'checkout attempt unavailable' USING ERRCODE = '42501';
  END IF;
  IF attempt_row.departure_id IS NOT NULL THEN
    SELECT * INTO departure_row FROM public.departures WHERE id = attempt_row.departure_id FOR UPDATE;
  ELSE
    SELECT * INTO quote_row FROM public.custom_quotes WHERE id = attempt_row.quote_id FOR UPDATE;
  END IF;
  SELECT * INTO booking_row FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF attempt_row.departure_id IS NOT NULL THEN
    SELECT * INTO hold_row FROM private.capacity_holds WHERE booking_id = p_booking_id AND status = 'active'::public.hold_status FOR UPDATE;
    has_hold := FOUND;
  END IF;
  SELECT * INTO attempt_row FROM private.checkout_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND OR attempt_row.booking_id IS DISTINCT FROM p_booking_id OR attempt_row.owner_user_id IS DISTINCT FROM actor_user_id THEN
    RAISE EXCEPTION 'checkout attempt unavailable' USING ERRCODE = '42501';
  END IF;
  now_time := pg_catalog.clock_timestamp();
  IF attempt_row.provider_session_id IS NOT NULL THEN
    IF attempt_row.provider_session_id IS DISTINCT FROM p_provider_session_id THEN
      RAISE EXCEPTION 'checkout session conflict' USING ERRCODE = 'P0001';
    END IF;
    -- Task 10 may attach the same metadata-bound provider session from an
    -- early webhook.  A browser retry must replay terminal webhook states and
    -- never downgrade them; payment_status remains NULL until Task 10 owns
    -- the payment row/status mapping.
    IF booking_row.status IN ('confirmed'::public.booking_status, 'payment_review'::public.booking_status) THEN
      booking_id := booking_row.id; booking_status := booking_row.status; payment_status := NULL;
      quote_status := CASE WHEN quote_row.id IS NULL THEN NULL ELSE quote_row.status END;
      provider_session_id := attempt_row.provider_session_id; state := 'replayed'; RETURN NEXT; RETURN;
    END IF;
    booking_id := booking_row.id; booking_status := booking_row.status; payment_status := NULL;
    quote_status := CASE WHEN quote_row.id IS NULL THEN NULL ELSE quote_row.status END;
    provider_session_id := attempt_row.provider_session_id; state := 'replayed'; RETURN NEXT; RETURN;
  END IF;
  IF NOT FOUND OR booking_row.status <> 'pending_payment'::public.booking_status
     OR (attempt_row.departure_id IS NOT NULL AND (NOT has_hold OR hold_row.expires_at <= now_time)) THEN
    RAISE EXCEPTION 'checkout hold unavailable' USING ERRCODE = 'P0001';
  END IF;
  IF quote_row.id IS NOT NULL AND (quote_row.status <> 'checkout_pending'::public.quote_status OR quote_row.valid_until <= now_time) THEN
    RAISE EXCEPTION 'checkout quote is no longer pending' USING ERRCODE = 'P0001';
  END IF;
  -- The Edge computes the exact 30-minute Stripe expiry after this RPC
  -- returns, so network latency may put it after attempt.created_at+30m.  The
  -- database therefore enforces the real safety boundary: future and strictly
  -- inside the immutable 35-minute booking hold.
  IF p_provider_expires_at <= now_time OR p_provider_expires_at >= booking_row.hold_expires_at THEN
    RAISE EXCEPTION 'provider session expiry rejected' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_catalog.set_config('localens.checkout_transition', 'on', true);
  IF quote_row.id IS NOT NULL THEN
    PERFORM pg_catalog.set_config('localens.quote_transition', 'on', true);
    UPDATE public.custom_quotes SET status = 'accepted'::public.quote_status
    WHERE id = quote_row.id AND status = 'checkout_pending'::public.quote_status AND valid_until > now_time;
    GET DIAGNOSTICS quote_update_count = ROW_COUNT;
    IF quote_update_count <> 1 THEN
      RAISE EXCEPTION 'checkout quote transition lost' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  UPDATE private.checkout_attempts
  SET provider_session_id = p_provider_session_id, provider_expires_at = p_provider_expires_at,
      status = 'session_recorded', updated_at = now_time
  WHERE id = attempt_row.id;
  UPDATE public.bookings SET status = 'payment_processing'::public.booking_status WHERE id = booking_row.id;
  PERFORM private.record_checkout_audit_event(
    'checkout_session_recorded'::public.audit_event_type, actor_user_id,
    'checkout_attempt'::public.audit_target_type, attempt_row.id,
    'created', 'session_recorded', 'provider'::public.audit_metadata_key, 'stripe', NULL, NULL
  );
  booking_id := booking_row.id; booking_status := 'payment_processing'::public.booking_status; payment_status := NULL;
  quote_status := CASE WHEN quote_row.id IS NULL THEN NULL ELSE 'accepted'::public.quote_status END;
  provider_session_id := p_provider_session_id; state := 'recorded'; RETURN NEXT;
END;
$function$;
ALTER FUNCTION private.record_checkout_session(uuid, uuid, text, timestamptz) OWNER TO localens_checkout_rpc_owner;
REVOKE ALL ON FUNCTION private.record_checkout_session(uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.record_checkout_session(uuid, uuid, text, timestamptz) TO localens_checkout_rpc_owner;

CREATE OR REPLACE FUNCTION private.compensate_checkout_failure(p_attempt_id uuid)
RETURNS TABLE (booking_id uuid, booking_status public.booking_status, quote_status public.quote_status, state text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor_user_id uuid := auth.uid();
  idempotency_row private.checkout_idempotency%ROWTYPE;
  attempt_row private.checkout_attempts%ROWTYPE;
  booking_row public.bookings%ROWTYPE;
  hold_row private.capacity_holds%ROWTYPE;
  quote_row public.custom_quotes%ROWTYPE;
  departure_row public.departures%ROWTYPE;
  has_hold boolean := false;
  now_time timestamptz;
BEGIN
  IF actor_user_id IS NULL OR p_attempt_id IS NULL THEN RAISE EXCEPTION 'checkout authentication required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO idempotency_row FROM private.checkout_idempotency WHERE owner_user_id = actor_user_id AND checkout_attempt_id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'checkout attempt unavailable' USING ERRCODE = '42501'; END IF;
  -- Read immutable routing facts without locking; source -> booking -> hold ->
  -- attempt is the shared order after the idempotency receipt.
  SELECT * INTO attempt_row FROM private.checkout_attempts WHERE id = p_attempt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'checkout attempt unavailable' USING ERRCODE = '42501'; END IF;
  IF attempt_row.departure_id IS NOT NULL THEN
    SELECT * INTO departure_row FROM public.departures WHERE id = attempt_row.departure_id FOR UPDATE;
  ELSE
    SELECT * INTO quote_row FROM public.custom_quotes WHERE id = attempt_row.quote_id FOR UPDATE;
  END IF;
  SELECT * INTO booking_row FROM public.bookings WHERE id = attempt_row.booking_id FOR UPDATE;
  IF NOT FOUND OR booking_row.owner_user_id IS DISTINCT FROM actor_user_id THEN RAISE EXCEPTION 'checkout attempt unavailable' USING ERRCODE = '42501'; END IF;
  SELECT * INTO hold_row FROM private.capacity_holds WHERE booking_id = booking_row.id AND status = 'active'::public.hold_status FOR UPDATE;
  has_hold := FOUND;
  SELECT * INTO attempt_row FROM private.checkout_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND OR attempt_row.booking_id IS DISTINCT FROM booking_row.id OR attempt_row.owner_user_id IS DISTINCT FROM actor_user_id THEN
    RAISE EXCEPTION 'checkout attempt unavailable' USING ERRCODE = '42501';
  END IF;
  now_time := pg_catalog.clock_timestamp();
  IF attempt_row.status <> 'created' OR attempt_row.provider_session_id IS NOT NULL THEN
    booking_id := booking_row.id; booking_status := booking_row.status; quote_status := CASE WHEN quote_row.id IS NULL THEN NULL ELSE quote_row.status END; state := 'replayed'; RETURN NEXT; RETURN;
  END IF;
  PERFORM pg_catalog.set_config('localens.checkout_transition', 'on', true);
  IF attempt_row.quote_id IS NOT NULL THEN
    PERFORM pg_catalog.set_config('localens.quote_transition', 'on', true);
  END IF;
  IF has_hold THEN
    UPDATE private.capacity_holds SET status = CASE WHEN expires_at <= now_time THEN 'expired'::public.hold_status ELSE 'released'::public.hold_status END,
      released_at = now_time WHERE id = hold_row.id;
  END IF;
  UPDATE public.bookings SET status = CASE WHEN has_hold AND hold_row.expires_at <= now_time THEN 'expired'::public.booking_status ELSE 'cancelled'::public.booking_status END WHERE id = booking_row.id;
  IF attempt_row.quote_id IS NOT NULL THEN
    IF quote_row.status = 'checkout_pending'::public.quote_status THEN
      IF quote_row.valid_until > now_time THEN
        UPDATE public.custom_quotes SET status = 'active'::public.quote_status WHERE id = quote_row.id;
      ELSE
        UPDATE public.custom_quotes SET status = 'expired'::public.quote_status WHERE id = quote_row.id;
      END IF;
    END IF;
  END IF;
  UPDATE private.checkout_attempts SET status = 'compensated', updated_at = now_time WHERE id = attempt_row.id;
  PERFORM private.record_checkout_audit_event('checkout_compensated'::public.audit_event_type, actor_user_id,
    'checkout_attempt'::public.audit_target_type, attempt_row.id, 'created', 'compensated', 'source'::public.audit_metadata_key, 'stripe', NULL, NULL);
  booking_id := booking_row.id; booking_status := CASE WHEN has_hold AND hold_row.expires_at <= now_time THEN 'expired'::public.booking_status ELSE 'cancelled'::public.booking_status END;
  quote_status := CASE WHEN quote_row.id IS NULL THEN NULL ELSE quote_row.status END; state := 'compensated'; RETURN NEXT;
END;
$function$;
ALTER FUNCTION private.compensate_checkout_failure(uuid) OWNER TO localens_checkout_rpc_owner;
REVOKE ALL ON FUNCTION private.compensate_checkout_failure(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.compensate_checkout_failure(uuid) TO localens_checkout_rpc_owner;

CREATE OR REPLACE VIEW public.customer_bookings_v
WITH (security_invoker = false, security_barrier = true)
AS
SELECT id, status, source_kind, source_id, tour_version_id, quote_id, title_en, title_vi,
  cancellation_policy, catalog_snapshot_id, travel_snapshot_id, fx_snapshot_id, fx_vnd_per_usd,
  per_person_vnd_minor::text AS per_person_vnd_minor, total_vnd_minor::text AS total_vnd_minor,
  checkout_currency, checkout_amount_minor::text AS checkout_amount_minor, party_size, language,
  meeting_point, hold_expires_at, created_at
FROM public.bookings;
ALTER VIEW public.customer_bookings_v OWNER TO localens_booking_projection_owner;
REVOKE ALL ON public.customer_bookings_v FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.customer_bookings_v TO authenticated;

CREATE OR REPLACE FUNCTION public.get_live_departure_availability()
RETURNS TABLE (
  id uuid,
  tour_version_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  status public.departure_status,
  remaining_capacity integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT d.id, d.tour_version_id, d.start_at, d.end_at, d.status,
    GREATEST(0, d.capacity
      - COALESCE((SELECT sum(b.party_size)::integer FROM public.bookings AS b WHERE b.departure_id = d.id AND b.status IN ('confirmed'::public.booking_status, 'completed'::public.booking_status)), 0)
      - COALESCE((SELECT sum(h.party_size)::integer FROM private.capacity_holds AS h JOIN public.bookings AS hb ON hb.id = h.booking_id WHERE h.departure_id = d.id AND h.status = 'active'::public.hold_status AND h.expires_at > pg_catalog.clock_timestamp() AND hb.status NOT IN ('confirmed'::public.booking_status, 'completed'::public.booking_status)), 0)
    )::integer AS remaining_capacity
  FROM public.departures AS d
  JOIN public.tour_versions AS v ON v.id = d.tour_version_id
  JOIN public.tours AS t ON t.id = v.tour_id
  JOIN public.catalog_snapshots AS cs ON cs.id = v.catalog_snapshot_id
  WHERE d.status IN ('scheduled'::public.departure_status, 'sold_out'::public.departure_status)
    AND v.status = 'published'::public.tour_version_status
    AND t.status = 'published'::public.tour_status
    AND cs.status = 'published'::public.snapshot_status
    AND d.end_at > pg_catalog.clock_timestamp()
  ORDER BY d.start_at, d.id;
$function$;
ALTER FUNCTION public.get_live_departure_availability() OWNER TO localens_availability_rpc_owner;
REVOKE ALL ON FUNCTION public.get_live_departure_availability() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_live_departure_availability() TO anon, authenticated;

GRANT USAGE ON SCHEMA public, private TO localens_identity_rpc_owner;
GRANT INSERT ON TABLE private.audit_events TO localens_identity_rpc_owner;

COMMIT;
