BEGIN;

SELECT plan(50);

DELETE FROM auth.users
WHERE id IN (
  '00000000-0000-0000-0000-000000002501'::uuid,
  '00000000-0000-0000-0000-000000002502'::uuid,
  '00000000-0000-0000-0000-000000002503'::uuid,
  '00000000-0000-0000-0000-000000002504'::uuid
);

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000002501'::uuid, 'authenticated', 'authenticated', 'sim-payment-a@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000002502'::uuid, 'authenticated', 'authenticated', 'sim-payment-b@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000002503'::uuid, 'authenticated', 'authenticated', 'sim-payment-guide@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000002504'::uuid, 'authenticated', 'authenticated', 'sim-payment-admin@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now());

DELETE FROM private.user_roles
WHERE user_id IN (
  '00000000-0000-0000-0000-000000002503'::uuid,
  '00000000-0000-0000-0000-000000002504'::uuid
);
INSERT INTO private.user_roles (user_id, role)
VALUES
  ('00000000-0000-0000-0000-000000002503'::uuid, 'guide'::public.app_role),
  ('00000000-0000-0000-0000-000000002504'::uuid, 'admin'::public.app_role);

INSERT INTO public.catalog_snapshots (id, status)
VALUES ('00000000-0000-0000-0000-000000002511'::uuid, 'building');
INSERT INTO public.catalog_snapshot_areas (snapshot_id, area_id, slug)
VALUES ('00000000-0000-0000-0000-000000002511'::uuid, '00000000-0000-0000-0000-000000002512'::uuid, 'runtime-sim-payment-area');
INSERT INTO public.catalog_snapshot_places (
  snapshot_id, place_id, area_id, slug, price_vnd_per_person,
  visit_duration_minutes, source_url, verified_at, attribution
)
VALUES (
  '00000000-0000-0000-0000-000000002511'::uuid,
  '00000000-0000-0000-0000-000000002513'::uuid,
  '00000000-0000-0000-0000-000000002512'::uuid,
  'runtime-sim-payment-place', 0, 60,
  'https://example.invalid/runtime-sim-payment-place', CURRENT_DATE,
  'Runtime simulated-payment pgTAP fixture'
);
INSERT INTO public.catalog_snapshot_place_translations (
  snapshot_id, place_id, locale, title, summary, description
)
VALUES
  ('00000000-0000-0000-0000-000000002511'::uuid, '00000000-0000-0000-0000-000000002513'::uuid, 'en', 'Runtime payment place', 'Fixture', 'Fixture place'),
  ('00000000-0000-0000-0000-000000002511'::uuid, '00000000-0000-0000-0000-000000002513'::uuid, 'vi', 'Dia diem thanh toan runtime', 'Du lieu mau', 'Dia diem du lieu mau');
INSERT INTO public.travel_snapshots (id, catalog_snapshot_id, status)
VALUES ('00000000-0000-0000-0000-000000002514'::uuid, '00000000-0000-0000-0000-000000002511'::uuid, 'building');

SET LOCAL ROLE localens_tour_rpc_owner;
INSERT INTO public.tours (id, slug, status)
VALUES ('00000000-0000-0000-0000-000000002515'::uuid, 'runtime-sim-payment', 'draft');
INSERT INTO public.tour_translations (tour_id, locale, title, summary, meeting_point)
VALUES
  ('00000000-0000-0000-0000-000000002515'::uuid, 'en', 'Runtime simulated payment', 'Fixture', 'Runtime gate'),
  ('00000000-0000-0000-0000-000000002515'::uuid, 'vi', 'Thanh toan mo phong runtime', 'Du lieu mau', 'Cong runtime');
