BEGIN;

DO $roles$
DECLARE
  unsafe_role text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_cancellation_customer_rpc_owner') THEN
    EXECUTE 'CREATE ROLE localens_cancellation_customer_rpc_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_cancellation_admin_rpc_owner') THEN
    EXECUTE 'CREATE ROLE localens_cancellation_admin_rpc_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_cancellation_customer_projection_owner') THEN
    EXECUTE 'CREATE ROLE localens_cancellation_customer_projection_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_cancellation_admin_projection_owner') THEN
    EXECUTE 'CREATE ROLE localens_cancellation_admin_projection_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_cancellation_guard_owner') THEN
    EXECUTE 'CREATE ROLE localens_cancellation_guard_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS';
  END IF;

  SELECT rolname INTO unsafe_role
  FROM pg_catalog.pg_roles
  WHERE rolname IN (
      'localens_cancellation_customer_rpc_owner',
      'localens_cancellation_admin_rpc_owner',
      'localens_cancellation_customer_projection_owner',
      'localens_cancellation_admin_projection_owner',
      'localens_cancellation_guard_owner'
    )
    AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolcanlogin OR rolreplication OR rolbypassrls)
  LIMIT 1;
  IF unsafe_role IS NOT NULL THEN
    RAISE EXCEPTION 'unsafe pre-existing cancellation role attributes: %', unsafe_role;
  END IF;
END
$roles$;

DO $memberships$
DECLARE
  membership_record record;
  protected_roles constant text[] := ARRAY[
    'localens_cancellation_customer_rpc_owner',
    'localens_cancellation_admin_rpc_owner',
    'localens_cancellation_customer_projection_owner',
    'localens_cancellation_admin_projection_owner',
    'localens_cancellation_guard_owner'
  ];
BEGIN
  FOR membership_record IN
    SELECT granted.rolname AS granted_role, member.rolname AS member_role
    FROM pg_catalog.pg_auth_members AS memberships
    JOIN pg_catalog.pg_roles AS granted ON granted.oid = memberships.roleid
    JOIN pg_catalog.pg_roles AS member ON member.oid = memberships.member
    WHERE (granted.rolname = ANY(protected_roles) OR member.rolname = ANY(protected_roles))
      AND NOT (
        member.rolname = 'postgres'
        AND memberships.set_option
        AND NOT memberships.inherit_option
      )
  LOOP
    EXECUTE pg_catalog.format('REVOKE %I FROM %I', membership_record.granted_role, membership_record.member_role);
  END LOOP;
END
$memberships$;

GRANT localens_cancellation_customer_rpc_owner TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT localens_cancellation_admin_rpc_owner TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT localens_cancellation_customer_projection_owner TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT localens_cancellation_admin_projection_owner TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT localens_cancellation_guard_owner TO postgres WITH SET TRUE, INHERIT FALSE;

REVOKE ALL ON SCHEMA public, private, auth FROM
  localens_cancellation_customer_rpc_owner,
  localens_cancellation_admin_rpc_owner,
  localens_cancellation_customer_projection_owner,
  localens_cancellation_admin_projection_owner,
  localens_cancellation_guard_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA public, private, auth FROM
  localens_cancellation_customer_rpc_owner,
  localens_cancellation_admin_rpc_owner,
  localens_cancellation_customer_projection_owner,
  localens_cancellation_admin_projection_owner,
  localens_cancellation_guard_owner;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public, private FROM
  localens_cancellation_customer_rpc_owner,
  localens_cancellation_admin_rpc_owner,
  localens_cancellation_customer_projection_owner,
  localens_cancellation_admin_projection_owner,
  localens_cancellation_guard_owner;

CREATE TABLE private.fixed_tour_cancellation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  checkout_attempt_id uuid NOT NULL,
  reason text NOT NULL CHECK (
    reason = btrim(reason)
    AND length(reason) BETWEEN 1 AND 1000
    AND reason !~ '[[:cntrl:]]'
  ),
  request_idempotency_key text NOT NULL CHECK (
    request_idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$'
  ),
  requested_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decision_note text CHECK (
    decision_note IS NULL OR (
      decision_note = btrim(decision_note)
      AND length(decision_note) <= 1000
      AND decision_note !~ '[[:cntrl:]]'
    )
  ),
  decided_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  decision_idempotency_key text CHECK (
    decision_idempotency_key IS NULL
    OR decision_idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$'
  ),
  decision_booking_status public.booking_status,
  decided_at timestamptz,
  FOREIGN KEY (checkout_attempt_id, booking_id)
    REFERENCES private.checkout_attempts(id, booking_id) ON DELETE RESTRICT,
  UNIQUE (owner_user_id, request_idempotency_key),
  CHECK (
    (status = 'pending' AND decision_note IS NULL AND decided_by IS NULL
      AND decision_idempotency_key IS NULL AND decision_booking_status IS NULL
      AND decided_at IS NULL)
    OR
    (status IN ('approved', 'rejected') AND decided_by IS NOT NULL
      AND decision_idempotency_key IS NOT NULL AND decision_booking_status IS NOT NULL
      AND decided_at IS NOT NULL)
  )
);
CREATE UNIQUE INDEX fixed_tour_cancellation_admin_idempotency_key
  ON private.fixed_tour_cancellation_requests (decided_by, decision_idempotency_key)
  WHERE decision_idempotency_key IS NOT NULL;

