import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";
import pg from "pg";

import {
  THESIS_DEMO_RELATIONS,
  inspectThesisDemoDatasetGraph,
  runThesisDemoApplyTransaction,
  runThesisDemoDryRunTransaction,
  runThesisDemoSeed,
} from "./lib/thesis-demo-seed.mjs";

const { Client } = pg;
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATASET_PATH = path.join(PROJECT_ROOT, "data", "demo", "thesis-demo.v1.json");
const MIGRATIONS_PATH = path.join(PROJECT_ROOT, "supabase", "migrations");
const CLI_ERROR = Symbol("THESIS_DEMO_CLI_ERROR");
const SELECTED_PROJECT_SOURCE = "supabase-cli-projects-list";
const DASHBOARD_CONNECTION_SOURCES = new Set([
  "supabase-dashboard-connection-panel",
  "supabase-management-api",
]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function cliError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error[CLI_ERROR] = true;
  return error;
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function defaultReadJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    throw cliError("THESIS_DEMO_METADATA_INVALID", "verified controller metadata could not be read");
  }
}

export function loadControllerMetadata({
  selectedProjectPath,
  dashboardConnectionPath,
  readJsonFile = defaultReadJsonFile,
}) {
  if (!hasText(selectedProjectPath) || !hasText(dashboardConnectionPath)) {
    throw cliError("THESIS_DEMO_METADATA_REQUIRED", "two explicit verified metadata files are required");
  }
  let selectedRecord;
  let dashboardRecord;
  try {
    selectedRecord = readJsonFile(selectedProjectPath);
    dashboardRecord = readJsonFile(dashboardConnectionPath);
  } catch (error) {
    if (error?.[CLI_ERROR] === true) throw error;
    throw cliError("THESIS_DEMO_METADATA_INVALID", "verified controller metadata could not be read");
  }
  if (
    selectedRecord?.verified !== true
    || selectedRecord?.source !== SELECTED_PROJECT_SOURCE
    || selectedRecord?.project === null
    || typeof selectedRecord?.project !== "object"
    || dashboardRecord?.verified !== true
    || !DASHBOARD_CONNECTION_SOURCES.has(dashboardRecord?.source)
    || dashboardRecord?.connection === null
    || typeof dashboardRecord?.connection !== "object"
  ) {
    throw cliError(
      "THESIS_DEMO_METADATA_INVALID",
      "metadata must come from the selected-project CLI output and dashboard or Management API",
    );
  }
  return {
    selectedProject: selectedRecord.project,
    dashboardConnection: dashboardRecord.connection,
  };
}

function requireCliEnv(env) {
  const required = [
    ["LOCALLENS_THESIS_DEMO_SEED_CONFIRM", "localens-thesis-demo"],
    ["LOCALLENS_THESIS_DEMO_DB_URL"],
    ["LOCALLENS_THESIS_DEMO_EXPECTED_PROJECT_REF"],
    ["LOCALLENS_THESIS_DEMO_EXPECTED_ORGANIZATION_ID"],
    ["LOCALLENS_THESIS_DEMO_SELECTED_PROJECT_FILE"],
    ["LOCALLENS_THESIS_DEMO_DASHBOARD_CONNECTION_FILE"],
    ["NEXT_PUBLIC_SUPABASE_URL"],
    ["SUPABASE_SERVICE_ROLE_KEY"],
    ["LOCALLENS_DEMO_CUSTOMER_PASSWORD"],
    ["LOCALLENS_DEMO_GUIDE_PASSWORD"],
    ["LOCALLENS_DEMO_ADMIN_PASSWORD"],
    ["LOCALLENS_DEMO_QA_CUSTOMER_PASSWORD"],
  ];
  for (const [name, exact] of required) {
    if (!hasText(env?.[name]) || (exact !== undefined && env[name] !== exact)) {
      throw cliError("THESIS_DEMO_ENV_REQUIRED", "complete guarded thesis-demo environment is required");
    }
  }
  let databaseUrl;
  try {
    databaseUrl = new URL(env.LOCALLENS_THESIS_DEMO_DB_URL);
  } catch {
    throw cliError("THESIS_DEMO_DATABASE_URL_INVALID", "database URL must use verified TLS");
  }
  if (
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol)
    || LOOPBACK_HOSTS.has(databaseUrl.hostname)
    || databaseUrl.searchParams.get("sslmode") !== "verify-full"
  ) {
    throw cliError("THESIS_DEMO_DATABASE_URL_INVALID", "database URL must use a non-loopback verify-full connection");
  }
}

