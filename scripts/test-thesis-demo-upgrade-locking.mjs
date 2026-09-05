import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { lockThesisDemoInventory } from "./lib/thesis-demo-seed.mjs";
import { readThesisDemoInventory } from "./seed-thesis-demo-cloud.mjs";

const { Client } = pg;
const DB_URL_ENV = "LOCALENS_THESIS_DEMO_LOCK_DB_URL";
const DB_PORT_ENV = "LOCALENS_THESIS_DEMO_LOCK_DB_PORT";
const ENABLE_ENV = "LOCALENS_THESIS_DEMO_LOCK_TEST";
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
  return { databaseUrl, expectedPort };
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
  await client.query("BEGIN");
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

export async function runThesisDemoUpgradeLockRace({ databaseUrl, expectedPort, logger = console.log }) {
  readConfig({
    [ENABLE_ENV]: "1",
    [DB_URL_ENV]: databaseUrl,
    [DB_PORT_ENV]: expectedPort,
  });
  const writer = new Client({ connectionString: databaseUrl });
  const seeder = new Client({ connectionString: databaseUrl });
  const observer = new Client({ connectionString: databaseUrl });
  const fixture = { ownerId: randomUUID(), operationId: randomUUID() };
  let writerStarted = false;
  let seederStarted = false;
  try {
    await Promise.all([writer.connect(), seeder.connect(), observer.connect()]);
    const baseline = await observer.query(
      "SELECT count(*)::integer AS count FROM private.runtime_planner_operations",
    );
    invariant(baseline.rows[0]?.count === 0, "race harness requires a fresh migrated database");
    await insertWriterFixture(writer, fixture);
    writerStarted = true;

    await seeder.query("BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE");
    seederStarted = true;
    await seeder.query("SET LOCAL statement_timeout = '15s'");
    const pidResult = await seeder.query("SELECT pg_catalog.pg_backend_pid() AS pid");
    const seederPid = Number(pidResult.rows[0]?.pid);
    invariant(Number.isInteger(seederPid) && seederPid > 0, "seed backend PID is unavailable");

    const lockPromise = lockThesisDemoInventory((sql, values) => seeder.query(sql, values));
    await waitForLock(observer, seederPid);
    await writer.query("COMMIT");
    writerStarted = false;
    await lockPromise;

    const dataset = JSON.parse(await readFile(DATASET_PATH, "utf8"));
    const inventory = await readThesisDemoInventory({
      query: (sql, values) => seeder.query(sql, values),
      dataset,
      projectRef: "local-lock-race",
    });
    const operationInventory = inventory.relations.find(
      ({ relation }) => relation === "private.runtime_planner_operations",
    );
    invariant(operationInventory?.unclassifiedRows === 1, "committed writer row escaped exact inventory");
    invariant(inventory.graphState !== "upgrade-v1", "non-exact graph was accepted as upgrade-v1");

    await seeder.query("ROLLBACK");
    seederStarted = false;
    logger("PASS: preexisting registry reader committed before inventory; inventory rejected its unclassified planner row");
    return { ok: true, waitObserved: true, unclassifiedPlannerRows: 1 };
  } finally {
    if (writerStarted) await rollbackQuietly(writer);
    if (seederStarted) await rollbackQuietly(seeder);
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
