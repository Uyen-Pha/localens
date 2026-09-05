BEGIN;

-- Task 8 has its own non-login, non-bypass owners.  They are intentionally
-- separate from the plan, guest, and later checkout owners.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_request_customer_rpc_owner') THEN
    EXECUTE 'CREATE ROLE localens_request_customer_rpc_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_request_admin_rpc_owner') THEN
    EXECUTE 'CREATE ROLE localens_request_admin_rpc_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_request_guard_owner') THEN
    EXECUTE 'CREATE ROLE localens_request_guard_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname LIKE 'localens_%'
      AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname LIKE 'localens_%'
      AND ((rolname IN ('localens_guest_executor', 'localens_quota_executor') AND NOT rolcanlogin)
        OR (rolname NOT IN ('localens_guest_executor', 'localens_quota_executor') AND rolcanlogin))
  ) THEN
    RAISE EXCEPTION 'unsafe pre-existing LocalLens protected role attributes or login class';
  END IF;
END
$roles$;

-- Re-run the complete protected-role scrub whenever a new protected identity is
-- introduced.  A stale membership must never widen a SECURITY DEFINER owner.
DO $memberships$
DECLARE
  membership_record record;
  protected_roles constant text[] := ARRAY[
    'localens_auth_trigger_owner', 'localens_identity_rpc_owner',
    'localens_admin_rpc_owner', 'localens_audit_guard_owner',
    'localens_catalog_rpc_owner', 'localens_catalog_guard_owner',
    'localens_tour_rpc_owner', 'localens_tour_guard_owner',
    'localens_plan_rpc_owner', 'localens_plan_guard_owner',
    'localens_guest_rpc_owner', 'localens_claim_rpc_owner',
    'localens_quota_rpc_owner', 'localens_guest_executor',
    'localens_quota_executor', 'localens_webhook_executor',
    'localens_build_executor', 'localens_request_customer_rpc_owner',
    'localens_request_admin_rpc_owner',
    'localens_request_guard_owner'
  ];
BEGIN
  FOR membership_record IN
    SELECT granted.rolname AS granted_role, member.rolname AS member_role
    FROM pg_catalog.pg_auth_members AS memberships
    JOIN pg_catalog.pg_roles AS granted ON granted.oid = memberships.roleid
    JOIN pg_catalog.pg_roles AS member ON member.oid = memberships.member
    WHERE (granted.rolname = ANY(protected_roles)
       OR member.rolname = ANY(protected_roles))
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

GRANT localens_auth_trigger_owner TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT localens_identity_rpc_owner TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT localens_admin_rpc_owner TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT localens_audit_guard_owner TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT localens_catalog_rpc_owner TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT localens_catalog_guard_owner TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT localens_tour_rpc_owner TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT localens_tour_guard_owner TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT localens_plan_rpc_owner TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT localens_plan_guard_owner TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT localens_guest_rpc_owner TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT localens_claim_rpc_owner TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT localens_quota_rpc_owner TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT localens_guest_executor TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT localens_quota_executor TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT localens_webhook_executor TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT localens_build_executor TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT localens_request_customer_rpc_owner TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT localens_request_admin_rpc_owner TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT localens_request_guard_owner TO postgres WITH SET TRUE, INHERIT FALSE;

REVOKE ALL ON SCHEMA public, private, auth FROM localens_request_customer_rpc_owner, localens_request_admin_rpc_owner, localens_request_guard_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA public, private, auth FROM localens_request_customer_rpc_owner, localens_request_admin_rpc_owner, localens_request_guard_owner;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public, private, auth FROM localens_request_customer_rpc_owner, localens_request_admin_rpc_owner, localens_request_guard_owner;
GRANT CREATE ON SCHEMA private TO localens_identity_rpc_owner, localens_request_customer_rpc_owner, localens_request_admin_rpc_owner, localens_request_guard_owner;
GRANT CREATE ON SCHEMA public TO localens_request_customer_rpc_owner, localens_request_admin_rpc_owner;

-- Customer locale is a profile fact, not a request/HTTP input.  Task 8 owns
-- only this additive schema change; the identity migration remains immutable.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS language public.locale NOT NULL DEFAULT 'en';

-- The existing revision identity is unique by plan and revision number.  This
-- composite target lets request rows bind the id and number to one immutable
-- revision even when a customer resubmits a changed revision.
ALTER TABLE public.trip_plan_revisions
  ADD CONSTRAINT trip_plan_revisions_id_plan_revision_no_key
  UNIQUE (id, plan_id, revision_no);
ALTER TABLE public.trip_plan_revisions
  ADD CONSTRAINT trip_plan_revisions_id_revision_no_key
  UNIQUE (id, revision_no);
ALTER TABLE public.trip_plans
  ADD CONSTRAINT trip_plans_id_owner_user_id_key
  UNIQUE (id, owner_user_id);

CREATE TABLE public.custom_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.trip_plans(id) ON DELETE RESTRICT,
  revision_id uuid NOT NULL REFERENCES public.trip_plan_revisions(id) ON DELETE RESTRICT,
  revision_no integer NOT NULL CHECK (revision_no BETWEEN 1 AND 2147483647),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status public.request_status NOT NULL DEFAULT 'draft',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  latest_decision_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, plan_id, revision_id, revision_no),
  FOREIGN KEY (revision_id, plan_id, revision_no)
    REFERENCES public.trip_plan_revisions(id, plan_id, revision_no) ON DELETE RESTRICT,
  FOREIGN KEY (plan_id, owner_user_id)
    REFERENCES public.trip_plans(id, owner_user_id) ON DELETE RESTRICT
);

