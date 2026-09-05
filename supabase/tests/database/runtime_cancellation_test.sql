BEGIN;

SELECT plan(79);

DELETE FROM auth.users
WHERE id BETWEEN '00000000-0000-0000-0000-000000002601'::uuid
  AND '00000000-0000-0000-0000-000000002605'::uuid;

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000002601', 'authenticated', 'authenticated', 'cancel-a@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000002602', 'authenticated', 'authenticated', 'cancel-b@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000002603', 'authenticated', 'authenticated', 'cancel-guide@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000002604', 'authenticated', 'authenticated', 'cancel-admin@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000002605', 'authenticated', 'authenticated', 'cancel-mixed@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now());

DELETE FROM private.user_roles
WHERE user_id IN (
  '00000000-0000-0000-0000-000000002603'::uuid,
  '00000000-0000-0000-0000-000000002604'::uuid
);
INSERT INTO private.user_roles (user_id, role)
VALUES
  ('00000000-0000-0000-0000-000000002603', 'guide'),
  ('00000000-0000-0000-0000-000000002604', 'admin'),
  ('00000000-0000-0000-0000-000000002605', 'admin');

INSERT INTO public.catalog_snapshots (id, status)
VALUES ('00000000-0000-0000-0000-000000002611', 'building');
INSERT INTO public.catalog_snapshot_areas (snapshot_id, area_id, slug)
VALUES ('00000000-0000-0000-0000-000000002611', '00000000-0000-0000-0000-000000002612', 'automatic-cancellation-area');
INSERT INTO public.catalog_snapshot_places (
  snapshot_id, place_id, area_id, slug, price_vnd_per_person,
  visit_duration_minutes, source_url, verified_at, attribution
)
VALUES (
  '00000000-0000-0000-0000-000000002611',
  '00000000-0000-0000-0000-000000002613',
  '00000000-0000-0000-0000-000000002612',
  'automatic-cancellation-place', 0, 60,
  'https://example.invalid/automatic-cancellation-place', CURRENT_DATE,
  'Automatic cancellation pgTAP fixture'
);
INSERT INTO public.catalog_snapshot_place_translations (
  snapshot_id, place_id, locale, title, summary, description
)
VALUES
  ('00000000-0000-0000-0000-000000002611', '00000000-0000-0000-0000-000000002613', 'en', 'Cancellation place', 'Fixture', 'Fixture place'),
  ('00000000-0000-0000-0000-000000002611', '00000000-0000-0000-0000-000000002613', 'vi', 'Dia diem huy don', 'Du lieu mau', 'Dia diem du lieu mau');
INSERT INTO public.travel_snapshots (id, catalog_snapshot_id, status)
VALUES ('00000000-0000-0000-0000-000000002614', '00000000-0000-0000-0000-000000002611', 'building');

SET LOCAL ROLE localens_tour_rpc_owner;
INSERT INTO public.tours (id, slug, status)
VALUES ('00000000-0000-0000-0000-000000002615', 'automatic-cancellation', 'draft');
INSERT INTO public.tour_translations (tour_id, locale, title, summary, meeting_point)
VALUES
  ('00000000-0000-0000-0000-000000002615', 'en', 'Automatic cancellation', 'Fixture', 'Runtime gate'),
  ('00000000-0000-0000-0000-000000002615', 'vi', 'Huy don tu dong', 'Du lieu mau', 'Cong runtime');
INSERT INTO public.tour_versions (
  id, tour_id, catalog_snapshot_id, status, duration_minutes,
  price_vnd_per_person, inclusions, exclusions, cancellation_policy,
  source_url, verified_at, attribution, license
)
VALUES (
  '00000000-0000-0000-0000-000000002616',
  '00000000-0000-0000-0000-000000002615',
  '00000000-0000-0000-0000-000000002611',
  'draft', 120, 125000, ARRAY['guide'], ARRAY['transfer'],
  'Cancellation is allowed before payment.',
  'https://example.invalid/automatic-cancellation', CURRENT_DATE,
  'Automatic cancellation pgTAP fixture', 'CC0'
);
INSERT INTO public.tour_version_translations (tour_version_id, locale, title, summary, meeting_point)
VALUES
  ('00000000-0000-0000-0000-000000002616', 'en', 'Automatic cancellation', 'Fixture', 'Runtime gate'),
  ('00000000-0000-0000-0000-000000002616', 'vi', 'Huy don tu dong', 'Du lieu mau', 'Cong runtime');
INSERT INTO public.tour_version_stops (tour_version_id, catalog_snapshot_id, position, place_id)
VALUES ('00000000-0000-0000-0000-000000002616', '00000000-0000-0000-0000-000000002611', 1, '00000000-0000-0000-0000-000000002613');
RESET ROLE;

UPDATE public.catalog_snapshots SET status = 'published', published_at = clock_timestamp()
WHERE id = '00000000-0000-0000-0000-000000002611';
UPDATE public.travel_snapshots SET status = 'published', published_at = clock_timestamp()
WHERE id = '00000000-0000-0000-0000-000000002614';
SET LOCAL ROLE localens_tour_rpc_owner;
UPDATE public.tour_versions SET status = 'published', published_at = clock_timestamp()
WHERE id = '00000000-0000-0000-0000-000000002616';
UPDATE public.tours SET status = 'published'
WHERE id = '00000000-0000-0000-0000-000000002615';
INSERT INTO public.departures (id, tour_version_id, start_at, end_at, status, capacity)
VALUES
  (
    '00000000-0000-0000-0000-000000002617',
    '00000000-0000-0000-0000-000000002616',
    clock_timestamp() + interval '7 days', clock_timestamp() + interval '7 days 2 hours',
    'scheduled', 100
  ),
  (
    '00000000-0000-0000-0000-000000002618',
    '00000000-0000-0000-0000-000000002616',
    clock_timestamp() + interval '8 days', clock_timestamp() + interval '8 days 2 hours',
    'scheduled', 10
  );
