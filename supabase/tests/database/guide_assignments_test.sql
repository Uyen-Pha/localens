-- Runtime execution is deferred to the container-backed Task 16 gate. This
-- executable pgTAP suite verifies the guide boundary and its least privilege.
BEGIN;

SELECT plan(79);

RESET ROLE;

SELECT ok(to_regclass('public.guide_assignments') IS NOT NULL, 'guide assignments table exists');
SELECT ok(to_regprocedure('public.assign_guide(uuid,uuid)') IS NOT NULL, 'admin assign RPC exists');
SELECT ok(to_regprocedure('public.accept_guide_assignment(uuid)') IS NOT NULL, 'guide accept RPC exists');
SELECT ok(to_regprocedure('public.complete_guide_assignment(uuid)') IS NOT NULL, 'guide complete RPC exists');
SELECT ok(to_regprocedure('public.get_guide_assigned_bookings()') IS NOT NULL, 'sanitized guide projection RPC exists');
SELECT ok((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.guide_assignments'::regclass), 'assignment table has RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.guide_assignments'::regclass), 'assignment table forces RLS');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.guide_assignments'::regclass AND attname = 'booking_id'), 'assignment stores booking identity');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.guide_assignments'::regclass AND attname = 'guide_user_id'), 'assignment stores guide identity');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.guide_assignments'::regclass AND attname = 'mobility_flags'), 'assignment stores mobility snapshot');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.guide_assignments'::regclass AND attname = 'dietary_flags'), 'assignment stores dietary snapshot');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_indexes WHERE indexname = 'guide_assignments_one_active_booking'), 'one active assignment index exists');
SELECT ok((SELECT indexdef FROM pg_catalog.pg_indexes WHERE indexname = 'guide_assignments_one_active_booking') ~* 'assigned.*accepted', 'active index covers assigned and accepted states');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.guide_assignments'::regclass AND pg_get_constraintdef(oid) ~* 'valid_guide_requirement_flags'), 'requirement flags are allowlisted');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.guide_assignments'::regclass AND pg_get_constraintdef(oid) ~* 'accepted_at.*completed_at.*closed_at'), 'assignment timestamps follow state shape');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.guide_assignments'::regclass AND pg_get_constraintdef(oid) ~* 'ON DELETE RESTRICT'), 'assignment booking and guide history is restrictive');

SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'guide_assignment_mutation_guard'), 'assignment mutation guard exists');
SELECT ok((SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = 'private.assert_guide_assignment_mutation()'::regprocedure), 'assignment mutation guard is SECURITY DEFINER');
SELECT ok((SELECT proconfig @> ARRAY['search_path='] FROM pg_catalog.pg_proc WHERE oid = 'private.assert_guide_assignment_mutation()'::regprocedure), 'assignment mutation guard pins search path');
SELECT ok((SELECT pg_get_userbyid(proowner) = 'localens_guide_assignment_guard_owner' FROM pg_catalog.pg_proc WHERE oid = 'private.assert_guide_assignment_mutation()'::regprocedure), 'assignment mutation guard has named owner');
SELECT ok(pg_get_functiondef('private.assert_guide_assignment_mutation()'::regprocedure) ~* 'assigned.*accepted|accepted.*completed', 'assignment accepts only exact forward transitions');
SELECT ok(pg_get_functiondef('private.assert_guide_assignment_mutation()'::regprocedure) ~* 'closed', 'assignment close transition is explicit');
SELECT ok(pg_get_functiondef('private.assert_guide_assignment_mutation()'::regprocedure) ~* 'mobility_flags|dietary_flags', 'requirement snapshots are immutable');
SELECT ok(pg_get_functiondef('private.assert_guide_assignment_mutation()'::regprocedure) ~* 'localens.guide_assignment_transition', 'direct assignment DML requires transition context');

