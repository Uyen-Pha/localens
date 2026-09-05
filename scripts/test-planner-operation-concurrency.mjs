import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

export const PLANNER_OPERATION_DB_URL_ENV = "LOCALENS_PLANNER_OPERATION_DB_URL";
export const PLANNER_OPERATION_DB_PORT_ENV = "LOCALENS_PLANNER_OPERATION_DB_PORT";
export const PLANNER_OPERATION_CONCURRENCY_ENV = "LOCALENS_PLANNER_OPERATION_CONCURRENCY";

export const PLANNER_OPERATION_SCENARIO_IDS = [
  "same_owner_same_key_claim_race",
  "completion_wins_expiry_reconciliation",
  "expiry_wins_old_worker_completion",
];

export const REQUIRED_PLANNER_OPERATION_SCENARIOS = [
  "same-owner same-key same-digest claim race",
  "completion-first versus expiry reconciliation",
  "expiry-first versus old worker completion",
];

const PRESENTATION_DATABASE_PORTS = new Set(["54321", "54322"]);
const MIN_ISOLATED_DATABASE_PORT = 1024;
const MAX_DATABASE_PORT = 65535;
const DEFAULT_LOCK_WAIT_TIMEOUT_MS = 10_000;
const LOCK_POLL_INTERVAL_MS = 5;
const HOLD_AFTER_EXPIRY_GRACE_MS = 250;
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, Math.max(0, milliseconds)));