RESET ROLE;

INSERT INTO public.trip_plans (id, owner_user_id, latest_revision_no)
VALUES
  ('00000000-0000-0000-0000-000000002621', '00000000-0000-0000-0000-000000002601', 1),
  ('00000000-0000-0000-0000-000000002622', '00000000-0000-0000-0000-000000002601', 1);
INSERT INTO public.trip_plan_revisions (
  id, plan_id, revision_no, base_revision_no, request_json, result_json,
  fingerprint, ranking_source, catalog_snapshot_id, travel_snapshot_id,
  currency, budget_vnd, total_cost_vnd, total_duration_minutes, actor_user_id
)
VALUES
  ('00000000-0000-0000-0000-000000002631', '00000000-0000-0000-0000-000000002621', 1, 0, '{"partySize":1}', '{}', repeat('a', 64), 'deterministic', '00000000-0000-0000-0000-000000002611', '00000000-0000-0000-0000-000000002614', 'VND', 100000, 100000, 60, '00000000-0000-0000-0000-000000002601'),
  ('00000000-0000-0000-0000-000000002632', '00000000-0000-0000-0000-000000002622', 1, 0, '{"partySize":1}', '{}', repeat('b', 64), 'deterministic', '00000000-0000-0000-0000-000000002611', '00000000-0000-0000-0000-000000002614', 'VND', 100000, 100000, 60, '00000000-0000-0000-0000-000000002601');
INSERT INTO public.custom_requests (id, plan_id, revision_id, revision_no, owner_user_id, status)
VALUES
  ('00000000-0000-0000-0000-000000002641', '00000000-0000-0000-0000-000000002621', '00000000-0000-0000-0000-000000002631', 1, '00000000-0000-0000-0000-000000002601', 'draft'),
  ('00000000-0000-0000-0000-000000002642', '00000000-0000-0000-0000-000000002622', '00000000-0000-0000-0000-000000002632', 1, '00000000-0000-0000-0000-000000002601', 'draft');
SELECT set_config('localens.request_transition', 'on', true);
UPDATE public.custom_requests
SET status = 'pending_review'::public.request_status
WHERE id IN (
  '00000000-0000-0000-0000-000000002641'::uuid,
  '00000000-0000-0000-0000-000000002642'::uuid
);
UPDATE public.custom_requests
SET status = 'approved'::public.request_status
WHERE id IN (
  '00000000-0000-0000-0000-000000002641'::uuid,
  '00000000-0000-0000-0000-000000002642'::uuid
);
SELECT set_config('localens.request_transition', 'off', true);
INSERT INTO public.custom_quotes (
  id, request_id, status, amount_vnd_minor, checkout_currency, checkout_amount_minor,
  catalog_snapshot_id, travel_snapshot_id, title_en, title_vi, policy, created_at
)
VALUES
  ('00000000-0000-0000-0000-000000002651', '00000000-0000-0000-0000-000000002641', 'checkout_pending', 100000, 'vnd', 100000, '00000000-0000-0000-0000-000000002611', '00000000-0000-0000-0000-000000002614', 'Active quote', 'Bao gia con han', 'Cancellation fixture', clock_timestamp()),
  ('00000000-0000-0000-0000-000000002652', '00000000-0000-0000-0000-000000002642', 'checkout_pending', 100000, 'vnd', 100000, '00000000-0000-0000-0000-000000002611', '00000000-0000-0000-0000-000000002614', 'Expired quote', 'Bao gia het han', 'Cancellation fixture', clock_timestamp() - interval '3 days');

