BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(24);
SELECT ok(EXISTS(SELECT 1 FROM pg_roles WHERE rolname='localens_reviewed_rpc_owner' AND NOT rolcanlogin AND NOT rolbypassrls AND NOT rolsuper), 'reviewed owner cannot login or bypass RLS');
SELECT is((SELECT count(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='public' AND p.proname IN ('reviewed_demo_begin','reviewed_demo_pay','reviewed_demo_availability','reviewed_demo_expire','reviewed_demo_read','reviewed_demo_cancel','reviewed_demo_review','reviewed_demo_checkout','reviewed_demo_public_reviews','reviewed_demo_moderate_review') AND r.rolname='localens_reviewed_rpc_owner'),10,'all ten reviewed RPCs have bounded owner');
SELECT is((SELECT count(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'reviewed_demo_%' AND p.proconfig @> ARRAY['statement_timeout=5s','lock_timeout=5s']),10,'reviewed RPCs have query and lock timeouts');
SELECT ok((SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class WHERE oid IN ('public.reviewed_demo_bookings'::regclass,'public.reviewed_demo_departures'::regclass)), 'both reviewed tables force RLS');
SELECT ok(NOT has_table_privilege('authenticated','public.reviewed_demo_bookings','UPDATE'), 'browser cannot update booking directly');
SELECT ok(NOT has_function_privilege('anon','public.reviewed_demo_cancel(uuid)','EXECUTE'), 'anonymous cancellation forbidden');
SELECT ok(has_function_privilege('authenticated','public.reviewed_demo_cancel(uuid)','EXECUTE'), 'authenticated cancellation retained');
SELECT lives_ok('SET LOCAL ROLE anon; SELECT public.reviewed_demo_availability(); RESET ROLE;', 'anonymous availability still works through bounded owner');
-- Synthetic rows exist only inside this rolled-back transaction.
INSERT INTO public.reviewed_demo_departures(id,title_vi,title_en,start_at,end_at,unit_price,capacity)
VALUES ('d1800000-9999-4000-8000-000000000001','Permission test','Permission test',clock_timestamp()+interval '4 days',clock_timestamp()+interval '4 days 4 hours',100000,15);
INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
VALUES ('00000000-9999-4000-8000-000000000001','authenticated','authenticated','reviewed-permissions@example.invalid','','{}','{}',now(),now());
INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
VALUES ('00000000-9999-4000-8000-000000000002','authenticated','authenticated','other-permissions@example.invalid','','{}','{}',now(),now());
SELECT set_config('request.jwt.claim.sub','00000000-9999-4000-8000-000000000001',true);
SET LOCAL ROLE localens_reviewed_rpc_owner;
SELECT is((SELECT email::text FROM auth.users WHERE id='00000000-9999-4000-8000-000000000001'),'reviewed-permissions@example.invalid','bounded owner reads current account email');
SELECT is((SELECT count(id)::integer FROM auth.users WHERE id='00000000-9999-4000-8000-000000000002'),0,'bounded owner cannot read another account email');
SELECT ok(NOT has_column_privilege(current_user,'auth.users','email','UPDATE'),'bounded owner cannot change account email');
SET LOCAL ROLE postgres;
SELECT lives_ok($test$SET LOCAL ROLE authenticated;
 SELECT set_config('test.reviewed_booking',(public.reviewed_demo_begin('d1800000-9999-4000-8000-000000000001',1,'permissions-local-check')->>'id'),true);
 RESET ROLE;$test$,'customer can reserve after owner transfer');
SELECT lives_ok($test$SET LOCAL ROLE authenticated;
 SELECT public.reviewed_demo_checkout(current_setting('test.reviewed_booking')::uuid,'{"name":"Local test","phone":"0901234567","passengers":["Local test"],"outcome":"success"}'::jsonb);
 RESET ROLE;$test$,'customer can simulate payment after owner transfer');
SELECT is((SELECT status FROM public.reviewed_demo_bookings WHERE id=current_setting('test.reviewed_booking')::uuid),'confirmed','checkout actually confirms booking');
SELECT is((SELECT checkout_details->>'email' FROM public.reviewed_demo_bookings WHERE id=current_setting('test.reviewed_booking')::uuid),'reviewed-permissions@example.invalid','checkout retains authenticated email with auth RLS');
SELECT ok(NOT has_column_privilege('localens_reviewed_rpc_owner','auth.users','encrypted_password','SELECT'),'RPC owner cannot read password hashes');
SELECT lives_ok($test$SET LOCAL ROLE authenticated;
 SELECT public.reviewed_demo_cancel(current_setting('test.reviewed_booking')::uuid);
 RESET ROLE;$test$,'customer can cancel confirmed future booking after owner transfer');
SELECT is((SELECT status FROM public.reviewed_demo_bookings WHERE id=current_setting('test.reviewed_booking')::uuid),'cancelled','cancellation actually persisted inside test transaction');
SELECT set_config('request.jwt.claim.sub','00000000-9999-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT public.reviewed_demo_cancel(current_setting(''test.reviewed_booking'')::uuid)','P0001','NOT_FOUND','other customer cannot replay cancellation');
SELECT is((SELECT count(*)::integer FROM public.reviewed_demo_bookings WHERE id=current_setting('test.reviewed_booking')::uuid),0,'other customer cannot read booking directly');
SET LOCAL ROLE postgres;
SELECT ok(NOT has_table_privilege('localens_reviewed_rpc_owner','public.reviewed_demo_bookings','DELETE'),'RPC owner has no booking delete privilege');
SELECT ok(NOT has_column_privilege('localens_reviewed_rpc_owner','public.reviewed_demo_departures','capacity','UPDATE'),'RPC owner cannot change departure capacity');
SELECT lives_ok('SELECT public.reviewed_demo_expire()','non-superuser postgres can still run scheduled maintenance');
SELECT ok(NOT has_function_privilege('authenticated','public.reviewed_demo_expire()','EXECUTE'),'browser cannot call scheduled maintenance');
SELECT * FROM finish();
ROLLBACK;
