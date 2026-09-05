BEGIN;

SELECT plan(31);

-- Deterministic rollback-only identities and one synthetic published departure.
DELETE FROM auth.users
WHERE id IN (
  '00000000-0000-0000-0000-000000002301'::uuid,
  '00000000-0000-0000-0000-000000002302'::uuid,
  '00000000-0000-0000-0000-000000002303'::uuid,
  '00000000-0000-0000-0000-000000002304'::uuid
);

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000002301'::uuid, 'authenticated', 'authenticated', 'fixed-tour-a@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000002302'::uuid, 'authenticated', 'authenticated', 'fixed-tour-b@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000002303'::uuid, 'authenticated', 'authenticated', 'fixed-tour-guide@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000002304'::uuid, 'authenticated', 'authenticated', 'fixed-tour-admin@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now());

DELETE FROM private.user_roles
WHERE user_id IN (
  '00000000-0000-0000-0000-000000002303'::uuid,
  '00000000-0000-0000-0000-000000002304'::uuid
);
INSERT INTO private.user_roles (user_id, role)
VALUES
  ('00000000-0000-0000-0000-000000002303'::uuid, 'guide'::public.app_role),
  ('00000000-0000-0000-0000-000000002304'::uuid, 'admin'::public.app_role);

INSERT INTO public.catalog_snapshots (id, status)
VALUES ('00000000-0000-0000-0000-000000002311'::uuid, 'building');
INSERT INTO public.catalog_snapshot_areas (snapshot_id, area_id, slug)
VALUES ('00000000-0000-0000-0000-000000002311'::uuid, '00000000-0000-0000-0000-000000002312'::uuid, 'runtime-fixed-tour-area');
INSERT INTO public.catalog_snapshot_places (
  snapshot_id, place_id, area_id, slug, price_vnd_per_person,
  visit_duration_minutes, source_url, verified_at, attribution
)
VALUES (
  '00000000-0000-0000-0000-000000002311'::uuid,
  '00000000-0000-0000-0000-000000002313'::uuid,
  '00000000-0000-0000-0000-000000002312'::uuid,
  'runtime-fixed-tour-place', 0, 60,
  'https://example.invalid/runtime-fixed-tour-place', CURRENT_DATE, 'Runtime fixed-tour pgTAP fixture'
);
INSERT INTO public.catalog_snapshot_place_translations (
  snapshot_id, place_id, locale, title, summary, description
)
VALUES
  ('00000000-0000-0000-0000-000000002311'::uuid, '00000000-0000-0000-0000-000000002313'::uuid, 'en', 'Runtime place', 'Fixture', 'Fixture place'),
  ('00000000-0000-0000-0000-000000002311'::uuid, '00000000-0000-0000-0000-000000002313'::uuid, 'vi', 'Dia diem runtime', 'Du lieu mau', 'Dia diem du lieu mau');
INSERT INTO public.travel_snapshots (id, catalog_snapshot_id, status)
VALUES ('00000000-0000-0000-0000-000000002314'::uuid, '00000000-0000-0000-0000-000000002311'::uuid, 'building');

SET LOCAL ROLE localens_tour_rpc_owner;
INSERT INTO public.tours (id, slug, status)
VALUES ('00000000-0000-0000-0000-000000002315'::uuid, 'runtime-fixed-tour', 'draft');
INSERT INTO public.tour_translations (tour_id, locale, title, summary, meeting_point)
VALUES
  ('00000000-0000-0000-0000-000000002315'::uuid, 'en', 'Runtime fixed tour', 'Fixture', 'Runtime gate'),
  ('00000000-0000-0000-0000-000000002315'::uuid, 'vi', 'Tour co dinh runtime', 'Du lieu mau', 'Cong runtime');
INSERT INTO public.tour_versions (
  id, tour_id, catalog_snapshot_id, status, duration_minutes,
  price_vnd_per_person, inclusions, exclusions, cancellation_policy,
  source_url, verified_at, attribution, license
)
VALUES (
  '00000000-0000-0000-0000-000000002316'::uuid,
  '00000000-0000-0000-0000-000000002315'::uuid,
  '00000000-0000-0000-0000-000000002311'::uuid,
  'draft', 120, 100000, ARRAY['guide'], ARRAY['transfer'],
  'Runtime fixed-tour fixture policy',
  'https://example.invalid/runtime-fixed-tour', CURRENT_DATE,
  'Runtime fixed-tour pgTAP fixture', 'CC0'
);
INSERT INTO public.tour_version_translations (tour_version_id, locale, title, summary, meeting_point)
VALUES
  ('00000000-0000-0000-0000-000000002316'::uuid, 'en', 'Runtime fixed tour', 'Fixture', 'Runtime gate'),
  ('00000000-0000-0000-0000-000000002316'::uuid, 'vi', 'Tour co dinh runtime', 'Du lieu mau', 'Cong runtime');