function harnessError(code, reason, details = {}) {
  const error = new Error(`${code}: ${reason}`);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function invariant(condition, message) {
  if (condition) return;
  throw harnessError("CONCURRENCY_INVARIANT_FAILED", message);
}

function result(code, reason) {
  return {
    ok: false,
    code,
    message: `${code}: ${reason}. Required scenarios: ${REQUIRED_PLANNER_OPERATION_SCENARIOS.join("; ")}`,
  };
}

function redactDiagnostic(value) {
  let message = String(value ?? "unknown planner-operation concurrency failure");
  message = message.replace(/(?:postgres(?:ql)?):\/\/[^\s'"|]+/gi, "[database URL redacted]");
  message = message.replace(/(password|passfile|user|host|port)\s*=\s*[^\s,;|]+/gi, "$1=[redacted]");
  return message;
}

function parseExpectedPort(expectedPort) {
  if (expectedPort === undefined || expectedPort === null || String(expectedPort).trim() === "") {
    throw harnessError("ISOLATED_DB_PORT_REQUIRED", "an explicit expected port is required");
  }

  const text = String(expectedPort).trim();
  if (!/^\d{1,5}$/.test(text)) {
    throw harnessError("ISOLATED_DB_PORT_INVALID", "the expected port must be a decimal TCP port");
  }

  const numericPort = Number(text);
  if (!Number.isInteger(numericPort) || numericPort < MIN_ISOLATED_DATABASE_PORT || numericPort > MAX_DATABASE_PORT) {
    throw harnessError("ISOLATED_DB_PORT_INVALID", "the expected port must be between 1024 and 65535");
  }
  if (PRESENTATION_DATABASE_PORTS.has(text)) {
    throw harnessError("PRESENTATION_PORT_REJECTED", "presentation database ports 54321 and 54322 are never accepted");
  }
  return text;
}

export function validateIsolatedRuntimeDatabaseUrl(value, expectedPort) {
  const portText = parseExpectedPort(expectedPort);
  if (typeof value !== "string" || value.trim() === "") {
    throw harnessError("ISOLATED_DB_URL_REQUIRED", "an explicit isolated runtime database URL is required");
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw harnessError("ISOLATED_DB_URL_INVALID", "the database URL is not a valid PostgreSQL URL");
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw harnessError("ISOLATED_DB_URL_INVALID", "the database URL must use postgres:// or postgresql://");
  }
  if (parsed.search || parsed.hash) {
    throw harnessError(
      "ISOLATED_DB_PARAMETER_OVERRIDE_REJECTED",
      "database URL query parameters and fragments are not allowed to override the isolated endpoint",
    );
  }
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname)) {
    throw harnessError("ISOLATED_DB_HOST_REJECTED", "the database URL host must be loopback-only");
  }
  if (parsed.port !== portText) {
    throw harnessError("ISOLATED_DB_PORT_MISMATCH", "the database URL port must equal the explicit expected isolated port");
  }

  return parsed;
}

function hasEnvironmentValue(env, key) {
  return Object.prototype.hasOwnProperty.call(env, key) && env[key] !== undefined;
}

export function readPlannerOperationConcurrencyConfig(env = process.env) {
  const hasConfiguration = [
    PLANNER_OPERATION_DB_URL_ENV,
    PLANNER_OPERATION_DB_PORT_ENV,
    PLANNER_OPERATION_CONCURRENCY_ENV,
  ].some((key) => hasEnvironmentValue(env, key));
  if (!hasConfiguration) return null;

  const databaseUrl = typeof env[PLANNER_OPERATION_DB_URL_ENV] === "string"
    ? env[PLANNER_OPERATION_DB_URL_ENV].trim()
    : "";
  const expectedPort = typeof env[PLANNER_OPERATION_DB_PORT_ENV] === "string"
    ? env[PLANNER_OPERATION_DB_PORT_ENV].trim()
    : env[PLANNER_OPERATION_DB_PORT_ENV];

  if (!databaseUrl || expectedPort === undefined || expectedPort === null || String(expectedPort).trim() === "") {
    throw harnessError(
      "NOT_CONFIGURED",
      `${PLANNER_OPERATION_DB_URL_ENV} and ${PLANNER_OPERATION_DB_PORT_ENV} must both be set explicitly`,
    );
  }
  if (env[PLANNER_OPERATION_CONCURRENCY_ENV] !== "1") {
    throw harnessError(
      "NOT_CONFIGURED",
      `${PLANNER_OPERATION_CONCURRENCY_ENV}=1 is required for the isolated multi-session harness`,
    );
  }

  validateIsolatedRuntimeDatabaseUrl(databaseUrl, expectedPort);
  return { databaseUrl, expectedPort: String(expectedPort).trim() };
}

async function rollbackQuietly(session) {
  try {
    await session.query("ROLLBACK");
  } catch {
    // Preserve the original race failure and keep cleanup best-effort.
  }
}

async function backendPid(session) {
  const response = await session.query("SELECT pg_catalog.pg_backend_pid() AS pid");
  const pid = Number(response.rows[0]?.pid);
  invariant(Number.isInteger(pid) && pid > 0, "database session did not expose a backend PID");
  return pid;
}

async function waitForLock(observer, blockedPid, sleep = delay) {
  const deadline = Date.now() + DEFAULT_LOCK_WAIT_TIMEOUT_MS;
  let lastState;
  while (Date.now() < deadline) {
    const response = await observer.query(
      "SELECT state, wait_event_type, wait_event, pg_catalog.left(query, 80) AS query FROM pg_catalog.pg_stat_activity WHERE pid = $1",
      [blockedPid],
    );
    lastState = response.rows[0];
    if (lastState?.wait_event_type === "Lock") return;
    await sleep(LOCK_POLL_INTERVAL_MS);
  }
  throw harnessError(
    "CONCURRENCY_BARRIER_FAILED",
    `backend ${blockedPid} did not enter a lock wait; last state ${JSON.stringify(lastState ?? null)}`,
  );
}

async function beginServiceTransaction(session) {
  await session.query("BEGIN");
  await session.query("SET LOCAL ROLE service_role");
}

function decodeDecision(response) {
  const raw = response.rows?.[0]?.decision;
  if (raw && typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      throw harnessError("CONCURRENCY_PROTOCOL_FAILED", "operation RPC returned malformed JSON");
    }
  }
  throw harnessError("CONCURRENCY_PROTOCOL_FAILED", "operation RPC returned no decision");
}

const CLAIM_SQL = `SELECT public.claim_runtime_planner_operation(
  $1::uuid, $2::uuid, 'recommend'::text, $3::text, NULL::uuid, NULL::integer
) AS decision`;

const COMPLETE_RECOMMENDATION_SQL = `SELECT public.complete_runtime_recommendation(
  $1::uuid, $2::uuid, $3::text, $4::uuid, $5::jsonb
) AS decision`;

async function claimRecommendation(session, fixture) {
  const response = await session.query(CLAIM_SQL, [fixture.ownerId, fixture.operationId, fixture.digest]);
  return decodeDecision(response);
}