export function listExpectedThesisDemoRelations() {
  const relations = new Set();
  for (const filename of readdirSync(MIGRATIONS_PATH).filter((name) => name.endsWith(".sql"))) {
    const source = readFileSync(path.join(MIGRATIONS_PATH, filename), "utf8");
    for (const match of source.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(public|private|auth)\.([a-z_][a-z0-9_]*)/gi)) {
      relations.add(`${match[1].toLowerCase()}.${match[2].toLowerCase()}`);
    }
  }
  relations.add("auth.users");
  return [...relations].sort();
}

function valuesFromConfig(key) {
  return `(SELECT value FROM config,
    pg_catalog.jsonb_array_elements_text(config.data->'${key}') AS values(value))`;
}

function demoPredicate(relation) {
  const ids = (column, key) => `candidate.${column}::text IN ${valuesFromConfig(key)}`;
  const allowedAuth = (column) => `candidate.${column} IN (SELECT id FROM allowed_auth)`;
  const allowedCatalog = (column = "snapshot_id") =>
    `candidate.${column} IN (SELECT id FROM allowed_catalog)`;
  const allowedTravel = (column = "snapshot_id") =>
    `candidate.${column} IN (SELECT id FROM allowed_travel)`;
  const predicates = {
    "auth.users": ids("email", "accountEmails"),
    "private.audit_events": `(candidate.actor_user_id IS NULL OR ${allowedAuth("actor_user_id")}) AND ${ids("target_id", "stableIds")}`,
    "private.booking_cancellations": `${allowedAuth("customer_user_id")} AND ${ids("booking_id", "bookingIds")}`,
    "private.capacity_holds": ids("booking_id", "bookingIds"),
    "private.checkout_attempts": `${allowedAuth("owner_user_id")} AND ${ids("booking_id", "bookingIds")}`,
    "private.checkout_idempotency": `${allowedAuth("owner_user_id")} AND ${ids("booking_id", "bookingIds")}`,
    "private.fixed_tour_cancellation_requests": `${allowedAuth("owner_user_id")} AND ${ids("booking_id", "bookingIds")}`,
    "private.guide_assignment_idempotency": `${allowedAuth("actor_user_id")} AND ${ids("booking_id", "bookingIds")}`,
    "private.runtime_planner_operations": `${allowedAuth("owner_user_id")} AND ${ids("operation_id", "runIds")}`,
    "private.simulated_payment_receipts": `${allowedAuth("owner_user_id")} AND ${ids("booking_id", "bookingIds")}`,
    "private.thesis_demo_manifest": "candidate.environment = 'thesis-demo' AND candidate.dataset_version = (SELECT data->>'datasetVersion' FROM config) AND candidate.project_ref = (SELECT data->>'projectRef' FROM config)",
    "private.user_roles": allowedAuth("user_id"),
    "private.webhook_events": ids("booking_id", "bookingIds"),
    "public.area_translations": ids("area_id", "areaIds"),
    "public.areas": ids("id", "areaIds"),
    "public.bookings": `${allowedAuth("owner_user_id")} AND ${ids("id", "bookingIds")} AND ${ids("departure_id", "qaDepartureIds")}`,
    "public.catalog_snapshot_area_translations": `${allowedCatalog()} AND ${ids("area_id", "areaIds")}`,
    "public.catalog_snapshot_areas": `${allowedCatalog()} AND ${ids("area_id", "areaIds")}`,
    "public.catalog_snapshot_place_experience_types": `${allowedCatalog()} AND ${ids("place_id", "placeIds")}`,
    "public.catalog_snapshot_place_guide_languages": `${allowedCatalog()} AND ${ids("place_id", "placeIds")}`,
    "public.catalog_snapshot_place_opening_hours": `${allowedCatalog()} AND ${ids("opening_id", "openingIds")}`,
    "public.catalog_snapshot_place_supports": `${allowedCatalog()} AND ${ids("place_id", "placeIds")}`,
    "public.catalog_snapshot_place_translations": `${allowedCatalog()} AND ${ids("place_id", "placeIds")}`,
    "public.catalog_snapshot_places": `${allowedCatalog()} AND ${ids("place_id", "placeIds")}`,
    "public.catalog_snapshots": allowedCatalog("id"),
    "public.departures": ids("id", "departureIds"),
    "public.guide_assignments": `${ids("booking_id", "bookingIds")} AND ${allowedAuth("guide_user_id")}`,
    "public.guide_profiles": allowedAuth("user_id"),
    "public.payments": `${allowedAuth("owner_user_id")} AND ${ids("id", "paymentIds")} AND ${ids("booking_id", "bookingIds")}`,
    "public.place_experience_types": ids("place_id", "placeIds"),
    "public.place_guide_languages": ids("place_id", "placeIds"),
    "public.place_opening_hours": ids("id", "openingIds"),
    "public.place_supports": ids("place_id", "placeIds"),
    "public.place_translations": ids("place_id", "placeIds"),
    "public.places": ids("id", "placeIds"),
    "public.profiles": allowedAuth("id"),
    "public.tour_translations": ids("tour_id", "tourIds"),
    "public.tour_version_stops": ids("tour_version_id", "versionIds"),
    "public.tour_version_translations": ids("tour_version_id", "versionIds"),
    "public.tour_versions": ids("id", "versionIds"),
    "public.tours": ids("id", "tourIds"),
    "public.travel_edges": ids("id", "edgeIds"),
    "public.travel_snapshot_edges": `${allowedTravel()} AND ${ids("source_edge_id", "edgeIds")}`,
    "public.travel_snapshots": allowedTravel("id"),
  };
  return predicates[relation] ?? "FALSE";
}

