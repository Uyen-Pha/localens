BEGIN;

SELECT no_plan();

DELETE FROM auth.users
WHERE id IN (
  '00000000-0000-0000-0000-000000002601'::uuid,
  '00000000-0000-0000-0000-000000002602'::uuid,
  '00000000-0000-0000-0000-000000002603'::uuid,
  '00000000-0000-0000-0000-000000002604'::uuid
);

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000002601'::uuid, 'authenticated', 'authenticated', 'cancel-a@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000002602'::uuid, 'authenticated', 'authenticated', 'cancel-b@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000002603'::uuid, 'authenticated', 'authenticated', 'cancel-guide@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000002604'::uuid, 'authenticated', 'authenticated', 'cancel-admin@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now());

INSERT INTO private.user_roles (user_id, role)
VALUES
  ('00000000-0000-0000-0000-000000002603'::uuid, 'guide'::public.app_role),
  ('00000000-0000-0000-0000-000000002604'::uuid, 'admin'::public.app_role);

UPDATE public.profiles
SET display_name = CASE id
  WHEN '00000000-0000-0000-0000-000000002601'::uuid THEN 'Cancellation customer A'
  WHEN '00000000-0000-0000-0000-000000002602'::uuid THEN 'Cancellation customer B'
  WHEN '00000000-0000-0000-0000-000000002603'::uuid THEN 'Cancellation guide'
  ELSE 'Cancellation admin'
END
WHERE id IN (
  '00000000-0000-0000-0000-000000002601'::uuid,
  '00000000-0000-0000-0000-000000002602'::uuid,
  '00000000-0000-0000-0000-000000002603'::uuid,
  '00000000-0000-0000-0000-000000002604'::uuid
);

INSERT INTO public.catalog_snapshots (id, status)
VALUES ('00000000-0000-0000-0000-000000002611'::uuid, 'building');
INSERT INTO public.catalog_snapshot_areas (snapshot_id, area_id, slug)
VALUES ('00000000-0000-0000-0000-000000002611'::uuid, '00000000-0000-0000-0000-000000002612'::uuid, 'runtime-cancellation-area');
INSERT INTO public.catalog_snapshot_places (
  snapshot_id, place_id, area_id, slug, price_vnd_per_person,
  visit_duration_minutes, source_url, verified_at, attribution
)
VALUES (
  '00000000-0000-0000-0000-000000002611'::uuid,
  '00000000-0000-0000-0000-000000002613'::uuid,
  '00000000-0000-0000-0000-000000002612'::uuid,
  'runtime-cancellation-place', 0, 60,
  'https://example.invalid/runtime-cancellation-place', CURRENT_DATE,
  'Runtime cancellation pgTAP fixture'
);
INSERT INTO public.catalog_snapshot_place_translations (
  snapshot_id, place_id, locale, title, summary, description
)
VALUES
  ('00000000-0000-0000-0000-000000002611'::uuid, '00000000-0000-0000-0000-000000002613'::uuid, 'en', 'Runtime cancellation place', 'Fixture', 'Fixture place'),
  ('00000000-0000-0000-0000-000000002611'::uuid, '00000000-0000-0000-0000-000000002613'::uuid, 'vi', 'Dia diem huy tour runtime', 'Du lieu mau', 'Dia diem du lieu mau');
INSERT INTO public.travel_snapshots (id, catalog_snapshot_id, status)
VALUES ('00000000-0000-0000-0000-000000002614'::uuid, '00000000-0000-0000-0000-000000002611'::uuid, 'building');

SET LOCAL ROLE localens_tour_rpc_owner;
INSERT INTO public.tours (id, slug, status)
VALUES ('00000000-0000-0000-0000-000000002615'::uuid, 'runtime-cancellation', 'draft');
INSERT INTO public.tour_translations (tour_id, locale, title, summary, meeting_point)
VALUES
  ('00000000-0000-0000-0000-000000002615'::uuid, 'en', 'Runtime cancellation', 'Fixture', 'Runtime gate'),
  ('00000000-0000-0000-0000-000000002615'::uuid, 'vi', 'Huy tour runtime', 'Du lieu mau', 'Cong runtime');
