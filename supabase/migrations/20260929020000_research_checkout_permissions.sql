-- Additive permission integration after the original research baseline and
-- cancellation candidate. No function bodies or business rows are rewritten.
-- This does not supply the fixture-only baseline or harden unrelated RPCs.
BEGIN;

DO $preconditions$
BEGIN
 IF current_user <> 'postgres' THEN
  RAISE EXCEPTION 'RESEARCH_PERMISSIONS_REQUIRES_MIGRATION_OWNER';
 END IF;
 -- Check BEFORE creating roles or changing ACLs. Only the identity owner in
 -- this bounded graph resolves auth objects. A pre-provisioned identity USAGE
 -- grant also permits reapply without requiring postgres grant authority.
 IF NOT pg_catalog.has_schema_privilege('postgres','auth','USAGE WITH GRANT OPTION')
    AND NOT EXISTS (
     SELECT 1 FROM pg_catalog.pg_roles r
     WHERE r.rolname='localens_identity_rpc_owner'
      AND pg_catalog.has_schema_privilege(r.oid,'auth','USAGE')
    ) THEN
  RAISE EXCEPTION 'MISSING_PLATFORM_AUTH_GRANT_AUTHORITY: postgres needs auth USAGE WITH GRANT OPTION, or localens_identity_rpc_owner must already have auth USAGE'
   USING ERRCODE='42501';
 END IF;
 IF to_regprocedure('public.research_demo_cancel_booking(uuid,text)') IS NULL
    OR to_regprocedure('private.research_demo_actor(boolean)') IS NULL
    OR to_regclass('private.research_demo_booking_cancellations') IS NULL THEN
  RAISE EXCEPTION 'MISSING_RESEARCH_CANCELLATION_BASELINE';
 END IF;
END
$preconditions$;

-- Additive GRANTs cannot narrow an existing broad privilege. Reject excess
-- EFFECTIVE access (including PUBLIC/inherited grants and table-level rights)
-- before creating roles, policies or changing ACLs. Never reset shared core
-- privileges: this allowlist is restricted to the ten research tables only.
DO $research_privilege_preflight$
DECLARE owner_role record; target record; privilege_name text; attribute record;
 allowed boolean;
BEGIN
 FOR owner_role IN SELECT oid,rolname FROM pg_catalog.pg_roles
  WHERE rolname IN ('localens_checkout_rpc_owner','localens_cancellation_customer_rpc_owner','localens_identity_rpc_owner') LOOP
  FOR target IN SELECT c.oid,c.relname FROM pg_catalog.pg_class c
   JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='private' AND c.relname IN (
    'research_demo_bookings','research_demo_booking_cancellations',
    'research_demo_requests','research_demo_revisions','research_demo_quotes',
    'research_demo_request_events','research_demo_catalog_versions',
    'research_demo_places','research_demo_stops','research_demo_revision_links') LOOP
   FOREACH privilege_name IN ARRAY ARRAY['DELETE','TRUNCATE','TRIGGER','MAINTAIN'] LOOP
    IF pg_catalog.has_table_privilege(owner_role.oid,target.oid,privilege_name) THEN
     RAISE EXCEPTION 'EXCESS_RESEARCH_OWNER_PRIVILEGE: % private.% %',owner_role.rolname,target.relname,privilege_name
      USING ERRCODE='42501';
    END IF;
   END LOOP;
   FOR attribute IN SELECT attname FROM pg_catalog.pg_attribute
    WHERE attrelid=target.oid AND attnum>0 AND NOT attisdropped LOOP
    FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] LOOP
     allowed:=false;
     IF owner_role.rolname='localens_checkout_rpc_owner' THEN
      allowed:=
       (privilege_name='SELECT' AND target.relname IN ('research_demo_bookings','research_demo_requests',
        'research_demo_revisions','research_demo_quotes','research_demo_booking_cancellations'))
       OR (privilege_name='INSERT' AND target.relname='research_demo_bookings')
       OR (privilege_name='INSERT' AND target.relname='research_demo_request_events'
        AND attribute.attname IN ('request_id','actor_id','status','note'))
       OR (privilege_name='UPDATE' AND target.relname='research_demo_bookings'
        AND attribute.attname IN ('status','payment_status','paid_at','checkout_details'))
       OR (privilege_name='UPDATE' AND target.relname='research_demo_requests' AND attribute.attname='id');
     ELSIF owner_role.rolname='localens_cancellation_customer_rpc_owner' THEN
      allowed:=
       (privilege_name='SELECT' AND target.relname IN ('research_demo_bookings','research_demo_requests',
        'research_demo_revisions','research_demo_booking_cancellations'))
       OR (privilege_name='INSERT' AND target.relname='research_demo_booking_cancellations')
       OR (privilege_name='UPDATE' AND target.relname='research_demo_bookings' AND attribute.attname='status')
       OR (privilege_name='UPDATE' AND target.relname='research_demo_requests' AND attribute.attname='id');
     END IF;
     IF NOT allowed AND pg_catalog.has_column_privilege(owner_role.oid,target.oid,attribute.attname,privilege_name) THEN
      RAISE EXCEPTION 'EXCESS_RESEARCH_OWNER_PRIVILEGE: % private.% % (%)',
       owner_role.rolname,target.relname,privilege_name,attribute.attname USING ERRCODE='42501';
     END IF;
    END LOOP;
   END LOOP;
  END LOOP;
 END LOOP;