async function completeRecommendation(session, fixture, leaseToken) {
  const response = await session.query(COMPLETE_RECOMMENDATION_SQL, [
    fixture.ownerId,
    fixture.operationId,
    fixture.digest,
    leaseToken,
    JSON.stringify(fixture.persistenceDto),
  ]);
  return decodeDecision(response);
}

function createFixture(label) {
  const ownerId = randomUUID();
  const operationId = randomUUID();
  const catalogSnapshotId = randomUUID();
  const travelSnapshotId = randomUUID();
  const areaId = randomUUID();
  const placeId = randomUUID();
  return {
    label,
    ownerId,
    operationId,
    catalogSnapshotId,
    travelSnapshotId,
    areaId,
    placeId,
    digest: "a".repeat(64),
    manualPlanId: randomUUID(),
    manualPlannerReservationId: randomUUID(),
    manualGeminiReservationId: randomUUID(),
    manualLeaseToken: randomUUID(),
    persistenceDto: null,
  };
}

function buildPersistenceDto(fixture) {
  return {
    revisionNo: 1,
    request: {
      startAt: "2026-09-05T01:00:00Z",
      durationMinutes: 60,
      areas: [fixture.areaId],
      budget: { currency: "VND", amountMinor: 0 },
      partySize: 1,
      guideLanguage: "en",
      priorityWeights: {
        street_food: 1,
        history: 0,
        traditional_craft: 0,
        traditional_market: 0,
      },
      pace: "balanced",
      dietaryRequirements: [],
      mobilityRequirements: [],
      lockedStopIds: [],
    },
    result: {
      normalizedStartAt: "2026-09-05T08:00:00+07:00",
      budgetVnd: 0,
      rankingSource: "deterministic",
      items: [],
      totals: {
        durationMinutes: 0,
        visitMinutes: 0,
        travelMinutes: 0,
        transitionBufferMinutes: 0,
        groupCostVnd: 0,
        score: 0,
      },
      snapshotIds: {
        catalog: fixture.catalogSnapshotId,
        travel: fixture.travelSnapshotId,
        fx: null,
      },
    },
    fingerprint: fixture.digest,
    rankingSource: "deterministic",
    catalogSnapshotId: fixture.catalogSnapshotId,
    travelSnapshotId: fixture.travelSnapshotId,
    fxSnapshotId: null,
    fxVndPerUsd: null,
    currency: "VND",
    budgetVnd: "0",
    totalCostVnd: "0",
    totalDurationMinutes: 0,
    lockedPlaceIds: [],
    items: [],
  };
}

async function createCustomerAndSnapshotFixture(session, fixture) {
  fixture.persistenceDto = buildPersistenceDto(fixture);
  await session.query("BEGIN");
  try {
    await session.query(
      `INSERT INTO auth.users (
         id, aud, role, email, encrypted_password, raw_app_meta_data,
         raw_user_meta_data, created_at, updated_at
       ) VALUES ($1::uuid, 'authenticated', 'authenticated', $2, '', '{}'::jsonb, '{}'::jsonb,
         pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp())
       ON CONFLICT (id) DO NOTHING`,
      [fixture.ownerId, `planner-operation-${fixture.label}-${fixture.ownerId}@example.invalid`],
    );
    await session.query(
      `INSERT INTO private.user_roles (user_id, role)
       VALUES ($1::uuid, 'customer'::public.app_role)
       ON CONFLICT (user_id, role) DO NOTHING`,
      [fixture.ownerId],
    );
    await session.query(
      `INSERT INTO public.catalog_snapshots (id, status, published_at)
       VALUES ($1::uuid, 'building'::public.snapshot_status, NULL)`,
      [fixture.catalogSnapshotId],
    );
    await session.query(
      `INSERT INTO public.catalog_snapshot_areas (snapshot_id, area_id, slug)
       VALUES ($1::uuid, $2::uuid, $3)`,
      [fixture.catalogSnapshotId, fixture.areaId, `planner-operation-${fixture.areaId}`],
    );
    await session.query(
      `INSERT INTO public.catalog_snapshot_places (
         snapshot_id, place_id, area_id, slug, price_vnd_per_person,
         visit_duration_minutes, source_url, verified_at, attribution
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4, 0, 60,
         'https://example.invalid/planner-operation-race', CURRENT_DATE,
         'Planner operation concurrency fixture'
       )`,
      [
        fixture.catalogSnapshotId,
        fixture.placeId,
        fixture.areaId,
        `planner-operation-${fixture.placeId}`,
      ],
    );
    await session.query(
      `UPDATE public.catalog_snapshots
       SET status = 'published'::public.snapshot_status,
           published_at = pg_catalog.clock_timestamp()
       WHERE id = $1::uuid`,
      [fixture.catalogSnapshotId],
    );
    await session.query(
      `INSERT INTO public.travel_snapshots (id, catalog_snapshot_id, status, published_at)
       VALUES ($1::uuid, $2::uuid, 'building'::public.snapshot_status, NULL)`,
      [fixture.travelSnapshotId, fixture.catalogSnapshotId],
    );
    await session.query(
      `UPDATE public.travel_snapshots
       SET status = 'published'::public.snapshot_status,
           published_at = pg_catalog.clock_timestamp()
       WHERE id = $1::uuid`,
      [fixture.travelSnapshotId],
    );
    await session.query("COMMIT");
  } catch (error) {
    await rollbackQuietly(session);
    throw error;
  }
  return fixture;
}

