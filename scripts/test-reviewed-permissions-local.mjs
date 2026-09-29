import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {validateLocalTap} from './validate-local-tap.mjs';

// Dedicated local Docker target; never accepts a database URL or hosted credentials.
const container = 'supabase_db_localens-release-20260929-verified';
const candidate = readFileSync(new URL('../supabase/migrations/20260929030000_reviewed_rpc_permissions.sql', import.meta.url),'utf8')
  .replace(/^BEGIN;\r?$/m,'').replace(/^COMMIT;\r?$/m,'');
// The runner owns BEGIN; retain the suite's final ROLLBACK only.
const tests = readFileSync(new URL('../supabase/tests/database/reviewed_permissions_test.sql', import.meta.url),'utf8')
  .replace(/^BEGIN;\r?$/m, '');
function run(label, sql, expectedAssertions = 24, databaseUser = 'postgres') {
  const output = execFileSync('docker',['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U',databaseUser,'-d','postgres'],{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe']});
  let count;
  try { count = validateLocalTap(output, expectedAssertions); }
  catch (error) { throw new Error(`${label} failed: ${error.message}\n${output}`); }
  console.log(`${count.skipped || count.todo ? 'COMPLETE WITH DIRECTIVES' : 'PASS'} ${label}; ${count.total} planned/results; ${count.passed} passed; ${count.skipped} skipped; ${count.todo} TODO; transaction rolled back`);
  for (const directive of count.directives) console.log('  '+directive);
}
const snapshot = `CREATE TEMP TABLE reviewed_api_before AS
 SELECT p.oid,p.prosrc,p.proargnames,p.proargtypes::text,p.proargdefaults::text,p.prorettype,p.proretset,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS customer_execute
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname LIKE 'reviewed_demo_%';`;
const unchanged = `DO $api_check$ BEGIN
 IF EXISTS (SELECT 1 FROM reviewed_api_before b LEFT JOIN pg_proc p ON p.oid=b.oid
 WHERE p.oid IS NULL OR p.prosrc IS DISTINCT FROM b.prosrc
 OR p.proargnames IS DISTINCT FROM b.proargnames OR p.proargtypes::text IS DISTINCT FROM b.proargtypes
 OR p.proargdefaults::text IS DISTINCT FROM b.proargdefaults OR p.prorettype<>b.prorettype OR p.proretset<>b.proretset
 OR has_function_privilege('anon',p.oid,'EXECUTE')<>b.anon_execute
 OR has_function_privilege('authenticated',p.oid,'EXECUTE')<>b.customer_execute) THEN
 RAISE EXCEPTION 'REVIEWED_API_OR_BROWSER_ACL_CHANGED'; END IF; END $api_check$;`;
run('apply twice, preserve API/browser ACLs and 24 reviewed checks',`BEGIN;\n${snapshot}\n${candidate}\n${candidate}\n${unchanged}\n${tests}`);
const safeRole = 'CREATE ROLE localens_reviewed_rpc_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;';
const tapSetup = 'CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions; SET LOCAL search_path=public,extensions;';
run('clean role accepted with same TAP setup', `BEGIN; ${tapSetup} ${safeRole}
SELECT plan(1);
SELECT lives_ok($candidate_sql$${candidate}$candidate_sql$, 'clean owner accepted under rejection fixture');
SELECT * FROM finish(); ROLLBACK;`, 1);
const schemaFailures = [];
for (const schema of ['public', 'private', 'auth']) {
  for (const grantee of ['localens_reviewed_rpc_owner', 'PUBLIC']) {
    try {
      run(`reject effective CREATE on ${schema} via ${grantee}`, `BEGIN; SET LOCAL ROLE postgres; ${tapSetup} ${safeRole}
RESET ROLE;
GRANT CREATE ON SCHEMA ${schema} TO ${grantee};
SET LOCAL ROLE postgres;
SELECT plan(3);
SELECT ok(has_schema_privilege('localens_reviewed_rpc_owner','${schema}','CREATE'), 'fixture has effective schema CREATE');
SELECT throws_ok($candidate_sql$${candidate}$candidate_sql$, 'P0001', 'EXCESS_REVIEWED_OWNER_SCHEMA_CREATE', 'reject schema CREATE before grants');
SELECT is((SELECT pg_get_userbyid(proowner)::text FROM pg_proc WHERE oid='public.reviewed_demo_cancel(uuid)'::regprocedure),'postgres','rejection leaves original owner intact');
SELECT * FROM finish(); ROLLBACK;`, 3, schema === 'auth' ? 'supabase_admin' : 'postgres');
    } catch (error) { schemaFailures.push(error.message); }
  }
}
if (schemaFailures.length) throw new Error(schemaFailures.join('\n'));
for (const [name, setup, error, fixture] of [
  ['departure insert column', 'GRANT INSERT(id) ON public.reviewed_demo_departures TO localens_reviewed_rpc_owner;', 'EXCESS_REVIEWED_OWNER_PRIVILEGE', "has_column_privilege('localens_reviewed_rpc_owner','public.reviewed_demo_departures','id','INSERT') AND NOT has_table_privilege('localens_reviewed_rpc_owner','public.reviewed_demo_departures','INSERT')"],
  ['departure references column', 'GRANT REFERENCES(id) ON public.reviewed_demo_departures TO localens_reviewed_rpc_owner;', 'EXCESS_REVIEWED_OWNER_PRIVILEGE', "has_column_privilege('localens_reviewed_rpc_owner','public.reviewed_demo_departures','id','REFERENCES') AND NOT has_table_privilege('localens_reviewed_rpc_owner','public.reviewed_demo_departures','REFERENCES')"],
  ['booking references column', 'GRANT REFERENCES(id) ON public.reviewed_demo_bookings TO localens_reviewed_rpc_owner;', 'EXCESS_REVIEWED_OWNER_PRIVILEGE', "has_column_privilege('localens_reviewed_rpc_owner','public.reviewed_demo_bookings','id','REFERENCES') AND NOT has_table_privilege('localens_reviewed_rpc_owner','public.reviewed_demo_bookings','REFERENCES')"],
  ['booking maintain', 'GRANT MAINTAIN ON public.reviewed_demo_bookings TO localens_reviewed_rpc_owner;', 'EXCESS_REVIEWED_OWNER_PRIVILEGE', "has_table_privilege('localens_reviewed_rpc_owner','public.reviewed_demo_bookings','MAINTAIN')"],
  ['incoming browser membership', 'GRANT localens_reviewed_rpc_owner TO authenticated;', 'UNSAFE_REVIEWED_MEMBERSHIP'],
  ['outgoing membership', 'GRANT authenticated TO localens_reviewed_rpc_owner;', 'UNSAFE_REVIEWED_MEMBERSHIP'],
  ['password column privilege', 'GRANT SELECT(encrypted_password) ON auth.users TO localens_reviewed_rpc_owner;', 'EXCESS_REVIEWED_OWNER_PRIVILEGE'],
  ['delete privilege', 'GRANT DELETE ON public.reviewed_demo_bookings TO localens_reviewed_rpc_owner;', 'EXCESS_REVIEWED_OWNER_PRIVILEGE'],
  ['unrelated table privilege', 'GRANT SELECT ON public.profiles TO localens_reviewed_rpc_owner;', 'EXCESS_REVIEWED_OWNER_PRIVILEGE'],
  ['unrelated column privilege', 'GRANT SELECT(display_name) ON public.profiles TO localens_reviewed_rpc_owner;', 'EXCESS_REVIEWED_OWNER_PRIVILEGE'],
  ['unrelated owned function', 'GRANT localens_reviewed_rpc_owner TO postgres WITH SET TRUE, INHERIT FALSE; CREATE FUNCTION public.reviewed_owner_probe() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$; GRANT CREATE ON SCHEMA public TO localens_reviewed_rpc_owner; ALTER FUNCTION public.reviewed_owner_probe() OWNER TO localens_reviewed_rpc_owner; REVOKE CREATE ON SCHEMA public FROM localens_reviewed_rpc_owner;', 'EXCESS_REVIEWED_OWNER_PRIVILEGE'],
]) {
  run(name, `BEGIN; ${tapSetup} ${safeRole} ${setup}
SELECT plan(${fixture ? 3 : 2});
${fixture ? `SELECT ok(${fixture}, 'fixture has precisely the injected privilege');` : ''}
SELECT throws_ok($candidate_sql$${candidate}$candidate_sql$, 'P0001', '${error}', 'reject unsafe role before grants');
SELECT is((SELECT pg_get_userbyid(proowner)::text FROM pg_proc WHERE oid='public.reviewed_demo_cancel(uuid)'::regprocedure),'postgres','failed candidate leaves original owner intact');
SELECT * FROM finish(); ROLLBACK;`, fixture ? 3 : 2);
}
run('mixed expected ownership',`BEGIN; ${safeRole}
GRANT localens_reviewed_rpc_owner TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT CREATE ON SCHEMA public TO localens_reviewed_rpc_owner;
ALTER FUNCTION public.reviewed_demo_begin(uuid,integer,text) OWNER TO localens_reviewed_rpc_owner;
REVOKE CREATE ON SCHEMA public FROM localens_reviewed_rpc_owner;
${candidate}
${tests}`);
