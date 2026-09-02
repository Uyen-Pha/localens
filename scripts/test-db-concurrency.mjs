import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { resolveLocalSupabaseCli } from "./supabase-local.mjs";

const { Client } = pg;

export const REQUIRED_CONCURRENCY_SCENARIOS = [
  "CAS revision winner",
  "guest claim winner",
  "quota bucket creation and reservation idempotency",
  "departure capacity without oversell",
  "quote checkout compensation",
  "Stripe webhook event race",
  "simulated payment single terminalization",
];

export const CONCURRENCY_SCENARIO_IDS = [
  "cas_revision_winner",
  "guest_claim_winner",
  "quota_reservation_idempotency",
  "departure_capacity_no_oversell",
  "quote_checkout_compensation",
  "stripe_webhook_event_race",
  "simulated_payment_terminalization",
];

const LOCAL_SUPABASE_DB_PORT = "54322";
const hash64 = () => randomUUID().replaceAll("-", "").repeat(2);

function result(code, reason) {
  return { ok: false, code, message: `${code}: ${reason}. Required two-session scenarios: ${REQUIRED_CONCURRENCY_SCENARIOS.join("; ")}` };
}

function invariant(condition, message) {
  if (!condition) throw new Error(`CONCURRENCY_INVARIANT_FAILED: ${message}`);
}

export function validateLocalDatabaseUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("database URL is not a valid PostgreSQL URL"); }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) throw new Error("database URL must use postgres:// or postgresql://");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) throw new Error("database URL host must be loopback-only");
  if (parsed.port !== LOCAL_SUPABASE_DB_PORT) throw new Error(`database URL port must be ${LOCAL_SUPABASE_DB_PORT} for local Supabase`);
  return parsed;
}

async function rollbackQuietly(session) {
  try { await session.query("ROLLBACK"); } catch { /* preserve the race failure */ }
}

async function backendPid(session) {
  return Number((await session.query("SELECT pg_catalog.pg_backend_pid() AS pid")).rows[0].pid);
}

async function waitForLock(observer, blockedPid) {
  let lastState;
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const state = await observer.query(
      "SELECT state, wait_event_type, wait_event, pg_catalog.left(query, 80) AS query FROM pg_catalog.pg_stat_activity WHERE pid = $1",
      [blockedPid],
    );
    lastState = state.rows[0];
    if (lastState?.wait_event_type === "Lock") return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`CONCURRENCY_BARRIER_FAILED: backend ${blockedPid} did not enter a lock wait; last state ${JSON.stringify(lastState ?? null)}`);
}

async function ensureCustomer(session, userId, label) {
  await session.query(
    `INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     VALUES ($1::uuid, 'authenticated', 'authenticated', $2, '', '{}'::jsonb, '{}'::jsonb, pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp())
     ON CONFLICT (id) DO NOTHING`,
    [userId, `concurrency-${label}-${userId}@example.invalid`],
  );
}

async function setRoleAndSubject(session, role, userId) {
  await session.query(`SET LOCAL ROLE ${role}`);
  if (userId) await session.query("SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)", [userId]);
}

async function casRevisionWinner({ sessions }) {
  const [winner, contender] = sessions;
  const planId = randomUUID();
  await winner.query("INSERT INTO public.trip_plans (id) VALUES ($1::uuid)", [planId]);
  const contenderPid = await backendPid(contender);
  await Promise.all([winner.query("BEGIN"), contender.query("BEGIN")]);
  try {
    await winner.query("SELECT id FROM public.trip_plans WHERE id = $1::uuid FOR UPDATE", [planId]);
    const contenderWork = contender.query("UPDATE public.trip_plans SET latest_revision_no = 1 WHERE id = $1::uuid AND latest_revision_no = 0 RETURNING latest_revision_no", [planId]);
    await waitForLock(winner, contenderPid);
    const winnerResult = await winner.query("UPDATE public.trip_plans SET latest_revision_no = 1 WHERE id = $1::uuid AND latest_revision_no = 0 RETURNING latest_revision_no", [planId]);
    await winner.query("COMMIT");
    const contenderResult = await contenderWork;
    await contender.query("COMMIT");
    invariant(winnerResult.rowCount === 1 && contenderResult.rowCount === 0, "CAS must have exactly one winner");
  } catch (error) {
    await Promise.all([rollbackQuietly(winner), rollbackQuietly(contender)]);
    throw error;
  }
  const row = await winner.query("SELECT latest_revision_no FROM public.trip_plans WHERE id = $1::uuid", [planId]);
  invariant(row.rows[0]?.latest_revision_no === 1, "CAS authoritative revision must be one");
}