END
$research_privilege_preflight$;

DO $roles$
DECLARE role_name text; created_role boolean;
BEGIN
 FOREACH role_name IN ARRAY ARRAY['localens_checkout_rpc_owner',
  'localens_cancellation_customer_rpc_owner','localens_identity_rpc_owner'] LOOP
  created_role := NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_name);
  IF created_role THEN
   EXECUTE format('CREATE ROLE %I NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS',role_name);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_name
   AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolcanlogin OR rolreplication OR rolbypassrls)) THEN
   RAISE EXCEPTION 'UNSAFE_RESEARCH_OWNER: %',role_name;
  END IF;
  -- Preserve existing memberships, failing closed rather than repairing them.
  -- A newly created PG17 role can have its creator membership without SET.
  IF NOT created_role AND EXISTS (
   SELECT 1 FROM pg_catalog.pg_auth_members m
   JOIN pg_catalog.pg_roles granted ON granted.oid=m.roleid
   JOIN pg_catalog.pg_roles member ON member.oid=m.member
   WHERE member.rolname=role_name OR
    (granted.rolname=role_name AND member.rolname<>'postgres')
  ) THEN
   RAISE EXCEPTION 'UNSAFE_RESEARCH_OWNER_MEMBERSHIP: %',role_name;
  END IF;
  IF created_role OR NOT EXISTS (
   SELECT 1 FROM pg_catalog.pg_auth_members m
   JOIN pg_catalog.pg_roles granted ON granted.oid=m.roleid
   JOIN pg_catalog.pg_roles member ON member.oid=m.member
   WHERE granted.rolname=role_name AND member.rolname='postgres'
  ) THEN
   EXECUTE format('GRANT %I TO postgres WITH SET TRUE, INHERIT FALSE',role_name);
  ELSIF NOT pg_catalog.pg_has_role('postgres',role_name,'SET') THEN
   RAISE EXCEPTION 'MISSING_RESEARCH_OWNER_SET_MEMBERSHIP: %',role_name;
  END IF;
 END LOOP;
END
$roles$;

-- Only additions to shared roles: never reset their existing core privileges.
GRANT USAGE ON SCHEMA public, private TO localens_checkout_rpc_owner, localens_cancellation_customer_rpc_owner;
GRANT USAGE ON SCHEMA private TO localens_identity_rpc_owner;
-- The managed auth schema may be owned by the platform with no grant option
-- for postgres. An existing platform owner must then supply this prerequisite;
-- never elevate postgres or give the definer membership in a platform role.
DO $auth_schema_prerequisite$
BEGIN
 IF NOT pg_catalog.has_schema_privilege('localens_identity_rpc_owner','auth','USAGE') THEN
  GRANT USAGE ON SCHEMA auth TO localens_identity_rpc_owner;
 END IF;
 IF NOT pg_catalog.has_schema_privilege('localens_identity_rpc_owner','auth','USAGE') THEN
  RAISE EXCEPTION 'MISSING_PLATFORM_AUTH_USAGE: localens_identity_rpc_owner requires USAGE on auth from its existing platform owner'
   USING ERRCODE='42501';
 END IF;
