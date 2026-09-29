-- Local-only additive permission completion. No function body/API or business-row edits.
-- Guide auth boundary: SELECT(id,email,banned_until), never credentials.
-- Service persistence validates a supplied owner; its auth/role reads cannot
-- be restricted to auth.uid(). Only service_role can execute its public RPCs.
BEGIN;
DO $preflight$
DECLARE role_name text; item record; attribute record; privilege_name text; allowed boolean; created boolean;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'REMAINING_PERMISSIONS_REQUIRES_POSTGRES'; END IF;
 FOREACH role_name IN ARRAY ARRAY['localens_guide_profile_rpc_owner','localens_research_persist_rpc_owner'] LOOP
  created:=NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name);
  IF created THEN EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',role_name); END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)) THEN RAISE EXCEPTION 'UNSAFE_REMAINING_OWNER: %',role_name; END IF;
  IF EXISTS(SELECT 1 FROM pg_auth_members WHERE (roleid=role_name::regrole AND member<>'postgres'::regrole) OR member=role_name::regrole) THEN RAISE EXCEPTION 'UNSAFE_REMAINING_MEMBERSHIP: %',role_name; END IF;
  -- These two owners may receive CREATE only temporarily during transfer.
  -- Check effective rights, including PUBLIC grants, before adding any grants.
  -- Reused owners retain their separate existing-privilege preservation path.
  IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname IN ('public','private','auth') AND pg_catalog.has_schema_privilege(role_name,oid,'CREATE')) THEN RAISE EXCEPTION 'EXCESS_REMAINING_OWNER_SCHEMA_CREATE: %',role_name; END IF;
  IF EXISTS(SELECT 1 FROM pg_class WHERE relowner=role_name::regrole) OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspowner=role_name::regrole) THEN RAISE EXCEPTION 'EXCESS_REMAINING_OWNER_PRIVILEGE: %',role_name; END IF;
  FOR item IN SELECT c.oid,n.nspname||'.'||c.relname AS qualified FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private','auth') AND c.relkind IN ('r','p','v','m','f') LOOP
   IF has_table_privilege(role_name,item.oid,'DELETE,TRUNCATE,TRIGGER,MAINTAIN') THEN RAISE EXCEPTION 'EXCESS_REMAINING_OWNER_PRIVILEGE: % %',role_name,item.qualified; END IF;
   FOR attribute IN SELECT attname,attnum FROM pg_attribute WHERE attrelid=item.oid AND attnum>0 AND NOT attisdropped LOOP
    FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] LOOP
     SELECT EXISTS(SELECT 1 FROM (VALUES
      ('localens_guide_profile_rpc_owner','auth.users','SELECT','id,email,banned_until'),
      ('localens_guide_profile_rpc_owner','private.user_roles','SELECT','user_id,role'),
      ('localens_guide_profile_rpc_owner','public.profiles','SELECT','id,display_name,phone'),
      ('localens_guide_profile_rpc_owner','public.profiles','UPDATE','phone,updated_at'),
      ('localens_guide_profile_rpc_owner','public.guide_profiles','SELECT','user_id,display_name,contact_address,bio,language,operating_area,created_at'),
      ('localens_guide_profile_rpc_owner','public.guide_profiles','UPDATE','contact_address,bio,updated_at'),
      ('localens_research_persist_rpc_owner','auth.users','SELECT','id,banned_until'),
      ('localens_research_persist_rpc_owner','private.user_roles','SELECT','user_id,role'),
      ('localens_research_persist_rpc_owner','private.thesis_demo_manifest','SELECT','project_ref,environment'),
      ('localens_research_persist_rpc_owner','private.research_demo_revisions','SELECT',''),
      ('localens_research_persist_rpc_owner','private.research_demo_revision_links','SELECT',''),
      ('localens_research_persist_rpc_owner','private.research_demo_requests','SELECT',''),
      ('localens_research_persist_rpc_owner','private.research_demo_places','SELECT',''),
      ('localens_research_persist_rpc_owner','private.research_demo_revisions','INSERT',''),
      ('localens_research_persist_rpc_owner','private.research_demo_stops','INSERT',''),
      ('localens_research_persist_rpc_owner','private.research_demo_revision_links','INSERT','')
     ) AS permitted(owner_name,relation_name,operation,columns) WHERE owner_name=role_name AND relation_name=item.qualified AND operation=privilege_name AND (columns='' OR attribute.attname=ANY(string_to_array(columns,',')))) INTO allowed;
     IF NOT allowed AND has_column_privilege(role_name,item.oid,attribute.attnum,privilege_name) THEN RAISE EXCEPTION 'EXCESS_REMAINING_OWNER_PRIVILEGE: % %.% %',role_name,item.qualified,attribute.attname,privilege_name; END IF;
    END LOOP;
   END LOOP;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_proc p WHERE p.proowner=role_name::regrole AND NOT EXISTS(SELECT 1 FROM (VALUES
   ('public.get_own_guide_profile()','localens_guide_profile_rpc_owner'),
   ('public.update_own_guide_profile(text,text)','localens_guide_profile_rpc_owner'),
   ('public.research_demo_persist(uuid,text,jsonb,jsonb)','localens_research_persist_rpc_owner'),
   ('public.research_demo_persist_edit(uuid,uuid,text,text,jsonb,jsonb)','localens_research_persist_rpc_owner')
  ) AS permitted(signature,owner_name) WHERE owner_name=role_name AND p.oid=signature::regprocedure)) THEN RAISE EXCEPTION 'EXCESS_REMAINING_OWNER_PRIVILEGE: % owns unrelated function',role_name; END IF;
 END LOOP;
 FOR item IN SELECT * FROM (VALUES
  ('public.get_own_guide_profile()','localens_guide_profile_rpc_owner'),
  ('public.update_own_guide_profile(text,text)','localens_guide_profile_rpc_owner'),
  ('private.guard_guide_company_fields()','localens_identity_rpc_owner'),
  ('private.prevent_customer_email_change()','localens_identity_rpc_owner'),
  ('public.get_research_demo_catalog(text)','localens_catalog_rpc_owner'),
  ('public.research_demo_persist(uuid,text,jsonb,jsonb)','localens_research_persist_rpc_owner'),
  ('public.research_demo_persist_edit(uuid,uuid,text,text,jsonb,jsonb)','localens_research_persist_rpc_owner'),
  ('public.research_demo_submit(uuid)','localens_request_customer_rpc_owner'),
  ('public.research_demo_begin_revision(uuid,uuid)','localens_request_customer_rpc_owner'),
  ('public.research_demo_resubmit(uuid,uuid,uuid)','localens_request_customer_rpc_owner'),
  ('public.research_demo_edit_context(uuid)','localens_request_customer_rpc_owner'),
  ('public.research_demo_resume(uuid)','localens_request_customer_rpc_owner'),
  ('public.research_demo_resume_latest(uuid)','localens_request_customer_rpc_owner'),
  ('public.research_demo_list(boolean)','localens_request_customer_rpc_owner'),
  ('public.research_demo_decide(uuid,text,text)','localens_request_admin_rpc_owner'),
  ('public.research_demo_create_quote(uuid,text,numeric,text,text)','localens_request_admin_rpc_owner')
 ) AS targets(signature,owner_name) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure(item.signature) AND proowner IN ('postgres'::regrole,item.owner_name::regrole)) THEN RAISE EXCEPTION 'UNEXPECTED_REMAINING_FUNCTION_OWNER: %',item.signature; END IF;
 END LOOP;
