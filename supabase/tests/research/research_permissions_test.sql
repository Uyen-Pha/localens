-- Main only: run after the cancellation candidate and research/fixtures.sql,
-- inside a transaction that the harness ROLLS BACK. Run once BEFORE permissions
-- for RED, then after permissions for GREEN. No Docker/SQL execution by Dev2.
-- Breaks caught: privileged nested actor, missing lock/RLS/helper grants,
-- application-role data access, and overbroad research mutation privileges.
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

-- Main's migration-rejection cases (each in its own outer SAVEPOINT):
-- 1. GRANT UPDATE ON private.research_demo_bookings TO localens_cancellation_customer_rpc_owner;
-- 2-4. GRANT UPDATE / DELETE / TRUNCATE ON private.research_demo_booking_cancellations
--      TO localens_cancellation_customer_rpc_owner; (one privilege per case)
-- 5. GRANT UPDATE (amount) ON private.research_demo_bookings TO localens_checkout_rpc_owner;
-- 6-8. GRANT UPDATE / DELETE / TRUNCATE ON private.research_demo_booking_cancellations
--      TO localens_checkout_rpc_owner; (one privilege per case)
-- Main establishes safe roles/platform prerequisites first, snapshots state,
-- grants the excess privilege, then SAVEPOINTs the transaction before executing
-- the candidate with only its outer BEGIN/COMMIT removed. Expect SQLSTATE 42501
-- and EXCESS_RESEARCH_OWNER_PRIVILEGE. Roll back that execution savepoint and
-- compare state with the snapshot immediately after the seeded grant (no DDL,
-- rows, ACLs or ownership changed). Roll back the outer savepoint to remove the
-- seeded grant. Do not execute this migration as supabase_admin.

SELECT ok(NOT coalesce(has_column_privilege(r.oid,'private.research_demo_bookings',a.attname,'UPDATE'),false),
 wanted.role_name || ' cannot update booking.' || a.attname)
FROM (VALUES
 ('localens_cancellation_customer_rpc_owner',ARRAY['status']::text[]),
 ('localens_checkout_rpc_owner',ARRAY['status','payment_status','paid_at','checkout_details']::text[])
) wanted(role_name,allowed_columns)
LEFT JOIN pg_roles r ON r.rolname=wanted.role_name
CROSS JOIN pg_attribute a
WHERE a.attrelid='private.research_demo_bookings'::regclass AND a.attnum>0 AND NOT a.attisdropped
 AND NOT (a.attname=ANY(wanted.allowed_columns));

SELECT ok(coalesce(has_schema_privilege(r.oid,'auth','USAGE'),false),
 'identity owner can resolve auth schema (platform prerequisite is effective)')
FROM (VALUES ('localens_identity_rpc_owner')) wanted(name)
LEFT JOIN pg_roles r ON r.rolname=wanted.name;

SELECT is(pg_get_userbyid(p.proowner)::text, wanted.owner_name, wanted.signature || ' explicit owner')
FROM (VALUES
 ('public.research_demo_booking(uuid,boolean)','localens_checkout_rpc_owner'),
 ('public.research_demo_checkout(uuid,jsonb)','localens_checkout_rpc_owner'),
 ('public.research_demo_cancel_booking(uuid,text)','localens_cancellation_customer_rpc_owner'),
 ('private.research_demo_actor(boolean)','localens_identity_rpc_owner'),
 ('private.research_demo_cancellation_allowed(text,text,timestamptz,timestamptz,timestamptz)','localens_checkout_rpc_owner'),
 ('private.research_demo_trip_start(private.research_demo_bookings)','localens_checkout_rpc_owner'),
 ('private.research_demo_booking_payload(private.research_demo_bookings)','localens_checkout_rpc_owner')
) wanted(signature,owner_name)
LEFT JOIN pg_proc p ON p.oid=to_regprocedure(wanted.signature);

SELECT ok(coalesce(NOT (r.rolsuper OR r.rolcanlogin OR r.rolbypassrls OR r.rolcreatedb
 OR r.rolcreaterole OR r.rolinherit OR r.rolreplication),false), wanted.name || ' is a safe definer role')
FROM (VALUES ('localens_checkout_rpc_owner'),('localens_cancellation_customer_rpc_owner'),
 ('localens_identity_rpc_owner')) wanted(name)
LEFT JOIN pg_roles r ON r.rolname=wanted.name;

SELECT ok(NOT EXISTS (
 SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
 JOIN pg_roles member ON member.oid=m.member
 WHERE r.rolname IN ('localens_checkout_rpc_owner','localens_cancellation_customer_rpc_owner','localens_identity_rpc_owner')
 AND member.rolname IN ('anon','authenticated','service_role')
), 'application roles have no direct definer memberships');

SELECT ok(p.prosecdef AND 'statement_timeout=5s'=ANY(p.proconfig)
 AND 'search_path=""'=ANY(p.proconfig), 'actor remains a bounded definer')
FROM pg_proc p WHERE p.oid='private.research_demo_actor(boolean)'::regprocedure;
SELECT ok(NOT p.prosecdef, p.proname || ' remains invoker')
FROM pg_proc p WHERE p.oid IN (
 'private.research_demo_cancellation_allowed(text,text,timestamptz,timestamptz,timestamptz)'::regprocedure,
 'private.research_demo_trip_start(private.research_demo_bookings)'::regprocedure,
 'private.research_demo_booking_payload(private.research_demo_bookings)'::regprocedure);

