-- This suite is integration-deferred only because this machine has no local
-- PostgreSQL/Supabase runtime. It is executable in `supabase test db --local`
-- after a reset that provides auth.users, anon/authenticated roles, and pgTAP.
BEGIN;

SELECT plan(89);

-- Fixed IDs keep the behavior checks deterministic and rollback-safe.
RESET ROLE;
DELETE FROM auth.users
WHERE id IN (
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000002'::uuid,
  '00000000-0000-0000-0000-000000000003'::uuid,
  '00000000-0000-0000-0000-000000000004'::uuid,
  '00000000-0000-0000-0000-000000000005'::uuid
);

-- Hostile signup metadata is intentionally present in every row. The trigger
-- must use only NEW.id and create one customer profile/role atomically.
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid, 'authenticated', 'authenticated', 'identity-1@example.invalid', '', '{}'::jsonb, jsonb_build_object('role', 'admin', 'is_admin', true), now(), now()),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'authenticated', 'authenticated', 'identity-2@example.invalid', '', '{}'::jsonb, jsonb_build_object('role', 'guide'), now(), now()),
  ('00000000-0000-0000-0000-000000000003'::uuid, 'authenticated', 'authenticated', 'identity-3@example.invalid', '', '{}'::jsonb, jsonb_build_object('role', 'admin'), now(), now()),
  ('00000000-0000-0000-0000-000000000004'::uuid, 'authenticated', 'authenticated', 'identity-4@example.invalid', '', '{}'::jsonb, jsonb_build_object('role', 'guide'), now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.user_roles (user_id, role)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'admin'::public.app_role)
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.guide_profiles (user_id, display_name, language)
VALUES ('00000000-0000-0000-0000-000000000004'::uuid, 'Guide Four', 'en'::public.locale)
ON CONFLICT (user_id) DO NOTHING;

-- Schema, enums, and tables.
SELECT ok(to_regnamespace('private') IS NOT NULL, 'private schema exists');
SELECT ok(to_regclass('public.profiles') IS NOT NULL, 'profiles table exists');
SELECT ok(to_regclass('public.guide_profiles') IS NOT NULL, 'guide_profiles table exists');
SELECT ok(to_regclass('private.user_roles') IS NOT NULL, 'private user_roles table exists');
SELECT ok(to_regclass('private.audit_events') IS NOT NULL, 'private audit_events table exists');
SELECT is((SELECT string_agg(e.enumlabel, '|' ORDER BY e.enumsortorder) FROM pg_catalog.pg_enum AS e JOIN pg_catalog.pg_type AS t ON t.oid = e.enumtypid JOIN pg_catalog.pg_namespace AS n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'app_role'), 'customer|guide|admin', 'app_role enum is exact');
SELECT is((SELECT string_agg(e.enumlabel, '|' ORDER BY e.enumsortorder) FROM pg_catalog.pg_enum AS e JOIN pg_catalog.pg_type AS t ON t.oid = e.enumtypid JOIN pg_catalog.pg_namespace AS n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'audit_event_type'), 'role_provisioned|role_revoked|plan_claimed|request_submitted|request_changes_requested|request_approved|request_rejected|quote_created|quote_checkout_started|quote_accepted|quote_reactivated|quote_expired|quote_revoked|checkout_started|checkout_session_recorded|checkout_compensated|booking_status_changed|webhook_processed|webhook_ignored|webhook_failed|webhook_conflict|payment_reconciled|guide_assigned|guide_reassigned|guide_accepted|guide_completed|content_publish_started|content_published|content_publish_failed', 'audit_event_type enum is exhaustive');
SELECT is((SELECT string_agg(e.enumlabel, '|' ORDER BY e.enumsortorder) FROM pg_catalog.pg_enum AS e JOIN pg_catalog.pg_type AS t ON t.oid = e.enumtypid JOIN pg_catalog.pg_namespace AS n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'audit_target_type'), 'user|trip_plan|custom_request|custom_quote|checkout_attempt|booking|payment|webhook_event|guide_assignment|content_release|catalog_snapshot|tour_version|departure', 'audit_target_type enum is exhaustive');
SELECT is((SELECT string_agg(e.enumlabel, '|' ORDER BY e.enumsortorder) FROM pg_catalog.pg_enum AS e JOIN pg_catalog.pg_type AS t ON t.oid = e.enumtypid JOIN pg_catalog.pg_namespace AS n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'audit_metadata_key'), 'role|source|status|state|decision|provider|currency|count|revision|attempt_no|amount_minor|replayed|is_demo', 'audit metadata keys are exact');

