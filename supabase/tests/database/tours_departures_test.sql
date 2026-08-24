-- Integration-deferred pgTAP coverage for fixed tours and departures.
-- Run with `supabase test db --local` after a reset; this workstation has no
-- Docker/Supabase/PostgreSQL runtime.
BEGIN;

SELECT plan(128);

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

SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tour_version_stops'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%FOREIGN KEY (catalog_snapshot_id, place_id)%'), 'stops use composite catalog membership FK');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tour_version_stops'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%FOREIGN KEY (tour_version_id, catalog_snapshot_id)%'), 'stops use composite version snapshot FK');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tour_version_stops'::regclass AND contype = 'u' AND pg_get_constraintdef(oid) LIKE '%tour_version_id, position%'), 'stop positions are unique per version');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.departures'::regclass AND contype = 'u' AND pg_get_constraintdef(oid) LIKE '%tour_version_id, start_at%'), 'departure starts are unique per version');
SELECT is((SELECT count(*)::integer FROM pg_constraint WHERE conrelid = 'public.tour_version_stops'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%'), 2, 'both stop composite FKs use restrict deletes');

SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tour_versions'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%price_vnd_per_person BETWEEN 0 AND 9007199254740991%'), 'version money uses the safe engine bound');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tour_versions'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%duration_minutes BETWEEN 1 AND 1440%'), 'version duration is bounded');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.departures'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%capacity > 0%'), 'departure capacity is positive');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.departures'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%end_at > start_at%'), 'departure end follows start');
SELECT is((SELECT string_agg(e.enumlabel, '|' ORDER BY e.enumsortorder) FROM pg_catalog.pg_enum AS e JOIN pg_catalog.pg_type AS t ON t.oid = e.enumtypid JOIN pg_catalog.pg_namespace AS n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'departure_status'), 'scheduled|sold_out|cancelled|completed', 'departure status enum is exhaustive');