END $preflight$;
GRANT localens_guide_profile_rpc_owner,localens_research_persist_rpc_owner TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT USAGE ON SCHEMA public,private,auth TO localens_guide_profile_rpc_owner,localens_research_persist_rpc_owner;
-- Catalog reader only evaluates auth.uid(); no auth.users access is added.
GRANT USAGE ON SCHEMA auth TO localens_catalog_rpc_owner;
-- Existing catalog/customer/admin roles retain their original responsibilities.
ALTER TABLE private.research_demo_revision_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.research_demo_revision_links FORCE ROW LEVEL SECURITY;
GRANT SELECT (id,email,banned_until) ON auth.users TO localens_guide_profile_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_1 ON auth.users;
CREATE POLICY remaining_runtime_1 ON auth.users FOR SELECT TO localens_guide_profile_rpc_owner USING (id=auth.uid());
GRANT SELECT (user_id,role) ON private.user_roles TO localens_guide_profile_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_2 ON private.user_roles;
CREATE POLICY remaining_runtime_2 ON private.user_roles FOR SELECT TO localens_guide_profile_rpc_owner USING (user_id=auth.uid());
GRANT SELECT (id,display_name,phone) ON public.profiles TO localens_guide_profile_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_3 ON public.profiles;
CREATE POLICY remaining_runtime_3 ON public.profiles FOR SELECT TO localens_guide_profile_rpc_owner USING (id=auth.uid());
GRANT UPDATE (phone,updated_at) ON public.profiles TO localens_guide_profile_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_4 ON public.profiles;
CREATE POLICY remaining_runtime_4 ON public.profiles FOR UPDATE TO localens_guide_profile_rpc_owner USING (id=auth.uid()) WITH CHECK (id=auth.uid());
GRANT SELECT (user_id,display_name,contact_address,bio,language,operating_area,created_at) ON public.guide_profiles TO localens_guide_profile_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_5 ON public.guide_profiles;
CREATE POLICY remaining_runtime_5 ON public.guide_profiles FOR SELECT TO localens_guide_profile_rpc_owner USING (user_id=auth.uid());
GRANT UPDATE (contact_address,bio,updated_at) ON public.guide_profiles TO localens_guide_profile_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_6 ON public.guide_profiles;
CREATE POLICY remaining_runtime_6 ON public.guide_profiles FOR UPDATE TO localens_guide_profile_rpc_owner USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
GRANT SELECT (id,banned_until) ON auth.users TO localens_research_persist_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_7 ON auth.users;
CREATE POLICY remaining_runtime_7 ON auth.users FOR SELECT TO localens_research_persist_rpc_owner USING (true);
GRANT SELECT (user_id,role) ON private.user_roles TO localens_research_persist_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_8 ON private.user_roles;
CREATE POLICY remaining_runtime_8 ON private.user_roles FOR SELECT TO localens_research_persist_rpc_owner USING (true);
GRANT SELECT (project_ref,environment) ON private.thesis_demo_manifest TO localens_research_persist_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_9 ON private.thesis_demo_manifest;
CREATE POLICY remaining_runtime_9 ON private.thesis_demo_manifest FOR SELECT TO localens_research_persist_rpc_owner USING (project_ref='twsdtfotrkljgbfsrmgz' AND environment='thesis-demo');
GRANT SELECT ON private.research_demo_revisions TO localens_research_persist_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_10 ON private.research_demo_revisions;
CREATE POLICY remaining_runtime_10 ON private.research_demo_revisions FOR SELECT TO localens_research_persist_rpc_owner USING (true);
GRANT SELECT ON private.research_demo_revision_links TO localens_research_persist_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_11 ON private.research_demo_revision_links;
CREATE POLICY remaining_runtime_11 ON private.research_demo_revision_links FOR SELECT TO localens_research_persist_rpc_owner USING (true);
GRANT SELECT ON private.research_demo_requests TO localens_research_persist_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_12 ON private.research_demo_requests;
CREATE POLICY remaining_runtime_12 ON private.research_demo_requests FOR SELECT TO localens_research_persist_rpc_owner USING (true);
GRANT SELECT ON private.research_demo_places TO localens_research_persist_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_13 ON private.research_demo_places;
CREATE POLICY remaining_runtime_13 ON private.research_demo_places FOR SELECT TO localens_research_persist_rpc_owner USING (true);
GRANT INSERT ON private.research_demo_revisions TO localens_research_persist_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_14 ON private.research_demo_revisions;
CREATE POLICY remaining_runtime_14 ON private.research_demo_revisions FOR INSERT TO localens_research_persist_rpc_owner WITH CHECK (true);
GRANT INSERT ON private.research_demo_stops TO localens_research_persist_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_15 ON private.research_demo_stops;
CREATE POLICY remaining_runtime_15 ON private.research_demo_stops FOR INSERT TO localens_research_persist_rpc_owner WITH CHECK (true);
GRANT INSERT ON private.research_demo_revision_links TO localens_research_persist_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_16 ON private.research_demo_revision_links;
CREATE POLICY remaining_runtime_16 ON private.research_demo_revision_links FOR INSERT TO localens_research_persist_rpc_owner WITH CHECK (true);
GRANT SELECT ON private.research_demo_catalog_versions TO localens_catalog_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_17 ON private.research_demo_catalog_versions;
CREATE POLICY remaining_runtime_17 ON private.research_demo_catalog_versions FOR SELECT TO localens_catalog_rpc_owner USING (true);
GRANT SELECT ON private.research_demo_revisions TO localens_request_customer_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_18 ON private.research_demo_revisions;
CREATE POLICY remaining_runtime_18 ON private.research_demo_revisions FOR SELECT TO localens_request_customer_rpc_owner USING (true);
GRANT SELECT ON private.research_demo_stops TO localens_request_customer_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_19 ON private.research_demo_stops;
CREATE POLICY remaining_runtime_19 ON private.research_demo_stops FOR SELECT TO localens_request_customer_rpc_owner USING (true);
GRANT SELECT ON private.research_demo_requests TO localens_request_customer_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_20 ON private.research_demo_requests;
CREATE POLICY remaining_runtime_20 ON private.research_demo_requests FOR SELECT TO localens_request_customer_rpc_owner USING (true);
GRANT SELECT ON private.research_demo_request_events TO localens_request_customer_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_21 ON private.research_demo_request_events;
CREATE POLICY remaining_runtime_21 ON private.research_demo_request_events FOR SELECT TO localens_request_customer_rpc_owner USING (true);
GRANT SELECT ON private.research_demo_quotes TO localens_request_customer_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_22 ON private.research_demo_quotes;
CREATE POLICY remaining_runtime_22 ON private.research_demo_quotes FOR SELECT TO localens_request_customer_rpc_owner USING (true);
GRANT SELECT ON private.research_demo_revision_links TO localens_request_customer_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_23 ON private.research_demo_revision_links;
CREATE POLICY remaining_runtime_23 ON private.research_demo_revision_links FOR SELECT TO localens_request_customer_rpc_owner USING (true);
GRANT INSERT ON private.research_demo_revisions TO localens_request_customer_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_24 ON private.research_demo_revisions;
CREATE POLICY remaining_runtime_24 ON private.research_demo_revisions FOR INSERT TO localens_request_customer_rpc_owner WITH CHECK (true);
GRANT INSERT ON private.research_demo_stops TO localens_request_customer_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_25 ON private.research_demo_stops;
CREATE POLICY remaining_runtime_25 ON private.research_demo_stops FOR INSERT TO localens_request_customer_rpc_owner WITH CHECK (true);
GRANT INSERT ON private.research_demo_requests TO localens_request_customer_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_26 ON private.research_demo_requests;
CREATE POLICY remaining_runtime_26 ON private.research_demo_requests FOR INSERT TO localens_request_customer_rpc_owner WITH CHECK (true);
GRANT INSERT (request_id,actor_id,status,note,revision_id) ON private.research_demo_request_events TO localens_request_customer_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_27 ON private.research_demo_request_events;
CREATE POLICY remaining_runtime_27 ON private.research_demo_request_events FOR INSERT TO localens_request_customer_rpc_owner WITH CHECK (true);
GRANT UPDATE (id,revision_id,status,notes) ON private.research_demo_requests TO localens_request_customer_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_28 ON private.research_demo_requests;
CREATE POLICY remaining_runtime_28 ON private.research_demo_requests FOR UPDATE TO localens_request_customer_rpc_owner USING (true) WITH CHECK (true);
GRANT SELECT ON private.research_demo_requests TO localens_request_admin_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_29 ON private.research_demo_requests;
CREATE POLICY remaining_runtime_29 ON private.research_demo_requests FOR SELECT TO localens_request_admin_rpc_owner USING (true);
GRANT SELECT ON private.research_demo_quotes TO localens_request_admin_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_30 ON private.research_demo_quotes;
CREATE POLICY remaining_runtime_30 ON private.research_demo_quotes FOR SELECT TO localens_request_admin_rpc_owner USING (true);
GRANT UPDATE (id,status,notes,processing_completed_at) ON private.research_demo_requests TO localens_request_admin_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_31 ON private.research_demo_requests;
CREATE POLICY remaining_runtime_31 ON private.research_demo_requests FOR UPDATE TO localens_request_admin_rpc_owner USING (true) WITH CHECK (true);
GRANT INSERT ON private.research_demo_quotes TO localens_request_admin_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_32 ON private.research_demo_quotes;
CREATE POLICY remaining_runtime_32 ON private.research_demo_quotes FOR INSERT TO localens_request_admin_rpc_owner WITH CHECK (true);
GRANT INSERT (request_id,actor_id,status,note) ON private.research_demo_request_events TO localens_request_admin_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_33 ON private.research_demo_request_events;
CREATE POLICY remaining_runtime_33 ON private.research_demo_request_events FOR INSERT TO localens_request_admin_rpc_owner WITH CHECK (true);
-- Identity-owned actor already implements customer/admin and ban checks.
-- List status projection checks bookings without invoking checkout or mutating it.
GRANT SELECT (quote_id,status,checkout_details) ON private.research_demo_bookings TO localens_request_customer_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_list_bookings ON private.research_demo_bookings;
CREATE POLICY remaining_runtime_list_bookings ON private.research_demo_bookings FOR SELECT TO localens_request_customer_rpc_owner USING (true);
-- The unchanged invoker quote-deadline trigger reads the source revision.
GRANT SELECT (id,request) ON private.research_demo_revisions TO localens_request_admin_rpc_owner;
DROP POLICY IF EXISTS remaining_runtime_quote_source ON private.research_demo_revisions;
CREATE POLICY remaining_runtime_quote_source ON private.research_demo_revisions FOR SELECT TO localens_request_admin_rpc_owner USING (true);
SET LOCAL ROLE localens_identity_rpc_owner;
GRANT EXECUTE ON FUNCTION private.research_demo_actor(boolean) TO localens_request_customer_rpc_owner,localens_request_admin_rpc_owner;
SET LOCAL ROLE postgres;
-- Temporary CREATE is tracked so preexisting grants on reused roles survive.
DO $schema_create$
DECLARE item record; BEGIN
 CREATE TEMP TABLE remaining_runtime_added_create(schema_name text,owner_name text) ON COMMIT DROP;
 FOR item IN SELECT DISTINCT * FROM (VALUES
 ('public','localens_guide_profile_rpc_owner'),
 ('private','localens_identity_rpc_owner'),
 ('public','localens_catalog_rpc_owner'),
 ('public','localens_research_persist_rpc_owner'),
 ('public','localens_request_customer_rpc_owner'),
 ('public','localens_request_admin_rpc_owner'),
 ('public','localens_checkout_rpc_owner'),
 ('private','localens_checkout_rpc_owner'),
 ('public','localens_cancellation_customer_rpc_owner')
 ) AS required(schema_name,owner_name) LOOP
  IF NOT has_schema_privilege(item.owner_name,item.schema_name,'CREATE') THEN
   EXECUTE format('GRANT CREATE ON SCHEMA %I TO %I',item.schema_name,item.owner_name);
   INSERT INTO remaining_runtime_added_create VALUES(item.schema_name,item.owner_name);
  END IF;
 END LOOP;
