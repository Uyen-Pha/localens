import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(ROOT, 'supabase/tests/fixtures/research-baseline');
const MARKER = '.research-baseline-owner.json';
const sha = (value) => createHash('sha256').update(value).digest('hex');
const fail = (code) => { throw new Error(code); };
export const REQUIRED_RPCS = [
  'public.research_demo_persist(uuid,text,jsonb,jsonb)',
  'public.research_demo_submit(uuid)',
  'public.research_demo_decide(uuid,text,text)',
  'public.research_demo_create_quote(uuid,text,numeric,text,text)',
  'public.research_demo_list(boolean)',
  'public.research_demo_booking(uuid,boolean)',
  'public.research_demo_checkout(uuid,jsonb)',
];

export function assertRequiredRpcs(available) {
  const missing = REQUIRED_RPCS.filter((signature) => !available.includes(signature));
  if (missing.length) fail(`MISSING_RPC: ${missing.join(', ')}`);
}

export function parseArgs(args) {
  let workdir;
  let mode = 'inventory';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workdir' && workdir === undefined) workdir = args[++i];
    else if (['--prepare', '--apply', '--verify'].includes(args[i]) && mode === 'inventory') mode = args[i].slice(2);
    else fail('ARGUMENT_REJECTED');
  }
  if (!workdir || !path.isAbsolute(workdir) || /^[\\/]{2}|^[a-z]+:\/\//i.test(workdir) || /[\r\n\0]/.test(workdir)) fail('LOCAL_DIRECTORY_REQUIRED');
  return { workdir: path.resolve(workdir), mode };
}

export function loadInventory(directory = FIXTURES) {
  const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  for (const entry of manifest.files) {
    if (path.basename(entry.file) !== entry.file) fail('FIXTURE_PATH_REJECTED');
    if (!existsSync(path.join(directory, entry.file))) fail(`MISSING_SOURCE_FIXTURE: ${entry.file}`);
    const sql = readFileSync(path.join(directory, entry.file), 'utf8').replace(/\r\n/g, '\n');
    if (sha(sql) !== entry.sha256) fail(`FIXTURE_HASH_MISMATCH: ${entry.file}`);
  }
  return { ...manifest, requiredRpcs: REQUIRED_RPCS };
}

function prepare(workdir) {
  if (existsSync(workdir)) fail('EXISTING_DIRECTORY_REJECTED');
  // Exclusive mkdir: a race never turns an existing stack into an owned target.
  mkdirSync(workdir);
  const canonical = realpathSync(workdir);
  if (/^[\\/]{2}/.test(canonical)) fail('LOCAL_DIRECTORY_REQUIRED');
  mkdirSync(path.join(workdir, 'supabase'));
  const projectId = `localens-research-baseline-${randomUUID()}`;
  const config = `project_id = "${projectId}"\n[api]\nenabled = true\nport = 55441\nschemas = ["public"]\n[db]\nport = 55442\nshadow_port = 55440\nmajor_version = 17\n[db.seed]\nenabled = false\n[studio]\nenabled = false\n[inbucket]\nenabled = false\n[analytics]\nenabled = false\n[edge_runtime]\nenabled = false\n`;
  writeFileSync(path.join(workdir, 'supabase/config.toml'), config, { flag: 'wx' });
  writeFileSync(path.join(workdir, MARKER), JSON.stringify({ workdir: canonical, projectId, configSha256: sha(config) }), { flag: 'wx' });
  return { workdir: canonical, projectId, apiPort: 55441, dbPort: 55442, status: 'prepared; no containers started' };
}

export function readTarget(workdir) {
  if (!existsSync(path.join(workdir, MARKER))) fail('UNOWNED_PROJECT_REJECTED');
  const owner = JSON.parse(readFileSync(path.join(workdir, MARKER), 'utf8'));
  const canonical = realpathSync(workdir);
  if (/^[\\/]{2}/.test(canonical) || owner.workdir !== canonical) fail('UNOWNED_PROJECT_REJECTED');
  const config = readFileSync(path.join(workdir, 'supabase/config.toml'), 'utf8');
  if (sha(config) !== owner.configSha256) fail('CONFIG_CHANGED_REJECTED');
  const projectId = config.match(/^project_id = "([a-z0-9-]+)"$/m)?.[1];
  const dbPort = Number(config.match(/\[db\]\s+port = (\d+)/)?.[1]);
  const apiPort = Number(config.match(/\[api\]\s+enabled = true\s+port = (\d+)/)?.[1]);
  if (!/^localens-research-baseline-[a-f0-9-]{36}$/.test(projectId ?? '') || owner.projectId !== projectId || dbPort !== 55442 || apiPort !== 55441) fail('OLD_STACK_REJECTED');
  if (existsSync(path.join(workdir, 'supabase/.temp/project-ref'))) fail('LINKED_PROJECT_REJECTED');
  return { workdir: canonical, projectId, dbPort, apiPort };
}

export function containerName(target) {
  // Pinned Supabase CLI canonicalizes project IDs to 40 characters. Main
  // verified both the actual container name and project label for this target.
  return `supabase_db_${target.projectId.slice(0, 40)}`;
}