CREATE TEMP TABLE cancellation_fixtures (
  label text PRIMARY KEY,
  booking_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  source_kind text NOT NULL,
  source_id uuid NOT NULL,
  booking_status public.booking_status NOT NULL DEFAULT 'pending_payment',
  attempt_status text NOT NULL DEFAULT 'created',
  provider_session_id text,
  hold_status public.hold_status
);
INSERT INTO cancellation_fixtures (label, booking_id, attempt_id, owner_user_id, source_kind, source_id, booking_status, attempt_status, provider_session_id, hold_status)
VALUES
  ('dep-main', '00000000-0000-0000-0000-000000002701', '00000000-0000-0000-0000-000000002801', '00000000-0000-0000-0000-000000002601', 'departure', '00000000-0000-0000-0000-000000002618', 'pending_payment', 'created', NULL, 'active'),
  ('dep-optional', '00000000-0000-0000-0000-000000002702', '00000000-0000-0000-0000-000000002802', '00000000-0000-0000-0000-000000002601', 'departure', '00000000-0000-0000-0000-000000002617', 'pending_payment', 'created', NULL, 'active'),
  ('dep-conflict', '00000000-0000-0000-0000-000000002703', '00000000-0000-0000-0000-000000002803', '00000000-0000-0000-0000-000000002601', 'departure', '00000000-0000-0000-0000-000000002617', 'pending_payment', 'created', NULL, 'active'),
  ('dep-cross', '00000000-0000-0000-0000-000000002704', '00000000-0000-0000-0000-000000002804', '00000000-0000-0000-0000-000000002601', 'departure', '00000000-0000-0000-0000-000000002617', 'pending_payment', 'created', NULL, 'active'),
  ('dep-paid', '00000000-0000-0000-0000-000000002705', '00000000-0000-0000-0000-000000002805', '00000000-0000-0000-0000-000000002601', 'departure', '00000000-0000-0000-0000-000000002617', 'pending_payment', 'created', NULL, 'active'),
  ('dep-terminal', '00000000-0000-0000-0000-000000002706', '00000000-0000-0000-0000-000000002806', '00000000-0000-0000-0000-000000002601', 'departure', '00000000-0000-0000-0000-000000002617', 'confirmed', 'created', NULL, 'active'),
  ('dep-provider', '00000000-0000-0000-0000-000000002707', '00000000-0000-0000-0000-000000002807', '00000000-0000-0000-0000-000000002601', 'departure', '00000000-0000-0000-0000-000000002617', 'pending_payment', 'session_recorded', 'cs_provider_authority', 'active'),
  ('dep-real-payment', '00000000-0000-0000-0000-000000002708', '00000000-0000-0000-0000-000000002808', '00000000-0000-0000-0000-000000002601', 'departure', '00000000-0000-0000-0000-000000002617', 'pending_payment', 'created', NULL, 'active'),
  ('dep-owner-b', '00000000-0000-0000-0000-000000002709', '00000000-0000-0000-0000-000000002809', '00000000-0000-0000-0000-000000002602', 'departure', '00000000-0000-0000-0000-000000002617', 'pending_payment', 'created', NULL, 'active'),
  ('dep-guide', '00000000-0000-0000-0000-000000002710', '00000000-0000-0000-0000-000000002810', '00000000-0000-0000-0000-000000002603', 'departure', '00000000-0000-0000-0000-000000002617', 'pending_payment', 'created', NULL, 'active'),
  ('dep-admin', '00000000-0000-0000-0000-000000002711', '00000000-0000-0000-0000-000000002811', '00000000-0000-0000-0000-000000002604', 'departure', '00000000-0000-0000-0000-000000002617', 'pending_payment', 'created', NULL, 'active'),
  ('quote-main', '00000000-0000-0000-0000-000000002712', '00000000-0000-0000-0000-000000002812', '00000000-0000-0000-0000-000000002601', 'quote', '00000000-0000-0000-0000-000000002651', 'pending_payment', 'created', NULL, NULL),
  ('quote-expired', '00000000-0000-0000-0000-000000002713', '00000000-0000-0000-0000-000000002813', '00000000-0000-0000-0000-000000002601', 'quote', '00000000-0000-0000-0000-000000002652', 'pending_payment', 'created', NULL, NULL),
  ('legacy-approved', '00000000-0000-0000-0000-000000002714', '00000000-0000-0000-0000-000000002814', '00000000-0000-0000-0000-000000002601', 'departure', '00000000-0000-0000-0000-000000002617', 'cancelled', 'compensated', NULL, 'released'),
  ('legacy-pending', '00000000-0000-0000-0000-000000002715', '00000000-0000-0000-0000-000000002815', '00000000-0000-0000-0000-000000002601', 'departure', '00000000-0000-0000-0000-000000002617', 'pending_payment', 'created', NULL, 'active'),
  ('legacy-rejected', '00000000-0000-0000-0000-000000002716', '00000000-0000-0000-0000-000000002816', '00000000-0000-0000-0000-000000002601', 'departure', '00000000-0000-0000-0000-000000002617', 'pending_payment', 'created', NULL, 'active'),
  ('qa-unregistered', '00000000-0000-0000-0000-000000002717', '00000000-0000-0000-0000-000000002817', '00000000-0000-0000-0000-000000002601', 'departure', '00000000-0000-0000-0000-000000002618', 'pending_payment', 'created', NULL, 'active');

INSERT INTO public.bookings (
  id, owner_user_id, source_kind, source_id, departure_id, quote_id, status,
  tour_version_id, title_en, title_vi, cancellation_policy, catalog_snapshot_id,
  travel_snapshot_id, per_person_vnd_minor, total_vnd_minor, checkout_currency,
  checkout_amount_minor, party_size, language, meeting_point, created_at, hold_expires_at
)
SELECT
  booking_id, owner_user_id, source_kind, source_id,
  CASE WHEN source_kind = 'departure' THEN source_id END,
  CASE WHEN source_kind = 'quote' THEN source_id END,
  booking_status,
  CASE WHEN source_kind = 'departure' THEN '00000000-0000-0000-0000-000000002616'::uuid END,
  'Cancellation booking', 'Don huy', 'Cancellation fixture',
  '00000000-0000-0000-0000-000000002611', '00000000-0000-0000-0000-000000002614',
  CASE WHEN source_kind = 'departure' THEN 125000 END,
  CASE WHEN source_kind = 'departure' THEN 125000 ELSE 100000 END,
  'vnd', CASE WHEN source_kind = 'departure' THEN 125000 ELSE 100000 END,
  1, 'en', 'Runtime gate', statement_timestamp(), statement_timestamp() + interval '35 minutes'
FROM cancellation_fixtures;

INSERT INTO private.checkout_attempts (
  id, booking_id, owner_user_id, source_kind, departure_id, quote_id,
  provider_idempotency_key, status, provider_session_id, provider_expires_at
)
SELECT
  attempt_id, booking_id, owner_user_id, source_kind,
  CASE WHEN source_kind = 'departure' THEN source_id END,
  CASE WHEN source_kind = 'quote' THEN source_id END,
  'localens:stripe-checkout:v1:' || attempt_id::text,
  attempt_status, provider_session_id,
  CASE WHEN provider_session_id IS NOT NULL THEN clock_timestamp() + interval '30 minutes' END
FROM cancellation_fixtures;

