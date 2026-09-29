// Fresh local-only replay. Creates a new owned project; never accepts a target.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { prepareIsolatedSupabaseProject, reserveRuntimeItineraryPorts, selectRuntimeItineraryBaseEnv } from './run-runtime-itinerary-e2e.mjs';
import { assertBootstrapDirectory } from './lib/local-ci-bootstrap.mjs';
import { runLocalBootstrap } from './local-ci-bootstrap.mjs';
import { runLocalSupabase } from './supabase-local.mjs';
import { bootstrapBody } from './lib/research-bootstrap-transaction.mjs';

if (process.argv.length > 2) throw new Error('LOCAL_BOOTSTRAP_TEST_ACCEPTS_NO_TARGET');
const cwd = process.cwd();
const env = selectRuntimeItineraryBaseEnv(process.env);
const reservation = await reserveRuntimeItineraryPorts();
let project;
let attempted = false;
const capture = (args, options) => runLocalSupabase(args, { ...options, capture: true });
try {
  project = prepareIsolatedSupabaseProject({ cwd, ports: reservation.ports,
    projectId: `localens-itinerary-${randomBytes(8).toString('hex')}` });
  await reservation.release();
  console.log(`Fresh owned bootstrap: ${project.projectId}; database port ${project.ports.database}`);
  attempted = true;
  runLocalBootstrap(['--workdir', project.root, 'start', '--exclude', 'realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'], { cwd, env, run: capture });
  for (const phase of ['fresh', 'reset']) {
    if (phase === 'reset') runLocalBootstrap(['--workdir', project.root, 'db', 'reset', '--local'], { cwd, env, run: capture });
    const client = new pg.Client({ host: '127.0.0.1', port: project.ports.database, user: 'postgres', password: 'postgres', database: 'postgres', ssl: false });
    await client.connect();
    try {
      const expected = readdirSync(path.join(project.root, 'supabase/migrations')).filter((name) => name.endsWith('.sql')).map((name) => name.split('_')[0]).sort();
      const actual = (await client.query('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version')).rows.map((row) => row.version);
      assert.deepEqual(actual, expected);
      assert.equal((await client.query("SELECT count(*)::integer AS n FROM private.thesis_demo_manifest WHERE dataset_version='local-research-baseline-v1'")).rows[0].n, 1);
      assert.equal((await client.query("SELECT count(*)::integer AS n FROM private.research_demo_places WHERE catalog_version='local-research-baseline-v1'")).rows[0].n, 1);
      await client.query('BEGIN');
      await client.query('DELETE FROM private.thesis_demo_manifest');
      const guard = bootstrapBody(readFileSync(path.join(cwd, 'supabase/migrations/20260916100000_research_demo_workflow.sql'), 'utf8'))[0];
      await assert.rejects(client.query(guard), { code: 'P0001', message: 'Authorized demo environment required' });
      await client.query('ROLLBACK');
      console.log(`PASS ${phase}: ${actual.length} tracked migrations; fixture rows present; historical guard still rejects missing manifest`);
    } finally { await client.end(); }
  }
} catch (error) {
  console.error(error.message);
  if (error.stderr) console.error(error.stderr.slice(-5000));
  process.exitCode = 1;
} finally {
  await reservation.release();
  if (project) {
    try {
      if (attempted) capture(['--workdir', project.root, 'stop', '--no-backup'], { cwd, env });
      rmSync(assertBootstrapDirectory(project.root), { recursive: true, force: true });
      console.log('PASS owned project cleanup');
    } catch {
      console.error(`CLEANUP_FAILED: retained owned project ${project.root}`);
      process.exitCode = 1;
    }
  }
}