INSERT INTO public.tour_versions (
  id, tour_id, catalog_snapshot_id, status, duration_minutes,
  price_vnd_per_person, inclusions, exclusions, cancellation_policy,
  source_url, verified_at, attribution, license
)
VALUES (
  '00000000-0000-0000-0000-000000002516'::uuid,
  '00000000-0000-0000-0000-000000002515'::uuid,
  '00000000-0000-0000-0000-000000002511'::uuid,
  'draft', 120, 125000, ARRAY['guide'], ARRAY['transfer'],
  'Runtime simulated-payment fixture policy',
  'https://example.invalid/runtime-sim-payment', CURRENT_DATE,
  'Runtime simulated-payment pgTAP fixture', 'CC0'
);
INSERT INTO public.tour_version_translations (tour_version_id, locale, title, summary, meeting_point)
VALUES
  ('00000000-0000-0000-0000-000000002516'::uuid, 'en', 'Runtime simulated payment', 'Fixture', 'Runtime gate'),
  ('00000000-0000-0000-0000-000000002516'::uuid, 'vi', 'Thanh toan mo phong runtime', 'Du lieu mau', 'Cong runtime');
INSERT INTO public.tour_version_stops (tour_version_id, catalog_snapshot_id, position, place_id)
VALUES (
  '00000000-0000-0000-0000-000000002516'::uuid,
  '00000000-0000-0000-0000-000000002511'::uuid,
  1,
  '00000000-0000-0000-0000-000000002513'::uuid
);
RESET ROLE;

UPDATE public.catalog_snapshots
SET status = 'published', published_at = pg_catalog.clock_timestamp()
WHERE id = '00000000-0000-0000-0000-000000002511'::uuid;
UPDATE public.travel_snapshots
SET status = 'published', published_at = pg_catalog.clock_timestamp()
WHERE id = '00000000-0000-0000-0000-000000002514'::uuid;

SET LOCAL ROLE localens_tour_rpc_owner;
UPDATE public.tour_versions
SET status = 'published', published_at = pg_catalog.clock_timestamp()
WHERE id = '00000000-0000-0000-0000-000000002516'::uuid;
UPDATE public.tours SET status = 'published'
WHERE id = '00000000-0000-0000-0000-000000002515'::uuid;
INSERT INTO public.departures (id, tour_version_id, start_at, end_at, status, capacity)
VALUES
  (
    '00000000-0000-0000-0000-000000002517'::uuid,
    '00000000-0000-0000-0000-000000002516'::uuid,
    pg_catalog.clock_timestamp() + interval '7 days',
    pg_catalog.clock_timestamp() + interval '7 days 2 hours',
    'scheduled', 10
  ),
  (
    '00000000-0000-0000-0000-000000002518'::uuid,
    '00000000-0000-0000-0000-000000002516'::uuid,
    pg_catalog.clock_timestamp() + interval '8 days',
    pg_catalog.clock_timestamp() + interval '8 days 2 hours',
    'scheduled', 10
  );
RESET ROLE;

INSERT INTO private.thesis_demo_qa_slots (
  slot_id, dataset_version, terminal_flow, owner_user_id, departure_id,
  max_party_size, booking_id, checkout_attempt_id, checkout_idempotency_id,
  capacity_hold_id, simulated_payment_id, cancellation_id,
  booking_idempotency_key, payment_idempotency_key,
  cancellation_idempotency_key, recommend_operation_id, refine_operation_id
) VALUES (
  'qa-01', 'thesis-demo.v2', 'payment',
  '00000000-0000-0000-0000-000000002501'::uuid,
  '00000000-0000-0000-0000-000000002518'::uuid,
  2,
  '00000000-0000-0000-0000-000000002591'::uuid,
  '00000000-0000-0000-0000-000000002592'::uuid,
  '00000000-0000-0000-0000-000000002593'::uuid,
  '00000000-0000-0000-0000-000000002594'::uuid,
  '00000000-0000-0000-0000-000000002595'::uuid,
  '00000000-0000-0000-0000-000000002596'::uuid,
  'thesis-demo:v2:qa-01:booking',
  'thesis-demo:v2:qa-01:payment',
  'thesis-demo:v2:qa-01:cancel',
  '00000000-0000-0000-0000-000000002597'::uuid,
  '00000000-0000-0000-0000-000000002598'::uuid
);