CREATE TYPE public.fixed_tour_cancellation_request_result AS (
  request_id uuid,
  booking_id uuid,
  status text,
  reason text,
  requested_at timestamptz,
  state text
);
CREATE TYPE public.fixed_tour_cancellation_decision_result AS (
  request_id uuid,
  booking_id uuid,
  request_status text,
  booking_status public.booking_status,
  decision_note text,
  decided_at timestamptz,
  state text
);

ALTER TABLE private.fixed_tour_cancellation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.fixed_tour_cancellation_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY cancellation_requests_customer_rpc_select
  ON private.fixed_tour_cancellation_requests FOR SELECT
  TO localens_cancellation_customer_rpc_owner
  USING (current_user = 'localens_cancellation_customer_rpc_owner');
CREATE POLICY cancellation_requests_customer_rpc_insert
  ON private.fixed_tour_cancellation_requests FOR INSERT
  TO localens_cancellation_customer_rpc_owner
  WITH CHECK (current_user = 'localens_cancellation_customer_rpc_owner');
CREATE POLICY cancellation_requests_customer_rpc_lock
  ON private.fixed_tour_cancellation_requests FOR UPDATE
  TO localens_cancellation_customer_rpc_owner
  USING (current_user = 'localens_cancellation_customer_rpc_owner')
  WITH CHECK (current_user = 'localens_cancellation_customer_rpc_owner');
CREATE POLICY cancellation_requests_admin_rpc_select
  ON private.fixed_tour_cancellation_requests FOR SELECT
  TO localens_cancellation_admin_rpc_owner
  USING (current_user = 'localens_cancellation_admin_rpc_owner');
CREATE POLICY cancellation_requests_admin_rpc_update
  ON private.fixed_tour_cancellation_requests FOR UPDATE
  TO localens_cancellation_admin_rpc_owner
  USING (current_user = 'localens_cancellation_admin_rpc_owner')
  WITH CHECK (current_user = 'localens_cancellation_admin_rpc_owner');
CREATE POLICY cancellation_requests_customer_projection_select
  ON private.fixed_tour_cancellation_requests FOR SELECT
  TO localens_cancellation_customer_projection_owner
  USING (true);
CREATE POLICY cancellation_requests_admin_projection_select
  ON private.fixed_tour_cancellation_requests FOR SELECT
  TO localens_cancellation_admin_projection_owner
  USING (true);
CREATE POLICY cancellation_requests_guard_select
  ON private.fixed_tour_cancellation_requests FOR SELECT
  TO localens_cancellation_guard_owner
  USING (current_user = 'localens_cancellation_guard_owner');

CREATE POLICY user_roles_cancellation_customer_rpc_select ON private.user_roles
  FOR SELECT TO localens_cancellation_customer_rpc_owner
  USING (current_user = 'localens_cancellation_customer_rpc_owner');
CREATE POLICY user_roles_cancellation_admin_rpc_select ON private.user_roles
  FOR SELECT TO localens_cancellation_admin_rpc_owner
  USING (current_user = 'localens_cancellation_admin_rpc_owner');
CREATE POLICY user_roles_cancellation_customer_projection_select ON private.user_roles
  FOR SELECT TO localens_cancellation_customer_projection_owner
  USING (true);
CREATE POLICY user_roles_cancellation_admin_projection_select ON private.user_roles
  FOR SELECT TO localens_cancellation_admin_projection_owner
  USING (true);

CREATE POLICY checkout_idempotency_cancellation_customer_select ON private.checkout_idempotency
  FOR SELECT TO localens_cancellation_customer_rpc_owner
  USING (current_user = 'localens_cancellation_customer_rpc_owner');
CREATE POLICY checkout_idempotency_cancellation_customer_lock ON private.checkout_idempotency
  FOR UPDATE TO localens_cancellation_customer_rpc_owner
  USING (current_user = 'localens_cancellation_customer_rpc_owner')
  WITH CHECK (current_user = 'localens_cancellation_customer_rpc_owner');
CREATE POLICY checkout_idempotency_cancellation_admin_select ON private.checkout_idempotency
  FOR SELECT TO localens_cancellation_admin_rpc_owner
  USING (current_user = 'localens_cancellation_admin_rpc_owner');
CREATE POLICY checkout_idempotency_cancellation_admin_lock ON private.checkout_idempotency
  FOR UPDATE TO localens_cancellation_admin_rpc_owner
  USING (current_user = 'localens_cancellation_admin_rpc_owner')
  WITH CHECK (current_user = 'localens_cancellation_admin_rpc_owner');