async function insertClaimedOperationFixture(session, fixture, ageSeconds) {
  const claimedAtExpression = ageSeconds === "near-expiry"
    ? "pg_catalog.clock_timestamp() - INTERVAL '56 seconds'"
    : "pg_catalog.clock_timestamp() - INTERVAL '61 seconds'";

  await session.query("BEGIN");
  try {
    await session.query("SET LOCAL ROLE localens_plan_rpc_owner");
    const response = await session.query(
      `WITH lease_clock AS (
         SELECT ${claimedAtExpression} AS claimed_at
       )
       INSERT INTO private.runtime_planner_operations (
         owner_user_id, operation_id, kind, request_digest,
         target_plan_id, base_revision_no, recommend_plan_id,
         planner_reservation_id, gemini_reservation_id, lease_token,
         lease_version, state, created_at, claimed_at, lease_expires_at
       )
       SELECT $1::uuid, $2::uuid, 'recommend', $3,
         NULL::uuid, NULL::integer, $4::uuid,
         $5::uuid, $6::uuid, $7::uuid,
         1, 'claimed', lease_clock.claimed_at - INTERVAL '1 second',
         lease_clock.claimed_at, lease_clock.claimed_at + INTERVAL '60 seconds'
       FROM lease_clock
       RETURNING EXTRACT(EPOCH FROM lease_expires_at) * 1000 AS lease_expires_ms`,
      [
        fixture.ownerId,
        fixture.operationId,
        fixture.digest,
        fixture.manualPlanId,
        fixture.manualPlannerReservationId,
        fixture.manualGeminiReservationId,
        fixture.manualLeaseToken,
      ],
    );
    await session.query("COMMIT");
    return {
      planId: fixture.manualPlanId,
      plannerReservationId: fixture.manualPlannerReservationId,
      geminiReservationId: fixture.manualGeminiReservationId,
      leaseToken: fixture.manualLeaseToken,
      leaseExpiresAtMs: Number(response.rows[0]?.lease_expires_ms),
    };
  } catch (error) {
    await rollbackQuietly(session);
    throw error;
  }
}

async function readLeaseRemainingMs(session, fixture) {
  const response = await session.query(
    `SELECT EXTRACT(EPOCH FROM (
       lease_expires_at - pg_catalog.clock_timestamp()
     )) * 1000 AS remaining_ms
     FROM private.runtime_planner_operations
     WHERE owner_user_id = $1::uuid AND operation_id = $2::uuid`,
    [fixture.ownerId, fixture.operationId],
  );
  return Number(response.rows[0]?.remaining_ms);
}