END $schema_create$;
ALTER FUNCTION public.get_own_guide_profile() OWNER TO localens_guide_profile_rpc_owner;
ALTER FUNCTION public.update_own_guide_profile(text,text) OWNER TO localens_guide_profile_rpc_owner;
ALTER FUNCTION private.guard_guide_company_fields() OWNER TO localens_identity_rpc_owner;
ALTER FUNCTION private.prevent_customer_email_change() OWNER TO localens_identity_rpc_owner;
ALTER FUNCTION public.get_research_demo_catalog(text) OWNER TO localens_catalog_rpc_owner;
ALTER FUNCTION public.research_demo_persist(uuid,text,jsonb,jsonb) OWNER TO localens_research_persist_rpc_owner;
ALTER FUNCTION public.research_demo_persist_edit(uuid,uuid,text,text,jsonb,jsonb) OWNER TO localens_research_persist_rpc_owner;
ALTER FUNCTION public.research_demo_submit(uuid) OWNER TO localens_request_customer_rpc_owner;
ALTER FUNCTION public.research_demo_begin_revision(uuid,uuid) OWNER TO localens_request_customer_rpc_owner;
ALTER FUNCTION public.research_demo_resubmit(uuid,uuid,uuid) OWNER TO localens_request_customer_rpc_owner;
ALTER FUNCTION public.research_demo_edit_context(uuid) OWNER TO localens_request_customer_rpc_owner;
ALTER FUNCTION public.research_demo_resume(uuid) OWNER TO localens_request_customer_rpc_owner;
ALTER FUNCTION public.research_demo_resume_latest(uuid) OWNER TO localens_request_customer_rpc_owner;
ALTER FUNCTION public.research_demo_list(boolean) OWNER TO localens_request_customer_rpc_owner;
ALTER FUNCTION public.research_demo_decide(uuid,text,text) OWNER TO localens_request_admin_rpc_owner;
ALTER FUNCTION public.research_demo_create_quote(uuid,text,numeric,text,text) OWNER TO localens_request_admin_rpc_owner;
SET LOCAL ROLE localens_identity_rpc_owner;
-- Preserve the former owner's execution rights on the revoked trigger helpers.
GRANT EXECUTE ON FUNCTION private.guard_guide_company_fields(),private.prevent_customer_email_change() TO postgres;
SET LOCAL ROLE postgres;
-- Ownership transfer retains client EXECUTE entries. No client ACL is rewritten.
-- Reaffirm 020000's existing owners at top level for ordered static inventory.
SET LOCAL ROLE localens_checkout_rpc_owner;
ALTER FUNCTION public.research_demo_booking(uuid,boolean) OWNER TO localens_checkout_rpc_owner;
ALTER FUNCTION public.research_demo_checkout(uuid,jsonb) OWNER TO localens_checkout_rpc_owner;
ALTER FUNCTION private.research_demo_cancellation_allowed(text,text,timestamptz,timestamptz,timestamptz) OWNER TO localens_checkout_rpc_owner;
ALTER FUNCTION private.research_demo_trip_start(private.research_demo_bookings) OWNER TO localens_checkout_rpc_owner;
ALTER FUNCTION private.research_demo_booking_payload(private.research_demo_bookings) OWNER TO localens_checkout_rpc_owner;
SET LOCAL ROLE postgres;
SET LOCAL ROLE localens_cancellation_customer_rpc_owner;
ALTER FUNCTION public.research_demo_cancel_booking(uuid,text) OWNER TO localens_cancellation_customer_rpc_owner;
SET LOCAL ROLE postgres;
SET LOCAL ROLE localens_identity_rpc_owner;
ALTER FUNCTION private.research_demo_actor(boolean) OWNER TO localens_identity_rpc_owner;
SET LOCAL ROLE postgres;
DO $schema_cleanup$
DECLARE item record; BEGIN
 FOR item IN SELECT * FROM remaining_runtime_added_create LOOP
  EXECUTE format('REVOKE CREATE ON SCHEMA %I FROM %I',item.schema_name,item.owner_name);
 END LOOP;
 DROP TABLE remaining_runtime_added_create;