CREATE POLICY checkout_idempotency_cancellation_guard_select ON private.checkout_idempotency
  FOR SELECT TO localens_cancellation_guard_owner
  USING (current_user = 'localens_cancellation_guard_owner');
CREATE POLICY checkout_idempotency_cancellation_guard_lock ON private.checkout_idempotency
  FOR UPDATE TO localens_cancellation_guard_owner
  USING (current_user = 'localens_cancellation_guard_owner')
  WITH CHECK (current_user = 'localens_cancellation_guard_owner');

CREATE POLICY departures_cancellation_customer_select ON public.departures
  FOR SELECT TO localens_cancellation_customer_rpc_owner
  USING (current_user = 'localens_cancellation_customer_rpc_owner');
CREATE POLICY departures_cancellation_customer_lock ON public.departures
  FOR UPDATE TO localens_cancellation_customer_rpc_owner
  USING (current_user = 'localens_cancellation_customer_rpc_owner')
  WITH CHECK (current_user = 'localens_cancellation_customer_rpc_owner');
CREATE POLICY departures_cancellation_admin_select ON public.departures
  FOR SELECT TO localens_cancellation_admin_rpc_owner
  USING (current_user = 'localens_cancellation_admin_rpc_owner');
CREATE POLICY departures_cancellation_admin_lock ON public.departures
  FOR UPDATE TO localens_cancellation_admin_rpc_owner
  USING (current_user = 'localens_cancellation_admin_rpc_owner')
  WITH CHECK (current_user = 'localens_cancellation_admin_rpc_owner');
CREATE POLICY bookings_cancellation_customer_select ON public.bookings
  FOR SELECT TO localens_cancellation_customer_rpc_owner
  USING (current_user = 'localens_cancellation_customer_rpc_owner');
CREATE POLICY bookings_cancellation_customer_lock ON public.bookings
  FOR UPDATE TO localens_cancellation_customer_rpc_owner
  USING (current_user = 'localens_cancellation_customer_rpc_owner')
  WITH CHECK (current_user = 'localens_cancellation_customer_rpc_owner');
CREATE POLICY bookings_cancellation_admin_select ON public.bookings
  FOR SELECT TO localens_cancellation_admin_rpc_owner
  USING (current_user = 'localens_cancellation_admin_rpc_owner');
CREATE POLICY bookings_cancellation_admin_update ON public.bookings
  FOR UPDATE TO localens_cancellation_admin_rpc_owner
  USING (current_user = 'localens_cancellation_admin_rpc_owner')
  WITH CHECK (current_user = 'localens_cancellation_admin_rpc_owner');
CREATE POLICY holds_cancellation_customer_select ON private.capacity_holds
  FOR SELECT TO localens_cancellation_customer_rpc_owner
  USING (current_user = 'localens_cancellation_customer_rpc_owner');
CREATE POLICY holds_cancellation_customer_lock ON private.capacity_holds
  FOR UPDATE TO localens_cancellation_customer_rpc_owner
  USING (current_user = 'localens_cancellation_customer_rpc_owner')
  WITH CHECK (current_user = 'localens_cancellation_customer_rpc_owner');
CREATE POLICY holds_cancellation_admin_select ON private.capacity_holds
  FOR SELECT TO localens_cancellation_admin_rpc_owner
  USING (current_user = 'localens_cancellation_admin_rpc_owner');
CREATE POLICY holds_cancellation_admin_update ON private.capacity_holds
  FOR UPDATE TO localens_cancellation_admin_rpc_owner
  USING (current_user = 'localens_cancellation_admin_rpc_owner')
  WITH CHECK (current_user = 'localens_cancellation_admin_rpc_owner');
CREATE POLICY attempts_cancellation_customer_select ON private.checkout_attempts
  FOR SELECT TO localens_cancellation_customer_rpc_owner
  USING (current_user = 'localens_cancellation_customer_rpc_owner');
CREATE POLICY attempts_cancellation_customer_lock ON private.checkout_attempts
  FOR UPDATE TO localens_cancellation_customer_rpc_owner
  USING (current_user = 'localens_cancellation_customer_rpc_owner')
  WITH CHECK (current_user = 'localens_cancellation_customer_rpc_owner');
CREATE POLICY attempts_cancellation_admin_select ON private.checkout_attempts
  FOR SELECT TO localens_cancellation_admin_rpc_owner
  USING (current_user = 'localens_cancellation_admin_rpc_owner');
CREATE POLICY attempts_cancellation_admin_update ON private.checkout_attempts
  FOR UPDATE TO localens_cancellation_admin_rpc_owner
  USING (current_user = 'localens_cancellation_admin_rpc_owner')
  WITH CHECK (current_user = 'localens_cancellation_admin_rpc_owner');
CREATE POLICY payments_cancellation_customer_select ON public.payments
  FOR SELECT TO localens_cancellation_customer_rpc_owner
  USING (current_user = 'localens_cancellation_customer_rpc_owner');
CREATE POLICY payments_cancellation_admin_select ON public.payments
  FOR SELECT TO localens_cancellation_admin_rpc_owner
  USING (current_user = 'localens_cancellation_admin_rpc_owner');