async function guestClaimWinner({ sessions }) {
  const [winner, contender] = sessions;
  const planId = randomUUID();
  const bindingId = randomUUID();
  const winnerId = randomUUID();
  const contenderId = randomUUID();
  const tokenHash = hash64();
  await ensureCustomer(winner, winnerId, "guest-winner");
  await ensureCustomer(winner, contenderId, "guest-contender");
  await winner.query("BEGIN");
  try {
    await winner.query("SET CONSTRAINTS ALL DEFERRED");
    await winner.query("INSERT INTO public.trip_plans (id, guest_binding_id) VALUES ($1::uuid, $2::uuid)", [planId, bindingId]);
    await winner.query("INSERT INTO private.guest_bindings (id, plan_id) VALUES ($1::uuid, $2::uuid)", [bindingId, planId]);
    await winner.query("INSERT INTO private.guest_capabilities (binding_id, token_hash, pepper_version, expires_at) VALUES ($1::uuid, $2, 1::smallint, pg_catalog.clock_timestamp() + interval '1 hour')", [bindingId, tokenHash]);
    await winner.query("COMMIT");
  } catch (error) { await rollbackQuietly(winner); throw error; }

  const contenderPid = await backendPid(contender);
  await Promise.all([winner.query("BEGIN"), contender.query("BEGIN")]);
  try {
    await winner.query("SELECT id FROM public.trip_plans WHERE id = $1::uuid FOR UPDATE", [planId]);
    await setRoleAndSubject(contender, "authenticated", contenderId);
    const contenderWork = contender.query("SELECT * FROM public.claim_guest_plan($1::uuid, $2, 1::smallint)", [planId, tokenHash])
      .then((value) => ({ value }), (error) => ({ error }));
    await waitForLock(winner, contenderPid);
    await setRoleAndSubject(winner, "authenticated", winnerId);
    const winnerResult = await winner.query("SELECT * FROM public.claim_guest_plan($1::uuid, $2, 1::smallint)", [planId, tokenHash]);
    await winner.query("COMMIT");
    let contenderFailed = false;
    const contenderOutcome = await contenderWork;
    if (contenderOutcome.error) {
      contenderFailed = contenderOutcome.error?.code === "P0001";
      await rollbackQuietly(contender);
    } else {
      await contender.query("COMMIT");
    }
    invariant(winnerResult.rowCount === 1 && contenderFailed, "guest claim must have one winner and one safe loser");
  } catch (error) {
    await Promise.all([rollbackQuietly(winner), rollbackQuietly(contender)]);
    throw error;
  }
  const row = await winner.query(
    `SELECT p.owner_user_id, b.claimed_by, c.revoked_at IS NOT NULL AS revoked
     FROM public.trip_plans p JOIN private.guest_bindings b ON b.id = p.guest_binding_id
     JOIN private.guest_capabilities c ON c.binding_id = b.id WHERE p.id = $1::uuid`, [planId],
  );
  invariant(row.rows[0]?.owner_user_id === winnerId && row.rows[0]?.claimed_by === winnerId && row.rows[0]?.revoked, "guest claim authoritative state is inconsistent");
}

