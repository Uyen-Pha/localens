-- Selected-release permission integration, executed inside the caller transaction.
DO $$ BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'SELECTED_REQUIRES_POSTGRES'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('private.research_demo_actor(boolean)')
   AND proowner='postgres'::regrole AND prosecdef AND proconfig=ARRAY['search_path=""']
   AND md5(prosrc)='f741eef8e857b6c6b6ede4b731b9a560') THEN
  RAISE EXCEPTION 'SELECTED_INCOMPATIBLE_ACTOR';
 END IF;
END $$;

-- Reuse an existing safe owner; do not create roles or alter memberships.
DO $guard$
DECLARE r record; t record; a record; privilege_name text; allowed boolean;
BEGIN
 SELECT * INTO r FROM pg_roles WHERE rolname='localens_cancellation_customer_rpc_owner';
 IF r.oid IS NULL OR r.rolsuper OR r.rolcanlogin OR r.rolbypassrls OR r.rolinherit
    OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication THEN
  RAISE EXCEPTION 'SELECTED_UNSAFE_OWNER';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member=r.oid OR (roleid=r.oid AND member<>'postgres'::regrole))
    OR NOT pg_has_role('postgres',r.oid,'SET') THEN
  RAISE EXCEPTION 'SELECTED_UNSAFE_MEMBERSHIP';
 END IF;
 IF has_schema_privilege(r.oid,'auth','USAGE') OR EXISTS (
  SELECT 1 FROM pg_namespace WHERE nspname IN ('public','private','auth') AND has_schema_privilege(r.oid,oid,'CREATE')
 ) THEN RAISE EXCEPTION 'SELECTED_EXCESS_SCHEMA_PRIVILEGE'; END IF;
 FOR t IN SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='private' AND c.relname LIKE 'research_demo_%' AND c.relkind IN ('r','p') LOOP
  IF has_table_privilege(r.oid,t.oid,'DELETE,TRUNCATE,TRIGGER,MAINTAIN')
     OR EXISTS(SELECT 1 FROM pg_class WHERE oid=t.oid AND relowner=r.oid) THEN
   RAISE EXCEPTION 'SELECTED_EXCESS_RESEARCH_PRIVILEGE';
  END IF;
  FOR a IN SELECT attname,attnum FROM pg_attribute WHERE attrelid=t.oid AND attnum>0 AND NOT attisdropped LOOP
   FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] LOOP
    allowed := (privilege_name='SELECT' AND t.relname IN ('research_demo_bookings','research_demo_requests','research_demo_revisions','research_demo_booking_cancellations'))
      OR (privilege_name='INSERT' AND t.relname='research_demo_booking_cancellations')
      OR (privilege_name='UPDATE' AND t.relname='research_demo_bookings' AND a.attname='status')
      OR (privilege_name='UPDATE' AND t.relname='research_demo_requests' AND a.attname='id');
    IF NOT allowed AND has_column_privilege(r.oid,t.oid,a.attnum,privilege_name) THEN
     RAISE EXCEPTION 'SELECTED_EXCESS_RESEARCH_PRIVILEGE';
    END IF;
   END LOOP;
  END LOOP;
 END LOOP;
END $guard$;

-- Pin the unchanged 2300 bodies before adding capabilities.
DO $bodies$
DECLARE item record;
BEGIN
 FOR item IN SELECT * FROM (VALUES
  ('public.research_demo_booking(uuid,boolean)','98a81c68739a6a6a4ff8a0f5594f4bb4',true),
  ('public.research_demo_checkout(uuid,jsonb)','d8ad61b600ecaf7d95f9cc4630188c2d',true),
  ('private.research_demo_cancellation_allowed(text,text,timestamptz,timestamptz,timestamptz)','1003a3a4d58a744ebcc376aa4831849d',false),
  ('private.research_demo_trip_start(private.research_demo_bookings)','2da12f5ca6233b3ba8273c8fda8b4cc1',false),
  ('private.research_demo_booking_payload(private.research_demo_bookings)','a2daee2bddfafbe2b12e75bbbf4c2e90',false)
 ) AS expected(signature,body_hash,definer) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure(item.signature) AND proowner='postgres'::regrole
    AND prosecdef=item.definer AND md5(replace(prosrc,E'\r\n',E'\n'))=item.body_hash AND 'search_path=""'=ANY(proconfig)) THEN
   RAISE EXCEPTION 'SELECTED_INCOMPATIBLE_BODY: %',item.signature;
  END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.research_demo_cancel_booking(uuid,text)')
  AND proowner IN ('postgres'::regrole,'localens_cancellation_customer_rpc_owner'::regrole)
  AND prosecdef AND md5(replace(prosrc,E'\r\n',E'\n'))='21cdfebd5ea1e29d7fc025f05650b67a'
  AND proconfig=ARRAY['search_path=""','lock_timeout=5s','statement_timeout=5s']) THEN
  RAISE EXCEPTION 'SELECTED_INCOMPATIBLE_CANCELLATION';
 END IF;
