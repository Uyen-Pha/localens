-- Task 6 pgTAP fixture.  Docker/PostgreSQL is unavailable on the current
-- workstation; this suite is intentionally ready for the Task 16 runtime gate.
BEGIN;

SELECT plan(116);

CREATE TEMP TABLE task6_revision_fixture ON COMMIT DROP AS
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
    ) AS request_json,
    jsonb_build_object(
      'normalizedStartAt', '2026-08-20T08:00:00+07:00',
      'budgetVnd', 0,
      'rankingSource', 'deterministic',
      'items', jsonb_build_array(),
      'totals', jsonb_build_object('durationMinutes', 0, 'visitMinutes', 0, 'travelMinutes', 0, 'transitionBufferMinutes', 0, 'groupCostVnd', 0, 'score', 0),
      'snapshotIds', jsonb_build_object('catalog', '00000000-0000-0000-0000-000000000702', 'travel', '00000000-0000-0000-0000-000000000705', 'fx', NULL::text)
    ) AS vnd_result_json,
    jsonb_build_object(
      'normalizedStartAt', '2026-08-20T08:00:00+07:00',
      'budgetVnd', 0,
      'rankingSource', 'ai',
      'items', jsonb_build_array(),
      'totals', jsonb_build_object('durationMinutes', 0, 'visitMinutes', 0, 'travelMinutes', 0, 'transitionBufferMinutes', 0, 'groupCostVnd', 0, 'score', 0),
      'snapshotIds', jsonb_build_object('catalog', '00000000-0000-0000-0000-000000000702', 'travel', '00000000-0000-0000-0000-000000000705', 'fx', '00000000-0000-0000-0000-000000000708')
    ) AS usd_result_json,
    jsonb_build_object(
      'placeId', '00000000-0000-0000-0000-000000000704',
      'startAt', '2026-08-20T08:00:00+07:00',
      'endAt', '2026-08-20T09:00:00+07:00',
      'visitDurationMinutes', 60,
      'travelMinutesBefore', 0,
      'transitionBufferMinutesBefore', 0,
      'travelCostVndBefore', '0',
      'placeCostVnd', '0',
      'score', 1
    ) AS item_dto,
    jsonb_build_object(
      'placeId', '00000000-0000-0000-0000-000000000704',
      'startAt', '2026-08-20T08:00:00+07:00',
      'endAt', '2026-08-20T09:00:00+07:00',
      'visitDurationMinutes', 60,
      'travelMinutesBefore', 0,
      'transitionBufferMinutesBefore', 0,
      'travelCostVndBefore', 0,
      'placeCostVnd', 0,
      'score', 1
    ) AS item_result
)
SELECT fixture.*,
  jsonb_build_object(
    'revisionNo', 1, 'request', request_json, 'result', vnd_result_json,
    'fingerprint', repeat('a', 64), 'rankingSource', 'deterministic',
    'catalogSnapshotId', '00000000-0000-0000-0000-000000000702',
    'travelSnapshotId', '00000000-0000-0000-0000-000000000705',
    'fxSnapshotId', NULL::text, 'fxVndPerUsd', NULL::text, 'currency', 'VND',
    'budgetVnd', '0', 'totalCostVnd', '0', 'totalDurationMinutes', 0,
    'lockedPlaceIds', jsonb_build_array(), 'items', jsonb_build_array()
  ) AS vnd_dto,
  jsonb_build_object(
    'revisionNo', 1, 'request', jsonb_set(request_json, '{budget,currency}', to_jsonb('USD'::text), false), 'result', usd_result_json,
    'fingerprint', repeat('b', 64), 'rankingSource', 'ai',
    'catalogSnapshotId', '00000000-0000-0000-0000-000000000702',
    'travelSnapshotId', '00000000-0000-0000-0000-000000000705',
    'fxSnapshotId', '00000000-0000-0000-0000-000000000708', 'fxVndPerUsd', '25000.00000000', 'currency', 'USD',
    'budgetVnd', '0', 'totalCostVnd', '0', 'totalDurationMinutes', 0,
    'lockedPlaceIds', jsonb_build_array(), 'items', jsonb_build_array()
  ) AS usd_dto
FROM fixture;


GRANT SELECT ON task6_revision_fixture TO authenticated;

SELECT ok(to_regclass('public.trip_plans') IS NOT NULL, 'trip plans exists');
SELECT ok(to_regclass('public.trip_plan_revisions') IS NOT NULL, 'trip plan revisions exists');
SELECT ok(to_regclass('public.trip_plan_items') IS NOT NULL, 'trip plan items exists');
SELECT ok((SELECT count(*) = 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'trip_plan_items' AND column_name = 'food_selection_json'), 'trip plan items persist food selection JSON');
SELECT ok((SELECT count(*) = 5 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'trip_plan_items' AND column_name IN ('food_cost_min_vnd', 'food_cost_max_vnd', 'pay_at_vendor_min_vnd', 'pay_at_vendor_max_vnd', 'customer_payable_vnd')), 'trip plan items persist decimal-safe food amounts');
SELECT ok((SELECT count(*) >= 1 FROM pg_constraint WHERE conrelid = 'public.trip_plan_items'::regclass AND pg_get_constraintdef(oid) LIKE '%food_selection_json%jsonb_typeof%'), 'food selection JSON is object-shaped or null');
SELECT ok((SELECT count(*) >= 1 FROM pg_proc WHERE oid = 'private.validate_food_plan_revision_dto(jsonb)'::regprocedure), 'food revision validator is installed');
SELECT ok(to_regclass('private.recommendation_runs') IS NOT NULL, 'recommendation runs exists');

SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.trip_plans'::regclass), 'trip plans have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.trip_plan_revisions'::regclass), 'revisions have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.trip_plan_items'::regclass), 'items have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'private.recommendation_runs'::regclass), 'recommendation runs have forced RLS');

SELECT ok((SELECT is_nullable = 'YES' FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'trip_plans' AND column_name = 'owner_user_id'), 'plan owner is nullable before claim');
SELECT ok((SELECT is_nullable = 'YES' FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'trip_plans' AND column_name = 'guest_binding_id'), 'guest binding is nullable placeholder');
SELECT is((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.trip_plans'::regclass AND contype = 'f' AND conname = 'trip_plans_guest_binding_fk'), 1::bigint, 'Task 7 adds the guest binding FK');
SELECT ok((SELECT count(*) = 1 FROM pg_constraint WHERE conrelid = 'public.trip_plan_revisions'::regclass AND contype = 'u' AND pg_get_constraintdef(oid) LIKE '%plan_id, revision_no%'), 'revision number is unique per plan');
SELECT ok((SELECT count(*) >= 1 FROM pg_constraint WHERE conrelid = 'public.trip_plan_items'::regclass AND contype = 'u' AND pg_get_constraintdef(oid) LIKE '%revision_id, position%'), 'item positions are unique per revision');
SELECT ok((SELECT count(*) = 1 FROM pg_constraint WHERE conrelid = 'public.trip_plan_items'::regclass AND contype = 'u' AND pg_get_constraintdef(oid) LIKE '%revision_id, place_id%'), 'item places are unique per revision');
SELECT ok((SELECT count(*) >= 1 FROM pg_constraint WHERE conrelid = 'public.trip_plan_items'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%catalog_snapshot_id, place_id%ON DELETE RESTRICT%'), 'item place uses restrictive snapshot membership FK');
SELECT ok((SELECT count(*) >= 1 FROM pg_constraint WHERE conrelid = 'public.trip_plan_revisions'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%travel_snapshot_id, catalog_snapshot_id%ON DELETE RESTRICT%'), 'travel snapshot membership is restrictive');
SELECT ok((SELECT count(*) = 1 FROM pg_constraint WHERE conrelid = 'public.trip_plan_revisions'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%fx_snapshot_id%ON DELETE RESTRICT%'), 'FX snapshot FK is restrictive');
SELECT ok((SELECT count(*) >= 1 FROM pg_constraint WHERE conrelid = 'public.trip_plan_revisions'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%currency%fx_snapshot_id%'), 'currency and FX nullability is constrained');
SELECT ok((SELECT count(*) >= 1 FROM pg_constraint WHERE conrelid = 'public.trip_plan_revisions'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%fingerprint%64%'), 'fingerprint format is constrained');
SELECT is((SELECT count(*) FROM pg_trigger WHERE tgname IN ('trip_plan_revisions_append_only', 'trip_plan_items_append_only', 'recommendation_runs_append_only')), 3::bigint, 'all revision history tables have append-only triggers');

SELECT ok((SELECT prosecdef AND proconfig @> ARRAY['search_path='] FROM pg_proc WHERE oid = 'private.advance_trip_plan_revision(uuid, integer, jsonb)'::regprocedure), 'CAS function is pinned SECURITY DEFINER');
SELECT is((SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'private.advance_trip_plan_revision(uuid, integer, jsonb)'::regprocedure), 'localens_plan_rpc_owner', 'CAS function has named owner');
SELECT ok((SELECT rolcanlogin = false AND rolbypassrls = false FROM pg_catalog.pg_roles WHERE rolname = 'localens_plan_rpc_owner'), 'CAS owner cannot login or bypass RLS');
SELECT ok(has_function_privilege('authenticated', 'public.advance_trip_plan_revision(uuid, integer, jsonb)', 'EXECUTE') AND NOT has_function_privilege('authenticated', 'private.advance_trip_plan_revision(uuid, integer, jsonb)', 'EXECUTE'), 'authenticated can invoke only the guarded public customer CAS');
SELECT ok(NOT has_function_privilege('anon', 'private.advance_trip_plan_revision(uuid, integer, jsonb)', 'EXECUTE'), 'anonymous cannot invoke customer CAS');
SELECT ok(NOT has_schema_privilege('authenticated', 'private', 'USAGE'), 'authenticated cannot resolve the private implementation schema');
SELECT ok(NOT has_table_privilege('anon', 'public.trip_plans', 'SELECT') AND NOT has_table_privilege('anon', 'public.trip_plan_revisions', 'SELECT'), 'anonymous cannot read plan base tables');
SELECT ok(has_column_privilege('authenticated', 'public.trip_plans', 'id', 'SELECT') AND has_column_privilege('authenticated', 'public.trip_plan_items', 'place_id', 'SELECT'), 'authenticated has allowlisted owner read columns');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid IN ('public.trip_plans'::regclass, 'public.trip_plan_revisions'::regclass, 'public.trip_plan_items'::regclass) AND (0 = ANY (polroles) OR 'anon'::regrole::oid = ANY(polroles))), 'anonymous has no plan RLS policy');
SELECT ok(EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'trip_plans_owner_select' AND polrelid = 'public.trip_plans'::regclass), 'owner policy exists only after claim');

-- Minimal immutable snapshot membership fixtures.
INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000701'::uuid, 'authenticated', 'authenticated', 'plan-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;
SELECT ok(EXISTS (SELECT 1 FROM private.user_roles WHERE user_id = '00000000-0000-0000-0000-000000000701'::uuid AND role = 'customer'), 'fixture owner has customer role');
INSERT INTO public.catalog_snapshots (id, status, published_at)
VALUES ('00000000-0000-0000-0000-000000000702'::uuid, 'published', now());
INSERT INTO public.catalog_snapshot_areas (snapshot_id, area_id, slug)
VALUES ('00000000-0000-0000-0000-000000000702'::uuid, '00000000-0000-0000-0000-000000000703'::uuid, 'plan-test-area');
INSERT INTO public.catalog_snapshot_places (snapshot_id, place_id, area_id, slug, price_vnd_per_person, visit_duration_minutes, source_url, verified_at, attribution)
VALUES ('00000000-0000-0000-0000-000000000702'::uuid, '00000000-0000-0000-0000-000000000704'::uuid, '00000000-0000-0000-0000-000000000703'::uuid, 'plan-test-place', 0, 60, 'https://example.invalid/plan-place', DATE '2026-08-20', 'fixture');
INSERT INTO public.travel_snapshots (id, catalog_snapshot_id, status, published_at)
VALUES ('00000000-0000-0000-0000-000000000705'::uuid, '00000000-0000-0000-0000-000000000702'::uuid, 'published', now());

INSERT INTO public.catalog_snapshot_food_vendors (
  snapshot_id, vendor_id, place_id, slug, status, service_type,
  location_note, capacity_note, source_url, verified_at, attribution,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000702'::uuid, '00000000-0000-0000-0000-000000000720'::uuid,
   '00000000-0000-0000-0000-000000000704'::uuid, 'plan-food-vendor', 'published', 'shop',
   'Ground floor', 'Small dining room', 'https://example.invalid/plan-food-vendor', DATE '2026-08-20', 'fixture', now(), now()),
  ('00000000-0000-0000-0000-000000000702'::uuid, '00000000-0000-0000-0000-000000000723'::uuid,
   '00000000-0000-0000-0000-000000000704'::uuid, 'plan-other-vendor', 'published', 'stall',
   'Market aisle', 'Counter service', 'https://example.invalid/plan-other-vendor', DATE '2026-08-20', 'fixture', now(), now());
INSERT INTO public.catalog_snapshot_food_vendor_translations (
  snapshot_id, vendor_id, locale, title, description
)
VALUES
  ('00000000-0000-0000-0000-000000000702'::uuid, '00000000-0000-0000-0000-000000000720'::uuid, 'en', 'Plan Food Vendor', 'Fixture vendor'),
  ('00000000-0000-0000-0000-000000000702'::uuid, '00000000-0000-0000-0000-000000000720'::uuid, 'vi', 'Quán Ăn Kế Hoạch', 'Nhà cung cấp kiểm thử'),
  ('00000000-0000-0000-0000-000000000702'::uuid, '00000000-0000-0000-0000-000000000723'::uuid, 'en', 'Other Food Vendor', 'Fixture cross-vendor'),
  ('00000000-0000-0000-0000-000000000702'::uuid, '00000000-0000-0000-0000-000000000723'::uuid, 'vi', 'Quán Khác', 'Nhà cung cấp khác');
INSERT INTO public.catalog_snapshot_food_items (
  snapshot_id, item_id, place_id, vendor_id, slug, status, serving_unit,
  price_vnd_min, price_vnd_max, portion_description, available, allergens,
  source_url, verified_at, attribution, created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000702'::uuid, '00000000-0000-0000-0000-000000000721'::uuid,
   '00000000-0000-0000-0000-000000000704'::uuid, '00000000-0000-0000-0000-000000000720'::uuid,
   'plan-food-item', 'published', 'bowl', 35000, 45000, 'One bowl', true, ARRAY[]::text[],
   'https://example.invalid/plan-food-item', DATE '2026-08-20', 'fixture', now(), now()),
  ('00000000-0000-0000-0000-000000000702'::uuid, '00000000-0000-0000-0000-000000000722'::uuid,
   '00000000-0000-0000-0000-000000000704'::uuid, '00000000-0000-0000-0000-000000000720'::uuid,
   'plan-unavailable-item', 'published', 'bowl', 35000, 45000, 'One unavailable bowl', false, ARRAY[]::text[],
   'https://example.invalid/plan-unavailable-item', DATE '2026-08-20', 'fixture', now(), now());
INSERT INTO public.catalog_snapshot_food_item_translations (
  snapshot_id, item_id, locale, title, description
)
VALUES
  ('00000000-0000-0000-0000-000000000702'::uuid, '00000000-0000-0000-0000-000000000721'::uuid, 'en', 'Plan Noodle Bowl', 'Fixture menu item'),
  ('00000000-0000-0000-0000-000000000702'::uuid, '00000000-0000-0000-0000-000000000721'::uuid, 'vi', 'Tô Mì Kế Hoạch', 'Món kiểm thử'),
  ('00000000-0000-0000-0000-000000000702'::uuid, '00000000-0000-0000-0000-000000000722'::uuid, 'en', 'Unavailable Bowl', 'Unavailable fixture item'),
  ('00000000-0000-0000-0000-000000000702'::uuid, '00000000-0000-0000-0000-000000000722'::uuid, 'vi', 'Tô Không Bán', 'Món không khả dụng');

CREATE TEMP TABLE task9_food_revision_fixture ON COMMIT DROP AS
WITH fixture AS (
  SELECT request_json,
    jsonb_build_object(
      'vendorId', '00000000-0000-0000-0000-000000000720',
      'menuItemId', '00000000-0000-0000-0000-000000000721',
      'quantity', 1, 'priceVndMin', 35000, 'priceVndMax', 45000,
      'paymentMode', 'pay_at_vendor', 'activity', 'meal'
    ) AS food_selection
  FROM task6_revision_fixture
)
SELECT request_json, food_selection,
  jsonb_build_object(
    'revisionNo', 1, 'request', jsonb_set(request_json, '{budget,amountMinor}', to_jsonb(200000), false),
    'result', jsonb_build_object(
      'normalizedStartAt', '2026-08-20T08:00:00+07:00', 'budgetVnd', 200000,
      'rankingSource', 'deterministic',
      'items', jsonb_build_array(jsonb_build_object(
        'placeId', '00000000-0000-0000-0000-000000000704',
        'startAt', '2026-08-20T08:00:00+07:00', 'endAt', '2026-08-20T09:00:00+07:00',
        'visitDurationMinutes', 60, 'travelMinutesBefore', 0,
        'transitionBufferMinutesBefore', 0, 'travelCostVndBefore', 0,
        'placeCostVnd', 100000, 'foodSelection', food_selection,
        'foodCostMinVnd', 35000, 'foodCostMaxVnd', 45000,
        'payAtVendorMinVnd', 35000, 'payAtVendorMaxVnd', 45000,
        'customerPayableVnd', 100000, 'score', 1
      )),
      'totals', jsonb_build_object(
        'durationMinutes', 60, 'visitMinutes', 60, 'travelMinutes', 0,
        'transitionBufferMinutes', 0, 'admissionCostVnd', 100000,
        'foodCostMinVnd', 35000, 'foodCostMaxVnd', 45000, 'travelCostVnd', 0,
        'guideCostVnd', 0, 'payAtVendorMinVnd', 35000,
        'payAtVendorMaxVnd', 45000, 'customerPayableVnd', 100000,
        'groupCostMinVnd', 135000, 'groupCostMaxVnd', 145000,
        'groupCostVnd', 135000, 'score', 1
      ),
      'snapshotIds', jsonb_build_object('catalog', '00000000-0000-0000-0000-000000000702',
        'travel', '00000000-0000-0000-0000-000000000705', 'fx', NULL::text)
    ),
    'fingerprint', repeat('d', 64), 'rankingSource', 'deterministic',
    'catalogSnapshotId', '00000000-0000-0000-0000-000000000702',
    'travelSnapshotId', '00000000-0000-0000-0000-000000000705',
    'fxSnapshotId', NULL::text, 'fxVndPerUsd', NULL::text, 'currency', 'VND',
    'budgetVnd', '200000', 'totalCostVnd', '135000', 'totalDurationMinutes', 60,
    'lockedPlaceIds', jsonb_build_array(),
    'items', jsonb_build_array(jsonb_build_object(
      'placeId', '00000000-0000-0000-0000-000000000704',
      'startAt', '2026-08-20T08:00:00+07:00', 'endAt', '2026-08-20T09:00:00+07:00',
      'visitDurationMinutes', 60, 'travelMinutesBefore', 0,
      'transitionBufferMinutesBefore', 0, 'travelCostVndBefore', '0',
      'placeCostVnd', '100000', 'foodSelectionJson', food_selection::text,
      'foodCostMinVnd', '35000', 'foodCostMaxVnd', '45000',
      'payAtVendorMinVnd', '35000', 'payAtVendorMaxVnd', '45000',
      'customerPayableVnd', '100000', 'score', 1
    ))
  ) AS food_dto
FROM fixture;
GRANT SELECT ON task9_food_revision_fixture TO authenticated;
INSERT INTO public.trip_plans (id, owner_user_id)
VALUES ('00000000-0000-0000-0000-000000000706'::uuid, '00000000-0000-0000-0000-000000000701'::uuid);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
SELECT lives_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000706'::uuid,
  0,
  (SELECT vnd_dto FROM task6_revision_fixture)
)$$, 'customer CAS creates the first revision');
SELECT is((SELECT count(*)::integer FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000000706'::uuid), 1, 'one revision is persisted');
SELECT is((SELECT count(*)::integer FROM public.trip_plan_items WHERE revision_id IN (SELECT id FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000000706'::uuid)), 0, 'empty immutable item list has no orphan rows');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM private.recommendation_runs WHERE plan_id = '00000000-0000-0000-0000-000000000706'::uuid), 1, 'successful CAS records an append-only recommendation run');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
SELECT is((SELECT count(*)::integer FROM public.trip_plans WHERE id = '00000000-0000-0000-0000-000000000706'::uuid), 1, 'claimed owner can read own plan');
SELECT is((SELECT count(*)::integer FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000000706'::uuid), 1, 'claimed owner can read own revisions');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000709', true);
SELECT is((SELECT count(*)::integer FROM public.trip_plans WHERE id = '00000000-0000-0000-0000-000000000706'::uuid), 0, 'cross-owner cannot read another plan');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000706'::uuid, 0,
  (SELECT vnd_dto FROM task6_revision_fixture))$$, 'P0001', 'STALE_REVISION', 'stale CAS has stable error');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000000706'::uuid), 1, 'stale CAS creates no orphan revision');
SELECT is((SELECT count(*)::integer FROM private.recommendation_runs WHERE plan_id = '00000000-0000-0000-0000-000000000706'::uuid), 1, 'stale CAS creates no orphan recommendation run');

-- Task 9 food path: the canonical serialized selection is persisted only when
-- every item and total fact agrees with the immutable catalog snapshot.
INSERT INTO public.trip_plans (id, owner_user_id)
SELECT format('00000000-0000-0000-0000-%s', suffix)::uuid,
       '00000000-0000-0000-0000-000000000701'::uuid
FROM unnest(ARRAY['000000000718', '000000000719', '000000000720', '000000000721',
                  '000000000722', '000000000723', '000000000724', '000000000725']) AS values(suffix);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
SELECT lives_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000718'::uuid, 0,
  (SELECT food_dto FROM task9_food_revision_fixture)
)$$, 'canonical food revision persists through the guarded RPC');
SELECT is((SELECT count(*)::integer FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000000718'::uuid), 1, 'food revision is persisted once');
SELECT is((SELECT count(*)::integer FROM public.trip_plan_items WHERE revision_id IN (SELECT id FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000000718'::uuid)), 1, 'food revision persists one immutable item');
SELECT is((SELECT food_selection_json->>'menuItemId' FROM public.trip_plan_items WHERE revision_id IN (SELECT id FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000000718'::uuid)), '00000000-0000-0000-0000-000000000721', 'food selection JSON is the canonical menu selection');
SELECT is((SELECT food_cost_min_vnd FROM public.trip_plan_items WHERE revision_id IN (SELECT id FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000000718'::uuid)), 35000::bigint, 'food minimum is persisted as a decimal-safe integer');
SELECT is((SELECT food_cost_max_vnd FROM public.trip_plan_items WHERE revision_id IN (SELECT id FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000000718'::uuid)), 45000::bigint, 'food maximum is persisted as a decimal-safe integer');
SELECT is((SELECT pay_at_vendor_min_vnd FROM public.trip_plan_items WHERE revision_id IN (SELECT id FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000000718'::uuid)), 35000::bigint, 'pay-at-vendor minimum is persisted separately');
SELECT is((SELECT pay_at_vendor_max_vnd FROM public.trip_plan_items WHERE revision_id IN (SELECT id FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000000718'::uuid)), 45000::bigint, 'pay-at-vendor maximum is persisted separately');
SELECT is((SELECT customer_payable_vnd FROM public.trip_plan_items WHERE revision_id IN (SELECT id FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000000718'::uuid)), 100000::bigint, 'customer payable is persisted separately');
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000719'::uuid, 0,
  jsonb_set(jsonb_set((SELECT food_dto FROM task9_food_revision_fixture),
    '{items,0,foodSelectionJson}', to_jsonb(jsonb_set((SELECT food_selection FROM task9_food_revision_fixture), '{menuItemId}', to_jsonb('00000000-0000-0000-0000-000000000722'::text), false)::text), false),
    '{result,items,0,foodSelection,menuItemId}', to_jsonb('00000000-0000-0000-0000-000000000722'::text), false))$$,
  '23514', NULL, 'unavailable food items are rejected before persistence');
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000720'::uuid, 0,
  jsonb_set(jsonb_set((SELECT food_dto FROM task9_food_revision_fixture),
    '{items,0,foodSelectionJson}', to_jsonb(jsonb_set((SELECT food_selection FROM task9_food_revision_fixture), '{menuItemId}', to_jsonb('00000000-0000-0000-0000-000000000799'::text), false)::text), false),
    '{result,items,0,foodSelection,menuItemId}', to_jsonb('00000000-0000-0000-0000-000000000799'::text), false))$$,
  '23514', NULL, 'unknown food item IDs are rejected before persistence');
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000721'::uuid, 0,
  jsonb_set(jsonb_set((SELECT food_dto FROM task9_food_revision_fixture),
    '{items,0,foodSelectionJson}', to_jsonb(jsonb_set((SELECT food_selection FROM task9_food_revision_fixture), '{vendorId}', to_jsonb('00000000-0000-0000-0000-000000000723'::text), false)::text), false),
    '{result,items,0,foodSelection,vendorId}', to_jsonb('00000000-0000-0000-0000-000000000723'::text), false))$$,
  '23514', NULL, 'cross-vendor food selections are rejected before persistence');
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000722'::uuid, 0,
  jsonb_set(jsonb_set((SELECT food_dto FROM task9_food_revision_fixture),
    '{items,0,foodSelectionJson}', to_jsonb(jsonb_set((SELECT food_selection FROM task9_food_revision_fixture), '{priceVndMin}', to_jsonb(36000), false)::text), false),
    '{result,items,0,foodSelection,priceVndMin}', to_jsonb(36000), false))$$,
  '23514', NULL, 'changed food prices are rejected before persistence');
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000723'::uuid, 0,
  jsonb_set(jsonb_set((SELECT food_dto FROM task9_food_revision_fixture),
    '{items,0,foodSelectionJson}', to_jsonb(jsonb_set((SELECT food_selection FROM task9_food_revision_fixture), '{paymentMode}', to_jsonb('included_in_quote'::text), false)::text), false),
    '{result,items,0,foodSelection,paymentMode}', to_jsonb('included_in_quote'::text), false))$$,
  '22023', NULL, 'included-in-quote selections are rejected in the MVP');
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000724'::uuid, 0,
  jsonb_set((SELECT food_dto FROM task9_food_revision_fixture), '{items,0,foodSelectionJson}', to_jsonb('{malformed'::text), false))$$,
  '22023', NULL, 'malformed serialized food selection JSON is rejected');
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000725'::uuid, 0,
  jsonb_set((SELECT food_dto FROM task9_food_revision_fixture), '{result,totals}',
    (SELECT (food_dto->'result'->'totals') - 'foodCostMinVnd' FROM task9_food_revision_fixture), false))$$,
  '22023', NULL, 'missing food minimum total is rejected');
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000725'::uuid, 0,
  jsonb_set((SELECT food_dto FROM task9_food_revision_fixture), '{result,totals}',
    (SELECT (food_dto->'result'->'totals') - 'foodCostMaxVnd' FROM task9_food_revision_fixture), false))$$,
  '22023', NULL, 'missing food maximum total is rejected');
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000725'::uuid, 0,
  jsonb_set((SELECT food_dto FROM task9_food_revision_fixture), '{result,totals}',
    (SELECT (food_dto->'result'->'totals') - 'payAtVendorMinVnd' FROM task9_food_revision_fixture), false))$$,
  '22023', NULL, 'missing pay-at-vendor minimum total is rejected');
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000725'::uuid, 0,
  jsonb_set((SELECT food_dto FROM task9_food_revision_fixture), '{result,totals}',
    (SELECT (food_dto->'result'->'totals') - 'payAtVendorMaxVnd' FROM task9_food_revision_fixture), false))$$,
  '22023', NULL, 'missing pay-at-vendor maximum total is rejected');
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000725'::uuid, 0,
  jsonb_set((SELECT food_dto FROM task9_food_revision_fixture), '{result,totals}',
    (SELECT (food_dto->'result'->'totals') - 'customerPayableVnd' FROM task9_food_revision_fixture), false))$$,
  '22023', NULL, 'missing customer payable total is rejected');
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000725'::uuid, 0,
  jsonb_set((SELECT food_dto FROM task9_food_revision_fixture), '{result,totals,foodCostMaxVnd}', 'null'::jsonb, false))$$,
  '22023', NULL, 'null food total is rejected');
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000725'::uuid, 0,
  jsonb_set((SELECT food_dto FROM task9_food_revision_fixture), '{result,totals,foodCostMaxVnd}', to_jsonb('45000'::text), false))$$,
  '22023', NULL, 'string food total is rejected');
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000725'::uuid, 0,
  jsonb_set((SELECT food_dto FROM task9_food_revision_fixture), '{result,totals,foodCostMaxVnd}', to_jsonb(45001), false))$$,
  '23514', NULL, 'mismatched food total is rejected');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.trip_plan_revisions WHERE plan_id IN (
  SELECT format('00000000-0000-0000-0000-%s', suffix)::uuid FROM unnest(ARRAY['000000000719', '000000000720', '000000000721', '000000000722', '000000000723', '000000000724', '000000000725']) AS values(suffix)
)), 0, 'invalid food DTOs create no revisions');
SELECT is((SELECT count(*)::integer FROM public.trip_plan_items WHERE revision_id IN (
  SELECT id FROM public.trip_plan_revisions WHERE plan_id IN (
    SELECT format('00000000-0000-0000-0000-%s', suffix)::uuid FROM unnest(ARRAY['000000000719', '000000000720', '000000000721', '000000000722', '000000000723', '000000000724', '000000000725']) AS values(suffix)
  )
)), 0, 'invalid food DTOs create no orphan items');

INSERT INTO public.trip_plans (id, owner_user_id)
VALUES ('00000000-0000-0000-0000-000000000710'::uuid, '00000000-0000-0000-0000-000000000701'::uuid);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000710'::uuid, 0,
  jsonb_set(
    jsonb_set((SELECT vnd_dto FROM task6_revision_fixture), '{result,items}', '[null]'::jsonb, false),
    '{items}', '[null]'::jsonb, false
  ))$$, '22023', NULL, 'malformed scalar item is rejected with a stable shape error');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000000710'::uuid), 0, 'malformed item creates no revision');
