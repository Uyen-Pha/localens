-- Task 7 pgTAP fixture.  PostgreSQL/Docker is unavailable on this workstation;
-- execute this file in the Task 16 database/RLS/concurrency gate.
BEGIN;

SELECT plan(72);

CREATE TEMP TABLE task7_guest_fixture ON COMMIT DROP AS
WITH fixture AS (
  SELECT
    jsonb_build_object(
      'startAt', '2026-08-20T01:00:00Z',
      'durationMinutes', 60,
      'areas', jsonb_build_array('00000000-0000-0000-0000-000000000703'),
      'budget', jsonb_build_object('currency', 'VND', 'amountMinor', 0),
      'partySize', 1,
      'guideLanguage', 'en',
      'priorityWeights', jsonb_build_object('street_food', 1, 'history', 0, 'traditional_craft', 0, 'traditional_market', 0),
      'pace', 'balanced',
      'dietaryRequirements', jsonb_build_array(),
      'mobilityRequirements', jsonb_build_array(),
      'lockedStopIds', jsonb_build_array()
    ) AS request_json
)
SELECT
  repeat('a', 64) AS token_hash,
  repeat('b', 64) AS device_hash,
  jsonb_build_object(
    'revisionNo', 1,
    'request', request_json,
    'result', jsonb_build_object(
      'normalizedStartAt', '2026-08-20T08:00:00+07:00',
      'budgetVnd', 0,
      'rankingSource', 'deterministic',
      'items', jsonb_build_array(),
      'totals', jsonb_build_object('durationMinutes', 0, 'visitMinutes', 0, 'travelMinutes', 0, 'transitionBufferMinutes', 0, 'groupCostVnd', 0, 'score', 0),
      'snapshotIds', jsonb_build_object('catalog', '00000000-0000-0000-0000-000000000702', 'travel', '00000000-0000-0000-0000-000000000705', 'fx', NULL::text)
    ),
    'fingerprint', repeat('c', 64),
    'rankingSource', 'deterministic',
    'catalogSnapshotId', '00000000-0000-0000-0000-000000000702',
    'travelSnapshotId', '00000000-0000-0000-0000-000000000705',
    'fxSnapshotId', NULL::text,
    'fxVndPerUsd', NULL::text,
    'currency', 'VND',
    'budgetVnd', '0',
    'totalCostVnd', '0',
    'totalDurationMinutes', 0,
    'lockedPlaceIds', jsonb_build_array(),
    'items', jsonb_build_array()
  ) AS revision_dto
FROM fixture;
UPDATE task7_guest_fixture
SET revision_dto = jsonb_build_object(
  'revision', revision_dto,
  'tokenHash', token_hash,
  'pepperVersion', 1
);
ALTER TABLE task7_guest_fixture RENAME COLUMN revision_dto TO create_args;
ALTER TABLE task7_guest_fixture ADD COLUMN revision_dto jsonb;
UPDATE task7_guest_fixture SET revision_dto = create_args->'revision';
GRANT SELECT ON task7_guest_fixture TO authenticated, localens_guest_executor, localens_quota_executor;