END
$auth_schema_prerequisite$;
GRANT EXECUTE ON FUNCTION auth.uid() TO localens_identity_rpc_owner;
GRANT SELECT (project_ref,environment) ON private.thesis_demo_manifest TO localens_identity_rpc_owner;
GRANT SELECT (user_id,role) ON private.user_roles TO localens_identity_rpc_owner;
GRANT SELECT (id,banned_until) ON auth.users TO localens_identity_rpc_owner;
DO $auth_object_prerequisites$
BEGIN
 IF NOT pg_catalog.has_function_privilege('localens_identity_rpc_owner','auth.uid()','EXECUTE')
    OR NOT pg_catalog.has_column_privilege('localens_identity_rpc_owner','auth.users','id','SELECT')
    OR NOT pg_catalog.has_column_privilege('localens_identity_rpc_owner','auth.users','banned_until','SELECT') THEN
  RAISE EXCEPTION 'MISSING_PLATFORM_AUTH_OBJECT_ACCESS: identity owner requires auth.uid EXECUTE and auth.users(id,banned_until) SELECT'
   USING ERRCODE='42501';
 END IF;
END
$auth_object_prerequisites$;

-- These policies add only the actor's read set. Existing identity policies and
-- grants are untouched. The auth policy is useful when auth.users has RLS on;
-- it neither enables/disables auth RLS nor grants visibility of another user.
DROP POLICY IF EXISTS research_actor_manifest_select ON private.thesis_demo_manifest;
CREATE POLICY research_actor_manifest_select ON private.thesis_demo_manifest
 FOR SELECT TO localens_identity_rpc_owner
 USING (current_user='localens_identity_rpc_owner'
  AND project_ref='twsdtfotrkljgbfsrmgz' AND environment='thesis-demo');
DROP POLICY IF EXISTS research_actor_user_roles_select ON private.user_roles;
CREATE POLICY research_actor_user_roles_select ON private.user_roles
 FOR SELECT TO localens_identity_rpc_owner
 USING (current_user='localens_identity_rpc_owner' AND user_id=auth.uid());
DROP POLICY IF EXISTS research_actor_auth_user_select ON auth.users;
CREATE POLICY research_actor_auth_user_select ON auth.users
 FOR SELECT TO localens_identity_rpc_owner
 USING (current_user='localens_identity_rpc_owner' AND id=auth.uid());

ALTER TABLE private.research_demo_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.research_demo_bookings FORCE ROW LEVEL SECURITY;
ALTER TABLE private.research_demo_booking_cancellations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.research_demo_booking_cancellations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.research_demo_bookings,private.research_demo_booking_cancellations
 FROM PUBLIC,anon,authenticated,service_role;

GRANT SELECT, INSERT ON private.research_demo_bookings TO localens_checkout_rpc_owner;
GRANT UPDATE (status,payment_status,paid_at,checkout_details) ON private.research_demo_bookings TO localens_checkout_rpc_owner;
GRANT SELECT ON private.research_demo_bookings TO localens_cancellation_customer_rpc_owner;
GRANT UPDATE (status) ON private.research_demo_bookings TO localens_cancellation_customer_rpc_owner;
GRANT SELECT ON private.research_demo_requests,private.research_demo_revisions
 TO localens_checkout_rpc_owner,localens_cancellation_customer_rpc_owner;
-- Row locking needs UPDATE privilege and an applicable UPDATE policy.
GRANT UPDATE (id) ON private.research_demo_requests
 TO localens_checkout_rpc_owner,localens_cancellation_customer_rpc_owner;
