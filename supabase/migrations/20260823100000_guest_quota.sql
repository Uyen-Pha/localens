BEGIN;

-- Task 7 owns the anonymous capability boundary.  The browser supplies only
-- an Edge-generated HMAC digest; raw guest tokens are not a SQL input.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_guest_rpc_owner') THEN
    CREATE ROLE localens_guest_rpc_owner NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_claim_rpc_owner') THEN
    CREATE ROLE localens_claim_rpc_owner NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_quota_rpc_owner') THEN
    CREATE ROLE localens_quota_rpc_owner NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_guest_executor') THEN
    CREATE ROLE localens_guest_executor LOGIN NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_quota_executor') THEN
    CREATE ROLE localens_quota_executor LOGIN NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_webhook_executor') THEN
    CREATE ROLE localens_webhook_executor NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_build_executor') THEN
    CREATE ROLE localens_build_executor NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END
$roles$;

ALTER ROLE localens_guest_rpc_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS;
ALTER ROLE localens_claim_rpc_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS;
ALTER ROLE localens_quota_rpc_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS;
ALTER ROLE localens_guest_executor NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION LOGIN NOBYPASSRLS;
ALTER ROLE localens_quota_executor NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION LOGIN NOBYPASSRLS;
ALTER ROLE localens_webhook_executor NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS;
ALTER ROLE localens_build_executor NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS;

-- Identity migrations must not inherit authority through stale role
-- memberships. Scrub every edge whose parent or member is a protected owner
-- or executor, including memberships created before the Task 6 plan owner was
-- introduced. The catalog query is intentionally dynamic so newly-added
-- protected roles cannot retain an arbitrary inherited grant.
DO $membership$
DECLARE
  protected_roles constant text[] := ARRAY[
    'localens_auth_trigger_owner', 'localens_identity_rpc_owner',
    'localens_admin_rpc_owner', 'localens_audit_guard_owner',
    'localens_catalog_rpc_owner', 'localens_catalog_guard_owner',
    'localens_tour_rpc_owner', 'localens_tour_guard_owner',
    'localens_plan_rpc_owner', 'localens_plan_guard_owner',
    'localens_guest_rpc_owner', 'localens_claim_rpc_owner',
    'localens_quota_rpc_owner', 'localens_guest_executor',
    'localens_quota_executor', 'localens_webhook_executor',
    'localens_build_executor'
  ];
  membership_record record;
BEGIN
  FOR membership_record IN
    SELECT parent_role.rolname AS parent_name, member_role.rolname AS member_name
    FROM pg_catalog.pg_auth_members AS memberships
    JOIN pg_catalog.pg_roles AS parent_role ON parent_role.oid = memberships.roleid
    JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = memberships.member
    WHERE parent_role.rolname = ANY(protected_roles)
       OR member_role.rolname = ANY(protected_roles)
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE %I FROM %I',
      membership_record.parent_name,
      membership_record.member_name
    );
  END LOOP;
END
$membership$;

REVOKE ALL ON SCHEMA public, private, auth FROM localens_guest_rpc_owner, localens_claim_rpc_owner, localens_quota_rpc_owner, localens_guest_executor, localens_quota_executor;
REVOKE ALL ON ALL TABLES IN SCHEMA public, private, auth FROM localens_guest_rpc_owner, localens_claim_rpc_owner, localens_quota_rpc_owner, localens_guest_executor, localens_quota_executor;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA private, public FROM localens_guest_rpc_owner, localens_claim_rpc_owner, localens_quota_rpc_owner, localens_guest_executor, localens_quota_executor;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public, private, auth FROM localens_guest_rpc_owner, localens_claim_rpc_owner, localens_quota_rpc_owner, localens_guest_executor, localens_quota_executor;

CREATE TABLE private.guest_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.trip_plans(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  expires_at timestamptz NOT NULL DEFAULT (pg_catalog.clock_timestamp() + INTERVAL '24 hours'),
  claimed_at timestamptz,
  claimed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CHECK (expires_at > created_at),
  CHECK ((claimed_at IS NULL AND claimed_by IS NULL) OR (claimed_at IS NOT NULL AND claimed_by IS NOT NULL)),
  UNIQUE (plan_id)
);

CREATE TABLE private.guest_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  binding_id uuid NOT NULL,
  token_hash text NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  pepper_version smallint NOT NULL CHECK (pepper_version BETWEEN 1 AND 2),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  UNIQUE (token_hash)
);

CREATE UNIQUE INDEX guest_capabilities_one_active_plan
  ON private.guest_capabilities (binding_id)
  WHERE revoked_at IS NULL;

CREATE TABLE private.quota_buckets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_kind text NOT NULL CHECK (bucket_kind IN ('planner_ip', 'planner_device', 'gemini_ip', 'gemini_device')),
  bucket_hash text NOT NULL CHECK (bucket_hash ~ '^[0-9a-f]{64}$'),
  period_start timestamptz NOT NULL,
  used_count integer NOT NULL DEFAULT 0,
  limit_count integer NOT NULL CHECK (limit_count IN (5, 30)),
  CHECK (used_count BETWEEN 0 AND limit_count),
  UNIQUE (bucket_kind, bucket_hash, period_start)
);

CREATE TABLE private.quota_global_buckets (
  period_start timestamptz PRIMARY KEY,
  used_count integer NOT NULL DEFAULT 0,
  limit_count integer NOT NULL DEFAULT 100 CHECK (limit_count = 100),
  CHECK (used_count BETWEEN 0 AND limit_count),
  UNIQUE (period_start)
);

CREATE TABLE private.quota_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('planner', 'gemini')),
  bucket_hashes text[] NOT NULL,
  period_start timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CHECK (cardinality(bucket_hashes) = 2),
  CHECK (bucket_hashes[1] <> bucket_hashes[2]),
  CHECK (bucket_hashes[1] ~ '^[0-9a-f]{64}$' AND bucket_hashes[2] ~ '^[0-9a-f]{64}$'),
  UNIQUE (reservation_id)
);

-- A reservation is the immutable idempotency receipt for one provider
-- attempt.  Counters may change, but the receipt itself cannot be edited,
-- deleted, or truncated by any role.
CREATE OR REPLACE FUNCTION private.reject_quota_reservation_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'quota reservations are append-only' USING ERRCODE = '42501';
END;
$function$;
ALTER FUNCTION private.reject_quota_reservation_mutation() OWNER TO localens_quota_rpc_owner;
REVOKE ALL ON FUNCTION private.reject_quota_reservation_mutation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER quota_reservations_append_only_update_delete
  BEFORE UPDATE OR DELETE ON private.quota_reservations
  FOR EACH ROW EXECUTE FUNCTION private.reject_quota_reservation_mutation();
CREATE TRIGGER quota_reservations_append_only_truncate
  BEFORE TRUNCATE ON private.quota_reservations
  FOR EACH STATEMENT EXECUTE FUNCTION private.reject_quota_reservation_mutation();

