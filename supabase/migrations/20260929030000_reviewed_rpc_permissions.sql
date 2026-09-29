-- Local candidate only. Preserve function bodies, signatures, browser ACLs and rows.
BEGIN;
DO $reviewed_owner$
BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'REVIEWED_PERMISSIONS_REQUIRES_POSTGRES'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='localens_reviewed_rpc_owner') THEN
  CREATE ROLE localens_reviewed_rpc_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
 ELSIF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='localens_reviewed_rpc_owner'
  AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)) THEN
  RAISE EXCEPTION 'UNSAFE_REVIEWED_OWNER';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members
  WHERE (roleid='localens_reviewed_rpc_owner'::regrole AND member<>'postgres'::regrole)
     OR member='localens_reviewed_rpc_owner'::regrole) THEN
  RAISE EXCEPTION 'UNSAFE_REVIEWED_MEMBERSHIP';
 END IF;
 -- Reject effective CREATE, including PUBLIC grants, before adding any grants.
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace
  WHERE nspname IN ('public','private','auth')
   AND pg_catalog.has_schema_privilege('localens_reviewed_rpc_owner',oid,'CREATE')) THEN
  RAISE EXCEPTION 'EXCESS_REVIEWED_OWNER_SCHEMA_CREATE';
 END IF;
 IF pg_catalog.has_table_privilege('localens_reviewed_rpc_owner','public.reviewed_demo_bookings','DELETE,TRUNCATE,TRIGGER,REFERENCES,MAINTAIN')
  OR pg_catalog.has_table_privilege('localens_reviewed_rpc_owner','public.reviewed_demo_departures','INSERT,DELETE,TRUNCATE,TRIGGER,REFERENCES,MAINTAIN')
  OR pg_catalog.has_table_privilege('localens_reviewed_rpc_owner','private.user_roles','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES,MAINTAIN')
  OR pg_catalog.has_table_privilege('localens_reviewed_rpc_owner','auth.users','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES,MAINTAIN')
  OR EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE relowner='localens_reviewed_rpc_owner'::regrole)
  OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','private','auth') AND c.relkind IN ('r','p','v','m','f')
      AND c.oid NOT IN ('public.reviewed_demo_bookings'::regclass,'public.reviewed_demo_departures'::regclass,'private.user_roles'::regclass,'auth.users'::regclass)
      AND (pg_catalog.has_table_privilege('localens_reviewed_rpc_owner',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
        OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
          AND pg_catalog.has_column_privilege('localens_reviewed_rpc_owner',c.oid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES'))))
  OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p WHERE p.proowner='localens_reviewed_rpc_owner'::regrole
      AND p.oid <> ALL (ARRAY[
        'public.reviewed_demo_begin(uuid,integer,text)'::regprocedure,
        'public.reviewed_demo_pay(uuid)'::regprocedure,
        'public.reviewed_demo_availability()'::regprocedure,
        'public.reviewed_demo_expire()'::regprocedure,
        'public.reviewed_demo_read(uuid)'::regprocedure,
        'public.reviewed_demo_cancel(uuid)'::regprocedure,
        'public.reviewed_demo_review(uuid,integer,text)'::regprocedure,
        'public.reviewed_demo_checkout(uuid,jsonb)'::regprocedure,
        'public.reviewed_demo_public_reviews(uuid)'::regprocedure,
        'public.reviewed_demo_moderate_review(uuid,boolean)'::regprocedure]::oid[]))
  OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid IN ('auth.users'::regclass,'private.user_roles'::regclass) AND attnum>0 AND NOT attisdropped
    AND pg_catalog.has_column_privilege('localens_reviewed_rpc_owner',attrelid,attnum,'INSERT,UPDATE,REFERENCES'))
  OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='auth.users'::regclass AND attnum>0 AND NOT attisdropped AND attname NOT IN ('id','email')
    AND pg_catalog.has_column_privilege('localens_reviewed_rpc_owner',attrelid,attnum,'SELECT,INSERT,UPDATE,REFERENCES'))
  OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.reviewed_demo_bookings'::regclass AND attnum>0 AND NOT attisdropped
    AND pg_catalog.has_column_privilege('localens_reviewed_rpc_owner',attrelid,attnum,'REFERENCES'))
  OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.reviewed_demo_departures'::regclass AND attnum>0 AND NOT attisdropped
    AND pg_catalog.has_column_privilege('localens_reviewed_rpc_owner',attrelid,attnum,'INSERT,REFERENCES'))
  OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.reviewed_demo_departures'::regclass AND attnum>0 AND NOT attisdropped AND attname<>'id'
    AND pg_catalog.has_column_privilege('localens_reviewed_rpc_owner',attrelid,attnum,'UPDATE')) THEN
  RAISE EXCEPTION 'EXCESS_REVIEWED_OWNER_PRIVILEGE';
 END IF;