INSERT INTO private.checkout_idempotency (
  id, owner_user_id, idempotency_key, canonical_request_hash,
  booking_id, checkout_attempt_id, provider_idempotency_key
)
SELECT
  ('10000000-0000-0000-0000-' || right(booking_id::text, 12))::uuid,
  owner_user_id,
  CASE
    WHEN label = 'dep-main' THEN 'thesis-demo:v2:qa-02:booking'
    ELSE 'checkout-' || label
  END,
  repeat('c', 64), booking_id, attempt_id,
  'localens:stripe-checkout:v1:' || attempt_id::text
FROM cancellation_fixtures;

INSERT INTO private.capacity_holds (
  id, booking_id, departure_id, party_size, status, created_at, expires_at, released_at
)
SELECT
  ('20000000-0000-0000-0000-' || right(booking_id::text, 12))::uuid,
  booking_id, source_id, 1, hold_status, statement_timestamp(),
  statement_timestamp() + interval '35 minutes',
  CASE WHEN hold_status = 'released' THEN statement_timestamp() END
FROM cancellation_fixtures
WHERE source_kind = 'departure';

INSERT INTO public.payments (
  booking_id, attempt_id, owner_user_id, provider_session_id,
  provider_payment_intent_id, provider_account_id, provider_endpoint_id,
  mode, amount_minor, currency, status
)
SELECT booking_id, attempt_id, owner_user_id, 'cs_real_authority', 'pi_real_authority',
  'acct_localens_test', 'we_localens_test', 'payment', 125000, 'vnd', 'pending'
FROM cancellation_fixtures WHERE label = 'dep-real-payment';

INSERT INTO private.thesis_demo_qa_slots (
  slot_id, dataset_version, terminal_flow, owner_user_id, departure_id,
  max_party_size, booking_id, checkout_attempt_id, checkout_idempotency_id,
  capacity_hold_id, simulated_payment_id, cancellation_id,
  booking_idempotency_key, payment_idempotency_key,
  cancellation_idempotency_key, recommend_operation_id, refine_operation_id
)
VALUES (
  'qa-02', 'thesis-demo.v2', 'cancellation',
  '00000000-0000-0000-0000-000000002601',
  '00000000-0000-0000-0000-000000002618',
  2,
  '00000000-0000-0000-0000-000000002701',
  '00000000-0000-0000-0000-000000002801',
  '10000000-0000-0000-0000-000000002701',
  '20000000-0000-0000-0000-000000002701',
  '00000000-0000-0000-0000-000000002905',
  '00000000-0000-0000-0000-000000002906',
  'thesis-demo:v2:qa-02:booking',
  'thesis-demo:v2:qa-02:payment',
  'thesis-demo:v2:qa-02:cancel',
  '00000000-0000-0000-0000-000000002907',
  '00000000-0000-0000-0000-000000002908'
);