SELECT ok(c.relrowsecurity AND c.relforcerowsecurity, c.relname || ' enforces RLS')
FROM pg_class c WHERE c.oid IN ('private.research_demo_bookings'::regclass,
 'private.research_demo_booking_cancellations'::regclass);

SELECT ok(NOT has_table_privilege(app.name,t.name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),
 app.name || ' has no direct research access: ' || t.name)
FROM (VALUES ('anon'),('authenticated'),('service_role')) app(name)
CROSS JOIN (VALUES ('private.research_demo_bookings'),('private.research_demo_booking_cancellations')) t(name);

SELECT ok(NOT has_function_privilege(app.name,f.signature,'EXECUTE'),
 app.name || ' cannot call ' || f.signature)
FROM (VALUES ('anon'),('authenticated'),('service_role')) app(name)
CROSS JOIN (VALUES
 ('private.research_demo_actor(boolean)'),
 ('private.research_demo_cancellation_allowed(text,text,timestamptz,timestamptz,timestamptz)'),
 ('private.research_demo_trip_start(private.research_demo_bookings)'),
 ('private.research_demo_booking_payload(private.research_demo_bookings)')) f(signature);

SELECT ok(has_function_privilege('authenticated',f.signature,'EXECUTE')
 AND NOT has_function_privilege('anon',f.signature,'EXECUTE')
 AND NOT has_function_privilege('service_role',f.signature,'EXECUTE'), f.signature || ' authenticated-only entry')
FROM (VALUES ('public.research_demo_booking(uuid,boolean)'),('public.research_demo_checkout(uuid,jsonb)'),
 ('public.research_demo_cancel_booking(uuid,text)')) f(signature);

-- OID overloads return NULL for absent roles, giving a useful RED assertion
-- rather than aborting the test before the migration has created the roles.
SELECT ok(coalesce(has_column_privilege(r.oid,'private.research_demo_requests','id','UPDATE'),false),
 wanted.name || ' may lock request rows')
FROM (VALUES ('localens_checkout_rpc_owner'),('localens_cancellation_customer_rpc_owner')) wanted(name)
LEFT JOIN pg_roles r ON r.rolname=wanted.name;
SELECT ok(NOT coalesce(has_column_privilege(r.oid,'private.research_demo_bookings','payment_status','UPDATE'),false),
 'cancellation owner cannot change payment status')
FROM (SELECT oid FROM pg_roles WHERE rolname='localens_cancellation_customer_rpc_owner') r;
SELECT ok(NOT has_table_privilege(r.oid,'private.research_demo_booking_cancellations','UPDATE,DELETE,TRUNCATE'),
 r.rolname || ' cannot mutate cancellation history')
FROM pg_roles r WHERE r.rolname IN ('localens_checkout_rpc_owner','localens_cancellation_customer_rpc_owner');

CREATE TEMP TABLE research_permission_cases(name text PRIMARY KEY,b jsonb,result jsonb);
-- lives_ok catches permission/RLS exceptions and reports a test failure.
SELECT lives_ok($test$
 INSERT INTO research_permission_cases(name,b) VALUES
 ('pending',pg_temp.research_fixture(clock_timestamp()+interval '96 hours')),
 ('paid',pg_temp.research_fixture(clock_timestamp()+interval '96 hours','success')),
 ('failed',pg_temp.research_fixture(clock_timestamp()+interval '96 hours','declined'))
$test$, 'original persist/submit/approve/quote and named-owner booking/checkout graph works');
SELECT is((SELECT count(*) FROM research_permission_cases),3::bigint,'all real workflow fixtures created');

UPDATE research_permission_cases SET result=pg_temp.research_call((b->>'owner_id')::uuid,
 format('SELECT public.research_demo_cancel_booking(%L,%L)',b->>'id','permission-'||name));
SELECT is(result->>'status','cancelled',name || ' named-owner cancellation succeeds') FROM research_permission_cases;
SELECT is(result-ARRAY['status','cancelled_at'],b-ARRAY['status','cancelled_at'],
 name || ' preserves payment and booking snapshot') FROM research_permission_cases;
SELECT is(pg_temp.research_call(gen_random_uuid(),format('SELECT public.research_demo_cancel_booking(%L,%L)',
 b->>'id','foreign'))->>'sqlstate','42501',name || ' actor without customer role denied') FROM research_permission_cases;
SELECT is(pg_temp.research_call((b->>'owner_id')::uuid,format('SELECT public.research_demo_booking(%L,false)',
 b->>'quote_id')),result,name || ' read projection still works') FROM research_permission_cases;

-- Recheck a real customer after suspension: nested identity reads must remain effective.
UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 day'
 WHERE id=(SELECT (b->>'owner_id')::uuid FROM research_permission_cases WHERE name='pending');
SELECT is(pg_temp.research_call((b->>'owner_id')::uuid,format('SELECT public.research_demo_cancel_booking(%L,%L)',
 b->>'id','banned'))->>'sqlstate','42501','banned customer cannot replay cancellation')
FROM research_permission_cases WHERE name='pending';

SELECT * FROM finish();