function baselinePredicate(relation) {
  if (relation !== "private.stripe_test_settings") return "FALSE";
  return "candidate.id = true AND candidate.stripe_test_account_id = 'acct_localens_test' AND candidate.stripe_test_endpoint_id = 'we_localens_test' AND candidate.livemode = false AND candidate.mode = 'payment'";
}

function inventoryConfig(dataset, projectRef) {
  const bookingIds = [
    dataset.fixtures.pendingPaymentBooking.id,
    dataset.fixtures.assignedGuideBooking.id,
    ...dataset.qa.slots.map(({ bookingId }) => bookingId),
  ];
  const stableIds = [
    dataset.area.id,
    ...dataset.places.flatMap(({ id, openingId }) => [id, openingId]),
    ...dataset.travelEdges.map(({ id }) => id),
    ...dataset.tours.flatMap((tour) => [
      tour.id,
      tour.versionId,
      ...tour.departures.map(({ id }) => id),
    ]),
    ...bookingIds,
    dataset.fixtures.guideAssignment.id,
    ...dataset.qa.slots.flatMap(({ runId, paymentId, cancelId }) => [runId, paymentId, cancelId]),
  ];
  return {
    projectRef,
    datasetVersion: dataset.datasetVersion,
    accountEmails: dataset.accounts.map(({ email }) => email),
    areaIds: [dataset.area.id],
    placeIds: dataset.places.map(({ id }) => id),
    openingIds: dataset.places.map(({ openingId }) => openingId),
    edgeIds: dataset.travelEdges.map(({ id }) => id),
    tourIds: dataset.tours.map(({ id }) => id),
    versionIds: dataset.tours.map(({ versionId }) => versionId),
    departureIds: dataset.tours.flatMap(({ departures }) => departures.map(({ id }) => id)),
    qaDepartureIds: dataset.qaDepartureIds,
    bookingIds,
    paymentIds: dataset.qa.slots.map(({ paymentId }) => paymentId),
    runIds: dataset.qa.slots.map(({ runId }) => runId),
    stableIds,
  };
}