CREATE TABLE private.custom_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.custom_requests(id) ON DELETE RESTRICT,
  revision_id uuid NOT NULL REFERENCES public.trip_plan_revisions(id) ON DELETE RESTRICT,
  revision_no integer NOT NULL CHECK (revision_no BETWEEN 1 AND 2147483647),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_role public.app_role,
  event_type public.audit_event_type NOT NULL CHECK (
    event_type IN (
      'request_submitted', 'request_changes_requested',
      'request_approved', 'request_rejected'
    )
  ),
  from_state public.request_status,
  to_state public.request_status NOT NULL,
  note text CHECK (note IS NULL OR (length(btrim(note)) BETWEEN 1 AND 1000 AND note = btrim(note) AND note !~ '[[:cntrl:]]')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (revision_id, revision_no)
    REFERENCES public.trip_plan_revisions(id, revision_no) ON DELETE RESTRICT,
  CHECK (
    (event_type = 'request_submitted'::public.audit_event_type
      AND from_state IN ('draft'::public.request_status, 'changes_requested'::public.request_status)
      AND to_state = 'pending_review'::public.request_status
      AND note IS NULL)
    OR
    (event_type = 'request_changes_requested'::public.audit_event_type
      AND from_state = 'pending_review'::public.request_status
      AND to_state = 'changes_requested'::public.request_status
      AND note IS NOT NULL)
    OR
    (event_type = 'request_approved'::public.audit_event_type
      AND from_state = 'pending_review'::public.request_status
      AND to_state = 'approved'::public.request_status
      AND note IS NULL)
    OR
    (event_type = 'request_rejected'::public.audit_event_type
      AND from_state = 'pending_review'::public.request_status
      AND to_state = 'rejected'::public.request_status
      AND note IS NOT NULL)
  )
);

CREATE TABLE public.custom_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.custom_requests(id) ON DELETE RESTRICT,
  status public.quote_status NOT NULL DEFAULT 'active',
  amount_vnd_minor bigint NOT NULL CHECK (amount_vnd_minor BETWEEN 1 AND 9007199254740991),
  checkout_currency public.checkout_currency NOT NULL,
  checkout_amount_minor bigint NOT NULL CHECK (checkout_amount_minor BETWEEN 0 AND 9007199254740991),
  catalog_snapshot_id uuid NOT NULL REFERENCES public.catalog_snapshots(id) ON DELETE RESTRICT,
  travel_snapshot_id uuid NOT NULL,
  fx_snapshot_id uuid REFERENCES public.fx_snapshots(id) ON DELETE RESTRICT,
  fx_vnd_per_usd numeric(20,8),
  title_en text NOT NULL CHECK (title_en = btrim(title_en) AND length(title_en) BETWEEN 1 AND 240 AND title_en !~ '[[:cntrl:]]'),
  title_vi text NOT NULL CHECK (title_vi = btrim(title_vi) AND length(title_vi) BETWEEN 1 AND 240 AND title_vi !~ '[[:cntrl:]]'),
  policy text NOT NULL CHECK (policy = btrim(policy) AND length(policy) BETWEEN 1 AND 4000 AND policy !~ '[[:cntrl:]]'),
  created_at timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz GENERATED ALWAYS AS (
    pg_catalog.timezone('UTC', pg_catalog.timezone('UTC', created_at) + interval '48 hours')
  ) STORED,
  UNIQUE (id, request_id),
  FOREIGN KEY (travel_snapshot_id, catalog_snapshot_id)
    REFERENCES public.travel_snapshots(id, catalog_snapshot_id) ON DELETE RESTRICT,
  FOREIGN KEY (travel_snapshot_id) REFERENCES public.travel_snapshots(id) ON DELETE RESTRICT,
  CHECK (fx_vnd_per_usd IS NULL OR fx_vnd_per_usd > 0),
  CHECK (
    (checkout_currency = 'vnd'::public.checkout_currency
      AND checkout_amount_minor = amount_vnd_minor
      AND fx_snapshot_id IS NULL
      AND fx_vnd_per_usd IS NULL)
    OR
    (checkout_currency = 'usd'::public.checkout_currency
      AND fx_snapshot_id IS NOT NULL
      AND fx_vnd_per_usd IS NOT NULL
      AND checkout_amount_minor > 0)
  )
);

CREATE UNIQUE INDEX custom_requests_one_active_per_plan
  ON public.custom_requests (plan_id)
  WHERE status IN ('draft', 'pending_review', 'changes_requested', 'approved');

CREATE UNIQUE INDEX custom_quotes_one_sellable_per_request
  ON public.custom_quotes (request_id)
  WHERE status IN ('active', 'checkout_pending');

CREATE INDEX custom_requests_queue_idx
  ON public.custom_requests (status, submitted_at, id);

CREATE INDEX custom_quotes_request_status_idx
  ON public.custom_quotes (request_id, status, valid_until);

ALTER TABLE public.custom_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE private.custom_request_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.custom_request_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.custom_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_quotes FORCE ROW LEVEL SECURITY;

CREATE POLICY custom_requests_customer_select ON public.custom_requests
  FOR SELECT TO authenticated
  USING (NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid = owner_user_id);

CREATE POLICY custom_requests_customer_rpc_owner_all ON public.custom_requests
  FOR ALL TO localens_request_customer_rpc_owner
  USING (true)
  WITH CHECK (true);

CREATE POLICY custom_requests_admin_rpc_owner_all ON public.custom_requests
  FOR ALL TO localens_request_admin_rpc_owner
  USING (true)
  WITH CHECK (true);

CREATE POLICY custom_request_events_customer_rpc_owner_insert ON private.custom_request_events
  FOR INSERT TO localens_request_customer_rpc_owner
  WITH CHECK (current_user = 'localens_request_customer_rpc_owner');

CREATE POLICY custom_request_events_admin_rpc_owner_insert ON private.custom_request_events
  FOR INSERT TO localens_request_admin_rpc_owner
  WITH CHECK (current_user = 'localens_request_admin_rpc_owner');

CREATE POLICY custom_quotes_customer_select ON public.custom_quotes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.custom_requests AS requests
      WHERE requests.id = custom_quotes.request_id
        AND requests.owner_user_id = NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid
    )
  );

CREATE POLICY custom_quotes_customer_rpc_owner_select ON public.custom_quotes
  FOR SELECT TO localens_request_customer_rpc_owner
  USING (true);