CREATE POLICY simulated_receipts_cancellation_customer_select ON private.simulated_payment_receipts
  FOR SELECT TO localens_cancellation_customer_rpc_owner
  USING (current_user = 'localens_cancellation_customer_rpc_owner');
CREATE POLICY simulated_receipts_cancellation_admin_select ON private.simulated_payment_receipts
  FOR SELECT TO localens_cancellation_admin_rpc_owner
  USING (current_user = 'localens_cancellation_admin_rpc_owner');
CREATE POLICY bookings_cancellation_admin_projection_select ON public.bookings
  FOR SELECT TO localens_cancellation_admin_projection_owner
  USING (true);
CREATE POLICY profiles_cancellation_admin_projection_select ON public.profiles
  FOR SELECT TO localens_cancellation_admin_projection_owner
  USING (true);

REVOKE ALL ON TABLE private.fixed_tour_cancellation_requests FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public, private, auth TO
  localens_cancellation_customer_rpc_owner,
  localens_cancellation_admin_rpc_owner,
  localens_cancellation_customer_projection_owner,
  localens_cancellation_admin_projection_owner,
  localens_cancellation_guard_owner;
GRANT SELECT ON private.user_roles TO
  localens_cancellation_customer_rpc_owner,
  localens_cancellation_admin_rpc_owner,
  localens_cancellation_customer_projection_owner,
  localens_cancellation_admin_projection_owner;
GRANT SELECT ON private.checkout_idempotency TO
  localens_cancellation_customer_rpc_owner,
  localens_cancellation_admin_rpc_owner,
  localens_cancellation_guard_owner;
GRANT UPDATE (id) ON private.checkout_idempotency TO
  localens_cancellation_customer_rpc_owner,
  localens_cancellation_admin_rpc_owner,
  localens_cancellation_guard_owner;
GRANT SELECT ON public.departures TO
  localens_cancellation_customer_rpc_owner,
  localens_cancellation_admin_rpc_owner;
GRANT UPDATE (id) ON public.departures TO
  localens_cancellation_customer_rpc_owner,
  localens_cancellation_admin_rpc_owner;
GRANT SELECT ON public.bookings TO
  localens_cancellation_customer_rpc_owner,
  localens_cancellation_admin_rpc_owner;
GRANT UPDATE (id) ON public.bookings TO localens_cancellation_customer_rpc_owner;
GRANT UPDATE (status) ON public.bookings TO localens_cancellation_admin_rpc_owner;
GRANT SELECT ON private.capacity_holds TO
  localens_cancellation_customer_rpc_owner,
  localens_cancellation_admin_rpc_owner;
GRANT UPDATE (id) ON private.capacity_holds TO localens_cancellation_customer_rpc_owner;
GRANT UPDATE (status, released_at) ON private.capacity_holds TO localens_cancellation_admin_rpc_owner;
GRANT SELECT ON private.checkout_attempts TO
  localens_cancellation_customer_rpc_owner,
  localens_cancellation_admin_rpc_owner;
GRANT UPDATE (id) ON private.checkout_attempts TO localens_cancellation_customer_rpc_owner;
GRANT UPDATE (status, updated_at) ON private.checkout_attempts TO localens_cancellation_admin_rpc_owner;
GRANT SELECT ON public.payments, private.simulated_payment_receipts TO
  localens_cancellation_customer_rpc_owner,
  localens_cancellation_admin_rpc_owner;
GRANT SELECT, INSERT ON private.fixed_tour_cancellation_requests TO localens_cancellation_customer_rpc_owner;
GRANT UPDATE (id) ON private.fixed_tour_cancellation_requests TO localens_cancellation_customer_rpc_owner;
GRANT SELECT ON private.fixed_tour_cancellation_requests TO localens_cancellation_admin_rpc_owner;
GRANT UPDATE (status, decision_note, decided_by, decision_idempotency_key, decision_booking_status, decided_at)
  ON private.fixed_tour_cancellation_requests TO localens_cancellation_admin_rpc_owner;
GRANT SELECT ON private.fixed_tour_cancellation_requests TO
  localens_cancellation_customer_projection_owner,
  localens_cancellation_admin_projection_owner,
  localens_cancellation_guard_owner;
GRANT SELECT (id, status, owner_user_id, title_en, title_vi)
  ON public.bookings TO localens_cancellation_admin_projection_owner;
GRANT SELECT (id, display_name) ON public.profiles TO localens_cancellation_admin_projection_owner;

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
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'cancellation requests are immutable' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.id IS DISTINCT FROM NEW.id
       OR OLD.booking_id IS DISTINCT FROM NEW.booking_id
       OR OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id
       OR OLD.checkout_attempt_id IS DISTINCT FROM NEW.checkout_attempt_id
       OR OLD.reason IS DISTINCT FROM NEW.reason
       OR OLD.request_idempotency_key IS DISTINCT FROM NEW.request_idempotency_key
       OR OLD.requested_at IS DISTINCT FROM NEW.requested_at
       OR OLD.status <> 'pending'
       OR NEW.status NOT IN ('approved', 'rejected')
       OR NEW.decided_by IS NULL
       OR NEW.decision_idempotency_key IS NULL
       OR NEW.decision_booking_status IS NULL
       OR NEW.decided_at IS NULL THEN
      RAISE EXCEPTION 'cancellation request identity is immutable' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
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
  RAISE EXCEPTION 'cancellation requests are immutable' USING ERRCODE = '42501';