GRANT SELECT ON private.research_demo_quotes TO localens_checkout_rpc_owner;
GRANT INSERT (request_id,actor_id,status,note) ON private.research_demo_request_events TO localens_checkout_rpc_owner;
GRANT SELECT ON private.research_demo_booking_cancellations
 TO localens_checkout_rpc_owner,localens_cancellation_customer_rpc_owner;
GRANT INSERT ON private.research_demo_booking_cancellations TO localens_cancellation_customer_rpc_owner;

DROP POLICY IF EXISTS research_checkout_bookings_select ON private.research_demo_bookings;
CREATE POLICY research_checkout_bookings_select ON private.research_demo_bookings
 FOR SELECT TO localens_checkout_rpc_owner USING (current_user='localens_checkout_rpc_owner');
DROP POLICY IF EXISTS research_checkout_bookings_insert ON private.research_demo_bookings;
CREATE POLICY research_checkout_bookings_insert ON private.research_demo_bookings
 FOR INSERT TO localens_checkout_rpc_owner WITH CHECK (current_user='localens_checkout_rpc_owner');
DROP POLICY IF EXISTS research_checkout_bookings_update ON private.research_demo_bookings;
CREATE POLICY research_checkout_bookings_update ON private.research_demo_bookings
 FOR UPDATE TO localens_checkout_rpc_owner
 USING (current_user='localens_checkout_rpc_owner') WITH CHECK (current_user='localens_checkout_rpc_owner');
DROP POLICY IF EXISTS research_cancel_bookings_select ON private.research_demo_bookings;
CREATE POLICY research_cancel_bookings_select ON private.research_demo_bookings
 FOR SELECT TO localens_cancellation_customer_rpc_owner USING (current_user='localens_cancellation_customer_rpc_owner');
DROP POLICY IF EXISTS research_cancel_bookings_update ON private.research_demo_bookings;
CREATE POLICY research_cancel_bookings_update ON private.research_demo_bookings
 FOR UPDATE TO localens_cancellation_customer_rpc_owner
 USING (current_user='localens_cancellation_customer_rpc_owner') WITH CHECK (current_user='localens_cancellation_customer_rpc_owner');

DROP POLICY IF EXISTS research_checkout_requests_select ON private.research_demo_requests;
CREATE POLICY research_checkout_requests_select ON private.research_demo_requests
 FOR SELECT TO localens_checkout_rpc_owner USING (current_user='localens_checkout_rpc_owner');
DROP POLICY IF EXISTS research_checkout_requests_lock ON private.research_demo_requests;
CREATE POLICY research_checkout_requests_lock ON private.research_demo_requests
 FOR UPDATE TO localens_checkout_rpc_owner
 USING (current_user='localens_checkout_rpc_owner') WITH CHECK (current_user='localens_checkout_rpc_owner');
DROP POLICY IF EXISTS research_cancel_requests_select ON private.research_demo_requests;
CREATE POLICY research_cancel_requests_select ON private.research_demo_requests
 FOR SELECT TO localens_cancellation_customer_rpc_owner USING (current_user='localens_cancellation_customer_rpc_owner');
DROP POLICY IF EXISTS research_cancel_requests_lock ON private.research_demo_requests;
CREATE POLICY research_cancel_requests_lock ON private.research_demo_requests
 FOR UPDATE TO localens_cancellation_customer_rpc_owner
 USING (current_user='localens_cancellation_customer_rpc_owner') WITH CHECK (current_user='localens_cancellation_customer_rpc_owner');

DROP POLICY IF EXISTS research_checkout_revisions_select ON private.research_demo_revisions;
CREATE POLICY research_checkout_revisions_select ON private.research_demo_revisions
 FOR SELECT TO localens_checkout_rpc_owner USING (current_user='localens_checkout_rpc_owner');
DROP POLICY IF EXISTS research_cancel_revisions_select ON private.research_demo_revisions;
CREATE POLICY research_cancel_revisions_select ON private.research_demo_revisions
 FOR SELECT TO localens_cancellation_customer_rpc_owner USING (current_user='localens_cancellation_customer_rpc_owner');