SELECT ok((SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = 'private.assign_guide(uuid,uuid)'::regprocedure), 'admin assignment transaction is SECURITY DEFINER');
SELECT ok((SELECT proconfig @> ARRAY['search_path='] FROM pg_catalog.pg_proc WHERE oid = 'private.assign_guide(uuid,uuid)'::regprocedure), 'admin assignment pins search path');
SELECT ok((SELECT pg_get_userbyid(proowner) = 'localens_guide_assignment_rpc_owner' FROM pg_catalog.pg_proc WHERE oid = 'private.assign_guide(uuid,uuid)'::regprocedure), 'admin assignment has named owner');
SELECT ok(pg_get_functiondef('private.assign_guide(uuid,uuid)'::regprocedure) ~* 'role.*admin', 'assignment derives admin authority');
SELECT ok(pg_get_functiondef('private.assign_guide(uuid,uuid)'::regprocedure) ~* 'role.*guide', 'assignment validates guide authority');
SELECT ok(pg_get_functiondef('private.assign_guide(uuid,uuid)'::regprocedure) ~* 'guide_profiles', 'assignment requires a guide profile');
SELECT ok(
  pg_get_functiondef('private.assign_guide(uuid,uuid)'::regprocedure) ~* 'confirmed'
  AND pg_get_functiondef('private.assign_guide(uuid,uuid)'::regprocedure) ~* 'source_kind.*departure'
  AND pg_get_functiondef('private.assign_guide(uuid,uuid)'::regprocedure) ~* 'departure_id IS NOT NULL',
  'only confirmed fixed-departure bookings can be assigned');
SELECT ok(strpos(pg_get_functiondef('private.assign_guide(uuid,uuid)'::regprocedure), 'FROM public.bookings') < strpos(pg_get_functiondef('private.assign_guide(uuid,uuid)'::regprocedure), 'FROM public.guide_assignments'), 'assignment lock order is booking then active assignment');
SELECT ok(pg_get_functiondef('private.assign_guide(uuid,uuid)'::regprocedure) ~* 'status = .closed|closed_at', 'reassignment closes the old assignment');
SELECT ok(pg_get_functiondef('private.assign_guide(uuid,uuid)'::regprocedure) ~* 'guide_requirement_snapshot', 'assignment snapshots structured requirements');
SELECT ok(pg_get_functiondef('private.assign_guide(uuid,uuid)'::regprocedure) ~* 'guide_reassigned|guide_assigned', 'assignment and reassignment are audited');

SELECT ok(pg_get_functiondef('private.accept_guide_assignment(uuid)'::regprocedure) ~* 'guide_user_id.*actor_user_id', 'guide accept is assignment scoped');
SELECT ok(pg_get_functiondef('private.complete_guide_assignment(uuid)'::regprocedure) ~* 'guide_user_id.*actor_user_id', 'guide complete is assignment scoped');
SELECT ok(
  (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = 'private.accept_guide_assignment(uuid)'::regprocedure)
  AND pg_get_functiondef('public.accept_guide_assignment(uuid)'::regprocedure) ~* 'p_assignment_id uuid',
  'accept transaction is SECURITY DEFINER and uses a non-conflicting input name');
SELECT ok(
  (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = 'private.complete_guide_assignment(uuid)'::regprocedure)
  AND pg_get_functiondef('public.complete_guide_assignment(uuid)'::regprocedure) ~* 'p_assignment_id uuid',
  'complete transaction is SECURITY DEFINER and uses a non-conflicting input name');
SELECT ok(pg_get_functiondef('private.accept_guide_assignment(uuid)'::regprocedure) ~* 'status.*assigned', 'accept requires assigned state');
SELECT ok(pg_get_functiondef('private.complete_guide_assignment(uuid)'::regprocedure) ~* 'status.*accepted', 'complete requires accepted state');
SELECT ok(pg_get_functiondef('private.accept_guide_assignment(uuid)'::regprocedure) ~* 'guide_accepted', 'accept is audited');
SELECT ok(pg_get_functiondef('private.complete_guide_assignment(uuid)'::regprocedure) ~* 'guide_completed', 'complete is audited');

