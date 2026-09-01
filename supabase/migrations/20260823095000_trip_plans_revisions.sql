BEGIN;

-- Task 6 owns customer-authenticated immutable revisions.  Guest binding is
-- deliberately only a nullable placeholder; Task 7 adds its FK/capability
-- tables and replaces the guest branch of the RPC.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_plan_rpc_owner') THEN
    CREATE ROLE localens_plan_rpc_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_plan_guard_owner') THEN
    CREATE ROLE localens_plan_guard_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname IN ('localens_plan_rpc_owner', 'localens_plan_guard_owner')
      AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolcanlogin OR rolreplication OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'unsafe pre-existing LocalLens plan owner role attributes';
  END IF;
END
$roles$;

GRANT localens_plan_rpc_owner TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT localens_plan_guard_owner TO postgres WITH SET TRUE, INHERIT FALSE;

REVOKE ALL ON SCHEMA public, private, auth FROM localens_plan_rpc_owner, localens_plan_guard_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA public, private, auth FROM localens_plan_rpc_owner, localens_plan_guard_owner;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public, private FROM localens_plan_rpc_owner, localens_plan_guard_owner;
GRANT CREATE ON SCHEMA private TO localens_plan_rpc_owner, localens_plan_guard_owner;

CREATE TABLE public.trip_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  -- Task 7 adds REFERENCES private.guest_bindings(id); no guest RLS exists yet.
  guest_binding_id uuid,
  latest_revision_no integer NOT NULL DEFAULT 0 CHECK (latest_revision_no >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.trip_plan_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.trip_plans(id) ON DELETE RESTRICT,
  revision_no integer NOT NULL CHECK (revision_no >= 1),
  base_revision_no integer NOT NULL CHECK (base_revision_no >= 0),
  request_json jsonb NOT NULL,
  result_json jsonb NOT NULL,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  ranking_source public.ranking_source NOT NULL,
  catalog_snapshot_id uuid NOT NULL REFERENCES public.catalog_snapshots(id) ON DELETE RESTRICT,
  travel_snapshot_id uuid NOT NULL,
  fx_snapshot_id uuid,
  fx_vnd_per_usd numeric(20,8),
  currency public.currency_code NOT NULL,
  budget_vnd bigint NOT NULL CHECK (budget_vnd BETWEEN 0 AND 9007199254740991),
  total_cost_vnd bigint NOT NULL CHECK (total_cost_vnd BETWEEN 0 AND 9007199254740991),
  total_duration_minutes integer NOT NULL CHECK (total_duration_minutes BETWEEN 0 AND 720),
  locked_place_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, revision_no),
  FOREIGN KEY (travel_snapshot_id, catalog_snapshot_id)
    REFERENCES public.travel_snapshots(id, catalog_snapshot_id) ON DELETE RESTRICT,
  FOREIGN KEY (travel_snapshot_id)
    REFERENCES public.travel_snapshots(id) ON DELETE RESTRICT,
  FOREIGN KEY (fx_snapshot_id)
    REFERENCES public.fx_snapshots(id) ON DELETE RESTRICT,
  CHECK (jsonb_typeof(request_json) = 'object'),
  CHECK (jsonb_typeof(result_json) = 'object'),
  CHECK (fx_vnd_per_usd IS NULL OR fx_vnd_per_usd > 0),
  CHECK (
    (currency = 'USD'::public.currency_code AND fx_snapshot_id IS NOT NULL AND fx_vnd_per_usd IS NOT NULL)
    OR (currency = 'VND'::public.currency_code AND fx_snapshot_id IS NULL AND fx_vnd_per_usd IS NULL)
  )
);

CREATE TABLE public.trip_plan_items (
  revision_id uuid NOT NULL REFERENCES public.trip_plan_revisions(id) ON DELETE RESTRICT,
  position integer NOT NULL CHECK (position >= 1 AND position <= 8),
  catalog_snapshot_id uuid NOT NULL,
  place_id uuid NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  visit_duration_minutes smallint NOT NULL CHECK (visit_duration_minutes BETWEEN 15 AND 480),
  travel_minutes_before smallint NOT NULL CHECK (travel_minutes_before >= 0),
  transition_buffer_minutes_before smallint NOT NULL CHECK (transition_buffer_minutes_before IN (0, 10)),
  travel_cost_vnd_before bigint NOT NULL CHECK (travel_cost_vnd_before BETWEEN 0 AND 9007199254740991),
  place_cost_vnd bigint NOT NULL CHECK (place_cost_vnd BETWEEN 0 AND 9007199254740991),
  score numeric(30,12) NOT NULL,
  PRIMARY KEY (revision_id, position),
  UNIQUE (revision_id, position),
  UNIQUE (revision_id, place_id),
  FOREIGN KEY (catalog_snapshot_id, place_id)
    REFERENCES public.catalog_snapshot_places(snapshot_id, place_id) ON DELETE RESTRICT,
  CHECK (end_at > start_at)
);

-- Operational recommendation attempts are private and append-only.  They are
-- not a browser projection and contain no raw PII or provider payloads.
CREATE TABLE private.recommendation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.trip_plans(id) ON DELETE RESTRICT,
  revision_id uuid REFERENCES public.trip_plan_revisions(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ranking_source public.ranking_source NOT NULL,
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  provider_attempted boolean NOT NULL DEFAULT false,
  outcome text NOT NULL CHECK (outcome IN ('created', 'failed', 'quota_exhausted')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trip_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE public.trip_plan_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_plan_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.trip_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_plan_items FORCE ROW LEVEL SECURITY;
ALTER TABLE private.recommendation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.recommendation_runs FORCE ROW LEVEL SECURITY;

-- Customer reads begin only after a plan is claimed.  No anonymous policy is
-- present, and no API role receives base-table DML privileges.
CREATE POLICY trip_plans_owner_select ON public.trip_plans
  FOR SELECT TO authenticated
  -- Owner predicate reads the authenticated JWT subject directly.
  USING (NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid = owner_user_id);
CREATE POLICY trip_plan_revisions_owner_select ON public.trip_plan_revisions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trip_plans AS p
    WHERE p.id = trip_plan_revisions.plan_id
      AND p.owner_user_id = NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid
  ));
CREATE POLICY trip_plan_items_owner_select ON public.trip_plan_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.trip_plan_revisions AS r
    JOIN public.trip_plans AS p ON p.id = r.plan_id
    WHERE r.id = trip_plan_items.revision_id
      AND p.owner_user_id = NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid
  ));