SELECT is((SELECT count(*)::integer FROM private.recommendation_runs WHERE plan_id = '00000000-0000-0000-0000-000000000710'::uuid), 0, 'malformed item creates no recommendation run');

-- Exercise the USD branch against the referenced database FX fact, including
-- exact numeric equality (the runtime gate also covers concurrent winners).
INSERT INTO public.fx_snapshots (id, vnd_per_usd, source, observed_at, environment, is_demo)
VALUES ('00000000-0000-0000-0000-000000000708'::uuid, 25000.00000000, 'fixture', now(), 'demo', true);
INSERT INTO public.trip_plans (id, owner_user_id)
VALUES ('00000000-0000-0000-0000-000000000707'::uuid, '00000000-0000-0000-0000-000000000701'::uuid);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
SELECT lives_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000707'::uuid, 0,
  (SELECT usd_dto FROM task6_revision_fixture))$$, 'USD CAS requires an exact referenced FX rate');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000000707'::uuid), 1, 'USD revision persists exact FX snapshot');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000707'::uuid, 1,
  jsonb_set((SELECT usd_dto FROM task6_revision_fixture), '{fxVndPerUsd}', to_jsonb('25001.00000000'::text), false))$$, '23514', NULL, 'mismatched FX rate is rejected before insert');