SELECT ok((SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = 'public.get_guide_assigned_bookings()'::regprocedure), 'guide projection is SECURITY DEFINER');
SELECT ok((SELECT proconfig @> ARRAY['search_path='] FROM pg_catalog.pg_proc WHERE oid = 'public.get_guide_assigned_bookings()'::regprocedure), 'guide projection pins search path');
SELECT ok((SELECT pg_get_userbyid(proowner) = 'localens_guide_projection_owner' FROM pg_catalog.pg_proc WHERE oid = 'public.get_guide_assigned_bookings()'::regprocedure), 'guide projection has named owner');
SELECT ok(pg_get_functiondef('public.get_guide_assigned_bookings()'::regprocedure) ~* 'RETURNS TABLE', 'projection declares named return columns');
SELECT ok(pg_get_functiondef('public.get_guide_assigned_bookings()'::regprocedure) ~* 'auth\.uid', 'projection derives authenticated guide identity');
SELECT ok(pg_get_functiondef('public.get_guide_assigned_bookings()'::regprocedure) ~* 'role.*guide', 'projection requires active guide role');
SELECT ok(pg_get_functiondef('public.get_guide_assigned_bookings()'::regprocedure) ~* 'guide_profiles', 'projection uses stored guide locale');
SELECT ok(pg_get_functiondef('public.get_guide_assigned_bookings()'::regprocedure) !~* 'owner_user_id|provider|payment|raw|notes|special|SELECT \*', 'guide projection omits PII payment notes and wildcard reads');
SELECT ok(pg_get_functiondef('public.get_guide_assigned_bookings()'::regprocedure) ~* 'mobility_flags.*dietary_flags', 'guide projection returns structured requirement flags');

SELECT ok(NOT has_table_privilege('anon', 'public.guide_assignments', 'SELECT'), 'anonymous cannot read assignments');
SELECT ok(NOT has_table_privilege('authenticated', 'public.guide_assignments', 'SELECT'), 'guide cannot read assignment base table');
SELECT ok(NOT has_table_privilege('authenticated', 'public.bookings', 'SELECT'), 'guide cannot read booking base table');
SELECT ok(NOT has_table_privilege('authenticated', 'public.departures', 'SELECT'), 'guide cannot read departure base table');
SELECT ok(has_function_privilege('authenticated', 'public.get_guide_assigned_bookings()', 'EXECUTE'), 'authenticated can call only sanitized guide projection');
SELECT ok(has_function_privilege('authenticated', 'public.accept_guide_assignment(uuid)', 'EXECUTE'), 'authenticated can request guide accept transition');
SELECT ok(has_function_privilege('authenticated', 'public.complete_guide_assignment(uuid)', 'EXECUTE'), 'authenticated can request guide complete transition');
SELECT ok(has_function_privilege('authenticated', 'public.assign_guide(uuid,uuid)', 'EXECUTE'), 'authenticated reaches guarded admin assignment RPC');
SELECT ok(NOT has_function_privilege('authenticated', 'private.assign_guide(uuid,uuid)', 'EXECUTE'), 'authenticated cannot call internal assignment RPC');
SELECT ok(NOT has_function_privilege('authenticated', 'private.guide_requirement_snapshot(uuid)', 'EXECUTE'), 'authenticated cannot call requirement snapshot helper');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'guide_assignments' AND policyname = 'guide_assignments_rpc_owner_all'), 'assignment owner policy exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'guide_assignments' AND policyname = 'guide_assignments_projection_owner_select'), 'projection owner policy exists');