END $bodies$;

GRANT USAGE ON SCHEMA public,private TO localens_cancellation_customer_rpc_owner;
GRANT EXECUTE ON FUNCTION private.research_demo_actor(boolean),
 private.research_demo_cancellation_allowed(text,text,timestamptz,timestamptz,timestamptz),
 private.research_demo_trip_start(private.research_demo_bookings),
 private.research_demo_booking_payload(private.research_demo_bookings)
 TO localens_cancellation_customer_rpc_owner;
GRANT SELECT ON private.research_demo_bookings,private.research_demo_requests,
 private.research_demo_revisions,private.research_demo_booking_cancellations TO localens_cancellation_customer_rpc_owner;
GRANT UPDATE(status) ON private.research_demo_bookings TO localens_cancellation_customer_rpc_owner;
GRANT UPDATE(id) ON private.research_demo_requests TO localens_cancellation_customer_rpc_owner;
GRANT INSERT ON private.research_demo_booking_cancellations TO localens_cancellation_customer_rpc_owner;

DROP POLICY IF EXISTS selected_cancel_read ON private.research_demo_bookings;
CREATE POLICY selected_cancel_read ON private.research_demo_bookings FOR SELECT TO localens_cancellation_customer_rpc_owner USING (true);
DROP POLICY IF EXISTS selected_cancel_update ON private.research_demo_bookings;
CREATE POLICY selected_cancel_update ON private.research_demo_bookings FOR UPDATE TO localens_cancellation_customer_rpc_owner USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS selected_cancel_read ON private.research_demo_requests;
CREATE POLICY selected_cancel_read ON private.research_demo_requests FOR SELECT TO localens_cancellation_customer_rpc_owner USING (true);
DROP POLICY IF EXISTS selected_cancel_lock ON private.research_demo_requests;
CREATE POLICY selected_cancel_lock ON private.research_demo_requests FOR UPDATE TO localens_cancellation_customer_rpc_owner USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS selected_cancel_read ON private.research_demo_revisions;
CREATE POLICY selected_cancel_read ON private.research_demo_revisions FOR SELECT TO localens_cancellation_customer_rpc_owner USING (true);
DROP POLICY IF EXISTS selected_cancel_read ON private.research_demo_booking_cancellations;
CREATE POLICY selected_cancel_read ON private.research_demo_booking_cancellations FOR SELECT TO localens_cancellation_customer_rpc_owner USING (true);
DROP POLICY IF EXISTS selected_cancel_insert ON private.research_demo_booking_cancellations;
CREATE POLICY selected_cancel_insert ON private.research_demo_booking_cancellations FOR INSERT TO localens_cancellation_customer_rpc_owner WITH CHECK (true);

GRANT CREATE ON SCHEMA public TO localens_cancellation_customer_rpc_owner;
ALTER FUNCTION public.research_demo_cancel_booking(uuid,text) OWNER TO localens_cancellation_customer_rpc_owner;
REVOKE CREATE ON SCHEMA public FROM localens_cancellation_customer_rpc_owner;
SET LOCAL ROLE localens_cancellation_customer_rpc_owner;
REVOKE ALL ON FUNCTION public.research_demo_cancel_booking(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.research_demo_cancel_booking(uuid,text) TO authenticated;
SET LOCAL ROLE postgres;
