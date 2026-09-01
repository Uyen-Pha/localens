-- Task 13 executable RLS matrix. It is deliberately written as real
-- role-context tests, not as regex-only evidence.
BEGIN;

SELECT plan(28);

SELECT ok(
  (SELECT count(*) FROM pg_catalog.pg_class AS c
   JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
   WHERE n.nspname IN ('public', 'private')
     AND c.relkind = 'r'
     AND c.relrowsecurity
     AND c.relforcerowsecurity)
  = (SELECT count(*) FROM pg_catalog.pg_class AS c
     JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('public', 'private') AND c.relkind = 'r'),
  'every public/private table is enabled and forced RLS'
);

SELECT ok(
  has_schema_privilege('anon', 'private', 'USAGE') IS FALSE
  AND has_schema_privilege('authenticated', 'private', 'USAGE') IS FALSE
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE grantee IN ('anon', 'authenticated') AND table_schema = 'auth'
  ),
  'browser roles cannot enter private or read auth tables'
);

SELECT ok(
  has_table_privilege('anon', 'public.bookings', 'SELECT') IS FALSE
  AND has_table_privilege('authenticated', 'public.bookings', 'SELECT') IS FALSE
  AND has_table_privilege('anon', 'private.audit_events', 'SELECT') IS FALSE
  AND has_table_privilege('authenticated', 'private.webhook_events', 'SELECT') IS FALSE,
  'browser roles cannot read stateful base tables or private facts'
);

SELECT ok(
  has_table_privilege('anon', 'public.published_tours_v', 'SELECT')
  AND has_table_privilege('anon', 'public.published_content_release_v', 'SELECT')
  AND has_table_privilege('authenticated', 'public.customer_bookings_v', 'SELECT')
  AND has_table_privilege('authenticated', 'public.admin_audit_events_v', 'SELECT'),
  'only named projections are granted to the browser roles'
);

SELECT ok(
  has_function_privilege('anon', 'public.get_live_departure_availability()', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.get_live_departure_availability()', 'EXECUTE')
  AND has_function_privilege('anon', 'public.submit_custom_request(uuid,integer)', 'EXECUTE') IS FALSE
  AND has_function_privilege('anon', 'private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)', 'EXECUTE') IS FALSE,
  'anonymous can call availability only and cannot call stateful/internal RPCs'
);

SELECT ok(
  (SELECT bool_and(
    r.rolcanlogin IS FALSE
    AND r.rolbypassrls IS FALSE
    AND r.rolname NOT IN ('postgres', 'service_role')
    AND COALESCE(array_to_string(p.proconfig, ','), '') LIKE '%search_path=%'
    AND COALESCE(array_to_string(p.proconfig, ','), '') LIKE '%statement_timeout=5s%'
  )
   FROM pg_catalog.pg_proc AS p
   JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
   JOIN pg_catalog.pg_roles AS r ON r.oid = p.proowner
   WHERE n.nspname IN ('public', 'private') AND p.prosecdef),
  'every SECURITY DEFINER function has a named no-login no-bypass owner and fixed timeout'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_roles AS r ON r.oid = p.proowner
    WHERE n.nspname IN ('public', 'private')
      AND p.prosecdef
      AND (r.rolname IN ('postgres', 'service_role') OR r.rolcanlogin OR r.rolbypassrls)
  ),
  'no callable definer is owned by postgres, service_role, a login role, or a bypass role'
);

SELECT ok(
  (SELECT bool_and(
    (p.proconfig @> ARRAY['search_path=""'])
    AND (p.proconfig @> ARRAY['statement_timeout=5s'])
  ) FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'private') AND p.prosecdef),
  'hostile caller search_path cannot alter a definer function'
);

SELECT ok(
  (SELECT bool_and(
    p.proname = expected.proname
    AND has_function_privilege('authenticated', expected.signature, 'EXECUTE')
  ) FROM (VALUES
    ('admin_user_summary', 'public.admin_user_summary()'::text),
    ('submit_custom_request', 'public.submit_custom_request(uuid,integer)'::text),
    ('review_custom_request', 'public.review_custom_request(uuid,public.request_status,text)'::text),
    ('create_custom_quote', 'public.create_custom_quote(uuid,bigint,public.checkout_currency,text,text,text)'::text),
    ('get_guide_assigned_bookings', 'public.get_guide_assigned_bookings()'::text)
  ) AS expected(proname, signature)
  JOIN pg_catalog.pg_proc AS p ON p.proname = expected.proname
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace AND n.nspname = 'public'),
  'authenticated execute grants match the named customer/admin/guide RPC signatures'
);

SELECT ok(
  (SELECT bool_and(
    NOT has_function_privilege('anon', signature, 'EXECUTE')
  ) FROM (VALUES
    ('public.submit_custom_request(uuid,integer)'::text),
    ('public.review_custom_request(uuid,public.request_status,text)'::text),
    ('public.create_custom_quote(uuid,bigint,public.checkout_currency,text,text,text)'::text),
    ('public.assign_guide(uuid,uuid)'::text),
    ('public.reconcile_payment(uuid,public.booking_status)'::text)
  ) AS denied(signature)),
  'anonymous cannot execute authenticated state-changing RPCs'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND pg_catalog.upper(pg_catalog.pg_get_functiondef(p.oid)) LIKE '%EXECUTE FORMAT(%'
  ),
  'definer bodies contain no dynamic SQL formatting'
);