RESET ROLE;

INSERT INTO public.trip_plans (id, owner_user_id)
VALUES ('00000000-0000-0000-0000-000000000711'::uuid, '00000000-0000-0000-0000-000000000701'::uuid);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000711'::uuid, 0,
  jsonb_set((SELECT vnd_dto FROM task6_revision_fixture), '{request,budget,currency}', to_jsonb('USD'::text), false))$$,
  '23514', NULL, 'forged request budget currency is rejected before insert');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000000711'::uuid), 0, 'forged request creates no revision');
SELECT is((SELECT count(*)::integer FROM public.trip_plan_items WHERE revision_id IN (SELECT id FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000000711'::uuid)), 0, 'forged request creates no items');
SELECT is((SELECT count(*)::integer FROM private.recommendation_runs WHERE plan_id = '00000000-0000-0000-0000-000000000711'::uuid), 0, 'forged request creates no recommendation run');

INSERT INTO public.trip_plans (id, owner_user_id)
VALUES ('00000000-0000-0000-0000-000000000712'::uuid, '00000000-0000-0000-0000-000000000701'::uuid);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000712'::uuid, 0,
  jsonb_set(
    jsonb_set((SELECT vnd_dto FROM task6_revision_fixture), '{items}', jsonb_build_array((SELECT item_dto FROM task6_revision_fixture)), false),
    '{result,items}', jsonb_build_array(jsonb_set((SELECT item_result FROM task6_revision_fixture), '{placeCostVnd}', to_jsonb(1), false)), false
  ))$$,
  '23514', NULL, 'forged result item cost is rejected before insert');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000000712'::uuid), 0, 'forged result creates no revision');
SELECT is((SELECT count(*)::integer FROM public.trip_plan_items WHERE revision_id IN (SELECT id FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000000712'::uuid)), 0, 'forged result creates no items');
SELECT is((SELECT count(*)::integer FROM private.recommendation_runs WHERE plan_id = '00000000-0000-0000-0000-000000000712'::uuid), 0, 'forged result creates no recommendation run');

INSERT INTO public.trip_plans (id, owner_user_id)
VALUES ('00000000-0000-0000-0000-000000000713'::uuid, '00000000-0000-0000-0000-000000000701'::uuid);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000713'::uuid, 0,
  jsonb_set((SELECT vnd_dto FROM task6_revision_fixture), '{budgetVnd}', to_jsonb('9007199254740992'::text), false))$$,
  '22023', NULL, 'money above the database bound is rejected before cast');
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000713'::uuid, 0,
  jsonb_set((SELECT vnd_dto FROM task6_revision_fixture), '{totalDurationMinutes}', to_jsonb('721'::text), false))$$,
  '22023', NULL, 'duration above the database bound is rejected before cast');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000000713'::uuid), 0, 'out-of-range values create no revision');
