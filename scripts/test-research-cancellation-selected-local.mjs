import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { openLocalClient, readTarget, extractMigrationTransaction } from './test-research-cancellation-local.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(path.join(root, name), 'utf8');
// Reject accidental transaction-control additions before sending any fragment.
const fragment = (name) => extractMigrationTransaction('BEGIN;\n' + read(name) + '\nCOMMIT;').join('');
const release = 'supabase/releases/20260929-research-cancellation/';
const migration = 'supabase/migrations/20260928230000_research_booking_cancellation.sql';
const owner = 'localens_cancellation_customer_rpc_owner';
const tables = ['research_demo_bookings','research_demo_requests','research_demo_revisions','research_demo_quotes','research_demo_request_events','research_demo_stops','research_demo_booking_cancellations'];

// pg_class estimates/visibility counters and vacuum freeze horizons are physical
// maintenance state, not transactional DDL. Keep every other field, including
// relfilenode, owner, ACL, RLS, schema identity and column count.
// https://www.postgresql.org/docs/current/catalog-pg-class.html
const volatileClassFields = new Set(['relpages','reltuples','relallvisible','relallfrozen','relfrozenxid','relminmxid']);
function semanticSnapshot(value) {
  return {...value, catalog: value.catalog?.map((entry) => entry.kind==='class'
    ? {...entry,data:Object.fromEntries(Object.entries(entry.data).filter(([key]) => !volatileClassFields.has(key)))}
    : entry)};
}

export function assertSnapshotsEqual(actual, expected, label = 'snapshot') {
  const a=semanticSnapshot(actual), b=semanticSnapshot(expected);
  if (isDeepStrictEqual(a,b)) return;
  const changes=[];
  for (const name of new Set([...Object.keys(a.data ?? {}),...Object.keys(b.data ?? {})])) {
    if (!isDeepStrictEqual(a.data?.[name],b.data?.[name])) changes.push(`data:${name}`);
  }
  const index = (entries) => new Map((entries ?? []).map((entry) => [`${entry.kind}:${entry.id}`,entry.data]));
  const left=index(a.catalog), right=index(b.catalog);
  for (const key of new Set([...left.keys(),...right.keys()])) {
    if (isDeepStrictEqual(left.get(key),right.get(key))) continue;
    if (!left.has(key) || !right.has(key)) { changes.push(`${key}:missing/added`); continue; }
    const fields = [...new Set([...Object.keys(left.get(key)),...Object.keys(right.get(key))])]
      .filter((field) => !isDeepStrictEqual(left.get(key)[field],right.get(key)[field]));
    changes.push(`${key}:fields=${fields.slice(0,8).join(',')}`);
  }
  // Plain Error deliberately has no actual/expected payload: never dump rows,
  // function definitions, auth metadata or an enormous catalog into CI output.
  const summary=changes.slice(0,8).map((change) => change.slice(0,160)).join('; ');
  throw new Error(`SNAPSHOT_MISMATCH ${label.slice(0,120)}: ${summary}; changedObjects=${changes.length}`);
}