SELECT ok(to_regclass('private.guest_bindings') IS NOT NULL, 'guest bindings table exists');
SELECT ok(to_regclass('private.guest_capabilities') IS NOT NULL, 'guest capabilities table exists');
SELECT ok(to_regclass('private.quota_buckets') IS NOT NULL, 'quota buckets table exists');
SELECT ok(to_regclass('private.quota_global_buckets') IS NOT NULL, 'global quota table exists');
SELECT ok(to_regclass('private.quota_reservations') IS NOT NULL, 'quota reservations table exists');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'private.guest_bindings'::regclass), 'guest bindings force RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'private.guest_capabilities'::regclass), 'guest capabilities force RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'private.quota_buckets'::regclass), 'quota buckets force RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'private.quota_global_buckets'::regclass), 'global quota force RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'private.quota_reservations'::regclass), 'quota reservations force RLS');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trip_plans_guest_binding_fk' AND conrelid = 'public.trip_plans'::regclass), 'plan has guest binding FK');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guest_bindings_plan_id_key'), 'one binding per plan is constrained');
SELECT ok(EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'guest_capabilities_one_active_plan'), 'one active capability per binding is constrained');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'private.guest_capabilities'::regclass AND pg_get_constraintdef(oid) LIKE '%token_hash%'), 'capability hash is constrained');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'private.quota_reservations'::regclass AND pg_get_constraintdef(oid) LIKE '%reservation_id%'), 'reservation idempotency is unique');
SELECT ok(NOT has_table_privilege('anon', 'private.guest_bindings', 'SELECT') AND NOT has_table_privilege('authenticated', 'private.guest_capabilities', 'SELECT'), 'API roles cannot read capability tables');
SELECT ok(NOT has_table_privilege('anon', 'public.trip_plans', 'SELECT'), 'anon cannot read plans directly');
SELECT ok(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'private' AND table_name = 'guest_capabilities' AND column_name IN ('raw_token', 'guest_token')), 'raw token is absent from capability storage');
SELECT ok((SELECT rolcanlogin = false AND rolbypassrls = false FROM pg_roles WHERE rolname = 'localens_guest_rpc_owner'), 'guest definer owner is non-login and no-bypass');
SELECT ok((SELECT rolcanlogin AND rolinherit = false AND rolbypassrls = false FROM pg_roles WHERE rolname = 'localens_guest_executor'), 'guest executor is isolated');
SELECT ok(NOT pg_has_role('localens_guest_executor', 'localens_guest_rpc_owner', 'member'), 'executor is not a definer-owner member');
SELECT ok((SELECT prosecdef AND proconfig @> ARRAY['search_path='] FROM pg_proc WHERE oid = 'private.create_guest_plan(jsonb)'::regprocedure), 'create function is pinned SECURITY DEFINER');
SELECT ok((SELECT prosecdef AND proconfig @> ARRAY['search_path='] FROM pg_proc WHERE oid = 'public.claim_guest_plan(uuid,text,smallint)'::regprocedure), 'public claim wrapper is pinned SECURITY DEFINER');
SELECT is((SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'public.claim_guest_plan(uuid,text,smallint)'::regprocedure), 'localens_claim_rpc_owner', 'claim wrapper has separate owner');
SELECT ok(has_function_privilege('authenticated', 'public.claim_guest_plan(uuid,text,smallint)', 'EXECUTE'), 'authenticated can claim');
SELECT ok(NOT has_function_privilege('anon', 'public.claim_guest_plan(uuid,text,smallint)', 'EXECUTE'), 'anon cannot claim');
SELECT ok(has_function_privilege('authenticated', 'public.advance_trip_plan_revision(uuid,integer,jsonb)', 'EXECUTE'), 'authenticated can refine as owner');
SELECT ok(NOT has_function_privilege('authenticated', 'private.advance_guest_trip_plan_revision(uuid,integer,jsonb,jsonb)', 'EXECUTE'), 'authenticated cannot invoke guest CAS');
SELECT ok(has_function_privilege('localens_guest_executor', 'private.create_guest_plan(jsonb)', 'EXECUTE'), 'internal guest executor can create');
SELECT ok(has_function_privilege('localens_guest_executor', 'private.advance_guest_trip_plan_revision(uuid,integer,jsonb,jsonb)', 'EXECUTE'), 'internal guest executor can refine');
SELECT ok(has_function_privilege('localens_quota_executor', 'private.reserve_quota(uuid,text,text[])', 'EXECUTE'), 'internal quota executor can reserve');
SELECT ok(NOT has_table_privilege('localens_guest_executor', 'private.guest_capabilities', 'SELECT'), 'guest executor has no base capability table access');
SELECT ok(NOT has_table_privilege('localens_quota_executor', 'private.quota_buckets', 'SELECT'), 'quota executor has no base quota table access');
SELECT ok(has_schema_privilege('localens_guest_executor', 'private', 'USAGE') AND has_schema_privilege('localens_quota_executor', 'private', 'USAGE'), 'internal executors have only schema usage');
SELECT ok(NOT has_schema_privilege('authenticated', 'private', 'USAGE'), 'authenticated cannot resolve private implementation schema');
SELECT ok((SELECT pg_get_constraintdef(oid) LIKE '%DEFERRABLE INITIALLY DEFERRED%' FROM pg_constraint WHERE conname = 'trip_plans_guest_binding_fk'), 'guest plan FK is deferrable for atomic creation');
SELECT ok((SELECT column_default LIKE '%24 hours%' FROM information_schema.columns WHERE table_schema = 'private' AND table_name = 'guest_bindings' AND column_name = 'expires_at'), 'expiry uses database clock plus 24 hours');
SELECT ok((SELECT pg_get_functiondef('private.validate_trip_plan_revision_dto(jsonb)'::regprocedure)::text LIKE '%expected_item_keys%'), 'shared DTO validator exists');

INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000701'::uuid, 'authenticated', 'authenticated', 'guest-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.catalog_snapshots (id, status, published_at)
VALUES ('00000000-0000-0000-0000-000000000702'::uuid, 'building', NULL)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.catalog_snapshot_areas (snapshot_id, area_id, slug)
VALUES ('00000000-0000-0000-0000-000000000702'::uuid, '00000000-0000-0000-0000-000000000703'::uuid, 'guest-test-area')
ON CONFLICT DO NOTHING;
INSERT INTO public.catalog_snapshot_places (snapshot_id, place_id, area_id, slug, price_vnd_per_person, visit_duration_minutes, source_url, verified_at, attribution)
VALUES ('00000000-0000-0000-0000-000000000702'::uuid, '00000000-0000-0000-0000-000000000704'::uuid, '00000000-0000-0000-0000-000000000703'::uuid, 'guest-test-place', 0, 60, 'https://example.invalid/guest-place', DATE '2026-08-20', 'fixture')
ON CONFLICT DO NOTHING;
UPDATE public.catalog_snapshots
SET status = 'published', published_at = clock_timestamp()
WHERE id = '00000000-0000-0000-0000-000000000702'::uuid;
INSERT INTO public.travel_snapshots (id, catalog_snapshot_id, status, published_at)
VALUES ('00000000-0000-0000-0000-000000000705'::uuid, '00000000-0000-0000-0000-000000000702'::uuid, 'building', NULL)
ON CONFLICT (id) DO NOTHING;
UPDATE public.travel_snapshots
SET status = 'published', published_at = clock_timestamp()
WHERE id = '00000000-0000-0000-0000-000000000705'::uuid;

SET LOCAL ROLE localens_guest_executor;
SELECT throws_ok($$SELECT * FROM private.create_guest_plan(jsonb_set((SELECT create_args FROM task7_guest_fixture), '{rawToken}', to_jsonb('raw-token'::text), true))$$, '22023', NULL, 'raw token and extra create key are rejected');
SELECT lives_ok($$SELECT * FROM private.create_guest_plan((SELECT create_args FROM task7_guest_fixture))$$, 'internal create atomically persists the guest plan');
RESET ROLE;