CREATE POLICY custom_quotes_admin_rpc_owner_all ON public.custom_quotes
  FOR ALL TO localens_request_admin_rpc_owner
  USING (true)
  WITH CHECK (true);

-- The request owner needs read-only access to immutable source facts and the
-- claimed plan.  API roles still receive no base-table privileges.
CREATE POLICY trip_plans_request_customer_rpc_select ON public.trip_plans
  FOR SELECT TO localens_request_customer_rpc_owner USING (true);
CREATE POLICY trip_plans_request_admin_rpc_select ON public.trip_plans
  FOR SELECT TO localens_request_admin_rpc_owner USING (true);
CREATE POLICY trip_plan_revisions_request_customer_rpc_select ON public.trip_plan_revisions
  FOR SELECT TO localens_request_customer_rpc_owner USING (true);
CREATE POLICY trip_plan_revisions_request_admin_rpc_select ON public.trip_plan_revisions
  FOR SELECT TO localens_request_admin_rpc_owner USING (true);
CREATE POLICY trip_plans_request_customer_rpc_lock ON public.trip_plans
  FOR UPDATE TO localens_request_customer_rpc_owner
  USING (current_user = 'localens_request_customer_rpc_owner')
  WITH CHECK (current_user = 'localens_request_customer_rpc_owner');
CREATE POLICY trip_plan_revisions_request_customer_rpc_lock ON public.trip_plan_revisions
  FOR UPDATE TO localens_request_customer_rpc_owner
  USING (current_user = 'localens_request_customer_rpc_owner')
  WITH CHECK (current_user = 'localens_request_customer_rpc_owner');
CREATE POLICY trip_plans_request_admin_rpc_lock ON public.trip_plans
  FOR UPDATE TO localens_request_admin_rpc_owner
  USING (current_user = 'localens_request_admin_rpc_owner')
  WITH CHECK (current_user = 'localens_request_admin_rpc_owner');
CREATE POLICY trip_plan_revisions_request_admin_rpc_lock ON public.trip_plan_revisions
  FOR UPDATE TO localens_request_admin_rpc_owner
  USING (current_user = 'localens_request_admin_rpc_owner')
  WITH CHECK (current_user = 'localens_request_admin_rpc_owner');
CREATE POLICY fx_snapshots_request_admin_rpc_select ON public.fx_snapshots
  FOR SELECT TO localens_request_admin_rpc_owner USING (true);
CREATE POLICY fx_snapshots_request_admin_rpc_lock ON public.fx_snapshots
  FOR UPDATE TO localens_request_admin_rpc_owner
  USING (current_user = 'localens_request_admin_rpc_owner')
  WITH CHECK (current_user = 'localens_request_admin_rpc_owner');
CREATE POLICY user_roles_request_customer_rpc_select ON private.user_roles
  FOR SELECT TO localens_request_customer_rpc_owner USING (true);
CREATE POLICY user_roles_request_admin_rpc_select ON private.user_roles
  FOR SELECT TO localens_request_admin_rpc_owner USING (true);
CREATE POLICY profiles_request_customer_rpc_language_select ON public.profiles
  FOR SELECT TO localens_request_customer_rpc_owner
  USING (NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid = id);

CREATE OR REPLACE FUNCTION private.reject_custom_request_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'custom request events are append-only' USING ERRCODE = '42501';
END;
$function$;

ALTER FUNCTION private.reject_custom_request_event_mutation() OWNER TO localens_request_guard_owner;
REVOKE ALL ON FUNCTION private.reject_custom_request_event_mutation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER custom_request_events_append_only
BEFORE UPDATE OR DELETE ON private.custom_request_events
FOR EACH ROW EXECUTE FUNCTION private.reject_custom_request_event_mutation();

CREATE TRIGGER custom_request_events_append_only_truncate
BEFORE TRUNCATE ON private.custom_request_events
FOR EACH STATEMENT EXECUTE FUNCTION private.reject_custom_request_event_mutation();

CREATE OR REPLACE FUNCTION private.reject_trip_plan_id_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'trip plan id is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

ALTER FUNCTION private.reject_trip_plan_id_mutation() OWNER TO localens_request_guard_owner;
REVOKE ALL ON FUNCTION private.reject_trip_plan_id_mutation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trip_plans_request_id_immutable
BEFORE UPDATE OF id ON public.trip_plans
FOR EACH ROW EXECUTE FUNCTION private.reject_trip_plan_id_mutation();

CREATE OR REPLACE FUNCTION private.reject_custom_quote_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.request_id IS DISTINCT FROM NEW.request_id
     OR OLD.amount_vnd_minor IS DISTINCT FROM NEW.amount_vnd_minor
     OR OLD.checkout_currency IS DISTINCT FROM NEW.checkout_currency
     OR OLD.checkout_amount_minor IS DISTINCT FROM NEW.checkout_amount_minor
     OR OLD.catalog_snapshot_id IS DISTINCT FROM NEW.catalog_snapshot_id
     OR OLD.travel_snapshot_id IS DISTINCT FROM NEW.travel_snapshot_id
     OR OLD.fx_snapshot_id IS DISTINCT FROM NEW.fx_snapshot_id
     OR OLD.fx_vnd_per_usd IS DISTINCT FROM NEW.fx_vnd_per_usd
     OR OLD.title_en IS DISTINCT FROM NEW.title_en
     OR OLD.title_vi IS DISTINCT FROM NEW.title_vi
     OR OLD.policy IS DISTINCT FROM NEW.policy
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
     RAISE EXCEPTION 'custom quote commercial facts are immutable' USING ERRCODE = '42501';
  END IF;
  IF pg_catalog.current_setting('localens.quote_transition', true) IS DISTINCT FROM 'on'
     OR OLD.status IS NOT DISTINCT FROM NEW.status
     OR NOT (
       (OLD.status = 'active'::public.quote_status
         AND NEW.status IN (
           'checkout_pending'::public.quote_status,
           'expired'::public.quote_status,
           'revoked'::public.quote_status
         ))
       OR
       (OLD.status = 'checkout_pending'::public.quote_status
         AND NEW.status IN (
           'accepted'::public.quote_status,
           'active'::public.quote_status,
           'expired'::public.quote_status,
           'revoked'::public.quote_status
         ))
     ) THEN
    RAISE EXCEPTION 'custom quote state transition is invalid' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