async function snapshot(c) {
  const data = {};
  for (const table of tables) {
    const exists = (await c.query('SELECT to_regclass($1) IS NOT NULL AS yes', [`private.${table}`])).rows[0].yes;
    data[table] = exists ? (await c.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') AS data FROM private.${table} t`)).rows[0].data : [];
  }
  const catalog = (await c.query(`
    SELECT 'proc' AS kind,p.oid::text AS id,to_jsonb(p) AS data FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private','auth')
    UNION ALL SELECT 'policy',p.oid::text,to_jsonb(p) FROM pg_policy p
    UNION ALL SELECT 'role',r.oid::text,to_jsonb(r) FROM pg_roles r
    UNION ALL SELECT 'membership',m.oid::text,to_jsonb(m) FROM pg_auth_members m
    UNION ALL SELECT 'namespace',n.oid::text,to_jsonb(n) FROM pg_namespace n WHERE n.nspname IN ('public','private','auth')
    UNION ALL SELECT 'class',c.oid::text,to_jsonb(c) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private','auth')
    UNION ALL SELECT 'attribute',a.attrelid::text||':'||a.attnum,to_jsonb(a) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private','auth')
    UNION ALL SELECT 'constraint',c.oid::text,to_jsonb(c) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname IN ('public','private','auth')
    UNION ALL SELECT 'trigger',t.oid::text,to_jsonb(t) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private','auth')
    ORDER BY kind,id`)).rows;
  return semanticSnapshot({ data, catalog });
}

async function assertSelected(c) {
  const row = (await c.query(`SELECT pg_get_userbyid(proowner) AS owner FROM pg_proc WHERE oid='public.research_demo_cancel_booking(uuid,text)'::regprocedure`)).rows[0];
  assert.equal(row.owner, owner, 'cancellation must run as bounded custom owner');
  assert.equal((await c.query('SELECT has_schema_privilege($1,\'auth\',\'USAGE\') AS yes', [owner])).rows[0].yes, false);
  for (const signature of ['private.research_demo_actor(boolean)','public.research_demo_booking(uuid,boolean)','public.research_demo_checkout(uuid,jsonb)']) {
    assert.equal((await c.query('SELECT pg_get_userbyid(proowner) AS owner FROM pg_proc WHERE oid=$1::regprocedure',[signature])).rows[0].owner, 'postgres');
  }
  for (const signature of ['private.research_demo_actor(boolean)',
    'private.research_demo_cancellation_allowed(text,text,timestamptz,timestamptz,timestamptz)',
    'private.research_demo_trip_start(private.research_demo_bookings)',
    'private.research_demo_booking_payload(private.research_demo_bookings)',
    'public.research_demo_cancel_booking(uuid,text)']) {
    const acl = (await c.query(`SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,a.privilege_type,a.is_grantable
      FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE p.oid=$1::regprocedure ORDER BY grantee`,[signature])).rows;
    const expected = (signature.startsWith('public.') ? ['authenticated',owner] : [owner,'postgres'])
      .map((grantee) => ({grantee,privilege_type:'EXECUTE',is_grantable:false}));
    assert.deepEqual(acl,expected,`exact selected ACL: ${signature}`);
  }
}

async function tap(c) {
  await c.query(read('supabase/tests/research/fixtures.sql'));
  const results = await c.query(read('supabase/tests/research/research_booking_cancellation_test.sql'));
  const lines = results.flatMap((r) => r.rows.flatMap((row) => Object.values(row))).filter((v) => typeof v === 'string' && /^(ok |not ok |1\.\.|#|Bail out!)/m.test(v));
  for (const line of lines.filter((v) => /^(not ok|Bail out!|1\.\.)/.test(v))) console.log(line);
  assert(!lines.some((v) => /^(not ok|Bail out!)/m.test(v)), 'research pgTAP failure');
  const plan = lines.find((v) => /^1\.\./.test(v));
  assert(plan, 'missing pgTAP plan');
  assert.equal(lines.filter((v) => /^ok \d+/.test(v)).length, Number(plan.slice(3)), 'incomplete pgTAP');
  console.log(`PASS existing research pgTAP ${plan}`);
  await c.query(read('supabase/tests/research/research_cancellation_selected_test.sql'));
  console.log('PASS banned customer denied without state/history changes; bounded writes and entry ACLs');
}

async function selected(c, statements) {
  await c.query(fragment(release + 'preflight.sql'));
  for (const statement of statements) {
    const cancellation = /CREATE OR REPLACE FUNCTION public\.research_demo_cancel_booking\(/.test(statement);
    const bounded = cancellation && (await c.query("SELECT pg_get_userbyid(proowner)=$1 AS yes FROM pg_proc WHERE oid=to_regprocedure('public.research_demo_cancel_booking(uuid,text)')",[owner])).rows[0]?.yes;
    if (bounded) {
      assert.equal((await c.query("SELECT has_schema_privilege($1,'public','CREATE') AS yes",[owner])).rows[0].yes,false);
      await c.query(`GRANT CREATE ON SCHEMA public TO ${owner}`);
      await c.query(`SET LOCAL ROLE ${owner}`);
    }
    await c.query(statement);
    if (bounded) {
      await c.query('SET LOCAL ROLE postgres');
      await c.query(`REVOKE CREATE ON SCHEMA public FROM ${owner}`);
    }
  }
  await c.query(fragment(release + 'permissions.sql'));
}

async function baselineShape(c, statements) {
  await c.query('SAVEPOINT selected_baseline');
  try {
    // Reconstruct only the selected objects inside a savepoint; never reset the DB.
    await c.query(fragment(release + 'preflight.sql'));
    await c.query('DROP FUNCTION public.research_demo_cancel_booking(uuid,text)');
    await c.query('DROP FUNCTION private.research_demo_booking_payload(private.research_demo_bookings)');
    await c.query('DROP FUNCTION private.research_demo_trip_start(private.research_demo_bookings)');
    await c.query('DROP FUNCTION private.research_demo_cancellation_allowed(text,text,timestamptz,timestamptz,timestamptz)');
    // This owned local target contains committed historical QA cancellations.
    // Reconstruct their recorded prior statuses ONLY inside this savepoint so
    // the exact validated pre-upgrade constraint can exist. Outer snapshots
    // prove all original statuses/history are restored; no data is committed.
    await c.query("UPDATE private.research_demo_bookings b SET status=c.previous_status FROM private.research_demo_booking_cancellations c WHERE c.booking_id=b.id AND b.status='cancelled'");
    await c.query('DROP TABLE private.research_demo_booking_cancellations');
    await c.query("ALTER TABLE private.research_demo_bookings DROP CONSTRAINT research_demo_bookings_status_check; ALTER TABLE private.research_demo_bookings ADD CONSTRAINT research_demo_bookings_status_check CHECK (status IN ('pending_payment','confirmed','expired'))");
    assert.equal((await c.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='private.research_demo_bookings'::regclass AND conname='research_demo_bookings_status_check'")).rows[0].definition,
      "CHECK ((status = ANY (ARRAY['pending_payment'::text, 'confirmed'::text, 'expired'::text])))");
    const baseline = extractMigrationTransaction('BEGIN;\n' + read('supabase/tests/fixtures/research-baseline/20260924180000_research_quote_checkout.sql') + '\nCOMMIT;');
    const definitions = baseline.filter((s) => /CREATE FUNCTION public\.research_demo_(booking|checkout)\(/.test(s));
    assert.equal(definitions.length, 2);
    for (const definition of definitions) await c.query(definition.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'));
    for (const signature of ['public.research_demo_booking(uuid,boolean)','public.research_demo_checkout(uuid,jsonb)']) {
      await c.query(`ALTER FUNCTION ${signature} RESET ALL`);
      await c.query(`ALTER FUNCTION ${signature} SET search_path=''`);
    }
    const hashes = (await c.query("SELECT proname,md5(prosrc) AS hash FROM pg_proc WHERE oid IN ('public.research_demo_booking(uuid,boolean)'::regprocedure,'public.research_demo_checkout(uuid,jsonb)'::regprocedure) ORDER BY proname")).rows;
    assert.deepEqual(hashes,[{proname:'research_demo_booking',hash:'dd9cdd374f4fb710b92a7a493f24560d'},{proname:'research_demo_checkout',hash:'f1bc48cd8d8facec42d4a0d0500cd139'}]);
    const data = (await snapshot(c)).data;
    await selected(c, statements);
    await assertSelected(c);
    assertSnapshotsEqual({data:(await snapshot(c)).data}, {data}, 'baseline upgrade data');
    await tap(c);
    console.log('PASS absent cancellation/ledger upgrade; raw baseline fingerprints exactly match hosted evidence');
  } finally {
    await c.query('ROLLBACK TO SAVEPOINT selected_baseline');
    await c.query('RELEASE SAVEPOINT selected_baseline');
  }
}

async function rejects(c, setup, operation, expected) {
  const before = await snapshot(c);
  await c.query('SAVEPOINT selected_negative');
  try {
    await c.query(setup);
    await assert.rejects(operation, expected);
  } finally {
    await c.query('ROLLBACK TO SAVEPOINT selected_negative');
    await c.query('RELEASE SAVEPOINT selected_negative');
  }
  assertSnapshotsEqual(await snapshot(c), before, 'negative case restored exactly');
}

export async function run(workdir) {
  readTarget(workdir);
  const c = await openLocalClient(workdir);
  const sql = read(migration);
  const statements = extractMigrationTransaction(sql);
  const before = await snapshot(c);
  try {
    const operator = (await c.query("SELECT rolsuper,rolbypassrls,has_schema_privilege(current_user,'auth','USAGE WITH GRANT OPTION') AS grant_option,has_table_privilege(current_user,'auth.users','REFERENCES') AS fk FROM pg_roles WHERE rolname=current_user")).rows[0];
    assert.deepEqual(operator, { rolsuper: false, rolbypassrls: true, grant_option: false, fk: true }, 'faithful demoted operator required; runner never alters platform privileges');
    await c.query('BEGIN');
    await c.query("SET LOCAL lock_timeout='5s'");
    assert.equal((await c.query("SELECT has_schema_privilege($1,'auth','USAGE') AS yes",[owner])).rows[0].yes,false);
    await baselineShape(c, statements);
    assertSnapshotsEqual(await snapshot(c), before, 'baseline-shaped test restores original state');
    await rejects(c, 'ALTER FUNCTION private.research_demo_actor(boolean) SECURITY INVOKER', () => selected(c,statements), /SELECTED_INCOMPATIBLE_BASELINE/);
    await rejects(c, `GRANT UPDATE(payment_status) ON private.research_demo_bookings TO ${owner}`, () => c.query(fragment(release + 'preflight.sql')), /SELECTED_EXCESS_RESEARCH_PRIVILEGE/);
    await rejects(c, 'CREATE POLICY selected_cancel_read ON private.research_demo_bookings FOR SELECT TO authenticated USING (true)',
      () => c.query(fragment(release + 'preflight.sql')), /SELECTED_POLICY_COLLISION/);
    await rejects(c, "ALTER TABLE private.research_demo_booking_cancellations ALTER COLUMN idempotency_key SET DEFAULT 'collision'",
      () => c.query(fragment(release + 'preflight.sql')), /SELECTED_INCOMPATIBLE_LEDGER/);
    await rejects(c, 'GRANT EXECUTE ON FUNCTION private.research_demo_booking_payload(private.research_demo_bookings) TO authenticated',
      () => c.query(fragment(release + 'preflight.sql')), /SELECTED_EXCESS_HELPER_ACL/);
    await rejects(c, `GRANT EXECUTE ON FUNCTION private.research_demo_booking_payload(private.research_demo_bookings) TO ${owner} WITH GRANT OPTION`,
      () => c.query(fragment(release + 'preflight.sql')), /SELECTED_EXCESS_HELPER_ACL/);
    await rejects(c, 'GRANT EXECUTE ON FUNCTION public.research_demo_cancel_booking(uuid,text) TO service_role',
      () => c.query(fragment(release + 'preflight.sql')), /SELECTED_EXCESS_HELPER_ACL/);
    await rejects(c, 'ALTER TABLE private.research_demo_bookings DROP CONSTRAINT research_demo_bookings_status_check; ALTER TABLE private.research_demo_bookings ADD CONSTRAINT research_demo_bookings_status_check CHECK (true)',
      () => c.query(fragment(release + 'preflight.sql')), /SELECTED_STATUS_CONSTRAINT_COLLISION/);
    await rejects(c, "DROP TRIGGER research_cancellation_immutable ON private.research_demo_booking_cancellations; CREATE TRIGGER research_cancellation_immutable BEFORE UPDATE OR DELETE ON private.research_demo_booking_cancellations FOR EACH ROW WHEN (false) EXECUTE FUNCTION private.reject_research_demo_catalog_mutation()",
      () => c.query(fragment(release + 'preflight.sql')), /SELECTED_LEDGER_TRIGGER_COLLISION/);
    await rejects(c, 'ALTER TABLE private.research_demo_booking_cancellations DISABLE TRIGGER no_truncate',
      () => c.query(fragment(release + 'preflight.sql')), /SELECTED_LEDGER_TRIGGER_COLLISION/);
    console.log('PASS pre-2300 rejection: status constraint, policy collision, ledger defaults, helper ACL and trigger drift');
    console.log('PASS incompatible actor and excess privilege rejected; failed transaction state restored');
    await selected(c, statements);
    await assertSelected(c);
    const first = await snapshot(c);
    await selected(c, statements);
    assertSnapshotsEqual({data:(await snapshot(c)).data}, {data:first.data}, 'reapply preserves all existing data/history');
    await assertSelected(c);
    console.log('PASS exact 2300 body plus permissions applied twice; business data unchanged');
    await tap(c);
    const afterCancellation = (await snapshot(c)).data;
    await selected(c, statements);
    assertSnapshotsEqual({data:(await snapshot(c)).data}, {data:afterCancellation}, 'reapply retains newly cancelled rows and history');
    await assertSelected(c);
    console.log('PASS reapply after cancellation preserves history; no owner auth USAGE added');
    await rejects(c, 'SELECT 1', async () => {
      await selected(c, statements);
      await c.query("DO $$ BEGIN RAISE EXCEPTION 'SELECTED_INJECTED_LATE_FAILURE'; END $$");
    }, /SELECTED_INJECTED_LATE_FAILURE/);
    console.log('PASS injected late failure restores pre-attempt state');
  } finally {
    try {
      await c.query('ROLLBACK');
      assertSnapshotsEqual(await snapshot(c), before, 'rollback must restore catalog, roles, ACLs and business rows');
    } finally { await c.end(); }
  }
  console.log(`PASS rollback restoration; 2300 SHA256 ${createHash('sha256').update(sql).digest('hex')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4 || process.argv[2] !== '--workdir' || !path.isAbsolute(process.argv[3])) throw new Error('ONLY_LOCAL_WORKDIR_ARGUMENT_ALLOWED');
  await run(process.argv[3]);
}