-- RLS and FORCE RLS are explicit for public identity tables and private
-- tables touched by the named NOBYPASSRLS owners.
SELECT ok((SELECT c.relrowsecurity FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'profiles'), 'profiles has RLS');
SELECT ok((SELECT c.relforcerowsecurity FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'profiles'), 'profiles is FORCE RLS');
SELECT ok((SELECT c.relrowsecurity FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'guide_profiles'), 'guide_profiles has RLS');
SELECT ok((SELECT c.relforcerowsecurity FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'guide_profiles'), 'guide_profiles is FORCE RLS');
SELECT ok((SELECT c.relrowsecurity FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname = 'private' AND c.relname = 'user_roles'), 'user_roles has RLS');
SELECT ok((SELECT c.relforcerowsecurity FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname = 'private' AND c.relname = 'user_roles'), 'user_roles is FORCE RLS');
SELECT ok((SELECT c.relrowsecurity FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname = 'private' AND c.relname = 'audit_events'), 'audit_events has RLS');
SELECT ok((SELECT c.relforcerowsecurity FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname = 'private' AND c.relname = 'audit_events'), 'audit_events is FORCE RLS');

-- Owner role hardening and least-privilege grant surface.
SELECT ok((SELECT bool_and(NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit AND NOT rolcanlogin AND NOT rolreplication AND NOT rolbypassrls) FROM pg_catalog.pg_roles WHERE rolname IN ('localens_auth_trigger_owner', 'localens_identity_rpc_owner', 'localens_admin_rpc_owner', 'localens_audit_guard_owner')), 'all definer owners are hardened NOLOGIN NOBYPASSRLS roles');
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members AS memberships
    JOIN pg_catalog.pg_roles AS granted ON granted.oid = memberships.roleid
    JOIN pg_catalog.pg_roles AS member ON member.oid = memberships.member
    WHERE (
      granted.rolname IN ('localens_auth_trigger_owner', 'localens_identity_rpc_owner', 'localens_admin_rpc_owner', 'localens_audit_guard_owner')
      AND (member.rolname <> 'postgres' OR memberships.inherit_option)
    )
    OR member.rolname IN ('localens_auth_trigger_owner', 'localens_identity_rpc_owner', 'localens_admin_rpc_owner', 'localens_audit_guard_owner')
  )
  AND (
    SELECT bool_and(pg_catalog.pg_has_role('postgres', role_name, 'SET'))
    FROM unnest(ARRAY['localens_auth_trigger_owner', 'localens_identity_rpc_owner', 'localens_admin_rpc_owner', 'localens_audit_guard_owner']) AS owner_roles(role_name)
  ),
  'definer owner memberships are limited to postgres SET access without inheritance'
);
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace AS ns WHERE ns.nspname = 'public' AND ns.nspacl::text LIKE '%localens_audit_guard_owner%'), 'audit guard has no direct public schema grant');
SELECT ok(NOT has_table_privilege('localens_admin_rpc_owner', 'public.guide_profiles', 'SELECT'), 'admin summary owner has no unused guide table grant');
SELECT ok(NOT has_table_privilege('localens_audit_guard_owner', 'private.user_roles', 'SELECT'), 'audit guard has no role-table grant');
SELECT ok(NOT has_schema_privilege('localens_auth_trigger_owner', 'auth', 'USAGE'), 'auth trigger owner has no auth schema privilege');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_catalog.pg_default_acl AS d JOIN pg_catalog.pg_namespace AS n ON n.oid = d.defaclnamespace WHERE n.nspname = 'private' AND d.defaclacl::text ~ '(anon|authenticated|PUBLIC)'), 'private default privileges exclude API roles and PUBLIC');
SELECT ok(has_table_privilege('localens_auth_trigger_owner', 'public.profiles', 'SELECT') AND has_table_privilege('localens_auth_trigger_owner', 'public.profiles', 'INSERT'), 'auth trigger owner has profile SELECT and INSERT');
SELECT ok(has_table_privilege('localens_auth_trigger_owner', 'private.user_roles', 'SELECT') AND has_table_privilege('localens_auth_trigger_owner', 'private.user_roles', 'INSERT'), 'auth trigger owner has role SELECT and INSERT');
SELECT ok(NOT has_table_privilege('localens_auth_trigger_owner', 'public.profiles', 'UPDATE'), 'auth trigger owner has no profile UPDATE');
SELECT ok(NOT has_table_privilege('localens_identity_rpc_owner', 'private.user_roles', 'UPDATE'), 'identity RPC owner has no role UPDATE');

