-- Integration-deferred pgTAP coverage for the catalog boundary. Run with
-- `supabase test db --local` after a reset; this workstation has no runtime.
BEGIN;

SELECT plan(112);

-- The mutable catalog and immutable history relations are all present.
SELECT ok(to_regclass('public.areas') IS NOT NULL, 'areas exists');
SELECT ok(to_regclass('public.area_translations') IS NOT NULL, 'area translations exists');
SELECT ok(to_regclass('public.places') IS NOT NULL, 'places exists');
SELECT ok(to_regclass('public.place_translations') IS NOT NULL, 'place translations exists');
SELECT ok(to_regclass('public.place_experience_types') IS NOT NULL, 'place experience types exists');
SELECT ok(to_regclass('public.place_guide_languages') IS NOT NULL, 'place guide languages exists');
SELECT ok(to_regclass('public.place_supports') IS NOT NULL, 'place supports exists');
SELECT ok(to_regclass('public.place_opening_hours') IS NOT NULL, 'place opening hours exists');
SELECT ok(to_regclass('public.place_opening_exceptions') IS NOT NULL, 'place opening exceptions exists');
SELECT ok(to_regclass('public.place_opening_exception_windows') IS NOT NULL, 'place exception windows exists');
SELECT ok(to_regclass('public.catalog_snapshots') IS NOT NULL, 'catalog snapshots exists');
SELECT ok(to_regclass('public.catalog_snapshot_areas') IS NOT NULL, 'snapshot areas exists');
SELECT ok(to_regclass('public.catalog_snapshot_area_translations') IS NOT NULL, 'snapshot area translations exists');
SELECT ok(to_regclass('public.catalog_snapshot_places') IS NOT NULL, 'snapshot places exists');
SELECT ok(to_regclass('public.catalog_snapshot_place_translations') IS NOT NULL, 'snapshot translations exists');
SELECT ok(to_regclass('public.catalog_snapshot_place_experience_types') IS NOT NULL, 'snapshot experience types exists');
SELECT ok(to_regclass('public.catalog_snapshot_place_guide_languages') IS NOT NULL, 'snapshot guide languages exists');
SELECT ok(to_regclass('public.catalog_snapshot_place_supports') IS NOT NULL, 'snapshot supports exists');
SELECT ok(to_regclass('public.catalog_snapshot_place_opening_hours') IS NOT NULL, 'snapshot opening hours exists');
SELECT ok(to_regclass('public.catalog_snapshot_place_opening_exceptions') IS NOT NULL, 'snapshot exceptions exists');
SELECT ok(to_regclass('public.catalog_snapshot_place_opening_exception_windows') IS NOT NULL, 'snapshot exception windows exists');

-- Every public relation is forced through RLS, including history children.
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.areas'::regclass), 'areas has forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.area_translations'::regclass), 'area translations have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.places'::regclass), 'places have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.place_translations'::regclass), 'place translations have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.place_experience_types'::regclass), 'place types have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.place_guide_languages'::regclass), 'place languages have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.place_supports'::regclass), 'place supports have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.place_opening_hours'::regclass), 'place hours have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.place_opening_exceptions'::regclass), 'place exceptions have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.place_opening_exception_windows'::regclass), 'place exception windows have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.catalog_snapshots'::regclass), 'snapshots have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.catalog_snapshot_areas'::regclass), 'snapshot areas have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.catalog_snapshot_area_translations'::regclass), 'snapshot area translations have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.catalog_snapshot_places'::regclass), 'snapshot places have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.catalog_snapshot_place_translations'::regclass), 'snapshot translations have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.catalog_snapshot_place_experience_types'::regclass), 'snapshot types have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.catalog_snapshot_place_guide_languages'::regclass), 'snapshot languages have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.catalog_snapshot_place_supports'::regclass), 'snapshot supports have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.catalog_snapshot_place_opening_hours'::regclass), 'snapshot hours have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.catalog_snapshot_place_opening_exceptions'::regclass), 'snapshot exceptions have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.catalog_snapshot_place_opening_exception_windows'::regclass), 'snapshot exception windows have forced RLS');