-- SECURITY DEFINER RPCs run as a named NOBYPASSRLS owner, so FORCE RLS needs
-- explicit policies for that owner.  These policies do not grant the role any
-- capability by themselves; the function still derives and checks the JWT subject.
CREATE POLICY trip_plans_plan_rpc_owner_all ON public.trip_plans
  FOR ALL TO localens_plan_rpc_owner
  USING (current_user = 'localens_plan_rpc_owner')
  WITH CHECK (current_user = 'localens_plan_rpc_owner');
CREATE POLICY trip_plan_revisions_plan_rpc_owner_all ON public.trip_plan_revisions
  FOR ALL TO localens_plan_rpc_owner
  USING (current_user = 'localens_plan_rpc_owner')
  WITH CHECK (current_user = 'localens_plan_rpc_owner');
CREATE POLICY trip_plan_items_plan_rpc_owner_all ON public.trip_plan_items
  FOR ALL TO localens_plan_rpc_owner
  USING (current_user = 'localens_plan_rpc_owner')
  WITH CHECK (current_user = 'localens_plan_rpc_owner');
CREATE POLICY recommendation_runs_plan_rpc_owner_all ON private.recommendation_runs
  FOR ALL TO localens_plan_rpc_owner
  USING (current_user = 'localens_plan_rpc_owner')
  WITH CHECK (current_user = 'localens_plan_rpc_owner');

CREATE POLICY trip_plans_plan_guard_select ON public.trip_plans
  FOR SELECT TO localens_plan_guard_owner USING (true);
CREATE POLICY trip_plan_revisions_plan_guard_select ON public.trip_plan_revisions
  FOR SELECT TO localens_plan_guard_owner USING (true);
CREATE POLICY trip_plan_items_plan_guard_select ON public.trip_plan_items
  FOR SELECT TO localens_plan_guard_owner USING (true);

-- Parent snapshot checks in the CAS function run as a NOBYPASSRLS definer;
-- explicit read policies keep FORCE RLS effective for that owner.
CREATE POLICY catalog_snapshots_plan_rpc_select ON public.catalog_snapshots
  FOR SELECT TO localens_plan_rpc_owner USING (true);
CREATE POLICY catalog_snapshot_places_plan_rpc_select ON public.catalog_snapshot_places
  FOR SELECT TO localens_plan_rpc_owner USING (true);
CREATE POLICY travel_snapshots_plan_rpc_select ON public.travel_snapshots
  FOR SELECT TO localens_plan_rpc_owner USING (true);
CREATE POLICY fx_snapshots_plan_rpc_select ON public.fx_snapshots
  FOR SELECT TO localens_plan_rpc_owner USING (true);
CREATE POLICY user_roles_plan_rpc_select ON private.user_roles
  FOR SELECT TO localens_plan_rpc_owner USING (true);

GRANT USAGE ON SCHEMA public, private TO localens_plan_rpc_owner;
GRANT USAGE ON SCHEMA public TO localens_plan_guard_owner;
GRANT SELECT, INSERT, UPDATE ON TABLE public.trip_plans TO localens_plan_rpc_owner;
GRANT SELECT, INSERT ON TABLE public.trip_plan_revisions, public.trip_plan_items TO localens_plan_rpc_owner;
GRANT SELECT, INSERT ON TABLE private.recommendation_runs TO localens_plan_rpc_owner;
GRANT SELECT ON TABLE public.trip_plans, public.trip_plan_revisions, public.trip_plan_items TO localens_plan_guard_owner;
GRANT SELECT ON TABLE private.user_roles TO localens_plan_rpc_owner;
GRANT SELECT ON TABLE public.catalog_snapshots, public.catalog_snapshot_places TO localens_plan_rpc_owner;
GRANT SELECT ON TABLE public.travel_snapshots, public.fx_snapshots TO localens_plan_rpc_owner;

REVOKE ALL ON TABLE public.trip_plans, public.trip_plan_revisions, public.trip_plan_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.recommendation_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA private FROM PUBLIC, anon, authenticated;
-- The customer JWT may invoke this one guarded RPC through a trusted server
-- connection.  The private schema remains outside PostgREST's exposed
-- schemas, and no other private object is executable by authenticated.
GRANT USAGE ON SCHEMA private TO authenticated;
-- Claimed customers can read only the owner-filtered columns needed by the
-- planner.  FORCE RLS still excludes unclaimed and cross-owner rows.
GRANT SELECT (id, owner_user_id, latest_revision_no, created_at, updated_at)
  ON TABLE public.trip_plans TO authenticated;
GRANT SELECT (
  id, plan_id, revision_no, base_revision_no, request_json, result_json,
  fingerprint, ranking_source, catalog_snapshot_id, travel_snapshot_id,
  fx_snapshot_id, fx_vnd_per_usd, currency, budget_vnd, total_cost_vnd,
  total_duration_minutes, locked_place_ids, actor_user_id, created_at
) ON TABLE public.trip_plan_revisions TO authenticated;
GRANT SELECT (
  revision_id, position, catalog_snapshot_id, place_id, start_at, end_at,
  visit_duration_minutes, travel_minutes_before, transition_buffer_minutes_before,
  travel_cost_vnd_before, place_cost_vnd, score
) ON TABLE public.trip_plan_items TO authenticated;

-- There is no client-visible UPDATE/DELETE route for a revision/item/run.  A
-- trigger remains a second line of defence for an accidental internal DML.
CREATE OR REPLACE FUNCTION private.reject_trip_plan_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'trip plan revisions, items, and recommendation runs are append-only'
    USING ERRCODE = '42501';