ALTER FUNCTION private.reject_custom_quote_mutation() OWNER TO localens_request_guard_owner;
REVOKE ALL ON FUNCTION private.reject_custom_quote_mutation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER custom_quotes_immutable_facts
BEFORE UPDATE ON public.custom_quotes
FOR EACH ROW EXECUTE FUNCTION private.reject_custom_quote_mutation();

CREATE OR REPLACE FUNCTION private.reject_custom_quote_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'custom quote rows are immutable except guarded state' USING ERRCODE = '42501';
END;
$function$;

ALTER FUNCTION private.reject_custom_quote_delete() OWNER TO localens_request_guard_owner;
REVOKE ALL ON FUNCTION private.reject_custom_quote_delete() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER custom_quotes_immutable_delete
BEFORE DELETE ON public.custom_quotes
FOR EACH ROW EXECUTE FUNCTION private.reject_custom_quote_delete();

CREATE OR REPLACE FUNCTION private.reject_custom_quote_truncate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'custom quote rows are immutable except guarded state' USING ERRCODE = '42501';
END;
$function$;

ALTER FUNCTION private.reject_custom_quote_truncate() OWNER TO localens_request_guard_owner;
REVOKE ALL ON FUNCTION private.reject_custom_quote_truncate() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER custom_quotes_append_only_truncate
BEFORE TRUNCATE ON public.custom_quotes
FOR EACH STATEMENT EXECUTE FUNCTION private.reject_custom_quote_truncate();

CREATE OR REPLACE FUNCTION private.guard_custom_request_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM 'draft'::public.request_status
     OR NEW.latest_decision_at IS NOT NULL THEN
    RAISE EXCEPTION 'custom request must start in draft' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

ALTER FUNCTION private.guard_custom_request_insert() OWNER TO localens_request_guard_owner;
REVOKE ALL ON FUNCTION private.guard_custom_request_insert() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER custom_requests_state_machine_insert
BEFORE INSERT ON public.custom_requests
FOR EACH ROW EXECUTE FUNCTION private.guard_custom_request_insert();

CREATE OR REPLACE FUNCTION private.guard_custom_request_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.plan_id IS DISTINCT FROM NEW.plan_id
     OR OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR pg_catalog.current_setting('localens.request_transition', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'custom request facts are immutable' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    (OLD.status = 'draft'::public.request_status
      AND NEW.status = 'pending_review'::public.request_status)
    OR
    (OLD.status = 'changes_requested'::public.request_status
      AND NEW.status = 'pending_review'::public.request_status)
    OR
    (OLD.status = 'pending_review'::public.request_status
      AND NEW.status IN (
        'changes_requested'::public.request_status,
        'approved'::public.request_status,
        'rejected'::public.request_status
      ))
  ) THEN
    RAISE EXCEPTION 'custom request state transition is invalid' USING ERRCODE = '42501';
  END IF;
  IF (OLD.revision_id IS DISTINCT FROM NEW.revision_id
      OR OLD.revision_no IS DISTINCT FROM NEW.revision_no)
     AND NOT (
       OLD.status = 'changes_requested'::public.request_status
       AND NEW.status = 'pending_review'::public.request_status
     ) THEN
    RAISE EXCEPTION 'custom request revision is immutable' USING ERRCODE = '42501';
  END IF;
  IF OLD.submitted_at IS DISTINCT FROM NEW.submitted_at
     AND NEW.status NOT IN ('pending_review'::public.request_status) THEN
    RAISE EXCEPTION 'custom request submitted time is immutable' USING ERRCODE = '42501';
  END IF;
  IF OLD.latest_decision_at IS DISTINCT FROM NEW.latest_decision_at
     AND OLD.status <> 'pending_review'::public.request_status THEN
    RAISE EXCEPTION 'custom request decision time is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

ALTER FUNCTION private.guard_custom_request_mutation() OWNER TO localens_request_guard_owner;
REVOKE ALL ON FUNCTION private.guard_custom_request_mutation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER custom_requests_immutable_facts
BEFORE UPDATE ON public.custom_requests
FOR EACH ROW EXECUTE FUNCTION private.guard_custom_request_mutation();

