-- Test-only, session-local helpers; no persistent grants or alternate payment path.
CREATE OR REPLACE FUNCTION pg_temp.research_claims(p_actor uuid,p_role text DEFAULT 'authenticated')
 RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 PERFORM set_config('role','none',true);
 PERFORM set_config('request.jwt.claim.sub',coalesce(p_actor::text,''),true);
 PERFORM set_config('request.jwt.claim.role',p_role,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role',p_role)::text,true);
 PERFORM set_config('role',p_role,true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.research_call(p_actor uuid,p_sql text,p_role text DEFAULT 'authenticated')
 RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb; message text; state text;
BEGIN
 PERFORM pg_temp.research_claims(p_actor,p_role);
 BEGIN
  EXECUTE p_sql INTO result;
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS message=MESSAGE_TEXT,state=RETURNED_SQLSTATE;
  result:=jsonb_build_object('error',message,'sqlstate',state);
 END;
 PERFORM set_config('role','none',true);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.research_fixture(p_start timestamptz,p_outcome text DEFAULT NULL,p_owner uuid DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE customer uuid:=coalesce(p_owner,gen_random_uuid()); admin uuid:=gen_random_uuid();
 revision uuid; request_id uuid; quote uuid; booking jsonb; req jsonb; plan jsonb;
BEGIN
 INSERT INTO auth.users(id) VALUES(customer) ON CONFLICT DO NOTHING;
 INSERT INTO auth.users(id) VALUES(admin);
 INSERT INTO private.user_roles(user_id,role) VALUES(customer,'customer') ON CONFLICT DO NOTHING;
 INSERT INTO private.user_roles(user_id,role) VALUES(admin,'admin');
 req:=jsonb_build_object('startAt',to_char(p_start AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'durationMinutes',120,'budget',jsonb_build_object('amountMinor',1000000,'currency','VND'),
  'partySize',1,'areas','[]'::jsonb,'lockedStopIds','[]'::jsonb);
 plan:=jsonb_build_object('stops','[{"id":"LL-R01"}]'::jsonb,
  'legs','[{"from":"ORIGIN-CENTER","to":"LL-R01"},{"from":"LL-R01","to":"ORIGIN-CENTER"}]'::jsonb,
  'durationMinutes',120,'totalVnd',100000,'visitAndFoodVnd',100000,'guideVnd',0,'transportVnd',0,
  'returnTime',p_start+interval '2 hours');
 PERFORM pg_temp.research_claims(customer,'service_role');
 revision:=public.research_demo_persist(customer,'local-research-baseline-v1',req,plan);
 PERFORM pg_temp.research_claims(customer);
 request_id:=public.research_demo_submit(revision);
 PERFORM pg_temp.research_claims(admin);
 PERFORM public.research_demo_decide(request_id,'approved','Cancellation test fixture');
 quote:=public.research_demo_create_quote(request_id,'Cancellation test',100000,'VND','Simulated payment');
 PERFORM pg_temp.research_claims(customer);
 booking:=public.research_demo_booking(quote,true);
 IF p_outcome IS NOT NULL THEN
  booking:=public.research_demo_checkout(quote,jsonb_build_object('outcome',p_outcome,
   'travelers','[{"name":"Local Fixture","country":"VN","phone":"+84900000000","email":"fixture@example.invalid"}]'::jsonb));
 END IF;
 PERFORM set_config('role','none',true);
 RETURN booking;
END $$;