END;
$function$;
ALTER FUNCTION private.reject_trip_plan_history_mutation() OWNER TO localens_plan_guard_owner;
REVOKE ALL ON FUNCTION private.reject_trip_plan_history_mutation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trip_plan_revisions_append_only
BEFORE UPDATE OR DELETE ON public.trip_plan_revisions
FOR EACH ROW EXECUTE FUNCTION private.reject_trip_plan_history_mutation();
CREATE TRIGGER trip_plan_items_append_only
BEFORE UPDATE OR DELETE ON public.trip_plan_items
FOR EACH ROW EXECUTE FUNCTION private.reject_trip_plan_history_mutation();
CREATE TRIGGER recommendation_runs_append_only
BEFORE UPDATE OR DELETE ON private.recommendation_runs
FOR EACH ROW EXECUTE FUNCTION private.reject_trip_plan_history_mutation();
CREATE TRIGGER trip_plan_revisions_append_only_truncate
BEFORE TRUNCATE ON public.trip_plan_revisions
FOR EACH STATEMENT EXECUTE FUNCTION private.reject_trip_plan_history_mutation();
CREATE TRIGGER trip_plan_items_append_only_truncate
BEFORE TRUNCATE ON public.trip_plan_items
FOR EACH STATEMENT EXECUTE FUNCTION private.reject_trip_plan_history_mutation();
CREATE TRIGGER recommendation_runs_append_only_truncate
BEFORE TRUNCATE ON private.recommendation_runs
FOR EACH STATEMENT EXECUTE FUNCTION private.reject_trip_plan_history_mutation();

CREATE OR REPLACE FUNCTION private.assert_trip_plan_item_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  revision_catalog_snapshot_id uuid;
BEGIN
  SELECT catalog_snapshot_id INTO revision_catalog_snapshot_id
  FROM public.trip_plan_revisions
  WHERE id = NEW.revision_id;
  IF revision_catalog_snapshot_id IS NULL OR NEW.catalog_snapshot_id IS DISTINCT FROM revision_catalog_snapshot_id THEN
    RAISE EXCEPTION 'trip plan item snapshot does not match its revision' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.assert_trip_plan_item_snapshot() OWNER TO localens_plan_guard_owner;
REVOKE ALL ON FUNCTION private.assert_trip_plan_item_snapshot() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trip_plan_item_snapshot_guard
BEFORE INSERT ON public.trip_plan_items
FOR EACH ROW EXECUTE FUNCTION private.assert_trip_plan_item_snapshot();

CREATE OR REPLACE FUNCTION private.set_trip_plan_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at := pg_catalog.clock_timestamp();
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.set_trip_plan_updated_at() OWNER TO localens_plan_guard_owner;
REVOKE ALL ON FUNCTION private.set_trip_plan_updated_at() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trip_plans_set_updated_at
BEFORE UPDATE ON public.trip_plans
FOR EACH ROW EXECUTE FUNCTION private.set_trip_plan_updated_at();

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
  plan_row public.trip_plans%ROWTYPE;
  next_revision_no integer;
  new_revision_id uuid;
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
  iso_offset_pattern constant text := '^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]{1,3})?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])$';
  canonical_hcm_pattern constant text := '^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:00\+07:00$';
  actual_key_count integer;
  request_json jsonb;
  result_json jsonb;
  item jsonb;
  result_item jsonb;
  dto_item jsonb;
  item_position integer := 0;
  locked_text text;
  locked_id uuid;
  locked_ordinal integer;
  previous_item_ordinal integer;
  last_locked_item_ordinal integer := 0;
  expected_item_keys constant text[] := ARRAY[
    'placeId', 'startAt', 'endAt', 'visitDurationMinutes', 'travelMinutesBefore',
    'transitionBufferMinutesBefore', 'travelCostVndBefore', 'placeCostVnd', 'score'
  ];