INSERT INTO public.tour_versions (
  id, tour_id, catalog_snapshot_id, status, duration_minutes,
  price_vnd_per_person, inclusions, exclusions, cancellation_policy,
  source_url, verified_at, attribution, license
)
VALUES (
  '00000000-0000-0000-0000-000000002616'::uuid,
  '00000000-0000-0000-0000-000000002615'::uuid,
  '00000000-0000-0000-0000-000000002611'::uuid,
  'draft', 120, 125000, ARRAY['guide'], ARRAY['transfer'],
  'Cancellation is decided by an administrator before payment.',
  'https://example.invalid/runtime-cancellation', CURRENT_DATE,
  'Runtime cancellation pgTAP fixture', 'CC0'
);
INSERT INTO public.tour_version_translations (tour_version_id, locale, title, summary, meeting_point)
VALUES
  ('00000000-0000-0000-0000-000000002616'::uuid, 'en', 'Runtime cancellation', 'Fixture', 'Runtime gate'),
  ('00000000-0000-0000-0000-000000002616'::uuid, 'vi', 'Huy tour runtime', 'Du lieu mau', 'Cong runtime');
INSERT INTO public.tour_version_stops (tour_version_id, catalog_snapshot_id, position, place_id)
VALUES ('00000000-0000-0000-0000-000000002616'::uuid, '00000000-0000-0000-0000-000000002611'::uuid, 1, '00000000-0000-0000-0000-000000002613'::uuid);
RESET ROLE;

UPDATE public.catalog_snapshots SET status = 'published', published_at = pg_catalog.clock_timestamp()
WHERE id = '00000000-0000-0000-0000-000000002611'::uuid;
UPDATE public.travel_snapshots SET status = 'published', published_at = pg_catalog.clock_timestamp()
WHERE id = '00000000-0000-0000-0000-000000002614'::uuid;
SET LOCAL ROLE localens_tour_rpc_owner;
UPDATE public.tour_versions SET status = 'published', published_at = pg_catalog.clock_timestamp()
WHERE id = '00000000-0000-0000-0000-000000002616'::uuid;
UPDATE public.tours SET status = 'published'
WHERE id = '00000000-0000-0000-0000-000000002615'::uuid;
INSERT INTO public.departures (id, tour_version_id, start_at, end_at, status, capacity)
VALUES (
  '00000000-0000-0000-0000-000000002617'::uuid,
  '00000000-0000-0000-0000-000000002616'::uuid,
  pg_catalog.clock_timestamp() + interval '7 days',
  pg_catalog.clock_timestamp() + interval '7 days 2 hours',
  'scheduled', 20
);
RESET ROLE;