-- Definer properties, owner policies, and append-only trigger shape.
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS tr JOIN pg_catalog.pg_class AS c ON c.oid = tr.tgrelid JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname = 'auth' AND c.relname = 'users' AND tr.tgname = 'on_auth_user_created' AND tr.tgenabled <> 'D'), 'auth signup trigger is enabled');
SELECT ok((SELECT p.prosecdef FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'private' AND p.proname = 'handle_new_auth_user'), 'auth trigger is SECURITY DEFINER');
SELECT ok((SELECT p.proconfig @> ARRAY['search_path=""'] FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'private' AND p.proname = 'handle_new_auth_user'), 'auth trigger pins empty search_path');
SELECT is((SELECT pg_catalog.pg_get_userbyid(p.proowner) FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'private' AND p.proname = 'handle_new_auth_user'), 'localens_auth_trigger_owner', 'auth trigger has named owner');
SELECT ok((SELECT pg_catalog.pg_get_functiondef(p.oid) NOT LIKE '%raw_user_meta_data%' AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%ON CONFLICT (id) DO NOTHING%' AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%ON CONFLICT (user_id, role) DO NOTHING%' FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'private' AND p.proname = 'handle_new_auth_user'), 'signup trigger ignores hostile metadata and is duplicate-safe');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_auth_trigger_select'), 'auth trigger profile SELECT policy exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'private' AND tablename = 'user_roles' AND policyname = 'user_roles_auth_trigger_select'), 'auth trigger role SELECT policy exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS tr JOIN pg_catalog.pg_class AS c ON c.oid = tr.tgrelid JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname = 'private' AND c.relname = 'audit_events' AND tr.tgname = 'audit_events_append_only_truncate' AND (tr.tgtype & 32) <> 0), 'audit TRUNCATE trigger exists');
SELECT ok(NOT has_table_privilege('anon', 'private.user_roles', 'SELECT') AND NOT has_table_privilege('authenticated', 'private.user_roles', 'SELECT'), 'API roles cannot read private roles');
SELECT ok(NOT has_table_privilege('anon', 'private.audit_events', 'INSERT') AND NOT has_table_privilege('authenticated', 'private.audit_events', 'INSERT'), 'API roles cannot append private audit rows');

-- Signup behavior: the trigger uses only the auth row id, not hostile metadata.
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000001'::uuid), 1, 'signup creates one customer profile');
SELECT is((SELECT count(*)::integer FROM private.user_roles WHERE user_id = '00000000-0000-0000-0000-000000000001'::uuid AND role = 'customer'::public.app_role), 1, 'signup creates one customer role');
SELECT is((SELECT count(*)::integer FROM private.user_roles WHERE user_id = '00000000-0000-0000-0000-000000000001'::uuid AND role = 'admin'::public.app_role), 1, 'explicit admin role is separate from hostile signup metadata');