DROP POLICY IF EXISTS research_checkout_quotes_select ON private.research_demo_quotes;
CREATE POLICY research_checkout_quotes_select ON private.research_demo_quotes
 FOR SELECT TO localens_checkout_rpc_owner USING (current_user='localens_checkout_rpc_owner');
DROP POLICY IF EXISTS research_checkout_events_insert ON private.research_demo_request_events;
CREATE POLICY research_checkout_events_insert ON private.research_demo_request_events
 FOR INSERT TO localens_checkout_rpc_owner WITH CHECK (current_user='localens_checkout_rpc_owner');
DROP POLICY IF EXISTS research_checkout_cancellations_select ON private.research_demo_booking_cancellations;
CREATE POLICY research_checkout_cancellations_select ON private.research_demo_booking_cancellations
 FOR SELECT TO localens_checkout_rpc_owner USING (current_user='localens_checkout_rpc_owner');
DROP POLICY IF EXISTS research_cancel_cancellations_select ON private.research_demo_booking_cancellations;
CREATE POLICY research_cancel_cancellations_select ON private.research_demo_booking_cancellations
 FOR SELECT TO localens_cancellation_customer_rpc_owner USING (current_user='localens_cancellation_customer_rpc_owner');
DROP POLICY IF EXISTS research_cancel_cancellations_insert ON private.research_demo_booking_cancellations;
CREATE POLICY research_cancel_cancellations_insert ON private.research_demo_booking_cancellations
 FOR INSERT TO localens_cancellation_customer_rpc_owner WITH CHECK (current_user='localens_cancellation_customer_rpc_owner');

