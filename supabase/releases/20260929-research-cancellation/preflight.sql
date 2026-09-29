-- Run before the exact 2300 body, in the SAME transaction as permissions.sql.
-- This selected profile deliberately retains the verified postgres-owned helpers.
-- Privilege validation precedes every 2300 CREATE/REPLACE as well as being
-- rechecked by permissions.sql. Existing unrelated core privileges are untouched.
DO $owner_preflight$
DECLARE r record; t record; a record; privilege_name text; allowed boolean;
BEGIN
 SELECT * INTO r FROM pg_roles WHERE rolname='localens_cancellation_customer_rpc_owner';
 IF r.oid IS NULL OR r.rolsuper OR r.rolcanlogin OR r.rolbypassrls OR r.rolinherit
    OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication THEN RAISE EXCEPTION 'SELECTED_UNSAFE_OWNER'; END IF;
 IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid OR (roleid=r.oid AND member<>'postgres'::regrole))
    OR NOT pg_has_role('postgres',r.oid,'SET') THEN RAISE EXCEPTION 'SELECTED_UNSAFE_MEMBERSHIP'; END IF;
 IF has_schema_privilege(r.oid,'auth','USAGE') OR EXISTS(
   SELECT 1 FROM pg_namespace WHERE nspname IN ('public','private','auth') AND has_schema_privilege(r.oid,oid,'CREATE')) THEN
  RAISE EXCEPTION 'SELECTED_EXCESS_SCHEMA_PRIVILEGE';
 END IF;
 FOR t IN SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='private' AND c.relname LIKE 'research_demo_%' AND c.relkind IN ('r','p') LOOP
  IF has_table_privilege(r.oid,t.oid,'DELETE,TRUNCATE,TRIGGER,MAINTAIN')
   OR EXISTS(SELECT 1 FROM pg_class WHERE oid=t.oid AND relowner=r.oid) THEN RAISE EXCEPTION 'SELECTED_EXCESS_RESEARCH_PRIVILEGE'; END IF;
  FOR a IN SELECT attname,attnum FROM pg_attribute WHERE attrelid=t.oid AND attnum>0 AND NOT attisdropped LOOP
   FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] LOOP
    allowed := (privilege_name='SELECT' AND t.relname IN ('research_demo_bookings','research_demo_requests','research_demo_revisions','research_demo_booking_cancellations'))
     OR (privilege_name='INSERT' AND t.relname='research_demo_booking_cancellations')
     OR (privilege_name='UPDATE' AND t.relname='research_demo_bookings' AND a.attname='status')
     OR (privilege_name='UPDATE' AND t.relname='research_demo_requests' AND a.attname='id');
    IF NOT allowed AND has_column_privilege(r.oid,t.oid,a.attnum,privilege_name) THEN RAISE EXCEPTION 'SELECTED_EXCESS_RESEARCH_PRIVILEGE'; END IF;
   END LOOP;
  END LOOP;
 END LOOP;