-- Snapshot children cannot outlive their snapshot/place/area membership.
SELECT ok((SELECT pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%' FROM pg_constraint WHERE conname = 'catalog_snapshot_places_snapshot_id_area_id_fkey'), 'snapshot places reference matching snapshot area with RESTRICT');
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.catalog_snapshot_place_translations'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%') = 1, 'snapshot translation membership is restricted');
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.catalog_snapshot_place_experience_types'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%') = 1, 'snapshot type membership is restricted');
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.catalog_snapshot_place_guide_languages'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%') = 1, 'snapshot language membership is restricted');
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.catalog_snapshot_place_supports'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%') = 1, 'snapshot support membership is restricted');
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.catalog_snapshot_place_opening_hours'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%') = 1, 'snapshot opening membership is restricted');
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.catalog_snapshot_place_opening_exceptions'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%') = 1, 'snapshot exception membership is restricted');
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.catalog_snapshot_place_opening_exception_windows'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%') = 1, 'snapshot exception window membership is restricted');

-- Critical scalar/domain constraints are declared in the database, not just
-- implied by an application adapter.
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.place_opening_hours'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%weekday >= 0%' AND pg_get_constraintdef(oid) LIKE '%weekday <= 6%'), 'weekday is constrained to 0..6');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.place_opening_hours'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%opens_at <> closes_at%'), 'normal windows are non-equal');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.places'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%visit_duration_minutes >= 15%' AND pg_get_constraintdef(oid) LIKE '%visit_duration_minutes <= 480%'), 'place duration mirrors PlaceCandidate');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.places'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%price_vnd_per_person >= 0%' AND pg_get_constraintdef(oid) LIKE '%9007199254740991%'), 'place money uses the JavaScript safe bound');
SELECT ok((SELECT pg_get_functiondef('private.assert_exception_consistency()'::regprocedure) LIKE '%closed exceptions cannot contain opening windows%'), 'closed exceptions cannot contain opening windows');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.place_opening_exceptions'::regclass AND contype = 'u' AND pg_get_constraintdef(oid) LIKE '%local_date%'), 'exception dates are unique per place');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.place_supports'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%support_kind%'), 'support kind is closed');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.place_supports'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%status%'), 'support status is tri-state');

-- Trigger/RPC security and append-only shape.
SELECT ok((SELECT prosecdef FROM pg_proc WHERE oid = 'private.create_catalog_snapshot()'::regprocedure), 'snapshot creator is SECURITY DEFINER');
SELECT ok((SELECT proconfig @> ARRAY['search_path=""'] FROM pg_proc WHERE oid = 'private.create_catalog_snapshot()'::regprocedure), 'snapshot creator pins search_path');
SELECT is((SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'private.create_catalog_snapshot()'::regprocedure), 'localens_catalog_rpc_owner', 'snapshot creator has named owner');
SELECT ok((SELECT prosecdef AND pg_get_functiondef(oid) LIKE '%to_jsonb(NEW)->>''id'' = to_jsonb(OLD)->>''id''%' AND pg_get_functiondef(oid) LIKE '%to_jsonb(OLD)->>''published_at'' IS NULL%' FROM pg_proc WHERE oid = 'private.reject_append_only_change()'::regprocedure), 'append-only guard pins the only building-to-published transition');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'catalog_snapshot_places_append_only'), 'snapshot place append-only trigger exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'place_opening_hours_no_overlap'), 'normal overlap trigger exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'place_exception_windows_no_overlap'), 'exception overlap trigger exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'places_published_completeness'), 'published completeness trigger exists');