DO $ownership$
DECLARE item record; old_owner text; added_create text[]:=ARRAY[]::text[]; entry text;
BEGIN
 -- Track only CREATE privileges added here. Existing effective CREATE and
 -- existing postgres memberships survive both the first apply and reapply.
 FOR item IN SELECT * FROM (VALUES
  ('public','localens_checkout_rpc_owner'),('private','localens_checkout_rpc_owner'),
  ('public','localens_cancellation_customer_rpc_owner'),('private','localens_identity_rpc_owner')
 ) AS required(schema_name,role_name) LOOP
  IF NOT pg_catalog.has_schema_privilege(item.role_name,item.schema_name,'CREATE') THEN
   EXECUTE format('GRANT CREATE ON SCHEMA %I TO %I',item.schema_name,item.role_name);
   added_create:=array_append(added_create,item.schema_name||':'||item.role_name);
  END IF;
 END LOOP;
 FOR item IN SELECT * FROM (VALUES
  ('public.research_demo_booking(uuid,boolean)','localens_checkout_rpc_owner'),
  ('public.research_demo_checkout(uuid,jsonb)','localens_checkout_rpc_owner'),
  ('public.research_demo_cancel_booking(uuid,text)','localens_cancellation_customer_rpc_owner'),
  ('private.research_demo_actor(boolean)','localens_identity_rpc_owner'),
  ('private.research_demo_cancellation_allowed(text,text,timestamptz,timestamptz,timestamptz)','localens_checkout_rpc_owner'),
  ('private.research_demo_trip_start(private.research_demo_bookings)','localens_checkout_rpc_owner'),
  ('private.research_demo_booking_payload(private.research_demo_bookings)','localens_checkout_rpc_owner')
 ) AS targets(signature,owner_name) LOOP
  SELECT pg_catalog.pg_get_userbyid(proowner)::text INTO old_owner
   FROM pg_catalog.pg_proc WHERE oid=to_regprocedure(item.signature);
  IF old_owner IS NULL OR old_owner NOT IN ('postgres',item.owner_name) THEN
   RAISE EXCEPTION 'UNEXPECTED_RESEARCH_FUNCTION_OWNER: % (%)',item.signature,old_owner;
  END IF;
  IF old_owner='postgres' THEN
   EXECUTE format('ALTER FUNCTION %s OWNER TO %I',item.signature,item.owner_name);
  END IF;
 END LOOP;

 -- Explicit signatures keep the unchanged static ownership inventory useful.
 -- SET ROLE also works with demoted postgres and INHERIT FALSE memberships.
 SET LOCAL ROLE localens_checkout_rpc_owner;
 ALTER FUNCTION public.research_demo_booking(uuid,boolean) OWNER TO localens_checkout_rpc_owner;
 ALTER FUNCTION public.research_demo_checkout(uuid,jsonb) OWNER TO localens_checkout_rpc_owner;
 ALTER FUNCTION private.research_demo_cancellation_allowed(text,text,timestamptz,timestamptz,timestamptz) OWNER TO localens_checkout_rpc_owner;
 ALTER FUNCTION private.research_demo_trip_start(private.research_demo_bookings) OWNER TO localens_checkout_rpc_owner;
 ALTER FUNCTION private.research_demo_booking_payload(private.research_demo_bookings) OWNER TO localens_checkout_rpc_owner;
 ALTER FUNCTION private.research_demo_cancellation_allowed(text,text,timestamptz,timestamptz,timestamptz) SECURITY INVOKER;
 ALTER FUNCTION private.research_demo_trip_start(private.research_demo_bookings) SECURITY INVOKER;
 ALTER FUNCTION private.research_demo_booking_payload(private.research_demo_bookings) SECURITY INVOKER;
 REVOKE ALL ON FUNCTION public.research_demo_booking(uuid,boolean),public.research_demo_checkout(uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
 GRANT EXECUTE ON FUNCTION public.research_demo_booking(uuid,boolean),public.research_demo_checkout(uuid,jsonb) TO authenticated;
 REVOKE ALL ON FUNCTION private.research_demo_cancellation_allowed(text,text,timestamptz,timestamptz,timestamptz),
  private.research_demo_trip_start(private.research_demo_bookings),private.research_demo_booking_payload(private.research_demo_bookings)
  FROM PUBLIC,anon,authenticated,service_role;
 GRANT EXECUTE ON FUNCTION private.research_demo_cancellation_allowed(text,text,timestamptz,timestamptz,timestamptz),
  private.research_demo_trip_start(private.research_demo_bookings),private.research_demo_booking_payload(private.research_demo_bookings)
  TO localens_checkout_rpc_owner,localens_cancellation_customer_rpc_owner;
 -- Preserve migration/test access after ownership transfer for non-superuser
 -- postgres; BYPASSRLS alone does not bypass function ACLs.
 GRANT EXECUTE ON FUNCTION public.research_demo_booking(uuid,boolean),public.research_demo_checkout(uuid,jsonb),
  private.research_demo_cancellation_allowed(text,text,timestamptz,timestamptz,timestamptz),
  private.research_demo_trip_start(private.research_demo_bookings),private.research_demo_booking_payload(private.research_demo_bookings) TO postgres;
 SET LOCAL ROLE postgres;

 SET LOCAL ROLE localens_cancellation_customer_rpc_owner;
 ALTER FUNCTION public.research_demo_cancel_booking(uuid,text) OWNER TO localens_cancellation_customer_rpc_owner;
 REVOKE ALL ON FUNCTION public.research_demo_cancel_booking(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
 GRANT EXECUTE ON FUNCTION public.research_demo_cancel_booking(uuid,text) TO authenticated,postgres;
 SET LOCAL ROLE postgres;

 SET LOCAL ROLE localens_identity_rpc_owner;
 ALTER FUNCTION private.research_demo_actor(boolean) OWNER TO localens_identity_rpc_owner;
 ALTER FUNCTION private.research_demo_actor(boolean) SET search_path='';
 ALTER FUNCTION private.research_demo_actor(boolean) SET statement_timeout='5s';
 REVOKE ALL ON FUNCTION private.research_demo_actor(boolean) FROM PUBLIC,anon,authenticated,service_role;
 GRANT EXECUTE ON FUNCTION private.research_demo_actor(boolean)
  TO localens_checkout_rpc_owner,localens_cancellation_customer_rpc_owner,postgres;
 SET LOCAL ROLE postgres;

 FOREACH entry IN ARRAY added_create LOOP
  EXECUTE format('REVOKE CREATE ON SCHEMA %I FROM %I',split_part(entry,':',1),split_part(entry,':',2));
 END LOOP;
END
$ownership$;

COMMIT;
