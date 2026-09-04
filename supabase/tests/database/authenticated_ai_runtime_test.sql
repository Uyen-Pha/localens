BEGIN;

SELECT plan(49);

GRANT USAGE ON SCHEMA extensions TO authenticated, service_role;
SELECT set_config('search_path', 'public, extensions, pg_catalog', true);

-- The fixture deliberately includes unpublished metadata, a newer demo FX
-- observation, and two published travel snapshots so the projections must
-- apply both visibility and deterministic-ordering rules.
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000004101'::uuid, 'authenticated', 'authenticated', 'ai-customer-one@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000004102'::uuid, 'authenticated', 'authenticated', 'ai-customer-two@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000004103'::uuid, 'authenticated', 'authenticated', 'ai-non-customer@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.user_roles (user_id, role)
VALUES
  ('00000000-0000-0000-0000-000000004101'::uuid, 'customer'::public.app_role),
  ('00000000-0000-0000-0000-000000004102'::uuid, 'customer'::public.app_role)
ON CONFLICT DO NOTHING;

DELETE FROM private.user_roles
WHERE user_id = '00000000-0000-0000-0000-000000004103'::uuid;
INSERT INTO private.user_roles (user_id, role)
VALUES ('00000000-0000-0000-0000-000000004103'::uuid, 'admin'::public.app_role)
ON CONFLICT DO NOTHING;