SELECT is((SELECT count(*)::integer FROM private.recommendation_runs WHERE plan_id = '00000000-0000-0000-0000-000000000713'::uuid), 0, 'out-of-range values create no recommendation run');

INSERT INTO public.trip_plans (id, owner_user_id)
VALUES ('00000000-0000-0000-0000-000000000715'::uuid, '00000000-0000-0000-0000-000000000701'::uuid);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000715'::uuid, 0,
  jsonb_set(
    jsonb_set((SELECT vnd_dto FROM task6_revision_fixture), '{items}', jsonb_build_array(
      jsonb_set((SELECT item_dto FROM task6_revision_fixture), '{score}', to_jsonb(9007199254740992::numeric), false)
    ), false),
    '{result,items}', jsonb_build_array(
      jsonb_set((SELECT item_result FROM task6_revision_fixture), '{score}', to_jsonb(9007199254740992::numeric), false)
    ), false
  ))$$,
  '22023', NULL, 'item scores above the safe bound are rejected before cast');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000000715'::uuid), 0, 'out-of-range item score creates no revision');
SELECT is((SELECT count(*)::integer FROM public.trip_plan_items WHERE revision_id IN (SELECT id FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000000715'::uuid)), 0, 'out-of-range item score creates no items');
SELECT is((SELECT count(*)::integer FROM private.recommendation_runs WHERE plan_id = '00000000-0000-0000-0000-000000000715'::uuid), 0, 'out-of-range item score creates no recommendation run');

INSERT INTO public.trip_plans (id, owner_user_id)
VALUES ('00000000-0000-0000-0000-000000000716'::uuid, '00000000-0000-0000-0000-000000000701'::uuid);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000716'::uuid, 0,
  jsonb_set((SELECT vnd_dto FROM task6_revision_fixture), '{result,totals,score}', to_jsonb(10000000000000000::numeric), false))$$,
  '22023', NULL, 'positive 17-digit total score is rejected');
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000716'::uuid, 0,
  jsonb_set(
    jsonb_set((SELECT vnd_dto FROM task6_revision_fixture), '{items}', jsonb_build_array(
      jsonb_set((SELECT item_dto FROM task6_revision_fixture), '{score}', to_jsonb((-10000000000000000)::numeric), false)
    ), false),
    '{result,items}', jsonb_build_array(
      jsonb_set((SELECT item_result FROM task6_revision_fixture), '{score}', to_jsonb((-10000000000000000)::numeric), false)
    ), false
  ))$$,
  '22023', NULL, 'negative 17-digit item score is rejected');
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000716'::uuid, 0,
  jsonb_set((SELECT vnd_dto FROM task6_revision_fixture), '{result,totals,score}', to_jsonb(9007199254740991.5::numeric), false))$$,
  '22023', NULL, 'maximum safe integer plus a fraction is rejected');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000000716'::uuid), 0, 'unsafe scores create no revision');
