-- Test only. Main loads fixtures.sql first, then this file BEFORE deadline SQL
-- inside its outer rollback transaction. Snapshot business rows AFTER this seed.
-- Never load on the fresh full-release path: the 72h guard is already installed.
-- No disabled triggers, changed revision timestamps or substitute payment RPCs.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='private.research_demo_requests'::regclass
           AND tgname='personalized_request_deadline' AND NOT tgisinternal) THEN
  RAISE EXCEPTION 'PREUPGRADE_FIXTURE_REQUIRES_ORIGINAL_BASELINE';
 END IF;
END $$;

CREATE TEMP TABLE research_deadline_preupgrade_cases(
 name text PRIMARY KEY,customer uuid NOT NULL,admin uuid NOT NULL,
 revision uuid NOT NULL,request_id uuid NOT NULL,departure timestamptz NOT NULL
);

CREATE FUNCTION pg_temp.deadline_seed_request(p_name text,p_hours integer,p_approve boolean)
 RETURNS void LANGUAGE plpgsql AS $$
DECLARE customer uuid:=gen_random_uuid(); admin uuid:=gen_random_uuid();
 departure timestamptz:=clock_timestamp()+make_interval(hours=>p_hours);
 req jsonb; plan jsonb; revision uuid; request_id uuid;
BEGIN
 INSERT INTO auth.users(id) VALUES(customer),(admin);
 INSERT INTO private.user_roles(user_id,role) VALUES(customer,'customer'),(admin,'admin');
 req:=jsonb_build_object('startAt',to_char(departure AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'durationMinutes',120,'budget',jsonb_build_object('amountMinor',1000000,'currency','VND'),
  'partySize',1,'areas','[]'::jsonb,'lockedStopIds','[]'::jsonb);
 plan:=jsonb_build_object('stops','[{"id":"LL-R01"}]'::jsonb,
  'legs','[{"from":"ORIGIN-CENTER","to":"LL-R01"},{"from":"LL-R01","to":"ORIGIN-CENTER"}]'::jsonb,
  'durationMinutes',120,'totalVnd',100000,'visitAndFoodVnd',100000,'guideVnd',0,'transportVnd',0,
  'returnTime',departure+interval '2 hours');
 PERFORM pg_temp.research_claims(customer,'service_role');
 revision:=public.research_demo_persist(customer,'local-research-baseline-v1',req,plan);
 PERFORM pg_temp.research_claims(customer);
 request_id:=public.research_demo_submit(revision);
 IF p_approve THEN
  PERFORM pg_temp.research_claims(admin);
  PERFORM public.research_demo_decide(request_id,'approved','Historical deadline fixture');
 END IF;
 PERFORM set_config('role','none',true);
 INSERT INTO pg_temp.research_deadline_preupgrade_cases VALUES(p_name,customer,admin,revision,request_id,departure);
END $$;

SELECT pg_temp.deadline_seed_request('quote60',60,true);
SELECT pg_temp.deadline_seed_request('quote23',23,true);
SELECT pg_temp.deadline_seed_request('return60',60,false);
SELECT pg_temp.deadline_seed_request('reject96',96,false);
SELECT pg_temp.deadline_seed_request('resubmit96',96,false);