SELECT ok(to_regclass('private.simulated_payment_receipts') IS NOT NULL, 'simulated-payment receipt table exists');
SELECT ok(to_regclass('public.customer_simulated_payment_status_v') IS NOT NULL, 'owner simulated-payment projection exists');
SELECT has_function('public', 'complete_simulated_fixed_tour_payment', ARRAY['uuid', 'text']);
SELECT is(
  (SELECT pg_catalog.pg_get_userbyid(proowner)
   FROM pg_catalog.pg_proc
   WHERE oid = 'public.complete_simulated_fixed_tour_payment(uuid,text)'::regprocedure),
  'localens_simulated_payment_rpc_owner',
  'simulated-payment RPC has a dedicated owner'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'localens_simulated_payment_rpc_owner'
      AND NOT rolcanlogin AND NOT rolinherit AND NOT rolbypassrls
      AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
  ),
  'simulated-payment owner is a least-privilege non-login role'
);
SELECT ok(
  (SELECT prosecdef
      AND proconfig @> ARRAY['search_path=""']
      AND proconfig @> ARRAY['statement_timeout=5s']
   FROM pg_catalog.pg_proc
   WHERE oid = 'public.complete_simulated_fixed_tour_payment(uuid,text)'::regprocedure),
  'simulated-payment RPC is a bounded sanitized definer'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.complete_simulated_fixed_tour_payment(uuid,text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.complete_simulated_fixed_tour_payment(uuid,text)', 'EXECUTE')
    AND NOT has_function_privilege('public', 'public.complete_simulated_fixed_tour_payment(uuid,text)', 'EXECUTE'),
  'only authenticated sessions can enter the guarded RPC'
);
SELECT is(
  pg_catalog.pg_get_function_arguments('public.complete_simulated_fixed_tour_payment(uuid,text)'::regprocedure),
  'booking_id uuid, idempotency_key text',
  'browser input exposes only booking id and idempotency key'
);
SELECT is(
  pg_catalog.pg_get_function_result('public.complete_simulated_fixed_tour_payment(uuid,text)'::regprocedure),
  'SETOF simulated_payment_result',
  'browser result exposes only authoritative simulated-payment facts'
);
SELECT ok(
  (SELECT relrowsecurity AND relforcerowsecurity
   FROM pg_catalog.pg_class
   WHERE oid = 'private.simulated_payment_receipts'::regclass),
  'simulated-payment receipts enforce RLS'
);
SELECT ok(
  NOT has_table_privilege('anon', 'private.simulated_payment_receipts', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'private.simulated_payment_receipts', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'private.simulated_payment_receipts', 'INSERT'),
  'browser roles have no receipt-table access'
);
SELECT ok(
  NOT has_column_privilege(
    'localens_simulated_payment_rpc_owner',
    'private.simulated_payment_receipts',
    'id',
    'UPDATE'
  ),
  'simulated-payment owner cannot update immutable receipts'
);
SELECT is(
  (SELECT string_agg(column_name::text, ',' ORDER BY ordinal_position)
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'customer_simulated_payment_status_v'),
  'booking_id,booking_status,payment_status,amount_minor,currency,simulated_at',
  'projection exposes exactly six sanitized columns'
);
SELECT is(
  (SELECT viewowner::text FROM pg_catalog.pg_views
   WHERE schemaname = 'public' AND viewname = 'customer_simulated_payment_status_v'),
  'localens_simulated_payment_projection_owner',
  'projection has a dedicated non-login owner'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'private' AND table_name = 'simulated_payment_receipts'
      AND column_name ~ 'provider|session|intent|account|endpoint|webhook|card|token'
  ),
  'receipt stores no provider or card facts'
);
SELECT ok(
  pg_catalog.pg_get_functiondef('public.complete_simulated_fixed_tour_payment(uuid,text)'::regprocedure)
    !~* 'finalize_stripe_event|insert[[:space:]]+into[[:space:]]+public\.payments|provider_payment_intent|webhook|card|token',
  'simulation never invokes provider finalization or writes provider-payment facts'
);

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT * FROM public.complete_simulated_fixed_tour_payment('00000000-0000-0000-0000-000000002599'::uuid, 'anon-key')$$,
  '42501', NULL,
  'anonymous sessions cannot execute simulated payment'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);