-- Replaying the same auth insert is a no-op and leaves exactly one profile/role.
INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'authenticated', 'authenticated', 'identity-1@example.invalid', '', '{}'::jsonb, jsonb_build_object('role', 'guide'), now(), now())
ON CONFLICT (id) DO NOTHING;
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000001'::uuid), 1, 'duplicate signup keeps one profile');
SELECT is((SELECT count(*)::integer FROM private.user_roles WHERE user_id = '00000000-0000-0000-0000-000000000001'::uuid AND role = 'customer'::public.app_role), 1, 'duplicate signup keeps one customer role');

-- The named NOBYPASSRLS auth owner can perform both ON CONFLICT operations.
SET LOCAL ROLE localens_auth_trigger_owner;
INSERT INTO public.profiles (id) VALUES ('00000000-0000-0000-0000-000000000002'::uuid) ON CONFLICT (id) DO NOTHING;
INSERT INTO private.user_roles (user_id, role) VALUES ('00000000-0000-0000-0000-000000000002'::uuid, 'customer'::public.app_role) ON CONFLICT (user_id, role) DO NOTHING;
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000002'::uuid), 1, 'auth owner profile operation survives FORCE RLS');
SELECT is((SELECT count(*)::integer FROM private.user_roles WHERE user_id = '00000000-0000-0000-0000-000000000002'::uuid AND role = 'customer'::public.app_role), 1, 'auth owner role operation survives FORCE RLS');

-- Customer own-vs-cross-user reads and client write denial.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000002'::uuid), 1, 'customer reads own profile');
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE id IN ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000003'::uuid)), 0, 'customer cannot read cross-user profiles');
SELECT throws_ok($$INSERT INTO public.profiles (id) VALUES ('00000000-0000-0000-0000-000000000003'::uuid)$$::text, '42501'::character(5), NULL::text, 'customer cannot insert profiles'::text);
SELECT throws_ok($$UPDATE public.profiles SET display_name = 'cross-user' WHERE id = '00000000-0000-0000-0000-000000000001'::uuid$$::text, '42501'::character(5), NULL::text, 'customer cannot update profiles'::text);
SELECT throws_ok($$UPDATE public.guide_profiles SET display_name = 'cross-user' WHERE user_id = '00000000-0000-0000-0000-000000000004'::uuid$$::text, '42501'::character(5), NULL::text, 'customer cannot update guide profiles'::text);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);
SELECT is((SELECT count(*)::integer FROM public.guide_profiles WHERE user_id = '00000000-0000-0000-0000-000000000004'::uuid), 1, 'guide reads own guide profile');
SELECT is((SELECT count(*)::integer FROM public.guide_profiles WHERE user_id = '00000000-0000-0000-0000-000000000002'::uuid), 0, 'guide cannot read another guide profile');
RESET ROLE;

-- Role provisioning derives the actor from the JWT subject, requires admin, rejects
-- self elevation, and audits only the first insert.
SET LOCAL ROLE localens_identity_rpc_owner;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
SELECT private.provision_role('00000000-0000-0000-0000-000000000003'::uuid, 'guide'::public.app_role);
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM private.user_roles WHERE user_id = '00000000-0000-0000-0000-000000000003'::uuid AND role = 'guide'::public.app_role), 1, 'admin can provision a guide role');
SELECT is((SELECT count(*)::integer FROM private.audit_events WHERE event_type = 'role_provisioned'::public.audit_event_type AND target_id = '00000000-0000-0000-0000-000000000003'), 1, 'first role provision writes one audit event');

