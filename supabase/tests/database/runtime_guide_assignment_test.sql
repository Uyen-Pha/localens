BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, private, extensions, pg_catalog;

SET LOCAL ROLE localens_tour_guard_owner;
GRANT EXECUTE ON FUNCTION private.valid_tour_copy_array(text[]) TO postgres;
RESET ROLE;

SELECT plan(41);

SELECT has_function('public', 'get_admin_guide_assignment_queue', ARRAY[]::text[]);
SELECT has_function('public', 'get_admin_eligible_guides', ARRAY[]::text[]);
SELECT has_function('public', 'assign_fixed_departure_guide', ARRAY['uuid', 'uuid', 'text']);
SELECT has_function('public', 'get_guide_assigned_bookings', ARRAY[]::text[]);
SELECT ok(to_regclass('private.guide_assignment_idempotency') IS NOT NULL, 'assignment idempotency ledger exists');
SELECT ok((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'private.guide_assignment_idempotency'::regclass), 'assignment ledger has RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'private.guide_assignment_idempotency'::regclass), 'assignment ledger forces RLS');
SELECT ok(NOT has_function_privilege('authenticated', 'public.assign_guide(uuid,uuid)', 'EXECUTE'), 'browser cannot bypass assignment idempotency through the legacy RPC');
SELECT ok(NOT has_function_privilege('authenticated', 'public.accept_guide_assignment(uuid)', 'EXECUTE'), 'browser cannot accept guide assignments');
SELECT ok(NOT has_function_privilege('authenticated', 'public.complete_guide_assignment(uuid)', 'EXECUTE'), 'browser cannot complete guide assignments');
SELECT ok(NOT has_table_privilege('authenticated', 'public.guide_assignments', 'SELECT'), 'browser cannot read assignment base rows');
SELECT ok(NOT has_table_privilege('authenticated', 'public.guide_profiles', 'SELECT'), 'browser cannot read guide-profile base rows');
SELECT ok(NOT has_table_privilege('authenticated', 'private.guide_assignment_idempotency', 'SELECT'), 'browser cannot read assignment idempotency rows');
SELECT is(
  (SELECT pg_catalog.string_agg(column_name::text, ',' ORDER BY ordinal_position)
   FROM information_schema.columns
   WHERE table_schema = 'private' AND table_name = 'guide_assignment_idempotency'),
  'actor_user_id,idempotency_key,booking_id,guide_user_id,assignment_id,result_status,result_outcome,created_at'::text,
  'idempotency ledger has an exact durable result snapshot'
);
SELECT ok(
  pg_get_function_result('public.get_guide_assigned_bookings()'::regprocedure)
    LIKE 'TABLE(assignment_id uuid,%',
  'guide projection begins with assignment identity'
);
SELECT ok((SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = 'public.assign_fixed_departure_guide(uuid,uuid,text)'::regprocedure), 'assignment RPC is SECURITY DEFINER');
SELECT ok((SELECT proconfig @> ARRAY['search_path=""', 'statement_timeout=5s'] FROM pg_catalog.pg_proc WHERE oid = 'public.assign_fixed_departure_guide(uuid,uuid,text)'::regprocedure), 'assignment RPC pins search path and bounds statements');
SELECT ok(pg_get_functiondef('public.assign_fixed_departure_guide(uuid,uuid,text)'::regprocedure) ~* 'count\(\*\).*actor_user_id.*<> 1', 'assignment requires exactly one actor role');
SELECT ok(pg_get_functiondef('public.assign_fixed_departure_guide(uuid,uuid,text)'::regprocedure) ~* 'count\(\*\).*requested_guide_user_id.*<> 1', 'assignment target must be a pure guide');
SELECT ok(pg_get_functiondef('public.assign_fixed_departure_guide(uuid,uuid,text)'::regprocedure) ~* 'scheduled', 'assignment requires a scheduled departure');
SELECT ok(pg_get_functiondef('public.assign_fixed_departure_guide(uuid,uuid,text)'::regprocedure) ~* 'tstzrange.*&&.*tstzrange', 'assignment rejects overlapping guide schedules');

INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000002701', 'authenticated', 'authenticated', 'b24-admin@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000002702', 'authenticated', 'authenticated', 'b24-additive-admin@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000002703', 'authenticated', 'authenticated', 'b24-guide-one@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000002704', 'authenticated', 'authenticated', 'b24-guide-two@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000002705', 'authenticated', 'authenticated', 'b24-additive-guide@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000002706', 'authenticated', 'authenticated', 'b24-customer@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

DELETE FROM private.user_roles
WHERE user_id IN (
  '00000000-0000-0000-0000-000000002701'::uuid,
  '00000000-0000-0000-0000-000000002702'::uuid,
  '00000000-0000-0000-0000-000000002703'::uuid,
  '00000000-0000-0000-0000-000000002704'::uuid,
  '00000000-0000-0000-0000-000000002705'::uuid,
  '00000000-0000-0000-0000-000000002706'::uuid
);

INSERT INTO private.user_roles (user_id, role)
VALUES
  ('00000000-0000-0000-0000-000000002701', 'admin'),
  ('00000000-0000-0000-0000-000000002702', 'admin'),
  ('00000000-0000-0000-0000-000000002702', 'guide'),
  ('00000000-0000-0000-0000-000000002703', 'guide'),
  ('00000000-0000-0000-0000-000000002704', 'guide'),
  ('00000000-0000-0000-0000-000000002705', 'guide'),
  ('00000000-0000-0000-0000-000000002705', 'customer'),
  ('00000000-0000-0000-0000-000000002706', 'customer')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.guide_profiles (user_id, display_name, language)
VALUES
  ('00000000-0000-0000-0000-000000002703', 'B2.4 Guide One', 'en'),
  ('00000000-0000-0000-0000-000000002704', 'B2.4 Guide Two', 'vi'),
  ('00000000-0000-0000-0000-000000002705', 'B2.4 Additive Guide', 'en')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.catalog_snapshots (id, status)
VALUES ('00000000-0000-0000-0000-000000002710', 'building');
INSERT INTO public.catalog_snapshot_areas (snapshot_id, area_id, slug)
VALUES ('00000000-0000-0000-0000-000000002710', '00000000-0000-0000-0000-000000002711', 'b24-area');
INSERT INTO public.catalog_snapshot_places (
  snapshot_id, place_id, area_id, slug, price_vnd_per_person,
  visit_duration_minutes, source_url, verified_at, attribution
) VALUES (
  '00000000-0000-0000-0000-000000002710', '00000000-0000-0000-0000-000000002712',
  '00000000-0000-0000-0000-000000002711', 'b24-place', 0, 60,
  'https://example.invalid/b24-place', DATE '2026-09-02', 'B2.4 fixture'
);
INSERT INTO public.catalog_snapshot_place_translations (snapshot_id, place_id, locale, title, summary, description)
VALUES
  ('00000000-0000-0000-0000-000000002710', '00000000-0000-0000-0000-000000002712', 'en', 'B2.4 place', 'Fixture', 'Fixture'),
  ('00000000-0000-0000-0000-000000002710', '00000000-0000-0000-0000-000000002712', 'vi', 'Dia diem B2.4', 'Mau', 'Mau');
INSERT INTO public.travel_snapshots (id, catalog_snapshot_id, status)
VALUES ('00000000-0000-0000-0000-000000002713', '00000000-0000-0000-0000-000000002710', 'building');
INSERT INTO public.tours (id, slug, status)
VALUES ('00000000-0000-0000-0000-000000002714', 'b24-tour', 'draft');
INSERT INTO public.tour_translations (tour_id, locale, title, summary, meeting_point)
VALUES
  ('00000000-0000-0000-0000-000000002714', 'en', 'B2.4 tour', 'Fixture', 'B2.4 gate'),
  ('00000000-0000-0000-0000-000000002714', 'vi', 'Tour B2.4', 'Mau', 'Cong B2.4');
INSERT INTO public.tour_versions (
  id, tour_id, catalog_snapshot_id, status, duration_minutes, price_vnd_per_person,
  inclusions, exclusions, cancellation_policy, source_url, verified_at, attribution, license
) VALUES (
  '00000000-0000-0000-0000-000000002715', '00000000-0000-0000-0000-000000002714',
  '00000000-0000-0000-0000-000000002710', 'draft', 180, 100000,
  ARRAY['guide'], ARRAY['transfer'], 'B2.4 fixture policy',
  'https://example.invalid/b24-tour', DATE '2026-09-02', 'B2.4 fixture', 'CC0'
);
INSERT INTO public.tour_version_translations (tour_version_id, locale, title, summary, meeting_point)
VALUES
  ('00000000-0000-0000-0000-000000002715', 'en', 'B2.4 version', 'Fixture', 'B2.4 gate'),
  ('00000000-0000-0000-0000-000000002715', 'vi', 'Phien ban B2.4', 'Mau', 'Cong B2.4');
INSERT INTO public.tour_version_stops (tour_version_id, catalog_snapshot_id, position, place_id)
VALUES ('00000000-0000-0000-0000-000000002715', '00000000-0000-0000-0000-000000002710', 1, '00000000-0000-0000-0000-000000002712');
UPDATE public.catalog_snapshots SET status = 'published', published_at = now()
WHERE id = '00000000-0000-0000-0000-000000002710';
UPDATE public.tour_versions SET status = 'published', published_at = now()
WHERE id = '00000000-0000-0000-0000-000000002715';
UPDATE public.tours SET status = 'published'
WHERE id = '00000000-0000-0000-0000-000000002714';

INSERT INTO public.departures (id, tour_version_id, start_at, end_at, status, capacity)
VALUES
  ('00000000-0000-0000-0000-000000002716', '00000000-0000-0000-0000-000000002715', '2026-09-20 09:00:00+07', '2026-09-20 12:00:00+07', 'scheduled', 10),
  ('00000000-0000-0000-0000-000000002717', '00000000-0000-0000-0000-000000002715', '2026-09-20 10:00:00+07', '2026-09-20 11:00:00+07', 'scheduled', 10),
  ('00000000-0000-0000-0000-000000002718', '00000000-0000-0000-0000-000000002715', '2026-09-21 09:00:00+07', '2026-09-21 12:00:00+07', 'scheduled', 10);
UPDATE public.departures SET status = 'cancelled'
WHERE id = '00000000-0000-0000-0000-000000002718';

INSERT INTO public.bookings (
  id, owner_user_id, source_kind, source_id, departure_id, quote_id, status, tour_version_id,
  title_en, title_vi, cancellation_policy, catalog_snapshot_id, travel_snapshot_id,
  fx_snapshot_id, fx_vnd_per_usd, per_person_vnd_minor, total_vnd_minor, checkout_currency,
  checkout_amount_minor, party_size, language, meeting_point, hold_expires_at, created_at
) VALUES
  ('00000000-0000-0000-0000-000000002721', '00000000-0000-0000-0000-000000002706', 'departure', '00000000-0000-0000-0000-000000002716', '00000000-0000-0000-0000-000000002716', NULL, 'confirmed', '00000000-0000-0000-0000-000000002715', 'B2.4 morning', 'B2.4 buoi sang', 'Fixture', '00000000-0000-0000-0000-000000002710', '00000000-0000-0000-0000-000000002713', NULL, NULL, 100000, 100000, 'vnd', 100000, 2, 'en', 'B2.4 gate', '2026-09-02 09:35:00+07', '2026-09-02 09:00:00+07'),
  ('00000000-0000-0000-0000-000000002722', '00000000-0000-0000-0000-000000002706', 'departure', '00000000-0000-0000-0000-000000002717', '00000000-0000-0000-0000-000000002717', NULL, 'confirmed', '00000000-0000-0000-0000-000000002715', 'B2.4 overlap', 'B2.4 trung lich', 'Fixture', '00000000-0000-0000-0000-000000002710', '00000000-0000-0000-0000-000000002713', NULL, NULL, 100000, 100000, 'vnd', 100000, 1, 'en', 'B2.4 gate', '2026-09-02 09:40:00+07', '2026-09-02 09:05:00+07'),
  ('00000000-0000-0000-0000-000000002723', '00000000-0000-0000-0000-000000002706', 'departure', '00000000-0000-0000-0000-000000002718', '00000000-0000-0000-0000-000000002718', NULL, 'confirmed', '00000000-0000-0000-0000-000000002715', 'B2.4 cancelled', 'B2.4 da huy', 'Fixture', '00000000-0000-0000-0000-000000002710', '00000000-0000-0000-0000-000000002713', NULL, NULL, 100000, 100000, 'vnd', 100000, 1, 'vi', 'B2.4 gate', '2026-09-02 09:45:00+07', '2026-09-02 09:10:00+07');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002702', true);
SELECT throws_ok(
  $$SELECT * FROM public.assign_fixed_departure_guide('00000000-0000-0000-0000-000000002721', '00000000-0000-0000-0000-000000002703', 'b24-additive-admin')$$,
  '42501', 'guide assignment administrator role required',
  'additive administrator role is denied'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002701', true);
SELECT is((SELECT count(*)::integer FROM public.get_admin_guide_assignment_queue()), 2, 'admin queue contains only confirmed scheduled fixed departures');
SELECT is((SELECT count(*)::integer FROM public.get_admin_eligible_guides()), 2, 'eligible guide projection contains only pure guides with profiles');
SELECT ok(
  (SELECT outcome = 'assigned' AND status = 'assigned'
   FROM public.assign_fixed_departure_guide(
     '00000000-0000-0000-0000-000000002721',
     '00000000-0000-0000-0000-000000002703',
     'b24-assign-one')),
  'admin assigns a pure guide to a confirmed scheduled booking'
);
SELECT ok(
  (SELECT first_replay.outcome = 'replayed'
      AND second_replay.outcome = 'replayed'
      AND first_replay.assignment_id = second_replay.assignment_id
   FROM public.assign_fixed_departure_guide(
     '00000000-0000-0000-0000-000000002721',
     '00000000-0000-0000-0000-000000002703',
     'b24-assign-one') AS first_replay
   CROSS JOIN public.assign_fixed_departure_guide(
     '00000000-0000-0000-0000-000000002721',
     '00000000-0000-0000-0000-000000002703',
     'b24-assign-one') AS second_replay),
  'same actor key and payload replays the durable result snapshot'
);
RESET ROLE;
INSERT INTO private.user_roles (user_id, role)
VALUES ('00000000-0000-0000-0000-000000002703', 'customer');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002701', true);
SELECT is(
  (SELECT outcome FROM public.assign_fixed_departure_guide(
    '00000000-0000-0000-0000-000000002721',
    '00000000-0000-0000-0000-000000002703',
    'b24-assign-one')),
  'replayed',
  'exact replay does not depend on later target-role drift'
);
RESET ROLE;
DELETE FROM private.user_roles
WHERE user_id = '00000000-0000-0000-0000-000000002703' AND role = 'customer';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002701', true);
SELECT throws_ok(
  $$SELECT * FROM public.assign_fixed_departure_guide('00000000-0000-0000-0000-000000002721', '00000000-0000-0000-0000-000000002704', 'b24-assign-one')$$,
  'P0001', 'guide_assignment_idempotency_conflict',
  'same administrator key with a changed guide conflicts'
);
SELECT ok(
  (SELECT outcome = 'unchanged' FROM public.assign_fixed_departure_guide(
    '00000000-0000-0000-0000-000000002721',
    '00000000-0000-0000-0000-000000002703',
    'b24-same-guide')),
  'same guide with a new key is a stable no-op'
);
RESET ROLE;
SELECT results_eq(
  $$SELECT count(*)::integer, count(*) FILTER (WHERE status IN ('assigned', 'accepted'))::integer
    FROM public.guide_assignments
    WHERE booking_id = '00000000-0000-0000-0000-000000002721'$$,
  $$VALUES (1, 1)$$,
  'same-guide no-op creates no assignment history'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002703', true);
SELECT ok(
  (SELECT assignment_id IS NOT NULL AND booking_id = '00000000-0000-0000-0000-000000002721'
   FROM public.get_guide_assigned_bookings()),
  'assigned guide reads its sanitized assignment identity'
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002704', true);
SELECT is((SELECT count(*)::integer FROM public.get_guide_assigned_bookings()), 0, 'other guide cannot see the assignment');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002705', true);
SELECT throws_ok(
  $$SELECT * FROM public.get_guide_assigned_bookings()$$,
  '42501', 'guide assignment guide role required',
  'additive guide role is denied the guide projection'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002701', true);
SELECT throws_ok(
  $$SELECT * FROM public.assign_fixed_departure_guide('00000000-0000-0000-0000-000000002722', '00000000-0000-0000-0000-000000002703', 'b24-overlap')$$,
  'P0001', 'guide_assignment_schedule_conflict',
  'overlapping fixed departure is rejected'
);
SELECT ok(
  (SELECT outcome = 'reassigned' AND guide_user_id = '00000000-0000-0000-0000-000000002704'
   FROM public.assign_fixed_departure_guide(
     '00000000-0000-0000-0000-000000002721',
     '00000000-0000-0000-0000-000000002704',
     'b24-reassign')),
  'administrator reassigns to a different pure guide'
);
RESET ROLE;
SELECT results_eq(
  $$SELECT status::text FROM public.guide_assignments
    WHERE booking_id = '00000000-0000-0000-0000-000000002721'
    ORDER BY assigned_at, id$$,
  $$VALUES ('closed'::text), ('assigned'::text)$$,
  'reassignment preserves one closed history row and one active row'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002703', true);
SELECT is((SELECT count(*)::integer FROM public.get_guide_assigned_bookings()), 0, 'former guide loses projection visibility after reassignment');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002704', true);
SELECT is((SELECT count(*)::integer FROM public.get_guide_assigned_bookings()), 1, 'new guide gains projection visibility after reassignment');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002701', true);
SELECT throws_ok(
  $$SELECT * FROM public.assign_fixed_departure_guide('00000000-0000-0000-0000-000000002723', '00000000-0000-0000-0000-000000002704', 'b24-cancelled-departure')$$,
  'P0001', 'guide_assignment_state_conflict',
  'cancelled departure cannot be assigned'
);
SELECT ok(
  (SELECT guide_user_id = '00000000-0000-0000-0000-000000002704'
   FROM public.get_admin_guide_assignment_queue()
   WHERE booking_id = '00000000-0000-0000-0000-000000002721'),
  'admin queue reloads the authoritative current guide'
);
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM private.guide_assignment_idempotency), 3, 'ledger stores assigned unchanged and reassigned snapshots only');

SELECT * FROM finish();
ROLLBACK;