END;
$function$;
CREATE OR REPLACE FUNCTION private.reject_payment_after_approved_cancellation()
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
    SELECT 1 FROM private.fixed_tour_cancellation_requests AS requests
    WHERE requests.booking_id = NEW.booking_id AND requests.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'CANCELLATION_APPROVED' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;
SET LOCAL ROLE postgres;
ALTER FUNCTION private.assert_fixed_tour_cancellation_request_mutation() OWNER TO localens_cancellation_guard_owner;
ALTER FUNCTION private.reject_fixed_tour_cancellation_truncate() OWNER TO localens_cancellation_guard_owner;
ALTER FUNCTION private.reject_payment_after_approved_cancellation() OWNER TO localens_cancellation_guard_owner;
CREATE TRIGGER fixed_tour_cancellation_requests_mutation_guard
  BEFORE UPDATE OR DELETE ON private.fixed_tour_cancellation_requests
  FOR EACH ROW EXECUTE FUNCTION private.assert_fixed_tour_cancellation_request_mutation();
CREATE TRIGGER fixed_tour_cancellation_requests_truncate_guard
  BEFORE TRUNCATE ON private.fixed_tour_cancellation_requests
  FOR EACH STATEMENT EXECUTE FUNCTION private.reject_fixed_tour_cancellation_truncate();
CREATE TRIGGER payments_cancellation_approval_exclusion
  BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION private.reject_payment_after_approved_cancellation();
SET LOCAL ROLE localens_cancellation_guard_owner;
REVOKE ALL ON FUNCTION private.assert_fixed_tour_cancellation_request_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.reject_fixed_tour_cancellation_truncate() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.reject_payment_after_approved_cancellation() FROM PUBLIC, anon, authenticated;
SET LOCAL ROLE postgres;
REVOKE CREATE ON SCHEMA private FROM localens_cancellation_guard_owner;

GRANT CREATE ON SCHEMA public TO localens_cancellation_customer_projection_owner;
SET LOCAL ROLE localens_cancellation_customer_projection_owner;
CREATE OR REPLACE VIEW public.customer_fixed_tour_cancellation_requests_v
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  requests.id AS request_id,
  requests.booking_id,
  requests.status,
  requests.reason,
  requests.requested_at,
  requests.decision_note,
  requests.decided_at
FROM private.fixed_tour_cancellation_requests AS requests
WHERE requests.owner_user_id = COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
    pg_catalog.jsonb_extract_path_text(NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb, 'sub')
  )::uuid
  AND EXISTS (
    SELECT 1 FROM private.user_roles AS roles
    WHERE roles.user_id = requests.owner_user_id AND roles.role = 'customer'::public.app_role
  )
  AND NOT EXISTS (
    SELECT 1 FROM private.user_roles AS roles
    WHERE roles.user_id = requests.owner_user_id AND roles.role IN ('guide'::public.app_role, 'admin'::public.app_role)
  );
REVOKE ALL ON public.customer_fixed_tour_cancellation_requests_v FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.customer_fixed_tour_cancellation_requests_v TO authenticated;
ALTER VIEW public.customer_fixed_tour_cancellation_requests_v
  OWNER TO localens_cancellation_customer_projection_owner;
SET LOCAL ROLE postgres;
REVOKE CREATE ON SCHEMA public FROM localens_cancellation_customer_projection_owner;

GRANT CREATE ON SCHEMA public TO localens_cancellation_admin_projection_owner;
SET LOCAL ROLE localens_cancellation_admin_projection_owner;
CREATE OR REPLACE VIEW public.admin_fixed_tour_cancellation_queue_v
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  requests.id AS request_id,
  requests.booking_id,
  bookings.status AS booking_status,
  COALESCE(profiles.display_name, 'Customer') AS customer_display_name,
  bookings.title_en,
  bookings.title_vi,
  requests.status,
  requests.reason,
  requests.requested_at,
  requests.decision_note,
  requests.decided_at
FROM private.fixed_tour_cancellation_requests AS requests
JOIN public.bookings AS bookings ON bookings.id = requests.booking_id
LEFT JOIN public.profiles AS profiles ON profiles.id = requests.owner_user_id
WHERE EXISTS (
    SELECT 1 FROM private.user_roles AS roles
    WHERE roles.user_id = COALESCE(
        NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        pg_catalog.jsonb_extract_path_text(NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb, 'sub')
      )::uuid
      AND roles.role = 'admin'::public.app_role
  )
  AND NOT EXISTS (
    SELECT 1 FROM private.user_roles AS roles
    WHERE roles.user_id = COALESCE(
        NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        pg_catalog.jsonb_extract_path_text(NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb, 'sub')
      )::uuid
      AND roles.role = 'guide'::public.app_role
  );