SET LOCAL ROLE localens_identity_rpc_owner;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
SELECT private.provision_role('00000000-0000-0000-0000-000000000003'::uuid, 'guide'::public.app_role);
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM private.audit_events WHERE event_type = 'role_provisioned'::public.audit_event_type AND target_id = '00000000-0000-0000-0000-000000000003'), 1, 'duplicate role provision does not duplicate its audit');

SET LOCAL ROLE localens_identity_rpc_owner;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
RESET ROLE;
SELECT throws_ok($$SELECT private.provision_role('00000000-0000-0000-0000-000000000003'::uuid, 'admin'::public.app_role)$$::text, '42501'::character(5), NULL::text, 'unauthorized actor cannot provision a role'::text);

-- Closed metadata keys and per-key scalar domains reject PII, tokens, device
-- identifiers, arbitrary values, wrong scalar types, and unsafe numbers.
SELECT throws_ok($$INSERT INTO private.audit_events (event_type, target_type, target_id, metadata_key, metadata_text) VALUES ('role_provisioned'::public.audit_event_type, 'user'::public.audit_target_type, '00000000-0000-0000-0000-000000000005'::uuid, 'role'::public.audit_metadata_key, 'evil@example.invalid')$$::text, '23514'::character(5), NULL::text, 'audit metadata rejects email values'::text);
SELECT throws_ok($$INSERT INTO private.audit_events (event_type, target_type, target_id, metadata_key, metadata_text) VALUES ('role_provisioned'::public.audit_event_type, 'user'::public.audit_target_type, '00000000-0000-0000-0000-000000000005'::uuid, 'token'::public.audit_metadata_key, 'opaque')$$::text, '22P02'::character(5), NULL::text, 'audit metadata rejects token keys'::text);
SELECT throws_ok($$INSERT INTO private.audit_events (event_type, target_type, target_id, metadata_key, metadata_text) VALUES ('role_provisioned'::public.audit_event_type, 'user'::public.audit_target_type, '00000000-0000-0000-0000-000000000005'::uuid, 'device_id'::public.audit_metadata_key, 'opaque')$$::text, '22P02'::character(5), NULL::text, 'audit metadata rejects device keys'::text);
SELECT throws_ok($$INSERT INTO private.audit_events (event_type, target_type, target_id, metadata_key, metadata_text) VALUES ('role_provisioned'::public.audit_event_type, 'user'::public.audit_target_type, '00000000-0000-0000-0000-000000000005'::uuid, 'source'::public.audit_metadata_key, 'arbitrary')$$::text, '23514'::character(5), NULL::text, 'audit metadata rejects arbitrary text'::text);
SELECT throws_ok($$INSERT INTO private.audit_events (event_type, target_type, target_id, metadata_key, metadata_boolean) VALUES ('role_provisioned'::public.audit_event_type, 'user'::public.audit_target_type, '00000000-0000-0000-0000-000000000005'::uuid, 'role'::public.audit_metadata_key, true)$$::text, '23514'::character(5), NULL::text, 'audit metadata rejects wrong scalar types'::text);
SELECT throws_ok($$INSERT INTO private.audit_events (event_type, target_type, target_id, metadata_key, metadata_number) VALUES ('role_provisioned'::public.audit_event_type, 'user'::public.audit_target_type, '00000000-0000-0000-0000-000000000005'::uuid, 'count'::public.audit_metadata_key, -1)$$::text, '23514'::character(5), NULL::text, 'audit metadata rejects negative numbers'::text);

SET LOCAL ROLE localens_identity_rpc_owner;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
RESET ROLE;
SELECT throws_ok($$SELECT private.provision_role('00000000-0000-0000-0000-000000000001'::uuid, 'admin'::public.app_role)$$::text, '42501'::character(5), NULL::text, 'admin cannot self-elevate'::text);