END
$reviewed_owner$;
GRANT localens_reviewed_rpc_owner TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT USAGE ON SCHEMA public, private, auth TO localens_reviewed_rpc_owner;
GRANT EXECUTE ON FUNCTION auth.uid() TO localens_reviewed_rpc_owner;
-- Existing checkout resolves the current account email; no credential columns.
GRANT SELECT (id,email) ON auth.users TO localens_reviewed_rpc_owner;
DROP POLICY IF EXISTS reviewed_rpc_account_email ON auth.users;
CREATE POLICY reviewed_rpc_account_email ON auth.users FOR SELECT TO localens_reviewed_rpc_owner
 USING (current_user='localens_reviewed_rpc_owner' AND id=auth.uid());
GRANT SELECT, INSERT, UPDATE ON public.reviewed_demo_bookings TO localens_reviewed_rpc_owner;
-- UPDATE(id) permits existing SELECT FOR UPDATE departure locks without granting other writes.
GRANT SELECT ON public.reviewed_demo_departures TO localens_reviewed_rpc_owner;
GRANT UPDATE (id) ON public.reviewed_demo_departures TO localens_reviewed_rpc_owner;
GRANT SELECT (user_id,role) ON private.user_roles TO localens_reviewed_rpc_owner;
ALTER TABLE public.reviewed_demo_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviewed_demo_bookings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.reviewed_demo_departures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviewed_demo_departures FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reviewed_rpc_select ON public.reviewed_demo_bookings;
CREATE POLICY reviewed_rpc_select ON public.reviewed_demo_bookings FOR SELECT TO localens_reviewed_rpc_owner USING (true);
DROP POLICY IF EXISTS reviewed_rpc_insert ON public.reviewed_demo_bookings;
CREATE POLICY reviewed_rpc_insert ON public.reviewed_demo_bookings FOR INSERT TO localens_reviewed_rpc_owner WITH CHECK (user_id=auth.uid());
-- Expiry/completion processing intentionally covers all rows, as in the existing RPC.
DROP POLICY IF EXISTS reviewed_rpc_update ON public.reviewed_demo_bookings;
CREATE POLICY reviewed_rpc_update ON public.reviewed_demo_bookings FOR UPDATE TO localens_reviewed_rpc_owner USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS reviewed_rpc_departures ON public.reviewed_demo_departures;
CREATE POLICY reviewed_rpc_departures ON public.reviewed_demo_departures FOR SELECT TO localens_reviewed_rpc_owner USING (true);
DROP POLICY IF EXISTS reviewed_rpc_departure_lock ON public.reviewed_demo_departures;
CREATE POLICY reviewed_rpc_departure_lock ON public.reviewed_demo_departures FOR UPDATE TO localens_reviewed_rpc_owner USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS reviewed_rpc_actor_role ON private.user_roles;
CREATE POLICY reviewed_rpc_actor_role ON private.user_roles FOR SELECT TO localens_reviewed_rpc_owner USING (user_id=auth.uid());
GRANT CREATE ON SCHEMA public TO localens_reviewed_rpc_owner;
DO $transfer_reviewed$
DECLARE signature text; existing_owner oid;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'public.reviewed_demo_begin(uuid,integer,text)','public.reviewed_demo_pay(uuid)',
  'public.reviewed_demo_availability()','public.reviewed_demo_expire()',
  'public.reviewed_demo_read(uuid)','public.reviewed_demo_cancel(uuid)',
  'public.reviewed_demo_review(uuid,integer,text)','public.reviewed_demo_checkout(uuid,jsonb)',
  'public.reviewed_demo_public_reviews(uuid)','public.reviewed_demo_moderate_review(uuid,boolean)'
 ] LOOP
  SELECT proowner INTO existing_owner FROM pg_catalog.pg_proc WHERE oid=signature::regprocedure;
  IF existing_owner='postgres'::regrole THEN
   NULL; -- The explicit statements below transfer only the validated signatures.
  ELSIF existing_owner IS DISTINCT FROM 'localens_reviewed_rpc_owner'::regrole THEN
   RAISE EXCEPTION 'UNEXPECTED_REVIEWED_FUNCTION_OWNER: %',signature;
  END IF;
 END LOOP;