CREATE OR REPLACE VIEW public.customer_custom_requests_v
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  requests.id,
  requests.plan_id,
  requests.revision_no,
  requests.status,
  pg_catalog.to_char(requests.submitted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS submitted_at,
  pg_catalog.to_char(requests.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
FROM public.custom_requests AS requests
WHERE requests.owner_user_id = NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid;

CREATE OR REPLACE VIEW public.admin_custom_request_queue_v
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  requests.id,
  requests.plan_id,
  requests.revision_no,
  requests.status,
  pg_catalog.to_char(requests.submitted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS submitted_at,
  pg_catalog.to_char(requests.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
  requests.owner_user_id,
  CASE
    WHEN requests.latest_decision_at IS NULL THEN NULL
    ELSE pg_catalog.to_char(requests.latest_decision_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  END AS latest_decision_at
FROM public.custom_requests AS requests
WHERE EXISTS (
  SELECT 1 FROM private.user_roles AS roles
  WHERE roles.user_id = NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid
    AND roles.role = 'admin'::public.app_role
);

CREATE OR REPLACE VIEW public.customer_custom_quotes_v
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  quotes.id,
  quotes.request_id,
  quotes.status,
  CASE WHEN owners.language = 'vi'::public.locale THEN quotes.title_vi ELSE quotes.title_en END AS title,
  quotes.amount_vnd_minor::text AS amount_vnd_minor,
  quotes.checkout_currency AS currency,
  quotes.checkout_amount_minor::text AS amount_minor,
  quotes.policy,
  pg_catalog.to_char(quotes.valid_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS valid_until
FROM public.custom_quotes AS quotes
JOIN public.custom_requests AS requests ON requests.id = quotes.request_id
JOIN public.profiles AS owners ON owners.id = requests.owner_user_id
WHERE requests.owner_user_id = NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid;

ALTER VIEW public.customer_custom_requests_v OWNER TO localens_request_customer_rpc_owner;
ALTER VIEW public.admin_custom_request_queue_v OWNER TO localens_request_admin_rpc_owner;
ALTER VIEW public.customer_custom_quotes_v OWNER TO localens_request_customer_rpc_owner;
REVOKE ALL ON public.customer_custom_requests_v, public.admin_custom_request_queue_v, public.customer_custom_quotes_v FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.customer_custom_requests_v, public.customer_custom_quotes_v TO authenticated;
GRANT SELECT ON public.admin_custom_request_queue_v TO authenticated;

-- Task 8 RPC owners never receive direct audit INSERT.  This closed helper is
-- owned by the existing identity owner and accepts only scalar, allowlisted
-- request/quote facts.
CREATE OR REPLACE FUNCTION private.record_request_quote_audit_event(
  p_event_type public.audit_event_type,
  p_actor_user_id uuid,
  p_actor_role public.app_role,
  p_target_type public.audit_target_type,
  p_target_id uuid,
  p_from_state text,
  p_to_state text,
  p_metadata_key public.audit_metadata_key,
  p_metadata_text text,
  p_metadata_number numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_event_type NOT IN (
       'request_submitted'::public.audit_event_type,
       'request_changes_requested'::public.audit_event_type,
       'request_approved'::public.audit_event_type,
       'request_rejected'::public.audit_event_type,
       'quote_created'::public.audit_event_type
     )
     OR p_actor_user_id IS NULL
     OR p_actor_role NOT IN ('customer'::public.app_role, 'admin'::public.app_role)
     OR p_target_type NOT IN ('custom_request'::public.audit_target_type, 'custom_quote'::public.audit_target_type)
     OR p_target_id IS NULL
     OR p_from_state IS NOT NULL AND p_from_state NOT IN ('draft', 'pending_review', 'changes_requested')
     OR p_to_state IS NULL OR p_to_state NOT IN ('pending_review', 'changes_requested', 'approved', 'rejected', 'active')
     OR p_metadata_key IS NULL
     OR p_metadata_key NOT IN ('revision'::public.audit_metadata_key, 'decision'::public.audit_metadata_key, 'currency'::public.audit_metadata_key, 'amount_minor'::public.audit_metadata_key)
     OR (p_metadata_key = 'decision'::public.audit_metadata_key AND p_metadata_text NOT IN ('changes_requested', 'approved', 'rejected'))
     OR (p_metadata_key = 'currency'::public.audit_metadata_key AND p_metadata_text NOT IN ('vnd', 'usd'))
     OR (p_metadata_key IN ('revision'::public.audit_metadata_key, 'amount_minor'::public.audit_metadata_key)
         AND (p_metadata_text IS NOT NULL OR p_metadata_number IS NULL OR p_metadata_number < 0 OR p_metadata_number > 9007199254740991 OR p_metadata_number <> trunc(p_metadata_number)))
     OR (p_metadata_key IN ('decision'::public.audit_metadata_key, 'currency'::public.audit_metadata_key)
         AND (p_metadata_number IS NOT NULL OR p_metadata_text IS NULL)) THEN
    RAISE EXCEPTION 'request quote audit rejected' USING ERRCODE = '42501';
  END IF;
  INSERT INTO private.audit_events (
    event_type, actor_user_id, actor_role, target_type, target_id,
    from_state, to_state, metadata_key, metadata_text, metadata_number
  ) VALUES (
    p_event_type, p_actor_user_id, p_actor_role, p_target_type, p_target_id,
    p_from_state, p_to_state, p_metadata_key, p_metadata_text, p_metadata_number
  );
END;
$function$;

ALTER FUNCTION private.record_request_quote_audit_event(
  public.audit_event_type, uuid, public.app_role, public.audit_target_type,
  uuid, text, text, public.audit_metadata_key, text, numeric
) OWNER TO localens_identity_rpc_owner;
SET LOCAL ROLE localens_identity_rpc_owner;
REVOKE ALL ON FUNCTION private.record_request_quote_audit_event(
  public.audit_event_type, uuid, public.app_role, public.audit_target_type,
  uuid, text, text, public.audit_metadata_key, text, numeric
) FROM PUBLIC, anon, authenticated, localens_guest_executor, localens_quota_executor;
GRANT EXECUTE ON FUNCTION private.record_request_quote_audit_event(
  public.audit_event_type, uuid, public.app_role, public.audit_target_type,
  uuid, text, text, public.audit_metadata_key, text, numeric
) TO localens_request_customer_rpc_owner, localens_request_admin_rpc_owner;
RESET ROLE;
SET LOCAL ROLE postgres;

-- Internal implementation.  The actor is always read from the JWT subject; no
-- caller-provided owner/admin identity reaches the state-changing code.
CREATE OR REPLACE FUNCTION private.submit_custom_request(
  p_plan_id uuid,
  p_revision_no integer
)
RETURNS TABLE (request_id uuid, status public.request_status)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor_user_id uuid;
  plan_row public.trip_plans%ROWTYPE;
  revision_row public.trip_plan_revisions%ROWTYPE;
  request_row public.custom_requests%ROWTYPE;
  transition_at timestamptz;
BEGIN
  actor_user_id := NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid;
  IF actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM private.user_roles
    WHERE user_id = actor_user_id AND role = 'customer'::public.app_role
  ) THEN
    RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001';
  END IF;
  IF p_plan_id IS NULL OR p_revision_no IS NULL OR p_revision_no < 1 THEN
    RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO plan_row
  FROM public.trip_plans
  WHERE trip_plans.id = p_plan_id
  FOR UPDATE;
  IF NOT FOUND OR plan_row.owner_user_id IS DISTINCT FROM actor_user_id THEN
    RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO revision_row
  FROM public.trip_plan_revisions
  WHERE trip_plan_revisions.id IS NOT NULL AND trip_plan_revisions.plan_id = p_plan_id
    AND trip_plan_revisions.revision_no = p_revision_no
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO request_row
  FROM public.custom_requests
  WHERE custom_requests.plan_id = p_plan_id
    AND custom_requests.status IN ('draft', 'pending_review', 'changes_requested', 'approved')
  ORDER BY custom_requests.id
  LIMIT 1
  FOR UPDATE;
  transition_at := pg_catalog.clock_timestamp();

  IF FOUND AND (
    request_row.status <> 'changes_requested'::public.request_status
     OR request_row.owner_user_id IS DISTINCT FROM actor_user_id
     OR p_revision_no <= request_row.revision_no
  ) THEN
    RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001';
  END IF;

  IF FOUND THEN
    PERFORM pg_catalog.set_config('localens.request_transition', 'on', true);
    UPDATE public.custom_requests
    SET revision_id = revision_row.id,
        revision_no = revision_row.revision_no,
        status = 'pending_review'::public.request_status,
        submitted_at = transition_at,
        updated_at = transition_at
    WHERE custom_requests.id = request_row.id;
    INSERT INTO private.custom_request_events (
      request_id, revision_id, revision_no, actor_user_id, actor_role,
      event_type, from_state, to_state, created_at
    ) VALUES (
      request_row.id, revision_row.id, revision_row.revision_no, actor_user_id,
      'customer'::public.app_role,
      'request_submitted'::public.audit_event_type, request_row.status,
      'pending_review'::public.request_status, transition_at
    );
    request_id := request_row.id;
  ELSE
    BEGIN
      INSERT INTO public.custom_requests (
        plan_id, revision_id, revision_no, owner_user_id, status, submitted_at, updated_at, created_at
      ) VALUES (
        p_plan_id, revision_row.id, revision_row.revision_no, actor_user_id,
        'draft'::public.request_status, transition_at, transition_at, transition_at
      ) RETURNING id INTO request_id;
      -- There is no public draft-creation operation.  Insert draft and advance
      -- it under the same plan/request lock and transaction.
      PERFORM pg_catalog.set_config('localens.request_transition', 'on', true);
      UPDATE public.custom_requests
      SET status = 'pending_review'::public.request_status,
          updated_at = transition_at
      WHERE custom_requests.id = request_id;
      INSERT INTO private.custom_request_events (
        request_id, revision_id, revision_no, actor_user_id, actor_role,
        event_type, from_state, to_state, created_at
      ) VALUES (
        request_id, revision_row.id, revision_row.revision_no, actor_user_id,
        'customer'::public.app_role,
        'request_submitted'::public.audit_event_type, 'draft'::public.request_status,
        'pending_review'::public.request_status, transition_at
      );
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001';
    END;
  END IF;

  PERFORM private.record_request_quote_audit_event(
    'request_submitted'::public.audit_event_type, actor_user_id, 'customer'::public.app_role,
    'custom_request'::public.audit_target_type, request_id,
    CASE WHEN request_row.id IS NULL THEN 'draft' ELSE request_row.status::text END,
    'pending_review', 'revision'::public.audit_metadata_key, NULL, revision_row.revision_no
  );
  status := 'pending_review'::public.request_status;
  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_custom_request(
  plan_id uuid,
  revision_no integer
)
RETURNS TABLE (request_id uuid, status public.request_status)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY SELECT submitted.request_id, submitted.status
  FROM private.submit_custom_request(plan_id, revision_no) AS submitted;
END;
$function$;

CREATE OR REPLACE FUNCTION private.review_custom_request(
  p_request_id uuid,
  p_decision public.request_status,
  p_note text
)
RETURNS TABLE (reviewed_request_id uuid, status public.request_status)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor_user_id uuid;
  request_row public.custom_requests%ROWTYPE;
  transition_at timestamptz;
  event_type public.audit_event_type;
BEGIN
  actor_user_id := NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid;
  IF actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM private.user_roles
    WHERE user_id = actor_user_id AND role = 'admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001';
  END IF;
  IF p_request_id IS NULL OR p_decision NOT IN (
    'changes_requested'::public.request_status,
    'approved'::public.request_status,
    'rejected'::public.request_status
  ) OR (p_note IS NOT NULL AND (length(btrim(p_note)) < 1 OR length(p_note) > 1000 OR p_note <> btrim(p_note) OR p_note ~ '[[:cntrl:]]'))
     OR (p_decision IN ('changes_requested'::public.request_status, 'rejected'::public.request_status) AND p_note IS NULL)
     OR (p_decision = 'approved'::public.request_status AND p_note IS NOT NULL) THEN
    RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO request_row
  FROM public.custom_requests
  WHERE custom_requests.id = p_request_id
  FOR UPDATE;
  IF NOT FOUND OR request_row.status <> 'pending_review'::public.request_status THEN
    RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001';
  END IF;
  transition_at := pg_catalog.clock_timestamp();
  event_type := CASE p_decision
    WHEN 'changes_requested'::public.request_status THEN 'request_changes_requested'::public.audit_event_type
    WHEN 'approved'::public.request_status THEN 'request_approved'::public.audit_event_type
    ELSE 'request_rejected'::public.audit_event_type
  END;

  PERFORM pg_catalog.set_config('localens.request_transition', 'on', true);
  UPDATE public.custom_requests
  SET status = p_decision, latest_decision_at = transition_at, updated_at = transition_at
  WHERE custom_requests.id = request_row.id;
  INSERT INTO private.custom_request_events (
    request_id, revision_id, revision_no, actor_user_id, actor_role,
    event_type, from_state, to_state, note, created_at
  ) VALUES (
    request_row.id, request_row.revision_id, request_row.revision_no,
    actor_user_id, 'admin'::public.app_role, event_type,
    request_row.status, p_decision, p_note, transition_at
  );
  PERFORM private.record_request_quote_audit_event(
    event_type, actor_user_id, 'admin'::public.app_role,
    'custom_request'::public.audit_target_type, request_row.id,
    request_row.status::text, p_decision::text, 'decision'::public.audit_metadata_key, p_decision::text, NULL
  );
  reviewed_request_id := request_row.id;
  status := p_decision;
  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.review_custom_request(
  request_id uuid,
  decision public.request_status,
  note text
)
RETURNS TABLE (reviewed_request_id uuid, status public.request_status)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY SELECT reviewed.reviewed_request_id, reviewed.status
  FROM private.review_custom_request(request_id, decision, note) AS reviewed;
END;
$function$;

CREATE OR REPLACE FUNCTION private.create_custom_quote(
  p_request_id uuid,
  p_amount_vnd_minor bigint,
  p_checkout_currency public.checkout_currency,
  p_title_en text,
  p_title_vi text,
  p_policy text
)
RETURNS TABLE (quote_id uuid, status public.quote_status, valid_until timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor_user_id uuid;
  plan_row public.trip_plans%ROWTYPE;
  request_row public.custom_requests%ROWTYPE;
  revision_row public.trip_plan_revisions%ROWTYPE;
  existing_quote public.custom_quotes%ROWTYPE;
  fx_row public.fx_snapshots%ROWTYPE;
  checkout_amount numeric;
  created_quote public.custom_quotes%ROWTYPE;
  selection_time timestamptz;
  authority_time timestamptz;
BEGIN
  actor_user_id := NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid;
  IF actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM private.user_roles
    WHERE user_id = actor_user_id AND role = 'admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001';
  END IF;
  IF p_request_id IS NULL OR p_amount_vnd_minor IS NULL OR p_amount_vnd_minor < 1
     OR p_amount_vnd_minor > 9007199254740991
     OR p_checkout_currency IS NULL
     OR p_title_en IS NULL OR length(btrim(p_title_en)) NOT BETWEEN 1 AND 240 OR p_title_en ~ '[[:cntrl:]]'
     OR p_title_vi IS NULL OR length(btrim(p_title_vi)) NOT BETWEEN 1 AND 240 OR p_title_vi ~ '[[:cntrl:]]'
     OR p_policy IS NULL OR length(btrim(p_policy)) NOT BETWEEN 1 AND 4000 OR p_policy ~ '[[:cntrl:]]'
     OR p_title_en <> btrim(p_title_en) OR p_title_vi <> btrim(p_title_vi) OR p_policy <> btrim(p_policy) THEN
    RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001';
  END IF;

  -- Source locks follow the submitter's plan -> revision -> request -> quote
  -- order.  The first request read is deliberately non-locking; the row is
  -- re-read and revalidated after the source locks are held.
  SELECT * INTO request_row
  FROM public.custom_requests
  WHERE custom_requests.id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO plan_row
  FROM public.trip_plans
  WHERE trip_plans.id = request_row.plan_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO revision_row
  FROM public.trip_plan_revisions
  WHERE trip_plan_revisions.id = request_row.revision_id
  FOR UPDATE;
  IF NOT FOUND OR revision_row.plan_id IS DISTINCT FROM request_row.plan_id
     OR revision_row.revision_no IS DISTINCT FROM request_row.revision_no THEN
    RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO request_row
  FROM public.custom_requests
  WHERE custom_requests.id = p_request_id
  FOR UPDATE;
  IF NOT FOUND OR request_row.status <> 'approved'::public.request_status
     OR request_row.plan_id IS DISTINCT FROM plan_row.id
     OR request_row.revision_id IS DISTINCT FROM revision_row.id
     OR request_row.revision_no IS DISTINCT FROM revision_row.revision_no THEN
    RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001';
  END IF;

  -- The request lock precedes the dependent quote lock.  Later checkout
  -- extends this order with idempotency and booking locks.
  SELECT * INTO existing_quote
  FROM public.custom_quotes
  WHERE custom_quotes.request_id = request_row.id
    AND custom_quotes.status IN ('active', 'checkout_pending')
  ORDER BY custom_quotes.id
  LIMIT 1
  FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001';
  END IF;

  -- Sample authority time only after every source row lock so valid_until is
  -- exactly 48 hours from the server-owned quote creation instant.
  authority_time := pg_catalog.clock_timestamp();

  IF p_checkout_currency = 'usd'::public.checkout_currency THEN
    selection_time := authority_time;
    SELECT * INTO fx_row
    FROM public.fx_snapshots
    WHERE environment = 'demo'
      AND is_demo = true
      AND observed_at <= selection_time
      AND observed_at >= selection_time - interval '7 days'
    ORDER BY observed_at DESC, id DESC
    LIMIT 1
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001';
    END IF;
    authority_time := pg_catalog.clock_timestamp();
    IF fx_row.observed_at > authority_time
       OR fx_row.observed_at < authority_time - interval '7 days' THEN
      RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001';
    END IF;
    checkout_amount := ceil(p_amount_vnd_minor::numeric * 100 / fx_row.vnd_per_usd);
  ELSE
    checkout_amount := p_amount_vnd_minor::numeric;
  END IF;
  IF checkout_amount < 0 OR checkout_amount > 9007199254740991 OR checkout_amount <> trunc(checkout_amount) THEN
    RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    INSERT INTO public.custom_quotes (
      request_id, status, amount_vnd_minor, checkout_currency, checkout_amount_minor,
      catalog_snapshot_id, travel_snapshot_id, fx_snapshot_id, fx_vnd_per_usd,
      title_en, title_vi, policy, created_at
    ) VALUES (
      request_row.id, 'active'::public.quote_status, p_amount_vnd_minor, p_checkout_currency,
      checkout_amount::bigint, revision_row.catalog_snapshot_id, revision_row.travel_snapshot_id,
      CASE WHEN p_checkout_currency = 'usd'::public.checkout_currency THEN fx_row.id ELSE NULL END,
      CASE WHEN p_checkout_currency = 'usd'::public.checkout_currency THEN fx_row.vnd_per_usd ELSE NULL END,
      p_title_en, p_title_vi, p_policy, authority_time
    ) RETURNING * INTO created_quote;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001';
  END;

  PERFORM private.record_request_quote_audit_event(
    'quote_created'::public.audit_event_type, actor_user_id, 'admin'::public.app_role,
    'custom_quote'::public.audit_target_type, created_quote.id,
    NULL, 'active', 'currency'::public.audit_metadata_key, p_checkout_currency::text, NULL
  );
  PERFORM private.record_request_quote_audit_event(
    'quote_created'::public.audit_event_type, actor_user_id, 'admin'::public.app_role,
    'custom_quote'::public.audit_target_type, created_quote.id,
    NULL, 'active', 'amount_minor'::public.audit_metadata_key, NULL, created_quote.checkout_amount_minor
  );
  quote_id := created_quote.id;
  status := created_quote.status;
  valid_until := created_quote.valid_until;
  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_custom_quote(
  request_id uuid,
  amount_vnd_minor bigint,
  checkout_currency public.checkout_currency,
  title_en text,
  title_vi text,
  policy text
)
RETURNS TABLE (quote_id uuid, status public.quote_status, valid_until timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY SELECT created.quote_id, created.status, created.valid_until
  FROM private.create_custom_quote(request_id, amount_vnd_minor, checkout_currency, title_en, title_vi, policy) AS created;
END;
$function$;

ALTER FUNCTION private.submit_custom_request(uuid, integer) OWNER TO localens_request_customer_rpc_owner;
ALTER FUNCTION public.submit_custom_request(uuid, integer) OWNER TO localens_request_customer_rpc_owner;
ALTER FUNCTION private.review_custom_request(uuid, public.request_status, text) OWNER TO localens_request_admin_rpc_owner;
ALTER FUNCTION public.review_custom_request(uuid, public.request_status, text) OWNER TO localens_request_admin_rpc_owner;
ALTER FUNCTION private.create_custom_quote(uuid, bigint, public.checkout_currency, text, text, text) OWNER TO localens_request_admin_rpc_owner;
ALTER FUNCTION public.create_custom_quote(uuid, bigint, public.checkout_currency, text, text, text) OWNER TO localens_request_admin_rpc_owner;

REVOKE ALL ON FUNCTION private.submit_custom_request(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_custom_request(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.review_custom_request(uuid, public.request_status, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_custom_request(uuid, public.request_status, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.create_custom_quote(uuid, bigint, public.checkout_currency, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_custom_quote(uuid, bigint, public.checkout_currency, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.submit_custom_request(uuid, integer) TO localens_request_customer_rpc_owner;
GRANT EXECUTE ON FUNCTION private.review_custom_request(uuid, public.request_status, text) TO localens_request_admin_rpc_owner;
GRANT EXECUTE ON FUNCTION private.create_custom_quote(uuid, bigint, public.checkout_currency, text, text, text) TO localens_request_admin_rpc_owner;
GRANT EXECUTE ON FUNCTION public.submit_custom_request(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_custom_request(uuid, public.request_status, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_custom_quote(uuid, bigint, public.checkout_currency, text, text, text) TO authenticated;

GRANT USAGE ON SCHEMA public, private TO localens_request_customer_rpc_owner, localens_request_admin_rpc_owner;
GRANT USAGE ON SCHEMA public TO localens_request_guard_owner;
GRANT SELECT, INSERT ON TABLE public.custom_requests TO localens_request_customer_rpc_owner;
GRANT UPDATE (revision_id, revision_no, status, submitted_at, updated_at)
  ON TABLE public.custom_requests TO localens_request_customer_rpc_owner;
GRANT SELECT ON TABLE public.custom_requests TO localens_request_admin_rpc_owner;
GRANT UPDATE (status, latest_decision_at, updated_at)
  ON TABLE public.custom_requests TO localens_request_admin_rpc_owner;
GRANT INSERT ON TABLE private.custom_request_events TO localens_request_customer_rpc_owner, localens_request_admin_rpc_owner;
GRANT SELECT ON TABLE public.custom_quotes TO localens_request_customer_rpc_owner;
GRANT SELECT, INSERT ON TABLE public.custom_quotes TO localens_request_admin_rpc_owner;
GRANT UPDATE (id) ON TABLE public.custom_quotes TO localens_request_admin_rpc_owner;
GRANT SELECT ON TABLE public.trip_plans, public.trip_plan_revisions
  TO localens_request_customer_rpc_owner;
GRANT UPDATE (id) ON TABLE public.trip_plans TO localens_request_customer_rpc_owner;
GRANT UPDATE (id) ON TABLE public.trip_plan_revisions TO localens_request_customer_rpc_owner;
GRANT SELECT ON TABLE public.trip_plans, public.trip_plan_revisions,
  public.fx_snapshots TO localens_request_admin_rpc_owner;
GRANT UPDATE (id) ON TABLE public.trip_plans TO localens_request_admin_rpc_owner;
GRANT UPDATE (id) ON TABLE public.trip_plan_revisions TO localens_request_admin_rpc_owner;
GRANT UPDATE (id) ON TABLE public.fx_snapshots TO localens_request_admin_rpc_owner;
GRANT SELECT ON TABLE private.user_roles TO localens_request_customer_rpc_owner, localens_request_admin_rpc_owner;
GRANT SELECT (id, language) ON TABLE public.profiles TO localens_request_customer_rpc_owner;

REVOKE ALL ON TABLE public.custom_requests, public.custom_quotes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.custom_request_events FROM PUBLIC, anon, authenticated;
REVOKE INSERT ON TABLE private.audit_events FROM localens_request_customer_rpc_owner, localens_request_admin_rpc_owner;

REVOKE CREATE ON SCHEMA private FROM localens_identity_rpc_owner, localens_request_customer_rpc_owner, localens_request_admin_rpc_owner, localens_request_guard_owner;
REVOKE CREATE ON SCHEMA public FROM localens_request_customer_rpc_owner, localens_request_admin_rpc_owner;

COMMIT;
