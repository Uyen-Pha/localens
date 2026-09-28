// Main-only probe on dedicated local Supabase clusters. Never reset/drop a DB.
// Resumed/revised runs are explicitly NOT fresh-install evidence.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { parseArgs, assertContainer, assertLocalDockerEndpoint, assertEmptyDatabase, checkRpcs, assertTapResults } from './test-research-cancellation-local.mjs';
import { migrationFiles } from './check-supabase-artifacts.mjs';
import { applyMigrationAtomic } from './lib/research-bootstrap-transaction.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { workdir, mode } = parseArgs(process.argv.slice(2));
if (mode !== 'inventory') throw new Error('ARGUMENT_REJECTED');
const allowed = [
  {workdir:path.resolve('D:/LocalLensSqlAudit/20260929-release-integration'),projectId:'localens-release-20260929-audit',dbPort:55452},
  {workdir:path.resolve('D:/LocalLensSqlAudit/20260929-release-verified'),projectId:'localens-release-20260929-verified',dbPort:55462},
];
const target = allowed.find((item)=>item.workdir===path.resolve(workdir));
if (!target || realpathSync(workdir)!==target.workdir || existsSync(path.join(workdir, 'supabase/.temp/project-ref'))) throw new Error('UNOWNED_PROJECT_REJECTED');
const config = readFileSync(path.join(workdir,'supabase/config.toml'),'utf8');
if (!config.includes(`project_id = "${target.projectId}"`) || !config.includes(`port = ${target.dbPort}`)) throw new Error('CONFIG_CHANGED_REJECTED');
if (process.env.DOCKER_HOST) assertLocalDockerEndpoint(process.env.DOCKER_HOST);
if (process.env.CONTAINER_HOST) assertLocalDockerEndpoint(process.env.CONTAINER_HOST);
const context = spawnSync('docker',['context','inspect'],{encoding:'utf8',windowsHide:true});
if (context.status !== 0) throw new Error('LOCAL_DOCKER_CONTEXT_REQUIRED');
assertLocalDockerEndpoint(JSON.parse(context.stdout)[0]?.Endpoints?.docker?.Host);
const inspected = spawnSync('docker',['inspect',`supabase_db_${target.projectId}`],{encoding:'utf8',windowsHide:true});
if(inspected.status!==0) throw new Error('LOCAL_CONTAINER_NOT_RUNNING');
assertContainer(target,JSON.parse(inspected.stdout)[0]);
let connection;
try {
  connection = new pg.Client({ host: '127.0.0.1', port: target.dbPort, database: 'postgres',
    user: 'supabase_admin', password: 'postgres', ssl: false, connectionTimeoutMillis: 5000,
    statement_timeout: 60000, application_name: 'research-release-bootstrap-local' });
  await connection.connect();
  const marker = (await connection.query("SELECT to_regclass('localens_test_audit.migrations') AS marker")).rows[0].marker;
  let runKind = marker ? 'resumed' : 'fresh';
  if (!marker) {
    await assertEmptyDatabase(connection);
    await connection.query('CREATE SCHEMA localens_test_audit; CREATE TABLE localens_test_audit.migrations(name text PRIMARY KEY,hash text NOT NULL)');
  }
  await connection.query('CREATE TABLE IF NOT EXISTS localens_test_audit.candidate_history(name text,old_hash text,new_hash text,changed_at timestamptz DEFAULT clock_timestamp())');
  // Real failure injection proves DDL and checkpoint share a transaction.
  let rolledBack = false;
  try {
    await applyMigrationAtomic(connection,'CREATE TABLE public.research_checkpoint_probe(id integer);',async()=>{throw new Error('CHECKPOINT_PROBE');});
  } catch(error) { if(error.message!=='CHECKPOINT_PROBE') throw error; rolledBack=true; }
  if (!rolledBack || (await connection.query("SELECT to_regclass('public.research_checkpoint_probe') AS probe")).rows[0].probe!==null) throw new Error('CHECKPOINT_ROLLBACK_FAILED');
  console.log('PASS migration/checkpoint atomic rollback probe');
  // Explicit local platform prerequisite, not an application migration and
  // never applied by this tool to another cluster or a hosted database.
  await connection.query('GRANT USAGE ON SCHEMA auth TO postgres WITH GRANT OPTION');
  for (const file of migrationFiles(root)) {
    try {
      const sql = readFileSync(file.path, 'utf8');
      const hash = createHash('sha256').update(sql).digest('hex');
      const prior = (await connection.query('SELECT hash FROM localens_test_audit.migrations WHERE name=$1',[file.name])).rows[0];
      if (prior) {
        if (prior.hash===hash) continue;
        if (!['20260929010000_research_deadline_compatibility.sql','20260929020000_research_checkout_permissions.sql'].includes(file.name)) throw new Error('APPLIED_SOURCE_CHANGED');
        runKind='revised';
        console.log(`Rechecking revised idempotent local candidate ${file.name}`);
      }
      await applyMigrationAtomic(connection,sql,async()=>{
      if (file.name === '20260905140000_thesis_demo_manifest.sql') {
        await connection.query("INSERT INTO private.thesis_demo_manifest(project_ref,environment,dataset_version,seed_base_date) VALUES ('twsdtfotrkljgbfsrmgz','thesis-demo','local-research-baseline-v1',current_date)");
      }
      if (file.name === '20260916073000_research_demo_catalog.sql') {
        await connection.query("INSERT INTO private.research_demo_catalog_versions(version,source_version,mapping_version,dataset,place_map) VALUES ('local-research-baseline-v1','local-fixture-v1','local-map-v1','{\"dataMode\":\"internal_simulation\",\"realBookingEnabled\":false,\"schemaVersion\":\"local-fixture-v1\"}','{\"LL-R01\":\"11111111-1111-4111-8111-111111111111\"}')");
      }
      await connection.query('INSERT INTO localens_test_audit.migrations(name,hash) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET hash=excluded.hash',[file.name,hash]);
      if(prior) await connection.query('INSERT INTO localens_test_audit.candidate_history(name,old_hash,new_hash) VALUES($1,$2,$3)',[file.name,prior.hash,hash]);
      });
      console.log(`PASS migration ${file.name}`);
    } catch (error) {
      console.error(`FAIL migration ${file.name}; SQLSTATE ${error.code ?? 'unknown'}`);
      throw error;
    }
  }
  await checkRpcs(connection);
  console.log(`PASS ${runKind} schema contains exact research RPC signatures; freshInstallEvidence=${runKind==='fresh'}`);
  for (const file of ['research_deadline_integration_test.sql', 'research_permissions_test.sql']) {
    await connection.query('BEGIN');
    try {
      await connection.query(readFileSync(path.join(root, 'supabase/tests/research/fixtures.sql'), 'utf8'));
      const results = await connection.query(readFileSync(path.join(root, 'supabase/tests/research', file), 'utf8'));
      for (const result of Array.isArray(results) ? results : [results]) for (const row of result.rows) for (const value of Object.values(row)) {
        if (typeof value==='string' && /^(not ok|1\.\.|# Looks)/.test(value)) console.log(value);
      }
      const lines = assertTapResults(results);
      console.log(`PASS ${file}: ${lines.find((line) => /^1\.\./.test(line))}`);
    } finally { await connection.query('ROLLBACK'); }
  }
} catch (error) {
  console.error('BOOTSTRAP_FAILED', error.code ?? '', /^[A-Z_]+$/.test(error.message ?? '') ? error.message : '');
  process.exitCode = 1;
} finally {
  if (connection) await connection.end();
}
