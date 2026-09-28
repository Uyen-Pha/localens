import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import pg from 'pg';
import { openLocalClient, parseArgs, extractMigrationTransaction, assertTapResults } from './test-research-cancellation-local.mjs';
import { bootstrapBody } from './lib/research-bootstrap-transaction.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidates = ['20260929010000_research_deadline_compatibility.sql', '20260929020000_research_checkout_permissions.sql'];

export function parseIntegrationArgs(args) {
  const red = args.filter((arg) => arg === '--red').length;
  if (red > 1) throw new Error('ARGUMENT_REJECTED');
  const result = parseArgs(args.filter((arg) => arg !== '--red'));
  if (result.mode !== 'inventory') throw new Error('ARGUMENT_REJECTED');
  return { workdir: result.workdir, red: Boolean(red) };
}

export function assertOriginalRows(before, after) {
  if (!isDeepStrictEqual(before, after)) throw new Error('INTEGRATION_DATA_CHANGED');
}

// Capture original columns explicitly so nullable added metadata does not mask
// mutations to any old field. Identifiers originate only from PostgreSQL catalog.
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
async function tableColumns(client) {
  return (await client.query(`SELECT table_schema,table_name,array_agg(column_name::text ORDER BY ordinal_position) AS columns
    FROM information_schema.columns WHERE table_schema='private' AND
    (table_name LIKE 'research_demo_%' OR table_name IN ('user_roles','thesis_demo_manifest'))
    GROUP BY table_schema,table_name ORDER BY table_schema,table_name`)).rows;
}
async function rows(client, tables) {
  const result = {};
  for (const table of tables) {
    const name = `${quote(table.table_schema)}.${quote(table.table_name)}`;
    result[name] = (await client.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS data
      FROM (SELECT ${table.columns.map(quote).join(',')} FROM ${name}) t`)).rows[0].data;
  }
  return result;
}

async function permissionsSnapshot(client) {
  return (await client.query(`SELECT jsonb_build_object(
    'schema',(SELECT to_jsonb(n) FROM pg_namespace n WHERE nspname='auth'),
    'roles',(SELECT jsonb_agg(jsonb_build_array(rolname,rolsuper,rolcanlogin,rolbypassrls,rolinherit) ORDER BY rolname) FROM pg_roles),
    'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('private','public')),
    'tables',(SELECT jsonb_agg(jsonb_build_array(c.oid,c.relacl,c.relrowsecurity,c.relforcerowsecurity) ORDER BY c.oid) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('private','public','auth')),
    'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p)
  ) AS data`)).rows[0].data;
}

async function run(workdir, red) {
  // Reuse exact canonical-workdir/container-label/loopback/port guards.
  const guarded = await openLocalClient(workdir);
  const client = new pg.Client({ host: '127.0.0.1', port: guarded.connectionParameters.port,
    database: 'postgres', user: 'supabase_admin', password: 'postgres', ssl: false,
    connectionTimeoutMillis: 5000, statement_timeout: 15000 });
  await guarded.end();
  await client.connect();
  let before;
  let columns;
  const originalPermissions = await permissionsSnapshot(client);
  try {
    await client.query('BEGIN');
    // Actual local platform owner delegates schema USAGE for this test only.
    // This prerequisite is NOT bundled into application/hosted migration SQL.
    await client.query(readFileSync(path.join(ROOT,'supabase/tests/research/research_permissions_platform_prerequisite.sql'),'utf8'));
    await client.query('SET LOCAL ROLE postgres');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('research-integration-local',0))");
    columns = await tableColumns(client);
    before = await rows(client, columns);
    await client.query(readFileSync(path.join(ROOT,'supabase/tests/research/fixtures.sql'),'utf8'));
    await client.query(readFileSync(path.join(ROOT,'supabase/tests/research/research_deadline_preupgrade.sql'),'utf8'));
    await client.query('SET LOCAL ROLE postgres');
    const beforeMigrations = await rows(client, columns);
    if (!red) {
      for (let pass = 0; pass < 2; pass++) {
        for (const file of candidates) {
          for (const sql of extractMigrationTransaction(readFileSync(path.join(ROOT, 'supabase/migrations', file), 'utf8'))) await client.query(sql);
        }
        assertOriginalRows(beforeMigrations, await rows(client, columns));
        console.log(`PASS integration pass ${pass + 1}: original business fields unchanged`);
      }
      const permissionSql = extractMigrationTransaction(readFileSync(path.join(ROOT,'supabase/migrations',candidates[1]),'utf8'));
      for (const grant of [
        'GRANT UPDATE ON private.research_demo_bookings TO localens_cancellation_customer_rpc_owner',
        'GRANT UPDATE ON private.research_demo_booking_cancellations TO localens_cancellation_customer_rpc_owner',
        'GRANT DELETE ON private.research_demo_booking_cancellations TO localens_cancellation_customer_rpc_owner',
        'GRANT TRUNCATE ON private.research_demo_booking_cancellations TO localens_checkout_rpc_owner',
      ]) {
        await client.query('SAVEPOINT excess_grant_fixture');
        try {
          await client.query(grant);
          const excessive = await permissionsSnapshot(client);
          await client.query('SAVEPOINT rejected_upgrade');
          let rejected = false;
          try { for (const sql of permissionSql) await client.query(sql); }
          catch(error) { if (!error.message.startsWith('EXCESS_RESEARCH_OWNER_PRIVILEGE:')) throw error; rejected = true; }
          finally { await client.query('ROLLBACK TO SAVEPOINT rejected_upgrade'); }
          if (!rejected) throw new Error('EXCESS_PRIVILEGE_NOT_REJECTED');
          assertOriginalRows(excessive, await permissionsSnapshot(client));
          console.log('PASS excessive legacy grant rejected without catalog changes');
        } finally { await client.query('ROLLBACK TO SAVEPOINT excess_grant_fixture'); }
      }
    }
    for (const file of ['research_deadline_integration_test.sql', 'research_permissions_test.sql']) {
      await client.query('SAVEPOINT research_integration_test');
      try {
        await client.query(readFileSync(path.join(ROOT, 'supabase/tests/research/fixtures.sql'), 'utf8'));
        const testSql = readFileSync(path.join(ROOT, 'supabase/tests/research', file), 'utf8');
        bootstrapBody(testSql); // Reject test files that take over our transaction.
        const results = await client.query(testSql);
        for (const r of Array.isArray(results) ? results : [results]) for (const row of r.rows) for (const value of Object.values(row)) {
          if (typeof value === 'string' && /^(ok |not ok |1\.\.|#)/m.test(value)) console.log(value);
        }
        assertTapResults(results);
      } finally {
        await client.query('ROLLBACK TO SAVEPOINT research_integration_test');
      }
    }
  } finally {
    try {
      await client.query('ROLLBACK');
      if (before && columns) assertOriginalRows(before, await rows(client, columns));
      assertOriginalRows(originalPermissions, await permissionsSnapshot(client));
    } finally { await client.end(); }
  }
  console.log('PASS local integration; all candidate DDL and test data rolled back');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { workdir, red } = parseIntegrationArgs(process.argv.slice(2));
    await run(workdir, red);
  } catch (error) {
    // Do not print SQL detail, rows or connection strings.
    console.error(/^[A-Z_]+$/.test(error.message ?? '') ? error.message : 'INTEGRATION_FAILED', error.code ?? '');
    process.exitCode = 1;
  }
}
