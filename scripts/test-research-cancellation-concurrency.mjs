import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import { checkRpcs, claims, openLocalClient, parseArgs } from './test-research-cancellation-local.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = (condition, message) => { if (!condition) throw new Error(message); };
const details = { outcome: 'success', travelers: [{ name: 'Local Fixture', country: 'VN', phone: '+84900000000', email: 'fixture@example.invalid' }] };
const cancel = (client, b, key) => client.query('SELECT public.research_demo_cancel_booking($1,$2) AS b', [b.id, key]);
const pay = (client, b) => client.query('SELECT public.research_demo_checkout($1,$2) AS b', [b.quote_id, details]);

async function fixture(client, hours, owner = null) {
  await client.query('BEGIN');
  try {
    const b = (await client.query("SELECT pg_temp.research_fixture(clock_timestamp()+$1::interval,NULL,$2::uuid) AS b", [`${hours} hours`, owner])).rows[0].b;
    await client.query('COMMIT');
    return b;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function waitForBlock(observer, contenderPid) {
  const until = Date.now() + 3000;
  while (Date.now() < until) {
    const row = (await observer.query('SELECT pg_backend_pid()=ANY(pg_blocking_pids($1)) AS blocked', [contenderPid])).rows[0];
    if (row.blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('CONTENDER_DID_NOT_BLOCK_ON_WINNER');
}

async function inspect(client, b) {
  await client.query('RESET ROLE');
  return (await client.query(`SELECT to_jsonb(b) AS booking,
    (SELECT count(*)::int FROM private.research_demo_booking_cancellations c WHERE c.booking_id=b.id) AS history,
    (SELECT count(*)::int FROM private.research_demo_request_events e WHERE e.request_id=b.request_id AND e.status='payment_paid') AS paid_events
    FROM private.research_demo_bookings b WHERE b.id=$1`, [b.id])).rows[0];
}

function stored(payload) {
  const copy = { ...payload };
  delete copy.cancelled_at;
  delete copy.trip_start_at;
  return copy;
}

async function race(a, b, scenario) {
  const original = await fixture(a, scenario.hours ?? 49);
  const other = scenario.otherBooking ? await fixture(a, 49, original.owner_id) : original;
  const key = randomUUID();
  const secondKey = scenario.differentKey ? randomUUID() : key;
  const pid = (await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  let pending;
  await a.query('BEGIN');
  await b.query('BEGIN');
  try {
    await claims(a, original.owner_id, 'authenticated');
    await claims(b, original.owner_id, 'authenticated');
    const first = (await (scenario.first === 'pay' ? pay(a, original) : cancel(a, original, key))).rows[0].b;
    pending = (scenario.second === 'pay' ? pay(b, other) : cancel(b, other, secondKey))
      .then((value) => ({ value: value.rows[0].b }), (error) => ({ error }));
    await a.query('RESET ROLE');
    await waitForBlock(a, pid);
    await a.query('COMMIT');
    const second = await pending;
    if (scenario.error) {
      check(second.error?.message === scenario.error, `${scenario.name}: EXPECTED_REJECTION_MISSING`);
      await b.query('ROLLBACK');
    } else {
      check(!second.error, `${scenario.name}: CONTENDER_FAILED`);
      await b.query('COMMIT');
    }
    const state = await inspect(a, original);
    check(state.booking.status === scenario.status && state.booking.payment_status === scenario.payment,
      `${scenario.name}: WRONG_FINAL_STATE`);
    check(state.history === scenario.history, `${scenario.name}: WRONG_HISTORY_COUNT`);
    check(state.paid_events === (scenario.first === 'pay' ? 1 : 0), `${scenario.name}: WRONG_PAYMENT_EVENT_COUNT`);
    // Full row check also protects amount/currency/paid_at/details/expiry/revision/owner.
    check(isDeepStrictEqual(state.booking, { ...stored(first), status: scenario.status }), `${scenario.name}: BUSINESS_FIELDS_CHANGED`);
    if (!scenario.error) check(isDeepStrictEqual(stored(second.value), state.booking), `${scenario.name}: RESPONSE_STATE_MISMATCH`);
    if (scenario.otherBooking) {
      const untouched = await inspect(a, other);
      check(isDeepStrictEqual(untouched.booking, stored(other)) && untouched.history === 0 && untouched.paid_events === 0,
        `${scenario.name}: CONFLICT_CHANGED_OTHER_BOOKING`);
    }
    console.log(`PASS ${scenario.name}; contender observed blocked on winner; final ${scenario.status}/${scenario.payment}; history ${scenario.history}`);
  } catch (error) {
    await a.query('ROLLBACK').catch(() => {});
    if (pending) await pending;
    await b.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

async function expiryAfterLock(a, b) {
  const original = await fixture(a, 49);
  const pid = (await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  let pending;
  await a.query('BEGIN');
  await b.query('BEGIN');
  try {
    await a.query('SELECT id FROM private.research_demo_requests WHERE id=$1 FOR UPDATE', [original.request_id]);
    await a.query("UPDATE private.research_demo_bookings SET expires_at=clock_timestamp()+interval '200 milliseconds' WHERE id=$1", [original.id]);
    await claims(b, original.owner_id, 'authenticated');
    pending = cancel(b, original, randomUUID()).then(() => ({ success: true }), (error) => ({ error }));
    await waitForBlock(a, pid);
    await a.query('SELECT pg_sleep(0.25)');
    await a.query('COMMIT');
    const outcome = await pending;
    check(outcome.error?.message === 'CANCELLATION_UNAVAILABLE', 'POST_LOCK_TIME_NOT_RECHECKED');
    await b.query('ROLLBACK');
    const state = await inspect(a, original);
    check(state.booking.status === 'pending_payment' && state.history === 0 && state.paid_events === 0, 'POST_LOCK_REFUSAL_WROTE_STATE');
    console.log('PASS expiry while waiting: authority time and booking data re-read after request lock');
  } catch (error) {
    await a.query('ROLLBACK').catch(() => {});
    if (pending) await pending;
    await b.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

async function main() {
  const { workdir, mode } = parseArgs(process.argv.slice(2));
  check(mode === 'inventory', 'CONCURRENCY_ACCEPTS_WORKDIR_ONLY');
  const sessions = [];
  try {
    sessions.push(await openLocalClient(workdir));
    sessions.push(await openLocalClient(workdir));
    const [a, b] = sessions;
    await checkRpcs(a);
    const ready = (await a.query("SELECT to_regprocedure('public.research_demo_cancel_booking(uuid,text)') IS NOT NULL AS ready")).rows[0].ready;
    check(ready, 'CANCELLATION_MIGRATION_REQUIRED');
    await a.query(readFileSync(path.join(ROOT, 'supabase/tests/research/fixtures.sql'), 'utf8'));
    for (const scenario of [
      { name: 'cancel-first', first: 'cancel', second: 'pay', status: 'cancelled', payment: 'pending', history: 1 },
      { name: 'payment-first-47h', hours: 47, first: 'pay', second: 'cancel', error: 'CANCELLATION_UNAVAILABLE', status: 'confirmed', payment: 'paid', history: 0 },
      { name: 'payment-first-49h', first: 'pay', second: 'cancel', status: 'cancelled', payment: 'paid', history: 1 },
      { name: 'two-cancel-same-key', first: 'cancel', second: 'cancel', status: 'cancelled', payment: 'pending', history: 1 },
      { name: 'two-cancel-different-key', first: 'cancel', second: 'cancel', differentKey: true, status: 'cancelled', payment: 'pending', history: 1 },
      { name: 'same-key-other-booking', first: 'cancel', second: 'cancel', otherBooking: true, error: 'IDEMPOTENCY_CONFLICT', status: 'cancelled', payment: 'pending', history: 1 },
    ]) await race(a, b, scenario);
    await expiryAfterLock(a, b);
    console.log('PASS 7 research concurrency scenarios; committed synthetic fixtures retained for inspection');
  } finally {
    await Promise.allSettled(sessions.map((client) => client.end()));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch((error) => {
    console.error('RESEARCH_CONCURRENCY_FAILED', /^[a-zA-Z0-9_: /-]+$/.test(error.message) ? error.message : 'Inspect local SQL setup', error.code ? `SQLSTATE ${error.code}` : '');
    process.exitCode = 2;
  });
}
