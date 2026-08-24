-- Integration-deferred pgTAP coverage for directed travel and FX facts.
-- Run with `supabase test db --local` after a reset; this workstation has no
-- Docker/Supabase/PostgreSQL runtime.
BEGIN;

SELECT plan(78);

SELECT ok(to_regclass('public.travel_edges') IS NOT NULL, 'travel edges exists');
SELECT ok(to_regclass('public.travel_snapshots') IS NOT NULL, 'travel snapshots exists');
SELECT ok(to_regclass('public.travel_snapshot_edges') IS NOT NULL, 'travel snapshot edges exists');
SELECT ok(to_regclass('public.fx_snapshots') IS NOT NULL, 'FX snapshots exists');

SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.travel_edges'::regclass), 'travel edges have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.travel_snapshots'::regclass), 'travel snapshots have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.travel_snapshot_edges'::regclass), 'travel snapshot edges have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.fx_snapshots'::regclass), 'FX snapshots have forced RLS');

SELECT ok((SELECT count(*) = 1 FROM pg_constraint WHERE conrelid = 'public.travel_snapshot_edges'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%FOREIGN KEY (catalog_snapshot_id, from_place_id)%'), 'from endpoint uses composite catalog membership FK');
SELECT ok((SELECT count(*) = 1 FROM pg_constraint WHERE conrelid = 'public.travel_snapshot_edges'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%FOREIGN KEY (catalog_snapshot_id, to_place_id)%'), 'to endpoint uses composite catalog membership FK');
SELECT ok((SELECT count(*) = 1 FROM pg_constraint WHERE conrelid = 'public.travel_snapshot_edges'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%FOREIGN KEY (snapshot_id, catalog_snapshot_id)%'), 'travel snapshot membership uses composite FK');
SELECT ok((SELECT count(*) = 1 FROM pg_constraint WHERE conrelid = 'public.travel_snapshot_edges'::regclass AND contype = 'u' AND pg_get_constraintdef(oid) LIKE '%snapshot_id, from_place_id, to_place_id%'), 'directed pair is unique per snapshot');
SELECT ok((SELECT pg_get_constraintdef(oid) LIKE '%from_place_id <> to_place_id%' FROM pg_constraint WHERE conrelid = 'public.travel_edges'::regclass AND contype = 'c'), 'current travel edges reject self edges');
SELECT ok((SELECT pg_get_constraintdef(oid) LIKE '%mode IN%' FROM pg_constraint WHERE conrelid = 'public.travel_edges'::regclass AND contype = 'c'), 'current travel modes are closed');
SELECT ok((SELECT pg_get_constraintdef(oid) LIKE '%minutes BETWEEN 1 AND 240%' FROM pg_constraint WHERE conrelid = 'public.travel_edges'::regclass AND contype = 'c'), 'travel minutes are bounded');
SELECT ok((SELECT pg_get_constraintdef(oid) LIKE '%group_cost_vnd BETWEEN 0 AND 1125899906842623%' FROM pg_constraint WHERE conrelid = 'public.travel_edges'::regclass AND contype = 'c'), 'travel group cost uses the safe engine bound');
SELECT ok((SELECT is_nullable = 'NO' FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'travel_edges' AND column_name = 'verified_at'), 'travel verification timestamp is required');
SELECT ok((SELECT is_nullable = 'NO' FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'travel_snapshots' AND column_name = 'catalog_snapshot_id'), 'travel snapshot records catalog snapshot');

SELECT ok((SELECT prosecdef AND proconfig @> ARRAY['search_path='] FROM pg_proc WHERE oid = 'private.create_travel_snapshot()'::regprocedure), 'travel snapshot creator is pinned SECURITY DEFINER');
SELECT is((SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'private.create_travel_snapshot()'::regprocedure), 'localens_catalog_rpc_owner', 'travel snapshot creator has named owner');
SELECT is((SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'private.reject_published_snapshot_insert()'::regprocedure), 'localens_catalog_guard_owner', 'snapshot insert guard has named non-login owner');
SELECT ok((SELECT rolcanlogin = false AND rolbypassrls = false FROM pg_catalog.pg_roles WHERE rolname = 'localens_catalog_guard_owner'), 'snapshot guard owner cannot login or bypass RLS');
SELECT ok((SELECT pg_get_functiondef('private.reject_published_snapshot_insert()'::regprocedure) LIKE '%FOR SHARE%'), 'snapshot insert guard locks parent status while checking');
SELECT ok(has_table_privilege('localens_catalog_guard_owner', 'public.catalog_snapshots', 'SELECT')
  AND has_table_privilege('localens_catalog_guard_owner', 'public.travel_snapshots', 'SELECT'), 'snapshot guard has only narrow parent SELECT privileges');
SELECT ok(has_column_privilege('localens_catalog_guard_owner', 'public.catalog_snapshots', 'id', 'UPDATE')
  AND has_column_privilege('localens_catalog_guard_owner', 'public.travel_snapshots', 'id', 'UPDATE'), 'snapshot guard has only row-lock UPDATE columns');
SELECT ok(NOT has_table_privilege('localens_catalog_guard_owner', 'public.catalog_snapshots', 'UPDATE')
  AND NOT has_table_privilege('localens_catalog_guard_owner', 'public.travel_snapshots', 'UPDATE')
  AND NOT has_column_privilege('localens_catalog_guard_owner', 'public.catalog_snapshots', 'status', 'UPDATE')
  AND NOT has_column_privilege('localens_catalog_guard_owner', 'public.travel_snapshots', 'status', 'UPDATE'), 'snapshot guard has no table or mutable-column UPDATE');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = ANY(ARRAY['public.catalog_snapshots'::regclass, 'public.travel_snapshots'::regclass]) AND polcmd = ANY(ARRAY['w'::"char", '*'::"char"]) AND (0 = ANY(polroles) OR 'localens_catalog_guard_owner'::regrole::oid = ANY(polroles))), 'snapshot lifecycle has no guard UPDATE policy');
SET LOCAL ROLE localens_catalog_guard_owner;
SELECT is((WITH changed AS (UPDATE public.catalog_snapshots SET id = id RETURNING 1) SELECT count(*)::bigint FROM changed), 0::bigint, 'snapshot guard row-lock column update changes no rows without an UPDATE policy');
RESET ROLE;
SELECT ok((SELECT pg_get_functiondef('private.create_travel_snapshot()'::regprocedure) LIKE '%LOCK TABLE public.areas IN SHARE ROW EXCLUSIVE MODE%'
  AND pg_get_functiondef('private.create_travel_snapshot()'::regprocedure) LIKE '%LOCK TABLE public.travel_edges IN SHARE ROW EXCLUSIVE MODE%'), 'travel creator declares fixed source locks');
SELECT ok(has_function_privilege('localens_admin_rpc_owner', 'private.create_travel_snapshot()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'private.create_travel_snapshot()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'private.create_travel_snapshot()', 'EXECUTE'), 'travel creator grant is internal-admin only');
SELECT ok((SELECT count(*) = 3 FROM pg_trigger WHERE tgname IN ('travel_snapshots_append_only', 'travel_snapshot_edges_append_only', 'fx_snapshots_append_only')), 'all append-only triggers exist');
SELECT ok(to_regclass('public.travel_snapshots_v') IS NOT NULL, 'published travel projection exists');
SELECT ok(to_regclass('public.latest_fx_snapshot_v') IS NOT NULL, 'latest FX projection exists');
SELECT ok(NOT has_table_privilege('anon', 'public.travel_edges', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.travel_edges', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.fx_snapshots', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.fx_snapshots', 'SELECT'), 'API roles cannot read travel or FX base tables');
SELECT ok(has_table_privilege('anon', 'public.travel_snapshots_v', 'SELECT')
  AND has_table_privilege('authenticated', 'public.travel_snapshots_v', 'SELECT')
  AND has_table_privilege('anon', 'public.latest_fx_snapshot_v', 'SELECT'), 'API roles read only named projections');
SELECT ok(has_table_privilege('localens_catalog_rpc_owner', 'public.travel_edges', 'DELETE'), 'catalog owner can retire mutable source edges without touching history');
SELECT ok((SELECT pg_get_constraintdef(oid) LIKE '%vnd_per_usd > 0%' FROM pg_constraint WHERE conrelid = 'public.fx_snapshots'::regclass AND contype = 'c'), 'FX rate is positive');
SELECT ok((SELECT pg_get_constraintdef(oid) LIKE '%environment IN%' FROM pg_constraint WHERE conrelid = 'public.fx_snapshots'::regclass AND contype = 'c'), 'FX environment is closed');
SELECT ok((SELECT pg_get_constraintdef(oid) LIKE '%is_demo = (environment = ''demo'')%' FROM pg_constraint WHERE conrelid = 'public.fx_snapshots'::regclass AND contype = 'c'), 'FX demo flag matches environment');
SELECT ok((SELECT pg_get_constraintdef(oid) LIKE '%source = btrim(source)%' AND pg_get_constraintdef(oid) LIKE '%cntrl%'
  FROM pg_constraint WHERE conrelid = 'public.fx_snapshots'::regclass AND conname = 'fx_snapshots_source_trimmed_no_controls'), 'FX source is trimmed and control-free');
SELECT ok((SELECT pg_get_viewdef('public.latest_fx_snapshot_v'::regclass) LIKE '%7 days%'), 'latest FX projection has a seven-day freshness bound');
SELECT ok((SELECT pg_get_viewdef('public.latest_fx_snapshot_v'::regclass) LIKE '%observed_at <=%'), 'latest FX projection excludes future observations');
SELECT ok((SELECT pg_get_viewdef('public.latest_fx_snapshot_v'::regclass) LIKE '%DISTINCT ON%environment%'), 'latest FX projection partitions by environment');

-- Independent fixtures: two catalog members, one directed current edge, and
-- one published catalog snapshot.  No reverse edge is inserted.
INSERT INTO public.areas (id, slug)
VALUES ('00000000-0000-0000-0000-000000000601'::uuid, 'travel-test-area');
INSERT INTO public.places (id, area_id, slug, status, price_vnd_per_person, visit_duration_minutes, source_url, verified_at, attribution)
VALUES
  ('00000000-0000-0000-0000-000000000602'::uuid, '00000000-0000-0000-0000-000000000601'::uuid, 'travel-test-from', 'draft', 0, 60, 'https://example.invalid/from', DATE '2026-08-20', 'fixture'),
  ('00000000-0000-0000-0000-000000000603'::uuid, '00000000-0000-0000-0000-000000000601'::uuid, 'travel-test-to', 'draft', 0, 60, 'https://example.invalid/to', DATE '2026-08-20', 'fixture'),
  ('00000000-0000-0000-0000-000000000620'::uuid, '00000000-0000-0000-0000-000000000601'::uuid, 'travel-test-outside', 'draft', 0, 60, 'https://example.invalid/outside', DATE '2026-08-20', 'fixture');
INSERT INTO public.catalog_snapshots (id, status)
VALUES ('00000000-0000-0000-0000-000000000604'::uuid, 'building');
INSERT INTO public.catalog_snapshot_areas (snapshot_id, area_id, slug)
VALUES ('00000000-0000-0000-0000-000000000604'::uuid, '00000000-0000-0000-0000-000000000601'::uuid, 'travel-test-area');
INSERT INTO public.catalog_snapshot_places (
  snapshot_id, place_id, area_id, slug, price_vnd_per_person,
  visit_duration_minutes, source_url, verified_at, attribution
)
VALUES
  ('00000000-0000-0000-0000-000000000604'::uuid, '00000000-0000-0000-0000-000000000602'::uuid, '00000000-0000-0000-0000-000000000601'::uuid, 'travel-test-from', 0, 60, 'https://example.invalid/from', DATE '2026-08-20', 'fixture'),
  ('00000000-0000-0000-0000-000000000604'::uuid, '00000000-0000-0000-0000-000000000603'::uuid, '00000000-0000-0000-0000-000000000601'::uuid, 'travel-test-to', 0, 60, 'https://example.invalid/to', DATE '2026-08-20', 'fixture');
UPDATE public.catalog_snapshots
SET status = 'published', published_at = now()
WHERE id = '00000000-0000-0000-0000-000000000604'::uuid;

SELECT throws_ok($$INSERT INTO public.catalog_snapshots (id, status, published_at)
  VALUES ('00000000-0000-0000-0000-000000000610'::uuid, 'published', now())$$,
  '42501', NULL, 'catalog snapshot must be built before publication');
SELECT throws_ok($$INSERT INTO public.catalog_snapshot_areas (snapshot_id, area_id, slug)
  VALUES ('00000000-0000-0000-0000-000000000604'::uuid, '00000000-0000-0000-0000-000000000611'::uuid, 'late-area')$$,
  '42501', NULL, 'published catalog snapshot children cannot be inserted');
INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000605'::uuid, 'authenticated', 'authenticated', 'travel-admin@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO private.user_roles (user_id, role)
VALUES ('00000000-0000-0000-0000-000000000605'::uuid, 'admin'::public.app_role)
ON CONFLICT (user_id, role) DO NOTHING;
INSERT INTO public.travel_edges (
  id, from_place_id, to_place_id, mode, minutes, group_cost_vnd, verified_at
)
VALUES (
  '00000000-0000-0000-0000-000000000606'::uuid,
  '00000000-0000-0000-0000-000000000602'::uuid,
  '00000000-0000-0000-0000-000000000603'::uuid,
  'walk', 25, 10000, now()
);
INSERT INTO public.travel_edges (
  id, from_place_id, to_place_id, mode, minutes, group_cost_vnd, verified_at
)
VALUES (
  '00000000-0000-0000-0000-000000000607'::uuid,
  '00000000-0000-0000-0000-000000000602'::uuid,
  '00000000-0000-0000-0000-000000000620'::uuid,
  'walk', 35, 12000, now()
);

CREATE TEMP TABLE travel_test_ids (
  name text PRIMARY KEY,
  snapshot_id uuid NOT NULL
) ON COMMIT DROP;
GRANT INSERT ON TABLE pg_temp.travel_test_ids TO localens_admin_rpc_owner;

SELECT throws_ok($$INSERT INTO public.travel_edges (from_place_id, to_place_id, mode, minutes, group_cost_vnd, verified_at)
  VALUES ('00000000-0000-0000-0000-000000000602'::uuid, '00000000-0000-0000-0000-000000000602'::uuid, 'walk', 10, 1, now())$$,
  '23514', NULL, 'self travel edge is rejected');
SELECT throws_ok($$INSERT INTO public.travel_edges (from_place_id, to_place_id, mode, minutes, group_cost_vnd, verified_at)
  VALUES ('00000000-0000-0000-0000-000000000602'::uuid, '00000000-0000-0000-0000-000000000603'::uuid, 'taxi', 10, 1, now())$$,
  '23505', NULL, 'duplicate directed pair is rejected');
SELECT throws_ok($$INSERT INTO public.travel_edges (from_place_id, to_place_id, mode, minutes, group_cost_vnd, verified_at)
  VALUES ('00000000-0000-0000-0000-000000000603'::uuid, '00000000-0000-0000-0000-000000000602'::uuid, 'bike', 10, 1, now())$$,
  '23514', NULL, 'unknown travel mode is rejected');
SELECT throws_ok($$INSERT INTO public.travel_edges (from_place_id, to_place_id, mode, minutes, group_cost_vnd, verified_at)
  VALUES ('00000000-0000-0000-0000-000000000603'::uuid, '00000000-0000-0000-0000-000000000602'::uuid, 'walk', 241, 1, now())$$,
  '23514', NULL, 'out-of-range travel minutes are rejected');
SELECT throws_ok($$INSERT INTO public.travel_edges (from_place_id, to_place_id, mode, minutes, group_cost_vnd, verified_at)
  VALUES ('00000000-0000-0000-0000-000000000603'::uuid, '00000000-0000-0000-0000-000000000602'::uuid, 'walk', 10, 1125899906842624, now())$$,
  '23514', NULL, 'unsafe travel group cost is rejected');
SELECT throws_ok($$INSERT INTO public.travel_snapshots (id, catalog_snapshot_id, status, published_at)
  VALUES ('00000000-0000-0000-0000-000000000612'::uuid, '00000000-0000-0000-0000-000000000604'::uuid, 'published', now())$$,
  '42501', NULL, 'travel snapshot must be built before publication');

SET LOCAL ROLE localens_admin_rpc_owner;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000605', true);
SELECT lives_ok($$INSERT INTO pg_temp.travel_test_ids (name, snapshot_id)
  VALUES ('published', private.create_travel_snapshot())$$, 'travel snapshot creator copies facts atomically');
RESET ROLE;

SELECT is((SELECT count(*)::integer FROM public.travel_snapshot_edges e JOIN pg_temp.travel_test_ids ids ON ids.snapshot_id = e.snapshot_id AND ids.name = 'published'), 1, 'snapshot copies exactly the available directed edge');
SELECT is((SELECT count(*)::integer FROM public.travel_snapshot_edges e JOIN pg_temp.travel_test_ids ids ON ids.snapshot_id = e.snapshot_id AND ids.name = 'published' WHERE e.from_place_id = '00000000-0000-0000-0000-000000000602'::uuid AND e.to_place_id = '00000000-0000-0000-0000-000000000620'::uuid), 0, 'edges outside catalog membership are filtered, not guessed');
SELECT is((SELECT count(*)::integer FROM public.travel_snapshot_edges e JOIN pg_temp.travel_test_ids ids ON ids.snapshot_id = e.snapshot_id AND ids.name = 'published' WHERE e.from_place_id = '00000000-0000-0000-0000-000000000603'::uuid AND e.to_place_id = '00000000-0000-0000-0000-000000000602'::uuid), 0, 'snapshot does not synthesize a reverse edge');
SELECT lives_ok($$DELETE FROM public.travel_edges WHERE id = '00000000-0000-0000-0000-000000000606'::uuid$$, 'mutable source edge can be deleted after copying');
SELECT is((SELECT count(*)::integer FROM public.travel_snapshot_edges e JOIN pg_temp.travel_test_ids ids ON ids.snapshot_id = e.snapshot_id AND ids.name = 'published' WHERE e.from_place_id = '00000000-0000-0000-0000-000000000602'::uuid AND e.to_place_id = '00000000-0000-0000-0000-000000000603'::uuid), 1, 'deleting current source does not change travel history');
SELECT lives_ok($$DELETE FROM public.travel_edges WHERE id = '00000000-0000-0000-0000-000000000607'::uuid$$, 'unpublished source edge can be deleted before the next snapshot');
SET LOCAL ROLE localens_admin_rpc_owner;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000605', true);
SELECT lives_ok($$INSERT INTO pg_temp.travel_test_ids (name, snapshot_id)
  VALUES ('empty', private.create_travel_snapshot())$$, 'travel snapshot creator preserves an empty directed graph');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.travel_snapshots_v v JOIN pg_temp.travel_test_ids ids ON ids.snapshot_id = v.snapshot_id AND ids.name = 'empty'), 1, 'empty snapshot has one named envelope row');
SELECT is((SELECT jsonb_array_length(v.edges) FROM public.travel_snapshots_v v JOIN pg_temp.travel_test_ids ids ON ids.snapshot_id = v.snapshot_id AND ids.name = 'empty'), 0, 'empty snapshot envelope contains a dense empty edge array');
INSERT INTO public.travel_snapshots (id, catalog_snapshot_id, status)
VALUES ('00000000-0000-0000-0000-000000000614'::uuid, '00000000-0000-0000-0000-000000000604'::uuid, 'building');
SELECT is((SELECT count(*)::integer FROM public.travel_snapshots WHERE id = '00000000-0000-0000-0000-000000000614'::uuid AND status = 'building'), 1, 'building travel snapshot fixture is available for FK checks');
SELECT throws_ok($$INSERT INTO public.travel_snapshot_edges (
    snapshot_id, catalog_snapshot_id, source_edge_id, from_place_id, to_place_id, mode, minutes, group_cost_vnd, verified_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000614'::uuid,
    '00000000-0000-0000-0000-000000000604'::uuid,
    '00000000-0000-0000-0000-000000000606'::uuid,
    '00000000-0000-0000-0000-000000000602'::uuid,
    '00000000-0000-0000-0000-000000000607'::uuid,
    'walk', 25, 10000, now()
  )$$,
  '23503', NULL, 'snapshot edge endpoint must belong to the same catalog snapshot');
SELECT throws_ok($$INSERT INTO public.travel_snapshot_edges (
    snapshot_id, catalog_snapshot_id, source_edge_id, from_place_id, to_place_id, mode, minutes, group_cost_vnd, verified_at
  ) SELECT ids.snapshot_id, '00000000-0000-0000-0000-000000000604'::uuid,
    '00000000-0000-0000-0000-000000000613'::uuid,
    '00000000-0000-0000-0000-000000000602'::uuid,
    '00000000-0000-0000-0000-000000000603'::uuid,
    'walk', 25, 10000, now()
    FROM pg_temp.travel_test_ids ids WHERE ids.name = 'published'$$,
  '42501', NULL, 'published travel snapshot children cannot be inserted');
SELECT throws_ok($$UPDATE public.travel_snapshot_edges SET minutes = 20$$,
  '42501', NULL, 'travel snapshot history is immutable');
SELECT throws_ok($$DELETE FROM public.travel_snapshots$$,
  '42501', NULL, 'travel snapshot history cannot be deleted');

INSERT INTO public.fx_snapshots (id, vnd_per_usd, source, observed_at, environment, is_demo)
VALUES ('00000000-0000-0000-0000-000000000608'::uuid, 25432.12000000, 'fixture', now(), 'demo', true);
INSERT INTO public.fx_snapshots (id, vnd_per_usd, source, observed_at, environment, is_demo)
VALUES ('00000000-0000-0000-0000-000000000616'::uuid, 1.00000000, 'fixture', now() - INTERVAL '2 hours', 'production', false);
INSERT INTO public.fx_snapshots (id, vnd_per_usd, source, observed_at, environment, is_demo)
VALUES ('00000000-0000-0000-0000-000000000617'::uuid, 25500.00000000, 'new-demo-fixture', now() - INTERVAL '1 hour', 'demo', true);
SELECT is((SELECT count(*)::integer FROM public.fx_snapshots WHERE id IN ('00000000-0000-0000-0000-000000000616'::uuid, '00000000-0000-0000-0000-000000000617'::uuid)), 2, 'demo and production FX flags are accepted');
SELECT throws_ok($$INSERT INTO public.fx_snapshots (vnd_per_usd, source, observed_at, environment, is_demo)
  VALUES (0, 'fixture', now(), 'demo', true)$$,
  '23514', NULL, 'non-positive FX is rejected');
SELECT throws_ok($$INSERT INTO public.fx_snapshots (vnd_per_usd, source, observed_at, environment, is_demo)
  VALUES (1, 'fixture', now(), 'demo', false)$$,
  '23514', NULL, 'inconsistent FX demo flag is rejected');
SELECT throws_ok($$INSERT INTO public.fx_snapshots (id, vnd_per_usd, source, observed_at, environment, is_demo)
  VALUES ('00000000-0000-0000-0000-000000000618'::uuid, 1, ' fixture ', now(), 'demo', true)$$,
  '23514', NULL, 'FX source surrounding whitespace is rejected');
SELECT throws_ok($$INSERT INTO public.fx_snapshots (id, vnd_per_usd, source, observed_at, environment, is_demo)
  VALUES ('00000000-0000-0000-0000-000000000619'::uuid, 1, E'fixture\n', now(), 'demo', true)$$,
  '23514', NULL, 'FX source control characters are rejected');
SELECT throws_ok($$UPDATE public.fx_snapshots SET source = 'changed'$$,
  '42501', NULL, 'FX history is immutable');
SELECT throws_ok($$DELETE FROM public.fx_snapshots$$,
  '42501', NULL, 'FX history cannot be deleted');
INSERT INTO public.fx_snapshots (id, vnd_per_usd, source, observed_at, environment, is_demo)
VALUES ('00000000-0000-0000-0000-000000000609'::uuid, 25000.00000000, 'stale-fixture', now() - INTERVAL '8 days', 'demo', true);
INSERT INTO public.fx_snapshots (id, vnd_per_usd, source, observed_at, environment, is_demo)
VALUES ('00000000-0000-0000-0000-000000000615'::uuid, 26000.00000000, 'future-fixture', now() + INTERVAL '1 day', 'demo', true);
SELECT is((SELECT count(*)::integer FROM public.latest_fx_snapshot_v WHERE environment = 'demo'), 1, 'latest FX returns one valid demo row');
SELECT is((SELECT count(*)::integer FROM public.latest_fx_snapshot_v WHERE environment = 'production'), 1, 'latest FX returns one valid production row');
SELECT is((SELECT count(*)::integer FROM public.latest_fx_snapshot_v WHERE environment = 'production' AND id = '00000000-0000-0000-0000-000000000616'::uuid), 1, 'newer demo FX cannot hide valid production FX');
SELECT is((SELECT count(*)::integer FROM public.latest_fx_snapshot_v WHERE observed_at::timestamptz < now() - INTERVAL '7 days'), 0, 'latest FX projection never presents stale data as fresh');
SELECT is((SELECT count(*)::integer FROM public.latest_fx_snapshot_v WHERE observed_at::timestamptz > now()), 0, 'latest FX projection never presents future data');

SELECT * FROM finish();
ROLLBACK;