-- Sanitized admin summary is callable only by an admin JWT.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
SELECT is((SELECT count(*)::integer FROM public.admin_user_summary() WHERE user_id = '00000000-0000-0000-0000-000000000001'::uuid), 2, 'admin summary returns only explicit role rows');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
SELECT throws_ok($$SELECT count(*) FROM public.admin_user_summary()$$::text, '42501'::character(5), NULL::text, 'non-admin cannot execute admin summary'::text);
RESET ROLE;

-- Append-only behavior is tested with the migration session role so failure is
-- caused by the trigger, not merely by a client grant denial.
SELECT throws_ok($$UPDATE private.audit_events SET target_id = '00000000-0000-0000-0000-000000000005'::uuid WHERE target_id = '00000000-0000-0000-0000-000000000003'::uuid$$::text, '42501'::character(5), NULL::text, 'audit UPDATE is rejected'::text);
SELECT throws_ok($$DELETE FROM private.audit_events WHERE target_id = '00000000-0000-0000-0000-000000000003'$$::text, '42501'::character(5), NULL::text, 'audit DELETE is rejected'::text);
SELECT throws_ok($$TRUNCATE private.audit_events$$::text, '42501'::character(5), NULL::text, 'audit TRUNCATE is rejected'::text);

-- Identity owner INSERT and admin owner SELECT exercise FORCE RLS policies.
SET LOCAL ROLE localens_identity_rpc_owner;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
SELECT private.provision_role('00000000-0000-0000-0000-000000000004'::uuid, 'guide'::public.app_role);
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM private.user_roles WHERE user_id = '00000000-0000-0000-0000-000000000004'::uuid AND role = 'guide'::public.app_role), 1, 'identity owner can write roles under FORCE RLS');

SET LOCAL ROLE localens_admin_rpc_owner;
SELECT set_config('localens.test.admin_profile_count', (
  SELECT count(*)::integer
  FROM public.profiles
  WHERE id BETWEEN '00000000-0000-0000-0000-000000000001'::uuid
    AND '00000000-0000-0000-0000-000000000004'::uuid
)::text, true);
SELECT set_config('localens.test.admin_role_count', (
  SELECT count(*)::integer
  FROM private.user_roles
  WHERE user_id BETWEEN '00000000-0000-0000-0000-000000000001'::uuid
    AND '00000000-0000-0000-0000-000000000004'::uuid
)::text, true);
RESET ROLE;
SELECT is(current_setting('localens.test.admin_profile_count')::integer, 4, 'admin owner can read profiles under FORCE RLS');
SELECT is(current_setting('localens.test.admin_role_count')::integer, 7, 'admin owner can read roles under FORCE RLS');