SELECT throws_ok(
  $$SELECT * FROM public.complete_simulated_fixed_tour_payment('00000000-0000-0000-0000-000000002599'::uuid, 'missing-subject')$$,
  '42501', 'simulated payment authentication required',
  'authenticated role without a JWT subject is denied'
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002503', true);
SELECT throws_ok(
  $$SELECT * FROM public.complete_simulated_fixed_tour_payment('00000000-0000-0000-0000-000000002599'::uuid, 'guide-key')$$,
  '42501', 'simulated payment authentication required',
  'guide JWT is denied'
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002504', true);
SELECT throws_ok(
  $$SELECT * FROM public.complete_simulated_fixed_tour_payment('00000000-0000-0000-0000-000000002599'::uuid, 'admin-key')$$,
  '42501', 'simulated payment authentication required',
  'admin JWT is denied'
);

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002501', 'role', 'authenticated')::text, true);
SELECT ok(
  (SELECT booking_id IS NOT NULL FROM public.begin_fixed_tour_booking('00000000-0000-0000-0000-000000002517'::uuid, 1, 'en', 'sim-success-booking')),
  'customer A creates the success hold'
);
SELECT ok(
  (SELECT booking_id IS NOT NULL FROM public.begin_fixed_tour_booking('00000000-0000-0000-0000-000000002517'::uuid, 1, 'en', 'sim-other-booking')),
  'customer A creates the conflict hold'
);
SELECT ok(
  (SELECT booking_id IS NOT NULL FROM public.begin_fixed_tour_booking('00000000-0000-0000-0000-000000002517'::uuid, 1, 'en', 'sim-expired-booking')),
  'customer A creates the expiry hold'
);
SELECT ok(
  (SELECT booking_id IS NOT NULL FROM public.begin_fixed_tour_booking('00000000-0000-0000-0000-000000002517'::uuid, 1, 'en', 'sim-real-booking')),
  'customer A creates the real-payment exclusion hold'
);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002502', 'role', 'authenticated')::text, true);
SELECT ok(
  (SELECT booking_id IS NOT NULL FROM public.begin_fixed_tour_booking('00000000-0000-0000-0000-000000002517'::uuid, 1, 'vi', 'sim-customer-b-booking')),
  'customer B creates an isolated hold'
);
RESET ROLE;

CREATE TEMP TABLE payment_fixture_bookings AS
SELECT idempotency_key AS label, booking_id, checkout_attempt_id
FROM private.checkout_idempotency
WHERE idempotency_key IN (
  'sim-success-booking', 'sim-other-booking', 'sim-expired-booking',
  'sim-real-booking', 'sim-customer-b-booking'
);
GRANT SELECT ON TABLE payment_fixture_bookings
  TO authenticated, localens_payment_rpc_owner, localens_checkout_rpc_owner;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002501', 'role', 'authenticated')::text, true);
SELECT throws_ok(
  format(
    'SELECT * FROM public.complete_simulated_fixed_tour_payment(%L::uuid, %L)',
    (SELECT booking_id FROM payment_fixture_bookings WHERE label = 'sim-success-booking'),
    'unsafe payment key'
  ),
  '22023', 'simulated payment input rejected',
  'authority rejects an idempotency key containing spaces'
);
SELECT throws_ok(
  format(
    'SELECT * FROM public.complete_simulated_fixed_tour_payment(%L::uuid, %L)',
    (SELECT booking_id FROM payment_fixture_bookings WHERE label = 'sim-success-booking'),
    'thanh-toán'
  ),
  '22023', 'simulated payment input rejected',
  'authority rejects a non-ASCII idempotency key'
);
RESET ROLE;

UPDATE public.bookings AS bookings
SET created_at = pg_catalog.statement_timestamp() - interval '36 minutes',
    hold_expires_at = pg_catalog.statement_timestamp() - interval '1 minute'
FROM payment_fixture_bookings AS fixtures
WHERE fixtures.label = 'sim-expired-booking' AND bookings.id = fixtures.booking_id;
UPDATE private.capacity_holds AS holds
SET created_at = pg_catalog.statement_timestamp() - interval '36 minutes',
    expires_at = pg_catalog.statement_timestamp() - interval '1 minute'
FROM payment_fixture_bookings AS fixtures
WHERE fixtures.label = 'sim-expired-booking' AND holds.booking_id = fixtures.booking_id;

SET LOCAL ROLE localens_payment_rpc_owner;
INSERT INTO public.payments (
  booking_id, attempt_id, owner_user_id, provider_session_id,
  provider_payment_intent_id, provider_account_id, provider_endpoint_id,
  mode, amount_minor, currency, status
)
SELECT bookings.id, attempts.id, bookings.owner_user_id,
  'cs_runtime_sim_payment_real', 'pi_runtime_sim_payment_real',
  'acct_localens_test', 'we_localens_test', 'payment',
  bookings.checkout_amount_minor, bookings.checkout_currency, 'pending'
FROM payment_fixture_bookings AS fixtures
JOIN public.bookings AS bookings ON bookings.id = fixtures.booking_id
JOIN private.checkout_attempts AS attempts ON attempts.id = fixtures.checkout_attempt_id
WHERE fixtures.label = 'sim-real-booking';
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002501', 'role', 'authenticated')::text, true);
SELECT ok(
  (SELECT result.booking_status = 'confirmed'::public.booking_status
      AND result.payment_status = 'paid'::public.payment_status
      AND result.simulated_at IS NOT NULL
      AND result.state = 'completed'
   FROM public.complete_simulated_fixed_tour_payment(
     (SELECT booking_id FROM payment_fixture_bookings WHERE label = 'sim-success-booking'),
     'sim-payment-success-key'
   ) AS result),
  'active hold completes as an authoritative paid simulation'
);
RESET ROLE;

SELECT results_eq(
  $$SELECT bookings.status::text, holds.status::text
    FROM payment_fixture_bookings AS fixtures
    JOIN public.bookings AS bookings ON bookings.id = fixtures.booking_id
    JOIN private.capacity_holds AS holds ON holds.booking_id = bookings.id
    WHERE fixtures.label = 'sim-success-booking'$$,
  $$VALUES ('confirmed'::text, 'consumed'::text)$$,
  'successful simulation confirms the booking and consumes the hold'
);
SELECT results_eq(
  $$SELECT receipts.result_booking_status::text, receipts.result_payment_status::text,
      receipts.simulated_at IS NOT NULL, count(*) OVER ()::integer
    FROM private.simulated_payment_receipts AS receipts
    JOIN payment_fixture_bookings AS fixtures ON fixtures.booking_id = receipts.booking_id
    WHERE fixtures.label = 'sim-success-booking'$$,
  $$VALUES ('confirmed'::text, 'paid'::text, true, 1)$$,
  'one terminal receipt stores the paid simulation result'
);

SELECT throws_ok(
  $sql$INSERT INTO public.payments (
    booking_id, attempt_id, owner_user_id, provider_session_id,
    provider_payment_intent_id, provider_account_id, provider_endpoint_id,
    mode, amount_minor, currency, status
  )
  SELECT bookings.id, attempts.id, bookings.owner_user_id,
    'cs_runtime_sim_after_paid', 'pi_runtime_sim_after_paid',
    'acct_localens_test', 'we_localens_test', 'payment',
    bookings.checkout_amount_minor, bookings.checkout_currency, 'pending'
  FROM public.bookings AS bookings
  JOIN private.checkout_attempts AS attempts ON attempts.booking_id = bookings.id
  JOIN payment_fixture_bookings AS fixtures ON fixtures.booking_id = bookings.id
  WHERE fixtures.label = 'sim-success-booking'$sql$,
  'P0001', 'SIMULATED_PAYMENT_EXISTS',
  'real provider payment cannot be inserted after a terminal simulation'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002501', 'role', 'authenticated')::text, true);
SELECT results_eq(
  $$SELECT payment_status::text, simulated_at IS NOT NULL
    FROM public.customer_simulated_payment_status_v
    WHERE booking_id = (SELECT booking_id FROM payment_fixture_bookings WHERE label = 'sim-success-booking')$$,
  $$VALUES ('paid'::text, true)$$,
  'customer A sees its paid simulated status through the projection'
);
SELECT is(
  (SELECT state FROM public.complete_simulated_fixed_tour_payment(
    (SELECT booking_id FROM payment_fixture_bookings WHERE label = 'sim-success-booking'),
    'sim-payment-success-key'
  )),
  'replayed',
  'same booking and idempotency key replay the terminal result'
);
SELECT throws_ok(
  format(
    'SELECT * FROM public.complete_simulated_fixed_tour_payment(%L::uuid, %L)',
    (SELECT booking_id FROM payment_fixture_bookings WHERE label = 'sim-success-booking'),
    'sim-payment-different-key'
  ),
  'P0001', 'IDEMPOTENCY_CONFLICT',
  'same booking with a different terminalization key conflicts'
);
SELECT throws_ok(
  format(
    'SELECT * FROM public.complete_simulated_fixed_tour_payment(%L::uuid, %L)',
    (SELECT booking_id FROM payment_fixture_bookings WHERE label = 'sim-other-booking'),
    'sim-payment-success-key'
  ),
  'P0001', 'IDEMPOTENCY_CONFLICT',
  'same customer key reused for another booking conflicts'
);

SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002502', 'role', 'authenticated')::text, true);
SELECT throws_ok(
  format(
    'SELECT * FROM public.complete_simulated_fixed_tour_payment(%L::uuid, %L)',
    (SELECT booking_id FROM payment_fixture_bookings WHERE label = 'sim-other-booking'),
    'cross-owner-key'
  ),
  '42501', 'simulated payment unavailable',
  'customer B cannot complete customer A booking'
);

SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002501', 'role', 'authenticated')::text, true);
SELECT ok(
  (SELECT result.booking_status = 'expired'::public.booking_status
      AND result.payment_status IS NULL
      AND result.simulated_at IS NOT NULL
      AND result.state = 'expired'
   FROM public.complete_simulated_fixed_tour_payment(
     (SELECT booking_id FROM payment_fixture_bookings WHERE label = 'sim-expired-booking'),
     'sim-payment-expired-key'
   ) AS result),
  'expired hold returns an authoritative unpaid result'
);
RESET ROLE;

SELECT results_eq(
  $$SELECT bookings.status::text, holds.status::text,
      receipts.result_payment_status IS NULL, receipts.simulated_at IS NOT NULL
    FROM payment_fixture_bookings AS fixtures
    JOIN public.bookings AS bookings ON bookings.id = fixtures.booking_id
    JOIN private.capacity_holds AS holds ON holds.booking_id = bookings.id
    JOIN private.simulated_payment_receipts AS receipts ON receipts.booking_id = bookings.id
    WHERE fixtures.label = 'sim-expired-booking'$$,
  $$VALUES ('expired'::text, 'expired'::text, true, true)$$,
  'late simulation expires booking and hold without fabricating payment'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002502', 'role', 'authenticated')::text, true);
SELECT results_eq(
  $$SELECT count(*)::integer
    FROM public.customer_simulated_payment_status_v$$,
  $$VALUES (0)$$,
  'customer B projection exposes no receipt for its pending booking'
);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002501', 'role', 'authenticated')::text, true);
SELECT throws_ok(
  format(
    'SELECT * FROM public.complete_simulated_fixed_tour_payment(%L::uuid, %L)',
    (SELECT booking_id FROM payment_fixture_bookings WHERE label = 'sim-real-booking'),
    'sim-payment-real-exclusion'
  ),
  'P0001', 'REAL_PAYMENT_EXISTS',
  'real payment fact makes simulation fail closed'
);
RESET ROLE;

SET LOCAL ROLE localens_checkout_rpc_owner;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002501', true);
SELECT results_eq(
  format(
    'SELECT booking_status::text, state FROM private.compensate_checkout_failure(%L::uuid)',
    (SELECT checkout_attempt_id FROM payment_fixture_bookings WHERE label = 'sim-success-booking')
  ),
  $$VALUES ('confirmed'::text, 'replayed'::text)$$,
  'checkout compensation replays after a paid simulation'
);
RESET ROLE;
SELECT is(
  (SELECT bookings.status::text
   FROM payment_fixture_bookings AS fixtures
   JOIN public.bookings AS bookings ON bookings.id = fixtures.booking_id
   WHERE fixtures.label = 'sim-success-booking'),
  'confirmed',
  'compensation cannot downgrade the confirmed simulated booking'
);
SELECT is(
  (SELECT count(*)::integer FROM private.simulated_payment_receipts),
  2,
  'only successful and expired terminalizations create receipts'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-0000-0000-000000002501',
  'role', 'authenticated'
)::text, true);
SELECT is(
  (SELECT booking_id FROM public.begin_fixed_tour_booking(
    '00000000-0000-0000-0000-000000002518'::uuid,
    2,
    'en'::public.locale,
    'thesis-demo:v2:qa-01:booking'
  )),
  '00000000-0000-0000-0000-000000002591'::uuid,
  'payment QA tuple creates the registered booking'
);
RESET ROLE;
INSERT INTO public.bookings (
  id, owner_user_id, source_kind, source_id, departure_id, quote_id, status,
  tour_version_id, title_en, title_vi, cancellation_policy, catalog_snapshot_id,
  travel_snapshot_id, fx_snapshot_id, fx_vnd_per_usd, per_person_vnd_minor,
  total_vnd_minor, checkout_currency, checkout_amount_minor, party_size,
  language, meeting_point, hold_duration_seconds, hold_expires_at, created_at
)
SELECT
  '00000000-0000-0000-0000-000000002599'::uuid,
  owner_user_id, source_kind, source_id, departure_id, quote_id, status,
  tour_version_id, title_en, title_vi, cancellation_policy, catalog_snapshot_id,
  travel_snapshot_id, fx_snapshot_id, fx_vnd_per_usd, per_person_vnd_minor,
  total_vnd_minor, checkout_currency, checkout_amount_minor, party_size,
  language, meeting_point, hold_duration_seconds, hold_expires_at, created_at
FROM public.bookings
WHERE id = '00000000-0000-0000-0000-000000002591'::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-0000-0000-000000002501',
  'role', 'authenticated'
)::text, true);
SELECT throws_ok(
  $$SELECT * FROM public.complete_simulated_fixed_tour_payment(
    '00000000-0000-0000-0000-000000002599'::uuid,
    'unregistered-qa-payment'
  )$$,
  '22023', 'THESIS_DEMO_QA_SLOT_MISMATCH',
  'unregistered booking on a registry-backed departure is rejected before payment mutation'
);
RESET ROLE;
SELECT is(
  (SELECT count(*)::integer FROM private.simulated_payment_receipts
   WHERE booking_id = '00000000-0000-0000-0000-000000002599'::uuid),
  0,
  'rejected unregistered QA booking creates no simulated-payment receipt'
);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-0000-0000-000000002501',
  'role', 'authenticated'
)::text, true);
SELECT is(
  (SELECT result.state
   FROM public.complete_simulated_fixed_tour_payment(
     '00000000-0000-0000-0000-000000002591'::uuid,
     'thesis-demo:v2:qa-01:payment'
   ) AS result),
  'completed',
  'payment QA slot completes normally'
);
RESET ROLE;
SELECT is(
  (SELECT id FROM private.simulated_payment_receipts
   WHERE booking_id = '00000000-0000-0000-0000-000000002591'::uuid),
  '00000000-0000-0000-0000-000000002595'::uuid,
  'payment QA slot uses the registered receipt id'
);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-0000-0000-000000002501',
  'role', 'authenticated'
)::text, true);
SELECT is(
  (SELECT result.state
   FROM public.complete_simulated_fixed_tour_payment(
     '00000000-0000-0000-0000-000000002591'::uuid,
     'thesis-demo:v2:qa-01:payment'
   ) AS result),
  'replayed',
  'payment QA slot replays without another receipt'
);
SELECT throws_ok(
  $$SELECT * FROM public.complete_simulated_fixed_tour_payment(
    '00000000-0000-0000-0000-000000002591'::uuid,
    'thesis-demo:v2:qa-02:payment'
  )$$,
  '22023', 'THESIS_DEMO_QA_SLOT_MISMATCH',
  'registered booking rejects a mismatched payment key before mutation'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