INSERT INTO public.catalog_snapshots (id, status, published_at)
VALUES
  ('00000000-0000-0000-0000-000000004110'::uuid, 'building', NULL),
  ('00000000-0000-0000-0000-000000004119'::uuid, 'building', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.catalog_snapshot_areas (snapshot_id, area_id, slug)
VALUES
  ('00000000-0000-0000-0000-000000004110'::uuid, '00000000-0000-0000-0000-000000004111'::uuid, 'ai-runtime-published-area'),
  ('00000000-0000-0000-0000-000000004119'::uuid, '00000000-0000-0000-0000-000000004118'::uuid, 'ai-runtime-building-area')
ON CONFLICT DO NOTHING;

INSERT INTO public.catalog_snapshot_places (
  snapshot_id, place_id, area_id, slug, price_vnd_per_person,
  visit_duration_minutes, source_url, verified_at, attribution
)
VALUES (
  '00000000-0000-0000-0000-000000004110'::uuid,
  '00000000-0000-0000-0000-000000004112'::uuid,
  '00000000-0000-0000-0000-000000004111'::uuid,
  'ai-runtime-place', 0, 60,
  'https://example.invalid/ai-runtime-place', DATE '2026-09-04', 'pgTAP fixture'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.catalog_snapshot_place_translations (
  snapshot_id, place_id, locale, title, summary, description
)
VALUES (
  '00000000-0000-0000-0000-000000004110'::uuid,
  '00000000-0000-0000-0000-000000004112'::uuid,
  'vi'::public.locale,
  'Điểm đến AI runtime', 'Tóm tắt công khai', 'Mô tả không thuộc projection hẹp'
)
ON CONFLICT DO NOTHING;

UPDATE public.catalog_snapshots
SET status = 'published'::public.snapshot_status,
    published_at = TIMESTAMPTZ '2099-09-04 00:00:00+00'
WHERE id = '00000000-0000-0000-0000-000000004110'::uuid;

INSERT INTO public.travel_snapshots (id, catalog_snapshot_id, status, published_at)
VALUES
  ('00000000-0000-0000-0000-000000004113'::uuid, '00000000-0000-0000-0000-000000004110'::uuid, 'building', NULL),
  ('00000000-0000-0000-0000-000000004114'::uuid, '00000000-0000-0000-0000-000000004110'::uuid, 'building', NULL)
ON CONFLICT (id) DO NOTHING;

UPDATE public.travel_snapshots
SET status = 'published'::public.snapshot_status,
    published_at = CASE id
      WHEN '00000000-0000-0000-0000-000000004113'::uuid THEN TIMESTAMPTZ '2099-09-04 01:00:00+00'
      ELSE TIMESTAMPTZ '2099-09-04 02:00:00+00'
    END
WHERE id IN (
  '00000000-0000-0000-0000-000000004113'::uuid,
  '00000000-0000-0000-0000-000000004114'::uuid
);

INSERT INTO public.fx_snapshots (id, vnd_per_usd, source, observed_at, environment, is_demo)
VALUES
  ('00000000-0000-0000-0000-000000004115'::uuid, 25000.00000000, 'ai-runtime-production', clock_timestamp() - INTERVAL '1 minute', 'production', false),
  ('00000000-0000-0000-0000-000000004116'::uuid, 26000.00000000, 'ai-runtime-demo-newer', clock_timestamp(), 'demo', true),
  ('00000000-0000-0000-0000-000000004117'::uuid, 24000.00000000, 'ai-runtime-production-stale', clock_timestamp() - INTERVAL '8 days', 'production', false)
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE ai_runtime_fixture ON COMMIT DROP AS
WITH request_fixture AS (
  SELECT jsonb_build_object(
    'startAt', '2026-09-04T01:00:00Z',
    'durationMinutes', 60,
    'areas', jsonb_build_array('00000000-0000-0000-0000-000000004111'),
    'budget', jsonb_build_object('currency', 'VND', 'amountMinor', 0),
    'partySize', 1,
    'guideLanguage', 'vi',
    'priorityWeights', jsonb_build_object(
      'street_food', 0, 'history', 1,
      'traditional_craft', 0, 'traditional_market', 0
    ),
    'pace', 'balanced',
    'dietaryRequirements', jsonb_build_array(),
    'mobilityRequirements', jsonb_build_array(),
    'lockedStopIds', jsonb_build_array()
  ) AS request_json
)
SELECT jsonb_build_object(
  'revisionNo', 1,
  'request', request_json,
  'result', jsonb_build_object(
    'normalizedStartAt', '2026-09-04T08:00:00+07:00',
    'budgetVnd', 0,
    'rankingSource', 'deterministic',
    'items', jsonb_build_array(),
    'totals', jsonb_build_object(
      'durationMinutes', 0,
      'visitMinutes', 0,
      'travelMinutes', 0,
      'transitionBufferMinutes', 0,
      'admissionCostVnd', 0,
      'foodCostMinVnd', 0,
      'foodCostMaxVnd', 0,
      'travelCostVnd', 0,
      'guideCostVnd', 0,
      'payAtVendorMinVnd', 0,
      'payAtVendorMaxVnd', 0,
      'customerPayableVnd', 0,
      'groupCostMinVnd', 0,
      'groupCostMaxVnd', 0,
      'groupCostVnd', 0,
      'score', 0
    ),
    'snapshotIds', jsonb_build_object(
      'catalog', '00000000-0000-0000-0000-000000004110',
      'travel', '00000000-0000-0000-0000-000000004114',
      'fx', NULL::text
    )
  ),
  'fingerprint', repeat('a', 64),
  'rankingSource', 'deterministic',
  'catalogSnapshotId', '00000000-0000-0000-0000-000000004110',
  'travelSnapshotId', '00000000-0000-0000-0000-000000004114',
  'fxSnapshotId', NULL::text,
  'fxVndPerUsd', NULL::text,
  'currency', 'VND',
  'budgetVnd', '0',
  'totalCostVnd', '0',
  'totalDurationMinutes', 0,
  'lockedPlaceIds', jsonb_build_array(),
  'items', jsonb_build_array()
) AS persistence_dto
FROM request_fixture;

GRANT SELECT ON ai_runtime_fixture TO authenticated;

SELECT extensions.ok(
  to_regclass('public.current_itinerary_snapshot_v') IS NOT NULL
  AND to_regclass('public.catalog_snapshot_areas_v') IS NOT NULL
  AND to_regclass('public.catalog_snapshot_place_display_v') IS NOT NULL,
  'all authenticated AI runtime projections exist'
);
SELECT extensions.ok((
  SELECT bool_and(
    'security_barrier=true' = ANY(COALESCE(reloptions, '{}'::text[]))
    AND 'security_invoker=false' = ANY(COALESCE(reloptions, '{}'::text[]))
  )
  FROM pg_class
  WHERE oid IN (
    'public.current_itinerary_snapshot_v'::regclass,
    'public.catalog_snapshot_areas_v'::regclass,
    'public.catalog_snapshot_place_display_v'::regclass
  )
), 'AI runtime projections are definer-owned security barriers');
SELECT extensions.ok((
  SELECT bool_and(pg_get_userbyid(relowner) = 'localens_catalog_rpc_owner')
  FROM pg_class
  WHERE oid IN (
    'public.current_itinerary_snapshot_v'::regclass,
    'public.catalog_snapshot_areas_v'::regclass,
    'public.catalog_snapshot_place_display_v'::regclass
  )
), 'catalog projection owner owns every AI runtime view');
SELECT extensions.ok(
  has_table_privilege('anon', 'public.current_itinerary_snapshot_v', 'SELECT')
  AND has_table_privilege('anon', 'public.catalog_snapshot_areas_v', 'SELECT')
  AND has_table_privilege('anon', 'public.catalog_snapshot_place_display_v', 'SELECT'),
  'anon can read only the narrow public projections'
);
SELECT extensions.ok(
  has_table_privilege('authenticated', 'public.current_itinerary_snapshot_v', 'SELECT')
  AND has_table_privilege('authenticated', 'public.catalog_snapshot_areas_v', 'SELECT')
  AND has_table_privilege('authenticated', 'public.catalog_snapshot_place_display_v', 'SELECT'),
  'authenticated can read the narrow public projections'
);
SELECT extensions.ok(NOT EXISTS (
  SELECT 1
  FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS roles(role_name)
  CROSS JOIN unnest(ARRAY[
    'public.current_itinerary_snapshot_v',
    'public.catalog_snapshot_areas_v',
    'public.catalog_snapshot_place_display_v'
  ]) AS views(view_name)
  WHERE has_table_privilege(roles.role_name, views.view_name, 'INSERT')
     OR has_table_privilege(roles.role_name, views.view_name, 'UPDATE')
     OR has_table_privilege(roles.role_name, views.view_name, 'DELETE')
     OR has_table_privilege(roles.role_name, views.view_name, 'TRUNCATE')
), 'API roles cannot mutate AI runtime projections');
SELECT extensions.is((
  SELECT count(*)::integer
  FROM public.catalog_snapshot_areas_v
  WHERE area_id = '00000000-0000-0000-0000-000000004111'::uuid
), 1, 'published area metadata is visible');
SELECT extensions.is((
  SELECT count(*)::integer
  FROM public.catalog_snapshot_areas_v
  WHERE area_id = '00000000-0000-0000-0000-000000004118'::uuid
), 0, 'building area metadata stays hidden');
SELECT extensions.is((
  SELECT title || ':' || summary
  FROM public.catalog_snapshot_place_display_v
  WHERE place_id = '00000000-0000-0000-0000-000000004112'::uuid
    AND locale = 'vi'::public.locale
), 'Điểm đến AI runtime:Tóm tắt công khai', 'display projection exposes only published localized metadata');
SELECT extensions.is((SELECT count(*)::integer FROM public.current_itinerary_snapshot_v), 1, 'current bundle returns exactly one row');
SELECT extensions.is((SELECT travel_snapshot_id::text FROM public.current_itinerary_snapshot_v), '00000000-0000-0000-0000-000000004114', 'current bundle deterministically chooses the latest travel snapshot');
SELECT extensions.is((SELECT fx_snapshot_id::text || ':' || fx_environment || ':' || fx_is_demo::text FROM public.current_itinerary_snapshot_v), '00000000-0000-0000-0000-000000004115:production:false', 'current bundle ignores newer demo and stale production FX rows');
SELECT extensions.ok(
  to_regclass('public.itinerary_travel_snapshot_history_v') IS NOT NULL
  AND to_regclass('public.itinerary_fx_snapshot_history_v') IS NOT NULL,
  'authenticated refinement history projections exist'
);
SELECT extensions.is((
  SELECT count(*)::integer
  FROM pg_class
  WHERE oid IN (
    to_regclass('public.itinerary_travel_snapshot_history_v'),
    to_regclass('public.itinerary_fx_snapshot_history_v')
  )
    AND pg_get_userbyid(relowner) = 'localens_catalog_rpc_owner'
    AND 'security_barrier=true' = ANY(COALESCE(reloptions, '{}'::text[]))
    AND 'security_invoker=false' = ANY(COALESCE(reloptions, '{}'::text[]))
), 2, 'refinement history projections use the narrow catalog owner boundary');
SELECT extensions.is((
  SELECT count(*)::integer
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN ('itinerary_travel_snapshot_history_v', 'itinerary_fx_snapshot_history_v')
    AND grantee = 'authenticated'
    AND privilege_type = 'SELECT'
), 2, 'only authenticated runtime clients receive history projection reads');
SELECT extensions.ok(
  COALESCE(pg_get_viewdef(to_regclass('public.itinerary_travel_snapshot_history_v'), true), '') LIKE '%status = ''published''%'
  AND COALESCE(pg_get_viewdef(to_regclass('public.itinerary_fx_snapshot_history_v'), true), '') LIKE '%environment = ''production''%'
  AND COALESCE(pg_get_viewdef(to_regclass('public.itinerary_fx_snapshot_history_v'), true), '') LIKE '%is_demo IS FALSE%',
  'history projections expose only immutable published production facts'
);

SELECT extensions.ok(has_function_privilege('authenticated', 'public.create_authenticated_trip_plan(uuid,jsonb)', 'EXECUTE'), 'authenticated can create its initial itinerary revision');
SELECT extensions.ok(
  NOT has_function_privilege('anon', 'public.create_authenticated_trip_plan(uuid,jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'public.create_authenticated_trip_plan(uuid,jsonb)', 'EXECUTE'),
  'initial authenticated plan creation is denied to every other API role'
);
SELECT extensions.ok(has_function_privilege('service_role', 'public.reserve_ai_quota(uuid,text,text,text)', 'EXECUTE'), 'service role can reserve AI quota');
SELECT extensions.ok(
  NOT has_function_privilege('anon', 'public.reserve_ai_quota(uuid,text,text,text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.reserve_ai_quota(uuid,text,text,text)', 'EXECUTE'),
  'browser roles cannot reserve AI quota'
);
SELECT extensions.ok(
  NOT has_table_privilege('localens_ai_quota_rpc_owner', 'private.quota_buckets', 'SELECT')
  AND NOT has_table_privilege('localens_ai_quota_rpc_owner', 'private.quota_reservations', 'INSERT')
  AND has_function_privilege('localens_ai_quota_rpc_owner', 'private.reserve_quota(uuid,text,text,text)', 'EXECUTE'),
  'quota wrapper owner retains only helper execution authority'
);
SELECT extensions.ok((
  SELECT bool_and(
    pg_get_userbyid(proowner) = CASE proname
      WHEN 'create_authenticated_trip_plan' THEN 'localens_plan_rpc_owner'
      ELSE 'localens_ai_quota_rpc_owner'
    END
  )
  FROM pg_proc
  WHERE oid IN (
    'public.create_authenticated_trip_plan(uuid,jsonb)'::regprocedure,
    'public.reserve_ai_quota(uuid,text,text,text)'::regprocedure
  )
) IS NOT FALSE, 'public runtime functions have narrow owners');
SELECT extensions.ok(
  NOT has_schema_privilege('localens_plan_rpc_owner', 'public', 'CREATE')
  AND NOT has_schema_privilege('localens_ai_quota_rpc_owner', 'public', 'CREATE'),
  'temporary public-schema creation grants are revoked'
);

CREATE TEMP TABLE ai_runtime_created (
  plan_id uuid,
  revision_no integer
) ON COMMIT DROP;
GRANT INSERT, SELECT ON ai_runtime_created TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000004101', 'role', 'authenticated')::text,
  true
);
SELECT extensions.lives_ok($$
  INSERT INTO ai_runtime_created
  SELECT *
  FROM public.create_authenticated_trip_plan(
    '00000000-0000-0000-0000-000000004121'::uuid,
    (SELECT persistence_dto FROM ai_runtime_fixture)
  )
$$, 'authenticated customer creates revision one from JWT claims fallback');
RESET ROLE;
SELECT extensions.is((SELECT count(*)::integer FROM ai_runtime_created), 1, 'create RPC returns one plan binding');
SELECT extensions.is((
  SELECT owner_user_id::text || ':' || latest_revision_no::text
  FROM public.trip_plans
  WHERE id = '00000000-0000-0000-0000-000000004121'::uuid
), '00000000-0000-0000-0000-000000004101:1', 'created plan is owned by the authenticated customer at revision one');
SELECT extensions.ok(
  (SELECT count(*) = 1 FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000004121'::uuid)
  AND (SELECT count(*) = 1 FROM private.recommendation_runs WHERE plan_id = '00000000-0000-0000-0000-000000004121'::uuid),
  'creation persists exactly one immutable revision and recommendation run'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000004101', 'role', 'authenticated')::text,
  true
);
SELECT extensions.is((
  SELECT count(*)::integer
  FROM public.trip_plans
  WHERE id = '00000000-0000-0000-0000-000000004121'::uuid
), 1, 'owner reads the plan through claims JSON used by PostgREST');
SELECT extensions.is((
  SELECT count(*)::integer
  FROM public.trip_plan_revisions
  WHERE plan_id = '00000000-0000-0000-0000-000000004121'::uuid
), 1, 'owner reads the revision through claims JSON used by PostgREST');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000004101', true);
SELECT extensions.lives_ok($$
  SELECT *
  FROM public.create_authenticated_trip_plan(
    '00000000-0000-0000-0000-000000004121'::uuid,
    (SELECT persistence_dto FROM ai_runtime_fixture)
  )
$$, 'exact create replay succeeds idempotently');
RESET ROLE;
SELECT extensions.ok(
  (SELECT count(*) = 1 FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000004121'::uuid)
  AND (SELECT count(*) = 1 FROM private.recommendation_runs WHERE plan_id = '00000000-0000-0000-0000-000000004121'::uuid),
  'exact create replay adds no history rows'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000004101', true);
SELECT extensions.throws_ok($$
  SELECT *
  FROM public.create_authenticated_trip_plan(
    '00000000-0000-0000-0000-000000004121'::uuid,
    jsonb_set((SELECT persistence_dto FROM ai_runtime_fixture), '{fingerprint}', to_jsonb(repeat('b', 64)), false)
  )
$$, 'P0001', 'PLAN_CONFLICT', 'same plan id with a different fingerprint conflicts');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000004102', true);
SELECT extensions.is((
  SELECT count(*)::integer
  FROM public.trip_plans
  WHERE id = '00000000-0000-0000-0000-000000004121'::uuid
), 0, 'another authenticated customer cannot read the created plan');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000004103', true);
SELECT extensions.throws_ok($$
  SELECT *
  FROM public.create_authenticated_trip_plan(
    '00000000-0000-0000-0000-000000004122'::uuid,
    (SELECT persistence_dto FROM ai_runtime_fixture)
  )
$$, '42501', 'customer role required', 'authenticated principal without customer role is rejected');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000004101', true);
SELECT extensions.throws_ok($$
  SELECT *
  FROM public.create_authenticated_trip_plan(
    '00000000-0000-0000-0000-000000004123'::uuid,
    '{}'::jsonb
  )
$$, '22023', 'invalid food persistence DTO', 'malformed persistence DTO is rejected');
RESET ROLE;
SELECT extensions.is((
  SELECT count(*)::integer
  FROM public.trip_plans
  WHERE id = '00000000-0000-0000-0000-000000004123'::uuid
), 0, 'failed validation rolls back the empty plan row');

SELECT extensions.ok(
  to_regprocedure('public.advance_authenticated_trip_plan_revision(uuid,integer,jsonb)') IS NOT NULL,
  'authenticated refinement wrapper exists'
);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000004101', 'role', 'authenticated')::text,
  true
);
SELECT extensions.lives_ok($$
  SELECT *
  FROM public.advance_authenticated_trip_plan_revision(
    '00000000-0000-0000-0000-000000004121'::uuid,
    1,
    jsonb_set(
      jsonb_set((SELECT persistence_dto FROM ai_runtime_fixture), '{revisionNo}', to_jsonb(2), false),
      '{fingerprint}', to_jsonb(repeat('d', 64)), false
    )
  )
$$, 'authenticated customer advances through claims JSON used by PostgREST');
RESET ROLE;
SELECT extensions.is((
  SELECT latest_revision_no
  FROM public.trip_plans
  WHERE id = '00000000-0000-0000-0000-000000004121'::uuid
), 2, 'authenticated refinement wrapper advances exactly one revision');

CREATE TEMP TABLE ai_runtime_quota (
  label text,
  reservation_id uuid,
  kind text,
  bucket_hashes text[],
  period_start timestamptz,
  state text
) ON COMMIT DROP;
GRANT INSERT, SELECT ON ai_runtime_quota TO service_role;

SET LOCAL ROLE service_role;
SELECT extensions.lives_ok($$
  INSERT INTO ai_runtime_quota
  SELECT 'first', quota.*
  FROM public.reserve_ai_quota(
    '00000000-0000-0000-0000-000000004131'::uuid,
    'gemini', repeat('c', 64), repeat('d', 64)
  ) AS quota
$$, 'service role creates the first Gemini quota receipt');
SELECT extensions.lives_ok($$
  INSERT INTO ai_runtime_quota
  SELECT 'replay', quota.*
  FROM public.reserve_ai_quota(
    '00000000-0000-0000-0000-000000004131'::uuid,
    'gemini', repeat('c', 64), repeat('d', 64)
  ) AS quota
$$, 'service role replays the same Gemini reservation idempotently');
RESET ROLE;
SELECT extensions.is((
  SELECT string_agg(state, ',' ORDER BY label)
  FROM ai_runtime_quota
), 'created,replayed', 'quota wrapper preserves immutable created and replayed states');
SELECT extensions.is((
  SELECT count(*)::integer
  FROM private.quota_reservations
  WHERE reservation_id = '00000000-0000-0000-0000-000000004131'::uuid
), 1, 'quota replay keeps one reservation receipt');

SET LOCAL ROLE service_role;
SELECT extensions.lives_ok($$
  SELECT count(*)
  FROM (
    SELECT * FROM public.reserve_ai_quota('00000000-0000-0000-0000-000000004132'::uuid, 'gemini', repeat('c', 64), repeat('d', 64))
    UNION ALL
    SELECT * FROM public.reserve_ai_quota('00000000-0000-0000-0000-000000004133'::uuid, 'gemini', repeat('c', 64), repeat('d', 64))
    UNION ALL
    SELECT * FROM public.reserve_ai_quota('00000000-0000-0000-0000-000000004134'::uuid, 'gemini', repeat('c', 64), repeat('d', 64))
    UNION ALL
    SELECT * FROM public.reserve_ai_quota('00000000-0000-0000-0000-000000004135'::uuid, 'gemini', repeat('c', 64), repeat('d', 64))
  ) AS reservations
$$, 'four additional Gemini reservations reach the per-bucket limit');
RESET ROLE;
SELECT extensions.ok((
  SELECT bool_and(used_count = 5)
  FROM private.quota_buckets
  WHERE bucket_hash IN (repeat('c', 64), repeat('d', 64))
    AND bucket_kind IN ('gemini_ip', 'gemini_device')
), 'Gemini IP and device buckets are each consumed exactly five times');

SET LOCAL ROLE service_role;
SELECT extensions.throws_ok($$
  SELECT *
  FROM public.reserve_ai_quota(
    '00000000-0000-0000-0000-000000004136'::uuid,
    'gemini', repeat('c', 64), repeat('d', 64)
  )
$$, 'P0001', 'quota exceeded', 'sixth Gemini reservation is rejected');
RESET ROLE;
SELECT extensions.ok((
  SELECT bool_and(used_count = 5)
  FROM private.quota_buckets
  WHERE bucket_hash IN (repeat('c', 64), repeat('d', 64))
    AND bucket_kind IN ('gemini_ip', 'gemini_device')
), 'quota exhaustion leaves both counters unchanged');

SET LOCAL ROLE service_role;
SELECT extensions.throws_ok($$
  SELECT *
  FROM public.reserve_ai_quota(
    '00000000-0000-0000-0000-000000004137'::uuid,
    'provider-name', repeat('e', 64), repeat('f', 64)
  )
$$, '22023', 'invalid quota reservation', 'quota wrapper rejects unknown reservation kinds');
SELECT extensions.throws_ok($$
  SELECT *
  FROM private.reserve_quota(
    '00000000-0000-0000-0000-000000004138'::uuid,
    'gemini', repeat('e', 64), repeat('f', 64)
  )
$$, '42501', 'permission denied for schema private', 'service role cannot bypass the public quota wrapper');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
