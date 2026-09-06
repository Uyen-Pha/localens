import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import {
  inspectThesisDemoDatasetGraph,
  runThesisDemoApplyTransaction,
} from "./lib/thesis-demo-seed.mjs";
import { readThesisDemoInventory } from "./seed-thesis-demo-cloud.mjs";

const { Client } = pg;
const DB_URL_ENV = "LOCALENS_THESIS_DEMO_LOCK_DB_URL";
const DB_PORT_ENV = "LOCALENS_THESIS_DEMO_LOCK_DB_PORT";
const ENABLE_ENV = "LOCALENS_THESIS_DEMO_LOCK_TEST";
const DISPOSABLE_CONFIRM_ENV = "LOCALENS_THESIS_DEMO_LOCK_DISPOSABLE_CONFIRM";
const DISPOSABLE_CONFIRMATION = "destructive-disposable-only";
const PRESENTATION_PORTS = new Set(["54321", "54322"]);
const WAIT_TIMEOUT_MS = 10_000;
const DATASET_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "demo",
  "thesis-demo.v2.json",
);

function invariant(condition, message) {
  if (!condition) throw new Error(`THESIS_DEMO_LOCK_RACE_FAILED: ${message}`);
}

function redact(value) {
  return String(value ?? "unknown failure")
    .replace(/(?:postgres(?:ql)?):\/\/[^\s'"|]+/gi, "[database URL redacted]")
    .replace(/(password|passfile|user|host|port)\s*=\s*[^\s,;|]+/gi, "$1=[redacted]");
}

function readConfig(env = process.env) {
  invariant(env[ENABLE_ENV] === "1", `${ENABLE_ENV}=1 is required`);
  invariant(
    env[DISPOSABLE_CONFIRM_ENV] === DISPOSABLE_CONFIRMATION,
    `${DISPOSABLE_CONFIRM_ENV}=${DISPOSABLE_CONFIRMATION} is required`,
  );
  const databaseUrl = String(env[DB_URL_ENV] ?? "").trim();
  const expectedPort = String(env[DB_PORT_ENV] ?? "").trim();
  invariant(databaseUrl.length > 0 && /^\d{4,5}$/.test(expectedPort), "explicit database URL and port are required");
  invariant(!PRESENTATION_PORTS.has(expectedPort), "presentation ports are forbidden");
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("THESIS_DEMO_LOCK_RACE_FAILED: database URL is invalid");
  }
  invariant(["postgres:", "postgresql:"].includes(parsed.protocol), "PostgreSQL URL is required");
  invariant(["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsed.hostname), "database must be loopback-only");
  invariant(parsed.port === expectedPort, "database URL and expected port differ");
  invariant(parsed.search === "" && parsed.hash === "", "database URL overrides are forbidden");
  return {
    databaseUrl,
    expectedPort,
    disposableConfirmation: env[DISPOSABLE_CONFIRM_ENV],
  };
}

async function rollbackQuietly(client) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Keep the original failure; every connection is closed in finally.
  }
}

async function waitForLock(observer, blockedPid) {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await observer.query(
      `SELECT wait_event_type, query
       FROM pg_catalog.pg_stat_activity
       WHERE pid = $1`,
      [blockedPid],
    );
    const state = result.rows[0];
    if (state?.wait_event_type === "Lock") {
      invariant(
        /^LOCK TABLE private\.thesis_demo_qa_slots IN ACCESS EXCLUSIVE MODE/i.test(state.query ?? ""),
        "seed transaction blocked on an unexpected statement",
      );
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("THESIS_DEMO_LOCK_RACE_FAILED: seed transaction never entered a registry lock wait");
}

async function insertWriterFixture(client, fixture) {
  await client.query(
    `INSERT INTO auth.users (
       id, aud, role, email, encrypted_password, raw_app_meta_data,
       raw_user_meta_data, created_at, updated_at
     ) VALUES (
       $1::uuid, 'authenticated', 'authenticated', $2, '', '{}'::jsonb,
       '{}'::jsonb, pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
     )`,
    [fixture.ownerId, `thesis-demo-lock-${fixture.ownerId}@example.invalid`],
  );
  const registryRead = await client.query(
    "SELECT count(*)::integer AS count FROM private.thesis_demo_qa_slots",
  );
  invariant(registryRead.rows[0]?.count === 0, "race fixture requires an empty QA registry");
  await client.query("SET LOCAL ROLE localens_plan_rpc_owner");
  await client.query(
    `WITH lock_clock AS (SELECT pg_catalog.clock_timestamp() AS claimed_at)
     INSERT INTO private.runtime_planner_operations (
       owner_user_id, operation_id, kind, request_digest,
       recommend_plan_id, planner_reservation_id, gemini_reservation_id,
       lease_token, state, created_at, claimed_at, lease_expires_at
     )
     SELECT $1::uuid, $2::uuid, 'recommend', $3,
       $4::uuid, $5::uuid, $6::uuid,
       $7::uuid, 'claimed', lock_clock.claimed_at,
       lock_clock.claimed_at, lock_clock.claimed_at + INTERVAL '60 seconds'
     FROM lock_clock`,
    [
      fixture.ownerId,
      fixture.operationId,
      "f".repeat(64),
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ],
  );
  await client.query("RESET ROLE");
}

function stableIdentities(dataset) {
  return dataset.accounts.map((account) => ({
    ...account,
    userId: randomUUID(),
    seedStatus: "created",
  }));
}

async function requireFreshDisposableDatabase(query, dataset, projectRef) {
  const inventory = await readThesisDemoInventory({ query, dataset, projectRef });
  invariant(inventory.graphState === "empty", "database graph is not empty");
  invariant(inventory.graphConflicts.length === 0, "database graph has conflicts");
  invariant(inventory.unexpectedObjects.length === 0, "database has unexpected relations");
  invariant(inventory.relations.every((row) => {
    if (row.relation === "private.stripe_test_settings") {
      return row.totalRows === 1
        && row.demoRows === 0
        && row.baselineRows === 1
        && row.unclassifiedRows === 0;
    }
    return row.totalRows === 0
      && row.demoRows === 0
      && row.baselineRows === 0
      && row.unclassifiedRows === 0;
  }), "database is not a fresh migrated disposable instance");
}

export async function runThesisDemoUpgradeLockRace({
  databaseUrl,
  expectedPort,
  disposableConfirmation,
  logger = console.log,
}) {
  readConfig({
    [ENABLE_ENV]: "1",
    [DISPOSABLE_CONFIRM_ENV]: disposableConfirmation,
    [DB_URL_ENV]: databaseUrl,
    [DB_PORT_ENV]: expectedPort,
  });
  const writer = new Client({ connectionString: databaseUrl });
  const seeder = new Client({ connectionString: databaseUrl });
  const observer = new Client({ connectionString: databaseUrl });
  const fixture = { ownerId: randomUUID(), operationId: randomUUID() };
  const projectRef = "local-lock-race";
  let writerStarted = false;
  let applyPromise;
  let seederPid;
  try {
    await Promise.all([writer.connect(), seeder.connect(), observer.connect()]);
    const dataset = JSON.parse(await readFile(DATASET_PATH, "utf8"));
    const identities = stableIdentities(dataset);
    await requireFreshDisposableDatabase(
      (sql, values) => observer.query(sql, values),
      dataset,
      projectRef,
    );
    logger("INFO: destructive-to-disposable-state race harness; reset or discard this fresh local database afterward");
    await writer.query("BEGIN");
    writerStarted = true;
    await insertWriterFixture(writer, fixture);

    const pidResult = await seeder.query("SELECT pg_catalog.pg_backend_pid() AS pid");
    seederPid = Number(pidResult.rows[0]?.pid);
    invariant(Number.isInteger(seederPid) && seederPid > 0, "seed backend PID is unavailable");

    let lockedInventory;
    applyPromise = runThesisDemoApplyTransaction({
      query: (sql, values) => seeder.query(sql, values),
      dataset,
      projectRef,
      identities,
      inspectDatasetGraph: inspectThesisDemoDatasetGraph,
      readInventory: async (input) => {
        lockedInventory = await readThesisDemoInventory(input);
        return lockedInventory;
      },
    });
    await waitForLock(observer, seederPid);
    await writer.query("COMMIT");
    writerStarted = false;
    const cause = await applyPromise.catch((error) => error);
    invariant(cause?.code === "THESIS_DEMO_DATABASE_FAILED", "apply transaction did not fail closed");
    const operationInventory = lockedInventory?.relations.find(
      ({ relation }) => relation === "private.runtime_planner_operations",
    );
    invariant(operationInventory?.unclassifiedRows === 1, "committed writer row escaped exact inventory");
    invariant(lockedInventory?.graphState === "empty", "scoped empty graph was not reproduced");

    logger("PASS: apply transaction rejected a writer committed between preflight and locked inventory validation");
    return { ok: true, waitObserved: true, applyRejected: true, unclassifiedPlannerRows: 1 };
  } catch (error) {
    if (applyPromise && Number.isInteger(seederPid)) {
      await observer.query("SELECT pg_catalog.pg_cancel_backend($1)", [seederPid]).catch(() => {});
    }
    throw error;
  } finally {
    if (writerStarted) await rollbackQuietly(writer);
    if (applyPromise) await applyPromise.catch(() => {});
    await Promise.allSettled([writer.end(), seeder.end(), observer.end()]);
  }
}

async function main() {
  const config = readConfig();
  await runThesisDemoUpgradeLockRace(config);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(redact(error?.message ?? error));
    process.exitCode = 2;
  });
}