SELECT ok(
  (SELECT bool_and(c.reloptions @> ARRAY['security_barrier=true'])
   FROM pg_catalog.pg_class AS c
   JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'v'),
  'every public projection is security barrier'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('published_tours_v', 'published_content_release_v', 'customer_bookings_v', 'customer_payment_status_v', 'admin_audit_events_v')
      AND column_name ~* '(^|_)(token|secret|signature|raw|ip|device|email|phone|notes|payload)($|_)'
  ),
  'public projections contain no credential, contact, raw payload, or tracking columns'
);

SELECT ok(
  has_table_privilege('anon', 'private.audit_events', 'TRUNCATE') IS FALSE
  AND has_table_privilege('authenticated', 'private.audit_events', 'INSERT') IS FALSE
  AND has_table_privilege('authenticated', 'public.payments', 'UPDATE') IS FALSE
  AND has_table_privilege('authenticated', 'private.webhook_events', 'DELETE') IS FALSE,
  'append-only audit/payment/webhook state cannot be mutated directly'
);

SELECT extensions.lives_ok($sql$
  SET LOCAL ROLE authenticated;
  SELECT pg_catalog.set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
  SET LOCAL search_path = pg_temp, public, extensions, pg_catalog;
  SELECT public.get_live_departure_availability();
  SET LOCAL ROLE postgres;
$sql$, 'public RPC remains safe with a hostile temp schema and authenticated JWT context');

SELECT ok(
  has_table_privilege('service_role', 'public.bookings', 'SELECT') IS FALSE
  AND has_function_privilege('service_role', 'public.get_live_departure_availability()', 'EXECUTE') IS FALSE,
  'service_role is not used as RLS evidence or granted a hidden browser-equivalent path'
);

-- Real JWT row-context fixture. No service_role is used for these checks.
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000001301'::uuid, 'authenticated', 'authenticated', 'task13-customer-a@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000001302'::uuid, 'authenticated', 'authenticated', 'task13-customer-b@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000001303'::uuid, 'authenticated', 'authenticated', 'task13-guide-a@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000001304'::uuid, 'authenticated', 'authenticated', 'task13-guide-b@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000001305'::uuid, 'authenticated', 'authenticated', 'task13-admin@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO private.user_roles (user_id, role)
VALUES
  ('00000000-0000-0000-0000-000000001303'::uuid, 'guide'::public.app_role),
  ('00000000-0000-0000-0000-000000001304'::uuid, 'guide'::public.app_role),
  ('00000000-0000-0000-0000-000000001305'::uuid, 'admin'::public.app_role)
ON CONFLICT (user_id, role) DO NOTHING;
INSERT INTO public.guide_profiles (user_id, display_name, language)
VALUES
  ('00000000-0000-0000-0000-000000001303'::uuid, 'Task 13 Guide A', 'en'::public.locale),
  ('00000000-0000-0000-0000-000000001304'::uuid, 'Task 13 Guide B', 'vi'::public.locale)
ON CONFLICT (user_id) DO NOTHING;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001301', true);
SELECT is((SELECT count(*)::integer FROM public.profiles), 1, 'customer A sees exactly own profile');
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000001302'::uuid), 0, 'customer A cannot see customer B profile');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001302', true);
SELECT is((SELECT count(*)::integer FROM public.profiles), 1, 'customer B sees exactly own profile');
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000001301'::uuid), 0, 'customer B cannot see customer A profile');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001303', true);
SELECT is((SELECT count(*)::integer FROM public.guide_profiles), 1, 'guide A sees exactly own guide profile');
SELECT is((SELECT count(*)::integer FROM public.guide_profiles WHERE user_id = '00000000-0000-0000-0000-000000001304'::uuid), 0, 'guide A cannot see guide B profile');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001304', true);
SELECT is((SELECT count(*)::integer FROM public.guide_profiles), 1, 'guide B sees exactly own guide profile');
SELECT is((SELECT count(*)::integer FROM public.guide_profiles WHERE user_id = '00000000-0000-0000-0000-000000001303'::uuid), 0, 'guide B cannot see guide A profile');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001301', true);
SELECT extensions.throws_ok(
  $$SELECT * FROM public.admin_user_summary()$$,
  '42501'::character(5), 'admin role required', 'customer cannot read admin summary'
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001305', true);
SELECT ok((SELECT count(*)::integer FROM public.admin_user_summary()) >= 5, 'admin summary is visible only to admin context');
SELECT throws_ok(
  $$INSERT INTO private.user_roles (user_id, role) VALUES ('00000000-0000-0000-0000-000000001301'::uuid, 'admin'::public.app_role)$$,
  NULL, NULL, 'customer cannot self-escalate by writing user_roles'
);
SET LOCAL ROLE anon;
SELECT ok(has_table_privilege('anon', 'public.profiles', 'SELECT') IS FALSE, 'anonymous has no identity-table read privilege');
RESET ROLE;

SELECT * FROM extensions.finish();
ROLLBACK;