export function assertContainer(target, inspected) {
  if (inspected?.Name !== `/${containerName(target)}` || inspected?.State?.Running !== true || inspected?.Config?.Labels?.['com.supabase.cli.project'] !== target.projectId.slice(0, 40)) fail('CONTAINER_IDENTITY_REJECTED');
  const labelWorkdir = inspected.Config.Labels['com.supabase.cli.workdir'];
  if (typeof labelWorkdir !== 'string' || !path.isAbsolute(labelWorkdir) || !existsSync(labelWorkdir) || realpathSync(labelWorkdir) !== realpathSync(target.workdir)) fail('CONTAINER_WORKDIR_REJECTED');
  const bindings = inspected.NetworkSettings?.Ports?.['5432/tcp'] ?? [];
  if (!bindings.some((binding) => ['0.0.0.0', '127.0.0.1'].includes(binding.HostIp) && binding.HostPort === String(target.dbPort))) fail('CONTAINER_PORT_REJECTED');
}

export function assertLocalDockerEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || !(/^(?:unix:\/\/\/[^\r\n]+|npipe:\/\/\/\/\.\/pipe\/[a-zA-Z0-9_.-]+)$/.test(endpoint))) fail('REMOTE_DOCKER_REJECTED');
}

async function checkRpcs(client) {
  const { rows } = await client.query('SELECT signature FROM unnest($1::text[]) AS signature WHERE to_regprocedure(signature) IS NOT NULL', [REQUIRED_RPCS]);
  assertRequiredRpcs(rows.map((row) => row.signature));
}

export async function assertEmptyDatabase(client) {
  const { rows } = await client.query("SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='private') OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S')) OR EXISTS(SELECT 1 FROM auth.users) AS occupied");
  if (rows[0]?.occupied !== false) fail('NONEMPTY_DATABASE_REJECTED');
}

export async function assertOriginalOwnerCapability(client) {
  const { rows } = await client.query('SELECT current_user AS owner, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user');
  const owner = rows[0];
  if (owner?.owner !== 'postgres' || !(owner.rolsuper === true || owner.rolbypassrls === true)) fail('MISSING_SOURCE_DEPENDENCY: postgres requires original FORCE RLS bypass capability');
}

async function claims(client, user, role) {
  await client.query('RESET ROLE');
  await client.query("SELECT set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claim.role',$2,true), set_config('request.jwt.claims',$3,true)", [user, role, JSON.stringify({ sub: user, role })]);
  await client.query(role === 'service_role' ? 'SET LOCAL ROLE service_role' : 'SET LOCAL ROLE authenticated');
}