async function quotaReservationIdempotency({ sessions }) {
  const reservationId = randomUUID();
  const ipHash = hash64();
  const deviceHash = hash64();
  const pids = await Promise.all(sessions.map(backendPid));
  await Promise.all(sessions.map((session) => session.query("BEGIN")));
  try {
    await Promise.all(sessions.map((session) => setRoleAndSubject(session, "localens_quota_executor")));
    const works = sessions.map((session, index) => session.query(
      "SELECT * FROM private.reserve_quota($1::uuid, 'planner', $2, $3)", [reservationId, ipHash, deviceHash],
    ).then((value) => ({ index, value }), (error) => ({ index, error })));
    const first = await Promise.race(works);
    if (first.error) throw first.error;
    const secondIndex = first.index === 0 ? 1 : 0;
    await sessions[first.index].query("RESET ROLE");
    await waitForLock(sessions[first.index], pids[secondIndex]);
    await sessions[first.index].query("COMMIT");
    const second = await works[secondIndex];
    if (second.error) throw second.error;
    await sessions[secondIndex].query("COMMIT");
    const states = [first.value, second.value].map((outcome) => outcome.rows[0]?.state).sort();
    invariant(states.join(",") === "created,replayed", "quota race must return created and replayed");
  } catch (error) { await Promise.all(sessions.map(rollbackQuietly)); throw error; }
  const row = await sessions[0].query(
    `SELECT (SELECT count(*)::integer FROM private.quota_reservations WHERE reservation_id = $1::uuid) AS reservations,
      (SELECT min(used_count)::integer FROM private.quota_buckets WHERE bucket_hash IN ($2, $3)) AS min_used,
      (SELECT max(used_count)::integer FROM private.quota_buckets WHERE bucket_hash IN ($2, $3)) AS max_used`,
    [reservationId, ipHash, deviceHash],
  );
  invariant(row.rows[0]?.reservations === 1 && row.rows[0]?.min_used === 1 && row.rows[0]?.max_used === 1, "quota idempotency persisted duplicate usage");
}