-- Both edges are deliberately DEFERRABLE: creation inserts the plan, then its
-- binding, then fills the plan FK before commit.  The binding is the
-- authoritative owner of the relationship; the plan column is a guarded
-- reverse lookup, never an authorization shortcut.
ALTER TABLE public.trip_plans
  ADD CONSTRAINT trip_plans_guest_binding_fk
  FOREIGN KEY (guest_binding_id) REFERENCES private.guest_bindings(id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE private.guest_capabilities
  ADD CONSTRAINT guest_capabilities_binding_fk
  FOREIGN KEY (binding_id) REFERENCES private.guest_bindings(id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE private.guest_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.guest_bindings FORCE ROW LEVEL SECURITY;
ALTER TABLE private.guest_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.guest_capabilities FORCE ROW LEVEL SECURITY;
ALTER TABLE private.quota_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.quota_buckets FORCE ROW LEVEL SECURITY;
ALTER TABLE private.quota_global_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.quota_global_buckets FORCE ROW LEVEL SECURITY;
ALTER TABLE private.quota_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.quota_reservations FORCE ROW LEVEL SECURITY;

-- Definer owners have explicit policies because all five tables are FORCE RLS.
-- There are intentionally no anon/authenticated policies.
CREATE POLICY guest_bindings_guest_owner_all ON private.guest_bindings
  FOR ALL TO localens_guest_rpc_owner
  USING (current_user = 'localens_guest_rpc_owner')
  WITH CHECK (current_user = 'localens_guest_rpc_owner');
CREATE POLICY guest_capabilities_guest_owner_all ON private.guest_capabilities
  FOR ALL TO localens_guest_rpc_owner
  USING (current_user = 'localens_guest_rpc_owner')
  WITH CHECK (current_user = 'localens_guest_rpc_owner');
CREATE POLICY quota_buckets_quota_owner_all ON private.quota_buckets
  FOR ALL TO localens_quota_rpc_owner
  USING (current_user = 'localens_quota_rpc_owner')
  WITH CHECK (current_user = 'localens_quota_rpc_owner');
CREATE POLICY quota_global_quota_owner_all ON private.quota_global_buckets
  FOR ALL TO localens_quota_rpc_owner
  USING (current_user = 'localens_quota_rpc_owner')
  WITH CHECK (current_user = 'localens_quota_rpc_owner');
CREATE POLICY quota_reservations_quota_owner_select ON private.quota_reservations
  FOR SELECT TO localens_quota_rpc_owner
  USING (current_user = 'localens_quota_rpc_owner');
CREATE POLICY quota_reservations_quota_owner_insert ON private.quota_reservations
  FOR INSERT TO localens_quota_rpc_owner
  WITH CHECK (current_user = 'localens_quota_rpc_owner');

CREATE POLICY guest_bindings_claim_owner_select ON private.guest_bindings
  FOR SELECT TO localens_claim_rpc_owner
  USING (current_user = 'localens_claim_rpc_owner');
CREATE POLICY guest_bindings_claim_owner_update ON private.guest_bindings
  FOR UPDATE TO localens_claim_rpc_owner
  USING (current_user = 'localens_claim_rpc_owner')
  WITH CHECK (current_user = 'localens_claim_rpc_owner');
CREATE POLICY guest_capabilities_claim_owner_select ON private.guest_capabilities
  FOR SELECT TO localens_claim_rpc_owner
  USING (current_user = 'localens_claim_rpc_owner');
CREATE POLICY guest_capabilities_claim_owner_update ON private.guest_capabilities
  FOR UPDATE TO localens_claim_rpc_owner
  USING (current_user = 'localens_claim_rpc_owner')
  WITH CHECK (current_user = 'localens_claim_rpc_owner');

CREATE POLICY trip_plans_claim_owner_select ON public.trip_plans
  FOR SELECT TO localens_claim_rpc_owner
  USING (current_user = 'localens_claim_rpc_owner');
CREATE POLICY trip_plans_claim_owner_update ON public.trip_plans
  FOR UPDATE TO localens_claim_rpc_owner
  USING (current_user = 'localens_claim_rpc_owner')
  WITH CHECK (current_user = 'localens_claim_rpc_owner');

CREATE POLICY trip_plans_guest_owner_all ON public.trip_plans
  FOR ALL TO localens_guest_rpc_owner
  USING (current_user = 'localens_guest_rpc_owner')
  WITH CHECK (current_user = 'localens_guest_rpc_owner');
CREATE POLICY trip_plan_revisions_guest_owner_all ON public.trip_plan_revisions
  FOR ALL TO localens_guest_rpc_owner
  USING (current_user = 'localens_guest_rpc_owner')
  WITH CHECK (current_user = 'localens_guest_rpc_owner');
CREATE POLICY trip_plan_items_guest_owner_all ON public.trip_plan_items
  FOR ALL TO localens_guest_rpc_owner
  USING (current_user = 'localens_guest_rpc_owner')
  WITH CHECK (current_user = 'localens_guest_rpc_owner');
CREATE POLICY recommendation_runs_guest_owner_all ON private.recommendation_runs
  FOR ALL TO localens_guest_rpc_owner
  USING (current_user = 'localens_guest_rpc_owner')
  WITH CHECK (current_user = 'localens_guest_rpc_owner');

CREATE POLICY guest_owner_guest_binding_plan_read ON private.guest_bindings
  FOR SELECT TO localens_plan_rpc_owner USING (true);
CREATE POLICY guest_owner_guest_capability_plan_read ON private.guest_capabilities
  FOR SELECT TO localens_plan_rpc_owner USING (true);
CREATE POLICY guest_owner_quota_plan_denied ON private.quota_buckets
  FOR ALL TO localens_plan_rpc_owner USING (false) WITH CHECK (false);
CREATE POLICY user_roles_claim_rpc_select ON private.user_roles
  FOR SELECT TO localens_claim_rpc_owner
  USING (current_user = 'localens_claim_rpc_owner');

GRANT USAGE ON SCHEMA public, private TO localens_guest_rpc_owner, localens_claim_rpc_owner, localens_quota_rpc_owner;
GRANT USAGE ON SCHEMA auth TO localens_guest_rpc_owner, localens_claim_rpc_owner;
GRANT USAGE ON SCHEMA private TO localens_guest_executor, localens_quota_executor;
GRANT SELECT, INSERT ON TABLE public.trip_plans TO localens_guest_rpc_owner;
GRANT UPDATE (guest_binding_id, latest_revision_no, owner_user_id) ON TABLE public.trip_plans TO localens_guest_rpc_owner;
GRANT SELECT, INSERT ON TABLE public.trip_plan_revisions, public.trip_plan_items TO localens_guest_rpc_owner;
GRANT SELECT, INSERT ON TABLE private.recommendation_runs TO localens_guest_rpc_owner;
GRANT SELECT, INSERT ON TABLE private.guest_bindings, private.guest_capabilities TO localens_guest_rpc_owner;
GRANT SELECT ON TABLE private.guest_bindings, private.guest_capabilities TO localens_plan_rpc_owner;
GRANT SELECT ON TABLE public.catalog_snapshots, public.catalog_snapshot_places, public.travel_snapshots, public.fx_snapshots TO localens_plan_rpc_owner;
GRANT SELECT, INSERT ON TABLE private.quota_buckets, private.quota_global_buckets, private.quota_reservations TO localens_quota_rpc_owner;
GRANT UPDATE (used_count) ON TABLE private.quota_buckets, private.quota_global_buckets TO localens_quota_rpc_owner;
GRANT SELECT ON TABLE public.trip_plans TO localens_claim_rpc_owner;
GRANT UPDATE (owner_user_id) ON TABLE public.trip_plans TO localens_claim_rpc_owner;
GRANT SELECT ON TABLE private.guest_bindings, private.guest_capabilities TO localens_claim_rpc_owner;
GRANT UPDATE (claimed_at, claimed_by) ON TABLE private.guest_bindings TO localens_claim_rpc_owner;
GRANT UPDATE (revoked_at) ON TABLE private.guest_capabilities TO localens_claim_rpc_owner;
GRANT EXECUTE ON FUNCTION auth.uid() TO localens_claim_rpc_owner, localens_plan_rpc_owner;
GRANT SELECT ON TABLE private.user_roles TO localens_claim_rpc_owner;

REVOKE ALL ON TABLE private.guest_bindings, private.guest_capabilities,
  private.quota_buckets, private.quota_global_buckets, private.quota_reservations
  FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE private.quota_reservations
  FROM PUBLIC, anon, authenticated, localens_quota_rpc_owner, localens_quota_executor;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA private FROM PUBLIC, anon, authenticated;
-- Task 7 exposes customer operations through public wrappers only; the
-- authenticated role cannot resolve private implementation objects directly.
REVOKE USAGE ON SCHEMA private FROM authenticated;

-- One validator/projection is shared by guest creation, guest refinement, and
-- the authenticated owner CAS.  It returns the allowlisted DTO unchanged;
-- callers never get a projection that includes actor or capability fields.
CREATE OR REPLACE FUNCTION private.validate_trip_plan_revision_dto(persistence_dto jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  request_json jsonb;
  result_json jsonb;
  item jsonb;
  result_item jsonb;
  dto_item jsonb;
  key_name text;
  expected_keys constant text[] := ARRAY[
    'revisionNo', 'request', 'result', 'fingerprint', 'rankingSource',
    'catalogSnapshotId', 'travelSnapshotId', 'fxSnapshotId', 'fxVndPerUsd',
    'currency', 'budgetVnd', 'totalCostVnd', 'totalDurationMinutes',
    'lockedPlaceIds', 'items'
  ];
  expected_request_keys constant text[] := ARRAY[
    'startAt', 'durationMinutes', 'areas', 'budget', 'partySize',
    'guideLanguage', 'priorityWeights', 'pace', 'dietaryRequirements',
    'mobilityRequirements', 'lockedStopIds'
  ];
  expected_budget_keys constant text[] := ARRAY['currency', 'amountMinor'];
  expected_priority_keys constant text[] := ARRAY[
    'street_food', 'history', 'traditional_craft', 'traditional_market'
  ];
  expected_result_keys constant text[] := ARRAY[
    'normalizedStartAt', 'budgetVnd', 'rankingSource', 'items', 'totals', 'snapshotIds'
  ];
  expected_totals_keys constant text[] := ARRAY[
    'durationMinutes', 'visitMinutes', 'travelMinutes',
    'transitionBufferMinutes', 'groupCostVnd', 'score'
  ];
  expected_snapshot_keys constant text[] := ARRAY['catalog', 'travel', 'fx'];
  expected_item_keys constant text[] := ARRAY[
    'placeId', 'startAt', 'endAt', 'visitDurationMinutes', 'travelMinutesBefore',
    'transitionBufferMinutesBefore', 'travelCostVndBefore', 'placeCostVnd', 'score'
  ];
  iso_offset_pattern constant text := '^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]{1,3})?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])$';
  canonical_hcm_pattern constant text := '^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:00\+07:00$';
  uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  integer_pattern constant text := '^(?:0|[1-9][0-9]*)$';
  money_pattern constant text := '^(?:0|[1-9][0-9]*)$';
  score_pattern constant text := '^-?(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,12})?$';
BEGIN
  IF persistence_dto IS NULL OR jsonb_typeof(persistence_dto) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid persistence DTO' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(persistence_dto)) <> cardinality(expected_keys)
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(persistence_dto) AS keys(key_name) WHERE NOT (key_name = ANY(expected_keys)))
     OR EXISTS (SELECT 1 FROM unnest(expected_keys) AS keys(key_name) WHERE NOT (persistence_dto ? key_name)) THEN
    RAISE EXCEPTION 'invalid persistence DTO keys' USING ERRCODE = '22023';
  END IF;

  request_json := persistence_dto->'request';
  result_json := persistence_dto->'result';
  IF jsonb_typeof(request_json) IS DISTINCT FROM 'object'
     OR jsonb_typeof(result_json) IS DISTINCT FROM 'object'
     OR jsonb_typeof(persistence_dto->'items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid persistence DTO structure' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(persistence_dto->'items') > 8 THEN
    RAISE EXCEPTION 'invalid persistence DTO structure' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(request_json->'budget') IS DISTINCT FROM 'object'
     OR jsonb_typeof(request_json->'priorityWeights') IS DISTINCT FROM 'object'
     OR jsonb_typeof(request_json->'areas') IS DISTINCT FROM 'array'
     OR jsonb_typeof(request_json->'dietaryRequirements') IS DISTINCT FROM 'array'
     OR jsonb_typeof(request_json->'mobilityRequirements') IS DISTINCT FROM 'array'
     OR jsonb_typeof(request_json->'lockedStopIds') IS DISTINCT FROM 'array'
     OR jsonb_typeof(result_json->'items') IS DISTINCT FROM 'array'
     OR jsonb_typeof(result_json->'totals') IS DISTINCT FROM 'object'
     OR jsonb_typeof(result_json->'snapshotIds') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid nested persistence DTO structure' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(request_json)) <> cardinality(expected_request_keys)
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(request_json) AS keys(key_name) WHERE NOT (key_name = ANY(expected_request_keys)))
     OR EXISTS (SELECT 1 FROM unnest(expected_request_keys) AS keys(key_name) WHERE NOT (request_json ? key_name))
     OR (SELECT count(*) FROM jsonb_object_keys(request_json->'budget')) <> cardinality(expected_budget_keys)
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(request_json->'budget') AS keys(key_name) WHERE NOT (key_name = ANY(expected_budget_keys)))
     OR EXISTS (SELECT 1 FROM unnest(expected_budget_keys) AS keys(key_name) WHERE NOT (request_json->'budget' ? key_name))
     OR (SELECT count(*) FROM jsonb_object_keys(request_json->'priorityWeights')) <> cardinality(expected_priority_keys)
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(request_json->'priorityWeights') AS keys(key_name) WHERE NOT (key_name = ANY(expected_priority_keys)))
     OR EXISTS (SELECT 1 FROM unnest(expected_priority_keys) AS keys(key_name) WHERE NOT (request_json->'priorityWeights' ? key_name))
     OR (SELECT count(*) FROM jsonb_object_keys(result_json)) <> cardinality(expected_result_keys)
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(result_json) AS keys(key_name) WHERE NOT (key_name = ANY(expected_result_keys)))
     OR EXISTS (SELECT 1 FROM unnest(expected_result_keys) AS keys(key_name) WHERE NOT (result_json ? key_name))
     OR (SELECT count(*) FROM jsonb_object_keys(result_json->'totals')) <> cardinality(expected_totals_keys)
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(result_json->'totals') AS keys(key_name) WHERE NOT (key_name = ANY(expected_totals_keys)))
     OR EXISTS (SELECT 1 FROM unnest(expected_totals_keys) AS keys(key_name) WHERE NOT (result_json->'totals' ? key_name))
     OR (SELECT count(*) FROM jsonb_object_keys(result_json->'snapshotIds')) <> cardinality(expected_snapshot_keys)
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(result_json->'snapshotIds') AS keys(key_name) WHERE NOT (key_name = ANY(expected_snapshot_keys)))
     OR EXISTS (SELECT 1 FROM unnest(expected_snapshot_keys) AS keys(key_name) WHERE NOT (result_json->'snapshotIds' ? key_name)) THEN
    RAISE EXCEPTION 'invalid nested persistence DTO keys' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(request_json->'areas') NOT BETWEEN 1 AND 12
     OR jsonb_array_length(request_json->'dietaryRequirements') > 12
     OR jsonb_array_length(request_json->'mobilityRequirements') > 12
     OR jsonb_array_length(request_json->'lockedStopIds') > 8 THEN
    RAISE EXCEPTION 'invalid nested request array cardinality' USING ERRCODE = '22023';
  END IF;

  -- Every array element is checked after its array container is known to be an
  -- array.  This prevents jsonb_array_elements/text from becoming an
  -- uncontrolled built-in error for scalar/null forged input.
  FOR key_name IN SELECT unnest(ARRAY['areas', 'dietaryRequirements', 'mobilityRequirements', 'lockedStopIds']) LOOP
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(request_json->key_name) AS values(value)
      WHERE jsonb_typeof(values.value) IS DISTINCT FROM 'string'
         OR length(values.value #>> '{}') < 1
         OR length(values.value #>> '{}') > 160
         OR values.value #>> '{}' <> btrim(values.value #>> '{}')
         OR values.value #>> '{}' ~ '[[:cntrl:]]'
    ) THEN
      RAISE EXCEPTION 'invalid nested request array element' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(*) FROM jsonb_array_elements_text(request_json->key_name))
       <> (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(request_json->key_name) AS values(value)) THEN
      RAISE EXCEPTION 'invalid nested request array uniqueness' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF jsonb_typeof(request_json->'startAt') IS DISTINCT FROM 'string'
     OR request_json->>'startAt' !~ iso_offset_pattern THEN
    RAISE EXCEPTION 'invalid nested request startAt' USING ERRCODE = '22023';
  END IF;
  IF substring(request_json->>'startAt' FROM 6 FOR 2) = '02'
     AND (
       substring(request_json->>'startAt' FROM 9 FOR 2) > '29'
       OR (
         substring(request_json->>'startAt' FROM 9 FOR 2) = '29'
         AND (
           mod(substring(request_json->>'startAt' FROM 1 FOR 4)::integer, 4) <> 0
           OR (
             mod(substring(request_json->>'startAt' FROM 1 FOR 4)::integer, 100) = 0
             AND mod(substring(request_json->>'startAt' FROM 1 FOR 4)::integer, 400) <> 0
           )
         )
       )
     ) THEN
    RAISE EXCEPTION 'invalid nested request calendar date' USING ERRCODE = '22023';
  END IF;
  IF substring(request_json->>'startAt' FROM 6 FOR 2) IN ('04', '06', '09', '11')
     AND substring(request_json->>'startAt' FROM 9 FOR 2) > '30' THEN
    RAISE EXCEPTION 'invalid nested request calendar date' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(request_json->'durationMinutes') IS DISTINCT FROM 'number'
     OR request_json->>'durationMinutes' !~ integer_pattern
     OR length(request_json->>'durationMinutes') > 3
     OR (length(request_json->>'durationMinutes') = 1)
     OR (length(request_json->>'durationMinutes') = 2 AND request_json->>'durationMinutes' < '60')
     OR (length(request_json->>'durationMinutes') = 3 AND request_json->>'durationMinutes' > '720')
     OR jsonb_typeof(request_json->'budget'->'currency') IS DISTINCT FROM 'string'
     OR request_json->'budget'->>'currency' NOT IN ('VND', 'USD')
     OR jsonb_typeof(request_json->'budget'->'amountMinor') IS DISTINCT FROM 'number'
     OR request_json->'budget'->>'amountMinor' !~ integer_pattern
     OR length(request_json->'budget'->>'amountMinor') > 16
     OR (length(request_json->'budget'->>'amountMinor') = 16 AND request_json->'budget'->>'amountMinor' > '9007199254740991')
     OR jsonb_typeof(request_json->'partySize') IS DISTINCT FROM 'number'
     OR request_json->>'partySize' !~ integer_pattern
     OR request_json->>'partySize' = '0'
     OR length(request_json->>'partySize') > 2
     OR (length(request_json->>'partySize') = 2 AND request_json->>'partySize' > '20')
     OR jsonb_typeof(request_json->'guideLanguage') IS DISTINCT FROM 'string'
     OR request_json->>'guideLanguage' NOT IN ('en', 'vi')
     OR jsonb_typeof(request_json->'pace') IS DISTINCT FROM 'string'
     OR request_json->>'pace' NOT IN ('relaxed', 'balanced', 'active')
     OR jsonb_typeof(request_json->'priorityWeights'->'street_food') IS DISTINCT FROM 'number'
     OR jsonb_typeof(request_json->'priorityWeights'->'history') IS DISTINCT FROM 'number'
     OR jsonb_typeof(request_json->'priorityWeights'->'traditional_craft') IS DISTINCT FROM 'number'
     OR jsonb_typeof(request_json->'priorityWeights'->'traditional_market') IS DISTINCT FROM 'number'
     OR request_json->'priorityWeights'->>'street_food' !~ '^[0-5]$'
     OR request_json->'priorityWeights'->>'history' !~ '^[0-5]$'
     OR request_json->'priorityWeights'->>'traditional_craft' !~ '^[0-5]$'
     OR request_json->'priorityWeights'->>'traditional_market' !~ '^[0-5]$'
     OR (request_json->'priorityWeights'->>'street_food' = '0'
       AND request_json->'priorityWeights'->>'history' = '0'
       AND request_json->'priorityWeights'->>'traditional_craft' = '0'
       AND request_json->'priorityWeights'->>'traditional_market' = '0') THEN
    RAISE EXCEPTION 'invalid nested request scalar' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(result_json->'normalizedStartAt') IS DISTINCT FROM 'string'
     OR result_json->>'normalizedStartAt' !~ canonical_hcm_pattern
     OR jsonb_typeof(result_json->'rankingSource') IS DISTINCT FROM 'string'
     OR result_json->>'rankingSource' NOT IN ('ai', 'deterministic')
     OR jsonb_typeof(result_json->'budgetVnd') IS DISTINCT FROM 'number'
     OR result_json->>'budgetVnd' !~ integer_pattern
     OR length(result_json->>'budgetVnd') > 16
     OR (length(result_json->>'budgetVnd') = 16 AND result_json->>'budgetVnd' > '9007199254740991')
     OR jsonb_typeof(result_json->'snapshotIds'->'catalog') IS DISTINCT FROM 'string'
     OR result_json->'snapshotIds'->>'catalog' !~ uuid_pattern
     OR jsonb_typeof(result_json->'snapshotIds'->'travel') IS DISTINCT FROM 'string'
     OR result_json->'snapshotIds'->>'travel' !~ uuid_pattern
     OR jsonb_typeof(result_json->'snapshotIds'->'fx') NOT IN ('string', 'null')
     OR (jsonb_typeof(result_json->'snapshotIds'->'fx') = 'string' AND result_json->'snapshotIds'->>'fx' !~ uuid_pattern) THEN
    RAISE EXCEPTION 'invalid nested result scalar' USING ERRCODE = '22023';
  END IF;
  IF substring(result_json->>'normalizedStartAt' FROM 6 FOR 2) = '02'
     AND (
       substring(result_json->>'normalizedStartAt' FROM 9 FOR 2) > '29'
       OR (
         substring(result_json->>'normalizedStartAt' FROM 9 FOR 2) = '29'
         AND (
           mod(substring(result_json->>'normalizedStartAt' FROM 1 FOR 4)::integer, 4) <> 0
           OR (
             mod(substring(result_json->>'normalizedStartAt' FROM 1 FOR 4)::integer, 100) = 0
             AND mod(substring(result_json->>'normalizedStartAt' FROM 1 FOR 4)::integer, 400) <> 0
           )
         )
       )
     ) THEN
    RAISE EXCEPTION 'invalid normalizedStartAt calendar date' USING ERRCODE = '22023';
  END IF;
  IF substring(result_json->>'normalizedStartAt' FROM 6 FOR 2) IN ('04', '06', '09', '11')
     AND substring(result_json->>'normalizedStartAt' FROM 9 FOR 2) > '30' THEN
    RAISE EXCEPTION 'invalid normalizedStartAt calendar date' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(result_json->'totals'->'durationMinutes') IS DISTINCT FROM 'number'
     OR jsonb_typeof(result_json->'totals'->'visitMinutes') IS DISTINCT FROM 'number'
     OR jsonb_typeof(result_json->'totals'->'travelMinutes') IS DISTINCT FROM 'number'
     OR jsonb_typeof(result_json->'totals'->'transitionBufferMinutes') IS DISTINCT FROM 'number'
     OR (result_json->'totals'->>'durationMinutes') !~ integer_pattern
     OR (result_json->'totals'->>'visitMinutes') !~ integer_pattern
     OR (result_json->'totals'->>'travelMinutes') !~ integer_pattern
     OR (result_json->'totals'->>'transitionBufferMinutes') !~ integer_pattern
     OR length(result_json->'totals'->>'durationMinutes') > 3
     OR length(result_json->'totals'->>'visitMinutes') > 3
     OR length(result_json->'totals'->>'travelMinutes') > 3
     OR length(result_json->'totals'->>'transitionBufferMinutes') > 3
     OR (length(result_json->'totals'->>'durationMinutes') = 3 AND result_json->'totals'->>'durationMinutes' > '720')
     OR (length(result_json->'totals'->>'visitMinutes') = 3 AND result_json->'totals'->>'visitMinutes' > '720')
     OR (length(result_json->'totals'->>'travelMinutes') = 3 AND result_json->'totals'->>'travelMinutes' > '720')
     OR (length(result_json->'totals'->>'transitionBufferMinutes') = 3 AND result_json->'totals'->>'transitionBufferMinutes' > '720')
     OR jsonb_typeof(result_json->'totals'->'groupCostVnd') IS DISTINCT FROM 'number'
     OR result_json->'totals'->>'groupCostVnd' !~ integer_pattern
     OR length(result_json->'totals'->>'groupCostVnd') > 16
     OR (length(result_json->'totals'->>'groupCostVnd') = 16 AND result_json->'totals'->>'groupCostVnd' > '9007199254740991')
     OR jsonb_typeof(result_json->'totals'->'score') IS DISTINCT FROM 'number'
     OR result_json->'totals'->>'score' !~ score_pattern THEN
    RAISE EXCEPTION 'invalid nested result totals' USING ERRCODE = '22023';
  END IF;
  IF abs((result_json->'totals'->>'score')::numeric) > 9007199254740991::numeric THEN
    RAISE EXCEPTION 'invalid nested result totals score' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(persistence_dto->'revisionNo') IS DISTINCT FROM 'number'
     OR persistence_dto->>'revisionNo' !~ integer_pattern
     OR persistence_dto->>'revisionNo' = '0'
     OR length(persistence_dto->>'revisionNo') > 10
     OR (length(persistence_dto->>'revisionNo') = 10 AND persistence_dto->>'revisionNo' > '2147483647')
     OR jsonb_typeof(persistence_dto->'fingerprint') IS DISTINCT FROM 'string'
     OR persistence_dto->>'fingerprint' !~ '^[0-9a-f]{64}$'
     OR jsonb_typeof(persistence_dto->'rankingSource') IS DISTINCT FROM 'string'
     OR persistence_dto->>'rankingSource' NOT IN ('ai', 'deterministic')
     OR jsonb_typeof(persistence_dto->'catalogSnapshotId') IS DISTINCT FROM 'string'
     OR persistence_dto->>'catalogSnapshotId' !~ uuid_pattern
     OR jsonb_typeof(persistence_dto->'travelSnapshotId') IS DISTINCT FROM 'string'
     OR persistence_dto->>'travelSnapshotId' !~ uuid_pattern
     OR jsonb_typeof(persistence_dto->'currency') IS DISTINCT FROM 'string'
     OR persistence_dto->>'currency' NOT IN ('VND', 'USD')
     OR jsonb_typeof(persistence_dto->'budgetVnd') IS DISTINCT FROM 'string'
     OR persistence_dto->>'budgetVnd' !~ money_pattern
     OR length(persistence_dto->>'budgetVnd') > 16
     OR (length(persistence_dto->>'budgetVnd') = 16 AND persistence_dto->>'budgetVnd' > '9007199254740991')
     OR jsonb_typeof(persistence_dto->'totalCostVnd') IS DISTINCT FROM 'string'
     OR persistence_dto->>'totalCostVnd' !~ money_pattern
     OR length(persistence_dto->>'totalCostVnd') > 16
     OR (length(persistence_dto->>'totalCostVnd') = 16 AND persistence_dto->>'totalCostVnd' > '9007199254740991')
     OR jsonb_typeof(persistence_dto->'totalDurationMinutes') IS DISTINCT FROM 'number'
     OR persistence_dto->>'totalDurationMinutes' !~ integer_pattern
     OR length(persistence_dto->>'totalDurationMinutes') > 3
     OR (length(persistence_dto->>'totalDurationMinutes') = 3 AND persistence_dto->>'totalDurationMinutes' > '720')
     OR jsonb_typeof(persistence_dto->'lockedPlaceIds') IS DISTINCT FROM 'array'
     OR jsonb_typeof(persistence_dto->'fxSnapshotId') NOT IN ('string', 'null')
     OR jsonb_typeof(persistence_dto->'fxVndPerUsd') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'invalid persistence projection scalar' USING ERRCODE = '22023';
  END IF;
  IF persistence_dto->>'currency' = 'USD' AND (
       jsonb_typeof(persistence_dto->'fxSnapshotId') IS DISTINCT FROM 'string'
       OR persistence_dto->>'fxSnapshotId' !~ uuid_pattern
       OR jsonb_typeof(persistence_dto->'fxVndPerUsd') IS DISTINCT FROM 'string'
       OR persistence_dto->>'fxVndPerUsd' !~ '^(?:0|[1-9][0-9]{0,11})\.[0-9]{8}$'
     ) THEN
    RAISE EXCEPTION 'invalid USD FX projection' USING ERRCODE = '22023';
  END IF;
  IF persistence_dto->>'currency' = 'VND' AND (
       jsonb_typeof(persistence_dto->'fxSnapshotId') IS DISTINCT FROM 'null'
       OR jsonb_typeof(persistence_dto->'fxVndPerUsd') IS DISTINCT FROM 'null'
     ) THEN
    RAISE EXCEPTION 'VND cannot carry FX projection' USING ERRCODE = '22023';
  END IF;

  -- Audit parity is scalar and ordinal.  Costs are compared numerically only
  -- after both sides pass their canonical type/range guards.
  IF request_json->'budget'->>'currency' IS DISTINCT FROM persistence_dto->>'currency'
     OR request_json->'lockedStopIds' IS DISTINCT FROM persistence_dto->'lockedPlaceIds'
     OR result_json->>'rankingSource' IS DISTINCT FROM persistence_dto->>'rankingSource'
     OR result_json->'snapshotIds'->>'catalog' IS DISTINCT FROM persistence_dto->>'catalogSnapshotId'
     OR result_json->'snapshotIds'->>'travel' IS DISTINCT FROM persistence_dto->>'travelSnapshotId'
     OR result_json->'snapshotIds'->>'fx' IS DISTINCT FROM persistence_dto->>'fxSnapshotId'
     OR result_json->>'budgetVnd' IS DISTINCT FROM persistence_dto->>'budgetVnd'
     OR result_json->'totals'->>'durationMinutes' IS DISTINCT FROM persistence_dto->>'totalDurationMinutes'
     OR result_json->'totals'->>'groupCostVnd' IS DISTINCT FROM persistence_dto->>'totalCostVnd'
     OR jsonb_array_length(result_json->'items') <> jsonb_array_length(persistence_dto->'items') THEN
    RAISE EXCEPTION 'nested persistence DTO parity mismatch' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(request_json->'lockedStopIds') AS values(value)
    WHERE jsonb_typeof(values.value) IS DISTINCT FROM 'string'
       OR values.value #>> '{}' !~ uuid_pattern
  ) OR (SELECT count(*) FROM jsonb_array_elements_text(request_json->'lockedStopIds'))
       <> (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(request_json->'lockedStopIds') AS values(value)) THEN
    RAISE EXCEPTION 'invalid locked place identifiers' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(persistence_dto->'items') AS values(value)
    WHERE jsonb_typeof(values.value) IS DISTINCT FROM 'object'
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(result_json->'items') AS values(value)
    WHERE jsonb_typeof(values.value) IS DISTINCT FROM 'object'
  ) THEN
    RAISE EXCEPTION 'invalid item object' USING ERRCODE = '22023';
  END IF;
  FOR item, result_item IN
    SELECT dto_values.item, result_values.item
    FROM jsonb_array_elements(persistence_dto->'items') WITH ORDINALITY AS dto_values(item, ordinal)
    JOIN jsonb_array_elements(result_json->'items') WITH ORDINALITY AS result_values(item, ordinal)
      USING (ordinal)
  LOOP
    IF (SELECT count(*) FROM jsonb_object_keys(item)) <> cardinality(expected_item_keys)
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(item) AS keys(key_name) WHERE NOT (key_name = ANY(expected_item_keys)))
       OR EXISTS (SELECT 1 FROM unnest(expected_item_keys) AS keys(key_name) WHERE NOT (item ? key_name))
       OR (SELECT count(*) FROM jsonb_object_keys(result_item)) <> cardinality(expected_item_keys)
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(result_item) AS keys(key_name) WHERE NOT (key_name = ANY(expected_item_keys)))
       OR EXISTS (SELECT 1 FROM unnest(expected_item_keys) AS keys(key_name) WHERE NOT (result_item ? key_name)) THEN
      RAISE EXCEPTION 'invalid item keys' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(item->'placeId') IS DISTINCT FROM 'string'
       OR item->>'placeId' !~ uuid_pattern
       OR jsonb_typeof(item->'startAt') IS DISTINCT FROM 'string'
       OR item->>'startAt' !~ canonical_hcm_pattern
       OR jsonb_typeof(item->'endAt') IS DISTINCT FROM 'string'
       OR item->>'endAt' !~ canonical_hcm_pattern
       OR jsonb_typeof(item->'visitDurationMinutes') IS DISTINCT FROM 'number'
       OR item->>'visitDurationMinutes' !~ integer_pattern
       OR length(item->>'visitDurationMinutes') > 3
       OR length(item->>'visitDurationMinutes') = 1
       OR (length(item->>'visitDurationMinutes') = 2 AND item->>'visitDurationMinutes' < '15')
       OR (length(item->>'visitDurationMinutes') = 3 AND item->>'visitDurationMinutes' > '480')
       OR jsonb_typeof(item->'travelMinutesBefore') IS DISTINCT FROM 'number'
       OR item->>'travelMinutesBefore' !~ integer_pattern
       OR length(item->>'travelMinutesBefore') > 3
       OR (length(item->>'travelMinutesBefore') = 3 AND item->>'travelMinutesBefore' > '720')
       OR jsonb_typeof(item->'transitionBufferMinutesBefore') IS DISTINCT FROM 'number'
       OR item->>'transitionBufferMinutesBefore' NOT IN ('0', '10')
       OR jsonb_typeof(item->'travelCostVndBefore') IS DISTINCT FROM 'string'
       OR item->>'travelCostVndBefore' !~ money_pattern
       OR length(item->>'travelCostVndBefore') > 16
       OR (length(item->>'travelCostVndBefore') = 16 AND item->>'travelCostVndBefore' > '9007199254740991')
       OR jsonb_typeof(item->'placeCostVnd') IS DISTINCT FROM 'string'
       OR item->>'placeCostVnd' !~ money_pattern
       OR length(item->>'placeCostVnd') > 16
       OR (length(item->>'placeCostVnd') = 16 AND item->>'placeCostVnd' > '9007199254740991')
       OR jsonb_typeof(item->'score') IS DISTINCT FROM 'number'
       OR item->>'score' !~ score_pattern
       OR jsonb_typeof(result_item->'placeId') IS DISTINCT FROM 'string'
       OR result_item->>'placeId' !~ uuid_pattern
       OR jsonb_typeof(result_item->'startAt') IS DISTINCT FROM 'string'
       OR result_item->>'startAt' !~ canonical_hcm_pattern
       OR jsonb_typeof(result_item->'endAt') IS DISTINCT FROM 'string'
       OR result_item->>'endAt' !~ canonical_hcm_pattern
       OR jsonb_typeof(result_item->'visitDurationMinutes') IS DISTINCT FROM 'number'
       OR result_item->>'visitDurationMinutes' !~ integer_pattern
       OR length(result_item->>'visitDurationMinutes') > 3
       OR length(result_item->>'visitDurationMinutes') = 1
       OR (length(result_item->>'visitDurationMinutes') = 2 AND result_item->>'visitDurationMinutes' < '15')
       OR (length(result_item->>'visitDurationMinutes') = 3 AND result_item->>'visitDurationMinutes' > '480')
       OR jsonb_typeof(result_item->'travelMinutesBefore') IS DISTINCT FROM 'number'
       OR result_item->>'travelMinutesBefore' !~ integer_pattern
       OR length(result_item->>'travelMinutesBefore') > 3
       OR (length(result_item->>'travelMinutesBefore') = 3 AND result_item->>'travelMinutesBefore' > '720')
       OR jsonb_typeof(result_item->'transitionBufferMinutesBefore') IS DISTINCT FROM 'number'
       OR result_item->>'transitionBufferMinutesBefore' NOT IN ('0', '10')
       OR jsonb_typeof(result_item->'travelCostVndBefore') IS DISTINCT FROM 'number'
       OR result_item->>'travelCostVndBefore' !~ money_pattern
       OR length(result_item->>'travelCostVndBefore') > 16
       OR (length(result_item->>'travelCostVndBefore') = 16 AND result_item->>'travelCostVndBefore' > '9007199254740991')
       OR jsonb_typeof(result_item->'placeCostVnd') IS DISTINCT FROM 'number'
       OR result_item->>'placeCostVnd' !~ money_pattern
       OR length(result_item->>'placeCostVnd') > 16
       OR (length(result_item->>'placeCostVnd') = 16 AND result_item->>'placeCostVnd' > '9007199254740991')
       OR jsonb_typeof(result_item->'score') IS DISTINCT FROM 'number'
       OR result_item->>'score' !~ score_pattern THEN
      RAISE EXCEPTION 'invalid item scalar' USING ERRCODE = '22023';
    END IF;
    IF abs((item->>'score')::numeric) > 9007199254740991::numeric
       OR abs((result_item->>'score')::numeric) > 9007199254740991::numeric THEN
      RAISE EXCEPTION 'invalid item score range' USING ERRCODE = '22023';
    END IF;
    IF substring(item->>'startAt' FROM 6 FOR 2) = '02'
       AND (
         substring(item->>'startAt' FROM 9 FOR 2) > '29'
         OR (
           substring(item->>'startAt' FROM 9 FOR 2) = '29'
           AND (
             mod(substring(item->>'startAt' FROM 1 FOR 4)::integer, 4) <> 0
             OR (
               mod(substring(item->>'startAt' FROM 1 FOR 4)::integer, 100) = 0
               AND mod(substring(item->>'startAt' FROM 1 FOR 4)::integer, 400) <> 0
             )
           )
         )
       ) THEN
      RAISE EXCEPTION 'invalid item calendar date' USING ERRCODE = '22023';
    END IF;
    IF substring(item->>'startAt' FROM 6 FOR 2) IN ('04', '06', '09', '11')
       AND substring(item->>'startAt' FROM 9 FOR 2) > '30' THEN
      RAISE EXCEPTION 'invalid item calendar date' USING ERRCODE = '22023';
    END IF;
    IF substring(item->>'endAt' FROM 6 FOR 2) = '02'
       AND (
         substring(item->>'endAt' FROM 9 FOR 2) > '29'
         OR (
           substring(item->>'endAt' FROM 9 FOR 2) = '29'
           AND (
             mod(substring(item->>'endAt' FROM 1 FOR 4)::integer, 4) <> 0
             OR (
               mod(substring(item->>'endAt' FROM 1 FOR 4)::integer, 100) = 0
               AND mod(substring(item->>'endAt' FROM 1 FOR 4)::integer, 400) <> 0
             )
           )
         )
       ) THEN
      RAISE EXCEPTION 'invalid item calendar date' USING ERRCODE = '22023';
    END IF;
    IF substring(item->>'endAt' FROM 6 FOR 2) IN ('04', '06', '09', '11')
       AND substring(item->>'endAt' FROM 9 FOR 2) > '30' THEN
      RAISE EXCEPTION 'invalid item calendar date' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.catalog_snapshot_places AS catalog_place
      WHERE catalog_place.snapshot_id = (persistence_dto->>'catalogSnapshotId')::uuid
        AND catalog_place.place_id = (item->>'placeId')::uuid
    ) THEN
      RAISE EXCEPTION 'invalid item snapshot membership' USING ERRCODE = '23514';
    END IF;
    IF item->>'placeId' IS DISTINCT FROM result_item->>'placeId'
       OR item->>'startAt' IS DISTINCT FROM result_item->>'startAt'
       OR item->>'endAt' IS DISTINCT FROM result_item->>'endAt'
       OR item->>'visitDurationMinutes' IS DISTINCT FROM result_item->>'visitDurationMinutes'
       OR item->>'travelMinutesBefore' IS DISTINCT FROM result_item->>'travelMinutesBefore'
       OR item->>'transitionBufferMinutesBefore' IS DISTINCT FROM result_item->>'transitionBufferMinutesBefore'
       OR (result_item->>'travelCostVndBefore')::numeric <> (item->>'travelCostVndBefore')::numeric
       OR (result_item->>'placeCostVnd')::numeric <> (item->>'placeCostVnd')::numeric
       OR result_item->>'score' IS DISTINCT FROM item->>'score' THEN
      RAISE EXCEPTION 'result item facts do not match persistence projection' USING ERRCODE = '23514';
    END IF;
  END LOOP;

  RETURN persistence_dto;
