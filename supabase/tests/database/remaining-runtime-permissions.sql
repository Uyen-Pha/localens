-- Run only inside the rollback transaction supplied by the local runner.
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path=public,private,extensions,pg_catalog;
SELECT no_plan();
SELECT is((SELECT count(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.prosecdef AND p.proowner='postgres'::regrole),0,'no application definer retains postgres ownership');
SELECT is((SELECT count(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.prosecdef AND NOT coalesce(p.proconfig,'{}') @> ARRAY['statement_timeout=5s']),0,'all application definers have bounded statement timeout settings');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='private.research_demo_revision_links'::regclass),'revision links force RLS');
SELECT ok(NOT has_function_privilege('authenticated','public.research_demo_persist(uuid,text,jsonb,jsonb)','EXECUTE') AND has_function_privilege('service_role','public.research_demo_persist(uuid,text,jsonb,jsonb)','EXECUTE'),'persistence remains service only');
SELECT ok(NOT has_function_privilege('anon','public.get_own_guide_profile()','EXECUTE'),'anonymous guide access stays denied');
-- Full service/customer/admin path: missing table grants, sequence privileges,
-- actor execution or policies fail here, rather than only in catalog assertions.
CREATE TEMP TABLE remaining_fixture AS SELECT pg_temp.research_fixture(now()+interval '10 days','success') AS booking;
SELECT ok((SELECT booking->>'id' IS NOT NULL FROM remaining_fixture),'service persist, customer submit, admin approve/quote and customer checkout work');
-- Column ACLs and RLS must jointly prevent cross-account/credential reads.
-- Test-only access to pgTAP; not part of the migration permission graph.
GRANT USAGE ON SCHEMA extensions TO localens_guide_profile_rpc_owner,localens_research_persist_rpc_owner;
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='auth.users'::regclass AND attnum>0 AND NOT attisdropped AND attname NOT IN ('id','email','banned_until') AND has_column_privilege('localens_guide_profile_rpc_owner',attrelid,attnum,'SELECT')),'guide owner cannot read any other auth column');
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='auth.users'::regclass AND attnum>0 AND NOT attisdropped AND attname NOT IN ('id','banned_until') AND has_column_privilege('localens_research_persist_rpc_owner',attrelid,attnum,'SELECT')),'service persistence cannot read email or credentials');
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_attribute a CROSS JOIN (VALUES ('localens_guide_profile_rpc_owner'),('localens_research_persist_rpc_owner')) r(role_name) WHERE a.attrelid='auth.users'::regclass AND attnum>0 AND NOT attisdropped AND has_column_privilege(r.role_name,a.attrelid,a.attnum,'INSERT,UPDATE,REFERENCES')),'neither new owner can write auth columns');
SELECT ok(NOT has_table_privilege('localens_guide_profile_rpc_owner','auth.users','DELETE,TRUNCATE,TRIGGER') AND NOT has_table_privilege('localens_research_persist_rpc_owner','auth.users','DELETE,TRUNCATE,TRIGGER'),'neither new owner can delete or attach auth triggers');
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('localens_guide_profile_rpc_owner','localens_research_persist_rpc_owner') AND (rolcanlogin OR rolsuper OR rolinherit OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)),'new owners are bounded non-login roles');
SELECT ok(NOT pg_has_role('authenticated','localens_guide_profile_rpc_owner','MEMBER') AND NOT pg_has_role('service_role','localens_research_persist_rpc_owner','MEMBER'),'API roles cannot assume new owners');
INSERT INTO auth.users(id,email) VALUES ('00000000-0000-4000-8000-000000009811','remaining-guide@example.invalid'),('00000000-0000-4000-8000-000000009812','remaining-other@example.invalid');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009811',true);
SET LOCAL ROLE localens_guide_profile_rpc_owner;
SELECT is((SELECT email::text FROM auth.users WHERE id=auth.uid()),'remaining-guide@example.invalid','guide owner reads its own email');
SELECT is((SELECT count(*)::integer FROM auth.users WHERE id='00000000-0000-4000-8000-000000009812'),0,'guide owner cannot read another email');
SELECT throws_ok($$SELECT encrypted_password FROM auth.users$$,'42501',NULL,'guide credential read is denied at execution');
SELECT throws_ok($$UPDATE auth.users SET email='changed@example.invalid' WHERE id=auth.uid()$$,'42501',NULL,'guide auth write is denied at execution');
RESET ROLE;
SET LOCAL ROLE localens_research_persist_rpc_owner;
SELECT throws_ok($$SELECT email FROM auth.users$$,'42501',NULL,'service owner email read is denied at execution');
SELECT throws_ok($$UPDATE auth.users SET banned_until=NULL$$,'42501',NULL,'service owner auth write is denied at execution');
RESET ROLE;
-- Identity guard still checks the target account during an auth-admin change.
SELECT throws_ok($$UPDATE auth.users SET email='changed@example.invalid' WHERE id='00000000-0000-4000-8000-000000009812'$$,'23514','Customer sign-in email cannot be changed','email guard retains customer restriction');