SELECT ok(to_regclass('private.booking_cancellations') IS NOT NULL, 'immutable booking cancellation table exists');
SELECT ok(to_regclass('public.customer_booking_cancellations_v') IS NOT NULL, 'customer cancellation projection exists');
SELECT ok(to_regclass('public.admin_booking_cancellations_v') IS NOT NULL, 'administrator cancellation projection exists');
SELECT ok(to_regclass('public.admin_booking_management_v') IS NOT NULL, 'administrator booking management projection exists');
SELECT is(
  (SELECT string_agg(column_name, ',' ORDER BY ordinal_position)
   FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'admin_booking_management_v'),
  'booking_id,customer_user_id,source_kind,title_en,title_vi,booking_status,created_at,cancellation_id,cancellation_reason_code,cancellation_other_reason,cancellation_idempotency_key,cancelled_at',
  'administrator booking management projection exposes exactly the bounded read model'
);
SELECT ok(
  COALESCE((
    SELECT pg_get_userbyid(relowner) = 'localens_cancellation_admin_projection_owner'
      AND reloptions @> ARRAY['security_barrier=true', 'security_invoker=false']
    FROM pg_class WHERE oid = to_regclass('public.admin_booking_management_v')
  ), false),
  'administrator booking management projection is a barrier owned by the no-login projection role'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.admin_booking_management_v', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.admin_booking_management_v', 'SELECT')
    AND NOT has_table_privilege('service_role', 'public.admin_booking_management_v', 'SELECT'),
  'only authenticated browser sessions receive projection select'
);
SELECT ok(
  (SELECT array_agg(schemaname || '.' || tablename || '.' || policyname ORDER BY schemaname, tablename, policyname)
   FROM pg_policies
   WHERE roles = ARRAY['localens_cancellation_admin_projection_owner']::name[])
    = ARRAY[
      'private.booking_cancellations.booking_cancellations_admin_projection_select',
      'private.user_roles.user_roles_cancellation_admin_projection_select',
      'public.bookings.bookings_cancellation_admin_projection_select'
    ],
  'projection owner has only the three bounded select policies required by the view'
);
SELECT is(
  (SELECT string_agg(column_name, ',' ORDER BY column_name)
   FROM information_schema.column_privileges
   WHERE grantee = 'localens_cancellation_admin_projection_owner'
     AND table_schema = 'public' AND table_name = 'bookings' AND privilege_type = 'SELECT'),
  'created_at,id,owner_user_id,source_kind,status,title_en,title_vi',
  'projection owner receives exactly the required booking columns'
);
SELECT is(
  (SELECT jsonb_object_agg(table_name, columns)
   FROM (
     SELECT table_schema || '.' || table_name AS table_name,
       string_agg(column_name, ',' ORDER BY column_name) AS columns
     FROM information_schema.column_privileges
     WHERE grantee = 'localens_cancellation_admin_projection_owner'
       AND privilege_type = 'SELECT'
       AND (table_schema, table_name) IN (('private', 'booking_cancellations'), ('private', 'user_roles'))
     GROUP BY table_schema, table_name
   ) AS exact_privileges),
  jsonb_build_object(
    'private.booking_cancellations', 'booking_id,cancelled_at,customer_user_id,id,other_reason,reason_code,request_idempotency_key,source_kind',
    'private.user_roles', 'role,user_id'
  ),
  'projection owner receives exactly the required cancellation and role columns'
);
SELECT ok(
  NOT has_any_column_privilege('localens_cancellation_admin_projection_owner', 'public.profiles', 'SELECT')
    AND NOT has_table_privilege('localens_cancellation_admin_projection_owner', 'public.bookings', 'INSERT')
    AND NOT has_table_privilege('localens_cancellation_admin_projection_owner', 'public.bookings', 'UPDATE')
    AND NOT has_table_privilege('localens_cancellation_admin_projection_owner', 'public.bookings', 'DELETE')
    AND NOT has_table_privilege('localens_cancellation_admin_projection_owner', 'private.booking_cancellations', 'INSERT')
    AND NOT has_table_privilege('localens_cancellation_admin_projection_owner', 'private.booking_cancellations', 'UPDATE')
    AND NOT has_table_privilege('localens_cancellation_admin_projection_owner', 'private.booking_cancellations', 'DELETE')
    AND NOT has_table_privilege('authenticated', 'public.bookings', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.bookings', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.bookings', 'DELETE'),
  'projection and browser roles have no unused profile read or booking/cancellation DML'
);
SELECT has_function('public', 'cancel_booking', ARRAY['uuid', 'text', 'text', 'text']);
SELECT ok(
  (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'private.booking_cancellations'::regclass),
  'booking cancellations force RLS'
);
SELECT ok(
  NOT has_table_privilege('anon', 'private.booking_cancellations', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'private.booking_cancellations', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'private.booking_cancellations', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'private.booking_cancellations', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'private.booking_cancellations', 'DELETE'),
  'browser roles have no cancellation fact access'
);
SELECT ok(
  has_column_privilege('localens_cancellation_guard_owner', 'public.bookings', 'id', 'SELECT')
    AND has_column_privilege('localens_cancellation_guard_owner', 'public.bookings', 'source_kind', 'SELECT')
    AND EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'bookings'
        AND policyname = 'bookings_cancellation_guard_select'
        AND roles = ARRAY['localens_cancellation_guard_owner']::name[]
    ),
  'approved legacy backfill has bounded booking routing read authority'
);
SELECT is(
  (SELECT string_agg(column_name, ',' ORDER BY ordinal_position)
   FROM information_schema.columns WHERE table_schema = 'private' AND table_name = 'booking_cancellations'),
  'id,booking_id,customer_user_id,source_kind,reason_code,other_reason,request_idempotency_key,cancelled_at',
  'private fact stores only the bounded cancellation authority'
);
SELECT is(
  (SELECT string_agg(column_name, ',' ORDER BY ordinal_position)
   FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customer_booking_cancellations_v'),
  'id,booking_id,customer_user_id,source_kind,reason_code,other_reason,idempotency_key,cancelled_at',
  'customer projection exposes exactly the sanitized fact'
);
SELECT is(
  (SELECT string_agg(column_name, ',' ORDER BY ordinal_position)
   FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'admin_booking_cancellations_v'),
  'id,booking_id,customer_user_id,source_kind,reason_code,other_reason,idempotency_key,cancelled_at',
  'administrator projection exposes exactly the sanitized fact'
);
SELECT ok(
  (SELECT prosecdef AND proconfig @> ARRAY['search_path=""'] AND proconfig @> ARRAY['statement_timeout=5s']
   FROM pg_proc WHERE oid = 'public.cancel_booking(uuid,text,text,text)'::regprocedure),
  'cancel_booking is a bounded security definer'
);
SELECT is(
  (SELECT rolname FROM pg_roles JOIN pg_proc ON pg_roles.oid = pg_proc.proowner
   WHERE pg_proc.oid = 'public.cancel_booking(uuid,text,text,text)'::regprocedure),
  'localens_cancellation_customer_rpc_owner',
  'cancel_booking has the least-privilege customer owner'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.request_fixed_tour_cancellation(uuid,text,text)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.decide_fixed_tour_cancellation(uuid,text,text,text)', 'EXECUTE'),
  'legacy request and decision APIs are revoked'
);
SELECT ok(
  to_regclass('public.customer_fixed_tour_cancellation_requests_v') IS NULL
    AND to_regclass('public.admin_fixed_tour_cancellation_queue_v') IS NULL,
  'legacy request projections are removed from the exposed schema'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'private.fixed_tour_cancellation_requests', 'SELECT')
    AND NOT has_table_privilege('localens_cancellation_customer_rpc_owner', 'private.fixed_tour_cancellation_requests', 'SELECT')
    AND NOT has_table_privilege('localens_cancellation_admin_rpc_owner', 'private.fixed_tour_cancellation_requests', 'SELECT'),
  'legacy table is an inaccessible private archive'
);