REVOKE ALL ON public.admin_fixed_tour_cancellation_queue_v FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_fixed_tour_cancellation_queue_v TO authenticated;
ALTER VIEW public.admin_fixed_tour_cancellation_queue_v
  OWNER TO localens_cancellation_admin_projection_owner;
SET LOCAL ROLE postgres;
REVOKE CREATE ON SCHEMA public FROM localens_cancellation_admin_projection_owner;

GRANT CREATE ON SCHEMA public TO localens_cancellation_customer_rpc_owner;
SET LOCAL ROLE localens_cancellation_customer_rpc_owner;
CREATE OR REPLACE FUNCTION public.request_fixed_tour_cancellation(
  booking_id uuid,
  reason text,
  idempotency_key text
)
RETURNS SETOF public.fixed_tour_cancellation_request_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  requested_booking_id uuid := $1;
  requested_reason text := $2;
  requested_idempotency_key text := $3;
  actor_user_id uuid;
  idempotency_row private.checkout_idempotency%ROWTYPE;
  routing_attempt private.checkout_attempts%ROWTYPE;
  attempt_row private.checkout_attempts%ROWTYPE;
  booking_row public.bookings%ROWTYPE;
  hold_row private.capacity_holds%ROWTYPE;
  request_row private.fixed_tour_cancellation_requests%ROWTYPE;
  payment_id uuid;
  simulated_receipt_id uuid;
  authority_time timestamptz;