async function createPublishedDepartureFixture(session) {
  const ids = Object.fromEntries(["catalog", "area", "place", "travel", "tour", "version", "departure"].map((key) => [key, randomUUID()]));
  const slug = `concurrency-${ids.tour.replaceAll("-", "").slice(0, 16)}`;
  await session.query("BEGIN");
  try {
    await session.query("INSERT INTO public.catalog_snapshots (id, status) VALUES ($1::uuid, 'building')", [ids.catalog]);
    await session.query("INSERT INTO public.catalog_snapshot_areas (snapshot_id, area_id, slug) VALUES ($1::uuid, $2::uuid, $3)", [ids.catalog, ids.area, `${slug}-area`]);
    await session.query(`INSERT INTO public.catalog_snapshot_places (snapshot_id, place_id, area_id, slug, price_vnd_per_person, visit_duration_minutes, source_url, verified_at, attribution)
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 0, 60, 'https://example.invalid/concurrency-place', CURRENT_DATE, 'Concurrency fixture')`, [ids.catalog, ids.place, ids.area, `${slug}-place`]);
    await session.query(`INSERT INTO public.catalog_snapshot_place_translations (snapshot_id, place_id, locale, title, summary, description) VALUES
      ($1::uuid, $2::uuid, 'en', 'Concurrency place', 'Fixture', 'Fixture'),
      ($1::uuid, $2::uuid, 'vi', 'Dia diem concurrency', 'Mau', 'Mau')`, [ids.catalog, ids.place]);
    await session.query("INSERT INTO public.travel_snapshots (id, catalog_snapshot_id, status) VALUES ($1::uuid, $2::uuid, 'building')", [ids.travel, ids.catalog]);
    await session.query("SET LOCAL ROLE localens_tour_rpc_owner");
    await session.query("INSERT INTO public.tours (id, slug, status) VALUES ($1::uuid, $2, 'draft')", [ids.tour, slug]);
    await session.query(`INSERT INTO public.tour_translations (tour_id, locale, title, summary, meeting_point) VALUES
      ($1::uuid, 'en', 'Concurrency tour', 'Fixture', 'Concurrency gate'),
      ($1::uuid, 'vi', 'Tour concurrency', 'Mau', 'Cong mau')`, [ids.tour]);
    await session.query(`INSERT INTO public.tour_versions (id, tour_id, catalog_snapshot_id, status, duration_minutes, price_vnd_per_person, inclusions, exclusions, cancellation_policy, source_url, verified_at, attribution, license)
      VALUES ($1::uuid, $2::uuid, $3::uuid, 'draft', 60, 100000, ARRAY['guide'], ARRAY['transfer'], 'Concurrency fixture policy', 'https://example.invalid/concurrency-tour', CURRENT_DATE, 'Concurrency fixture', 'CC0')`, [ids.version, ids.tour, ids.catalog]);
    await session.query(`INSERT INTO public.tour_version_translations (tour_version_id, locale, title, summary, meeting_point) VALUES
      ($1::uuid, 'en', 'Concurrency version', 'Fixture', 'Concurrency gate'),
      ($1::uuid, 'vi', 'Phien ban concurrency', 'Mau', 'Cong mau')`, [ids.version]);
    await session.query("INSERT INTO public.tour_version_stops (tour_version_id, catalog_snapshot_id, position, place_id) VALUES ($1::uuid, $2::uuid, 1, $3::uuid)", [ids.version, ids.catalog, ids.place]);
    await session.query("RESET ROLE");
    await session.query("UPDATE public.catalog_snapshots SET status = 'published', published_at = pg_catalog.clock_timestamp() WHERE id = $1::uuid", [ids.catalog]);
    await session.query("UPDATE public.travel_snapshots SET status = 'published', published_at = pg_catalog.clock_timestamp() WHERE id = $1::uuid", [ids.travel]);
    await session.query("SET LOCAL ROLE localens_tour_rpc_owner");
    await session.query("UPDATE public.tour_versions SET status = 'published', published_at = pg_catalog.clock_timestamp() WHERE id = $1::uuid", [ids.version]);
    await session.query("UPDATE public.tours SET status = 'published' WHERE id = $1::uuid", [ids.tour]);
    await session.query(`INSERT INTO public.departures (id, tour_version_id, start_at, end_at, status, capacity)
      VALUES ($1::uuid, $2::uuid, pg_catalog.clock_timestamp() + interval '7 days', pg_catalog.clock_timestamp() + interval '7 days 2 hours', 'scheduled', 1)`, [ids.departure, ids.version]);
    await session.query("RESET ROLE");
    await session.query("COMMIT");
    return ids;
  } catch (error) { await rollbackQuietly(session); throw error; }
}

const checkoutSql = `SELECT * FROM private.start_checkout_tx($1, $2::uuid, 1, 'en'::public.locale, $3,
  pg_catalog.encode(extensions.digest(pg_catalog.convert_to(private.checkout_canonical_payload($4::uuid, $1, $2::uuid, 1, 'en'::public.locale), 'UTF8'), 'sha256'), 'hex'))`;

const publicFixedTourCheckoutSql = "SELECT * FROM public.begin_fixed_tour_booking($1::uuid, 1, 'en'::public.locale, $2)";

export function beginFixedTourBookingForConcurrency(session, { departureId, idempotencyKey }) {
  return session.query(publicFixedTourCheckoutSql, [departureId, idempotencyKey]);
}