END $owner_preflight$;
DO $preflight$
DECLARE item record; p record; columns text[]; constraints text[];
BEGIN
 IF current_user<>'postgres' OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolbypassrls) THEN
  RAISE EXCEPTION 'SELECTED_REQUIRES_ORIGINAL_OWNER_CAPABILITY';
 END IF;
 IF NOT has_table_privilege('postgres','auth.users','REFERENCES') THEN RAISE EXCEPTION 'SELECTED_MISSING_EXISTING_FK_AUTHORITY'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint
  WHERE conrelid=to_regclass('private.research_demo_bookings') AND conname='research_demo_bookings_status_check'
   AND contype='c' AND convalidated AND NOT connoinherit
   AND pg_get_constraintdef(oid) IN (
    'CHECK ((status = ANY (ARRAY[''pending_payment''::text, ''confirmed''::text, ''expired''::text])))',
    'CHECK ((status = ANY (ARRAY[''pending_payment''::text, ''confirmed''::text, ''expired''::text, ''cancelled''::text])))')) THEN
  RAISE EXCEPTION 'SELECTED_STATUS_CONSTRAINT_COLLISION';
 END IF;
 FOR item IN SELECT * FROM (VALUES
  ('private.research_demo_actor(boolean)','f741eef8e857b6c6b6ede4b731b9a560','f741eef8e857b6c6b6ede4b731b9a560'),
  ('public.research_demo_booking(uuid,boolean)','dd9cdd374f4fb710b92a7a493f24560d','98a81c68739a6a6a4ff8a0f5594f4bb4'),
  ('public.research_demo_checkout(uuid,jsonb)','f1bc48cd8d8facec42d4a0d0500cd139','d8ad61b600ecaf7d95f9cc4630188c2d')
 ) AS expected(signature,baseline_hash,selected_hash) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(item.signature);
  IF p.oid IS NULL OR p.proowner<>'postgres'::regrole OR NOT p.prosecdef
   OR NOT ('search_path=""'=ANY(coalesce(p.proconfig,ARRAY[]::text[])))
   OR (md5(p.prosrc)<>item.baseline_hash AND md5(replace(p.prosrc,E'\r\n',E'\n'))<>item.selected_hash) THEN
   RAISE EXCEPTION 'SELECTED_INCOMPATIBLE_BASELINE: %',item.signature;
  END IF;
  IF EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
    WHERE (acl.is_grantable AND acl.grantee<>p.proowner) OR acl.grantee NOT IN ('postgres'::regrole,'authenticated'::regrole,
      'localens_cancellation_customer_rpc_owner'::regrole)) THEN RAISE EXCEPTION 'SELECTED_EXCESS_FUNCTION_ACL'; END IF;
  IF item.signature='private.research_demo_actor(boolean)' AND
     (p.proconfig<>ARRAY['search_path=""'] OR has_function_privilege('authenticated',p.oid,'EXECUTE')) THEN
   RAISE EXCEPTION 'SELECTED_INCOMPATIBLE_ACTOR';
  END IF;
 END LOOP;
 FOR item IN SELECT * FROM (VALUES
  ('private.research_demo_cancellation_allowed(text,text,timestamptz,timestamptz,timestamptz)','1003a3a4d58a744ebcc376aa4831849d',false),
  ('private.research_demo_trip_start(private.research_demo_bookings)','2da12f5ca6233b3ba8273c8fda8b4cc1',false),
  ('private.research_demo_booking_payload(private.research_demo_bookings)','a2daee2bddfafbe2b12e75bbbf4c2e90',false),
  ('public.research_demo_cancel_booking(uuid,text)','21cdfebd5ea1e29d7fc025f05650b67a',true)
 ) AS expected(signature,body_hash,definer) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(item.signature);
  IF p.oid IS NOT NULL AND (md5(replace(p.prosrc,E'\r\n',E'\n'))<>item.body_hash
   OR p.prosecdef<>item.definer OR NOT ('search_path=""'=ANY(coalesce(p.proconfig,ARRAY[]::text[])))
   OR p.proowner<> 'postgres'::regrole AND NOT (item.definer AND p.proowner='localens_cancellation_customer_rpc_owner'::regrole)) THEN
   RAISE EXCEPTION 'SELECTED_INCOMPATIBLE_EXISTING_OBJECT: %',item.signature;
  END IF;
  IF p.oid IS NOT NULL AND EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
   WHERE (acl.is_grantable AND acl.grantee<>p.proowner) OR acl.grantee NOT IN ('postgres'::regrole,'localens_cancellation_customer_rpc_owner'::regrole)
     AND NOT (item.definer AND acl.grantee='authenticated'::regrole)) THEN
   RAISE EXCEPTION 'SELECTED_EXCESS_HELPER_ACL';
  END IF;
 END LOOP;
 -- Never silently replace an unrelated policy occupying a reserved name.
 FOR item IN SELECT * FROM (VALUES
  ('private.research_demo_bookings','selected_cancel_read','r'),
  ('private.research_demo_bookings','selected_cancel_update','w'),
  ('private.research_demo_requests','selected_cancel_read','r'),
  ('private.research_demo_requests','selected_cancel_lock','w'),
  ('private.research_demo_revisions','selected_cancel_read','r'),
  ('private.research_demo_booking_cancellations','selected_cancel_read','r'),
  ('private.research_demo_booking_cancellations','selected_cancel_insert','a')
 ) expected(relation_name,policy_name,command) LOOP
  IF EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=to_regclass(item.relation_name) AND polname=item.policy_name
   AND (polcmd::text<>item.command OR NOT polpermissive
    OR polroles<>ARRAY['localens_cancellation_customer_rpc_owner'::regrole::oid]
    OR pg_get_expr(polqual,polrelid) IS DISTINCT FROM CASE WHEN item.command='a' THEN NULL ELSE 'true' END
    OR pg_get_expr(polwithcheck,polrelid) IS DISTINCT FROM CASE WHEN item.command='r' THEN NULL ELSE 'true' END)) THEN
   RAISE EXCEPTION 'SELECTED_POLICY_COLLISION';
  END IF;
 END LOOP;
 IF to_regclass('private.research_demo_booking_cancellations') IS NOT NULL THEN
  SELECT array_agg(attname||':'||format_type(atttypid,atttypmod)||':'||attnotnull::text ORDER BY attnum)
   INTO columns FROM pg_attribute WHERE attrelid='private.research_demo_booking_cancellations'::regclass AND attnum>0 AND NOT attisdropped;
  IF columns IS DISTINCT FROM ARRAY['booking_id:uuid:true','actor_id:uuid:true','cancelled_at:timestamp with time zone:true','idempotency_key:text:true','previous_status:text:true']
   OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='private.research_demo_booking_cancellations'::regclass AND attnum>0
    AND (atthasdef OR attidentity<>'' OR attgenerated<>'' OR attisdropped))
   OR EXISTS(SELECT 1 FROM pg_class WHERE oid='private.research_demo_booking_cancellations'::regclass
      AND (relkind<>'r' OR relispartition OR relowner<>'postgres'::regrole OR NOT relrowsecurity OR NOT relforcerowsecurity)) THEN
   RAISE EXCEPTION 'SELECTED_INCOMPATIBLE_LEDGER';
  END IF;
  SELECT array_agg(pg_get_constraintdef(oid) ORDER BY pg_get_constraintdef(oid)) INTO constraints
    FROM pg_constraint WHERE conrelid='private.research_demo_booking_cancellations'::regclass;
  IF constraints IS DISTINCT FROM ARRAY[
   'CHECK (((length(btrim(idempotency_key)) >= 1) AND (length(btrim(idempotency_key)) <= 200)))',
   'CHECK ((previous_status = ANY (ARRAY[''pending_payment''::text, ''confirmed''::text])))',
   'CHECK (isfinite(cancelled_at))',
   'FOREIGN KEY (actor_id) REFERENCES auth.users(id)',
   'FOREIGN KEY (booking_id) REFERENCES private.research_demo_bookings(id)',
   'PRIMARY KEY (booking_id)','UNIQUE (actor_id, idempotency_key)'] THEN
   RAISE EXCEPTION 'SELECTED_INCOMPATIBLE_LEDGER_CONSTRAINTS';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='private.research_demo_booking_cancellations'::regclass AND NOT tgisinternal
   AND (tgname NOT IN ('research_cancellation_immutable','no_truncate')
     OR tgfoid<> 'private.reject_research_demo_catalog_mutation()'::regprocedure
     OR tgtype<>CASE WHEN tgname='no_truncate' THEN 34 ELSE 27 END OR tgenabled<>'O'
     OR tgnargs<>0 OR tgqual IS NOT NULL
     OR pg_get_triggerdef(oid) IS DISTINCT FROM CASE WHEN tgname='no_truncate' THEN
      'CREATE TRIGGER no_truncate BEFORE TRUNCATE ON private.research_demo_booking_cancellations FOR EACH STATEMENT EXECUTE FUNCTION private.reject_research_demo_catalog_mutation()'
      ELSE 'CREATE TRIGGER research_cancellation_immutable BEFORE DELETE OR UPDATE ON private.research_demo_booking_cancellations FOR EACH ROW EXECUTE FUNCTION private.reject_research_demo_catalog_mutation()' END)) THEN
   RAISE EXCEPTION 'SELECTED_LEDGER_TRIGGER_COLLISION';
  END IF;
 END IF;
END $preflight$;
