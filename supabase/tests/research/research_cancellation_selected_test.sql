-- Additional selected-release checks; existing 123-case suite remains unchanged.
DO $test$
DECLARE b jsonb; result jsonb; before_row jsonb;
BEGIN
 IF has_schema_privilege('postgres','auth','USAGE WITH GRANT OPTION') THEN
  RAISE EXCEPTION 'TEST_REQUIRES_NO_PLATFORM_GRANT_OPTION';
 END IF;
 IF has_schema_privilege('localens_cancellation_customer_rpc_owner','auth','USAGE') THEN
  RAISE EXCEPTION 'TEST_OWNER_AUTH_ACCESS';
 END IF;
 IF has_column_privilege('localens_cancellation_customer_rpc_owner','private.research_demo_bookings','payment_status','UPDATE')
  OR has_table_privilege('localens_cancellation_customer_rpc_owner','private.research_demo_bookings','DELETE,TRUNCATE') THEN
  RAISE EXCEPTION 'TEST_EXCESS_WRITE';
 END IF;
 IF has_function_privilege('authenticated','private.research_demo_actor(boolean)','EXECUTE')
  OR has_function_privilege('anon','public.research_demo_cancel_booking(uuid,text)','EXECUTE')
  OR has_function_privilege('service_role','public.research_demo_cancel_booking(uuid,text)','EXECUTE') THEN
  RAISE EXCEPTION 'TEST_EXCESS_ENTRY_ACCESS';
 END IF;
 b:=pg_temp.research_fixture(clock_timestamp()+interval '96 hours');
 SELECT to_jsonb(t) INTO before_row FROM private.research_demo_bookings t WHERE id=(b->>'id')::uuid;
 UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 day' WHERE id=(b->>'owner_id')::uuid;
 result:=pg_temp.research_call((b->>'owner_id')::uuid,
  format('SELECT public.research_demo_cancel_booking(%L,%L)',b->>'id','selected-banned'));
 IF result->>'sqlstate' IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'TEST_BANNED_CUSTOMER_NOT_DENIED'; END IF;
 IF before_row IS DISTINCT FROM (SELECT to_jsonb(t) FROM private.research_demo_bookings t WHERE id=(b->>'id')::uuid)
  OR EXISTS(SELECT 1 FROM private.research_demo_booking_cancellations WHERE booking_id=(b->>'id')::uuid) THEN
  RAISE EXCEPTION 'TEST_BANNED_DENIAL_MUTATED_STATE';
 END IF;
END $test$;