async function readOperationEvidence(session, fixture, planId) {
  const response = await session.query(
    `SELECT
       (SELECT count(*)::integer
        FROM private.runtime_planner_operations
        WHERE owner_user_id = $1::uuid AND operation_id = $2::uuid) AS operation_count,
       (SELECT state
        FROM private.runtime_planner_operations
        WHERE owner_user_id = $1::uuid AND operation_id = $2::uuid) AS operation_state,
       (SELECT result_plan_id::text
        FROM private.runtime_planner_operations
        WHERE owner_user_id = $1::uuid AND operation_id = $2::uuid) AS result_plan_id,
       (SELECT result_revision_no
        FROM private.runtime_planner_operations
        WHERE owner_user_id = $1::uuid AND operation_id = $2::uuid) AS result_revision,
       (SELECT recommend_plan_id::text
        FROM private.runtime_planner_operations
        WHERE owner_user_id = $1::uuid AND operation_id = $2::uuid) AS operation_plan_id,
       (SELECT planner_reservation_id::text
        FROM private.runtime_planner_operations
        WHERE owner_user_id = $1::uuid AND operation_id = $2::uuid) AS planner_reservation_id,
       (SELECT gemini_reservation_id::text
        FROM private.runtime_planner_operations
        WHERE owner_user_id = $1::uuid AND operation_id = $2::uuid) AS gemini_reservation_id,
       (SELECT count(*)::integer FROM public.trip_plans WHERE id = $3::uuid) AS plan_count,
       (SELECT count(*)::integer FROM public.trip_plan_revisions WHERE plan_id = $3::uuid) AS revision_count,
       (SELECT count(*)::integer FROM private.recommendation_runs WHERE plan_id = $3::uuid) AS recommendation_run_count`,
    [fixture.ownerId, fixture.operationId, planId],
  );
  const row = response.rows[0] ?? {};
  return {
    operationRow: {
      count: Number(row.operation_count),
      state: row.operation_state,
      resultPlanId: row.result_plan_id,
      resultRevision: row.result_revision === null || row.result_revision === undefined
        ? null
        : Number(row.result_revision),
      planId: row.operation_plan_id,
      plannerReservationId: row.planner_reservation_id,
      geminiReservationId: row.gemini_reservation_id,
    },
    planCount: Number(row.plan_count),
    revisionCount: Number(row.revision_count),
    recommendationRunCount: Number(row.recommendation_run_count),
  };
}

function settle(promise) {
  return promise.then((value) => ({ value }), (error) => ({ error }));
}

async function abortRace(sessions, pending) {
  await rollbackQuietly(sessions[0]);
  if (pending) await pending;
  await rollbackQuietly(sessions[1]);
}

export function assertClaimRaceInvariant({ first, second, operationRow, planCount, revisionCount }) {
  const decisions = [first, second];
  const claimed = decisions.filter((decision) => decision?.state === "claimed");
  const replay = decisions.filter((decision) => ["in_progress", "completed"].includes(decision?.state));
  invariant(claimed.length === 1, "same-key claim race must have exactly one claimed worker");
  invariant(replay.length === 1, "same-key claim race must have exactly one in-progress or completed replay");
  invariant(operationRow?.count === 1, "same-key claim race must persist exactly one operation row");
  invariant(claimed[0].planId && claimed[0].planId === operationRow.planId, "claim plan ID must be stable in the operation row");
  invariant(
    claimed[0].plannerReservationId
      && claimed[0].plannerReservationId === operationRow.plannerReservationId
      && claimed[0].geminiReservationId
      && claimed[0].geminiReservationId === operationRow.geminiReservationId
      && claimed[0].plannerReservationId !== claimed[0].geminiReservationId,
    "claim quota reservation IDs must be stable in the operation row",
  );
  if (replay[0].state === "completed") {
    invariant(replay[0].planId === claimed[0].planId && replay[0].revision === 1, "completed replay must return the original plan and revision");
    invariant(operationRow.state === "completed" && operationRow.resultPlanId === claimed[0].planId && operationRow.resultRevision === 1, "completed replay must match the terminal operation row");
    invariant(planCount === 1 && revisionCount === 1, "completed claim replay must leave one plan and one revision");
  } else {
    invariant(operationRow.state === "claimed", "in-progress replay must leave the operation claimed");
    invariant(planCount === 0 && revisionCount === 0, "in-progress claim replay must not create a plan or revision");
  }
  return true;
}

export function assertCompletionFirstInvariant({ completion, replay, operationRow, planCount, revisionCount, recommendationRunCount }) {
  invariant(completion?.state === "completed", "completion-first worker must complete under a valid lease");
  invariant(replay?.state === "completed", "claim waiting behind completion must replay completed");
  invariant(
    replay.planId === completion.planId
      && replay.revision === completion.revision
      && completion.revision === 1,
    "completion-first replay must return the original plan and revision",
  );
  invariant(operationRow?.count === 1 && operationRow.state === "completed", "completion-first race must have one completed operation row");
  invariant(
    operationRow.resultPlanId === completion.planId && operationRow.resultRevision === completion.revision,
    "completed operation must point at its committed plan revision",
  );
  invariant(planCount === 1 && revisionCount === 1 && recommendationRunCount === 1, "completion-first race must leave one plan, revision, and recommendation run");
  return true;
}