CREATE TEMP TABLE task7_created ON COMMIT DROP AS
SELECT id AS plan_id, guest_binding_id
FROM public.trip_plans
WHERE owner_user_id IS NULL AND guest_binding_id IS NOT NULL;
GRANT SELECT ON task7_created TO authenticated, localens_guest_executor;
SELECT is((SELECT count(*)::integer FROM task7_created), 1, 'one unclaimed guest plan was created');
SELECT is((SELECT count(*)::integer FROM private.guest_bindings WHERE plan_id = (SELECT plan_id FROM task7_created)), 1, 'one binding accompanies the plan');
SELECT is((SELECT count(*)::integer FROM private.guest_capabilities WHERE binding_id = (SELECT guest_binding_id FROM task7_created)), 1, 'one capability accompanies the binding');
SELECT is((SELECT count(*)::integer FROM public.trip_plan_revisions WHERE plan_id = (SELECT plan_id FROM task7_created)), 1, 'guest creation records revision one');
SELECT is((SELECT count(*)::integer FROM private.recommendation_runs WHERE plan_id = (SELECT plan_id FROM task7_created)), 1, 'guest creation records one recommendation run');
SELECT ok((SELECT owner_user_id IS NULL FROM public.trip_plans WHERE id = (SELECT plan_id FROM task7_created)), 'created plan is unowned');
SELECT ok((SELECT expires_at > clock_timestamp() AND expires_at <= clock_timestamp() + interval '25 hours' FROM private.guest_bindings WHERE plan_id = (SELECT plan_id FROM task7_created)), 'expiry is database-derived and about 24 hours');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
SELECT lives_ok($$SELECT * FROM public.claim_guest_plan((SELECT plan_id FROM task7_created), (SELECT token_hash FROM task7_guest_fixture), 1)$$, 'authenticated claim succeeds once');
SELECT throws_ok($$SELECT * FROM public.claim_guest_plan((SELECT plan_id FROM task7_created), (SELECT token_hash FROM task7_guest_fixture), 1)$$, 'P0001', 'guest claim failed', 'replayed claim is non-enumerating');
SELECT is((SELECT owner_user_id::text FROM public.trip_plans WHERE id = (SELECT plan_id FROM task7_created)), '00000000-0000-0000-0000-000000000701', 'claim derives owner from auth.uid');
RESET ROLE;
SELECT ok((SELECT claimed_by::text = '00000000-0000-0000-0000-000000000701' FROM private.guest_bindings WHERE id = (SELECT guest_binding_id FROM task7_created)), 'binding records the claiming user');
SELECT ok((SELECT revoked_at IS NOT NULL FROM private.guest_capabilities WHERE binding_id = (SELECT guest_binding_id FROM task7_created)), 'claim revokes the capability');

SET LOCAL ROLE localens_guest_executor;
SELECT throws_ok($$SELECT * FROM private.advance_guest_trip_plan_revision((SELECT plan_id FROM task7_created), 1, jsonb_set((SELECT revision_dto FROM task7_guest_fixture), '{revisionNo}', to_jsonb(2), false), jsonb_build_object('planId', (SELECT plan_id FROM task7_created)::text, 'tokenHash', (SELECT token_hash FROM task7_guest_fixture), 'pepperVersion', 1))$$, '42501', NULL, 'claimed plan rejects guest refinement');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
SELECT lives_ok($$SELECT * FROM public.advance_trip_plan_revision((SELECT plan_id FROM task7_created), 1, jsonb_set((SELECT revision_dto FROM task7_guest_fixture), '{revisionNo}', to_jsonb(2), false))$$, 'claimed owner can use public owner CAS');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.trip_plan_revisions WHERE plan_id = (SELECT plan_id FROM task7_created)), 2, 'owner CAS appends exactly one revision');