SELECT is((SELECT count(*)::integer FROM public.trip_plan_items WHERE revision_id IN (SELECT id FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000000716'::uuid)), 0, 'unsafe scores create no items');
SELECT is((SELECT count(*)::integer FROM private.recommendation_runs WHERE plan_id = '00000000-0000-0000-0000-000000000716'::uuid), 0, 'unsafe scores create no recommendation run');

INSERT INTO public.trip_plans (id, owner_user_id)
VALUES ('00000000-0000-0000-0000-000000000717'::uuid, '00000000-0000-0000-0000-000000000701'::uuid);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
SELECT lives_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000717'::uuid, 0,
  jsonb_set(
    jsonb_set((SELECT vnd_dto FROM task6_revision_fixture), '{items}', jsonb_build_array(
      jsonb_set((SELECT item_dto FROM task6_revision_fixture), '{score}', to_jsonb(9007199254740990.5::numeric), false)
    ), false),
    '{result,items}', jsonb_build_array(
      jsonb_set((SELECT item_result FROM task6_revision_fixture), '{score}', to_jsonb(9007199254740990.5::numeric), false)
    ), false
  ))$$,
  'safe fractional item score persists');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000000717'::uuid), 1, 'safe fractional score persists a revision');
SELECT is((SELECT count(*)::integer FROM public.trip_plan_items WHERE revision_id IN (SELECT id FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000000717'::uuid)), 1, 'safe fractional score persists an item');
SELECT is((SELECT count(*)::integer FROM private.recommendation_runs WHERE plan_id = '00000000-0000-0000-0000-000000000717'::uuid), 1, 'safe fractional score records a recommendation run');

INSERT INTO public.trip_plans (id, owner_user_id)
VALUES ('00000000-0000-0000-0000-000000000714'::uuid, '00000000-0000-0000-0000-000000000701'::uuid);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000714'::uuid, 0,
  jsonb_set((SELECT vnd_dto FROM task6_revision_fixture), '{request,durationMinutes}', to_jsonb(59), false))$$,
  '22023', NULL, 'request duration below 60 is rejected');
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000714'::uuid, 0,
  jsonb_set((SELECT vnd_dto FROM task6_revision_fixture), '{request,areas}', '[1]'::jsonb, false))$$,
  '22023', NULL, 'request array element must be an engine ID string');
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000714'::uuid, 0,
  jsonb_set((SELECT vnd_dto FROM task6_revision_fixture), '{request,areas}', '[]'::jsonb, false))$$,
  '22023', NULL, 'request areas cardinality is enforced');
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000714'::uuid, 0,
  jsonb_set((SELECT vnd_dto FROM task6_revision_fixture), '{request,dietaryRequirements}', '["halal","halal"]'::jsonb, false))$$,
  '22023', NULL, 'request dietary IDs must be unique');
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000714'::uuid, 0,
  jsonb_set((SELECT vnd_dto FROM task6_revision_fixture), '{request,mobilityRequirements}', '[true]'::jsonb, false))$$,
  '22023', NULL, 'request mobility element must be an engine ID string');
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000714'::uuid, 0,
  jsonb_set((SELECT vnd_dto FROM task6_revision_fixture), '{request,lockedStopIds}', '["00000000-0000-0000-0000-000000000704","00000000-0000-0000-0000-000000000704"]'::jsonb, false))$$,
  '22023', NULL, 'request locked IDs must be unique');
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000714'::uuid, 0,
  jsonb_set((SELECT vnd_dto FROM task6_revision_fixture), '{result,normalizedStartAt}', to_jsonb('not-a-timestamp'::text), false))$$,
  '22023', NULL, 'result normalized start must be canonical HCM time');