export async function readThesisDemoInventory({
  query,
  dataset,
  projectRef,
  inspectDatasetGraph = inspectThesisDemoDatasetGraph,
}) {
  const discoveredRelations = listExpectedThesisDemoRelations();
  if (JSON.stringify(discoveredRelations) !== JSON.stringify(THESIS_DEMO_RELATIONS)) {
    throw cliError("THESIS_DEMO_RELATION_DRIFT", "migration relation inventory changed");
  }
  const unexpected = await query(
    `SELECT table_schema || '.' || table_name AS relation
     FROM information_schema.tables
     WHERE table_schema IN ('public', 'private')
       AND table_type = 'BASE TABLE'
       AND NOT (table_schema || '.' || table_name = ANY($1::text[]))
     ORDER BY relation`,
    [THESIS_DEMO_RELATIONS],
  );
  const arms = THESIS_DEMO_RELATIONS.map((relation) =>
    `SELECT '${relation}' AS relation,
       pg_catalog.count(*)::integer AS total_rows,
       pg_catalog.count(*) FILTER (WHERE ${demoPredicate(relation)})::integer AS demo_rows,
       pg_catalog.count(*) FILTER (WHERE ${baselinePredicate(relation)})::integer AS baseline_rows
     FROM ${relation} AS candidate CROSS JOIN config`);
  const counts = await query(
    `WITH config AS (SELECT $1::jsonb AS data),
     allowed_auth AS (
       SELECT id FROM auth.users
       WHERE email IN ${valuesFromConfig("accountEmails")}
     ), allowed_catalog AS (
       SELECT DISTINCT catalog_snapshot_id AS id FROM public.tour_versions
       WHERE id::text IN ${valuesFromConfig("versionIds")}
     ), allowed_travel AS (
       SELECT DISTINCT travel_snapshot_id AS id FROM public.bookings
       WHERE id::text IN ${valuesFromConfig("bookingIds")} AND travel_snapshot_id IS NOT NULL
     )
     ${arms.join("\nUNION ALL\n")}
     ORDER BY relation`,
    [JSON.stringify(inventoryConfig(dataset, projectRef))],
  );
  const relations = (counts?.rows ?? []).map((row) => {
    const totalRows = Number(row.total_rows);
    const demoRows = Number(row.demo_rows);
    const baselineRows = Number(row.baseline_rows);
    return {
      relation: row.relation,
      totalRows,
      demoRows,
      baselineRows,
      unclassifiedRows: totalRows - demoRows - baselineRows,
    };
  });
  const graph = await inspectDatasetGraph({ query, dataset, projectRef });
  return {
    relations,
    graphState: graph?.state,
    graphConflicts: Array.isArray(graph?.conflicts) ? graph.conflicts : ["dataset:unclassified"],
    unexpectedObjects: (unexpected?.rows ?? []).map(({ relation }) => relation),
  };
}

async function readMarker(query) {
  const result = await query(
    `SELECT project_ref, environment, dataset_version
     FROM private.thesis_demo_manifest
     WHERE environment = 'thesis-demo'`,
  );
  if ((result?.rows?.length ?? 0) === 0) return null;
  if (result.rows.length !== 1) throw cliError("THESIS_DEMO_MARKER_INVALID", "singleton marker required");
  return {
    projectRef: result.rows[0].project_ref,
    environment: result.rows[0].environment,
    datasetVersion: result.rows[0].dataset_version,
  };
}