SELECT set_config('localens.expected_admin_booking_count', (SELECT count(*)::text FROM public.bookings), true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002601', 'role', 'authenticated')::text, true);
SELECT is((SELECT count(*)::integer FROM public.admin_booking_management_v), 0, 'customer sees no administrator booking rows');

SELECT throws_ok(
  $$SELECT * FROM public.cancel_booking('00000000-0000-0000-0000-000000002701', 'unknown_reason', NULL, 'bad-reason')$$,
  '22023', 'cancellation input rejected', 'unknown reason code is rejected'
);
SELECT throws_ok(
  $$SELECT * FROM public.cancel_booking('00000000-0000-0000-0000-000000002701', NULL, 'unexpected', 'bad-null-pair')$$,
  '22023', 'cancellation input rejected', 'optional null reason forbids other text'
);
SELECT throws_ok(
  $$SELECT * FROM public.cancel_booking('00000000-0000-0000-0000-000000002701', 'trip_plan_changed', 'unexpected', 'bad-standard-pair')$$,
  '22023', 'cancellation input rejected', 'standard reason forbids other text'
);
SELECT throws_ok(
  $$SELECT * FROM public.cancel_booking('00000000-0000-0000-0000-000000002701', 'other', ' x ', 'bad-other-pair')$$,
  '22023', 'cancellation input rejected', 'other reason requires trimmed text of at least three characters'
);
SELECT throws_ok(
  $$SELECT * FROM public.cancel_booking('00000000-0000-0000-0000-000000002701', 'other', E'bad\ntext', 'bad-control-pair')$$,
  '22023', 'cancellation input rejected', 'other reason rejects control characters'
);
SELECT throws_ok(
  format(
    $query$SELECT * FROM public.cancel_booking('00000000-0000-0000-0000-000000002706', %L, NULL, %L)$query$,
    reason_code,
    'accepted-standard-' || ordinality
  ),
  'P0001',
  'cancellation unavailable',
  format('standard reason code %s is accepted', reason_code)
)
FROM unnest(ARRAY[
  'trip_plan_changed',
  'wrong_tour_or_departure',
  'booking_details_change',
  'tour_details_unsuitable',
  'price_unsuitable',
  'payment_unavailable'
]::text[]) WITH ORDINALITY AS accepted_reasons(reason_code, ordinality);
SELECT throws_ok(
  format(
    $query$SELECT * FROM public.cancel_booking('00000000-0000-0000-0000-000000002706', 'other', %L, %L)$query$,
    repeat('x', reason_length),
    'accepted-other-' || reason_length
  ),
  'P0001',
  'cancellation unavailable',
  format('other reason length %s is accepted', reason_length)
)
FROM unnest(ARRAY[3, 500]) AS accepted_lengths(reason_length);
SELECT throws_ok(
  format(
    $query$SELECT * FROM public.cancel_booking('00000000-0000-0000-0000-000000002706', 'other', %L, %L)$query$,
    repeat('x', reason_length),
    'rejected-other-' || reason_length
  ),
  '22023',
  'cancellation input rejected',
  format('other reason length %s is rejected', reason_length)
)
FROM unnest(ARRAY[2, 501]) AS rejected_lengths(reason_length);

SELECT ok(
  (SELECT id = '00000000-0000-0000-0000-000000002906'::uuid
      AND booking_status = 'cancelled' AND state = 'created' AND reason_code = 'trip_plan_changed'
   FROM public.cancel_booking('00000000-0000-0000-0000-000000002701', 'trip_plan_changed', NULL, 'thesis-demo:v2:qa-02:cancel')),
  'customer cancellation uses the reserved deterministic identifier and standard reason'
);
SELECT ok(
  (SELECT booking_status = 'cancelled' AND state = 'created' AND reason_code IS NULL AND other_reason IS NULL
   FROM public.cancel_booking('00000000-0000-0000-0000-000000002702', NULL, NULL, 'cancel-dep-optional')),
  'customer cancels with no reason'
);
SELECT is(
  (SELECT state FROM public.cancel_booking('00000000-0000-0000-0000-000000002701', 'trip_plan_changed', NULL, 'thesis-demo:v2:qa-02:cancel')),
  'replayed', 'exact actor key booking and reason replay returns the immutable event'
);
SELECT throws_ok(
  $$SELECT * FROM public.cancel_booking('00000000-0000-0000-0000-000000002701', 'payment_unavailable', NULL, 'thesis-demo:v2:qa-02:cancel')$$,
  'P0001', 'IDEMPOTENCY_CONFLICT', 'changed payload under the same key conflicts'
);
SELECT throws_ok(
  $$SELECT * FROM public.cancel_booking('00000000-0000-0000-0000-000000002701', 'trip_plan_changed', NULL, 'cancel-dep-other-key')$$,
  '22023', 'THESIS_DEMO_QA_SLOT_MISMATCH', 'registered booking rejects a non-slot cancellation key before mutation'
);
SELECT throws_ok(
  $$SELECT * FROM public.cancel_booking(
    '00000000-0000-0000-0000-000000002717',
    'trip_plan_changed',
    NULL,
    'unregistered-qa-cancel'
  )$$,
  '22023', 'THESIS_DEMO_QA_SLOT_MISMATCH',
  'unregistered booking on a registry-backed departure is rejected before cancellation mutation'
);
RESET ROLE;
SELECT is(
  (SELECT count(*)::integer FROM private.booking_cancellations
   WHERE booking_id = '00000000-0000-0000-0000-000000002717'::uuid),
  0,
  'rejected unregistered QA booking creates no cancellation row'
);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-0000-0000-000000002601',
  'role', 'authenticated'
)::text, true);
SELECT is(
  (SELECT id FROM public.cancel_booking(
    '00000000-0000-0000-0000-000000002701',
    'trip_plan_changed',
    NULL,
    'thesis-demo:v2:qa-02:cancel'
  )),
  '00000000-0000-0000-0000-000000002906'::uuid,
  'registered cancellation key mismatch leaves the original durable result replayable'
);
SELECT throws_ok(
  $$SELECT * FROM public.cancel_booking('00000000-0000-0000-0000-000000002703', 'trip_plan_changed', NULL, 'thesis-demo:v2:qa-02:cancel')$$,
  'P0001', 'IDEMPOTENCY_CONFLICT', 'same actor key reused for another booking conflicts'
);
SELECT ok(
  (SELECT booking_status = 'cancelled' AND state = 'created' AND source_kind = 'quote'
      AND reason_code = 'other' AND other_reason = 'Schedule changed'
   FROM public.cancel_booking('00000000-0000-0000-0000-000000002712', 'other', 'Schedule changed', 'cancel-quote-main')),
  'customer cancels an owned personalized quote booking'
);
SELECT throws_ok(
  $$SELECT * FROM public.cancel_booking('00000000-0000-0000-0000-000000002713', NULL, NULL, 'cancel-quote-expired')$$,
  'P0001', 'cancellation unavailable', 'expired quote cannot be cancelled'
);
SELECT throws_ok(
  $$SELECT * FROM public.cancel_booking('00000000-0000-0000-0000-000000002706', NULL, NULL, 'cancel-terminal')$$,
  'P0001', 'cancellation unavailable', 'non-pending terminal booking cannot be cancelled'
);
SELECT throws_ok(
  $$SELECT * FROM public.cancel_booking('00000000-0000-0000-0000-000000002707', NULL, NULL, 'cancel-provider')$$,
  'P0001', 'cancellation unavailable', 'provider session authority blocks cancellation'
);
SELECT throws_ok(
  $$SELECT * FROM public.cancel_booking('00000000-0000-0000-0000-000000002708', NULL, NULL, 'cancel-real-payment')$$,
  'P0001', 'cancellation unavailable', 'real payment row blocks cancellation'
);
SELECT ok(
  (SELECT payment_status = 'paid' FROM public.complete_simulated_fixed_tour_payment('00000000-0000-0000-0000-000000002705', 'payment-before-cancel')),
  'simulated payment fixture terminalizes before cancellation'
);
SELECT throws_ok(
  $$SELECT * FROM public.cancel_booking('00000000-0000-0000-0000-000000002705', NULL, NULL, 'cancel-after-simulation')$$,
  'P0001', 'cancellation unavailable', 'simulated receipt blocks cancellation'
);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002602', 'role', 'authenticated')::text, true);
SELECT throws_ok(
  $$SELECT * FROM public.cancel_booking('00000000-0000-0000-0000-000000002704', NULL, NULL, 'cancel-cross-owner')$$,
  '42501', 'cancellation unavailable', 'cross-owner customer is denied'
);
SELECT is((SELECT count(*)::integer FROM public.customer_booking_cancellations_v), 0, 'cross-owner customer sees no cancellations');
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002603', 'role', 'authenticated')::text, true);
SELECT throws_ok(
  $$SELECT * FROM public.cancel_booking('00000000-0000-0000-0000-000000002710', NULL, NULL, 'cancel-guide')$$,
  '42501', 'cancellation customer role required', 'guide cannot cancel a booking'
);
SELECT is((SELECT count(*)::integer FROM public.customer_booking_cancellations_v), 0, 'guide sees no customer cancellation facts');
SELECT is((SELECT count(*)::integer FROM public.admin_booking_cancellations_v), 0, 'guide sees no administrator cancellation facts');
SELECT is((SELECT count(*)::integer FROM public.admin_booking_management_v), 0, 'guide sees no administrator booking rows');
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002604', 'role', 'authenticated')::text, true);
SELECT throws_ok(
  $$SELECT * FROM public.cancel_booking('00000000-0000-0000-0000-000000002711', NULL, NULL, 'cancel-admin')$$,
  '42501', 'cancellation customer role required', 'administrator cannot use the customer mutation'
);
SELECT ok((SELECT count(*) >= 3 FROM public.admin_booking_cancellations_v), 'exact administrator sees cancellation history');
SELECT is(
  (SELECT count(*)::integer FROM public.admin_booking_management_v),
  current_setting('localens.expected_admin_booking_count')::integer,
  'exact administrator sees every booking'
);
SELECT results_eq(
  $$SELECT booking_id, booking_status::text, cancellation_id IS NOT NULL
    FROM public.admin_booking_management_v
    WHERE booking_id IN (
      '00000000-0000-0000-0000-000000002701',
      '00000000-0000-0000-0000-000000002703'
    ) ORDER BY booking_id$$,
  $$VALUES
    ('00000000-0000-0000-0000-000000002701'::uuid, 'cancelled'::text, true),
    ('00000000-0000-0000-0000-000000002703'::uuid, 'pending_payment'::text, false)$$,
  'administrator booking management left join returns cancelled and non-cancelled rows'
);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002605', 'role', 'authenticated')::text, true);
SELECT is((SELECT count(*)::integer FROM public.admin_booking_cancellations_v), 0, 'mixed customer administrator is not exact administrator');
SELECT is((SELECT count(*)::integer FROM public.admin_booking_management_v), 0, 'mixed customer administrator sees no administrator booking rows');
RESET ROLE;