BEGIN
  actor_user_id := NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid;
  IF actor_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM private.user_roles
    WHERE user_id = actor_user_id AND role = 'customer'::public.app_role
  ) THEN
    RAISE EXCEPTION 'customer role required' USING ERRCODE = '42501';
  END IF;
  -- jsonb_typeof(persistence_dto) = 'object' is the only accepted envelope.
  IF plan_id IS NULL OR base_revision_no IS NULL OR base_revision_no < 0 OR base_revision_no > 2147483646
     OR persistence_dto IS NULL OR jsonb_typeof(persistence_dto) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid persistence DTO' USING ERRCODE = '22023';
  END IF;

  -- Reject unknown/missing top-level keys before any row is inserted.  The
  -- actor, plan ID, and base revision remain separate RPC parameters.
  SELECT count(*)::integer INTO actual_key_count FROM jsonb_object_keys(persistence_dto);
  IF actual_key_count <> cardinality(expected_keys)
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(persistence_dto) AS keys(key) WHERE NOT (key = ANY(expected_keys)))
     OR EXISTS (SELECT 1 FROM unnest(expected_keys) AS keys(key) WHERE NOT (persistence_dto ? key)) THEN
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
     OR jsonb_typeof(request_json->'lockedStopIds') IS DISTINCT FROM 'array'
     OR jsonb_typeof(request_json->'areas') IS DISTINCT FROM 'array'
     OR jsonb_typeof(request_json->'dietaryRequirements') IS DISTINCT FROM 'array'
     OR jsonb_typeof(request_json->'mobilityRequirements') IS DISTINCT FROM 'array'
     OR jsonb_typeof(request_json->'priorityWeights') IS DISTINCT FROM 'object'
     OR jsonb_typeof(result_json->'items') IS DISTINCT FROM 'array'
     OR jsonb_typeof(result_json->'totals') IS DISTINCT FROM 'object'
     OR jsonb_typeof(result_json->'snapshotIds') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid nested persistence DTO shape' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(request_json)) <> cardinality(expected_request_keys)
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(request_json) AS keys(key) WHERE NOT (key = ANY(expected_request_keys)))
     OR EXISTS (SELECT 1 FROM unnest(expected_request_keys) AS keys(key) WHERE NOT (request_json ? key))
     OR (SELECT count(*) FROM jsonb_object_keys(request_json->'budget')) <> cardinality(expected_budget_keys)
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(request_json->'budget') AS keys(key) WHERE NOT (key = ANY(expected_budget_keys)))
     OR EXISTS (SELECT 1 FROM unnest(expected_budget_keys) AS keys(key) WHERE NOT (request_json->'budget' ? key))
     OR (SELECT count(*) FROM jsonb_object_keys(request_json->'priorityWeights')) <> cardinality(expected_priority_keys)
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(request_json->'priorityWeights') AS keys(key) WHERE NOT (key = ANY(expected_priority_keys)))
     OR EXISTS (SELECT 1 FROM unnest(expected_priority_keys) AS keys(key) WHERE NOT (request_json->'priorityWeights' ? key))
     OR (SELECT count(*) FROM jsonb_object_keys(result_json)) <> cardinality(expected_result_keys)
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(result_json) AS keys(key) WHERE NOT (key = ANY(expected_result_keys)))
     OR EXISTS (SELECT 1 FROM unnest(expected_result_keys) AS keys(key) WHERE NOT (result_json ? key))
     OR (SELECT count(*) FROM jsonb_object_keys(result_json->'totals')) <> cardinality(expected_totals_keys)
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(result_json->'totals') AS keys(key) WHERE NOT (key = ANY(expected_totals_keys)))
     OR EXISTS (SELECT 1 FROM unnest(expected_totals_keys) AS keys(key) WHERE NOT (result_json->'totals' ? key))
     OR (SELECT count(*) FROM jsonb_object_keys(result_json->'snapshotIds')) <> cardinality(expected_snapshot_keys)
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(result_json->'snapshotIds') AS keys(key) WHERE NOT (key = ANY(expected_snapshot_keys)))
     OR EXISTS (SELECT 1 FROM unnest(expected_snapshot_keys) AS keys(key) WHERE NOT (result_json->'snapshotIds' ? key)) THEN
    RAISE EXCEPTION 'invalid nested persistence DTO shape' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(request_json->'areas') < 1
     OR jsonb_array_length(request_json->'areas') > 12
     OR jsonb_array_length(request_json->'dietaryRequirements') > 12
     OR jsonb_array_length(request_json->'mobilityRequirements') > 12
     OR jsonb_array_length(request_json->'lockedStopIds') > 8 THEN
    RAISE EXCEPTION 'invalid nested request arrays' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(request_json->'areas') AS values(value)
    WHERE jsonb_typeof(values.value) IS DISTINCT FROM 'string'
       OR length(values.value #>> '{}') < 1
       OR length(values.value #>> '{}') > 160
       OR values.value #>> '{}' <> btrim(values.value #>> '{}')
       OR values.value #>> '{}' ~ '[[:cntrl:]]'
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(request_json->'dietaryRequirements') AS values(value)
    WHERE jsonb_typeof(values.value) IS DISTINCT FROM 'string'
       OR length(values.value #>> '{}') < 1
       OR length(values.value #>> '{}') > 160
       OR values.value #>> '{}' <> btrim(values.value #>> '{}')
       OR values.value #>> '{}' ~ '[[:cntrl:]]'
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(request_json->'mobilityRequirements') AS values(value)
    WHERE jsonb_typeof(values.value) IS DISTINCT FROM 'string'
       OR length(values.value #>> '{}') < 1
       OR length(values.value #>> '{}') > 160
       OR values.value #>> '{}' <> btrim(values.value #>> '{}')
       OR values.value #>> '{}' ~ '[[:cntrl:]]'
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(request_json->'lockedStopIds') AS values(value)
    WHERE jsonb_typeof(values.value) IS DISTINCT FROM 'string'
       OR length(values.value #>> '{}') < 1
       OR length(values.value #>> '{}') > 160
       OR values.value #>> '{}' <> btrim(values.value #>> '{}')
       OR values.value #>> '{}' ~ '[[:cntrl:]]'
  ) THEN
    RAISE EXCEPTION 'invalid nested request arrays' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements_text(request_json->'areas'))
       <> (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(request_json->'areas') AS values(value))
     OR (SELECT count(*) FROM jsonb_array_elements_text(request_json->'dietaryRequirements'))
       <> (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(request_json->'dietaryRequirements') AS values(value))
     OR (SELECT count(*) FROM jsonb_array_elements_text(request_json->'mobilityRequirements'))
       <> (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(request_json->'mobilityRequirements') AS values(value))
     OR (SELECT count(*) FROM jsonb_array_elements_text(request_json->'lockedStopIds'))
       <> (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(request_json->'lockedStopIds') AS values(value)) THEN
    RAISE EXCEPTION 'invalid nested request arrays' USING ERRCODE = '22023';
  END IF;
  -- Recheck the allowlisted request facts as their engine JSON types.  This
  -- keeps the audit snapshot canonical even when the authenticated RPC is
  -- called without the Edge adapter.
  IF jsonb_typeof(request_json->'startAt') IS DISTINCT FROM 'string'
     OR request_json->>'startAt' !~ iso_offset_pattern THEN
    RAISE EXCEPTION 'invalid nested request facts' USING ERRCODE = '22023';
  END IF;
  -- The engine accepts any explicit ISO offset (including Z), then rounds
  -- upward to the canonical HCM minute.  The RPC validates the input shape;
  -- the adapter/engine owns that normalization rather than comparing the raw
  -- request string with result.normalizedStartAt.
  IF substring(request_json->>'startAt' FROM 6 FOR 2) = '02'
     AND (
       substring(request_json->>'startAt' FROM 9 FOR 2) > '29'
       OR (
         substring(request_json->>'startAt' FROM 9 FOR 2) = '29'
         AND NOT (
           mod(substring(request_json->>'startAt' FROM 1 FOR 4)::integer, 4) = 0
           AND (
             mod(substring(request_json->>'startAt' FROM 1 FOR 4)::integer, 100) <> 0
             OR mod(substring(request_json->>'startAt' FROM 1 FOR 4)::integer, 400) = 0
           )
         )
       )
     ) THEN
    RAISE EXCEPTION 'invalid nested request facts' USING ERRCODE = '22023';
  END IF;
  IF substring(request_json->>'startAt' FROM 6 FOR 2) IN ('04', '06', '09', '11')
     AND substring(request_json->>'startAt' FROM 9 FOR 2) > '30' THEN
    RAISE EXCEPTION 'invalid nested request facts' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(request_json->'durationMinutes') IS DISTINCT FROM 'number'
     OR request_json->>'durationMinutes' !~ '^(?:0|[1-9][0-9]*)$'
     OR length(request_json->>'durationMinutes') < 2
     OR length(request_json->>'durationMinutes') > 3
     OR (length(request_json->>'durationMinutes') = 2 AND request_json->>'durationMinutes' < '60')
     OR (length(request_json->>'durationMinutes') = 3 AND request_json->>'durationMinutes' > '720')
     OR jsonb_typeof(request_json->'budget'->'currency') IS DISTINCT FROM 'string'
     OR request_json->'budget'->>'currency' NOT IN ('VND', 'USD')
     OR jsonb_typeof(request_json->'budget'->'amountMinor') IS DISTINCT FROM 'number'
     OR request_json->'budget'->>'amountMinor' !~ '^(?:0|[1-9][0-9]*)$'
     OR length(request_json->'budget'->>'amountMinor') > 16
     OR (length(request_json->'budget'->>'amountMinor') = 16 AND request_json->'budget'->>'amountMinor' > '9007199254740991')
     OR jsonb_typeof(request_json->'partySize') IS DISTINCT FROM 'number'
     OR request_json->>'partySize' !~ '^(?:0|[1-9][0-9]*)$'
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
    RAISE EXCEPTION 'invalid nested request facts' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(result_json->'normalizedStartAt') IS DISTINCT FROM 'string'
     OR result_json->>'normalizedStartAt' !~ canonical_hcm_pattern
     OR jsonb_typeof(result_json->'rankingSource') IS DISTINCT FROM 'string'
     OR result_json->>'rankingSource' NOT IN ('ai', 'deterministic')
     OR jsonb_typeof(result_json->'snapshotIds'->'catalog') IS DISTINCT FROM 'string'
     OR jsonb_typeof(result_json->'snapshotIds'->'travel') IS DISTINCT FROM 'string'
     OR jsonb_typeof(result_json->'snapshotIds'->'fx') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'invalid nested result facts' USING ERRCODE = '22023';
  END IF;
  IF substring(result_json->>'normalizedStartAt' FROM 6 FOR 2) = '02'
     AND (
       substring(result_json->>'normalizedStartAt' FROM 9 FOR 2) > '29'
       OR (
         substring(result_json->>'normalizedStartAt' FROM 9 FOR 2) = '29'
         AND NOT (
           mod(substring(result_json->>'normalizedStartAt' FROM 1 FOR 4)::integer, 4) = 0
           AND (
             mod(substring(result_json->>'normalizedStartAt' FROM 1 FOR 4)::integer, 100) <> 0
             OR mod(substring(result_json->>'normalizedStartAt' FROM 1 FOR 4)::integer, 400) = 0
           )
         )
       )
     ) THEN
    RAISE EXCEPTION 'invalid nested result facts' USING ERRCODE = '22023';
  END IF;
  IF substring(result_json->>'normalizedStartAt' FROM 6 FOR 2) IN ('04', '06', '09', '11')
     AND substring(result_json->>'normalizedStartAt' FROM 9 FOR 2) > '30' THEN
    RAISE EXCEPTION 'invalid nested result facts' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(result_json->'totals'->'visitMinutes') IS DISTINCT FROM 'number'
     OR jsonb_typeof(result_json->'totals'->'travelMinutes') IS DISTINCT FROM 'number'
     OR jsonb_typeof(result_json->'totals'->'transitionBufferMinutes') IS DISTINCT FROM 'number'
     OR result_json->'totals'->>'visitMinutes' !~ '^(?:0|[1-9][0-9]*)$'
     OR result_json->'totals'->>'travelMinutes' !~ '^(?:0|[1-9][0-9]*)$'
     OR result_json->'totals'->>'transitionBufferMinutes' !~ '^(?:0|[1-9][0-9]*)$'
     OR length(result_json->'totals'->>'visitMinutes') > 3
     OR length(result_json->'totals'->>'travelMinutes') > 3
     OR length(result_json->'totals'->>'transitionBufferMinutes') > 3
     OR (length(result_json->'totals'->>'visitMinutes') = 3 AND result_json->'totals'->>'visitMinutes' > '720')
     OR (length(result_json->'totals'->>'travelMinutes') = 3 AND result_json->'totals'->>'travelMinutes' > '720')
     OR (length(result_json->'totals'->>'transitionBufferMinutes') = 3 AND result_json->'totals'->>'transitionBufferMinutes' > '720')
     OR jsonb_typeof(result_json->'totals'->'score') IS DISTINCT FROM 'number'
     OR result_json->'totals'->>'score' !~ '^-?(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,12})?$' THEN
    RAISE EXCEPTION 'invalid nested result totals' USING ERRCODE = '22023';
  END IF;
  IF abs((result_json->'totals'->>'score')::numeric) > 9007199254740991::numeric THEN
    RAISE EXCEPTION 'invalid nested result totals' USING ERRCODE = '22023';
  END IF;
  IF persistence_dto->>'fingerprint' !~ '^[0-9a-f]{64}$'
     OR persistence_dto->>'rankingSource' NOT IN ('ai', 'deterministic')
     OR persistence_dto->>'catalogSnapshotId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR persistence_dto->>'travelSnapshotId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR persistence_dto->>'revisionNo' IS NULL
     OR persistence_dto->>'revisionNo' !~ '^(?:0|[1-9][0-9]*)$'
     OR persistence_dto->>'revisionNo' = '0'
     OR length(persistence_dto->>'revisionNo') > 10
     OR (length(persistence_dto->>'revisionNo') = 10 AND persistence_dto->>'revisionNo' > '2147483647')
     OR persistence_dto->>'budgetVnd' IS NULL
     OR persistence_dto->>'budgetVnd' !~ '^(?:0|[1-9][0-9]*)$'
     OR length(persistence_dto->>'budgetVnd') > 16
     OR (length(persistence_dto->>'budgetVnd') = 16 AND persistence_dto->>'budgetVnd' > '9007199254740991')
     OR persistence_dto->>'totalCostVnd' IS NULL
     OR persistence_dto->>'totalCostVnd' !~ '^(?:0|[1-9][0-9]*)$'
     OR length(persistence_dto->>'totalCostVnd') > 16
     OR (length(persistence_dto->>'totalCostVnd') = 16 AND persistence_dto->>'totalCostVnd' > '9007199254740991')
     OR persistence_dto->>'totalDurationMinutes' IS NULL
     OR persistence_dto->>'totalDurationMinutes' !~ '^(?:0|[1-9][0-9]*)$'
     OR length(persistence_dto->>'totalDurationMinutes') > 3
     OR (length(persistence_dto->>'totalDurationMinutes') = 3 AND persistence_dto->>'totalDurationMinutes' > '720')
     OR persistence_dto->>'currency' NOT IN ('VND', 'USD')
     OR ((persistence_dto->>'currency') = 'USD' AND (
       persistence_dto->>'fxSnapshotId' IS NULL
       OR persistence_dto->>'fxSnapshotId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR persistence_dto->>'fxVndPerUsd' IS NULL
       OR persistence_dto->>'fxVndPerUsd' !~ '^(?:0|[1-9][0-9]{0,11})\.[0-9]{8}$'
     )) THEN
    RAISE EXCEPTION 'invalid persistence DTO snapshot or fingerprint' USING ERRCODE = '22023';
  END IF;

  -- The nested JSON is retained as an audit snapshot, so its scalar facts
  -- must agree with the allowlisted persistence projection.  These checks
  -- happen before the plan lock and before any revision/run row exists.
  IF jsonb_typeof(request_json->'budget'->'currency') <> 'string'
     OR request_json->'budget'->>'currency' IS DISTINCT FROM persistence_dto->>'currency'
     OR request_json->'lockedStopIds' IS DISTINCT FROM persistence_dto->'lockedPlaceIds'
     OR result_json->>'rankingSource' IS DISTINCT FROM persistence_dto->>'rankingSource'
     OR result_json->'snapshotIds'->>'catalog' IS DISTINCT FROM persistence_dto->>'catalogSnapshotId'
     OR result_json->'snapshotIds'->>'travel' IS DISTINCT FROM persistence_dto->>'travelSnapshotId'
     OR result_json->'snapshotIds'->>'fx' IS DISTINCT FROM persistence_dto->>'fxSnapshotId'
     OR jsonb_typeof(result_json->'budgetVnd') <> 'number'
     OR result_json->>'budgetVnd' IS NULL
     OR result_json->>'budgetVnd' !~ '^(?:0|[1-9][0-9]*)$'
     OR length(result_json->>'budgetVnd') > 16
     OR (length(result_json->>'budgetVnd') = 16 AND result_json->>'budgetVnd' > '9007199254740991')
     OR result_json->>'budgetVnd' IS DISTINCT FROM persistence_dto->>'budgetVnd'
     OR jsonb_typeof(result_json->'totals'->'durationMinutes') <> 'number'
     OR result_json->'totals'->>'durationMinutes' IS NULL
     OR result_json->'totals'->>'durationMinutes' !~ '^(?:0|[1-9][0-9]*)$'
     OR length(result_json->'totals'->>'durationMinutes') > 3
     OR (length(result_json->'totals'->>'durationMinutes') = 3 AND result_json->'totals'->>'durationMinutes' > '720')
     OR result_json->'totals'->>'durationMinutes' IS DISTINCT FROM persistence_dto->>'totalDurationMinutes'
     OR jsonb_typeof(result_json->'totals'->'groupCostVnd') <> 'number'
     OR result_json->'totals'->>'groupCostVnd' IS NULL
     OR result_json->'totals'->>'groupCostVnd' !~ '^(?:0|[1-9][0-9]*)$'
     OR length(result_json->'totals'->>'groupCostVnd') > 16
     OR (length(result_json->'totals'->>'groupCostVnd') = 16 AND result_json->'totals'->>'groupCostVnd' > '9007199254740991')
     OR result_json->'totals'->>'groupCostVnd' IS DISTINCT FROM persistence_dto->>'totalCostVnd'
     OR jsonb_array_length(result_json->'items') <> jsonb_array_length(persistence_dto->'items') THEN
    RAISE EXCEPTION 'nested persistence DTO parity mismatch' USING ERRCODE = '23514';
  END IF;

  -- The plan lock is acquired before comparing latest_revision_no.  Therefore
  -- exactly one caller with a base revision can win; every loser gets the same
  -- stable STALE_REVISION error and no child rows are created.
  SELECT * INTO plan_row
  FROM public.trip_plans
  WHERE id = plan_id
  FOR UPDATE;
  IF NOT FOUND OR plan_row.owner_user_id IS DISTINCT FROM actor_user_id THEN
    RAISE EXCEPTION 'trip plan owner required' USING ERRCODE = '42501';
  END IF;
  IF plan_row.latest_revision_no <> base_revision_no THEN
    RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE = 'P0001', DETAIL = 'STALE_REVISION';
  END IF;
  next_revision_no := base_revision_no + 1;
  IF (persistence_dto->>'revisionNo')::integer <> next_revision_no THEN
    RAISE EXCEPTION 'revision number does not match compare-and-swap base' USING ERRCODE = '22023';
  END IF;

  -- Structural and snapshot rechecks remain server-side even though Edge has
  -- already validated/recomputed the engine DTO.
  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_snapshots
    WHERE id = (persistence_dto->>'catalogSnapshotId')::uuid
  ) OR NOT EXISTS (
    SELECT 1 FROM public.travel_snapshots
    WHERE id = (persistence_dto->>'travelSnapshotId')::uuid
      AND catalog_snapshot_id = (persistence_dto->>'catalogSnapshotId')::uuid
  ) THEN
    RAISE EXCEPTION 'snapshot membership mismatch' USING ERRCODE = '23514';
  END IF;
  IF (persistence_dto->>'currency') = 'USD'
     AND (
       (persistence_dto->>'fxSnapshotId') IS NULL
       OR (persistence_dto->>'fxVndPerUsd') IS NULL
       OR (persistence_dto->>'fxVndPerUsd') !~ '^(?:0|[1-9][0-9]{0,11})\.[0-9]{8}$'
       OR NOT EXISTS (
         SELECT 1 FROM public.fx_snapshots AS fx
         WHERE fx.id = (persistence_dto->>'fxSnapshotId')::uuid
           AND fx.vnd_per_usd = (persistence_dto->>'fxVndPerUsd')::numeric
       )
     )
     OR (persistence_dto->>'currency') = 'VND'
     AND ((persistence_dto->>'fxSnapshotId') IS NOT NULL OR (persistence_dto->>'fxVndPerUsd') IS NOT NULL) THEN
    RAISE EXCEPTION 'currency and FX snapshot nullability mismatch' USING ERRCODE = '23514';
  END IF;

  IF jsonb_typeof(persistence_dto->'lockedPlaceIds') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid locked place identifiers' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(persistence_dto->'lockedPlaceIds') > 8
     OR (SELECT count(*) FROM jsonb_array_elements_text(persistence_dto->'lockedPlaceIds'))
        <> (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(persistence_dto->'lockedPlaceIds') AS values(value)) THEN
    RAISE EXCEPTION 'invalid locked place identifiers' USING ERRCODE = '22023';
  END IF;

  -- Locked IDs must be selected and retain their relative order in the
  -- immutable result items.  This is checked before the revision insert.
  FOR locked_text, locked_ordinal IN
    SELECT value, ordinality::integer
    FROM jsonb_array_elements_text(persistence_dto->'lockedPlaceIds') WITH ORDINALITY AS values(value, ordinality)
  LOOP
    IF locked_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'invalid locked place identifiers' USING ERRCODE = '22023';
    END IF;
    locked_id := locked_text::uuid;
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(persistence_dto->'items') WITH ORDINALITY AS selected(item, item_ordinal)
      WHERE selected.item->>'placeId' = locked_id::text
    ) THEN
      RAISE EXCEPTION 'locked place is absent from selected itinerary' USING ERRCODE = '23514';
    END IF;
    SELECT selected.item_ordinal::integer INTO previous_item_ordinal
    FROM jsonb_array_elements(persistence_dto->'items') WITH ORDINALITY AS selected(item, item_ordinal)
    WHERE selected.item->>'placeId' = locked_id::text;
    IF previous_item_ordinal IS NULL OR previous_item_ordinal <= last_locked_item_ordinal THEN
      RAISE EXCEPTION 'locked place order is invalid' USING ERRCODE = '23514';
    END IF;
    last_locked_item_ordinal := previous_item_ordinal;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(persistence_dto->'items') AS values(item)
    WHERE jsonb_typeof(values.item) <> 'object'
  ) THEN
    RAISE EXCEPTION 'invalid persistence item shape' USING ERRCODE = '22023';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(persistence_dto->'items') LOOP
    item_position := item_position + 1;
    IF (SELECT count(*) FROM jsonb_object_keys(item)) <> cardinality(expected_item_keys)
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(item) AS keys(key) WHERE NOT (key = ANY(expected_item_keys)))
       OR EXISTS (SELECT 1 FROM unnest(expected_item_keys) AS keys(key) WHERE NOT (item ? key))
       OR item->>'placeId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR item->>'travelCostVndBefore' IS NULL
       OR item->>'travelCostVndBefore' !~ '^(?:0|[1-9][0-9]*)$'
       OR length(item->>'travelCostVndBefore') > 16
       OR (length(item->>'travelCostVndBefore') = 16 AND item->>'travelCostVndBefore' > '9007199254740991')
       OR item->>'placeCostVnd' IS NULL
       OR item->>'placeCostVnd' !~ '^(?:0|[1-9][0-9]*)$'
       OR length(item->>'placeCostVnd') > 16
       OR (length(item->>'placeCostVnd') = 16 AND item->>'placeCostVnd' > '9007199254740991')
       OR item->>'startAt' IS NULL
       OR item->>'startAt' !~ '^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:00\+07:00$'
       OR item->>'endAt' IS NULL
       OR item->>'endAt' !~ '^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:00\+07:00$'
       OR item->>'visitDurationMinutes' IS NULL
       OR item->>'visitDurationMinutes' !~ '^(?:0|[1-9][0-9]*)$'
       OR length(item->>'visitDurationMinutes') > 3
       OR length(item->>'visitDurationMinutes') = 1
       OR (length(item->>'visitDurationMinutes') = 2 AND item->>'visitDurationMinutes' < '15')
       OR (length(item->>'visitDurationMinutes') = 3 AND item->>'visitDurationMinutes' > '480')
       OR item->>'travelMinutesBefore' IS NULL
       OR item->>'travelMinutesBefore' !~ '^(?:0|[1-9][0-9]*)$'
       OR length(item->>'travelMinutesBefore') > 3
       OR (length(item->>'travelMinutesBefore') = 3 AND item->>'travelMinutesBefore' > '720')
       OR item->>'transitionBufferMinutesBefore' IS NULL
       OR item->>'transitionBufferMinutesBefore' NOT IN ('0', '10')
       OR jsonb_typeof(item->'score') IS DISTINCT FROM 'number'
       OR item->>'score' IS NULL
       OR item->>'score' !~ '^-?(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,12})?$'
       OR NOT EXISTS (
         SELECT 1 FROM public.catalog_snapshot_places
         WHERE snapshot_id = (persistence_dto->>'catalogSnapshotId')::uuid
           AND place_id = (item->>'placeId')::uuid
       ) THEN
       RAISE EXCEPTION 'invalid persistence item or snapshot membership' USING ERRCODE = '23514';
     END IF;
     IF abs((item->>'score')::numeric) > 9007199254740991::numeric THEN
       RAISE EXCEPTION 'invalid persistence item score' USING ERRCODE = '22023';
     END IF;
   END LOOP;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(result_json->'items') AS values(item)
    WHERE jsonb_typeof(values.item) IS DISTINCT FROM 'object'
  ) THEN
    RAISE EXCEPTION 'invalid result item shape' USING ERRCODE = '22023';
  END IF;

  -- Compare the retained engine result to the exact persistence projection by
  -- ordinality.  Money is compared numerically only after each value has
  -- passed the canonical, bounded integer checks above.
  FOR result_item, dto_item IN
    SELECT result_values.item, dto_values.item
    FROM jsonb_array_elements(result_json->'items') WITH ORDINALITY AS result_values(item, ordinal)
    JOIN jsonb_array_elements(persistence_dto->'items') WITH ORDINALITY AS dto_values(item, ordinal)
      USING (ordinal)
  LOOP
    IF (SELECT count(*) FROM jsonb_object_keys(result_item)) <> cardinality(expected_item_keys)
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(result_item) AS keys(key) WHERE NOT (key = ANY(expected_item_keys)))
       OR EXISTS (SELECT 1 FROM unnest(expected_item_keys) AS keys(key) WHERE NOT (result_item ? key))
       OR jsonb_typeof(result_item->'placeId') IS DISTINCT FROM 'string'
       OR jsonb_typeof(result_item->'startAt') IS DISTINCT FROM 'string'
       OR jsonb_typeof(result_item->'endAt') IS DISTINCT FROM 'string'
       OR jsonb_typeof(result_item->'visitDurationMinutes') IS DISTINCT FROM 'number'
       OR jsonb_typeof(result_item->'travelMinutesBefore') IS DISTINCT FROM 'number'
       OR jsonb_typeof(result_item->'transitionBufferMinutesBefore') IS DISTINCT FROM 'number'
       OR jsonb_typeof(result_item->'travelCostVndBefore') IS DISTINCT FROM 'number'
       OR jsonb_typeof(result_item->'placeCostVnd') IS DISTINCT FROM 'number'
       OR jsonb_typeof(result_item->'score') IS DISTINCT FROM 'number'
       OR result_item->>'placeId' IS DISTINCT FROM dto_item->>'placeId'
       OR result_item->>'startAt' IS DISTINCT FROM dto_item->>'startAt'
       OR result_item->>'endAt' IS DISTINCT FROM dto_item->>'endAt'
       OR result_item->>'visitDurationMinutes' IS DISTINCT FROM dto_item->>'visitDurationMinutes'
       OR result_item->>'travelMinutesBefore' IS DISTINCT FROM dto_item->>'travelMinutesBefore'
       OR result_item->>'transitionBufferMinutesBefore' IS DISTINCT FROM dto_item->>'transitionBufferMinutesBefore'
       OR result_item->>'travelCostVndBefore' IS NULL
       OR result_item->>'travelCostVndBefore' !~ '^(?:0|[1-9][0-9]*)$'
       OR length(result_item->>'travelCostVndBefore') > 16
       OR (length(result_item->>'travelCostVndBefore') = 16 AND result_item->>'travelCostVndBefore' > '9007199254740991')
       OR dto_item->>'travelCostVndBefore' IS NULL
       OR dto_item->>'travelCostVndBefore' !~ '^(?:0|[1-9][0-9]*)$'
       OR length(dto_item->>'travelCostVndBefore') > 16
       OR (length(dto_item->>'travelCostVndBefore') = 16 AND dto_item->>'travelCostVndBefore' > '9007199254740991')
       OR result_item->>'placeCostVnd' IS NULL
       OR result_item->>'placeCostVnd' !~ '^(?:0|[1-9][0-9]*)$'
       OR length(result_item->>'placeCostVnd') > 16
       OR (length(result_item->>'placeCostVnd') = 16 AND result_item->>'placeCostVnd' > '9007199254740991')
       OR dto_item->>'placeCostVnd' IS NULL
       OR dto_item->>'placeCostVnd' !~ '^(?:0|[1-9][0-9]*)$'
       OR length(dto_item->>'placeCostVnd') > 16
       OR (length(dto_item->>'placeCostVnd') = 16 AND dto_item->>'placeCostVnd' > '9007199254740991')
       OR result_item->>'score' IS NULL
       OR result_item->>'score' !~ '^-?(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,12})?$'
       OR result_item->>'score' IS DISTINCT FROM dto_item->>'score' THEN
      RAISE EXCEPTION 'result item facts do not match persistence projection' USING ERRCODE = '23514';
    END IF;
    IF abs((result_item->>'score')::numeric) > 9007199254740991::numeric THEN
      RAISE EXCEPTION 'invalid result item score' USING ERRCODE = '22023';
    END IF;
    IF (result_item->>'travelCostVndBefore')::numeric <> (dto_item->>'travelCostVndBefore')::numeric
       OR (result_item->>'placeCostVnd')::numeric <> (dto_item->>'placeCostVnd')::numeric THEN
      RAISE EXCEPTION 'result item facts do not match persistence projection' USING ERRCODE = '23514';
    END IF;
  END LOOP;

  INSERT INTO public.trip_plan_revisions (
    plan_id, revision_no, base_revision_no, request_json, result_json, fingerprint,
    ranking_source, catalog_snapshot_id, travel_snapshot_id, fx_snapshot_id,
    fx_vnd_per_usd, currency, budget_vnd, total_cost_vnd,
    total_duration_minutes, locked_place_ids, actor_user_id
  ) VALUES (
    plan_id,
    next_revision_no,
    base_revision_no,
    persistence_dto->'request',
    persistence_dto->'result',
    persistence_dto->>'fingerprint',
    (persistence_dto->>'rankingSource')::public.ranking_source,
    (persistence_dto->>'catalogSnapshotId')::uuid,
    (persistence_dto->>'travelSnapshotId')::uuid,
    NULLIF(persistence_dto->>'fxSnapshotId', '')::uuid,
    NULLIF(persistence_dto->>'fxVndPerUsd', '')::numeric,
    (persistence_dto->>'currency')::public.currency_code,
    (persistence_dto->>'budgetVnd')::bigint,
    (persistence_dto->>'totalCostVnd')::bigint,
    (persistence_dto->>'totalDurationMinutes')::integer,
    COALESCE(ARRAY(SELECT value::text::uuid FROM jsonb_array_elements_text(persistence_dto->'lockedPlaceIds') AS values(value)), '{}'::uuid[]),
    actor_user_id
  ) ON CONFLICT ON CONSTRAINT trip_plan_revisions_plan_id_revision_no_key DO NOTHING
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
    (persistence_dto->>'catalogSnapshotId')::uuid,
    (item->>'placeId')::uuid,
    (item->>'startAt')::timestamptz,
    (item->>'endAt')::timestamptz,
    (item->>'visitDurationMinutes')::smallint,
    (item->>'travelMinutesBefore')::smallint,
    (item->>'transitionBufferMinutesBefore')::smallint,
    (item->>'travelCostVndBefore')::bigint,
    (item->>'placeCostVnd')::bigint,
    (item->>'score')::numeric
  FROM jsonb_array_elements(persistence_dto->'items') WITH ORDINALITY AS values(item, ordinality);

  INSERT INTO private.recommendation_runs (
    plan_id, revision_id, actor_user_id, ranking_source,
    request_fingerprint, provider_attempted, outcome
  ) VALUES (
    plan_id,
    new_revision_id,
    actor_user_id,
    (persistence_dto->>'rankingSource')::public.ranking_source,
    persistence_dto->>'fingerprint',
    (persistence_dto->>'rankingSource') = 'ai',
    'created'
  );

  UPDATE public.trip_plans
  SET latest_revision_no = next_revision_no
  WHERE id = plan_id;

  revision_id := new_revision_id;
  revision_no := next_revision_no;
  RETURN NEXT;
END;
$function$;
ALTER FUNCTION private.advance_trip_plan_revision(uuid, integer, jsonb) OWNER TO localens_plan_rpc_owner;
REVOKE ALL ON FUNCTION private.advance_trip_plan_revision(uuid, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.advance_trip_plan_revision(uuid, integer, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION private.advance_trip_plan_revision(uuid, integer, jsonb) TO authenticated;

REVOKE CREATE ON SCHEMA private FROM localens_plan_rpc_owner, localens_plan_guard_owner;

COMMIT;
