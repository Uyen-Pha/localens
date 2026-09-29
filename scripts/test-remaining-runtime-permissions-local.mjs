import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const container='supabase_db_localens-release-20260929-verified';
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const unwrap=(sql)=>sql.replace(/^BEGIN;\r?$/gm,'').replace(/^COMMIT;\r?$/gm,'').replace(/^ROLLBACK;\r?$/gm,'');
const reviewed=unwrap(read('supabase/migrations/20260929030000_reviewed_rpc_permissions.sql'));
const candidate=process.argv.includes('--baseline')?'':unwrap(read('supabase/migrations/20260929040000_remaining_runtime_permissions.sql'));
const fixtures=read('supabase/tests/research/fixtures.sql');
const tests=read('supabase/tests/database/remaining-runtime-permissions.sql');
function run(label,sql) {
 let output;
 try {output=execFileSync('docker',['exec','-i',container,'psql','-X','-b','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:sql,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe']});}
 catch(error){throw new Error(label+' SQL failed\n'+error.stdout+'\n'+error.stderr);}
 if(/not ok|Looks like you failed|planned \d+ tests but ran/i.test(output)||!output.includes('ROLLBACK')) throw new Error(label+' failed\n'+output);
 const count=(output.match(/\bok \d+ -/g)||[]).length;
 console.log('PASS '+label+'; '+count+' assertions; transaction rolled back');
}
const snapshot=`
CREATE TEMP TABLE remaining_api_before AS
SELECT p.oid,p.prosrc,p.probin,p.prolang,p.proargnames,p.proargtypes::text,p.proallargtypes,p.proargmodes,p.proargdefaults::text,p.prorettype,p.proretset,p.provolatile,p.proisstrict,p.prosecdef,p.proleakproof
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private');
CREATE TEMP TABLE remaining_acl_before AS
SELECT p.oid,r.rolname,has_function_privilege(r.oid,p.oid,'EXECUTE') AS allowed
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN pg_roles r
WHERE n.nspname IN ('public','private');
CREATE TEMP TABLE remaining_rows_before(oid oid PRIMARY KEY,digest text);
DO $$ DECLARE t record; d text; BEGIN
FOR t IN SELECT c.oid,n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private','auth') AND c.relkind='r' LOOP
EXECUTE format('SELECT md5(coalesce(string_agg(v, %L ORDER BY v), %L)) FROM (SELECT row_to_json(t)::text AS v FROM %I.%I t) s','','',t.nspname,t.relname) INTO d;
INSERT INTO remaining_rows_before VALUES(t.oid,d);
END LOOP; END $$;`;
const invariance=`
DO $$ DECLARE t record; d text; BEGIN
IF EXISTS(SELECT 1 FROM remaining_api_before b LEFT JOIN pg_proc p ON p.oid=b.oid WHERE p.oid IS NULL OR ROW(p.prosrc,p.probin,p.prolang,p.proargnames,p.proargtypes::text,p.proallargtypes,p.proargmodes,p.proargdefaults::text,p.prorettype,p.proretset,p.provolatile,p.proisstrict,p.prosecdef,p.proleakproof) IS DISTINCT FROM ROW(b.prosrc,b.probin,b.prolang,b.proargnames,b.proargtypes,b.proallargtypes,b.proargmodes,b.proargdefaults,b.prorettype,b.proretset,b.provolatile,b.proisstrict,b.prosecdef,b.proleakproof)) THEN RAISE EXCEPTION 'FUNCTION_API_BODY_CHANGED'; END IF;
-- New ownership and the two explicit actor dependencies are the only permitted gains.
IF EXISTS(SELECT 1 FROM remaining_acl_before b JOIN pg_proc p ON p.oid=b.oid WHERE has_function_privilege(b.rolname,b.oid,'EXECUTE') IS DISTINCT FROM b.allowed
AND NOT (NOT b.allowed AND (p.proowner=b.rolname::regrole OR (b.oid='private.research_demo_actor(boolean)'::regprocedure AND b.rolname IN ('localens_request_customer_rpc_owner','localens_request_admin_rpc_owner'))))) THEN RAISE EXCEPTION 'EXISTING_ROLE_EXECUTE_ACL_CHANGED'; END IF;
FOR t IN SELECT b.*,n.nspname,c.relname FROM remaining_rows_before b JOIN pg_class c ON c.oid=b.oid JOIN pg_namespace n ON n.oid=c.relnamespace LOOP
EXECUTE format('SELECT md5(coalesce(string_agg(v, %L ORDER BY v), %L)) FROM (SELECT row_to_json(t)::text AS v FROM %I.%I t) s','','',t.nspname,t.relname) INTO d;
IF d IS DISTINCT FROM t.digest THEN RAISE EXCEPTION 'BUSINESS_ROWS_CHANGED: %.%',t.nspname,t.relname; END IF;
END LOOP; END $$;`;
run('remaining permissions: apply twice, API/all-existing-role ACL/row invariance and functional pgTAP',
 'BEGIN;\n'+reviewed+'\n'+snapshot+'\n'+candidate+'\n'+invariance+'\n'+candidate+'\n'+invariance+'\n'+fixtures+'\n'+tests+'\nROLLBACK;');