export function assertExpiryFirstInvariant({ reconcile, oldCompletion, operationRow, planCount, revisionCount, recommendationRunCount }) {
  invariant(reconcile?.state === "interrupted", "expiry-first reconciliation must terminalize the operation as interrupted");
  invariant(oldCompletion?.state === "interrupted", "old worker completion must replay interrupted after reconciliation commits");
  invariant(operationRow?.count === 1 && operationRow.state === "interrupted", "expiry-first race must have one interrupted operation row");
  invariant(operationRow.resultPlanId === null && operationRow.resultRevision === null, "interrupted operation cannot point at a result");
  invariant(planCount === 0 && revisionCount === 0 && recommendationRunCount === 0, "interrupted operation must leave no plan, revision, or recommendation orphan");
  return true;
}

async function sameOwnerSameKeyClaimRace({ sessions, sleep }) {
  const fixture = await createCustomerAndSnapshotFixture(sessions[0], createFixture("claim-race"));
  const [worker, contender] = sessions;
  const contenderPid = await backendPid(contender);
  let contenderWork;
  try {
    await beginServiceTransaction(worker);
    const first = await claimRecommendation(worker, fixture);
    invariant(first.state === "claimed", "first same-key claim must receive the claimed worker decision");

    await beginServiceTransaction(contender);
    contenderWork = settle(claimRecommendation(contender, fixture));
    await worker.query("RESET ROLE");
    await waitForLock(worker, contenderPid, sleep);

    await worker.query("SET LOCAL ROLE service_role");
    const completion = await completeRecommendation(worker, fixture, first.leaseToken);
    invariant(completion.state === "completed", "the first claim must be completable before releasing the contender");
    await worker.query("COMMIT");

    const contenderOutcome = await contenderWork;
    if (contenderOutcome.error) throw contenderOutcome.error;
    const replay = contenderOutcome.value;
    await contender.query("COMMIT");

    const evidence = await readOperationEvidence(worker, fixture, first.planId);
    assertClaimRaceInvariant({
      first,
      second: replay,
      ...evidence,
    });
  } catch (error) {
    await abortRace(sessions, contenderWork);
    throw error;
  }
}

async function completionWinsExpiryReconciliation({ sessions, sleep }) {
  const fixture = await createCustomerAndSnapshotFixture(sessions[0], createFixture("completion-first"));
  const operation = await insertClaimedOperationFixture(sessions[0], fixture, "near-expiry");
  const [completer, contender] = sessions;
  const contenderPid = await backendPid(contender);
  let contenderWork;
  try {
    const remainingBeforeCompletion = await readLeaseRemainingMs(completer, fixture);
    invariant(remainingBeforeCompletion > 0, "completion-first fixture must still have a valid lease before completion");

    await beginServiceTransaction(completer);
    const completion = await completeRecommendation(completer, fixture, operation.leaseToken);
    invariant(completion.state === "completed", "completion-first worker must complete while its lease is valid");
    await completer.query("RESET ROLE");

    await beginServiceTransaction(contender);
    contenderWork = settle(claimRecommendation(contender, fixture));
    await waitForLock(completer, contenderPid, sleep);

    const remainingAfterCompletion = await readLeaseRemainingMs(completer, fixture);
    await sleep(Math.max(HOLD_AFTER_EXPIRY_GRACE_MS, remainingAfterCompletion + HOLD_AFTER_EXPIRY_GRACE_MS));
    await completer.query("COMMIT");

    const contenderOutcome = await contenderWork;
    if (contenderOutcome.error) throw contenderOutcome.error;
    const replay = contenderOutcome.value;
    await contender.query("COMMIT");

    const evidence = await readOperationEvidence(completer, fixture, operation.planId);
    assertCompletionFirstInvariant({
      completion,
      replay,
      ...evidence,
    });
  } catch (error) {
    await abortRace(sessions, contenderWork);
    throw error;
  }
}

