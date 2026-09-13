const { Client } = require('pg');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const apply = process.argv.includes('--apply');
if (process.argv.slice(2).some(arg => arg !== '--apply')) throw Error('Unsupported argument');
const ref = 'twsdtfotrkljgbfsrmgz';
const url = new URL(fs.readFileSync('supabase/.temp/pooler-url', 'utf8').trim());
assert.equal(fs.readFileSync('supabase/.temp/project-ref', 'utf8').trim(), ref);
assert.equal(url.hostname, 'aws-0-ap-southeast-1.pooler.supabase.com');
assert.equal(url.username, `postgres.${ref}`);
assert.equal(url.port, '5432');
assert.equal(url.pathname, '/postgres');
const files = ['20260912120000_guide_schedule.sql', '20260913010000_guide_demo_schedule.sql'];
const client = new Client({ host: url.hostname, port: 5432, user: url.username, database: 'postgres', password: process.env.GUIDE_DB_PASSWORD,
  ssl: { rejectUnauthorized: true, ca: fs.readFileSync('C:/Users/Admin/AppData/Local/LocalLens/certs/supabase-root-2021.crt', 'utf8') } });
async function businessCounts() {
  return (await client.query('SELECT (SELECT count(*)::int FROM public.bookings) bookings, (SELECT count(*)::int FROM public.guide_assignments) assignments')).rows[0];
}
(async () => {
  try {
    await client.connect();
    await client.query('BEGIN');
    const before = await businessCounts();
    for (const file of files) {
      const sql = fs.readFileSync(`supabase/migrations/${file}`, 'utf8').trim();
      assert.ok(sql.startsWith('BEGIN;') && sql.endsWith('COMMIT;'));
      const version = file.slice(0, 14);
      assert.equal((await client.query('SELECT version FROM supabase_migrations.schema_migrations WHERE version=$1', [version])).rowCount, 0);
      await client.query(sql.slice(6, -7));
      await client.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)', [version, file.slice(15, -4), [sql]]);
    }
    await client.query(fs.readFileSync('scripts/seed-guide-demo-schedule.sql', 'utf8'));
    const guide = (await client.query("SELECT id FROM auth.users WHERE email='guide.demo@localens.invalid'")).rows[0].id;
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [guide]);
    await client.query('SET LOCAL ROLE authenticated');
    const schedule = (await client.query('SELECT is_demo,count(*)::int AS count FROM public.get_guide_schedule() GROUP BY is_demo ORDER BY is_demo')).rows;
    assert.deepEqual(schedule, [{ is_demo: false, count: 2 }, { is_demo: true, count: 18 }]);
    const demoId = 'd1800000-0000-4000-8000-000000000801';
    assert.equal((await client.query('SELECT * FROM public.get_guide_schedule($1)', [demoId])).rowCount, 1);
    await client.query('RESET ROLE');
    const actors = (await client.query("SELECT id FROM auth.users WHERE email IN ('customer.demo@localens.invalid','admin.demo@localens.invalid')")).rows;
    assert.equal(actors.length, 2);
    for (const actor of [...actors, { id: '00000000-0000-0000-0000-000000000000' }]) {
      await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [actor.id]);
      await client.query('SAVEPOINT denial');
      await client.query('SET LOCAL ROLE authenticated');
      let code;
      try { await client.query('SELECT * FROM public.get_guide_schedule($1)', [demoId]); } catch (error) { code = error.code; }
      await client.query('ROLLBACK TO SAVEPOINT denial');
      assert.equal(code, '42501');
    }
    await client.query('RESET ROLE');
    assert.equal((await client.query("SELECT has_table_privilege('authenticated','private.guide_demo_schedule','SELECT') AS allowed")).rows[0].allowed, false);
    assert.deepEqual(await businessCounts(), before);
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    if (apply) {
      await client.query('BEGIN READ ONLY');
      assert.deepEqual(await businessCounts(), before);
      assert.equal((await client.query('SELECT count(*)::int AS count FROM private.guide_demo_schedule')).rows[0].count, 18);
      assert.equal((await client.query('SELECT version FROM supabase_migrations.schema_migrations WHERE version=ANY($1::text[])', [files.map(file => file.slice(0,14))])).rowCount, 2);
      await client.query('ROLLBACK');
    }
    console.log(JSON.stringify({ mode: apply ? 'committed' : 'rolled_back', schedule, authChecks: 'passed', businessCountsUnchanged: before, migrationLedger: 2, tlsVerified: true }));
  } finally { await client.query('ROLLBACK').catch(() => {}); await client.end(); }
})().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