CREATE TEMP TABLE remaining_flow(actor uuid,admin uuid,revision uuid,request_id uuid,child uuid,request jsonb,plan jsonb);
INSERT INTO remaining_flow(actor,admin,request,plan) VALUES(gen_random_uuid(),gen_random_uuid(),
 jsonb_build_object('startAt',now()+interval '12 days','durationMinutes',120,'budget',jsonb_build_object('amountMinor',1000000,'currency','VND'),'partySize',1,'areas','[]'::jsonb,'lockedStopIds','[]'::jsonb),
 jsonb_build_object('stops','[{"id":"LL-R01"}]'::jsonb,'legs','[{"from":"ORIGIN-CENTER","to":"LL-R01"},{"from":"LL-R01","to":"ORIGIN-CENTER"}]'::jsonb,'durationMinutes',120,'totalVnd',100000,'visitAndFoodVnd',100000,'guideVnd',0,'transportVnd',0,'returnTime',now()+interval '12 days 2 hours'));
INSERT INTO auth.users(id) SELECT actor FROM remaining_flow UNION ALL SELECT admin FROM remaining_flow;
INSERT INTO private.user_roles(user_id,role) SELECT admin,'admin'::public.app_role FROM remaining_flow;
UPDATE remaining_flow SET revision=(pg_temp.research_call(actor,format('SELECT to_jsonb(public.research_demo_persist(%L,%L,%L::jsonb,%L::jsonb))',actor,'local-research-baseline-v1',request,plan),'service_role')#>>'{}')::uuid;
SELECT ok((SELECT revision IS NOT NULL FROM remaining_flow),'service persist creates a draft');
SELECT ok((SELECT pg_temp.research_call(actor,$$SELECT public.get_research_demo_catalog('local-research-baseline-v1')$$)->>'version'='local-research-baseline-v1' FROM remaining_flow),'authenticated catalog read works');
SELECT ok((SELECT pg_temp.research_call(actor,format('SELECT public.research_demo_edit_context(%L)',revision))->>'catalogVersion'='local-research-baseline-v1' FROM remaining_flow),'customer edit context works');
UPDATE remaining_flow SET child=(pg_temp.research_call(actor,format('SELECT public.research_demo_persist_edit(%L,%L,%L,%L,%L::jsonb,%L::jsonb)',actor,revision,'remaining-edit-key-01','local-research-baseline-v1',request,plan),'service_role')->>'revisionId')::uuid;
SELECT ok((SELECT child IS NOT NULL AND child<>revision FROM remaining_flow),'service edit creates child and revision link under FORCE RLS');
SELECT is((SELECT pg_temp.research_call(actor,format('SELECT public.research_demo_resume_latest(%L)',revision))->>'revisionId' FROM remaining_flow),(SELECT child::text FROM remaining_flow),'resume latest traverses revision links');
SELECT is((SELECT pg_temp.research_call(actor,format('SELECT public.research_demo_persist_edit(%L,%L,%L,%L,%L::jsonb,%L::jsonb)',actor,revision,'remaining-edit-key-01','local-research-baseline-v1',request,plan),'service_role')->>'revisionId' FROM remaining_flow),(SELECT child::text FROM remaining_flow),'service edit replays idempotently');
SELECT is((SELECT pg_temp.research_call('00000000-0000-4000-8000-000000009812',format('SELECT public.research_demo_resume(%L)',child))->>'sqlstate' FROM remaining_flow),'42501','other customer cannot resume revision');
UPDATE remaining_flow SET request_id=(pg_temp.research_call(actor,format('SELECT to_jsonb(public.research_demo_submit(%L))',child))#>>'{}')::uuid;
SELECT ok((SELECT request_id IS NOT NULL FROM remaining_flow),'customer submits edited revision');
SELECT is((SELECT pg_temp.research_call(actor,format('SELECT to_jsonb(public.research_demo_decide(%L,%L,%L))',request_id,'approved','no'))->>'sqlstate' FROM remaining_flow),'42501','customer cannot make admin decision');
SELECT ok((SELECT NOT (pg_temp.research_call(admin,format('SELECT to_jsonb(public.research_demo_decide(%L,%L,%L))',request_id,'changes_requested','Please revise')) ? 'error') FROM remaining_flow),'admin requests changes');
UPDATE remaining_flow SET revision=child;
UPDATE remaining_flow SET child=(pg_temp.research_call(actor,format('SELECT to_jsonb(public.research_demo_begin_revision(%L,%L))',request_id,revision))#>>'{}')::uuid;
SELECT ok((SELECT child<>revision FROM remaining_flow),'begin revision copies revision and stops');
SELECT is((SELECT pg_temp.research_call(actor,format('SELECT to_jsonb(public.research_demo_resubmit(%L,%L,%L))',request_id,revision,child))#>>'{}' FROM remaining_flow),(SELECT request_id::text FROM remaining_flow),'resubmit appends events and updates request');
SELECT is((SELECT jsonb_typeof(pg_temp.research_call(actor,'SELECT public.research_demo_list(false)')) FROM remaining_flow),'array','customer request list works');
SELECT is((SELECT jsonb_typeof(pg_temp.research_call(admin,'SELECT public.research_demo_list(true)')) FROM remaining_flow),'array','admin request list works');
SELECT is((SELECT pg_temp.research_call(actor,format('SELECT to_jsonb(public.research_demo_persist(%L,%L,%L::jsonb,%L::jsonb))',actor,'local-research-baseline-v1',request,plan))->>'sqlstate' FROM remaining_flow),'42501','authenticated persistence is denied');
SELECT is((SELECT pg_temp.research_call(actor,format('SELECT public.research_demo_persist_edit(%L,%L,%L,%L,%L::jsonb,%L::jsonb)',actor,child,'remaining-edit-key-02','local-research-baseline-v1',request,plan))->>'sqlstate' FROM remaining_flow),'42501','authenticated edit persistence is denied');
SELECT * FROM finish();
