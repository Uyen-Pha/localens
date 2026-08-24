-- Integration-deferred pgTAP coverage for fixed tours and departures.
-- Run with `supabase test db --local` after a reset; this workstation has no
-- Docker/Supabase/PostgreSQL runtime.
BEGIN;

SELECT plan(84);

SELECT ok(to_regclass('public.tours') IS NOT NULL, 'tours exists');
SELECT ok(to_regclass('public.tour_translations') IS NOT NULL, 'mutable tour translations exist');
SELECT ok(to_regclass('public.tour_versions') IS NOT NULL, 'append-only tour versions exist');
SELECT ok(to_regclass('public.tour_version_translations') IS NOT NULL, 'immutable version translations exist');
SELECT ok(to_regclass('public.tour_version_stops') IS NOT NULL, 'immutable version stops exist');
SELECT ok(to_regclass('public.departures') IS NOT NULL, 'departures exist');

SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.tours'::regclass), 'tours have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.tour_translations'::regclass), 'tour translations have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.tour_versions'::regclass), 'tour versions have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.tour_version_translations'::regclass), 'version translations have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.tour_version_stops'::regclass), 'version stops have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.departures'::regclass), 'departures have forced RLS');

SELECT ok((SELECT count(*) = 1 FROM pg_constraint WHERE conrelid = 'public.tour_version_stops'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%FOREIGN KEY (catalog_snapshot_id, place_id)%'), 'stops use composite catalog membership FK');
SELECT ok((SELECT count(*) = 1 FROM pg_constraint WHERE conrelid = 'public.tour_version_stops'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%FOREIGN KEY (tour_version_id, catalog_snapshot_id)%'), 'stops use composite version snapshot FK');
SELECT ok((SELECT count(*) = 1 FROM pg_constraint WHERE conrelid = 'public.tour_version_stops'::regclass AND contype = 'u' AND pg_get_constraintdef(oid) LIKE '%tour_version_id, position%'), 'stop positions are unique per version');
SELECT ok((SELECT count(*) = 1 FROM pg_constraint WHERE conrelid = 'public.departures'::regclass AND contype = 'u' AND pg_get_constraintdef(oid) LIKE '%tour_version_id, start_at%'), 'departure starts are unique per version');
SELECT ok((SELECT count(*) = 1 FROM pg_constraint WHERE conrelid = 'public.tour_version_stops'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%'), 'stop history uses restrict deletes');

SELECT ok((SELECT pg_get_constraintdef(oid) LIKE '%price_vnd_per_person BETWEEN 0 AND 9007199254740991%' FROM pg_constraint WHERE conrelid = 'public.tour_versions'::regclass AND contype = 'c'), 'version money uses the safe engine bound');
SELECT ok((SELECT pg_get_constraintdef(oid) LIKE '%duration_minutes BETWEEN 1 AND 1440%' FROM pg_constraint WHERE conrelid = 'public.tour_versions'::regclass AND contype = 'c'), 'version duration is bounded');
SELECT ok((SELECT pg_get_constraintdef(oid) LIKE '%capacity > 0%' FROM pg_constraint WHERE conrelid = 'public.departures'::regclass AND contype = 'c'), 'departure capacity is positive');
SELECT ok((SELECT pg_get_constraintdef(oid) LIKE '%end_at > start_at%' FROM pg_constraint WHERE conrelid = 'public.departures'::regclass AND contype = 'c'), 'departure end follows start');
SELECT ok((SELECT pg_get_constraintdef(oid) LIKE '%status IN%' FROM pg_constraint WHERE conrelid = 'public.departures'::regclass AND contype = 'c'), 'departure status is closed');

SELECT ok((SELECT prosecdef AND proconfig @> ARRAY['search_path='] FROM pg_proc WHERE oid = 'private.assert_published_tour_complete(uuid)'::regprocedure), 'published tour guard is pinned SECURITY DEFINER');
SELECT is((SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'private.assert_published_tour_complete(uuid)'::regprocedure), 'localens_tour_guard_owner', 'published tour guard has named owner');
SELECT is((SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'private.reject_tour_append_only_change()'::regprocedure), 'localens_tour_guard_owner', 'tour append-only guard has named owner');
SELECT ok((SELECT rolcanlogin = false AND rolbypassrls = false FROM pg_catalog.pg_roles WHERE rolname = 'localens_tour_guard_owner'), 'tour guard owner cannot login or bypass RLS');
SELECT ok((SELECT count(*) = 3 FROM pg_trigger WHERE tgname IN ('tour_versions_append_only', 'tour_version_translations_append_only', 'tour_version_stops_append_only')), 'append-only triggers cover immutable version facts');
SELECT ok((SELECT count(*) = 1 FROM pg_trigger WHERE tgname = 'departures_update_guard'), 'departure update guard preserves immutable facts');

SELECT ok(to_regclass('public.published_tours_v') IS NOT NULL, 'published tour projection exists');
SELECT ok((SELECT reloptions @> ARRAY['security_invoker=true', 'security_barrier=true'] FROM pg_catalog.pg_class WHERE oid = 'public.published_tours_v'::regclass), 'projection is invoker and barrier protected');
SELECT ok(has_table_privilege('anon', 'public.published_tours_v', 'SELECT') AND has_table_privilege('authenticated', 'public.published_tours_v', 'SELECT'), 'API roles read published tour projection');
SELECT ok(NOT has_table_privilege('anon', 'public.tours', 'SELECT') AND NOT has_table_privilege('authenticated', 'public.tours', 'SELECT'), 'API roles cannot read tour base table');
SELECT ok(NOT has_table_privilege('anon', 'public.departures', 'SELECT') AND NOT has_table_privilege('authenticated', 'public.departures', 'SELECT'), 'API roles cannot read departures');
SELECT ok(
  has_column_privilege('anon', 'public.tours', 'id', 'SELECT')
  AND has_column_privilege('anon', 'public.tour_versions', 'status', 'SELECT')
  AND has_column_privilege('anon', 'public.tour_version_translations', 'title', 'SELECT')
  AND has_column_privilege('anon', 'public.tour_version_stops', 'position', 'SELECT')
  AND has_column_privilege('anon', 'public.catalog_snapshots', 'status', 'SELECT')
  AND has_column_privilege('anon', 'public.catalog_snapshot_places', 'slug', 'SELECT')
  AND has_column_privilege('anon', 'public.catalog_snapshot_place_translations', 'title', 'SELECT'),
  'invoker view source columns are explicitly granted');

SELECT ok((SELECT pg_get_viewdef('public.published_tours_v'::regclass) LIKE '%status = ''published''%'), 'projection filters published versions');
SELECT ok((SELECT pg_get_viewdef('public.published_tours_v'::regclass) LIKE '%locale%'), 'projection is localized');
SELECT ok((SELECT pg_get_viewdef('public.published_tours_v'::regclass) LIKE '%stops%'), 'projection includes ordered stops');
SELECT ok((SELECT pg_get_viewdef('public.published_tours_v'::regclass) NOT LIKE '%departures%'), 'projection does not expose availability');

SELECT ok((SELECT pg_get_constraintdef(oid) LIKE '%tour_version_id%REFERENCES public.tour_versions%' FROM pg_constraint WHERE conrelid = 'public.departures'::regclass AND contype = 'f'), 'departures reference versions');
SELECT ok((SELECT is_nullable = 'NO' FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'departures' AND column_name = 'capacity'), 'departure capacity is required');
SELECT ok((SELECT is_nullable = 'NO' FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tour_version_translations' AND column_name = 'meeting_point'), 'meeting copy is required');
SELECT ok((SELECT is_nullable = 'NO' FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tour_versions' AND column_name = 'catalog_snapshot_id'), 'version records catalog snapshot');
SELECT ok((SELECT is_nullable = 'NO' FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tour_versions' AND column_name = 'source_url'), 'version provenance URL is required');
SELECT ok((SELECT is_nullable = 'NO' FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tour_versions' AND column_name = 'verified_at'), 'version verification date is required');
SELECT ok((SELECT is_nullable = 'NO' FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tour_versions' AND column_name = 'attribution'), 'version attribution is required');
SELECT ok((SELECT is_nullable = 'NO' FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tour_versions' AND column_name = 'license'), 'version license is required');

SELECT ok((SELECT pg_get_constraintdef(oid) LIKE '%locale%' FROM pg_constraint WHERE conrelid = 'public.tour_version_translations'::regclass AND contype = 'p'), 'version translations key by locale');
SELECT ok((SELECT pg_get_constraintdef(oid) LIKE '%position > 0%' FROM pg_constraint WHERE conrelid = 'public.tour_version_stops'::regclass AND contype = 'c'), 'stop positions are positive');
SELECT ok((SELECT pg_get_constraintdef(oid) LIKE '%source_url ~ ''^https://''%' FROM pg_constraint WHERE conrelid = 'public.tour_versions'::regclass AND contype = 'c'), 'version source URL is HTTPS');
SELECT ok((SELECT pg_get_constraintdef(oid) LIKE '%valid_tour_copy_array%' FROM pg_constraint WHERE conrelid = 'public.tour_versions'::regclass AND contype = 'c'), 'version copy arrays use the strict validator');
SELECT ok((SELECT pg_get_constraintdef(oid) LIKE '%^https://[^[:space:]]+$%' FROM pg_constraint WHERE conrelid = 'public.tour_versions'::regclass AND contype = 'c'), 'version source URL rejects malformed hosts');
SELECT ok((SELECT pg_get_constraintdef(oid) LIKE '%source_url !~ ''@''%' FROM pg_constraint WHERE conrelid = 'public.tour_versions'::regclass AND contype = 'c'), 'version source URL rejects credentials');
SELECT ok(has_function_privilege('localens_tour_rpc_owner', 'private.valid_tour_copy_array(text[])', 'EXECUTE'), 'tour RPC owner can evaluate copy-array checks');
SELECT ok((SELECT pg_get_functiondef('private.assert_departure_insert()'::regprocedure) LIKE '%status <> ''scheduled''%'), 'departure insert guard requires scheduled status');
SELECT ok((SELECT pg_get_functiondef('private.reject_published_tour_child_insert()'::regprocedure) LIKE '%retired%'), 'retired version children are immutable');

SELECT lives_ok($$SELECT private.assert_published_tour_complete(NULL::uuid)$$, 'published completeness helper is callable by its owner path');
SELECT ok((SELECT count(*) = 1 FROM pg_policy WHERE polrelid = 'public.tours'::regclass AND polname = 'tours_public_select'), 'published tour policy exists');
SELECT ok((SELECT count(*) = 1 FROM pg_policy WHERE polrelid = 'public.tour_versions'::regclass AND polname = 'tour_versions_public_select'), 'published version policy exists');
SELECT ok((SELECT count(*) = 1 FROM pg_policy WHERE polrelid = 'public.tour_translations'::regclass AND polname = 'tour_translations_public_select'), 'published translation policy exists');

INSERT INTO public.catalog_snapshots (id, status)
VALUES ('00000000-0000-0000-0000-000000000901'::uuid, 'building');
INSERT INTO public.catalog_snapshot_areas (snapshot_id, area_id, slug)
VALUES ('00000000-0000-0000-0000-000000000901'::uuid, '00000000-0000-0000-0000-000000000911'::uuid, 'tour-fixture-area');
INSERT INTO public.catalog_snapshot_places (
  snapshot_id, place_id, area_id, slug, price_vnd_per_person,
  visit_duration_minutes, source_url, verified_at, attribution
)
VALUES (
  '00000000-0000-0000-0000-000000000901'::uuid,
  '00000000-0000-0000-0000-000000000912'::uuid,
  '00000000-0000-0000-0000-000000000911'::uuid,
  'tour-fixture-place', 0, 60, 'https://example.invalid/tour-place', DATE '2026-08-20', 'Fixture'
);
INSERT INTO public.catalog_snapshot_place_translations (snapshot_id, place_id, locale, title, summary, description)
VALUES
  ('00000000-0000-0000-0000-000000000901'::uuid, '00000000-0000-0000-0000-000000000912'::uuid, 'en', 'Tour Fixture Place', 'Fixture', 'Fixture'),
  ('00000000-0000-0000-0000-000000000901'::uuid, '00000000-0000-0000-0000-000000000912'::uuid, 'vi', 'Dia diem mau', 'Mau', 'Mau');

INSERT INTO public.tours (id, slug, status)
VALUES ('00000000-0000-0000-0000-000000000920'::uuid, 'incomplete-tour-fixture', 'draft');
SELECT throws_ok($$UPDATE public.tours SET status = 'published' WHERE id = '00000000-0000-0000-0000-000000000920'::uuid$$, '23514', NULL, 'incomplete tour cannot publish');

INSERT INTO public.tours (id, slug, status)
VALUES ('00000000-0000-0000-0000-000000000921'::uuid, 'complete-tour-fixture', 'draft');
INSERT INTO public.tour_translations (tour_id, locale, title, summary, meeting_point)
VALUES
  ('00000000-0000-0000-0000-000000000921'::uuid, 'en', 'Complete tour', 'Complete fixture', 'Fixture gate'),
  ('00000000-0000-0000-0000-000000000921'::uuid, 'vi', 'Tour day du', 'Mau day du', 'Cong mau');
INSERT INTO public.tour_versions (
  id, tour_id, catalog_snapshot_id, status, duration_minutes,
  price_vnd_per_person, inclusions, exclusions, cancellation_policy,
  source_url, verified_at, attribution, license
)
VALUES (
  '00000000-0000-0000-0000-000000000922'::uuid,
  '00000000-0000-0000-0000-000000000921'::uuid,
  '00000000-0000-0000-0000-000000000901'::uuid,
  'draft', 120, 100000, ARRAY['guide'], ARRAY['transfer'], 'No refunds.',
  'https://example.invalid/fixture', DATE '2026-08-20', 'Fixture', 'CC BY 4.0'
);
INSERT INTO public.tour_version_translations (tour_version_id, locale, title, summary, meeting_point)
VALUES ('00000000-0000-0000-0000-000000000922'::uuid, 'en', 'Complete version', 'Fixture', 'Fixture gate');
UPDATE public.catalog_snapshots
SET status = 'published', published_at = now()
WHERE id = '00000000-0000-0000-0000-000000000901'::uuid;
SELECT throws_ok($$UPDATE public.tour_versions SET status = 'published', published_at = now() WHERE id = '00000000-0000-0000-0000-000000000922'::uuid$$, '23514', NULL, 'incomplete version cannot publish');
INSERT INTO public.tour_version_translations (tour_version_id, locale, title, summary, meeting_point)
VALUES ('00000000-0000-0000-0000-000000000922'::uuid, 'vi', 'Phien ban day du', 'Mau', 'Cong mau');
INSERT INTO public.tour_version_stops (tour_version_id, catalog_snapshot_id, position, place_id)
VALUES ('00000000-0000-0000-0000-000000000922'::uuid, '00000000-0000-0000-0000-000000000901'::uuid, 1, '00000000-0000-0000-0000-000000000912'::uuid);
SELECT lives_ok($$UPDATE public.tour_versions SET status = 'published', published_at = now() WHERE id = '00000000-0000-0000-0000-000000000922'::uuid$$, 'complete version can publish');
SELECT lives_ok($$UPDATE public.tours SET status = 'published' WHERE id = '00000000-0000-0000-0000-000000000921'::uuid$$, 'complete tour can publish');

SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::integer FROM public.published_tours_v WHERE tour_version_id = '00000000-0000-0000-0000-000000000922'::uuid), 2, 'published projection returns one row per locale');
SELECT is((SELECT count(*)::integer FROM public.published_tours_v WHERE tour_id = '00000000-0000-0000-0000-000000000920'::uuid), 0, 'published projection excludes incomplete draft tour');
RESET ROLE;

SELECT throws_ok($$UPDATE public.tour_versions SET price_vnd_per_person = 100001 WHERE id = '00000000-0000-0000-0000-000000000922'::uuid$$, '42501', NULL, 'published version price is immutable');
SELECT throws_ok($$DELETE FROM public.tour_versions WHERE id = '00000000-0000-0000-0000-000000000922'::uuid$$, '42501', NULL, 'published version delete is rejected');
SELECT throws_ok($$UPDATE public.tour_version_translations SET title = 'mutated' WHERE tour_version_id = '00000000-0000-0000-0000-000000000922'::uuid AND locale = 'en'$$, '42501', NULL, 'published version translation update is rejected');
SELECT throws_ok($$DELETE FROM public.tour_version_stops WHERE tour_version_id = '00000000-0000-0000-0000-000000000922'::uuid AND position = 1$$, '42501', NULL, 'published version stop delete is rejected');
INSERT INTO public.tour_versions (
  id, tour_id, catalog_snapshot_id, status, duration_minutes,
  price_vnd_per_person, inclusions, exclusions, cancellation_policy,
  source_url, verified_at, attribution, license
)
VALUES (
  '00000000-0000-0000-0000-000000000923'::uuid,
  '00000000-0000-0000-0000-000000000921'::uuid,
  '00000000-0000-0000-0000-000000000901'::uuid,
  'draft', 120, 100000, ARRAY['guide'], ARRAY['transfer'], 'No refunds.',
  'https://example.invalid/fixture', DATE '2026-08-20', 'Fixture', 'CC BY 4.0'
);
SELECT throws_ok($$INSERT INTO public.tour_version_stops (tour_version_id, catalog_snapshot_id, position, place_id) VALUES ('00000000-0000-0000-0000-000000000923'::uuid, '00000000-0000-0000-0000-000000000901'::uuid, 1, '00000000-0000-0000-0000-000000000999'::uuid)$$, '23503', NULL, 'stop cannot reference a place outside its catalog snapshot');
SELECT throws_ok($$INSERT INTO public.tour_versions (tour_id, catalog_snapshot_id, status, duration_minutes, price_vnd_per_person, inclusions, exclusions, cancellation_policy, source_url, verified_at, attribution, license) VALUES ('00000000-0000-0000-0000-000000000902'::uuid, '00000000-0000-0000-0000-000000000901'::uuid, 'draft', 120, 100000, ARRAY[' guide'], ARRAY['transfer'], 'No refunds.', 'https://example.invalid/fixture', DATE '2026-08-20', 'Fixture', 'CC BY 4.0')$$, '23514', NULL, 'tour copy arrays reject untrimmed values');
SELECT throws_ok($$INSERT INTO public.tour_versions (tour_id, catalog_snapshot_id, status, duration_minutes, price_vnd_per_person, inclusions, exclusions, cancellation_policy, source_url, verified_at, attribution, license) VALUES ('00000000-0000-0000-0000-000000000902'::uuid, '00000000-0000-0000-0000-000000000901'::uuid, 'draft', 120, 100000, ARRAY['guide'], ARRAY['transfer'], 'No refunds.', 'https://user@example.invalid/fixture', DATE '2026-08-20', 'Fixture', 'CC BY 4.0')$$, '23514', NULL, 'tour source URL rejects authority credentials');

-- A deterministic draft version is enough to exercise departure state and
-- immutable-fact guards without making this test depend on seed data.
INSERT INTO public.tours (id, slug, status)
VALUES ('00000000-0000-0000-0000-000000000902'::uuid, 'departure-guard-fixture', 'draft');
INSERT INTO public.tour_versions (
  id, tour_id, catalog_snapshot_id, status, duration_minutes,
  price_vnd_per_person, inclusions, exclusions, cancellation_policy,
  source_url, verified_at, attribution, license
)
VALUES (
  '00000000-0000-0000-0000-000000000903'::uuid,
  '00000000-0000-0000-0000-000000000902'::uuid,
  '00000000-0000-0000-0000-000000000901'::uuid,
  'draft', 120, 100000, ARRAY['guide'], ARRAY['transfer'], 'No refunds.',
  'https://example.invalid/fixture', DATE '2026-08-20', 'Fixture', 'CC BY 4.0'
);
INSERT INTO public.departures (id, tour_version_id, start_at, end_at, status, capacity)
VALUES (
  '00000000-0000-0000-0000-000000000904'::uuid,
  '00000000-0000-0000-0000-000000000922'::uuid,
  TIMESTAMPTZ '2026-09-01 08:00:00+07', TIMESTAMPTZ '2026-09-01 10:00:00+07',
  'scheduled', 12
);
SELECT throws_ok($$INSERT INTO public.departures (tour_version_id, start_at, end_at, status, capacity) VALUES ('00000000-0000-0000-0000-000000000903'::uuid, TIMESTAMPTZ '2026-09-01 08:00:00+07', TIMESTAMPTZ '2026-09-01 10:00:00+07', 'scheduled', 12)$$, '42501', NULL, 'scheduled departure cannot use a draft version');
SELECT throws_ok($$INSERT INTO public.departures (tour_version_id, start_at, end_at, status, capacity) VALUES ('00000000-0000-0000-0000-000000000903'::uuid, TIMESTAMPTZ '2026-09-01 08:00:00+07', TIMESTAMPTZ '2026-09-01 10:00:00+07', 'cancelled', 12)$$, '42501', NULL, 'departure must start in scheduled state');
SELECT lives_ok($$UPDATE public.departures SET status = 'sold_out' WHERE id = '00000000-0000-0000-0000-000000000904'::uuid$$, 'scheduled departure can become sold out');
SELECT throws_ok($$UPDATE public.departures SET capacity = 13 WHERE id = '00000000-0000-0000-0000-000000000904'::uuid$$, '42501', NULL, 'departure capacity is immutable after creation');
SELECT throws_ok($$INSERT INTO public.departures (tour_version_id, start_at, end_at, status, capacity) VALUES ('00000000-0000-0000-0000-000000000922'::uuid, TIMESTAMPTZ '2026-09-02 08:00:00+07', TIMESTAMPTZ '2026-09-02 10:00:00+07', 'scheduled', 0)$$, '23514', NULL, 'zero-capacity departure is rejected');
SELECT throws_ok($$INSERT INTO public.departures (tour_version_id, start_at, end_at, status, capacity) VALUES ('00000000-0000-0000-0000-000000000922'::uuid, TIMESTAMPTZ '2026-09-02 08:00:00+07', TIMESTAMPTZ '2026-09-02 08:00:00+07', 'scheduled', 10)$$, '23514', NULL, 'zero-length departure is rejected');
SELECT lives_ok($$UPDATE public.departures SET status = 'completed' WHERE id = '00000000-0000-0000-0000-000000000904'::uuid$$, 'sold-out departure can complete');
INSERT INTO public.departures (id, tour_version_id, start_at, end_at, status, capacity)
VALUES ('00000000-0000-0000-0000-000000000905'::uuid, '00000000-0000-0000-0000-000000000922'::uuid, TIMESTAMPTZ '2026-09-03 08:00:00+07', TIMESTAMPTZ '2026-09-03 10:00:00+07', 'scheduled', 10);
SELECT lives_ok($$UPDATE public.departures SET status = 'cancelled' WHERE id = '00000000-0000-0000-0000-000000000905'::uuid$$, 'scheduled departure can cancel');
SELECT throws_ok($$UPDATE public.departures SET status = 'completed' WHERE id = '00000000-0000-0000-0000-000000000905'::uuid$$, '42501', NULL, 'cancelled departure cannot complete');
SELECT lives_ok($$UPDATE public.tour_versions SET status = 'retired' WHERE id = '00000000-0000-0000-0000-000000000922'::uuid$$, 'published version can retire with its snapshot facts intact');
SELECT throws_ok($$INSERT INTO public.tour_version_stops (tour_version_id, catalog_snapshot_id, position, place_id) VALUES ('00000000-0000-0000-0000-000000000922'::uuid, '00000000-0000-0000-0000-000000000901'::uuid, 2, '00000000-0000-0000-0000-000000000912'::uuid)$$, '42501', NULL, 'retired version stops cannot be inserted');
SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::integer FROM public.published_tours_v WHERE tour_version_id = '00000000-0000-0000-0000-000000000922'::uuid), 0, 'retired version is absent from published projection');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