END;
$function$;
ALTER FUNCTION private.validate_trip_plan_revision_dto(jsonb) OWNER TO localens_plan_rpc_owner;
REVOKE ALL ON FUNCTION private.validate_trip_plan_revision_dto(jsonb) FROM PUBLIC, anon, authenticated;

-- This is the only insert path for revisions used by Task 7.  It accepts
-- either a customer authority or a separately verified guest binding; the
-- owner CAS below never accepts a capability parameter.
CREATE OR REPLACE FUNCTION private.persist_trip_plan_revision(
  p_plan_id uuid,
  p_base_revision_no integer,
  p_persistence_dto jsonb,
  p_actor_user_id uuid,
  p_guest_binding_id uuid,
  p_token_hash text,
  p_pepper_version smallint
)
RETURNS TABLE (revision_id uuid, revision_no integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  dto jsonb;
  plan_row public.trip_plans%ROWTYPE;
  binding_row private.guest_bindings%ROWTYPE;
  capability_row private.guest_capabilities%ROWTYPE;
  new_revision_id uuid;
  next_revision_no integer;
  item jsonb;
  locked_text text;
  locked_id uuid;
  locked_ordinal integer;
  previous_item_ordinal integer;
  last_locked_item_ordinal integer := 0;
BEGIN
  dto := private.validate_trip_plan_revision_dto(p_persistence_dto);
  IF p_plan_id IS NULL OR p_base_revision_no IS NULL OR p_base_revision_no < 0 OR p_base_revision_no > 2147483646 THEN
    RAISE EXCEPTION 'invalid revision authority' USING ERRCODE = '22023';
  END IF;
  IF (p_guest_binding_id IS NULL AND (p_actor_user_id IS NULL OR p_token_hash IS NOT NULL OR p_pepper_version IS NOT NULL))
     OR (p_guest_binding_id IS NOT NULL AND (p_actor_user_id IS NOT NULL OR p_token_hash IS NULL OR p_pepper_version IS NULL)) THEN
    RAISE EXCEPTION 'invalid revision authority' USING ERRCODE = '22023';
  END IF;
  IF p_guest_binding_id IS NOT NULL
     AND (p_token_hash !~ '^[0-9a-f]{64}$' OR p_pepper_version NOT BETWEEN 1 AND 2) THEN
    RAISE EXCEPTION 'invalid guest capability' USING ERRCODE = '42501';
  END IF;

  -- Every branch takes the plan lock first.  Guest authority then locks the
  -- binding and capability in that order, so owner/guest CAS cannot deadlock
  -- by acquiring those rows in the opposite direction.
  SELECT * INTO plan_row
  FROM public.trip_plans AS plans
  WHERE plans.id = p_plan_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trip plan authority required' USING ERRCODE = '42501';
  END IF;
  IF p_guest_binding_id IS NULL THEN
    IF plan_row.owner_user_id IS DISTINCT FROM p_actor_user_id THEN
      RAISE EXCEPTION 'trip plan owner required' USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT * INTO binding_row
    FROM private.guest_bindings AS bindings
    WHERE bindings.id = p_guest_binding_id;
    SELECT * INTO capability_row
    FROM private.guest_capabilities AS capabilities
    WHERE capabilities.binding_id = p_guest_binding_id
      AND capabilities.token_hash = p_token_hash
      AND capabilities.pepper_version = p_pepper_version;
    IF plan_row.owner_user_id IS NOT NULL
       OR plan_row.guest_binding_id IS DISTINCT FROM p_guest_binding_id
       OR NOT FOUND
       OR binding_row.id IS NULL
       OR binding_row.plan_id IS DISTINCT FROM p_plan_id
       OR binding_row.claimed_at IS NOT NULL
       OR binding_row.expires_at <= pg_catalog.clock_timestamp()
       OR capability_row.revoked_at IS NOT NULL
       OR capability_row.expires_at <= pg_catalog.clock_timestamp() THEN
      RAISE EXCEPTION 'guest capability rejected' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF plan_row.latest_revision_no <> p_base_revision_no THEN
    RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE = 'P0001', DETAIL = 'STALE_REVISION';
  END IF;
  next_revision_no := p_base_revision_no + 1;
  IF (dto->>'revisionNo')::integer <> next_revision_no THEN
    RAISE EXCEPTION 'revision number does not match compare-and-swap base' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_snapshots AS snapshots
    WHERE snapshots.id = (dto->>'catalogSnapshotId')::uuid
      AND snapshots.status = 'published'::public.snapshot_status
  ) OR NOT EXISTS (
    SELECT 1 FROM public.travel_snapshots AS travel
    WHERE travel.id = (dto->>'travelSnapshotId')::uuid
      AND travel.catalog_snapshot_id = (dto->>'catalogSnapshotId')::uuid
      AND travel.status = 'published'::public.snapshot_status
  ) THEN
    RAISE EXCEPTION 'snapshot membership mismatch' USING ERRCODE = '23514';
  END IF;
  IF (dto->>'currency') = 'USD' AND NOT EXISTS (
    SELECT 1 FROM public.fx_snapshots AS fx
    WHERE fx.id = (dto->>'fxSnapshotId')::uuid
      AND fx.vnd_per_usd = (dto->>'fxVndPerUsd')::numeric
  ) THEN
    RAISE EXCEPTION 'FX snapshot mismatch' USING ERRCODE = '23514';
  END IF;

  -- Locked stops must be present in result order, not merely in the catalog.
  FOR locked_text, locked_ordinal IN
    SELECT values.value, values.ordinality::integer
    FROM jsonb_array_elements_text(dto->'lockedPlaceIds') WITH ORDINALITY AS values(value, ordinality)
  LOOP
    locked_id := locked_text::uuid;
    SELECT selected.item_ordinal::integer INTO previous_item_ordinal
    FROM jsonb_array_elements(dto->'items') WITH ORDINALITY AS selected(item, item_ordinal)
    WHERE selected.item->>'placeId' = locked_id::text;
    IF previous_item_ordinal IS NULL OR previous_item_ordinal <= last_locked_item_ordinal THEN
      RAISE EXCEPTION 'locked place order is invalid' USING ERRCODE = '23514';
    END IF;
    last_locked_item_ordinal := previous_item_ordinal;
  END LOOP;

  INSERT INTO public.trip_plan_revisions (
    plan_id, revision_no, base_revision_no, request_json, result_json, fingerprint,
    ranking_source, catalog_snapshot_id, travel_snapshot_id, fx_snapshot_id,
    fx_vnd_per_usd, currency, budget_vnd, total_cost_vnd,
    total_duration_minutes, locked_place_ids, actor_user_id
  ) VALUES (
    p_plan_id,
    next_revision_no,
    p_base_revision_no,
    dto->'request',
    dto->'result',
    dto->>'fingerprint',
    (dto->>'rankingSource')::public.ranking_source,
    (dto->>'catalogSnapshotId')::uuid,
    (dto->>'travelSnapshotId')::uuid,
    NULLIF(dto->>'fxSnapshotId', '')::uuid,
    NULLIF(dto->>'fxVndPerUsd', '')::numeric,
    (dto->>'currency')::public.currency_code,
    (dto->>'budgetVnd')::bigint,
    (dto->>'totalCostVnd')::bigint,
    (dto->>'totalDurationMinutes')::integer,
    COALESCE(ARRAY(SELECT values.value::uuid FROM jsonb_array_elements_text(dto->'lockedPlaceIds') AS values(value)), '{}'::uuid[]),
    p_actor_user_id
  ) ON CONFLICT (plan_id, revision_no) DO NOTHING
    RETURNING id INTO new_revision_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE = 'P0001', DETAIL = 'STALE_REVISION';
  END IF;

  INSERT INTO public.trip_plan_items (
    revision_id, position, catalog_snapshot_id, place_id, start_at, end_at,
    visit_duration_minutes, travel_minutes_before, transition_buffer_minutes_before,
    travel_cost_vnd_before, place_cost_vnd, score
  )
  SELECT
    new_revision_id,
    values.ordinality::integer,
    (dto->>'catalogSnapshotId')::uuid,
    (values.item->>'placeId')::uuid,
    (values.item->>'startAt')::timestamptz,
    (values.item->>'endAt')::timestamptz,
    (values.item->>'visitDurationMinutes')::smallint,
    (values.item->>'travelMinutesBefore')::smallint,
    (values.item->>'transitionBufferMinutesBefore')::smallint,
    (values.item->>'travelCostVndBefore')::bigint,
    (values.item->>'placeCostVnd')::bigint,
    (values.item->>'score')::numeric
  FROM jsonb_array_elements(dto->'items') WITH ORDINALITY AS values(item, ordinality);

  INSERT INTO private.recommendation_runs (
    plan_id, revision_id, actor_user_id, ranking_source,
    request_fingerprint, provider_attempted, outcome
  ) VALUES (
    p_plan_id,
    new_revision_id,
    p_actor_user_id,
    (dto->>'rankingSource')::public.ranking_source,
    dto->>'fingerprint',
    (dto->>'rankingSource') = 'ai',
    'created'
  );
  UPDATE public.trip_plans AS plans
  SET latest_revision_no = next_revision_no
  WHERE plans.id = p_plan_id;

  revision_id := new_revision_id;
  revision_no := next_revision_no;
  RETURN NEXT;