BEGIN
  actor_user_id := COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
    pg_catalog.jsonb_extract_path_text(NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb, 'sub')
  )::uuid;
  IF actor_user_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM private.user_roles WHERE user_id = actor_user_id AND role = 'customer'::public.app_role)
     OR EXISTS (SELECT 1 FROM private.user_roles WHERE user_id = actor_user_id AND role IN ('guide'::public.app_role, 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'cancellation customer role required' USING ERRCODE = '42501';
  END IF;
  IF requested_booking_id IS NULL
     OR requested_reason IS NULL
     OR requested_reason <> btrim(requested_reason)
     OR length(requested_reason) NOT BETWEEN 1 AND 1000
     OR requested_reason ~ '[[:cntrl:]]'
     OR requested_idempotency_key IS NULL
     OR requested_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$' THEN
    RAISE EXCEPTION 'cancellation request input rejected' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO idempotency_row
  FROM private.checkout_idempotency AS idempotency
  WHERE idempotency.booking_id = requested_booking_id
    AND idempotency.owner_user_id = actor_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cancellation request unavailable' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_user_id::text || ':' || requested_idempotency_key, 0)
  );
  SELECT * INTO routing_attempt FROM private.checkout_attempts
  WHERE id = idempotency_row.checkout_attempt_id;
  IF NOT FOUND OR routing_attempt.departure_id IS NULL OR routing_attempt.quote_id IS NOT NULL THEN
    RAISE EXCEPTION 'cancellation request unavailable' USING ERRCODE = 'P0001';
  END IF;
  PERFORM departures.id FROM public.departures AS departures
  WHERE departures.id = routing_attempt.departure_id FOR UPDATE;
  SELECT * INTO booking_row FROM public.bookings AS bookings
  WHERE bookings.id = requested_booking_id FOR UPDATE;
  IF NOT FOUND OR booking_row.owner_user_id IS DISTINCT FROM actor_user_id
     OR booking_row.source_kind IS DISTINCT FROM 'departure'
     OR booking_row.departure_id IS DISTINCT FROM routing_attempt.departure_id THEN
    RAISE EXCEPTION 'cancellation request unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO hold_row FROM private.capacity_holds AS holds
  WHERE holds.booking_id = booking_row.id
  ORDER BY holds.created_at DESC, holds.id DESC LIMIT 1 FOR UPDATE;
  SELECT * INTO attempt_row FROM private.checkout_attempts AS attempts
  WHERE attempts.id = idempotency_row.checkout_attempt_id FOR UPDATE;
  IF NOT FOUND OR attempt_row.booking_id IS DISTINCT FROM booking_row.id
     OR attempt_row.owner_user_id IS DISTINCT FROM actor_user_id THEN
    RAISE EXCEPTION 'cancellation request unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT payments.id INTO payment_id FROM public.payments AS payments
  WHERE payments.booking_id = booking_row.id;
  SELECT receipts.id INTO simulated_receipt_id FROM private.simulated_payment_receipts AS receipts
  WHERE receipts.booking_id = booking_row.id;
  SELECT * INTO request_row
  FROM private.fixed_tour_cancellation_requests AS requests
  WHERE requests.booking_id = booking_row.id
     OR (requests.owner_user_id = actor_user_id AND requests.request_idempotency_key = requested_idempotency_key)
  ORDER BY CASE WHEN requests.booking_id = booking_row.id THEN 0 ELSE 1 END
  LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF request_row.booking_id IS DISTINCT FROM booking_row.id
       OR request_row.owner_user_id IS DISTINCT FROM actor_user_id
       OR request_row.request_idempotency_key IS DISTINCT FROM requested_idempotency_key
       OR request_row.reason IS DISTINCT FROM requested_reason THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEXT (
      request_row.id, request_row.booking_id, 'pending',
      request_row.reason, request_row.requested_at, 'replayed'
    )::public.fixed_tour_cancellation_request_result;
    RETURN;
  END IF;

  authority_time := pg_catalog.clock_timestamp();
  IF booking_row.status <> 'pending_payment'::public.booking_status
     OR hold_row.id IS NULL
     OR hold_row.status <> 'active'::public.hold_status
     OR hold_row.expires_at <= authority_time
     OR attempt_row.status <> 'created'
     OR attempt_row.provider_session_id IS NOT NULL
     OR payment_id IS NOT NULL
     OR simulated_receipt_id IS NOT NULL THEN
    RAISE EXCEPTION 'cancellation request unavailable' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO private.fixed_tour_cancellation_requests (
    booking_id, owner_user_id, checkout_attempt_id, reason,
    request_idempotency_key, requested_at
  ) VALUES (
    booking_row.id, actor_user_id, attempt_row.id, requested_reason,
    requested_idempotency_key, authority_time
  ) RETURNING * INTO request_row;
  RETURN NEXT (
    request_row.id, request_row.booking_id, request_row.status,
    request_row.reason, request_row.requested_at, 'created'
  )::public.fixed_tour_cancellation_request_result;
END;
$function$;
SET LOCAL ROLE postgres;
ALTER FUNCTION public.request_fixed_tour_cancellation(uuid, text, text)
  OWNER TO localens_cancellation_customer_rpc_owner;
SET LOCAL ROLE localens_cancellation_customer_rpc_owner;
REVOKE ALL ON FUNCTION public.request_fixed_tour_cancellation(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_fixed_tour_cancellation(uuid, text, text) TO authenticated;
SET LOCAL ROLE postgres;
REVOKE CREATE ON SCHEMA public FROM localens_cancellation_customer_rpc_owner;

GRANT CREATE ON SCHEMA public TO localens_cancellation_admin_rpc_owner;
SET LOCAL ROLE localens_cancellation_admin_rpc_owner;
CREATE OR REPLACE FUNCTION public.decide_fixed_tour_cancellation(
  request_id uuid,
  decision text,
  note text,
  idempotency_key text
)
RETURNS SETOF public.fixed_tour_cancellation_decision_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  requested_request_id uuid := $1;
  requested_decision text := $2;
  requested_note text := NULLIF($3, '');
  requested_idempotency_key text := $4;
  actor_user_id uuid;
  routing_request private.fixed_tour_cancellation_requests%ROWTYPE;
  request_row private.fixed_tour_cancellation_requests%ROWTYPE;
  reused_key_request_id uuid;
  idempotency_row private.checkout_idempotency%ROWTYPE;
  routing_attempt private.checkout_attempts%ROWTYPE;
  attempt_row private.checkout_attempts%ROWTYPE;
  booking_row public.bookings%ROWTYPE;
  hold_row private.capacity_holds%ROWTYPE;
  payment_id uuid;
  simulated_receipt_id uuid;
  authority_time timestamptz;
BEGIN
  actor_user_id := COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
    pg_catalog.jsonb_extract_path_text(NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb, 'sub')
  )::uuid;
  IF actor_user_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM private.user_roles WHERE user_id = actor_user_id AND role = 'admin'::public.app_role)
     OR EXISTS (SELECT 1 FROM private.user_roles WHERE user_id = actor_user_id AND role = 'guide'::public.app_role) THEN
    RAISE EXCEPTION 'cancellation administrator role required' USING ERRCODE = '42501';
  END IF;
  IF requested_request_id IS NULL
     OR requested_decision NOT IN ('approved', 'rejected')
     OR (requested_note IS NOT NULL AND (
       requested_note <> btrim(requested_note)
       OR length(requested_note) > 1000
       OR requested_note ~ '[[:cntrl:]]'
     ))
     OR requested_idempotency_key IS NULL
     OR requested_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$' THEN
    RAISE EXCEPTION 'cancellation decision input rejected' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO routing_request FROM private.fixed_tour_cancellation_requests
  WHERE id = requested_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cancellation request unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO idempotency_row FROM private.checkout_idempotency
  WHERE booking_id = routing_request.booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cancellation request unavailable' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_user_id::text || ':' || requested_idempotency_key, 0)
  );
  SELECT * INTO routing_attempt FROM private.checkout_attempts
  WHERE id = idempotency_row.checkout_attempt_id;
  IF NOT FOUND OR routing_attempt.departure_id IS NULL OR routing_attempt.quote_id IS NOT NULL THEN
    RAISE EXCEPTION 'cancellation request unavailable' USING ERRCODE = 'P0001';
  END IF;
  PERFORM departures.id FROM public.departures AS departures
  WHERE departures.id = routing_attempt.departure_id FOR UPDATE;
  SELECT * INTO booking_row FROM public.bookings AS bookings
  WHERE bookings.id = routing_request.booking_id FOR UPDATE;
  SELECT * INTO hold_row FROM private.capacity_holds AS holds
  WHERE holds.booking_id = booking_row.id
  ORDER BY holds.created_at DESC, holds.id DESC LIMIT 1 FOR UPDATE;
  SELECT * INTO attempt_row FROM private.checkout_attempts AS attempts
  WHERE attempts.id = idempotency_row.checkout_attempt_id FOR UPDATE;
  SELECT payments.id INTO payment_id FROM public.payments AS payments
  WHERE payments.booking_id = booking_row.id;
  SELECT receipts.id INTO simulated_receipt_id FROM private.simulated_payment_receipts AS receipts
  WHERE receipts.booking_id = booking_row.id;
  SELECT requests.id INTO reused_key_request_id
  FROM private.fixed_tour_cancellation_requests AS requests
  WHERE requests.decided_by = actor_user_id
    AND requests.decision_idempotency_key = requested_idempotency_key
    AND requests.id <> requested_request_id;
  SELECT * INTO request_row FROM private.fixed_tour_cancellation_requests
  WHERE id = requested_request_id FOR UPDATE;
  IF NOT FOUND OR request_row.booking_id IS DISTINCT FROM booking_row.id
     OR request_row.checkout_attempt_id IS DISTINCT FROM attempt_row.id THEN
    RAISE EXCEPTION 'cancellation request unavailable' USING ERRCODE = '42501';
  END IF;
  IF reused_key_request_id IS NOT NULL THEN
    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF request_row.status <> 'pending' THEN
    IF request_row.status IS DISTINCT FROM requested_decision
       OR request_row.decided_by IS DISTINCT FROM actor_user_id
       OR request_row.decision_idempotency_key IS DISTINCT FROM requested_idempotency_key
       OR request_row.decision_note IS DISTINCT FROM requested_note THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEXT (
      request_row.id, request_row.booking_id, request_row.status,
      request_row.decision_booking_status, request_row.decision_note, request_row.decided_at, 'replayed'
    )::public.fixed_tour_cancellation_decision_result;
    RETURN;
  END IF;

  authority_time := pg_catalog.clock_timestamp();
  IF requested_decision = 'approved' THEN
    IF booking_row.status <> 'pending_payment'::public.booking_status
       OR hold_row.id IS NULL
       OR hold_row.status <> 'active'::public.hold_status
       OR hold_row.expires_at <= authority_time
       OR attempt_row.status <> 'created'
       OR attempt_row.provider_session_id IS NOT NULL
       OR payment_id IS NOT NULL
       OR simulated_receipt_id IS NOT NULL THEN
      RAISE EXCEPTION 'cancellation approval unavailable: booking not pending' USING ERRCODE = 'P0001';
    END IF;
    PERFORM pg_catalog.set_config('localens.checkout_transition', 'on', true);
    UPDATE public.bookings SET status = 'cancelled'::public.booking_status
    WHERE id = booking_row.id;
    UPDATE private.capacity_holds
    SET status = 'released'::public.hold_status, released_at = authority_time
    WHERE id = hold_row.id;
    UPDATE private.checkout_attempts
    SET status = 'compensated', updated_at = authority_time
    WHERE id = attempt_row.id;
  END IF;
  UPDATE private.fixed_tour_cancellation_requests
  SET status = requested_decision,
      decision_note = requested_note,
      decided_by = actor_user_id,
      decision_idempotency_key = requested_idempotency_key,
      decision_booking_status = CASE
        WHEN requested_decision = 'approved' THEN 'cancelled'::public.booking_status
        ELSE booking_row.status
      END,
      decided_at = authority_time
  WHERE id = request_row.id
  RETURNING * INTO request_row;
  IF requested_decision = 'approved' THEN
    booking_row.status := 'cancelled'::public.booking_status;
  END IF;
  RETURN NEXT (
    request_row.id, request_row.booking_id, request_row.status,
    request_row.decision_booking_status, request_row.decision_note, request_row.decided_at,
    requested_decision
  )::public.fixed_tour_cancellation_decision_result;
END;
$function$;
SET LOCAL ROLE postgres;
ALTER FUNCTION public.decide_fixed_tour_cancellation(uuid, text, text, text)
  OWNER TO localens_cancellation_admin_rpc_owner;
SET LOCAL ROLE localens_cancellation_admin_rpc_owner;
REVOKE ALL ON FUNCTION public.decide_fixed_tour_cancellation(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_fixed_tour_cancellation(uuid, text, text, text) TO authenticated;
SET LOCAL ROLE postgres;
REVOKE CREATE ON SCHEMA public FROM localens_cancellation_admin_rpc_owner;

COMMIT;