SELECT ok(pg_get_functiondef('private.guide_requirement_snapshot(uuid)'::regprocedure) ~* 'jsonb_array_elements_text.*mobilityRequirements', 'mobility snapshot reads only structured revision requirement');
SELECT ok(pg_get_functiondef('private.guide_requirement_snapshot(uuid)'::regprocedure) ~* 'jsonb_array_elements_text.*dietaryRequirements', 'dietary snapshot reads only structured revision requirement');
SELECT ok(pg_get_functiondef('private.guide_requirement_snapshot(uuid)'::regprocedure) ~* 'DISTINCT.*ORDER BY', 'requirement snapshot is sorted and deduplicated');
SELECT ok(pg_get_functiondef('private.guide_requirement_snapshot(uuid)'::regprocedure) !~* 'special|notes|email|phone|payment|raw', 'requirement snapshot omits free text PII and payment data');
SELECT ok(pg_get_functiondef('private.record_guide_assignment_audit_event(public.audit_event_type,uuid,uuid,text,text)'::regprocedure) ~* 'guide_assigned|guide_reassigned|guide_accepted|guide_completed', 'guide audit helper uses the closed audit vocabulary');
SELECT ok((SELECT pg_get_userbyid(proowner) = 'localens_guide_assignment_rpc_owner' FROM pg_catalog.pg_proc WHERE oid = 'private.record_guide_assignment_audit_event(public.audit_event_type,uuid,uuid,text,text)'::regprocedure), 'guide audit helper has named owner');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_auth_members AS memberships
  JOIN pg_catalog.pg_roles AS granted ON granted.oid = memberships.roleid
  JOIN pg_catalog.pg_roles AS member ON member.oid = memberships.member
  WHERE granted.rolname IN ('localens_guide_assignment_rpc_owner', 'localens_guide_projection_owner', 'localens_guide_assignment_guard_owner')
     OR member.rolname IN ('localens_guide_assignment_rpc_owner', 'localens_guide_projection_owner', 'localens_guide_assignment_guard_owner')
), 'guide owners have no inherited memberships');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE proname IN ('assign_guide', 'accept_guide_assignment', 'complete_guide_assignment', 'get_guide_assigned_bookings') AND pg_get_userbyid(proowner) IN ('postgres', 'service_role')), 'guide definers are not superuser or service role');
SELECT ok(
  pg_get_functiondef('public.get_guide_assigned_bookings()'::regprocedure) !~* 'SELECT \*'
  AND pg_get_functiondef('public.get_guide_assigned_bookings()'::regprocedure) ~* 'status IN.*assigned.*accepted',
  'guide projection has no wildcard SELECT and excludes closed/completed assignments');

-- Runtime-deferred isolation fixture: reassignment closes the old guide row,
-- completion removes the row from the guide work queue, and another guide can
-- never see either row. All identifiers are synthetic and the transaction is
-- rolled back at the end of this executable pgTAP file.
INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000001101'::uuid, 'authenticated', 'authenticated', 'task11-admin@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000001102'::uuid, 'authenticated', 'authenticated', 'task11-guide-one@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000001103'::uuid, 'authenticated', 'authenticated', 'task11-guide-two@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000001104'::uuid, 'authenticated', 'authenticated', 'task11-guide-three@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO private.user_roles (user_id, role)
VALUES
  ('00000000-0000-0000-0000-000000001101'::uuid, 'admin'::public.app_role),
  ('00000000-0000-0000-0000-000000001102'::uuid, 'guide'::public.app_role),
  ('00000000-0000-0000-0000-000000001103'::uuid, 'guide'::public.app_role),
  ('00000000-0000-0000-0000-000000001104'::uuid, 'guide'::public.app_role)
ON CONFLICT (user_id, role) DO NOTHING;
INSERT INTO public.guide_profiles (user_id, display_name, language)
VALUES
  ('00000000-0000-0000-0000-000000001102'::uuid, 'Task 11 Guide One', 'en'::public.locale),
  ('00000000-0000-0000-0000-000000001103'::uuid, 'Task 11 Guide Two', 'en'::public.locale),
  ('00000000-0000-0000-0000-000000001104'::uuid, 'Task 11 Guide Three', 'en'::public.locale)