END $schema_cleanup$;
-- Explicit, type-only signatures cover only the remaining configuration gaps.
SET LOCAL ROLE localens_guide_profile_rpc_owner;
ALTER FUNCTION public.get_own_guide_profile() SET statement_timeout='5s';
ALTER FUNCTION public.get_own_guide_profile() SET lock_timeout='5s';
ALTER FUNCTION public.update_own_guide_profile(text,text) SET statement_timeout='5s';
ALTER FUNCTION public.update_own_guide_profile(text,text) SET lock_timeout='5s';
SET LOCAL ROLE postgres;
SET LOCAL ROLE localens_identity_rpc_owner;
ALTER FUNCTION private.guard_guide_company_fields() SET statement_timeout='5s';
ALTER FUNCTION private.guard_guide_company_fields() SET lock_timeout='5s';
ALTER FUNCTION private.prevent_customer_email_change() SET statement_timeout='5s';
ALTER FUNCTION private.prevent_customer_email_change() SET lock_timeout='5s';
SET LOCAL ROLE postgres;
SET LOCAL ROLE localens_catalog_rpc_owner;
ALTER FUNCTION public.get_research_demo_catalog(text) SET statement_timeout='5s';
ALTER FUNCTION public.get_research_demo_catalog(text) SET lock_timeout='5s';
SET LOCAL ROLE postgres;
SET LOCAL ROLE localens_research_persist_rpc_owner;
ALTER FUNCTION public.research_demo_persist(uuid,text,jsonb,jsonb) SET statement_timeout='5s';
ALTER FUNCTION public.research_demo_persist(uuid,text,jsonb,jsonb) SET lock_timeout='5s';
ALTER FUNCTION public.research_demo_persist_edit(uuid,uuid,text,text,jsonb,jsonb) SET statement_timeout='5s';
ALTER FUNCTION public.research_demo_persist_edit(uuid,uuid,text,text,jsonb,jsonb) SET lock_timeout='5s';
SET LOCAL ROLE postgres;
SET LOCAL ROLE localens_request_customer_rpc_owner;
ALTER FUNCTION public.research_demo_submit(uuid) SET statement_timeout='5s';
ALTER FUNCTION public.research_demo_submit(uuid) SET lock_timeout='5s';
ALTER FUNCTION public.research_demo_begin_revision(uuid,uuid) SET statement_timeout='5s';
ALTER FUNCTION public.research_demo_begin_revision(uuid,uuid) SET lock_timeout='5s';
ALTER FUNCTION public.research_demo_resubmit(uuid,uuid,uuid) SET statement_timeout='5s';
ALTER FUNCTION public.research_demo_resubmit(uuid,uuid,uuid) SET lock_timeout='5s';
ALTER FUNCTION public.research_demo_edit_context(uuid) SET statement_timeout='5s';
ALTER FUNCTION public.research_demo_edit_context(uuid) SET lock_timeout='5s';
ALTER FUNCTION public.research_demo_resume(uuid) SET statement_timeout='5s';
ALTER FUNCTION public.research_demo_resume(uuid) SET lock_timeout='5s';
ALTER FUNCTION public.research_demo_resume_latest(uuid) SET statement_timeout='5s';
ALTER FUNCTION public.research_demo_resume_latest(uuid) SET lock_timeout='5s';
ALTER FUNCTION public.research_demo_list(boolean) SET statement_timeout='5s';
ALTER FUNCTION public.research_demo_list(boolean) SET lock_timeout='5s';
SET LOCAL ROLE postgres;
SET LOCAL ROLE localens_request_admin_rpc_owner;
ALTER FUNCTION public.research_demo_decide(uuid,text,text) SET statement_timeout='5s';
ALTER FUNCTION public.research_demo_decide(uuid,text,text) SET lock_timeout='5s';
ALTER FUNCTION public.research_demo_create_quote(uuid,text,numeric,text,text) SET statement_timeout='5s';
ALTER FUNCTION public.research_demo_create_quote(uuid,text,numeric,text,text) SET lock_timeout='5s';
SET LOCAL ROLE postgres;
SET LOCAL ROLE localens_identity_rpc_owner;
ALTER FUNCTION private.research_demo_actor(boolean) SET statement_timeout='5s';
ALTER FUNCTION private.research_demo_actor(boolean) SET lock_timeout='5s';
SET LOCAL ROLE postgres;
COMMIT;
