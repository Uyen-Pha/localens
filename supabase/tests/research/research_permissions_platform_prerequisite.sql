-- LOCAL TEST PREREQUISITE ONLY; not part of the release migration chain.
-- Main must verify its dedicated local database before opening a connection
-- as the EXISTING auth-schema owner, supabase_admin. Run in Main's transaction
-- and always ROLLBACK. Never ALTER ROLE or grant a platform role to postgres,
-- a definer, a browser role, or service_role. No hosted execution is authorized.
-- Main then SET LOCAL ROLE postgres and runs both candidates twice plus tests
-- in this SAME connection/transaction, followed by ROLLBACK. A separate
-- connection cannot see this uncommitted prerequisite. No role attributes or
-- memberships change. This is not authorization for a hosted prerequisite.
DO $local_platform_owner$
BEGIN
 IF current_user <> 'supabase_admin' OR NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_namespace n JOIN pg_catalog.pg_roles r ON r.oid=n.nspowner
  WHERE n.nspname='auth' AND r.rolname=current_user
 ) THEN
  RAISE EXCEPTION 'LOCAL_PLATFORM_PREREQUISITE_REQUIRES_EXISTING_AUTH_SCHEMA_OWNER';
 END IF;
END
$local_platform_owner$;

-- Verified local source of authority: auth is owned by supabase_admin;
-- auth.users is owned by supabase_auth_admin, with postgres SELECT grant option.
-- Only auth schema grant authority is missing. Grant no table or function
-- access here; the migration grants/verifies its narrow object access itself.
GRANT USAGE ON SCHEMA auth TO postgres WITH GRANT OPTION;

DO $verify_auth_usage$
BEGIN
 IF NOT pg_catalog.has_schema_privilege('postgres','auth','USAGE WITH GRANT OPTION') THEN
  RAISE EXCEPTION 'LOCAL_PLATFORM_AUTH_GRANT_AUTHORITY_FAILED';
 END IF;
END
$verify_auth_usage$;