SELECT ok(to_regclass('private.fixed_tour_cancellation_requests') IS NOT NULL, 'private cancellation request table exists');
SELECT ok(to_regclass('public.customer_fixed_tour_cancellation_requests_v') IS NOT NULL, 'customer cancellation projection exists');
SELECT ok(to_regclass('public.admin_fixed_tour_cancellation_queue_v') IS NOT NULL, 'admin cancellation queue exists');
SELECT has_function('public', 'request_fixed_tour_cancellation', ARRAY['uuid', 'text', 'text']);
SELECT has_function('public', 'decide_fixed_tour_cancellation', ARRAY['uuid', 'text', 'text', 'text']);
SELECT ok(
  (SELECT relrowsecurity AND relforcerowsecurity
   FROM pg_catalog.pg_class
   WHERE oid = 'private.fixed_tour_cancellation_requests'::regclass),
  'cancellation requests enforce RLS'
);
SELECT ok(
  NOT has_table_privilege('anon', 'private.fixed_tour_cancellation_requests', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'private.fixed_tour_cancellation_requests', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'private.fixed_tour_cancellation_requests', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'private.fixed_tour_cancellation_requests', 'UPDATE'),
  'browser roles have no cancellation base-table access'
);
SELECT is(
  (SELECT string_agg(column_name::text, ',' ORDER BY ordinal_position)
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'customer_fixed_tour_cancellation_requests_v'),
  'request_id,booking_id,status,reason,requested_at,decision_note,decided_at',
  'customer projection exposes exactly seven sanitized columns'
);
SELECT is(
  (SELECT string_agg(column_name::text, ',' ORDER BY ordinal_position)
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'admin_fixed_tour_cancellation_queue_v'),
  'request_id,booking_id,booking_status,customer_display_name,title_en,title_vi,status,reason,requested_at,decision_note,decided_at',
  'admin projection exposes exactly eleven sanitized columns'
);
SELECT ok(
  (SELECT bool_and(NOT rolcanlogin AND NOT rolinherit AND NOT rolbypassrls AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole)
   FROM pg_catalog.pg_roles
   WHERE rolname IN (
     'localens_cancellation_customer_rpc_owner',
     'localens_cancellation_admin_rpc_owner',
     'localens_cancellation_customer_projection_owner',
     'localens_cancellation_admin_projection_owner',
     'localens_cancellation_guard_owner'
   )),
  'all cancellation owners are least-privilege non-login roles'
);
SELECT ok(
  (SELECT bool_and(prosecdef AND proconfig @> ARRAY['search_path=""'] AND proconfig @> ARRAY['statement_timeout=5s'])
   FROM pg_catalog.pg_proc
   WHERE oid IN (
     'public.request_fixed_tour_cancellation(uuid,text,text)'::regprocedure,
     'public.decide_fixed_tour_cancellation(uuid,text,text,text)'::regprocedure
   )),
  'both cancellation RPCs are bounded sanitized definers'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002601', 'role', 'authenticated')::text, true);
SELECT ok((SELECT booking_id IS NOT NULL FROM public.begin_fixed_tour_booking('00000000-0000-0000-0000-000000002617', 1, 'en', 'cancel-a-approve')), 'customer A creates approval booking');
SELECT ok((SELECT booking_id IS NOT NULL FROM public.begin_fixed_tour_booking('00000000-0000-0000-0000-000000002617', 1, 'en', 'cancel-a-reject')), 'customer A creates rejection booking');
SELECT ok((SELECT booking_id IS NOT NULL FROM public.begin_fixed_tour_booking('00000000-0000-0000-0000-000000002617', 1, 'en', 'cancel-a-conflict')), 'customer A creates conflict booking');
SELECT ok((SELECT booking_id IS NOT NULL FROM public.begin_fixed_tour_booking('00000000-0000-0000-0000-000000002617', 1, 'en', 'cancel-a-paid')), 'customer A creates paid booking');
SELECT ok((SELECT booking_id IS NOT NULL FROM public.begin_fixed_tour_booking('00000000-0000-0000-0000-000000002617', 1, 'en', 'cancel-a-payment-wins')), 'customer A creates payment-wins booking');
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002602', 'role', 'authenticated')::text, true);
SELECT ok((SELECT booking_id IS NOT NULL FROM public.begin_fixed_tour_booking('00000000-0000-0000-0000-000000002617', 1, 'vi', 'cancel-b-own')), 'customer B creates own booking');
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002603', 'role', 'authenticated')::text, true);
SELECT ok((SELECT booking_id IS NOT NULL FROM public.begin_fixed_tour_booking('00000000-0000-0000-0000-000000002617', 1, 'en', 'cancel-guide-own')), 'additive guide fixture creates booking through legacy checkout');
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002604', 'role', 'authenticated')::text, true);
SELECT ok((SELECT booking_id IS NOT NULL FROM public.begin_fixed_tour_booking('00000000-0000-0000-0000-000000002617', 1, 'en', 'cancel-admin-own')), 'additive admin fixture creates booking through legacy checkout');
RESET ROLE;

CREATE TEMP TABLE cancellation_fixture_bookings AS
SELECT idempotency_key AS label, booking_id, checkout_attempt_id
FROM private.checkout_idempotency
WHERE idempotency_key LIKE 'cancel-%';
GRANT SELECT ON cancellation_fixture_bookings TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002603', 'role', 'authenticated')::text, true);
SELECT throws_ok(
  format('SELECT * FROM public.request_fixed_tour_cancellation(%L::uuid, %L, %L)',
    (SELECT booking_id FROM cancellation_fixture_bookings WHERE label = 'cancel-guide-own'), 'Guide must not cancel', 'guide-request-key'),
  '42501', 'cancellation customer role required',
  'guide with additive customer role is denied customer cancellation action'
);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002604', 'role', 'authenticated')::text, true);
SELECT throws_ok(
  format('SELECT * FROM public.request_fixed_tour_cancellation(%L::uuid, %L, %L)',
    (SELECT booking_id FROM cancellation_fixture_bookings WHERE label = 'cancel-admin-own'), 'Admin must not use customer action', 'admin-request-key'),
  '42501', 'cancellation customer role required',
  'admin with additive customer role is denied customer cancellation action'
);

SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002601', 'role', 'authenticated')::text, true);
SELECT ok(
  (SELECT status = 'pending' AND state = 'created'
   FROM public.request_fixed_tour_cancellation(
     (SELECT booking_id FROM cancellation_fixture_bookings WHERE label = 'cancel-a-approve'),
     'Customer plans changed', 'cancel-request-approve')),
  'customer creates one pending cancellation request'
);
RESET ROLE;
SELECT results_eq(
  $$SELECT bookings.status::text, holds.status::text
    FROM cancellation_fixture_bookings fixtures
    JOIN public.bookings bookings ON bookings.id = fixtures.booking_id
    JOIN private.capacity_holds holds ON holds.booking_id = bookings.id
    WHERE fixtures.label = 'cancel-a-approve'$$,
  $$VALUES ('pending_payment'::text, 'active'::text)$$,
  'request creation leaves booking and hold unchanged'
);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002601', 'role', 'authenticated')::text, true);
SELECT is(
  (SELECT state FROM public.request_fixed_tour_cancellation(
    (SELECT booking_id FROM cancellation_fixture_bookings WHERE label = 'cancel-a-approve'),
    'Customer plans changed', 'cancel-request-approve')),
  'replayed', 'exact customer request replays'
);
SELECT throws_ok(
  format('SELECT * FROM public.request_fixed_tour_cancellation(%L::uuid, %L, %L)',
    (SELECT booking_id FROM cancellation_fixture_bookings WHERE label = 'cancel-a-approve'),
    'Changed reason', 'cancel-request-approve'),
  'P0001', 'IDEMPOTENCY_CONFLICT', 'changed reason under the same key conflicts'
);
SELECT throws_ok(
  format('SELECT * FROM public.request_fixed_tour_cancellation(%L::uuid, %L, %L)',
    (SELECT booking_id FROM cancellation_fixture_bookings WHERE label = 'cancel-a-approve'),
    'Customer plans changed', 'cancel-request-other-key'),
  'P0001', 'IDEMPOTENCY_CONFLICT', 'same booking with a different request key conflicts'
);
SELECT throws_ok(
  format('SELECT * FROM public.request_fixed_tour_cancellation(%L::uuid, %L, %L)',
    (SELECT booking_id FROM cancellation_fixture_bookings WHERE label = 'cancel-a-conflict'),
    'Customer plans changed', 'cancel-request-approve'),
  'P0001', 'IDEMPOTENCY_CONFLICT', 'same customer request key reused for another booking conflicts'
);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002602', 'role', 'authenticated')::text, true);
SELECT throws_ok(
  format('SELECT * FROM public.request_fixed_tour_cancellation(%L::uuid, %L, %L)',
    (SELECT booking_id FROM cancellation_fixture_bookings WHERE label = 'cancel-a-reject'),
    'Cross owner attempt', 'cross-owner-request'),
  '42501', 'cancellation request unavailable', 'cross-owner customer request is denied'
);
SELECT results_eq(
  $$SELECT count(*)::integer FROM public.customer_fixed_tour_cancellation_requests_v$$,
  $$VALUES (0)$$, 'customer B cannot see customer A cancellation request'
);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002603', 'role', 'authenticated')::text, true);
SELECT results_eq(
  $$SELECT count(*)::integer FROM public.admin_fixed_tour_cancellation_queue_v$$,
  $$VALUES (0)$$, 'guide cannot read the administrator cancellation queue'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002601', 'role', 'authenticated')::text, true);
SELECT ok(
  (SELECT status = 'pending' FROM public.request_fixed_tour_cancellation(
    (SELECT booking_id FROM cancellation_fixture_bookings WHERE label = 'cancel-a-reject'),
    'Reject this request', 'cancel-request-reject')),
  'customer creates request for rejection path'
);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002604', 'role', 'authenticated')::text, true);
SELECT is((SELECT count(*)::integer FROM public.admin_fixed_tour_cancellation_queue_v), 2, 'admin sees sanitized cancellation queue');
SELECT ok(
  (SELECT request_status = 'rejected' AND booking_status = 'pending_payment' AND state = 'rejected'
   FROM public.decide_fixed_tour_cancellation(
     (SELECT request_id FROM public.admin_fixed_tour_cancellation_queue_v
      WHERE booking_id = (SELECT booking_id FROM cancellation_fixture_bookings WHERE label = 'cancel-a-reject')),
     'rejected', 'Insufficient reason', 'cancel-decision-reject')),
  'admin rejects one cancellation request'
);
RESET ROLE;
SELECT results_eq(
  $$SELECT bookings.status::text, holds.status::text, requests.status
    FROM cancellation_fixture_bookings fixtures
    JOIN public.bookings bookings ON bookings.id = fixtures.booking_id
    JOIN private.capacity_holds holds ON holds.booking_id = bookings.id
    JOIN private.fixed_tour_cancellation_requests requests ON requests.booking_id = bookings.id
    WHERE fixtures.label = 'cancel-a-reject'$$,
  $$VALUES ('pending_payment'::text, 'active'::text, 'rejected'::text)$$,
  'rejection leaves booking and hold unchanged'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002601', 'role', 'authenticated')::text, true);
SELECT ok(
  (SELECT status = 'pending' AND state = 'replayed'
   FROM public.request_fixed_tour_cancellation(
     (SELECT booking_id FROM cancellation_fixture_bookings WHERE label = 'cancel-a-reject'),
     'Reject this request', 'cancel-request-reject')),
  'customer request replay keeps the original pending response after rejection'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002604', 'role', 'authenticated')::text, true);
SELECT ok(
  (SELECT request_status = 'rejected' AND booking_status = 'pending_payment' AND state = 'replayed'
   FROM public.decide_fixed_tour_cancellation(
    (SELECT request_id FROM public.admin_fixed_tour_cancellation_queue_v
     WHERE booking_id = (SELECT booking_id FROM cancellation_fixture_bookings WHERE label = 'cancel-a-reject')),
    'rejected', 'Insufficient reason', 'cancel-decision-reject')),
  'exact administrator decision replays the decision-time booking snapshot'
);
SELECT throws_ok(
  format('SELECT * FROM public.decide_fixed_tour_cancellation(%L::uuid, %L, %L, %L)',
    (SELECT request_id FROM public.admin_fixed_tour_cancellation_queue_v
     WHERE booking_id = (SELECT booking_id FROM cancellation_fixture_bookings WHERE label = 'cancel-a-reject')),
    'approved', 'Changed decision', 'cancel-decision-reject'),
  'P0001', 'IDEMPOTENCY_CONFLICT', 'changed decision under same administrator key conflicts'
);
SELECT ok(
  (SELECT request_status = 'approved' AND booking_status = 'cancelled' AND state = 'approved'
   FROM public.decide_fixed_tour_cancellation(
     (SELECT request_id FROM public.admin_fixed_tour_cancellation_queue_v
      WHERE booking_id = (SELECT booking_id FROM cancellation_fixture_bookings WHERE label = 'cancel-a-approve')),
     'approved', 'Approved before payment', 'cancel-decision-approve')),
  'admin approves one cancellation request'
);
RESET ROLE;
SELECT results_eq(
  $$SELECT bookings.status::text, holds.status::text, attempts.status, requests.status
    FROM cancellation_fixture_bookings fixtures
    JOIN public.bookings bookings ON bookings.id = fixtures.booking_id
    JOIN private.capacity_holds holds ON holds.booking_id = bookings.id
    JOIN private.checkout_attempts attempts ON attempts.booking_id = bookings.id
    JOIN private.fixed_tour_cancellation_requests requests ON requests.booking_id = bookings.id
    WHERE fixtures.label = 'cancel-a-approve'$$,
  $$VALUES ('cancelled'::text, 'released'::text, 'compensated'::text, 'approved'::text)$$,
  'approval atomically cancels booking, releases hold, and compensates attempt'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002601', 'role', 'authenticated')::text, true);
SELECT ok(
  (SELECT status = 'pending' AND state = 'replayed'
   FROM public.request_fixed_tour_cancellation(
     (SELECT booking_id FROM cancellation_fixture_bookings WHERE label = 'cancel-a-approve'),
     'Customer plans changed', 'cancel-request-approve')),
  'customer request replay keeps the original pending response after approval'
);
RESET ROLE;

SELECT throws_ok(
  $sql$INSERT INTO public.payments (
    booking_id, attempt_id, owner_user_id, provider_session_id,
    provider_payment_intent_id, provider_account_id, provider_endpoint_id,
    mode, amount_minor, currency, status
  )
  SELECT bookings.id, attempts.id, bookings.owner_user_id,
    'cs_runtime_cancel_after_approval', 'pi_runtime_cancel_after_approval',
    'acct_localens_test', 'we_localens_test', 'payment',
    bookings.checkout_amount_minor, bookings.checkout_currency, 'pending'
  FROM cancellation_fixture_bookings fixtures
  JOIN public.bookings bookings ON bookings.id = fixtures.booking_id
  JOIN private.checkout_attempts attempts ON attempts.booking_id = bookings.id
  WHERE fixtures.label = 'cancel-a-approve'$sql$,
  'P0001', 'CANCELLATION_APPROVED',
  'real payment cannot be inserted after approved cancellation'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002601', 'role', 'authenticated')::text, true);
SELECT ok((SELECT payment_status = 'paid' FROM public.complete_simulated_fixed_tour_payment(
  (SELECT booking_id FROM cancellation_fixture_bookings WHERE label = 'cancel-a-paid'), 'cancel-paid-simulation')), 'fixture terminalizes payment before request attempt');
SELECT throws_ok(
  format('SELECT * FROM public.request_fixed_tour_cancellation(%L::uuid, %L, %L)',
    (SELECT booking_id FROM cancellation_fixture_bookings WHERE label = 'cancel-a-paid'),
    'Too late', 'cancel-request-after-payment'),
  'P0001', 'cancellation request unavailable', 'non-pending booking cannot request cancellation'
);

SELECT ok(
  (SELECT status = 'pending' FROM public.request_fixed_tour_cancellation(
    (SELECT booking_id FROM cancellation_fixture_bookings WHERE label = 'cancel-a-payment-wins'),
    'Payment may win', 'cancel-request-payment-wins')),
  'customer creates a request before payment wins'
);
SELECT ok(
  (SELECT payment_status = 'paid' FROM public.complete_simulated_fixed_tour_payment(
    (SELECT booking_id FROM cancellation_fixture_bookings WHERE label = 'cancel-a-payment-wins'),
    'cancel-payment-wins-simulation')),
  'payment may terminalize while a cancellation request is pending'
);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002604', 'role', 'authenticated')::text, true);
SELECT ok(
  (SELECT request_status = 'rejected' AND booking_status = 'confirmed' AND state = 'rejected'
   FROM public.decide_fixed_tour_cancellation(
     (SELECT request_id FROM public.admin_fixed_tour_cancellation_queue_v
      WHERE booking_id = (SELECT booking_id FROM cancellation_fixture_bookings WHERE label = 'cancel-a-payment-wins')),
     'rejected', 'Payment completed first', 'cancel-decision-payment-wins')),
  'administrator rejection preserves the confirmed payment-winner state'
);
SELECT ok(
  (SELECT request_status = 'rejected' AND booking_status = 'confirmed' AND state = 'replayed'
   FROM public.decide_fixed_tour_cancellation(
     (SELECT request_id FROM public.admin_fixed_tour_cancellation_queue_v
      WHERE booking_id = (SELECT booking_id FROM cancellation_fixture_bookings WHERE label = 'cancel-a-payment-wins')),
     'rejected', 'Payment completed first', 'cancel-decision-payment-wins')),
  'payment-winner rejection replays the exact decision-time snapshot'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
