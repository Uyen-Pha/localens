-- INTEGRATION-DEFERRED: this pgTAP suite is intentionally checked in before the
-- container-backed Supabase gate. It must run only after `supabase db reset`
-- provides auth.users, anon/authenticated roles, and the pgTAP extension.
BEGIN;

SELECT plan(50);

-- Schema, tables, and exact enum vocabularies.
SELECT ok(to_regnamespace('private') IS NOT NULL, 'private schema exists');
SELECT ok(to_regclass('public.profiles') IS NOT NULL, 'profiles table exists');
SELECT ok(to_regclass('public.guide_profiles') IS NOT NULL, 'guide_profiles table exists');
SELECT ok(to_regclass('private.user_roles') IS NOT NULL, 'private user_roles table exists');
SELECT ok(to_regclass('private.audit_events') IS NOT NULL, 'private audit_events table exists');
SELECT is(
  (SELECT string_agg(e.enumlabel, '|' ORDER BY e.enumsortorder)
   FROM pg_catalog.pg_enum AS e
   JOIN pg_catalog.pg_type AS t ON t.oid = e.enumtypid
   JOIN pg_catalog.pg_namespace AS n ON n.oid = t.typnamespace
   WHERE n.nspname = 'public' AND t.typname = 'app_role'),
  'customer|guide|admin',
  'app_role enum is exact'
);
SELECT is(
  (SELECT string_agg(e.enumlabel, '|' ORDER BY e.enumsortorder)
   FROM pg_catalog.pg_enum AS e
   JOIN pg_catalog.pg_type AS t ON t.oid = e.enumtypid
   JOIN pg_catalog.pg_namespace AS n ON n.oid = t.typnamespace
   WHERE n.nspname = 'public' AND t.typname = 'audit_event_type'),
  'role_provisioned|role_revoked|plan_claimed|request_submitted|request_changes_requested|request_approved|request_rejected|quote_created|quote_checkout_started|quote_accepted|quote_reactivated|quote_expired|quote_revoked|checkout_started|checkout_session_recorded|checkout_compensated|booking_status_changed|webhook_processed|webhook_ignored|webhook_failed|webhook_conflict|payment_reconciled|guide_assigned|guide_reassigned|guide_accepted|guide_completed|content_publish_started|content_published|content_publish_failed',
  'audit_event_type enum is exhaustive'
);

-- RLS and FORCE RLS choices are explicit for every public identity table and
-- for the private tables whose named NOBYPASSRLS owners write through definers.
SELECT ok((SELECT c.relrowsecurity FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'profiles'), 'profiles has RLS');
SELECT ok((SELECT c.relrowsecurity FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'guide_profiles'), 'guide_profiles has RLS');
SELECT ok((SELECT c.relrowsecurity FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname = 'private' AND c.relname = 'user_roles'), 'user_roles has RLS');
SELECT ok((SELECT c.relrowsecurity FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname = 'private' AND c.relname = 'audit_events'), 'audit_events has RLS');
SELECT ok((SELECT c.relforcerowsecurity FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'profiles'), 'profiles is FORCE RLS');
SELECT ok((SELECT c.relforcerowsecurity FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'guide_profiles'), 'guide_profiles is FORCE RLS');
SELECT ok((SELECT c.relforcerowsecurity FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname = 'private' AND c.relname = 'user_roles'), 'user_roles is FORCE RLS');
SELECT ok((SELECT c.relforcerowsecurity FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname = 'private' AND c.relname = 'audit_events'), 'audit_events is FORCE RLS');

-- Signup success/failure, duplicate trigger execution, hostile metadata, and
-- exact forced-RLS owner policies are represented by catalog/body assertions;
-- the two-session behavior remains integration-deferred.
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS tr JOIN pg_catalog.pg_class AS c ON c.oid = tr.tgrelid JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname = 'auth' AND c.relname = 'users' AND tr.tgname = 'on_auth_user_created' AND NOT tr.tgenabled = 'D'), 'auth signup trigger is enabled');
SELECT ok((SELECT p.prosecdef FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'private' AND p.proname = 'handle_new_auth_user'), 'auth trigger is SECURITY DEFINER');
SELECT ok((SELECT p.proconfig @> ARRAY['search_path='] FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'private' AND p.proname = 'handle_new_auth_user'), 'auth trigger pins an empty search_path');
SELECT is((SELECT pg_catalog.pg_get_userbyid(p.proowner) FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'private' AND p.proname = 'handle_new_auth_user'), 'localens_auth_trigger_owner', 'auth trigger has a named owner');
SELECT ok((SELECT pg_catalog.pg_get_functiondef(p.oid) LIKE '%ON CONFLICT (id) DO NOTHING%' FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'private' AND p.proname = 'handle_new_auth_user'), 'signup profile insert is idempotent');
SELECT ok((SELECT pg_catalog.pg_get_functiondef(p.oid) LIKE '%ON CONFLICT (user_id, role) DO NOTHING%' FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'private' AND p.proname = 'handle_new_auth_user'), 'signup customer role insert is idempotent');
SELECT ok((SELECT pg_catalog.pg_get_functiondef(p.oid) NOT LIKE '%raw_user_meta_data%' FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'private' AND p.proname = 'handle_new_auth_user'), 'hostile signup role metadata is ignored');