if(!process.argv.includes('--baseline')) {
 const schemaFailures=[];
 for (const owner of ['localens_guide_profile_rpc_owner','localens_research_persist_rpc_owner']) {
  for (const schema of ['public','private']) {
   try {
    run(owner+' rejects CREATE on '+schema,'BEGIN; CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions; SET LOCAL search_path=public,extensions;\n'+
     'CREATE ROLE '+owner+' NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; GRANT CREATE ON SCHEMA '+schema+' TO '+owner+';\n'+
     "SELECT plan(3); SELECT ok(has_schema_privilege('"+owner+"','"+schema+"','CREATE'),'fixture has effective schema CREATE');\n"+
     'SELECT throws_ok($candidate$'+candidate+"$candidate$,'P0001','EXCESS_REMAINING_OWNER_SCHEMA_CREATE: "+owner+"','schema CREATE rejected before grants');\n"+
     "SELECT is((SELECT pg_get_userbyid(proowner)::text FROM pg_proc WHERE oid='public.get_own_guide_profile()'::regprocedure),'postgres','rejection leaves original owner'); SELECT * FROM finish(); ROLLBACK;");
   } catch(error) { schemaFailures.push(error.message); }
  }
 }
 if(schemaFailures.length) throw new Error(schemaFailures.join('\n'));
 const guide=unwrap(read('supabase/tests/database/guide_personal_profile_test.sql'));
 run('existing guide profile behavior','BEGIN;\n'+reviewed+'\n'+candidate+'\n'+guide+'\nROLLBACK;');
 // Legacy cancellation cases intentionally use 47h/49h departures, below the
 // newer 72h submission gate. Create through real RPCs at 96h, then bind a
 // separate historical snapshot for cancellation boundaries. No trigger or
 // production function is replaced, disabled or weakened.
 const legacyCancellationFixture=`
ALTER FUNCTION pg_temp.research_fixture(timestamptz,text,uuid) RENAME TO research_fixture_current;
CREATE FUNCTION pg_temp.research_fixture(p_start timestamptz,p_outcome text DEFAULT NULL,p_owner uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE b jsonb; child uuid; BEGIN
 b:=pg_temp.research_fixture_current(greatest(p_start,clock_timestamp()+interval '96 hours'),p_outcome,p_owner);
 INSERT INTO private.research_demo_revisions(owner_id,catalog_version,request,plan)
 SELECT owner_id,catalog_version,jsonb_set(request,'{startAt}',to_jsonb(to_char(p_start AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))),plan
 FROM private.research_demo_revisions WHERE id=(b->>'revision_id')::uuid RETURNING id INTO child;
 UPDATE private.research_demo_bookings SET revision_id=child WHERE id=(b->>'id')::uuid;
 PERFORM pg_temp.research_claims((b->>'owner_id')::uuid);
 b:=public.research_demo_booking((b->>'quote_id')::uuid,false);
 PERFORM set_config('role','none',true);
 RETURN b;
END $$;`;
 for (const file of ['research_permissions_test.sql','research_deadline_integration_test.sql','research_booking_cancellation_test.sql']) {
  const adapter=file==='research_booking_cancellation_test.sql'?legacyCancellationFixture:'';
  let suite=read('supabase/tests/research/'+file);
  if(adapter) {
   // Current auth trigger provisions customer automatically; the old suite
   // explicitly supplies each actor's one intended role. Adjust setup only.
   const marker='INSERT INTO private.user_roles(user_id,role) SELECT id,kind::public.app_role FROM test_actors;';
   if(!suite.includes(marker)) throw new Error('Legacy actor fixture changed; review adapter');
   suite=suite.replace(marker,'DELETE FROM private.user_roles WHERE user_id IN (SELECT id FROM test_actors);\n'+marker);
  }
  run('existing '+file+(adapter?' (historical boundary/actor fixtures)':''),'BEGIN;\n'+reviewed+'\n'+candidate+'\n'+fixtures+'\n'+adapter+'\n'+suite+'\nROLLBACK;');
 }
 for (const owner of ['localens_guide_profile_rpc_owner','localens_research_persist_rpc_owner']) {
  for (const [label,setup,error] of [
   ['incoming browser membership', 'GRANT '+owner+' TO authenticated;', 'UNSAFE_REMAINING_MEMBERSHIP: '+owner],
   ['outgoing membership', 'GRANT authenticated TO '+owner+';', 'UNSAFE_REMAINING_MEMBERSHIP: '+owner],
   ['login owner','ALTER ROLE '+owner+' LOGIN;','UNSAFE_REMAINING_OWNER: '+owner],
   ['password read','GRANT SELECT(encrypted_password) ON auth.users TO '+owner+';','EXCESS_REMAINING_OWNER_PRIVILEGE: '+owner+' auth.users.encrypted_password SELECT'],
   ['profile delete','GRANT DELETE ON public.profiles TO '+owner+';','EXCESS_REMAINING_OWNER_PRIVILEGE: '+owner+' public.profiles'],
  ]) {
   const safe='CREATE ROLE '+owner+' NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;';
   run(owner+' rejects '+label,'BEGIN; CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions; SET LOCAL search_path=public,extensions;\n'+safe+'\n'+setup+
    '\nSELECT plan(2); SELECT throws_ok($candidate$'+candidate+"$candidate$,'P0001','"+error+"','unsafe role rejected before migration changes');"+
    "\nSELECT is((SELECT pg_get_userbyid(proowner)::text FROM pg_proc WHERE oid='public.get_own_guide_profile()'::regprocedure),'postgres','rejected candidate leaves original owner'); SELECT * FROM finish(); ROLLBACK;");
  }
 }
}