END;
$function$;
ALTER FUNCTION private.persist_trip_plan_revision(uuid, integer, jsonb, uuid, uuid, text, smallint) OWNER TO localens_plan_rpc_owner;
REVOKE ALL ON FUNCTION private.persist_trip_plan_revision(uuid, integer, jsonb, uuid, uuid, text, smallint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.persist_trip_plan_revision(uuid, integer, jsonb, uuid, uuid, text, smallint) TO localens_guest_rpc_owner;

-- Authenticated owner CAS remains a distinct public contract.  It derives the
-- actor from the JWT and cannot receive a guest capability argument.
CREATE OR REPLACE FUNCTION private.advance_trip_plan_revision(
  plan_id uuid,
  base_revision_no integer,
  persistence_dto jsonb
)
RETURNS TABLE (revision_id uuid, revision_no integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor_user_id uuid;
BEGIN
  actor_user_id := (SELECT auth.uid());
  IF actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM private.user_roles
    WHERE user_id = actor_user_id AND role = 'customer'::public.app_role
  ) THEN
    RAISE EXCEPTION 'customer role required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT persisted.revision_id, persisted.revision_no
  FROM private.persist_trip_plan_revision(
    plan_id, base_revision_no, persistence_dto,
    actor_user_id, NULL::uuid, NULL::text, NULL::smallint
  ) AS persisted;
END;
$function$;
ALTER FUNCTION private.advance_trip_plan_revision(uuid, integer, jsonb) OWNER TO localens_plan_rpc_owner;
REVOKE ALL ON FUNCTION private.advance_trip_plan_revision(uuid, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.advance_trip_plan_revision(uuid, integer, jsonb) FROM authenticated;

-- PostgREST exposes public schemas, so the authenticated customer entrypoint
-- is a thin public wrapper.  The private helper derives auth.uid() and owns
-- the single customer-role check; this wrapper only delegates.
CREATE OR REPLACE FUNCTION public.advance_trip_plan_revision(
  plan_id uuid,
  base_revision_no integer,
  persistence_dto jsonb
)
RETURNS TABLE (revision_id uuid, revision_no integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT persisted.revision_id, persisted.revision_no
  FROM private.advance_trip_plan_revision(plan_id, base_revision_no, persistence_dto) AS persisted;
END;
$function$;
ALTER FUNCTION public.advance_trip_plan_revision(uuid, integer, jsonb) OWNER TO localens_plan_rpc_owner;
REVOKE ALL ON FUNCTION public.advance_trip_plan_revision(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_trip_plan_revision(uuid, integer, jsonb) TO authenticated;

-- Guest refinement has a separate capability-shaped argument and is internal
-- only.  Edge authenticates the raw token before constructing this digest DTO.
CREATE OR REPLACE FUNCTION private.advance_guest_trip_plan_revision(
  plan_id uuid,
  base_revision_no integer,
  persistence_dto jsonb,
  capability jsonb
)
RETURNS TABLE (revision_id uuid, revision_no integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  binding_id uuid;
  capability_plan_id uuid;
  token_hash text;
  pepper_version smallint;
  plan_row public.trip_plans%ROWTYPE;
BEGIN
  IF capability IS NULL OR jsonb_typeof(capability) IS DISTINCT FROM 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(capability)) <> 3
     OR NOT (capability ? 'planId') OR NOT (capability ? 'tokenHash') OR NOT (capability ? 'pepperVersion')
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(capability) AS keys(key_name)
               WHERE key_name NOT IN ('planId', 'tokenHash', 'pepperVersion')) THEN
    RAISE EXCEPTION 'guest capability rejected' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(capability->'planId') IS DISTINCT FROM 'string'
     OR capability->>'planId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR jsonb_typeof(capability->'tokenHash') IS DISTINCT FROM 'string'
     OR capability->>'tokenHash' !~ '^[0-9a-f]{64}$'
     OR jsonb_typeof(capability->'pepperVersion') IS DISTINCT FROM 'number'
     OR capability->>'pepperVersion' NOT IN ('1', '2') THEN
    RAISE EXCEPTION 'guest capability rejected' USING ERRCODE = '42501';
  END IF;
  capability_plan_id := (capability->>'planId')::uuid;
  token_hash := capability->>'tokenHash';
  pepper_version := (capability->>'pepperVersion')::smallint;
  IF pepper_version NOT BETWEEN 1 AND 2 OR capability_plan_id IS DISTINCT FROM plan_id THEN
    RAISE EXCEPTION 'guest capability rejected' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO plan_row
  FROM public.trip_plans AS plans
  WHERE plans.id = plan_id
  FOR UPDATE;
  IF NOT FOUND OR plan_row.guest_binding_id IS NULL THEN
    RAISE EXCEPTION 'guest capability rejected' USING ERRCODE = '42501';
  END IF;
  binding_id := plan_row.guest_binding_id;
  RETURN QUERY
  SELECT persisted.revision_id, persisted.revision_no
  FROM private.persist_trip_plan_revision(
    plan_id, base_revision_no, persistence_dto,
    NULL::uuid, binding_id, token_hash, pepper_version
  ) AS persisted;
END;
$function$;
ALTER FUNCTION private.advance_guest_trip_plan_revision(uuid, integer, jsonb, jsonb) OWNER TO localens_guest_rpc_owner;
REVOKE ALL ON FUNCTION private.advance_guest_trip_plan_revision(uuid, integer, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.advance_guest_trip_plan_revision(uuid, integer, jsonb, jsonb) TO localens_guest_executor;

CREATE OR REPLACE FUNCTION private.create_guest_plan(args jsonb)
RETURNS TABLE (plan_id uuid, revision_no integer, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  plan_row public.trip_plans%ROWTYPE;
  binding_row private.guest_bindings%ROWTYPE;
  created_revision_id uuid;
  expected_keys constant text[] := ARRAY['revision', 'tokenHash', 'pepperVersion'];
  revision_dto jsonb;
  token_hash text;
  pepper_version smallint;
BEGIN
  IF args IS NULL OR jsonb_typeof(args) IS DISTINCT FROM 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(args)) <> cardinality(expected_keys)
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(args) AS keys(key_name) WHERE NOT (key_name = ANY(expected_keys)))
     OR EXISTS (SELECT 1 FROM unnest(expected_keys) AS keys(key_name) WHERE NOT (args ? key_name))
     OR jsonb_typeof(args->'revision') IS DISTINCT FROM 'object'
     OR jsonb_typeof(args->'tokenHash') IS DISTINCT FROM 'string'
     OR args->>'tokenHash' !~ '^[0-9a-f]{64}$'
     OR jsonb_typeof(args->'pepperVersion') IS DISTINCT FROM 'number'
     OR args->>'pepperVersion' NOT IN ('1', '2') THEN
    RAISE EXCEPTION 'invalid guest plan arguments' USING ERRCODE = '22023';
  END IF;
  token_hash := args->>'tokenHash';
  pepper_version := (args->>'pepperVersion')::smallint;
  revision_dto := args->'revision';

  INSERT INTO public.trip_plans (owner_user_id, guest_binding_id)
  VALUES (NULL, NULL)
  RETURNING * INTO plan_row;
  INSERT INTO private.guest_bindings (plan_id)
  VALUES (plan_row.id)
  RETURNING * INTO binding_row;
  UPDATE public.trip_plans
  SET guest_binding_id = binding_row.id
  WHERE id = plan_row.id;
  INSERT INTO private.guest_capabilities (binding_id, token_hash, pepper_version, expires_at)
  VALUES (binding_row.id, token_hash, pepper_version, binding_row.expires_at);

  SELECT persisted.revision_id INTO created_revision_id
  FROM private.persist_trip_plan_revision(
    plan_row.id, 0, revision_dto,
    NULL::uuid, binding_row.id, token_hash, pepper_version
  ) AS persisted;
  IF created_revision_id IS NULL THEN
    RAISE EXCEPTION 'guest plan creation failed' USING ERRCODE = 'P0001';
  END IF;
  plan_id := plan_row.id;
  revision_no := 1;
  expires_at := binding_row.expires_at;
  RETURN NEXT;
END;
$function$;
ALTER FUNCTION private.create_guest_plan(jsonb) OWNER TO localens_guest_rpc_owner;
REVOKE ALL ON FUNCTION private.create_guest_plan(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.create_guest_plan(jsonb) TO localens_guest_executor;

-- Private claim helper.  Its errors intentionally share one SQLSTATE/message
-- for wrong, expired, replayed, and cross-plan capabilities.
CREATE OR REPLACE FUNCTION private.claim_guest_binding(
  p_plan_id uuid,
  p_token_hash text,
  p_pepper_version smallint,
  p_actor_user_id uuid
)
RETURNS TABLE (plan_id uuid, claimed_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  plan_row public.trip_plans%ROWTYPE;
  binding_row private.guest_bindings%ROWTYPE;
  capability_row private.guest_capabilities%ROWTYPE;
  binding_found boolean := false;
  capability_found boolean := false;
  claim_time timestamptz;
BEGIN
  IF p_plan_id IS NULL OR p_actor_user_id IS NULL
     OR p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$'
     OR p_pepper_version IS NULL OR p_pepper_version NOT BETWEEN 1 AND 2 THEN
    RAISE EXCEPTION 'guest claim failed' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO plan_row
  FROM public.trip_plans AS plans
  WHERE plans.id = p_plan_id
  FOR UPDATE;
  IF NOT FOUND OR plan_row.guest_binding_id IS NULL THEN
    RAISE EXCEPTION 'guest claim failed' USING ERRCODE = 'P0001';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM private.guest_bindings AS bindings
    WHERE bindings.id = plan_row.guest_binding_id
  ) INTO binding_found;
  IF binding_found THEN
    SELECT * INTO binding_row
    FROM private.guest_bindings AS bindings
    WHERE bindings.id = plan_row.guest_binding_id
    FOR UPDATE;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM private.guest_capabilities AS capabilities
    WHERE capabilities.binding_id = plan_row.guest_binding_id
      AND capabilities.token_hash = p_token_hash
      AND capabilities.pepper_version = p_pepper_version
  ) INTO capability_found;
  IF capability_found THEN
    SELECT * INTO capability_row
    FROM private.guest_capabilities AS capabilities
    WHERE capabilities.binding_id = plan_row.guest_binding_id
      AND capabilities.token_hash = p_token_hash
      AND capabilities.pepper_version = p_pepper_version
    FOR UPDATE;
  END IF;
  -- Sample the authoritative clock only after every row participating in the
  -- claim decision is locked. This prevents a long lock wait from turning an
  -- expired capability into a valid claim while preserving one deterministic
  -- timestamp for the expiry check, claim update, and return value.
  claim_time := pg_catalog.clock_timestamp();
  IF NOT binding_found OR NOT capability_found
     OR binding_row.plan_id IS DISTINCT FROM p_plan_id
     OR plan_row.owner_user_id IS NOT NULL
     OR binding_row.claimed_at IS NOT NULL
     OR binding_row.expires_at <= claim_time
     OR capability_row.revoked_at IS NOT NULL
     OR capability_row.expires_at <= claim_time THEN
    RAISE EXCEPTION 'guest claim failed' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.trip_plans
  SET owner_user_id = p_actor_user_id
  WHERE id = p_plan_id AND owner_user_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'guest claim failed' USING ERRCODE = 'P0001';
  END IF;
  UPDATE private.guest_bindings
  SET claimed_at = claim_time, claimed_by = p_actor_user_id
  WHERE id = binding_row.id AND claimed_at IS NULL;
  UPDATE private.guest_capabilities
  SET revoked_at = claim_time
  WHERE id = capability_row.id AND revoked_at IS NULL;
  plan_id := p_plan_id;
  claimed_at := claim_time;
  RETURN NEXT;
END;
$function$;
ALTER FUNCTION private.claim_guest_binding(uuid, text, smallint, uuid) OWNER TO localens_claim_rpc_owner;
REVOKE ALL ON FUNCTION private.claim_guest_binding(uuid, text, smallint, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.claim_guest_binding(uuid, text, smallint, uuid) TO localens_claim_rpc_owner;

-- Public claim wrapper: auth.uid() is derived here and is the only owner
-- identity passed to the private helper.
CREATE OR REPLACE FUNCTION public.claim_guest_plan(
  p_plan_id uuid,
  p_token_hash text,
  p_pepper_version smallint
)
RETURNS TABLE (plan_id uuid, claimed_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor_user_id uuid;
BEGIN
  actor_user_id := (SELECT auth.uid());
  IF actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM private.user_roles
    WHERE user_id = actor_user_id AND role = 'customer'::public.app_role
  ) THEN
    RAISE EXCEPTION 'guest claim failed' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY
  SELECT claimed.plan_id, claimed.claimed_at
  FROM private.claim_guest_binding(p_plan_id, p_token_hash, p_pepper_version, actor_user_id) AS claimed;
END;
$function$;
ALTER FUNCTION public.claim_guest_plan(uuid, text, smallint) OWNER TO localens_claim_rpc_owner;
REVOKE ALL ON FUNCTION public.claim_guest_plan(uuid, text, smallint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_guest_plan(uuid, text, smallint) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_guest_plan(uuid, text, smallint) TO authenticated;

-- Quota reservation is intentionally provider-agnostic.  The reservation is
-- written before the model call, so failed provider attempts remain consumed.
-- There are exactly two non-global HMAC buckets; Gemini additionally locks the
-- single global row after those two semantically ordered bucket rows.
-- The existing recommendation_runs audit retains provider_attempted and only
-- allows outcome IN ('created', 'failed', 'quota_exhausted'); a reservation is
-- never rolled back or retried after a provider attempt.
CREATE OR REPLACE FUNCTION private.reserve_quota(
  p_reservation_id uuid,
  p_kind text,
  p_ip_hash text,
  p_device_hash text
)
RETURNS TABLE (
  reservation_id uuid,
  kind text,
  bucket_hashes text[],
  period_start timestamptz,
  state text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  existing private.quota_reservations%ROWTYPE;
  inserted private.quota_reservations%ROWTYPE;
  bucket_row record;
  current_period timestamptz;
  global_row private.quota_global_buckets%ROWTYPE;
  limit_per_bucket integer;
  expected_hashes text[];
  lock_key bigint;
  bucket_count integer := 0;
  updated_bucket_count integer;
  updated_global_count integer;
BEGIN
  IF p_reservation_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('planner', 'gemini')
     OR p_ip_hash IS NULL OR p_device_hash IS NULL
     OR p_ip_hash !~ '^[0-9a-f]{64}$'
     OR p_device_hash !~ '^[0-9a-f]{64}$'
     OR p_ip_hash = p_device_hash THEN
    RAISE EXCEPTION 'invalid quota reservation' USING ERRCODE = '22023';
  END IF;
  -- The tuple is semantically [ip_hash, device_hash].  We never sort or
  -- relabel these values; only the constructed database rows are lock-sorted.
  expected_hashes := ARRAY[p_ip_hash, p_device_hash];
  -- Serializes the absent-idempotency-row case without trusting a client
  -- period. The reservation receipt itself is the immutable idempotency row;
  -- it is never explicitly locked or updated.
  lock_key := pg_catalog.hashtextextended(p_reservation_id::text, 0);
  PERFORM pg_catalog.pg_advisory_xact_lock(lock_key);
  IF p_kind = 'planner' THEN
    current_period := pg_catalog.date_trunc('hour', pg_catalog.clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
    limit_per_bucket := 30;
  ELSE
    current_period := pg_catalog.date_trunc('day', pg_catalog.clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
    limit_per_bucket := 5;
  END IF;

  -- Insert the immutable reservation receipt before touching quota counters.
  -- A successful RETURNING row is the only created path; a conflict is a
  -- replay and must return the stored decision without incrementing anything.
  INSERT INTO private.quota_reservations (reservation_id, kind, bucket_hashes, period_start)
  VALUES (p_reservation_id, p_kind, expected_hashes, current_period)
  ON CONFLICT (reservation_id) DO NOTHING
  RETURNING * INTO inserted;
  IF NOT FOUND THEN
    SELECT * INTO existing
    FROM private.quota_reservations AS reservations
    WHERE reservations.reservation_id = p_reservation_id;
    IF NOT FOUND
       OR existing.kind IS DISTINCT FROM p_kind
       OR existing.bucket_hashes IS DISTINCT FROM expected_hashes THEN
      RAISE EXCEPTION 'quota reservation conflict' USING ERRCODE = '22023';
    END IF;
    reservation_id := existing.reservation_id;
    kind := existing.kind;
    bucket_hashes := existing.bucket_hashes;
    period_start := existing.period_start;
    state := 'replayed';
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO private.quota_buckets (bucket_kind, bucket_hash, period_start, limit_count)
  SELECT CASE WHEN p_kind = 'planner' THEN 'planner_ip' ELSE 'gemini_ip' END,
         expected_hashes[1], current_period, limit_per_bucket
  UNION ALL
  SELECT CASE WHEN p_kind = 'planner' THEN 'planner_device' ELSE 'gemini_device' END,
         expected_hashes[2], current_period, limit_per_bucket
  ON CONFLICT (bucket_kind, bucket_hash, period_start) DO NOTHING;

  -- Deterministic sorted lock order for the two non-global rows.
  FOR bucket_row IN
    SELECT buckets.bucket_kind, buckets.bucket_hash, buckets.period_start,
           buckets.used_count, buckets.limit_count
    FROM private.quota_buckets AS buckets
    WHERE buckets.period_start = current_period
      AND buckets.bucket_hash = ANY(expected_hashes)
      AND ((buckets.bucket_kind = CASE WHEN p_kind = 'planner' THEN 'planner_ip' ELSE 'gemini_ip' END
            AND buckets.bucket_hash = expected_hashes[1])
        OR (buckets.bucket_kind = CASE WHEN p_kind = 'planner' THEN 'planner_device' ELSE 'gemini_device' END
            AND buckets.bucket_hash = expected_hashes[2]))
    ORDER BY buckets.bucket_kind, buckets.bucket_hash
    FOR UPDATE
  LOOP
    bucket_count := bucket_count + 1;
    IF bucket_row.used_count >= bucket_row.limit_count THEN
      RAISE EXCEPTION 'quota exceeded' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  IF bucket_count <> 2 THEN
    RAISE EXCEPTION 'quota bucket set is incomplete' USING ERRCODE = '23514';
  END IF;

  IF p_kind = 'gemini' THEN
    INSERT INTO private.quota_global_buckets (period_start)
    VALUES (current_period)
    ON CONFLICT (period_start) DO NOTHING;
    SELECT * INTO global_row
    FROM private.quota_global_buckets AS globals
    WHERE globals.period_start = current_period
    FOR UPDATE;
    IF global_row.used_count >= global_row.limit_count THEN
      RAISE EXCEPTION 'quota exceeded' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE private.quota_buckets AS buckets
  SET used_count = buckets.used_count + 1
  WHERE buckets.period_start = current_period
    AND buckets.bucket_hash = ANY(expected_hashes)
    AND ((buckets.bucket_kind = CASE WHEN p_kind = 'planner' THEN 'planner_ip' ELSE 'gemini_ip' END
          AND buckets.bucket_hash = expected_hashes[1])
      OR (buckets.bucket_kind = CASE WHEN p_kind = 'planner' THEN 'planner_device' ELSE 'gemini_device' END
          AND buckets.bucket_hash = expected_hashes[2]));
  GET DIAGNOSTICS updated_bucket_count = ROW_COUNT;
  IF updated_bucket_count <> 2 THEN
    RAISE EXCEPTION 'quota bucket update set is incomplete' USING ERRCODE = '23514';
  END IF;
  IF p_kind = 'gemini' THEN
    UPDATE private.quota_global_buckets AS globals
    SET used_count = globals.used_count + 1
    WHERE globals.period_start = current_period;
    GET DIAGNOSTICS updated_global_count = ROW_COUNT;
    IF updated_global_count <> 1 THEN
      RAISE EXCEPTION 'quota global update set is incomplete' USING ERRCODE = '23514';
    END IF;
  END IF;

  reservation_id := inserted.reservation_id;
  kind := inserted.kind;
  bucket_hashes := inserted.bucket_hashes;
  period_start := inserted.period_start;
  state := 'created';
  RETURN NEXT;
END;
$function$;
ALTER FUNCTION private.reserve_quota(uuid, text, text, text) OWNER TO localens_quota_rpc_owner;
REVOKE ALL ON FUNCTION private.reserve_quota(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.reserve_quota(uuid, text, text, text) TO localens_quota_executor;

-- Webhook/build roles are deliberately separate from guest and quota
-- executors; no membership or table access is granted here.
REVOKE localens_guest_rpc_owner, localens_quota_rpc_owner FROM localens_webhook_executor, localens_build_executor;

COMMIT;