function createDefaultRuntime({ databaseUrl, serviceRoleKey, selectedProject, dashboardConnection, dataset }) {
  let databaseClient;
  let databaseConnected = false;
  let authAdmin;

  async function ensureDatabase() {
    if (!databaseClient) {
      databaseClient = new Client({
        connectionString: databaseUrl,
        application_name: "localens-thesis-demo-seed",
        ssl: { rejectUnauthorized: true },
      });
    }
    if (!databaseConnected) {
      await databaseClient.connect();
      databaseConnected = true;
    }
    return databaseClient;
  }

  async function query(sql, values = []) {
    const client = await ensureDatabase();
    return client.query(sql, values);
  }

  function ensureAuthAdmin() {
    if (!authAdmin) {
      authAdmin = createClient(`https://${selectedProject.id}.supabase.co`, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      }).auth.admin;
    }
    return authAdmin;
  }

  const dependencies = {
    readSelectedProject: async () => selectedProject,
    readDashboardConnection: async () => dashboardConnection,
    readDatabaseConnection: async () => {
      const client = await ensureDatabase();
      const parameters = client.connectionParameters ?? {};
      const stream = client.connection?.stream;
      return {
        hostname: parameters.host,
        username: parameters.user,
        database: parameters.database,
        port: Number(parameters.port),
        tlsVerified: stream?.encrypted === true && stream?.authorized === true,
      };
    },
    readInventory: async () => readThesisDemoInventory({
      query,
      dataset,
      projectRef: selectedProject.id,
    }),
    readMarker: async () => readMarker(query),
    runDryRunTransaction: async (input) => runThesisDemoDryRunTransaction({ ...input, query }),
    listAuthUsers: async () => {
      const admin = ensureAuthAdmin();
      const users = [];
      let page = 1;
      const perPage = 1000;
      while (true) {
        const result = await admin.listUsers({ page, perPage });
        if (result?.error) throw cliError("THESIS_DEMO_AUTH_FAILED", "Auth identity inventory failed");
        const current = Array.isArray(result?.data?.users) ? result.data.users : [];
        users.push(...current.map(({ id, email }) => ({ id, email })));
        if (!result?.data?.nextPage || current.length < perPage) break;
        page = result.data.nextPage;
      }
      return users;
    },
    createAuthUser: async ({ email, password, emailConfirm }) => {
      const result = await ensureAuthAdmin().createUser({ email, password, email_confirm: emailConfirm });
      if (result?.error || !result?.data?.user?.id) {
        throw cliError("THESIS_DEMO_AUTH_FAILED", "Auth identity creation failed");
      }
      return { id: result.data.user.id, email: result.data.user.email };
    },
    runApplyTransaction: async (input) => runThesisDemoApplyTransaction({
      ...input,
      query,
      inspectDatasetGraph: inspectThesisDemoDatasetGraph,
    }),
  };

  return {
    dependencies,
    close: async () => {
      if (databaseClient) await databaseClient.end();
      databaseConnected = false;
    },
  };
}

export async function runThesisDemoCloudCli({
  env = process.env,
  logger = console.log,
  readJsonFile = defaultReadJsonFile,
  createRuntime = createDefaultRuntime,
} = {}) {
  requireCliEnv(env);
  const dataset = defaultReadJsonFile(DATASET_PATH);
  const metadata = loadControllerMetadata({
    selectedProjectPath: env.LOCALLENS_THESIS_DEMO_SELECTED_PROJECT_FILE,
    dashboardConnectionPath: env.LOCALLENS_THESIS_DEMO_DASHBOARD_CONNECTION_FILE,
    readJsonFile,
  });
  const runtime = createRuntime({
    databaseUrl: env.LOCALLENS_THESIS_DEMO_DB_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    dataset,
    ...metadata,
  });
  let primaryError;
  try {
    return await runThesisDemoSeed({
      mode: env.LOCALLENS_THESIS_DEMO_SEED_DRY_RUN === "1" ? "dry-run" : "apply",
      confirmation: env.LOCALLENS_THESIS_DEMO_SEED_CONFIRM,
      expectedProjectRef: env.LOCALLENS_THESIS_DEMO_EXPECTED_PROJECT_REF,
      expectedOrganizationId: env.LOCALLENS_THESIS_DEMO_EXPECTED_ORGANIZATION_ID,
      runtimeUrl: env.NEXT_PUBLIC_SUPABASE_URL,
      databaseUrl: env.LOCALLENS_THESIS_DEMO_DB_URL,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
      passwords: {
        customer: env.LOCALLENS_DEMO_CUSTOMER_PASSWORD,
        guide: env.LOCALLENS_DEMO_GUIDE_PASSWORD,
        admin: env.LOCALLENS_DEMO_ADMIN_PASSWORD,
        qaCustomer: env.LOCALLENS_DEMO_QA_CUSTOMER_PASSWORD,
      },
      dataset,
      logger,
    }, runtime.dependencies);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      await runtime.close();
    } catch {
      if (!primaryError) throw cliError("THESIS_DEMO_TEARDOWN_FAILED", "database teardown failed");
    }
  }
}

export async function runThesisDemoCloudMain({
  run = runThesisDemoCloudCli,
  errorLogger = console.error,
} = {}) {
  try {
    await run();
    return 0;
  } catch {
    errorLogger("THESIS_DEMO_SEED_FAILED: thesis-demo seed did not complete");
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await runThesisDemoCloudMain();
}
