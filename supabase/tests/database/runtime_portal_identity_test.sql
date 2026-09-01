BEGIN;

SELECT plan(13);

-- Fixed identities keep the owner-only projection deterministic and rollback-safe.
DELETE FROM auth.users
WHERE id IN (
  '00000000-0000-0000-0000-000000002201'::uuid,
  '00000000-0000-0000-0000-000000002202'::uuid,
  '00000000-0000-0000-0000-000000002203'::uuid,
  '00000000-0000-0000-0000-000000002204'::uuid
);

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000002201'::uuid, 'authenticated', 'authenticated', 'portal-customer@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000002202'::uuid, 'authenticated', 'authenticated', 'portal-guide@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000002203'::uuid, 'authenticated', 'authenticated', 'portal-admin@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000002204'::uuid, 'authenticated', 'authenticated', 'portal-ambiguous@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now());

UPDATE public.profiles
SET display_name = fixtures.display_name,
    language = fixtures.language
FROM (VALUES
  ('00000000-0000-0000-0000-000000002201'::uuid, 'Portal Customer'::text, 'vi'::public.locale),
  ('00000000-0000-0000-0000-000000002202'::uuid, 'Portal Guide'::text, 'en'::public.locale),
  ('00000000-0000-0000-0000-000000002203'::uuid, 'Portal Admin'::text, 'vi'::public.locale),
  ('00000000-0000-0000-0000-000000002204'::uuid, 'Portal Ambiguous'::text, 'en'::public.locale)
) AS fixtures(user_id, display_name, language)
WHERE public.profiles.id = fixtures.user_id;

DELETE FROM private.user_roles
WHERE user_id IN (
  '00000000-0000-0000-0000-000000002202'::uuid,
  '00000000-0000-0000-0000-000000002203'::uuid
);

INSERT INTO private.user_roles (user_id, role)
VALUES
  ('00000000-0000-0000-0000-000000002202'::uuid, 'guide'::public.app_role),
  ('00000000-0000-0000-0000-000000002203'::uuid, 'admin'::public.app_role),
  ('00000000-0000-0000-0000-000000002204'::uuid, 'admin'::public.app_role);

SELECT has_function('public', 'get_portal_identity', ARRAY[]::text[]);
SELECT is(
  (SELECT pg_catalog.pg_get_userbyid(functions.proowner)
   FROM pg_catalog.pg_proc AS functions
   JOIN pg_catalog.pg_namespace AS namespaces ON namespaces.oid = functions.pronamespace
   WHERE namespaces.nspname = 'public'
     AND functions.proname = 'get_portal_identity'
     AND functions.pronargs = 0),
  'localens_identity_rpc_owner',
  'portal identity has the hardened identity owner'
);
SELECT ok(
  (SELECT functions.prosecdef
      AND functions.proconfig @> ARRAY['search_path=""']
      AND functions.proconfig @> ARRAY['statement_timeout=5s']
   FROM pg_catalog.pg_proc AS functions
   JOIN pg_catalog.pg_namespace AS namespaces ON namespaces.oid = functions.pronamespace
   WHERE namespaces.nspname = 'public'
     AND functions.proname = 'get_portal_identity'
     AND functions.pronargs = 0),
  'portal identity is SECURITY DEFINER with fixed execution settings'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.get_portal_identity()', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.get_portal_identity()', 'EXECUTE'),
  'only authenticated browser sessions can execute portal identity'
);
SELECT ok(
  has_column_privilege('localens_identity_rpc_owner', 'public.profiles', 'id', 'SELECT')
    AND has_column_privilege('localens_identity_rpc_owner', 'public.profiles', 'display_name', 'SELECT')
    AND has_column_privilege('localens_identity_rpc_owner', 'public.profiles', 'language', 'SELECT')
    AND NOT has_column_privilege('localens_identity_rpc_owner', 'public.profiles', 'created_at', 'SELECT')
    AND NOT has_column_privilege('localens_identity_rpc_owner', 'public.profiles', 'updated_at', 'SELECT'),
  'identity owner can read only the projected profile columns'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'profiles_portal_identity_select'
      AND roles = ARRAY['localens_identity_rpc_owner']::name[]
  ),
  'FORCE-RLS profile read policy is scoped to the identity owner'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'private.user_roles', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'private.user_roles', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'private.user_roles', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'private.user_roles', 'DELETE')
    AND NOT has_table_privilege('authenticated', 'private.user_roles', 'TRUNCATE')
    AND NOT has_table_privilege('authenticated', 'private.user_roles', 'REFERENCES')
    AND NOT has_table_privilege('authenticated', 'private.user_roles', 'TRIGGER'),
  'authenticated has no direct privileges on private.user_roles'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT throws_ok(
  $$SELECT * FROM public.get_portal_identity()$$,
  '42501',
  'authentication required'
);

SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-0000-0000-000000002201',
  'role', 'authenticated'
)::text, true);
SELECT results_eq(
  $$SELECT user_id, display_name, role, language FROM public.get_portal_identity()$$,
  $$VALUES ('00000000-0000-0000-0000-000000002201'::uuid, 'Portal Customer'::text, 'customer'::public.app_role, 'vi'::public.locale)$$,
  'PostgREST JSON claims authenticate the customer portal identity'
);
SELECT set_config('request.jwt.claims', '', true);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002201', true);
SELECT results_eq(
  $$SELECT user_id, display_name, role, language FROM public.get_portal_identity()$$,
  $$VALUES ('00000000-0000-0000-0000-000000002201'::uuid, 'Portal Customer'::text, 'customer'::public.app_role, 'vi'::public.locale)$$,
  'customer receives exactly their own portal identity'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002202', true);
SELECT results_eq(
  $$SELECT user_id, display_name, role, language FROM public.get_portal_identity()$$,
  $$VALUES ('00000000-0000-0000-0000-000000002202'::uuid, 'Portal Guide'::text, 'guide'::public.app_role, 'en'::public.locale)$$,
  'guide receives exactly their own portal identity'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002203', true);
SELECT results_eq(
  $$SELECT user_id, display_name, role, language FROM public.get_portal_identity()$$,
  $$VALUES ('00000000-0000-0000-0000-000000002203'::uuid, 'Portal Admin'::text, 'admin'::public.app_role, 'vi'::public.locale)$$,
  'admin receives exactly their own portal identity'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002204', true);
SELECT throws_ok(
  $$SELECT * FROM public.get_portal_identity()$$,
  '21000',
  'portal identity must have exactly one role'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