async function expiryWinsOldWorkerCompletion({ sessions, sleep }) {
  const fixture = await createCustomerAndSnapshotFixture(sessions[0], createFixture("expiry-first"));
  const operation = await insertClaimedOperationFixture(sessions[0], fixture, "expired");
  const [reconciler, oldWorker] = sessions;
  const oldWorkerPid = await backendPid(oldWorker);
  let oldCompletionWork;
  try {
    await beginServiceTransaction(reconciler);
    const reconcile = await claimRecommendation(reconciler, fixture);
    invariant(reconcile.state === "interrupted", "expired claim must reconcile to interrupted");

    await beginServiceTransaction(oldWorker);
    oldCompletionWork = settle(completeRecommendation(oldWorker, fixture, operation.leaseToken));
    await reconciler.query("RESET ROLE");
    await waitForLock(reconciler, oldWorkerPid, sleep);
    await reconciler.query("COMMIT");

    const oldCompletionOutcome = await oldCompletionWork;
    if (oldCompletionOutcome.error) throw oldCompletionOutcome.error;
    const oldCompletion = oldCompletionOutcome.value;
    await oldWorker.query("COMMIT");

    const evidence = await readOperationEvidence(reconciler, fixture, operation.planId);
    assertExpiryFirstInvariant({
      reconcile,
      oldCompletion,
      ...evidence,
    });
  } catch (error) {
    await abortRace(sessions, oldCompletionWork);
    throw error;
  }
}

export const DEFAULT_PLANNER_OPERATION_SCENARIOS = {
  same_owner_same_key_claim_race: sameOwnerSameKeyClaimRace,
  completion_wins_expiry_reconciliation: completionWinsExpiryReconciliation,
  expiry_wins_old_worker_completion: expiryWinsOldWorkerCompletion,
};

export async function runPlannerOperationConcurrencyGate({
  databaseUrl,
  expectedPort,
  sessionFactory = () => new Client({
    connectionString: databaseUrl,
    application_name: "localens-planner-operation-concurrency",
  }),
  scenarios = DEFAULT_PLANNER_OPERATION_SCENARIOS,
  logger = () => {},
  sleep = delay,
} = {}) {
  validateIsolatedRuntimeDatabaseUrl(databaseUrl, expectedPort);
  const sessions = [sessionFactory(databaseUrl), sessionFactory(databaseUrl)];
  invariant(sessions[0] !== sessions[1], "two independent database sessions are required");
  let connectionAttempted = false;
  try {
    connectionAttempted = true;
    await Promise.all(sessions.map((session) => session.connect()));
    for (const scenarioId of PLANNER_OPERATION_SCENARIO_IDS) {
      invariant(typeof scenarios[scenarioId] === "function", `missing planner-operation scenario ${scenarioId}`);
      logger(`[db:planner-operation-concurrency] ${scenarioId}`);
      await scenarios[scenarioId]({ sessions, databaseUrl, sleep });
    }
    return { ok: true, scenarios: [...PLANNER_OPERATION_SCENARIO_IDS] };
  } finally {
    if (connectionAttempted) await Promise.allSettled(sessions.map((session) => session.end()));
  }
}

export async function runPlannerOperationConcurrencyCheck({ env = process.env, ...options } = {}) {
  let config;
  try {
    config = readPlannerOperationConcurrencyConfig(env);
  } catch (error) {
    return result(error?.code ?? "NOT_CONFIGURED", redactDiagnostic(error?.message));
  }
  if (!config) {
    return result(
      "NOT_CONFIGURED",
      `set ${PLANNER_OPERATION_DB_URL_ENV}, ${PLANNER_OPERATION_DB_PORT_ENV}, and ${PLANNER_OPERATION_CONCURRENCY_ENV}=1 for the isolated runtime harness`,
    );
  }

  try {
    return await runPlannerOperationConcurrencyGate({
      ...options,
      databaseUrl: config.databaseUrl,
      expectedPort: config.expectedPort,
    });
  } catch (error) {
    return result("CONCURRENCY_FAILED", redactDiagnostic([
      error?.message ?? String(error),
      error?.code && `SQLSTATE ${error.code}`,
      error?.detail,
      error?.where,
    ].filter(Boolean).join(" | ")));
  }
}

async function main() {
  const outcome = await runPlannerOperationConcurrencyCheck({ logger: console.log });
  if (!outcome.ok) {
    console.error(outcome.message);
    process.exitCode = 2;
    return;
  }
  console.log(`PASS: ${outcome.scenarios.join(", ")}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`CONCURRENCY_FAILED: ${redactDiagnostic(error?.message ?? error)}`);
    process.exitCode = 2;
  });
}