INSERT INTO public.tour_version_stops (tour_version_id, catalog_snapshot_id, position, place_id)
VALUES (
  '00000000-0000-0000-0000-000000002316'::uuid,
  '00000000-0000-0000-0000-000000002311'::uuid,
  1,
  '00000000-0000-0000-0000-000000002313'::uuid
);
RESET ROLE;

UPDATE public.catalog_snapshots
SET status = 'published', published_at = pg_catalog.clock_timestamp()
WHERE id = '00000000-0000-0000-0000-000000002311'::uuid;
UPDATE public.travel_snapshots
SET status = 'published', published_at = pg_catalog.clock_timestamp()
WHERE id = '00000000-0000-0000-0000-000000002314'::uuid;

SET LOCAL ROLE localens_tour_rpc_owner;
UPDATE public.tour_versions
SET status = 'published', published_at = pg_catalog.clock_timestamp()
WHERE id = '00000000-0000-0000-0000-000000002316'::uuid;
UPDATE public.tours
SET status = 'published'
WHERE id = '00000000-0000-0000-0000-000000002315'::uuid;
INSERT INTO public.departures (id, tour_version_id, start_at, end_at, status, capacity)
VALUES
  (
    '00000000-0000-0000-0000-000000002317'::uuid,
    '00000000-0000-0000-0000-000000002316'::uuid,
    pg_catalog.clock_timestamp() + interval '7 days',
    pg_catalog.clock_timestamp() + interval '7 days 2 hours',
    'scheduled', 8
  ),
  (
    '00000000-0000-0000-0000-000000002318'::uuid,
    '00000000-0000-0000-0000-000000002316'::uuid,
    pg_catalog.clock_timestamp() + interval '8 days',
    pg_catalog.clock_timestamp() + interval '8 days 2 hours',
    'scheduled', 8
  ),
  (
    '00000000-0000-0000-0000-000000002319'::uuid,
    '00000000-0000-0000-0000-000000002316'::uuid,
    pg_catalog.clock_timestamp() + interval '9 days',
    pg_catalog.clock_timestamp() + interval '9 days 2 hours',
    'scheduled', 8
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
  '00000000-0000-0000-0000-000000002301'::uuid,
  '00000000-0000-0000-0000-000000002319'::uuid,
  2,
  '00000000-0000-0000-0000-000000002391'::uuid,
  '00000000-0000-0000-0000-000000002392'::uuid,
  '00000000-0000-0000-0000-000000002393'::uuid,
  '00000000-0000-0000-0000-000000002394'::uuid,
  '00000000-0000-0000-0000-000000002395'::uuid,
  '00000000-0000-0000-0000-000000002396'::uuid,
  'thesis-demo:v2:qa-01:booking',
  'thesis-demo:v2:qa-01:payment',
  'thesis-demo:v2:qa-01:cancel',
  '00000000-0000-0000-0000-000000002397'::uuid,
  '00000000-0000-0000-0000-000000002398'::uuid
);