SELECT throws_ok($$SELECT * FROM public.advance_trip_plan_revision(
  '00000000-0000-0000-0000-000000000714'::uuid, 0,
  jsonb_set((SELECT vnd_dto FROM task6_revision_fixture), '{request,startAt}', to_jsonb('2026-02-30T08:00:00Z'::text), false))$$,
  '22023', NULL, 'request start must use a real calendar date');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000000714'::uuid), 0, 'malformed request/result snapshots create no revision');
SELECT is((SELECT count(*)::integer FROM public.trip_plan_items WHERE revision_id IN (SELECT id FROM public.trip_plan_revisions WHERE plan_id = '00000000-0000-0000-0000-000000000714'::uuid)), 0, 'malformed request/result snapshots create no items');
SELECT is((SELECT count(*)::integer FROM private.recommendation_runs WHERE plan_id = '00000000-0000-0000-0000-000000000714'::uuid), 0, 'malformed request/result snapshots create no recommendation run');

SELECT throws_ok($$UPDATE public.trip_plan_revisions SET fingerprint = repeat('b', 64) WHERE plan_id = '00000000-0000-0000-0000-000000000706'::uuid$$, '42501', NULL, 'revision update is rejected');
SELECT throws_ok($$DELETE FROM private.recommendation_runs WHERE plan_id = '00000000-0000-0000-0000-000000000706'::uuid$$, '42501', NULL, 'recommendation run delete is rejected');

SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT count(*) FROM public.trip_plans$$, '42501', NULL, 'anonymous direct plan read is denied');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