SELECT ok((SELECT prosecdef AND proconfig @> ARRAY['search_path='] FROM pg_proc WHERE oid = 'private.assert_published_tour_complete(uuid)'::regprocedure), 'published tour guard is pinned SECURITY DEFINER');
SELECT is((SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'private.assert_published_tour_complete(uuid)'::regprocedure), 'localens_tour_guard_owner', 'published tour guard has named owner');
SELECT is((SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'private.reject_tour_append_only_change()'::regprocedure), 'localens_tour_guard_owner', 'tour append-only guard has named owner');
SELECT ok((SELECT rolcanlogin = false AND rolbypassrls = false FROM pg_catalog.pg_roles WHERE rolname = 'localens_tour_guard_owner'), 'tour guard owner cannot login or bypass RLS');
SELECT ok((SELECT count(*) = 3 FROM pg_trigger WHERE tgname IN ('tour_versions_append_only', 'tour_version_translations_append_only', 'tour_version_stops_append_only')), 'append-only triggers cover immutable version facts');
SELECT ok((SELECT count(*) = 1 FROM pg_trigger WHERE tgname = 'departures_update_guard'), 'departure update guard preserves immutable facts');
SELECT ok((SELECT prosecdef AND proconfig @> ARRAY['search_path='] FROM pg_proc WHERE oid = 'private.lock_tour_parents(uuid,uuid)'::regprocedure), 'tour parent lock helper is pinned SECURITY DEFINER');
SELECT is((SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'private.lock_tour_parents(uuid,uuid)'::regprocedure), 'localens_tour_guard_owner', 'tour parent lock helper has named owner');
SELECT is((SELECT count(*)::integer FROM pg_trigger WHERE tgname IN ('tours_lifecycle_lock', 'tour_translations_lifecycle_lock', 'tour_versions_lifecycle_lock')), 3, 'lifecycle writes have BEFORE lock guards');

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
SELECT ok(EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.tour_version_translations'::regclass AND polname = 'tour_version_translations_public_select' AND pg_get_expr(polqual, polrelid) LIKE '%catalog_snapshots%'), 'version translation RLS requires the published catalog snapshot');
SELECT ok(EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.tour_version_stops'::regclass AND polname = 'tour_version_stops_public_select' AND pg_get_expr(polqual, polrelid) LIKE '%catalog_snapshots%'), 'version stop RLS requires the published catalog snapshot');

SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.departures'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%tour_version_id%REFERENCES public.tour_versions%'), 'departures reference versions');
SELECT ok((SELECT is_nullable = 'NO' FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'departures' AND column_name = 'capacity'), 'departure capacity is required');
SELECT ok((SELECT is_nullable = 'NO' FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tour_version_translations' AND column_name = 'meeting_point'), 'meeting copy is required');
SELECT ok((SELECT is_nullable = 'NO' FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tour_versions' AND column_name = 'catalog_snapshot_id'), 'version records catalog snapshot');
SELECT ok((SELECT is_nullable = 'NO' FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tour_versions' AND column_name = 'source_url'), 'version provenance URL is required');
SELECT ok((SELECT is_nullable = 'NO' FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tour_versions' AND column_name = 'verified_at'), 'version verification date is required');
SELECT ok((SELECT is_nullable = 'NO' FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tour_versions' AND column_name = 'attribution'), 'version attribution is required');
SELECT ok((SELECT is_nullable = 'NO' FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tour_versions' AND column_name = 'license'), 'version license is required');

SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tour_version_translations'::regclass AND contype = 'p' AND pg_get_constraintdef(oid) LIKE '%locale%'), 'version translations key by locale');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tour_version_stops'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%position BETWEEN 1 AND 64%'), 'stop positions are mapper bounded');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tour_versions'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%source_url ~ ''^https://''%'), 'version source URL is HTTPS');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tour_versions'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%valid_tour_copy_array%'), 'version copy arrays use the strict validator');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tour_versions'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%^https://[^[:space:]]+$%'), 'version source URL rejects malformed hosts');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tour_versions'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%source_url !~ ''@''%'), 'version source URL rejects credentials');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tour_versions'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%source_url !~ ''#''%'), 'version source URL rejects fragments');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tour_versions'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%utm_%'), 'version source URL rejects tracking keys');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tour_versions'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%email%'), 'version source URL rejects sensitive keys');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tours'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%length(slug) <= 160%'), 'tour slug is mapper-bounded');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tour_versions'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%cardinality(inclusions) <= 32%'), 'inclusions are mapper-bounded');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tour_version_stops'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%position BETWEEN 1 AND 64%'), 'stop positions are mapper-bounded');
SELECT ok(has_function_privilege('localens_tour_rpc_owner', 'private.valid_tour_copy_array(text[])', 'EXECUTE'), 'tour RPC owner can evaluate copy-array checks');
SELECT ok(has_table_privilege('localens_tour_guard_owner', 'public.departures', 'SELECT'), 'tour guard can inspect active departures');
SELECT ok(has_table_privilege('localens_tour_guard_owner', 'public.catalog_snapshot_place_translations', 'SELECT'), 'tour guard can inspect snapshot titles');
SELECT ok((SELECT count(*) = 1 FROM pg_policy WHERE polrelid = 'public.departures'::regclass AND polname = 'tour_guard_departures_select'), 'departure guard SELECT policy exists');
SELECT ok((SELECT count(*) = 1 FROM pg_policy WHERE polrelid = 'public.catalog_snapshot_place_translations'::regclass AND polname = 'catalog_snapshot_place_translations_tour_guard_select'), 'tour guard can inspect snapshot titles under RLS');
SELECT ok((SELECT pg_get_expr(polqual, polrelid) LIKE '%tour_versions%' AND pg_get_expr(polqual, polrelid) LIKE '%tours%' AND pg_get_expr(polqual, polrelid) LIKE '%catalog_snapshots%' FROM pg_policy WHERE polrelid = 'public.tour_version_translations'::regclass AND polname = 'tour_version_translations_public_select'), 'version translation API policy requires version, parent, and catalog publication');
SELECT ok((SELECT pg_get_expr(polqual, polrelid) LIKE '%tour_versions%' AND pg_get_expr(polqual, polrelid) LIKE '%tours%' AND pg_get_expr(polqual, polrelid) LIKE '%catalog_snapshots%' FROM pg_policy WHERE polrelid = 'public.tour_version_stops'::regclass AND polname = 'tour_version_stops_public_select'), 'version stop API policy requires version, parent, and catalog publication');
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
INSERT INTO public.catalog_snapshot_places (
  snapshot_id, place_id, area_id, slug, price_vnd_per_person,
  visit_duration_minutes, source_url, verified_at, attribution
)
VALUES
  ('00000000-0000-0000-0000-000000000901'::uuid, '00000000-0000-0000-0000-000000000913'::uuid, '00000000-0000-0000-0000-000000000911'::uuid, 'Invalid Place', 0, 60, 'https://example.invalid/invalid-place', DATE '2026-08-20', 'Fixture'),
  ('00000000-0000-0000-0000-000000000901'::uuid, '00000000-0000-0000-0000-000000000914'::uuid, '00000000-0000-0000-0000-000000000911'::uuid, 'valid-title-place', 0, 60, 'https://example.invalid/invalid-title-place', DATE '2026-08-20', 'Fixture'),
  ('00000000-0000-0000-0000-000000000901'::uuid, '00000000-0000-0000-0000-000000000915'::uuid, '00000000-0000-0000-0000-000000000911'::uuid, 'second-fixture-place', 0, 60, 'https://example.invalid/second-place', DATE '2026-08-20', 'Fixture');
INSERT INTO public.catalog_snapshot_place_translations (snapshot_id, place_id, locale, title, summary, description)
VALUES
  ('00000000-0000-0000-0000-000000000901'::uuid, '00000000-0000-0000-0000-000000000912'::uuid, 'en', 'Tour Fixture Place', 'Fixture', 'Fixture'),
  ('00000000-0000-0000-0000-000000000901'::uuid, '00000000-0000-0000-0000-000000000912'::uuid, 'vi', 'Dia diem mau', 'Mau', 'Mau'),
  ('00000000-0000-0000-0000-000000000901'::uuid, '00000000-0000-0000-0000-000000000913'::uuid, 'en', 'Invalid slug place', 'Fixture', 'Fixture'),
  ('00000000-0000-0000-0000-000000000901'::uuid, '00000000-0000-0000-0000-000000000913'::uuid, 'vi', 'Noi hop le', 'Mau', 'Mau'),
  ('00000000-0000-0000-0000-000000000901'::uuid, '00000000-0000-0000-0000-000000000914'::uuid, 'en', ' Invalid title ', 'Fixture', 'Fixture'),
  ('00000000-0000-0000-0000-000000000901'::uuid, '00000000-0000-0000-0000-000000000914'::uuid, 'vi', 'Noi hop le', 'Mau', 'Mau'),
  ('00000000-0000-0000-0000-000000000901'::uuid, '00000000-0000-0000-0000-000000000915'::uuid, 'en', 'Second Fixture Place', 'Fixture', 'Fixture'),
  ('00000000-0000-0000-0000-000000000901'::uuid, '00000000-0000-0000-0000-000000000915'::uuid, 'vi', 'Dia diem thu hai', 'Mau', 'Mau');

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
INSERT INTO public.tour_version_stops (tour_version_id, catalog_snapshot_id, position, place_id)
VALUES ('00000000-0000-0000-0000-000000000922'::uuid, '00000000-0000-0000-0000-000000000901'::uuid, 2, '00000000-0000-0000-0000-000000000915'::uuid);
SELECT lives_ok($$UPDATE public.tour_versions SET status = 'published', published_at = now() WHERE id = '00000000-0000-0000-0000-000000000922'::uuid$$, 'complete version can publish');
SELECT lives_ok($$UPDATE public.tours SET status = 'published' WHERE id = '00000000-0000-0000-0000-000000000921'::uuid$$, 'complete tour can publish');
SELECT ok((SELECT count(*) = 2 FROM public.tour_version_stops WHERE tour_version_id = '00000000-0000-0000-0000-000000000922'::uuid), 'published version keeps two ordered stops');
SELECT throws_ok($$UPDATE public.tours SET status = 'draft' WHERE id = '00000000-0000-0000-0000-000000000921'::uuid$$, '42501', NULL, 'published tour cannot return to draft');

-- A published version under a draft/archived parent is not sellable and must
-- not be visible through either the invoker projection or direct child reads.
INSERT INTO public.tours (id, slug, status)
VALUES ('00000000-0000-0000-0000-000000000926'::uuid, 'draft-parent-fixture', 'draft');
SELECT throws_ok($$UPDATE public.tour_translations SET tour_id = '00000000-0000-0000-0000-000000000926'::uuid WHERE tour_id = '00000000-0000-0000-0000-000000000921'::uuid AND locale = 'en'$$, '23514', NULL, 'current translation cannot leave a published tour');
SELECT is((SELECT count(*)::integer FROM public.tour_translations WHERE tour_id = '00000000-0000-0000-0000-000000000921'::uuid AND locale = ANY(ARRAY['en'::public.locale, 'vi'::public.locale])), 2, 'failed translation reparent keeps both current locales');
INSERT INTO public.tour_versions (
  id, tour_id, catalog_snapshot_id, status, duration_minutes,
  price_vnd_per_person, inclusions, exclusions, cancellation_policy,
  source_url, verified_at, attribution, license
)
VALUES (
  '00000000-0000-0000-0000-000000000927'::uuid,
  '00000000-0000-0000-0000-000000000926'::uuid,
  '00000000-0000-0000-0000-000000000901'::uuid,
  'draft', 120, 100000, ARRAY['guide'], ARRAY['transfer'], 'No refunds.',
  'https://example.invalid/fixture', DATE '2026-08-20', 'Fixture', 'CC BY 4.0'
);
INSERT INTO public.tour_version_translations (tour_version_id, locale, title, summary, meeting_point)
VALUES
  ('00000000-0000-0000-0000-000000000927'::uuid, 'en', 'Draft parent version', 'Fixture', 'Fixture gate'),
  ('00000000-0000-0000-0000-000000000927'::uuid, 'vi', 'Phien ban tour nhap', 'Mau', 'Cong mau');
INSERT INTO public.tour_version_stops (tour_version_id, catalog_snapshot_id, position, place_id)
VALUES ('00000000-0000-0000-0000-000000000927'::uuid, '00000000-0000-0000-0000-000000000901'::uuid, 1, '00000000-0000-0000-0000-000000000912'::uuid);
SELECT lives_ok($$UPDATE public.tour_versions SET status = 'published', published_at = now() WHERE id = '00000000-0000-0000-0000-000000000927'::uuid$$, 'complete version can publish under a draft parent');
SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::integer FROM public.tour_version_translations WHERE tour_version_id = '00000000-0000-0000-0000-000000000927'::uuid), 0, 'direct version translation RLS hides versions under draft parents');
SELECT is((SELECT count(*)::integer FROM public.tour_version_stops WHERE tour_version_id = '00000000-0000-0000-0000-000000000927'::uuid), 0, 'direct stop RLS hides versions under draft parents');
SELECT is((SELECT count(*)::integer FROM public.published_tours_v WHERE tour_version_id = '00000000-0000-0000-0000-000000000927'::uuid), 0, 'projection hides versions under draft parents');
RESET ROLE;
SELECT throws_ok($$UPDATE public.tour_versions SET status = 'retired' WHERE id = '00000000-0000-0000-0000-000000000927'::uuid$$, '42501', NULL, 'last published version cannot retire while parent remains non-archived');
SELECT lives_ok($$UPDATE public.tours SET status = 'archived' WHERE id = '00000000-0000-0000-0000-000000000926'::uuid$$, 'draft tour can be archived');
SELECT lives_ok($$UPDATE public.tour_versions SET status = 'retired' WHERE id = '00000000-0000-0000-0000-000000000927'::uuid$$, 'last version can retire after parent archive');
SELECT throws_ok($$UPDATE public.tours SET status = 'published' WHERE id = '00000000-0000-0000-0000-000000000926'::uuid$$, '42501', NULL, 'archived tour cannot be published');
SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::integer FROM public.tour_version_translations WHERE tour_version_id = '00000000-0000-0000-0000-000000000927'::uuid), 0, 'direct version translation RLS hides versions under archived parents');
SELECT is((SELECT count(*)::integer FROM public.tour_version_stops WHERE tour_version_id = '00000000-0000-0000-0000-000000000927'::uuid), 0, 'direct stop RLS hides archived-parent versions');
RESET ROLE;

-- A second published version leaves a safe retirement path for version 922.
INSERT INTO public.tour_versions (
  id, tour_id, catalog_snapshot_id, status, duration_minutes,
  price_vnd_per_person, inclusions, exclusions, cancellation_policy,
  source_url, verified_at, attribution, license
)
VALUES (
  '00000000-0000-0000-0000-000000000924'::uuid,
  '00000000-0000-0000-0000-000000000921'::uuid,
  '00000000-0000-0000-0000-000000000901'::uuid,
  'draft', 180, 120000, ARRAY['guide'], ARRAY['transfer'], 'No refunds.',
  'https://example.invalid/fixture-v2', DATE '2026-08-20', 'Fixture', 'CC BY 4.0'
);
INSERT INTO public.tour_version_translations (tour_version_id, locale, title, summary, meeting_point)
VALUES
  ('00000000-0000-0000-0000-000000000924'::uuid, 'en', 'Complete version two', 'Fixture', 'Fixture gate'),
  ('00000000-0000-0000-0000-000000000924'::uuid, 'vi', 'Phien ban hai', 'Mau', 'Cong mau');
INSERT INTO public.tour_version_stops (tour_version_id, catalog_snapshot_id, position, place_id)
VALUES ('00000000-0000-0000-0000-000000000924'::uuid, '00000000-0000-0000-0000-000000000901'::uuid, 1, '00000000-0000-0000-0000-000000000912'::uuid);
SELECT lives_ok($$UPDATE public.tour_versions SET status = 'published', published_at = now() WHERE id = '00000000-0000-0000-0000-000000000924'::uuid$$, 'second complete version can publish');

INSERT INTO public.tour_versions (
  id, tour_id, catalog_snapshot_id, status, duration_minutes,
  price_vnd_per_person, inclusions, exclusions, cancellation_policy,
  source_url, verified_at, attribution, license
)
VALUES
  ('00000000-0000-0000-0000-000000000928'::uuid, '00000000-0000-0000-0000-000000000921'::uuid, '00000000-0000-0000-0000-000000000901'::uuid, 'draft', 120, 100000, ARRAY['guide'], ARRAY['transfer'], 'No refunds.', 'https://example.invalid/invalid-slug-version', DATE '2026-08-20', 'Fixture', 'CC BY 4.0'),
  ('00000000-0000-0000-0000-000000000929'::uuid, '00000000-0000-0000-0000-000000000921'::uuid, '00000000-0000-0000-0000-000000000901'::uuid, 'draft', 120, 100000, ARRAY['guide'], ARRAY['transfer'], 'No refunds.', 'https://example.invalid/invalid-title-version', DATE '2026-08-20', 'Fixture', 'CC BY 4.0');
INSERT INTO public.tour_version_translations (tour_version_id, locale, title, summary, meeting_point)
VALUES
  ('00000000-0000-0000-0000-000000000928'::uuid, 'en', 'Invalid slug version', 'Fixture', 'Fixture gate'),
  ('00000000-0000-0000-0000-000000000928'::uuid, 'vi', 'Phien ban slug sai', 'Mau', 'Cong mau'),
  ('00000000-0000-0000-0000-000000000929'::uuid, 'en', 'Invalid title version', 'Fixture', 'Fixture gate'),
  ('00000000-0000-0000-0000-000000000929'::uuid, 'vi', 'Phien ban tieu de sai', 'Mau', 'Cong mau');
INSERT INTO public.tour_version_stops (tour_version_id, catalog_snapshot_id, position, place_id)
VALUES
  ('00000000-0000-0000-0000-000000000928'::uuid, '00000000-0000-0000-0000-000000000901'::uuid, 1, '00000000-0000-0000-0000-000000000913'::uuid),
  ('00000000-0000-0000-0000-000000000929'::uuid, '00000000-0000-0000-0000-000000000901'::uuid, 1, '00000000-0000-0000-0000-000000000914'::uuid);
SELECT throws_ok($$UPDATE public.tour_versions SET status = 'published', published_at = now() WHERE id = '00000000-0000-0000-0000-000000000928'::uuid$$, '23514', NULL, 'non-canonical catalog stop slug blocks publication');
SELECT throws_ok($$UPDATE public.tour_versions SET status = 'published', published_at = now() WHERE id = '00000000-0000-0000-0000-000000000929'::uuid$$, '23514', NULL, 'non-canonical catalog stop title blocks publication');

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
SELECT throws_ok($$INSERT INTO public.tour_versions (tour_id, catalog_snapshot_id, status, duration_minutes, price_vnd_per_person, inclusions, exclusions, cancellation_policy, source_url, verified_at, attribution, license) VALUES ('00000000-0000-0000-0000-000000000902'::uuid, '00000000-0000-0000-0000-000000000901'::uuid, 'draft', 120, 100000, ARRAY(SELECT 'item-' || n FROM generate_series(1, 33) AS s(n)), ARRAY['transfer'], 'No refunds.', 'https://example.invalid/fixture', DATE '2026-08-20', 'Fixture', 'CC BY 4.0')$$, '23514', NULL, '33 inclusions are rejected');
SELECT throws_ok($$INSERT INTO public.tour_version_stops (tour_version_id, catalog_snapshot_id, position, place_id) VALUES ('00000000-0000-0000-0000-000000000903'::uuid, '00000000-0000-0000-0000-000000000901'::uuid, 65, '00000000-0000-0000-0000-000000000912'::uuid)$$, '23514', NULL, 'stop position 65 is rejected');
SELECT throws_ok($$INSERT INTO public.tours (slug, status) VALUES (repeat('a', 161), 'draft')$$, '23514', NULL, '161-character tour slug is rejected');
SELECT throws_ok($$INSERT INTO public.tour_versions (tour_id, catalog_snapshot_id, status, duration_minutes, price_vnd_per_person, inclusions, exclusions, cancellation_policy, source_url, verified_at, attribution, license) VALUES ('00000000-0000-0000-0000-000000000902'::uuid, '00000000-0000-0000-0000-000000000901'::uuid, 'draft', 120, 100000, ARRAY['guide'], ARRAY['transfer'], 'No refunds.', 'https://example.invalid/fixture#fragment', DATE '2026-08-20', 'Fixture', 'CC BY 4.0')$$, '23514', NULL, 'source URL fragments are rejected');
SELECT throws_ok($$INSERT INTO public.tour_versions (tour_id, catalog_snapshot_id, status, duration_minutes, price_vnd_per_person, inclusions, exclusions, cancellation_policy, source_url, verified_at, attribution, license) VALUES ('00000000-0000-0000-0000-000000000902'::uuid, '00000000-0000-0000-0000-000000000901'::uuid, 'draft', 120, 100000, ARRAY['guide'], ARRAY['transfer'], 'No refunds.', 'https://example.invalid/fixture?UTM_source=campaign', DATE '2026-08-20', 'Fixture', 'CC BY 4.0')$$, '23514', NULL, 'tracking query keys are case-insensitively rejected');
SELECT throws_ok($$INSERT INTO public.tour_versions (tour_id, catalog_snapshot_id, status, duration_minutes, price_vnd_per_person, inclusions, exclusions, cancellation_policy, source_url, verified_at, attribution, license) VALUES ('00000000-0000-0000-0000-000000000902'::uuid, '00000000-0000-0000-0000-000000000901'::uuid, 'draft', 120, 100000, ARRAY['guide'], ARRAY['transfer'], 'No refunds.', 'https://example.invalid/fixture?full_name=Person', DATE '2026-08-20', 'Fixture', 'CC BY 4.0')$$, '23514', NULL, 'sensitive query keys are rejected');
SELECT throws_ok($$INSERT INTO public.tour_versions (tour_id, catalog_snapshot_id, status, duration_minutes, price_vnd_per_person, inclusions, exclusions, cancellation_policy, source_url, verified_at, attribution, license) VALUES ('00000000-0000-0000-0000-000000000902'::uuid, '00000000-0000-0000-0000-000000000901'::uuid, 'draft', 120, 100000, ARRAY['guide'], ARRAY['transfer'], 'No refunds.', 'https://example.invalid/fixture?%66ull_name=Person', DATE '2026-08-20', 'Fixture', 'CC BY 4.0')$$, '23514', NULL, 'percent-encoded query keys are rejected');
INSERT INTO public.departures (id, tour_version_id, start_at, end_at, status, capacity)
VALUES (
  '00000000-0000-0000-0000-000000000904'::uuid,
  '00000000-0000-0000-0000-000000000922'::uuid,
  TIMESTAMPTZ '2026-09-01 08:00:00+07', TIMESTAMPTZ '2026-09-01 10:00:00+07',
  'scheduled', 12
);
SELECT throws_ok($$UPDATE public.tour_versions SET status = 'retired' WHERE id = '00000000-0000-0000-0000-000000000922'::uuid$$, '42501', NULL, 'scheduled departure blocks version retirement');
SELECT throws_ok($$INSERT INTO public.departures (tour_version_id, start_at, end_at, status, capacity) VALUES ('00000000-0000-0000-0000-000000000903'::uuid, TIMESTAMPTZ '2026-09-01 08:00:00+07', TIMESTAMPTZ '2026-09-01 10:00:00+07', 'scheduled', 12)$$, '42501', NULL, 'scheduled departure cannot use a draft version');
SELECT throws_ok($$INSERT INTO public.departures (tour_version_id, start_at, end_at, status, capacity) VALUES ('00000000-0000-0000-0000-000000000903'::uuid, TIMESTAMPTZ '2026-09-01 08:00:00+07', TIMESTAMPTZ '2026-09-01 10:00:00+07', 'cancelled', 12)$$, '42501', NULL, 'departure must start in scheduled state');
SELECT lives_ok($$UPDATE public.departures SET status = 'sold_out' WHERE id = '00000000-0000-0000-0000-000000000904'::uuid$$, 'scheduled departure can become sold out');
SELECT throws_ok($$UPDATE public.tour_versions SET status = 'retired' WHERE id = '00000000-0000-0000-0000-000000000922'::uuid$$, '42501', NULL, 'sold-out departure blocks version retirement');
SELECT throws_ok($$UPDATE public.tours SET status = 'archived' WHERE id = '00000000-0000-0000-0000-000000000921'::uuid$$, '42501', NULL, 'active departure blocks parent tour archive');
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