SET LOCAL ROLE localens_quota_executor;
SELECT lives_ok($$SELECT * FROM private.reserve_quota('00000000-0000-0000-0000-000000000721'::uuid, 'planner', ARRAY[(SELECT token_hash FROM task7_guest_fixture), (SELECT device_hash FROM task7_guest_fixture)])$$, 'planner quota reserves both semantic buckets');
SELECT lives_ok($$SELECT * FROM private.reserve_quota('00000000-0000-0000-0000-000000000721'::uuid, 'planner', ARRAY[(SELECT token_hash FROM task7_guest_fixture), (SELECT device_hash FROM task7_guest_fixture)])$$, 'same planner reservation is idempotent');
SELECT throws_ok($$SELECT * FROM private.reserve_quota('00000000-0000-0000-0000-000000000721'::uuid, 'gemini', ARRAY[(SELECT token_hash FROM task7_guest_fixture), (SELECT device_hash FROM task7_guest_fixture)])$$, '22023', NULL, 'reservation id cannot change kind');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM private.quota_reservations WHERE reservation_id = '00000000-0000-0000-0000-000000000721'::uuid), 1, 'idempotent retry has one reservation row');
SELECT is((SELECT count(*)::integer FROM private.quota_buckets WHERE period_start = (SELECT period_start FROM private.quota_reservations WHERE reservation_id = '00000000-0000-0000-0000-000000000721'::uuid)), 2, 'planner uses exactly two non-global buckets');
SELECT ok((SELECT extract(minute FROM period_start) = 0 AND extract(second FROM period_start) = 0 FROM private.quota_reservations WHERE reservation_id = '00000000-0000-0000-0000-000000000721'::uuid), 'planner period is UTC hour boundary');
SELECT ok((SELECT used_count = 1 FROM private.quota_buckets WHERE bucket_kind = 'planner_ip' AND bucket_hash = (SELECT token_hash FROM task7_guest_fixture)), 'planner IP bucket consumed once');
SELECT ok((SELECT used_count = 1 FROM private.quota_buckets WHERE bucket_kind = 'planner_device' AND bucket_hash = (SELECT device_hash FROM task7_guest_fixture)), 'planner device bucket consumed once');

-- Boundary/all-or-none checks are prepared by the fixture role and assert no
-- partial increment when one bucket or the Gemini global row is exhausted.
UPDATE private.quota_buckets SET used_count = limit_count
WHERE bucket_hash = (SELECT token_hash FROM task7_guest_fixture) AND bucket_kind = 'planner_ip';
SET LOCAL ROLE localens_quota_executor;
SELECT throws_ok($$SELECT * FROM private.reserve_quota('00000000-0000-0000-0000-000000000722'::uuid, 'planner', ARRAY[(SELECT token_hash FROM task7_guest_fixture), (SELECT device_hash FROM task7_guest_fixture)])$$, 'P0001', NULL, 'planner limit rejects without partial increment');
RESET ROLE;
SELECT is((SELECT used_count FROM private.quota_buckets WHERE bucket_kind = 'planner_device' AND bucket_hash = (SELECT device_hash FROM task7_guest_fixture)), 1, 'planner all-or-none keeps sibling bucket unchanged');

SET LOCAL ROLE localens_quota_executor;
SELECT lives_ok($$SELECT * FROM private.reserve_quota('00000000-0000-0000-0000-000000000723'::uuid, 'gemini', ARRAY[(SELECT token_hash FROM task7_guest_fixture), (SELECT device_hash FROM task7_guest_fixture)])$$, 'Gemini reservation records both buckets and global cap');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM private.quota_global_buckets), 1, 'Gemini has one global row for the UTC day');
SELECT is((SELECT used_count FROM private.quota_global_buckets), 1, 'Gemini consumes the global row');
UPDATE private.quota_global_buckets SET used_count = limit_count;
SET LOCAL ROLE localens_quota_executor;
SELECT throws_ok($$SELECT * FROM private.reserve_quota('00000000-0000-0000-0000-000000000724'::uuid, 'gemini', ARRAY[(SELECT token_hash FROM task7_guest_fixture), (SELECT device_hash FROM task7_guest_fixture)])$$, 'P0001', NULL, 'global Gemini cap rejects');
RESET ROLE;
SELECT is((SELECT used_count FROM private.quota_buckets WHERE bucket_kind = 'gemini_ip'), 1, 'global rejection leaves Gemini IP increment unchanged');
SELECT is((SELECT used_count FROM private.quota_buckets WHERE bucket_kind = 'gemini_device'), 1, 'global rejection leaves Gemini device increment unchanged');
SELECT is((SELECT used_count FROM private.quota_global_buckets), 100, 'global cap remains exactly 100');

SELECT * FROM finish();
ROLLBACK;