async function seedAndExercise(client) {
  const customer = randomUUID();
  const admin = randomUUID();
  await client.query('INSERT INTO auth.users(id) VALUES ($1),($2)', [customer, admin]);
  await client.query("INSERT INTO private.user_roles(user_id,role) VALUES ($1,'customer'),($2,'admin')", [customer, admin]);
  const results = [];
  for (const outcome of [null, 'declined', 'success']) {
    await claims(client, customer, 'service_role');
    const { rows: clock } = await client.query("SELECT clock_timestamp()+interval '10 days' AS departure");
    const request = { startAt: clock[0].departure.toISOString(), durationMinutes: 120, budget: { amountMinor: 1000000, currency: 'VND' }, partySize: 1, areas: [], lockedStopIds: [] };
    const plan = { stops: [{ id: 'LL-R01' }], legs: [{ from: 'ORIGIN-CENTER', to: 'LL-R01' }, { from: 'LL-R01', to: 'ORIGIN-CENTER' }], durationMinutes: 120, totalVnd: 100000, visitAndFoodVnd: 100000, guideVnd: 0, transportVnd: 0, returnTime: new Date(clock[0].departure.getTime() + 7200000).toISOString() };
    const revision = (await client.query('SELECT public.research_demo_persist($1,$2,$3,$4) AS id', [customer, 'local-research-baseline-v1', request, plan])).rows[0].id;
    await claims(client, customer, 'authenticated');
    const requestId = (await client.query('SELECT public.research_demo_submit($1) AS id', [revision])).rows[0].id;
    await claims(client, admin, 'authenticated');
    await client.query("SELECT public.research_demo_decide($1,'approved','Local baseline fixture')", [requestId]);
    const quote = (await client.query("SELECT public.research_demo_create_quote($1,'Local baseline',100000,'VND','Simulated payment only') AS id", [requestId])).rows[0].id;
    await claims(client, customer, 'authenticated');
    let booking = (await client.query('SELECT public.research_demo_booking($1,true) AS booking', [quote])).rows[0].booking;
    if (booking?.status !== 'pending_payment' || booking.payment_status !== 'pending') fail('BOOKING_CREATE_ASSERTION_FAILED');
    const read = (await client.query('SELECT public.research_demo_booking($1,false) AS booking', [quote])).rows[0].booking;
    if (JSON.stringify(read) !== JSON.stringify(booking)) fail('BOOKING_READ_ASSERTION_FAILED');
    if (outcome) {
      const details = { outcome, travelers: [{ name: 'Local Fixture', country: 'VN', phone: '+84900000000', email: 'fixture@example.invalid' }] };
      booking = (await client.query('SELECT public.research_demo_checkout($1,$2) AS booking', [quote, details])).rows[0].booking;
      if (booking.status !== (outcome === 'success' ? 'confirmed' : 'pending_payment') || booking.payment_status !== (outcome === 'success' ? 'paid' : 'failed') || (outcome === 'success' && !booking.paid_at)) fail('CHECKOUT_ASSERTION_FAILED');
    }
    results.push({ customer, admin, quote, requestId, revision, booking });
  }
  const listed = (await client.query('SELECT public.research_demo_list(false) AS requests')).rows[0].requests;
  if (listed.length !== 3) fail('LIST_ASSERTION_FAILED');
  await client.query('RESET ROLE');
  const snapshot = {};
  for (const table of ['research_demo_bookings', 'research_demo_requests', 'research_demo_revisions', 'research_demo_quotes', 'research_demo_request_events', 'research_demo_stops']) {
    snapshot[table] = (await client.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS data FROM private.${table} t`)).rows[0].data;
  }
  return { results, snapshot };
}

async function execute(target, mode, inventory) {
  // Inspect only. No start, stop, reset, rm, volume removal, or CLI passthrough.
  if (process.env.DOCKER_HOST) assertLocalDockerEndpoint(process.env.DOCKER_HOST);
  if (process.env.CONTAINER_HOST) assertLocalDockerEndpoint(process.env.CONTAINER_HOST);
  if (!process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT) {
    const context = spawnSync('docker', ['context', 'inspect'], { encoding: 'utf8', windowsHide: true });
    if (context.error || context.status !== 0) fail('LOCAL_DOCKER_CONTEXT_REQUIRED');
    assertLocalDockerEndpoint(JSON.parse(context.stdout)[0]?.Endpoints?.docker?.Host);
  }
  const inspected = spawnSync('docker', ['inspect', containerName(target)], { encoding: 'utf8', windowsHide: true });
  if (inspected.error || inspected.status !== 0) fail('LOCAL_CONTAINER_NOT_RUNNING');
  assertContainer(target, JSON.parse(inspected.stdout)[0]);
  const { default: pg } = await import('pg');
  const client = new pg.Client({ host: '127.0.0.1', port: target.dbPort, database: 'postgres', user: 'postgres', password: 'postgres', ssl: false, connectionTimeoutMillis: 5000, statement_timeout: 15000, application_name: 'research-baseline-local' });
  try {
    await client.connect();
    await assertOriginalOwnerCapability(client);
    if (mode === 'verify') {
      await checkRpcs(client);
      return { status: 'required RPC signatures present; no data modified' };
    }
    if (existsSync(path.join(target.workdir, 'baseline-evidence.json'))) fail('EXISTING_EVIDENCE_REJECTED');
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('research-baseline-install',0))");
    await assertEmptyDatabase(client);
    for (const entry of inventory.files) {
      await client.query(readFileSync(path.join(FIXTURES, entry.file), 'utf8'));
      if (entry.file === '003-manifest.sql') await client.query("INSERT INTO private.thesis_demo_manifest(project_ref,environment,dataset_version,seed_base_date) VALUES ('twsdtfotrkljgbfsrmgz','thesis-demo','local-research-baseline-v1',current_date)");
      if (entry.file === '20260916073000_research_demo_catalog.sql') await client.query("INSERT INTO private.research_demo_catalog_versions(version,source_version,mapping_version,dataset,place_map) VALUES ('local-research-baseline-v1','local-fixture-v1','local-map-v1','{\"dataMode\":\"internal_simulation\",\"realBookingEnabled\":false,\"schemaVersion\":\"local-fixture-v1\"}','{\"LL-R01\":\"11111111-1111-4111-8111-111111111111\"}')");
    }
    await checkRpcs(client);
    const evidence = await seedAndExercise(client);
    // Persist evidence before COMMIT, never overwrite. If commit fails, preserve it
    // as an attempted run; only the returned success confirms committed fixtures.
    writeFileSync(path.join(target.workdir, 'baseline-evidence.json'), JSON.stringify({ target, inventory, ...evidence }, null, 2), { flag: 'wx' });
    await client.query('COMMIT');
    return { status: 'baseline committed; 3 legacy bookings retained', evidence: path.join(target.workdir, 'baseline-evidence.json') };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  try {
    const { workdir, mode } = parseArgs(process.argv.slice(2));
    if (mode === 'prepare') {
      loadInventory();
      console.log(JSON.stringify(prepare(workdir), null, 2));
      return;
    }
    const target = readTarget(workdir);
    const inventory = loadInventory();
    console.log(JSON.stringify(mode === 'inventory' ? { ...target, ...inventory } : await execute(target, mode, inventory), null, 2));
  } catch (error) {
    // Never echo connection strings, Docker output, arguments, SQL details or keys.
    const safe = /^(?:[A-Z_]+)(?:: [a-zA-Z0-9_.,() -]+)?$/.test(error.message ?? '') ? error.message : 'BASELINE_FAILED';
    console.error(safe);
    process.exitCode = 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