async function departureCapacityNoOversell({ sessions, context }) {
  const [winner, contender] = sessions;
  const fixture = await createPublishedDepartureFixture(winner);
  const winnerId = randomUUID();
  const contenderId = randomUUID();
  await ensureCustomer(winner, winnerId, "capacity-winner");
  await ensureCustomer(winner, contenderId, "capacity-contender");
  const contenderPid = await backendPid(contender);
  await Promise.all([winner.query("BEGIN"), contender.query("BEGIN")]);
  try {
    await winner.query("SELECT id FROM public.departures WHERE id = $1::uuid FOR UPDATE", [fixture.departure]);
    await setRoleAndSubject(contender, "authenticated", contenderId);
    const contenderWork = beginFixedTourBookingForConcurrency(contender, {
      departureId: fixture.departure,
      idempotencyKey: `capacity-${randomUUID()}`,
    })
      .then((value) => ({ value }), (error) => ({ error }));
    const barrier = await Promise.race([
      waitForLock(winner, contenderPid).then(() => ({ kind: "lock" })),
      contenderWork.then((outcome) => ({ kind: "outcome", outcome })),
    ]);
    if (barrier.kind === "outcome") {
      if (barrier.outcome.error) throw barrier.outcome.error;
      throw new Error("CONCURRENCY_BARRIER_FAILED: departure checkout completed before the locked source row was released");
    }
    await setRoleAndSubject(winner, "authenticated", winnerId);
    const winnerResult = await beginFixedTourBookingForConcurrency(winner, {
      departureId: fixture.departure,
      idempotencyKey: `capacity-${randomUUID()}`,
    });
    await winner.query("COMMIT");
    let contenderSoldOut = false;
    const contenderOutcome = await contenderWork;
    if (contenderOutcome.error) {
      contenderSoldOut = contenderOutcome.error?.code === "P0001" && /sold out/.test(contenderOutcome.error.message);
      await rollbackQuietly(contender);
    } else {
      await contender.query("COMMIT");
    }
    invariant(winnerResult.rowCount === 1 && contenderSoldOut, "capacity one must accept one checkout and reject one");
    const capacityBooking = winnerResult.rows[0].booking_id;
    const checkoutAuthority = await winner.query(
      `SELECT attempts.id AS attempt_id, bookings.checkout_amount_minor
       FROM private.checkout_attempts AS attempts
       JOIN public.bookings AS bookings ON bookings.id = attempts.booking_id
       WHERE bookings.id = $1::uuid`,
      [capacityBooking],
    );
    invariant(checkoutAuthority.rowCount === 1, "public fixed-tour checkout must persist one internal attempt");
    Object.assign(context, {
      catalog: fixture.catalog,
      travel: fixture.travel,
      capacityBooking,
      capacityAttempt: checkoutAuthority.rows[0].attempt_id,
      capacityAmount: Number(checkoutAuthority.rows[0].checkout_amount_minor),
    });
  } catch (error) { await Promise.all([rollbackQuietly(winner), rollbackQuietly(contender)]); throw error; }
  const row = await winner.query("SELECT count(*)::integer AS holds, COALESCE(sum(party_size), 0)::integer AS held_party FROM private.capacity_holds WHERE departure_id = $1::uuid AND status = 'active'", [fixture.departure]);
  invariant(row.rows[0]?.holds === 1 && row.rows[0]?.held_party === 1, "departure capacity oversold");
}