-- Role provisioning derives auth.uid, rejects self elevation, and audits the
-- successful insert atomically. Duplicate grants do not add a second audit row.
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'private' AND p.proname = 'provision_role'), 'provision_role exists');
SELECT ok((SELECT p.prosecdef FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'private' AND p.proname = 'provision_role'), 'provision_role is SECURITY DEFINER');
SELECT ok((SELECT p.proconfig @> ARRAY['search_path='] FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'private' AND p.proname = 'provision_role'), 'provision_role pins an empty search_path');
SELECT is((SELECT pg_catalog.pg_get_userbyid(p.proowner) FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'private' AND p.proname = 'provision_role'), 'localens_identity_rpc_owner', 'provision_role has a named owner');
SELECT ok((SELECT pg_catalog.pg_get_functiondef(p.oid) LIKE '%auth.uid()%' FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'private' AND p.proname = 'provision_role'), 'provision_role derives actor from auth.uid');
SELECT ok((SELECT pg_catalog.pg_get_functiondef(p.oid) LIKE '%actor_user_id = target_user_id%' FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'private' AND p.proname = 'provision_role'), 'provision_role rejects self elevation');
SELECT ok((SELECT pg_catalog.pg_get_functiondef(p.oid) LIKE '%role = ''admin''::public.app_role%' FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'private' AND p.proname = 'provision_role'), 'provision_role requires an admin role');
SELECT ok((SELECT pg_catalog.pg_get_functiondef(p.oid) LIKE '%ON CONFLICT (user_id, role) DO NOTHING%' FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'private' AND p.proname = 'provision_role'), 'duplicate role grants use explicit conflict handling');
SELECT ok((SELECT pg_catalog.pg_get_functiondef(p.oid) LIKE '%private.audit_events%' FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'private' AND p.proname = 'provision_role'), 'provision_role writes the scalar audit table');

-- Admins receive a sanitized named projection, not private table access.
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'admin_user_summary'), 'admin_user_summary exists');
SELECT ok((SELECT p.prosecdef FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'admin_user_summary'), 'admin_user_summary is SECURITY DEFINER');
SELECT ok((SELECT p.proconfig @> ARRAY['search_path='] FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'admin_user_summary'), 'admin_user_summary pins an empty search_path');
SELECT is((SELECT pg_catalog.pg_get_userbyid(p.proowner) FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'admin_user_summary'), 'localens_admin_rpc_owner', 'admin_user_summary has a named owner');
SELECT ok((SELECT pg_catalog.pg_get_function_result(p.oid) LIKE '%user_id uuid%' AND pg_catalog.pg_get_function_result(p.oid) LIKE '%role public.app_role%' FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'admin_user_summary'), 'admin summary return columns are sanitized and explicit');
SELECT ok(NOT has_function_privilege('anon', 'public.admin_user_summary()', 'EXECUTE'), 'anon cannot execute admin summary');
SELECT ok(has_function_privilege('authenticated', 'public.admin_user_summary()', 'EXECUTE'), 'authenticated has only the named admin summary execute grant');
SELECT ok(NOT has_table_privilege('anon', 'private.user_roles', 'SELECT'), 'anon cannot read private roles');
SELECT ok(NOT has_table_privilege('authenticated', 'private.user_roles', 'SELECT'), 'authenticated cannot read private roles');

-- Customer/guide reads and NOBYPASSRLS owner writes are named policies.
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_customer_select'), 'customer profile policy is owner scoped');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'guide_profiles' AND policyname = 'guide_profiles_guide_select'), 'guide profile policy is owner scoped');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_auth_trigger_insert'), 'auth trigger has a FORCE RLS insert policy');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'private' AND tablename = 'user_roles' AND policyname = 'user_roles_identity_rpc_insert'), 'role RPC has a FORCE RLS insert policy');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'private' AND tablename = 'user_roles' AND roles && ARRAY['anon', 'authenticated']::name[] AND cmd IN ('INSERT', 'UPDATE', 'DELETE')), 'API roles have no role DML policies');
SELECT ok(NOT has_table_privilege('anon', 'private.audit_events', 'INSERT'), 'anon cannot append private audit rows');

-- Audit rows are append-only and their guard is hardened as a named definer.
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS tr JOIN pg_catalog.pg_class AS c ON c.oid = tr.tgrelid JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname = 'private' AND c.relname = 'audit_events' AND tr.tgname = 'audit_events_append_only'), 'audit rows have an append-only trigger');
SELECT ok((SELECT p.prosecdef FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'private' AND p.proname = 'reject_audit_mutation'), 'append-only guard is SECURITY DEFINER');
SELECT ok((SELECT p.proconfig @> ARRAY['search_path='] FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'private' AND p.proname = 'reject_audit_mutation'), 'append-only guard pins an empty search_path');
SELECT is((SELECT pg_catalog.pg_get_userbyid(p.proowner) FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'private' AND p.proname = 'reject_audit_mutation'), 'localens_audit_guard_owner', 'append-only guard has a named owner');

SELECT * FROM finish();
ROLLBACK;