-- Removing both exact trigger-owner INSERT grants makes signup atomic: the
-- auth row, profile, and customer role all roll back together. Grants are
-- restored inside this transaction for the remaining checks.
REVOKE INSERT ON TABLE public.profiles, private.user_roles FROM localens_auth_trigger_owner;
SELECT throws_ok($$INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES ('00000000-0000-0000-0000-000000000005'::uuid, 'authenticated', 'authenticated', 'identity-5@example.invalid', '', '{}'::jsonb, jsonb_build_object('role', 'admin'), now(), now())$$::text, '42501'::character(5), NULL::text, 'signup rollback rejects missing trigger-owner INSERT'::text);
SELECT is((SELECT count(*)::integer FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000005'::uuid), 0, 'signup rollback removes auth row');
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000005'::uuid), 0, 'signup rollback removes profile');
SELECT is((SELECT count(*)::integer FROM private.user_roles WHERE user_id = '00000000-0000-0000-0000-000000000005'::uuid), 0, 'signup rollback removes customer role');
GRANT INSERT ON TABLE public.profiles, private.user_roles TO localens_auth_trigger_owner;

-- Target type and UUID identity prevent raw IP/device/token/email values from
-- entering audit facts; metadata failures below use valid target IDs.
SELECT throws_ok($$INSERT INTO private.audit_events (event_type, target_type, target_id) VALUES ('role_provisioned'::public.audit_event_type, 'ip_address'::public.audit_target_type, '00000000-0000-0000-0000-000000000005'::uuid)$$::text, '22P02'::character(5), NULL::text, 'audit target rejects IP type'::text);
SELECT throws_ok($$INSERT INTO private.audit_events (event_type, target_type, target_id) VALUES ('role_provisioned'::public.audit_event_type, 'device_id'::public.audit_target_type, '00000000-0000-0000-0000-000000000005'::uuid)$$::text, '22P02'::character(5), NULL::text, 'audit target rejects device type'::text);
SELECT throws_ok($$INSERT INTO private.audit_events (event_type, target_type, target_id) VALUES ('role_provisioned'::public.audit_event_type, 'token'::public.audit_target_type, '00000000-0000-0000-0000-000000000005'::uuid)$$::text, '22P02'::character(5), NULL::text, 'audit target rejects token type'::text);
SELECT throws_ok($$INSERT INTO private.audit_events (event_type, target_type, target_id) VALUES ('role_provisioned'::public.audit_event_type, 'email'::public.audit_target_type, '00000000-0000-0000-0000-000000000005'::uuid)$$::text, '22P02'::character(5), NULL::text, 'audit target rejects email type'::text);
SELECT throws_ok($$INSERT INTO private.audit_events (event_type, target_type, target_id) VALUES ('role_provisioned'::public.audit_event_type, 'arbitrary'::public.audit_target_type, '00000000-0000-0000-0000-000000000005'::uuid)$$::text, '22P02'::character(5), NULL::text, 'audit target rejects arbitrary type'::text);
SELECT throws_ok($$INSERT INTO private.audit_events (event_type, target_type, target_id) VALUES ('role_provisioned'::public.audit_event_type, 'user'::public.audit_target_type, '192.0.2.1')$$::text, '22P02'::character(5), NULL::text, 'audit target rejects IP value'::text);
SELECT throws_ok($$INSERT INTO private.audit_events (event_type, target_type, target_id) VALUES ('role_provisioned'::public.audit_event_type, 'user'::public.audit_target_type, 'device-123')$$::text, '22P02'::character(5), NULL::text, 'audit target rejects device value'::text);
SELECT throws_ok($$INSERT INTO private.audit_events (event_type, target_type, target_id) VALUES ('role_provisioned'::public.audit_event_type, 'user'::public.audit_target_type, 'token-secret')$$::text, '22P02'::character(5), NULL::text, 'audit target rejects token value'::text);
SELECT throws_ok($$INSERT INTO private.audit_events (event_type, target_type, target_id) VALUES ('role_provisioned'::public.audit_event_type, 'user'::public.audit_target_type, 'person@example.invalid')$$::text, '22P02'::character(5), NULL::text, 'audit target rejects email value'::text);
SELECT throws_ok($$INSERT INTO private.audit_events (event_type, target_type, target_id) VALUES ('role_provisioned'::public.audit_event_type, 'user'::public.audit_target_type, 'not-a-uuid')$$::text, '22P02'::character(5), NULL::text, 'audit target rejects arbitrary value'::text);

-- Operational identity rows cascade with auth.users; historical audit actors
-- deliberately block deletion instead.
SELECT throws_ok($$DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000001'::uuid$$::text, '23503'::character(5), NULL::text, 'audit actor FK restricts deletion'::text);
DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000004'::uuid;
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000004'::uuid), 0, 'auth deletion cascades profile');
SELECT is((SELECT count(*)::integer FROM public.guide_profiles WHERE user_id = '00000000-0000-0000-0000-000000000004'::uuid), 0, 'auth deletion cascades guide profile');
SELECT is((SELECT count(*)::integer FROM private.user_roles WHERE user_id = '00000000-0000-0000-0000-000000000004'::uuid), 0, 'auth deletion cascades roles');

RESET request.jwt.claim.sub;
RESET request.jwt.claims;
SELECT * FROM finish();
ROLLBACK;