SELECT has_function(
  'public',
  'begin_fixed_tour_booking',
  ARRAY['uuid', 'integer', 'public.locale', 'text']
);
SELECT is(
  (SELECT pg_catalog.pg_get_userbyid(proowner)
   FROM pg_catalog.pg_proc
   WHERE oid = 'public.begin_fixed_tour_booking(uuid,integer,public.locale,text)'::regprocedure),
  'localens_checkout_rpc_owner',
  'fixed-tour booking wrapper reuses the hardened checkout owner'
);
SELECT ok(
  (SELECT prosecdef
      AND proconfig @> ARRAY['search_path=""']
      AND proconfig @> ARRAY['statement_timeout=5s']
   FROM pg_catalog.pg_proc
   WHERE oid = 'public.begin_fixed_tour_booking(uuid,integer,public.locale,text)'::regprocedure),
  'fixed-tour booking wrapper is SECURITY DEFINER with fixed execution settings'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.begin_fixed_tour_booking(uuid,integer,public.locale,text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.begin_fixed_tour_booking(uuid,integer,public.locale,text)', 'EXECUTE')
    AND NOT has_function_privilege('public', 'public.begin_fixed_tour_booking(uuid,integer,public.locale,text)', 'EXECUTE'),
  'only authenticated browser sessions receive execute privilege'
);
SELECT ok(
  NOT has_schema_privilege('localens_checkout_rpc_owner', 'public', 'CREATE')
    AND NOT has_schema_privilege('localens_checkout_rpc_owner', 'private', 'CREATE'),
  'final checkout owner has no CREATE privilege on public or private schemas'
);
SELECT ok(
  (SELECT qual ~ 'request\.jwt\.claim\.sub'
      AND qual ~ 'request\.jwt\.claims'
      AND qual ~ '''sub'''
   FROM pg_catalog.pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'bookings'
     AND policyname = 'bookings_projection_owner_select'),
  'owner booking policy normalizes legacy and PostgREST JSON subject claims'
);
SELECT is(
  pg_catalog.pg_get_function_arguments('public.begin_fixed_tour_booking(uuid,integer,public.locale,text)'::regprocedure),
  'departure_id uuid, party_size integer, booking_locale locale, idempotency_key text',
  'browser input exposes only departure, party size, locale, and idempotency key'
);
SELECT is(
  pg_catalog.pg_get_function_result('public.begin_fixed_tour_booking(uuid,integer,public.locale,text)'::regprocedure),
  'TABLE(booking_id uuid, hold_expires_at timestamp with time zone, state text)',
  'browser output exposes only booking id, hold expiry, and state'
);
SELECT ok(
  pg_catalog.pg_get_functiondef('public.begin_fixed_tour_booking(uuid,integer,public.locale,text)'::regprocedure)
    ~ 'private\.start_checkout_tx\('
  AND pg_catalog.pg_get_functiondef('public.begin_fixed_tour_booking(uuid,integer,public.locale,text)'::regprocedure)
    ~ 'private\.checkout_canonical_payload\('
  AND pg_catalog.pg_get_functiondef('public.begin_fixed_tour_booking(uuid,integer,public.locale,text)'::regprocedure)
    ~ '''departure''',
  'wrapper derives the canonical fixed-departure request and delegates to the existing checkout transaction'
);

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT * FROM public.begin_fixed_tour_booking('00000000-0000-0000-0000-000000002317'::uuid, 1, 'en'::public.locale, 'anon-key')$$,
  '42501', NULL,
  'anonymous sessions cannot execute the fixed-tour booking wrapper'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);
SELECT throws_ok(
  $$SELECT * FROM public.begin_fixed_tour_booking('00000000-0000-0000-0000-000000002317'::uuid, 1, 'en'::public.locale, 'missing-subject')$$,
  '42501', 'checkout authentication required',
  'authenticated role without a JWT subject is denied'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002303', true);
SELECT throws_ok(
  $$SELECT * FROM public.begin_fixed_tour_booking('00000000-0000-0000-0000-000000002317'::uuid, 1, 'en'::public.locale, 'guide-key')$$,
  '42501', 'checkout authentication required',
  'guide JWT is denied by the existing checkout role gate'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002304', true);
SELECT throws_ok(
  $$SELECT * FROM public.begin_fixed_tour_booking('00000000-0000-0000-0000-000000002317'::uuid, 1, 'en'::public.locale, 'admin-key')$$,
  '42501', 'checkout authentication required',
  'admin JWT is denied by the existing checkout role gate'
);

SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002301', true);
SELECT ok(
  (SELECT booking_id IS NOT NULL
      AND hold_expires_at > pg_catalog.clock_timestamp()
      AND state = 'created'
   FROM public.begin_fixed_tour_booking(
     '00000000-0000-0000-0000-000000002317'::uuid,
     1,
     'en'::public.locale,
     'customer-a-legacy-key'
   )),
  'customer A creates a fixed-tour hold from the legacy JWT subject claim'
);
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-0000-0000-000000002301',
  'role', 'authenticated'
)::text, true);
SELECT ok(
  (SELECT booking_id IS NOT NULL
      AND hold_expires_at > pg_catalog.clock_timestamp()
      AND state = 'created'
   FROM public.begin_fixed_tour_booking(
     '00000000-0000-0000-0000-000000002317'::uuid,
     1,
     'en'::public.locale,
     'customer-a-key'
   )),
  'customer A creates a pending fixed-tour hold from PostgREST JSON claims'
);
SELECT is(
  (SELECT count(*)::integer FROM public.customer_bookings_v),
  2,
  'customer A sees the durable booking through the owner projection'
);
SELECT ok(
  (SELECT result.state = 'resumed'
      AND EXISTS (
        SELECT 1
        FROM public.customer_bookings_v AS owner_booking
        WHERE owner_booking.id = result.booking_id
      )
   FROM public.begin_fixed_tour_booking(
     '00000000-0000-0000-0000-000000002317'::uuid,
     1,
     'en'::public.locale,
     'customer-a-key'
   ) AS result),
  'same customer, key, and payload resume the original booking'
);
SELECT throws_ok(
  $$SELECT * FROM public.begin_fixed_tour_booking('00000000-0000-0000-0000-000000002317'::uuid, 2, 'en'::public.locale, 'customer-a-key')$$,
  'P0001', 'IDEMPOTENCY_CONFLICT',
  'same key with changed party size conflicts'
);
SELECT ok(
  (SELECT booking_id IS NOT NULL AND state = 'created'
   FROM public.begin_fixed_tour_booking(
     '00000000-0000-0000-0000-000000002317'::uuid,
     1,
     'en'::public.locale,
     'customer-a-departure-key'
   )),
  'customer A creates the baseline for departure-only conflict'
);
SELECT throws_ok(
  $$SELECT * FROM public.begin_fixed_tour_booking('00000000-0000-0000-0000-000000002318'::uuid, 1, 'en'::public.locale, 'customer-a-departure-key')$$,
  'P0001', 'IDEMPOTENCY_CONFLICT',
  'same key with only departure changed conflicts'
);
SELECT ok(
  (SELECT booking_id IS NOT NULL AND state = 'created'
   FROM public.begin_fixed_tour_booking(
     '00000000-0000-0000-0000-000000002317'::uuid,
     1,
     'en'::public.locale,
     'customer-a-locale-key'
   )),
  'customer A creates the baseline for locale-only conflict'
);
SELECT throws_ok(
  $$SELECT * FROM public.begin_fixed_tour_booking('00000000-0000-0000-0000-000000002317'::uuid, 1, 'vi'::public.locale, 'customer-a-locale-key')$$,
  'P0001', 'IDEMPOTENCY_CONFLICT',
  'same key with only locale changed conflicts'
);

SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-0000-0000-000000002302',
  'role', 'authenticated'
)::text, true);
SELECT is(
  (SELECT count(*)::integer FROM public.customer_bookings_v),
  0,
  'customer B cannot see customer A booking'
);
SELECT ok(
  (SELECT booking_id IS NOT NULL AND state = 'created'
   FROM public.begin_fixed_tour_booking(
     '00000000-0000-0000-0000-000000002317'::uuid,
     2,
     'vi'::public.locale,
     'customer-b-key'
   )),
  'customer B creates an independent Vietnamese fixed-tour hold'
);
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT is(
  (SELECT count(*)::integer FROM public.customer_bookings_v),
  1,
  'customer B sees only their own booking'
);

SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-0000-0000-000000002301',
  'role', 'authenticated'
)::text, true);
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT is(
  (SELECT count(*)::integer FROM public.customer_bookings_v),
  4,
  'customer A still sees only their own booking after customer B checkout'
);
SELECT results_eq(
  $$SELECT
      count(*)::integer,
      count(DISTINCT source_id)::integer,
      min(party_size)::integer,
      max(party_size)::integer,
      bool_and(language = 'en'::public.locale),
      bool_and(status = 'pending_payment'::public.booking_status)
    FROM public.customer_bookings_v$$,
  $$VALUES (
    4,
    1,
    1,
    1,
    true,
    true
  )$$,
  'JSON-only customer A projection contains only its fixed-tour pending-payment bookings'
);

SELECT results_eq(
  $$SELECT booking_id, state
    FROM public.begin_fixed_tour_booking(
      '00000000-0000-0000-0000-000000002319'::uuid,
      2,
      'en'::public.locale,
      'thesis-demo:v2:qa-01:booking'
    )$$,
  $$VALUES ('00000000-0000-0000-0000-000000002391'::uuid, 'created'::text)$$,
  'exact QA tuple allocates the registered booking id'
);
RESET ROLE;
SELECT results_eq(
  $$SELECT idempotency.id, attempts.id, holds.id
    FROM private.checkout_idempotency AS idempotency
    JOIN private.checkout_attempts AS attempts
      ON attempts.id = idempotency.checkout_attempt_id
    JOIN private.capacity_holds AS holds
      ON holds.booking_id = idempotency.booking_id
    WHERE idempotency.booking_id = '00000000-0000-0000-0000-000000002391'::uuid$$,
  $$VALUES (
    '00000000-0000-0000-0000-000000002393'::uuid,
    '00000000-0000-0000-0000-000000002392'::uuid,
    '00000000-0000-0000-0000-000000002394'::uuid
  )$$,
  'QA booking allocates the registered checkout and hold ids'
);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-0000-0000-000000002301',
  'role', 'authenticated'
)::text, true);
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT is(
  (SELECT state FROM public.begin_fixed_tour_booking(
    '00000000-0000-0000-0000-000000002319'::uuid,
    2,
    'en'::public.locale,
    'thesis-demo:v2:qa-01:booking'
  )),
  'resumed',
  'exact QA booking replay returns the same registered graph'
);
SELECT throws_ok(
  $$SELECT * FROM public.begin_fixed_tour_booking(
    '00000000-0000-0000-0000-000000002319'::uuid,
    1,
    'en'::public.locale,
    'thesis-demo:v2:unknown:booking'
  )$$,
  '22023', 'THESIS_DEMO_QA_SLOT_MISMATCH',
  'unknown QA slot fails before checkout mutation'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