async function quoteCheckoutCompensation({ sessions, context }) {
  const [winner, contender] = sessions;
  const ownerId = randomUUID();
  const planId = randomUUID();
  const revisionId = randomUUID();
  const requestId = randomUUID();
  const quoteId = randomUUID();
  await ensureCustomer(winner, ownerId, "quote-owner");
  await winner.query("INSERT INTO public.trip_plans (id, owner_user_id, latest_revision_no) VALUES ($1::uuid, $2::uuid, 1)", [planId, ownerId]);
  await winner.query(`INSERT INTO public.trip_plan_revisions (id, plan_id, revision_no, base_revision_no, request_json, result_json, fingerprint, ranking_source, catalog_snapshot_id, travel_snapshot_id, currency, budget_vnd, total_cost_vnd, total_duration_minutes, actor_user_id)
    VALUES ($1::uuid, $2::uuid, 1, 0, '{"partySize":1}'::jsonb, '{}'::jsonb, $3, 'deterministic', $4::uuid, $5::uuid, 'VND', 100000, 100000, 60, $6::uuid)`, [revisionId, planId, hash64(), context.catalog, context.travel, ownerId]);
  await winner.query("INSERT INTO public.custom_requests (id, plan_id, revision_id, revision_no, owner_user_id, status) VALUES ($1::uuid, $2::uuid, $3::uuid, 1, $4::uuid, 'draft')", [requestId, planId, revisionId, ownerId]);
  await winner.query(`INSERT INTO public.custom_quotes (id, request_id, status, amount_vnd_minor, checkout_currency, checkout_amount_minor, catalog_snapshot_id, travel_snapshot_id, title_en, title_vi, policy)
    VALUES ($1::uuid, $2::uuid, 'active', 100000, 'vnd', 100000, $3::uuid, $4::uuid, 'Concurrency quote', 'Bao gia concurrency', 'Concurrency fixture policy')`, [quoteId, requestId, context.catalog, context.travel]);
  await winner.query("BEGIN");
  await setRoleAndSubject(winner, "localens_checkout_rpc_owner", ownerId);
  const checkout = await winner.query(checkoutSql, ["quote", quoteId, `quote-${randomUUID()}`, ownerId]);
  await winner.query("COMMIT");
  const bookingId = checkout.rows[0].booking_id;
  const attemptId = checkout.rows[0].attempt_id;
  const contenderPid = await backendPid(contender);
  await Promise.all([winner.query("BEGIN"), contender.query("BEGIN")]);
  try {
    await winner.query("SELECT id FROM private.checkout_idempotency WHERE checkout_attempt_id = $1::uuid FOR UPDATE", [attemptId]);
    await setRoleAndSubject(contender, "localens_checkout_rpc_owner", ownerId);
    const contenderWork = contender.query("SELECT * FROM private.compensate_checkout_failure($1::uuid)", [attemptId])
      .then((value) => ({ value }), (error) => ({ error }));
    await waitForLock(winner, contenderPid);
    await setRoleAndSubject(winner, "localens_checkout_rpc_owner", ownerId);
    const winnerResult = await winner.query("SELECT * FROM private.compensate_checkout_failure($1::uuid)", [attemptId]);
    await winner.query("COMMIT");
    const contenderOutcome = await contenderWork;
    if (contenderOutcome.error) throw contenderOutcome.error;
    const contenderResult = contenderOutcome.value;
    await contender.query("COMMIT");
    invariant(winnerResult.rows[0]?.state === "compensated" && contenderResult.rows[0]?.state === "replayed", "quote compensation must apply once and replay once");
  } catch (error) { await Promise.all([rollbackQuietly(winner), rollbackQuietly(contender)]); throw error; }
  const row = await winner.query(`SELECT q.status AS quote_status, b.status AS booking_status, a.status AS attempt_status
    FROM public.custom_quotes q JOIN public.bookings b ON b.quote_id = q.id JOIN private.checkout_attempts a ON a.booking_id = b.id
    WHERE q.id = $1::uuid AND b.id = $2::uuid`, [quoteId, bookingId]);
  invariant(row.rows[0]?.quote_status === "active" && row.rows[0]?.booking_status === "cancelled" && row.rows[0]?.attempt_status === "compensated", "quote compensation authoritative state is inconsistent");
}