-- The private RPC copies canonical prices/durations and never accepts a price
-- parameter from its caller. It is not executable by API roles.
SELECT ok((SELECT pg_get_functiondef('private.create_catalog_snapshot()'::regprocedure) LIKE '%p.price_vnd_per_person%' AND pg_get_functiondef('private.create_catalog_snapshot()'::regprocedure) LIKE '%p.visit_duration_minutes%'), 'snapshot creator copies canonical scalar facts');
SELECT ok(NOT has_function_privilege('anon', 'private.create_catalog_snapshot()', 'EXECUTE'), 'anon cannot execute snapshot creator');
SELECT ok(NOT has_function_privilege('authenticated', 'private.create_catalog_snapshot()', 'EXECUTE'), 'authenticated cannot execute snapshot creator');
SELECT ok((SELECT pg_get_viewdef('public.catalog_snapshot_places_v'::regclass) LIKE '%price_vnd_per_person%' AND pg_get_viewdef('public.catalog_snapshot_places_v'::regclass) LIKE '%::text%'), 'PostgREST projection exposes canonical decimal-string money');
SELECT ok((SELECT pg_get_functiondef('private.create_catalog_snapshot()'::regprocedure) LIKE '%LOCK TABLE public.areas IN SHARE ROW EXCLUSIVE MODE%'
  AND pg_get_functiondef('private.create_catalog_snapshot()'::regprocedure) LIKE '%LOCK TABLE public.area_translations IN SHARE ROW EXCLUSIVE MODE%'
  AND pg_get_functiondef('private.create_catalog_snapshot()'::regprocedure) LIKE '%LOCK TABLE public.places IN SHARE ROW EXCLUSIVE MODE%'
  AND pg_get_functiondef('private.create_catalog_snapshot()'::regprocedure) LIKE '%LOCK TABLE public.place_translations IN SHARE ROW EXCLUSIVE MODE%'
  AND pg_get_functiondef('private.create_catalog_snapshot()'::regprocedure) LIKE '%LOCK TABLE public.place_experience_types IN SHARE ROW EXCLUSIVE MODE%'
  AND pg_get_functiondef('private.create_catalog_snapshot()'::regprocedure) LIKE '%LOCK TABLE public.place_guide_languages IN SHARE ROW EXCLUSIVE MODE%'
  AND pg_get_functiondef('private.create_catalog_snapshot()'::regprocedure) LIKE '%LOCK TABLE public.place_supports IN SHARE ROW EXCLUSIVE MODE%'
  AND pg_get_functiondef('private.create_catalog_snapshot()'::regprocedure) LIKE '%LOCK TABLE public.place_opening_hours IN SHARE ROW EXCLUSIVE MODE%'
  AND pg_get_functiondef('private.create_catalog_snapshot()'::regprocedure) LIKE '%LOCK TABLE public.place_opening_exceptions IN SHARE ROW EXCLUSIVE MODE%'
  AND pg_get_functiondef('private.create_catalog_snapshot()'::regprocedure) LIKE '%LOCK TABLE public.place_opening_exception_windows IN SHARE ROW EXCLUSIVE MODE%'), 'snapshot creator locks canonical tables in fixed order');
SELECT ok((SELECT pg_get_functiondef('private.assert_opening_window_nonoverlap()'::regprocedure) LIKE '%pg_catalog.pg_advisory_xact_lock%'
  AND pg_get_functiondef('private.assert_exception_window_nonoverlap()'::regprocedure) LIKE '%pg_catalog.pg_advisory_xact_lock%'
  AND pg_get_functiondef('private.assert_exception_consistency()'::regprocedure) LIKE '%pg_catalog.pg_advisory_xact_lock%'
  AND pg_get_functiondef('private.assert_exception_window_parent_open()'::regprocedure) LIKE '%pg_catalog.pg_advisory_xact_lock%'
  AND pg_get_functiondef('private.assert_published_place_complete(uuid)'::regprocedure) LIKE '%pg_catalog.pg_advisory_xact_lock%'), 'catalog check-then-act paths use transaction advisory locks');
SELECT ok((SELECT pg_get_functiondef('private.assert_published_place_row()'::regprocedure) LIKE '%OLD.place_id IS DISTINCT FROM NEW.place_id%'
  AND pg_get_functiondef('private.assert_published_place_row()'::regprocedure) LIKE '%OLD.place_id::text < NEW.place_id::text%'
  AND pg_get_functiondef('private.assert_published_place_row()'::regprocedure) LIKE '%private.assert_published_place_complete(OLD.place_id)%'
  AND pg_get_functiondef('private.assert_published_place_row()'::regprocedure) LIKE '%private.assert_published_place_complete(NEW.place_id)%'
  AND pg_get_functiondef('private.assert_opening_window_nonoverlap()'::regprocedure) LIKE '%OLD.place_id IS DISTINCT FROM NEW.place_id%'
  AND pg_get_functiondef('private.assert_opening_window_nonoverlap()'::regprocedure) LIKE '%OLD.place_id::text < NEW.place_id::text%'), 'required-child reparenting locks both places in canonical order');