SELECT results_eq(
  $$SELECT bookings.status::text, holds.status::text, attempts.status
    FROM public.bookings AS bookings
    JOIN private.capacity_holds AS holds ON holds.booking_id = bookings.id
    JOIN private.checkout_attempts AS attempts ON attempts.booking_id = bookings.id
    WHERE bookings.id = '00000000-0000-0000-0000-000000002701'$$,
  $$VALUES ('cancelled'::text, 'released'::text, 'compensated'::text)$$,
  'departure cancellation atomically releases hold and compensates attempt'
);
SELECT results_eq(
  $$SELECT bookings.status::text, quotes.status::text, attempts.status
    FROM public.bookings AS bookings
    JOIN public.custom_quotes AS quotes ON quotes.id = bookings.quote_id
    JOIN private.checkout_attempts AS attempts ON attempts.booking_id = bookings.id
    WHERE bookings.id = '00000000-0000-0000-0000-000000002712'$$,
  $$VALUES ('cancelled'::text, 'revoked'::text, 'compensated'::text)$$,
  'quote cancellation atomically revokes quote and compensates attempt'
);

SELECT throws_ok(
  $$UPDATE private.booking_cancellations SET reason_code = 'payment_unavailable' WHERE booking_id = '00000000-0000-0000-0000-000000002701'$$,
  '42501', 'booking cancellations are immutable', 'cancellation facts reject updates'
);
SELECT throws_ok(
  $$DELETE FROM private.booking_cancellations WHERE booking_id = '00000000-0000-0000-0000-000000002701'$$,
  '42501', 'booking cancellations are immutable', 'cancellation facts reject deletes'
);
SELECT throws_ok(
  $$TRUNCATE private.booking_cancellations$$,
  '42501', 'booking cancellations are immutable', 'cancellation facts reject truncation'
);
SELECT throws_ok(
  $$INSERT INTO public.payments (
      booking_id, attempt_id, owner_user_id, provider_session_id,
      provider_payment_intent_id, provider_account_id, provider_endpoint_id,
      mode, amount_minor, currency, status
    ) VALUES (
      '00000000-0000-0000-0000-000000002701', '00000000-0000-0000-0000-000000002801',
      '00000000-0000-0000-0000-000000002601', 'cs_after_cancel', 'pi_after_cancel',
      'acct_localens_test', 'we_localens_test', 'payment', 125000, 'vnd', 'pending'
    )$$,
  'P0001', 'CANCELLATION_EXISTS', 'real payment insert is rejected after cancellation'
);
SELECT throws_ok(
  $$INSERT INTO private.simulated_payment_receipts (
      booking_id, owner_user_id, checkout_attempt_id, idempotency_key,
      result_booking_status, result_payment_status, amount_minor, currency, simulated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000002701', '00000000-0000-0000-0000-000000002601',
      '00000000-0000-0000-0000-000000002801', 'simulation-after-cancel',
      'confirmed', 'paid', 125000, 'vnd', clock_timestamp()
    )$$,
  'P0001', 'CANCELLATION_EXISTS', 'simulated receipt insert is rejected after cancellation'
);