async function stripeWebhookEventRace({ sessions, context }) {
  const eventId = `evt_${randomUUID().replaceAll("-", "")}`;
  const payloadHash = hash64();
  const sessionId = `cs_${randomUUID().replaceAll("-", "")}`;
  const intentId = `pi_${randomUUID().replaceAll("-", "")}`;
  const sql = `SELECT * FROM private.finalize_stripe_event($1, $2, $3, $4::uuid, $5::uuid, $6::bigint, 'vnd'::public.checkout_currency,
    false, 'payment', 'acct_localens_test', 'we_localens_test', 'checkout.session.completed', 'complete', 'paid', $7)`;
  const pids = await Promise.all(sessions.map(backendPid));
  await Promise.all(sessions.map((session) => session.query("BEGIN")));
  try {
    await Promise.all(sessions.map((session) => setRoleAndSubject(session, "localens_webhook_executor")));
    const works = sessions.map((session, index) => session.query(sql, [eventId, payloadHash, sessionId, context.capacityBooking, context.capacityAttempt, context.capacityAmount, intentId])
      .then((value) => ({ index, value }), (error) => ({ index, error })));
    const first = await Promise.race(works);
    if (first.error) throw first.error;
    const secondIndex = first.index === 0 ? 1 : 0;
    await sessions[first.index].query("RESET ROLE");
    await waitForLock(sessions[first.index], pids[secondIndex]);
    await sessions[first.index].query("COMMIT");
    const second = await works[secondIndex];
    if (second.error) throw second.error;
    await sessions[secondIndex].query("COMMIT");
    const replayStates = [first.value, second.value].map((outcome) => outcome.rows[0]?.replayed).sort();
    invariant(replayStates.length === 2 && replayStates[0] === false && replayStates[1] === true, "Stripe event must process once and replay once");
  } catch (error) { await Promise.all(sessions.map(rollbackQuietly)); throw error; }
  const row = await sessions[0].query(`SELECT
    (SELECT count(*)::integer FROM private.webhook_events WHERE provider_event_id = $1) AS event_count,
    (SELECT count(*)::integer FROM public.payments WHERE booking_id = $2::uuid) AS payment_count,
    (SELECT status FROM public.bookings WHERE id = $2::uuid) AS booking_status,
    (SELECT status FROM public.payments WHERE booking_id = $2::uuid) AS payment_status,
    (SELECT status FROM private.capacity_holds WHERE booking_id = $2::uuid) AS hold_status`, [eventId, context.capacityBooking]);
  invariant(row.rows[0]?.event_count === 1 && row.rows[0]?.payment_count === 1 && row.rows[0]?.booking_status === "confirmed" && row.rows[0]?.payment_status === "paid" && row.rows[0]?.hold_status === "consumed", "Stripe race authoritative state is inconsistent");
}

async function simulatedPaymentTerminalization({ sessions }) {
  const [winner, contender] = sessions;
  const fixture = await createPublishedDepartureFixture(winner);
  const ownerId = randomUUID();
  const bookingKey = `simulated-booking-${randomUUID()}`;
  const paymentKey = `simulated-payment-${randomUUID()}`;
  await ensureCustomer(winner, ownerId, "simulated-payment-owner");
  await winner.query("BEGIN");
  try {
    await setRoleAndSubject(winner, "authenticated", ownerId);
    const checkout = await beginFixedTourBookingForConcurrency(winner, {
      departureId: fixture.departure,
      idempotencyKey: bookingKey,
    });
    await winner.query("COMMIT");
    invariant(checkout.rowCount === 1, "simulated payment fixture did not create one booking");
    const bookingId = checkout.rows[0].booking_id;
    const contenderPid = await backendPid(contender);

    await Promise.all([winner.query("BEGIN"), contender.query("BEGIN")]);
    try {
      await winner.query(
        "SELECT id FROM private.checkout_idempotency WHERE booking_id = $1::uuid FOR UPDATE",
        [bookingId],
      );
      await setRoleAndSubject(contender, "authenticated", ownerId);
      const contenderWork = contender.query(
        "SELECT * FROM public.complete_simulated_fixed_tour_payment($1::uuid, $2)",
        [bookingId, paymentKey],
      ).then((value) => ({ value }), (error) => ({ error }));
      await waitForLock(winner, contenderPid);
      await setRoleAndSubject(winner, "authenticated", ownerId);
      const winnerResult = await winner.query(
        "SELECT * FROM public.complete_simulated_fixed_tour_payment($1::uuid, $2)",
        [bookingId, paymentKey],
      );
      await winner.query("COMMIT");
      const contenderOutcome = await contenderWork;
      if (contenderOutcome.error) throw contenderOutcome.error;
      await contender.query("COMMIT");
      const states = [winnerResult.rows[0]?.state, contenderOutcome.value.rows[0]?.state].sort();
      invariant(
        states.length === 2 && states[0] === "completed" && states[1] === "replayed",
        "simulated payment must complete once and replay once",
      );
    } catch (error) {
      await Promise.all([rollbackQuietly(winner), rollbackQuietly(contender)]);
      throw error;
    }

    const row = await winner.query(
      `SELECT
        (SELECT count(*)::integer FROM private.simulated_payment_receipts WHERE booking_id = $1::uuid) AS receipt_count,
        (SELECT count(*)::integer FROM public.payments WHERE booking_id = $1::uuid) AS real_payment_count,
        (SELECT status FROM public.bookings WHERE id = $1::uuid) AS booking_status,
        (SELECT status FROM private.capacity_holds WHERE booking_id = $1::uuid) AS hold_status,
        (SELECT result_payment_status FROM private.simulated_payment_receipts WHERE booking_id = $1::uuid) AS payment_status`,
      [bookingId],
    );
    invariant(
      row.rows[0]?.receipt_count === 1
        && row.rows[0]?.real_payment_count === 0
        && row.rows[0]?.booking_status === "confirmed"
        && row.rows[0]?.hold_status === "consumed"
        && row.rows[0]?.payment_status === "paid",
      "simulated payment terminal state is inconsistent",
    );
  } catch (error) {
    await rollbackQuietly(winner);
    throw error;
  }
}