END
$transfer_reviewed$;
ALTER FUNCTION public.reviewed_demo_begin(uuid,integer,text) OWNER TO localens_reviewed_rpc_owner;
ALTER FUNCTION public.reviewed_demo_pay(uuid) OWNER TO localens_reviewed_rpc_owner;
ALTER FUNCTION public.reviewed_demo_availability() OWNER TO localens_reviewed_rpc_owner;
ALTER FUNCTION public.reviewed_demo_expire() OWNER TO localens_reviewed_rpc_owner;
ALTER FUNCTION public.reviewed_demo_read(uuid) OWNER TO localens_reviewed_rpc_owner;
ALTER FUNCTION public.reviewed_demo_cancel(uuid) OWNER TO localens_reviewed_rpc_owner;
ALTER FUNCTION public.reviewed_demo_review(uuid,integer,text) OWNER TO localens_reviewed_rpc_owner;
ALTER FUNCTION public.reviewed_demo_checkout(uuid,jsonb) OWNER TO localens_reviewed_rpc_owner;
ALTER FUNCTION public.reviewed_demo_public_reviews(uuid) OWNER TO localens_reviewed_rpc_owner;
ALTER FUNCTION public.reviewed_demo_moderate_review(uuid,boolean) OWNER TO localens_reviewed_rpc_owner;
REVOKE CREATE ON SCHEMA public FROM localens_reviewed_rpc_owner;
SET LOCAL ROLE localens_reviewed_rpc_owner;
-- postgres schedules maintenance without inheriting this owner's privileges.
GRANT EXECUTE ON FUNCTION public.reviewed_demo_expire() TO postgres;
ALTER FUNCTION public.reviewed_demo_begin(uuid,integer,text) SET statement_timeout = '5s';
ALTER FUNCTION public.reviewed_demo_begin(uuid,integer,text) SET lock_timeout = '5s';
ALTER FUNCTION public.reviewed_demo_pay(uuid) SET statement_timeout = '5s';
ALTER FUNCTION public.reviewed_demo_pay(uuid) SET lock_timeout = '5s';
ALTER FUNCTION public.reviewed_demo_availability() SET statement_timeout = '5s';
ALTER FUNCTION public.reviewed_demo_availability() SET lock_timeout = '5s';
ALTER FUNCTION public.reviewed_demo_expire() SET statement_timeout = '5s';
ALTER FUNCTION public.reviewed_demo_expire() SET lock_timeout = '5s';
ALTER FUNCTION public.reviewed_demo_read(uuid) SET statement_timeout = '5s';
ALTER FUNCTION public.reviewed_demo_read(uuid) SET lock_timeout = '5s';
ALTER FUNCTION public.reviewed_demo_cancel(uuid) SET statement_timeout = '5s';
ALTER FUNCTION public.reviewed_demo_cancel(uuid) SET lock_timeout = '5s';
ALTER FUNCTION public.reviewed_demo_review(uuid,integer,text) SET statement_timeout = '5s';
ALTER FUNCTION public.reviewed_demo_review(uuid,integer,text) SET lock_timeout = '5s';
ALTER FUNCTION public.reviewed_demo_checkout(uuid,jsonb) SET statement_timeout = '5s';
ALTER FUNCTION public.reviewed_demo_checkout(uuid,jsonb) SET lock_timeout = '5s';
ALTER FUNCTION public.reviewed_demo_public_reviews(uuid) SET statement_timeout = '5s';
ALTER FUNCTION public.reviewed_demo_public_reviews(uuid) SET lock_timeout = '5s';
ALTER FUNCTION public.reviewed_demo_moderate_review(uuid,boolean) SET statement_timeout = '5s';
ALTER FUNCTION public.reviewed_demo_moderate_review(uuid,boolean) SET lock_timeout = '5s';
SET LOCAL ROLE postgres;
COMMIT;