INSERT INTO private.fixed_tour_cancellation_requests (
  id, booking_id, owner_user_id, checkout_attempt_id, reason,
  request_idempotency_key, requested_at, status, decision_note, decided_by,
  decision_idempotency_key, decision_booking_status, decided_at
)
VALUES
  ('00000000-0000-0000-0000-000000002901', '00000000-0000-0000-0000-000000002714', '00000000-0000-0000-0000-000000002601', '00000000-0000-0000-0000-000000002814', 'Legacy approved reason', 'legacy-approved-key', clock_timestamp() - interval '1 day', 'approved', 'Approved before migration', '00000000-0000-0000-0000-000000002604', 'legacy-approved-decision', 'cancelled', clock_timestamp() - interval '12 hours'),
  ('00000000-0000-0000-0000-000000002902', '00000000-0000-0000-0000-000000002715', '00000000-0000-0000-0000-000000002601', '00000000-0000-0000-0000-000000002815', 'Legacy pending reason', 'legacy-pending-key', clock_timestamp() - interval '1 day', 'pending', NULL, NULL, NULL, NULL, NULL),
  ('00000000-0000-0000-0000-000000002903', '00000000-0000-0000-0000-000000002716', '00000000-0000-0000-0000-000000002601', '00000000-0000-0000-0000-000000002816', 'Legacy rejected reason', 'legacy-rejected-key', clock_timestamp() - interval '1 day', 'rejected', 'Rejected before migration', '00000000-0000-0000-0000-000000002604', 'legacy-rejected-decision', 'pending_payment', clock_timestamp() - interval '12 hours');
SELECT is(private.backfill_approved_booking_cancellations(), 1, 'only approved legacy rows are backfilled');
SELECT results_eq(
  $$SELECT source_kind, reason_code, other_reason, request_idempotency_key
    FROM private.booking_cancellations
    WHERE booking_id = '00000000-0000-0000-0000-000000002714'$$,
  $$VALUES ('departure'::text, 'other'::text, 'Legacy approved reason'::text, 'legacy-approved-key'::text)$$,
  'approved legacy row becomes one immutable cancellation fact'
);
SELECT results_eq(
  $$SELECT label, bookings.status::text
    FROM cancellation_fixtures
    JOIN public.bookings AS bookings ON bookings.id = cancellation_fixtures.booking_id
    WHERE label IN ('legacy-pending', 'legacy-rejected') ORDER BY label$$,
  $$VALUES ('legacy-pending'::text, 'pending_payment'::text), ('legacy-rejected'::text, 'pending_payment'::text)$$,
  'pending and rejected legacy rows do not change bookings'
);
SELECT is(
  (SELECT count(*)::integer FROM private.booking_cancellations
   WHERE booking_id IN ('00000000-0000-0000-0000-000000002715', '00000000-0000-0000-0000-000000002716')),
  0, 'pending and rejected legacy rows do not create cancellation facts'
);
SELECT throws_ok(
  $$UPDATE private.fixed_tour_cancellation_requests SET decision_note = 'changed' WHERE id = '00000000-0000-0000-0000-000000002901'$$,
  '42501', 'legacy cancellation archive is immutable', 'legacy archive rejects updates'
);

SELECT * FROM finish();
ROLLBACK;