SELECT ok(NOT has_table_privilege('anon', 'public.places', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.places', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.catalog_snapshot_places', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.catalog_snapshot_places', 'SELECT'), 'API roles cannot read catalog base tables');
SELECT ok(has_table_privilege('anon', 'public.catalog_snapshot_places_v', 'SELECT')
  AND has_table_privilege('authenticated', 'public.catalog_snapshot_places_v', 'SELECT'), 'API roles can read only the published projection');
SELECT is((SELECT pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid = 'public.catalog_snapshot_places_v'::regclass), 'localens_catalog_rpc_owner', 'published projection has named NOLOGIN definer owner');
SELECT ok((SELECT rolcanlogin = false AND rolbypassrls = false FROM pg_catalog.pg_roles WHERE rolname = 'localens_catalog_rpc_owner'), 'projection owner cannot login or bypass RLS');

-- Behavioral invariants use fixed rows and roll back with this suite. A draft
-- becomes publishable only after complete provenance, EN/VI copy, and engine
-- facts are present.
DELETE FROM public.areas WHERE id IN (
  '00000000-0000-0000-0000-000000000101'::uuid,
  '00000000-0000-0000-0000-000000000102'::uuid
);
INSERT INTO public.areas (id, slug) VALUES
  ('00000000-0000-0000-0000-000000000101'::uuid, 'behavior-area'),
  ('00000000-0000-0000-0000-000000000102'::uuid, 'wrong-area');

SELECT throws_ok($$INSERT INTO public.places (id, area_id, slug, status)
  VALUES ('00000000-0000-0000-0000-000000000202'::uuid, '00000000-0000-0000-0000-000000000101'::uuid, 'incomplete-published-insert', 'published')$$::text, '23514'::character(5), NULL::text, 'direct published insert rejects incomplete provenance and children'::text);
SELECT lives_ok($$INSERT INTO public.places (id, area_id, slug, status)
  VALUES ('00000000-0000-0000-0000-000000000203'::uuid, '00000000-0000-0000-0000-000000000101'::uuid, 'incomplete-published-update', 'draft')$$,
  'draft fixture for incomplete publication exists');
SELECT throws_ok($$UPDATE public.places SET status = 'published' WHERE id = '00000000-0000-0000-0000-000000000203'::uuid$$::text, '23514'::character(5), NULL::text, 'direct draft-to-published update rejects incomplete facts'::text);

INSERT INTO public.places (
  id, area_id, slug, price_vnd_per_person, visit_duration_minutes,
  source_url, verified_at, attribution
)
VALUES (
  '00000000-0000-0000-0000-000000000201'::uuid,
  '00000000-0000-0000-0000-000000000101'::uuid,
  'behavior-place', 125000, 90, 'https://example.invalid/place', DATE '2026-08-20', 'LocalLens verification'
);
INSERT INTO public.place_translations (place_id, locale, title, summary, description) VALUES
  ('00000000-0000-0000-0000-000000000201'::uuid, 'en', 'Behavior place', 'English summary', 'English description'),
  ('00000000-0000-0000-0000-000000000201'::uuid, 'vi', 'Dia diem kiem thu', 'Tom tat tieng Viet', 'Mo ta tieng Viet');
INSERT INTO public.place_experience_types (place_id, experience_type)
VALUES ('00000000-0000-0000-0000-000000000201'::uuid, 'history');
INSERT INTO public.place_guide_languages (place_id, language)
VALUES ('00000000-0000-0000-0000-000000000201'::uuid, 'en');
INSERT INTO public.place_opening_hours (place_id, weekday, opens_at, closes_at)
VALUES ('00000000-0000-0000-0000-000000000201'::uuid, 1, TIME '08:00', TIME '12:00');
INSERT INTO public.places (id, area_id, slug)
VALUES ('00000000-0000-0000-0000-000000000205'::uuid, '00000000-0000-0000-0000-000000000101'::uuid, 'reparent-draft-place');
UPDATE public.places SET status = 'published'
WHERE id = '00000000-0000-0000-0000-000000000201'::uuid;
SELECT is((SELECT status::text FROM public.places WHERE id = '00000000-0000-0000-0000-000000000201'::uuid), 'published', 'complete draft publishes successfully');
SELECT throws_ok($$DELETE FROM public.place_guide_languages WHERE place_id = '00000000-0000-0000-0000-000000000201'::uuid$$::text, '23514'::character(5), NULL::text, 'published place cannot delete its last guide language'::text);
SELECT throws_ok($$DELETE FROM public.place_opening_hours WHERE place_id = '00000000-0000-0000-0000-000000000201'::uuid$$::text, '23514'::character(5), NULL::text, 'published place cannot delete its last opening window'::text);

SELECT throws_ok($$UPDATE public.place_translations SET place_id = '00000000-0000-0000-0000-000000000205'::uuid
  WHERE place_id = '00000000-0000-0000-0000-000000000201'::uuid AND locale = 'en'$$::text, '23514'::character(5), NULL::text, 'reparenting the last EN translation is rejected'::text);
SELECT is((SELECT count(*)::integer FROM public.place_translations WHERE place_id = '00000000-0000-0000-0000-000000000201'::uuid), 2, 'failed EN reparent leaves published place unchanged');
SELECT throws_ok($$UPDATE public.place_experience_types SET place_id = '00000000-0000-0000-0000-000000000205'::uuid
  WHERE place_id = '00000000-0000-0000-0000-000000000201'::uuid AND experience_type = 'history'$$::text, '23514'::character(5), NULL::text, 'reparenting the last experience type is rejected'::text);
SELECT is((SELECT count(*)::integer FROM public.place_experience_types WHERE place_id = '00000000-0000-0000-0000-000000000201'::uuid), 1, 'failed experience reparent leaves published place unchanged');
SELECT throws_ok($$UPDATE public.place_guide_languages SET place_id = '00000000-0000-0000-0000-000000000205'::uuid
  WHERE place_id = '00000000-0000-0000-0000-000000000201'::uuid AND language = 'en'$$::text, '23514'::character(5), NULL::text, 'reparenting the last guide language is rejected'::text);
SELECT is((SELECT count(*)::integer FROM public.place_guide_languages WHERE place_id = '00000000-0000-0000-0000-000000000201'::uuid), 1, 'failed guide-language reparent leaves published place unchanged');
SELECT throws_ok($$UPDATE public.place_opening_hours SET place_id = '00000000-0000-0000-0000-000000000205'::uuid
  WHERE place_id = '00000000-0000-0000-0000-000000000201'::uuid AND weekday = 1$$::text, '23514'::character(5), NULL::text, 'reparenting the last opening window is rejected'::text);
SELECT is((SELECT count(*)::integer FROM public.place_opening_hours WHERE place_id = '00000000-0000-0000-0000-000000000201'::uuid), 1, 'failed opening reparent leaves published place unchanged');

SELECT throws_ok($$INSERT INTO public.place_opening_hours (place_id, weekday, opens_at, closes_at)
  VALUES ('00000000-0000-0000-0000-000000000201'::uuid, 1, TIME '11:00', TIME '13:00')$$::text, '23P01'::character(5), NULL::text, 'normal opening overlap is rejected'::text);
SELECT lives_ok($$INSERT INTO public.place_opening_hours (place_id, weekday, opens_at, closes_at)
  VALUES ('00000000-0000-0000-0000-000000000201'::uuid, 2, TIME '22:00', TIME '02:00')$$,
  'overnight fixture inserts successfully');
SELECT throws_ok($$INSERT INTO public.place_opening_hours (place_id, weekday, opens_at, closes_at)
  VALUES ('00000000-0000-0000-0000-000000000201'::uuid, 3, TIME '01:00', TIME '03:00')$$::text, '23P01'::character(5), NULL::text, 'overnight carry overlap is rejected'::text);
INSERT INTO public.place_opening_exceptions (id, place_id, local_date, closed)
VALUES ('00000000-0000-0000-0000-000000000301'::uuid, '00000000-0000-0000-0000-000000000201'::uuid, DATE '2026-09-02', true);
SELECT throws_ok($$INSERT INTO public.place_opening_exceptions (place_id, local_date, closed)
  VALUES ('00000000-0000-0000-0000-000000000201'::uuid, DATE '2026-09-02', false)$$::text, '23505'::character(5), NULL::text, 'duplicate exception date is rejected'::text);
SELECT throws_ok($$INSERT INTO public.place_opening_exception_windows (exception_id, place_id, opens_at, closes_at)
  VALUES ('00000000-0000-0000-0000-000000000301'::uuid, '00000000-0000-0000-0000-000000000201'::uuid, TIME '09:00', TIME '10:00')$$::text, '23514'::character(5), NULL::text, 'later window insert into closed exception is rejected'::text);

INSERT INTO public.places (id, area_id, slug)
VALUES ('00000000-0000-0000-0000-000000000204'::uuid, '00000000-0000-0000-0000-000000000101'::uuid, 'draft-only-place');
SELECT is((SELECT count(*)::integer FROM public.places WHERE id = '00000000-0000-0000-0000-000000000204'::uuid AND status = 'draft'), 1, 'draft place remains mutable and unpublished');

-- The RPC copies exact canonical facts and returns one published snapshot.
INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000901'::uuid, 'authenticated', 'authenticated', 'catalog-admin@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO private.user_roles (user_id, role)
VALUES ('00000000-0000-0000-0000-000000000901'::uuid, 'admin'::public.app_role)
ON CONFLICT (user_id, role) DO NOTHING;
SET LOCAL ROLE localens_admin_rpc_owner;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
SELECT private.create_catalog_snapshot();
RESET ROLE;
SELECT pass('admin snapshot RPC completes atomically');
SELECT is((SELECT count(*)::integer FROM public.catalog_snapshots WHERE status = 'published'), 1, 'snapshot is published once');
SELECT is((SELECT count(*)::integer FROM public.catalog_snapshot_places WHERE price_vnd_per_person = 125000 AND visit_duration_minutes = 90), 1, 'snapshot copies exact money and duration');
SELECT is((SELECT count(*)::integer FROM public.catalog_snapshot_place_translations WHERE place_id = '00000000-0000-0000-0000-000000000201'::uuid), 2, 'snapshot copies both translations');
SELECT is((SELECT count(*)::integer FROM public.catalog_snapshot_place_experience_types WHERE place_id = '00000000-0000-0000-0000-000000000201'::uuid), 1, 'snapshot copies experience types');
SELECT is((SELECT count(*)::integer FROM public.catalog_snapshot_place_guide_languages WHERE place_id = '00000000-0000-0000-0000-000000000201'::uuid), 1, 'snapshot copies guide languages');
SELECT is((SELECT count(*)::integer FROM public.catalog_snapshot_place_opening_hours WHERE place_id = '00000000-0000-0000-0000-000000000201'::uuid), 2, 'snapshot copies normal opening windows');

UPDATE public.places SET price_vnd_per_person = 999999 WHERE id = '00000000-0000-0000-0000-000000000201'::uuid;
SELECT is((SELECT price_vnd_per_person::bigint FROM public.catalog_snapshot_places WHERE place_id = '00000000-0000-0000-0000-000000000201'::uuid), 125000::bigint, 'current catalog mutation does not change history');
SELECT throws_ok($$UPDATE public.catalog_snapshots SET id = gen_random_uuid() WHERE status = 'published'$$::text, '42501'::character(5), NULL::text, 'published snapshot identity update is rejected'::text);
SELECT throws_ok($$DELETE FROM public.catalog_snapshots WHERE status = 'published'$$::text, '42501'::character(5), NULL::text, 'published snapshot delete is rejected'::text);
SELECT throws_ok($$UPDATE public.catalog_snapshot_places SET price_vnd_per_person = 1 WHERE place_id = '00000000-0000-0000-0000-000000000201'::uuid$$::text, '42501'::character(5), NULL::text, 'snapshot place update is rejected'::text);
SELECT throws_ok($$DELETE FROM public.catalog_snapshot_place_translations WHERE place_id = '00000000-0000-0000-0000-000000000201'::uuid$$::text, '42501'::character(5), NULL::text, 'snapshot child delete is rejected'::text);
-- Use a separate building snapshot so the composite membership FK, rather
-- than the published-child insert guard, is the intended failure.
INSERT INTO public.catalog_snapshots (id, status)
VALUES ('00000000-0000-0000-0000-000000000106'::uuid, 'building');
INSERT INTO public.catalog_snapshot_areas (snapshot_id, area_id, slug)
VALUES ('00000000-0000-0000-0000-000000000106'::uuid, '00000000-0000-0000-0000-000000000104'::uuid, 'membership-fixture-area');
SELECT throws_ok($$INSERT INTO public.catalog_snapshot_places (snapshot_id, place_id, area_id, slug, price_vnd_per_person, visit_duration_minutes, source_url, verified_at, attribution)
  VALUES ('00000000-0000-0000-0000-000000000106'::uuid, gen_random_uuid(), '00000000-0000-0000-0000-000000000105'::uuid, 'wrong-membership', 1, 15, 'https://example.invalid/wrong', DATE '2026-08-20', 'x')$$::text, '23503'::character(5), NULL::text, 'snapshot place cannot reference an area outside the snapshot'::text);

SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT count(*) FROM public.places WHERE id = '00000000-0000-0000-0000-000000000204'::uuid$$::text, '42501'::character(5), NULL::text, 'anonymous cannot read catalog base tables'::text);
SELECT is((SELECT count(*)::integer FROM public.catalog_snapshot_places_v WHERE place_id = '00000000-0000-0000-0000-000000000201'::uuid), 1, 'anonymous can read the published catalog projection');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