const DEFAULT_SCENARIOS = {
  cas_revision_winner: casRevisionWinner,
  guest_claim_winner: guestClaimWinner,
  quota_reservation_idempotency: quotaReservationIdempotency,
  departure_capacity_no_oversell: departureCapacityNoOversell,
  quote_checkout_compensation: quoteCheckoutCompensation,
  stripe_webhook_event_race: stripeWebhookEventRace,
  simulated_payment_terminalization: simulatedPaymentTerminalization,
};

export async function runConcurrencyGate({ databaseUrl, sessionFactory = () => new Client({ connectionString: databaseUrl, application_name: "localens-concurrency" }), scenarios = DEFAULT_SCENARIOS, logger = () => {} } = {}) {
  validateLocalDatabaseUrl(databaseUrl);
  const sessions = [sessionFactory(databaseUrl), sessionFactory(databaseUrl)];
  invariant(sessions[0] !== sessions[1], "two independent database sessions are required");
  const context = {};
  await Promise.all(sessions.map((session) => session.connect()));
  try {
    for (const scenario of CONCURRENCY_SCENARIO_IDS) {
      invariant(typeof scenarios[scenario] === "function", `missing concurrency scenario ${scenario}`);
      logger(`[db:concurrency] ${scenario}`);
      await scenarios[scenario]({ sessions, context, databaseUrl });
    }
    return { ok: true, scenarios: [...CONCURRENCY_SCENARIO_IDS] };
  } finally { await Promise.allSettled(sessions.map((session) => session.end())); }
}

export async function runConcurrencyCheck({ cwd = process.cwd(), env = process.env, ...options } = {}) {
  if (env.LOCALENS_DB_URL) {
    try { validateLocalDatabaseUrl(env.LOCALENS_DB_URL); } catch (error) { return result("REMOTE_MODE_REJECTED", error.message); }
  }
  if (!env.LOCALENS_DB_URL?.trim()) return result("NOT_CONFIGURED", "LOCALENS_DB_URL is not configured for the local two-session harness");
  if (env.LOCALENS_DB_CONCURRENCY !== "1") return result("NOT_CONFIGURED", "set LOCALENS_DB_CONCURRENCY=1 only for an explicitly configured local harness");
  if (!resolveLocalSupabaseCli({ cwd })) return result("NOT_AVAILABLE", "project-local Supabase CLI is unavailable");
  try { return await runConcurrencyGate({ databaseUrl: env.LOCALENS_DB_URL, ...options }); }
  catch (error) {
    const diagnostic = [error?.message ?? String(error), error?.code && `SQLSTATE ${error.code}`, error?.detail, error?.where]
      .filter(Boolean)
      .join(" | ");
    return result("CONCURRENCY_FAILED", diagnostic);
  }
}

async function main() {
  const outcome = await runConcurrencyCheck({ logger: console.log });
  if (!outcome.ok) { console.error(outcome.message); process.exitCode = 2; return; }
  console.log(`PASS: ${outcome.scenarios.join(", ")}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`CONCURRENCY_FAILED: ${error?.message ?? String(error)}`); process.exitCode = 2; });
}