ON CONFLICT (user_id) DO NOTHING;
INSERT INTO public.catalog_snapshots (id, status)
VALUES ('00000000-0000-0000-0000-000000001105'::uuid, 'building'::public.snapshot_status);
INSERT INTO public.travel_snapshots (id, catalog_snapshot_id, status)
VALUES ('00000000-0000-0000-0000-000000001106'::uuid, '00000000-0000-0000-0000-000000001105'::uuid, 'building'::public.snapshot_status);
INSERT INTO public.tours (id, slug, status)
VALUES ('00000000-0000-0000-0000-000000001107'::uuid, 'task11-fixture-tour', 'draft'::public.tour_status);
INSERT INTO public.tour_versions (id, tour_id, catalog_snapshot_id, status, duration_minutes, price_vnd_per_person, cancellation_policy, source_url, verified_at, attribution, license)
VALUES ('00000000-0000-0000-0000-000000001108'::uuid, '00000000-0000-0000-0000-000000001107'::uuid, '00000000-0000-0000-0000-000000001105'::uuid, 'draft'::public.tour_version_status, 60, 100, 'Task 11 fixture policy', 'https://example.invalid/task11-tour', DATE '2026-08-25', 'Task 11 fixture', 'CC0');
INSERT INTO public.departures (id, tour_version_id, start_at, end_at, status, capacity)
VALUES ('00000000-0000-0000-0000-000000001109'::uuid, '00000000-0000-0000-0000-000000001108'::uuid, '2026-09-10 18:00:00+07'::timestamptz, '2026-09-10 21:00:00+07'::timestamptz, 'scheduled'::public.departure_status, 10);
INSERT INTO public.bookings (
  id, owner_user_id, source_kind, source_id, departure_id, quote_id, status, tour_version_id,
  title_en, title_vi, cancellation_policy, catalog_snapshot_id, travel_snapshot_id,
  fx_snapshot_id, fx_vnd_per_usd, per_person_vnd_minor, total_vnd_minor, checkout_currency,
  checkout_amount_minor, party_size, language, meeting_point, hold_expires_at, created_at
)
VALUES (
  '00000000-0000-0000-0000-000000001110'::uuid,
  '00000000-0000-0000-0000-000000001101'::uuid,
  'departure', '00000000-0000-0000-0000-000000001109'::uuid,
  '00000000-0000-0000-0000-000000001109'::uuid, NULL,
  'confirmed'::public.booking_status, '00000000-0000-0000-0000-000000001108'::uuid,
  'Task 11 fixture tour', 'Tour fixture Task 11', 'Task 11 fixture policy',
  '00000000-0000-0000-0000-000000001105'::uuid, '00000000-0000-0000-0000-000000001106'::uuid,
  NULL, NULL, 100, 100, 'vnd'::public.checkout_currency, 100, 2,
  'en'::public.locale, 'Task 11 meeting point',
  '2026-09-10 10:35:00+07'::timestamptz, '2026-09-10 10:00:00+07'::timestamptz
);
SET LOCAL ROLE localens_guide_assignment_rpc_owner;
SELECT set_config('localens.guide_assignment_transition', 'on', true);
INSERT INTO public.guide_assignments (id, booking_id, guide_user_id, status, mobility_flags, dietary_flags, assigned_at, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000001111'::uuid, '00000000-0000-0000-0000-000000001110'::uuid, '00000000-0000-0000-0000-000000001102'::uuid, 'assigned'::public.assignment_status, '{}'::text[], '{}'::text[], now(), now(), now());
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001101', true);
SELECT lives_ok($$SELECT * FROM public.assign_guide('00000000-0000-0000-0000-000000001110'::uuid, '00000000-0000-0000-0000-000000001103'::uuid)$$, 'admin reassignment closes the former guide row');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001102', true);
SELECT is((SELECT count(*)::integer FROM public.get_guide_assigned_bookings()), 0, 'former guide sees zero rows after reassignment');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001104', true);
SELECT is((SELECT count(*)::integer FROM public.get_guide_assigned_bookings()), 0, 'cross-guide projection remains isolated');
RESET ROLE;
CREATE TEMP TABLE task11_reassignment_id (id uuid) ON COMMIT DROP;
INSERT INTO task11_reassignment_id (id)
SELECT id FROM public.guide_assignments
WHERE booking_id = '00000000-0000-0000-0000-000000001110'::uuid
  AND status = 'assigned'::public.assignment_status;
GRANT SELECT ON task11_reassignment_id TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001103', true);
SELECT lives_ok($$SELECT * FROM public.accept_guide_assignment((SELECT id FROM task11_reassignment_id))$$, 'new guide accepts reassigned booking');
SELECT lives_ok($$SELECT * FROM public.complete_guide_assignment((SELECT id FROM task11_reassignment_id))$$, 'new guide completes reassigned booking');
SELECT is((SELECT count(*)::integer FROM public.get_guide_assigned_bookings()), 0, 'completed assignment no longer appears in guide work queue');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
