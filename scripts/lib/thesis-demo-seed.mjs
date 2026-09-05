import { createHash } from "node:crypto";

const SUPABASE_RUNTIME_HOST_SUFFIX = ".supabase.co";
export const THESIS_DEMO_DATASET_VERSION = "thesis-demo.v2";
export const THESIS_DEMO_UPGRADE_FROM_VERSION = "thesis-demo.v1";
export const THESIS_DEMO_RELATIONS = Object.freeze([
  "auth.users",
  "private.audit_events",
  "private.booking_cancellations",
  "private.capacity_holds",
  "private.checkout_attempts",
  "private.checkout_idempotency",
  "private.content_release_copies",
  "private.content_source_domains",
  "private.custom_request_events",
  "private.fixed_tour_cancellation_requests",
  "private.guest_bindings",
  "private.guest_capabilities",
  "private.guide_assignment_idempotency",
  "private.quota_buckets",
  "private.quota_global_buckets",
  "private.quota_reservations",
  "private.recommendation_runs",
  "private.runtime_planner_operations",
  "private.seo_build_capabilities",
  "private.seo_live_pointer",
  "private.simulated_payment_receipts",
  "private.stripe_test_settings",
  "private.thesis_demo_manifest",
  "private.thesis_demo_qa_slots",
  "private.user_roles",
  "private.webhook_events",
  "public.area_translations",
  "public.areas",
  "public.bookings",
  "public.catalog_snapshot_area_translations",
  "public.catalog_snapshot_areas",
  "public.catalog_snapshot_food_item_supports",
  "public.catalog_snapshot_food_item_translations",
  "public.catalog_snapshot_food_items",
  "public.catalog_snapshot_food_vendor_opening_exception_windows",
  "public.catalog_snapshot_food_vendor_opening_exceptions",
  "public.catalog_snapshot_food_vendor_opening_hours",
  "public.catalog_snapshot_food_vendor_supports",
  "public.catalog_snapshot_food_vendor_translations",
  "public.catalog_snapshot_food_vendors",
  "public.catalog_snapshot_place_experience_types",
  "public.catalog_snapshot_place_guide_languages",
  "public.catalog_snapshot_place_opening_exception_windows",
  "public.catalog_snapshot_place_opening_exceptions",
  "public.catalog_snapshot_place_opening_hours",
  "public.catalog_snapshot_place_supports",
  "public.catalog_snapshot_place_translations",
  "public.catalog_snapshot_places",
  "public.catalog_snapshots",
  "public.content_drafts",
  "public.custom_quotes",
  "public.custom_requests",
  "public.departures",
  "public.food_item_supports",
  "public.food_item_translations",
  "public.food_items",
  "public.food_vendor_opening_exception_windows",
  "public.food_vendor_opening_exceptions",
  "public.food_vendor_opening_hours",
  "public.food_vendor_supports",
  "public.food_vendor_translations",
  "public.food_vendors",
  "public.fx_snapshots",
  "public.guide_assignments",
  "public.guide_profiles",
  "public.payments",
  "public.place_experience_types",
  "public.place_guide_languages",
  "public.place_opening_exception_windows",
  "public.place_opening_exceptions",
  "public.place_opening_hours",
  "public.place_supports",
  "public.place_translations",
  "public.places",
  "public.profiles",
  "public.seo_releases",
  "public.tour_translations",
  "public.tour_version_stops",
  "public.tour_version_translations",
  "public.tour_versions",
  "public.tours",
  "public.travel_edges",
  "public.travel_snapshot_edges",
  "public.travel_snapshots",
  "public.trip_plan_items",
  "public.trip_plan_revisions",
  "public.trip_plans",
]);
const THESIS_DEMO_QA_REGISTRY_RELATION = "private.thesis_demo_qa_slots";
const THESIS_DEMO_INVENTORY_WRITE_LOCK_RELATIONS = Object.freeze(
  THESIS_DEMO_RELATIONS
    .filter((relation) => relation !== THESIS_DEMO_QA_REGISTRY_RELATION)
    .sort(),
);
const THESIS_DEMO_INVENTORY_LOCK_OWNERS = Object.freeze({
  "private.runtime_planner_operations": "localens_plan_rpc_owner",
});
const THESIS_DEMO_CLASSIFICATION = "synthetic_demo";
const THESIS_DEMO_TIMEZONE = "Asia/Ho_Chi_Minh";
const THESIS_DEMO_ACCOUNT_ALLOWLIST = Object.freeze([
  Object.freeze({ key: "customer-demo", email: "customer.demo@localens.invalid", role: "customer", audience: "teacher" }),
  Object.freeze({ key: "guide-demo", email: "guide.demo@localens.invalid", role: "guide", audience: "teacher" }),
  Object.freeze({ key: "admin-demo", email: "admin.demo@localens.invalid", role: "admin", audience: "operator" }),
  Object.freeze({ key: "customer-qa", email: "customer.qa@localens.invalid", role: "customer", audience: "qa" }),
]);
const THESIS_DEMO_ACCOUNT_EMAILS = Object.freeze(
  THESIS_DEMO_ACCOUNT_ALLOWLIST.map(({ email }) => email),
);
const THESIS_DEMO_V1_DEMO_ROWS = Object.freeze({
  "auth.users": 4,
  "private.capacity_holds": 2,
  "private.checkout_attempts": 1,
  "private.checkout_idempotency": 1,
  "private.thesis_demo_manifest": 1,
  "private.user_roles": 4,
  "public.area_translations": 2,
  "public.areas": 1,
  "public.bookings": 2,
  "public.catalog_snapshot_area_translations": 2,
  "public.catalog_snapshot_areas": 1,
  "public.catalog_snapshot_place_experience_types": 13,
  "public.catalog_snapshot_place_guide_languages": 24,
  "public.catalog_snapshot_place_opening_hours": 12,
  "public.catalog_snapshot_place_supports": 12,
  "public.catalog_snapshot_place_translations": 24,
  "public.catalog_snapshot_places": 12,
  "public.catalog_snapshots": 1,
  "public.departures": 5,
  "public.guide_assignments": 1,
  "public.guide_profiles": 1,
  "public.place_experience_types": 13,
  "public.place_guide_languages": 24,
  "public.place_opening_hours": 12,
  "public.place_supports": 12,
  "public.place_translations": 24,
  "public.places": 12,
  "public.profiles": 4,
  "public.tour_translations": 6,
  "public.tour_version_stops": 9,
  "public.tour_version_translations": 6,
  "public.tour_versions": 3,
  "public.tours": 3,
  "public.travel_edges": 12,
  "public.travel_snapshot_edges": 12,
  "public.travel_snapshots": 1,
});
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEED_CONFIRMATION = "localens-thesis-demo";
const SEED_ERROR = Symbol("THESIS_DEMO_SEED_ERROR");

function hasExactText(value) {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isCompleteConnection(value) {
  return value !== null
    && typeof value === "object"
    && hasExactText(value.hostname)
    && hasExactText(value.username)
    && hasExactText(value.database)
    && Number.isInteger(value.port)
    && value.port > 0
    && value.port <= 65535;
}

function validRuntimeUrl(value, projectRef) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.username === ""
      && url.password === ""
      && url.port === ""
      && url.pathname === "/"
      && url.search === ""
      && url.hash === ""
      && url.hostname === `${projectRef}${SUPABASE_RUNTIME_HOST_SUFFIX}`;
  } catch {
    return false;
  }
}

function auditInventory(inventory) {
  if (
    inventory === null
    || typeof inventory !== "object"
    || !Array.isArray(inventory.relations)
    || !Array.isArray(inventory.unexpectedObjects)
    || !inventory.unexpectedObjects.every(hasExactText)
    || !["empty", "auth-recovery", "upgrade-v1", "exact", "conflict"].includes(inventory.graphState)
    || !Array.isArray(inventory.graphConflicts)
    || !inventory.graphConflicts.every(hasExactText)
  ) return null;

  const relationNames = inventory.relations.map(({ relation }) => relation);
  if (
    relationNames.length !== THESIS_DEMO_RELATIONS.length
    || relationNames.some((relation, index) => relation !== THESIS_DEMO_RELATIONS[index])
  ) return null;

  let applicationRows = 0;
  let unclassifiedApplicationRows = 0;
  const demoRowsByRelation = {};
  for (const row of inventory.relations) {
    if (
      !hasExactText(row?.relation)
      || !isNonNegativeInteger(row.totalRows)
      || !isNonNegativeInteger(row.demoRows)
      || !isNonNegativeInteger(row.baselineRows)
      || !isNonNegativeInteger(row.unclassifiedRows)
      || row.totalRows !== row.demoRows + row.baselineRows + row.unclassifiedRows
      || (row.relation === "private.stripe_test_settings"
        ? row.baselineRows !== 1
        : row.baselineRows !== 0)
    ) return null;
    if (row.relation !== "auth.users") {
      applicationRows += row.demoRows;
      unclassifiedApplicationRows += row.unclassifiedRows;
    }
    demoRowsByRelation[row.relation] = row.demoRows;
  }

  const auth = inventory.relations[0];
  return {
    applicationRows,
    unclassifiedApplicationRows,
    demoAuthUsers: auth.demoRows,
    unclassifiedAuthUsers: auth.unclassifiedRows,
    demoRowsByRelation,
  };
}

function requireDataset(condition, message) {
  if (!condition) {
    const error = new Error(`THESIS_DEMO_DATASET_INVALID: ${message}`);
    error.code = "THESIS_DEMO_DATASET_INVALID";
    throw error;
  }
}

function seedError(code, message, { recoverable = false } = {}) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.recoverable = recoverable;
  error[SEED_ERROR] = true;
  return error;
}

function requireSeed(condition, code, message) {
  if (!condition) throw seedError(code, message);
}

function requireSeedConfiguration(options, dependencies) {
  requireSeed(options?.mode === "dry-run" || options?.mode === "apply", "THESIS_DEMO_MODE_REQUIRED", "mode must be dry-run or apply");
  requireSeed(options?.confirmation === SEED_CONFIRMATION, "THESIS_DEMO_CONFIRM_REQUIRED", "explicit thesis-demo confirmation is required");
  requireSeed(hasExactText(options?.databaseUrl), "THESIS_DEMO_DATABASE_URL_REQUIRED", "database URL is required");
  requireSeed(hasExactText(options?.serviceRoleKey), "THESIS_DEMO_SERVICE_KEY_REQUIRED", "service-role key is required");
  requireSeed(hasExactText(options?.expectedProjectRef), "THESIS_DEMO_PROJECT_REQUIRED", "expected project ref is required");
  requireSeed(hasExactText(options?.expectedOrganizationId), "THESIS_DEMO_ORGANIZATION_REQUIRED", "expected organization is required");
  requireSeed(hasExactText(options?.runtimeUrl), "THESIS_DEMO_RUNTIME_URL_REQUIRED", "runtime URL is required");
  requireSeed(
    ["customer", "guide", "admin", "qaCustomer"].every((key) => hasExactText(options?.passwords?.[key])),
    "THESIS_DEMO_PASSWORDS_REQUIRED",
    "all four demo account passwords are required",
  );
  for (const name of [
    "readSelectedProject",
    "readDashboardConnection",
    "readDatabaseConnection",
    "readInventory",
    "readMarker",
    "runDryRunTransaction",
    "listAuthUsers",
    "createAuthUser",
    "runApplyTransaction",
  ]) {
    requireSeed(
      typeof dependencies?.[name] === "function",
      "THESIS_DEMO_DEPENDENCY_REQUIRED",
      "complete injected seed dependencies are required",
    );
  }
}

function passwordForAccount(account, passwords) {
  if (account.key === "customer-demo") return passwords.customer;
  if (account.key === "guide-demo") return passwords.guide;
  if (account.key === "admin-demo") return passwords.admin;
  if (account.key === "customer-qa") return passwords.qaCustomer;
  throw seedError("THESIS_DEMO_DATASET_INVALID", "unknown demo account identity");
}

function safeProjectHost(projectRef) {
  return `...${projectRef.slice(-6)}${SUPABASE_RUNTIME_HOST_SUFFIX}`;
}

function writeSafeSummary(logger, { mode, projectRef, summary, authStatus }) {
  logger(
    `[db:seed:thesis-demo-cloud] mode=${mode} project=${safeProjectHost(projectRef)} `
      + `dataset=${summary.datasetVersion} accounts=${summary.accountCount} `
      + `places=${summary.placeCount} tours=${summary.tourCount} auth=${authStatus}`,
  );
}

async function readVerifiedTarget(options, dependencies) {
  let evidence;
  try {
    const selectedProject = await dependencies.readSelectedProject();
    const dashboardConnection = await dependencies.readDashboardConnection(selectedProject);
    const databaseConnection = await dependencies.readDatabaseConnection();
    const inventory = await dependencies.readInventory({ dataset: options.dataset });
    const marker = await dependencies.readMarker();
    evidence = {
      expectedProjectRef: options.expectedProjectRef,
      expectedOrganizationId: options.expectedOrganizationId,
      selectedProject,
      dashboardConnection,
      runtimeUrl: options.runtimeUrl,
      databaseConnection,
      inventory,
      marker,
    };
  } catch {
    throw seedError("THESIS_DEMO_PREFLIGHT_FAILED", "verified target preflight failed");
  }

  const result = verifyDemoTarget(evidence);
  if (!result.ok) throw seedError(result.code, "verified demo target refused");
  return result;
}

async function ensureAuthIdentities(dataset, passwords, dependencies) {
  let existing;
  try {
    existing = await dependencies.listAuthUsers();
  } catch {
    throw seedError("THESIS_DEMO_AUTH_FAILED", "Auth identity inventory failed", { recoverable: true });
  }
  if (!Array.isArray(existing)) {
    throw seedError("THESIS_DEMO_AUTH_FAILED", "Auth identity inventory failed", { recoverable: true });
  }

  const usersByEmail = new Map();
  for (const user of existing) {
    if (!hasExactText(user?.id) || !hasExactText(user?.email) || usersByEmail.has(user.email)) {
      throw seedError("THESIS_DEMO_AUTH_FAILED", "Auth identity inventory is ambiguous", { recoverable: true });
    }
    usersByEmail.set(user.email, user);
  }

  const identities = [];
  let createdAuthCount = 0;
  for (const account of dataset.accounts) {
    const reused = usersByEmail.get(account.email);
    if (reused) {
      identities.push({ ...account, userId: reused.id, seedStatus: "reused" });
      continue;
    }
    try {
      const created = await dependencies.createAuthUser({
        email: account.email,
        password: passwordForAccount(account, passwords),
        emailConfirm: true,
      });
      if (!hasExactText(created?.id) || created?.email !== account.email) {
        throw new Error("invalid Auth create result");
      }
      identities.push({ ...account, userId: created.id, seedStatus: "created" });
      usersByEmail.set(account.email, created);
      createdAuthCount += 1;
    } catch {
      throw seedError("THESIS_DEMO_AUTH_FAILED", "Auth identity creation failed; rerun is safe", { recoverable: true });
    }
  }
  return { identities, createdAuthCount };
}

/**
 * Orchestrates a guarded dry-run or apply using injected metadata, Auth, and
 * database boundaries. It never derives project identity from a connection
 * string and never updates credentials for an existing Auth identity.
 */
export async function runThesisDemoSeed(options, dependencies) {
  requireSeedConfiguration(options, dependencies);
  const summary = validateThesisDemoDataset(options.dataset);
  const target = await readVerifiedTarget(options, dependencies);
  const logger = typeof options.logger === "function" ? options.logger : () => {};

  if (options.mode === "dry-run") {
    let dryRun;
    try {
      dryRun = await dependencies.runDryRunTransaction({
        dataset: options.dataset,
        projectRef: target.projectRef,
      });
    } catch {
      throw seedError("THESIS_DEMO_DRY_RUN_FAILED", "read-only database verification failed");
    }
    writeSafeSummary(logger, {
      mode: "dry-run",
      projectRef: target.projectRef,
      summary,
      authStatus: "deferred",
    });
    return {
      mode: "dry-run",
      targetMode: target.mode,
      ...summary,
      schemaVerified: dryRun?.schemaVerified === true,
      authPostcondition: "DEFERRED_UNTIL_APPLY",
    };
  }

  const { identities, createdAuthCount } = await ensureAuthIdentities(
    options.dataset,
    options.passwords,
    dependencies,
  );
  let databaseResult;
  try {
    databaseResult = await dependencies.runApplyTransaction({
      dataset: options.dataset,
      projectRef: target.projectRef,
      identities,
    });
  } catch {
    throw seedError(
      "THESIS_DEMO_DATABASE_FAILED",
      "database transaction failed; Auth identities were retained for a safe rerun",
      { recoverable: true },
    );
  }
  writeSafeSummary(logger, {
    mode: "apply",
    projectRef: target.projectRef,
    summary,
    authStatus: createdAuthCount === 0 ? "reused" : `created-${createdAuthCount}`,
  });
  return {
    mode: "apply",
    targetMode: target.mode,
    ...summary,
    createdAuthCount,
    database: databaseResult,
  };
}

function requireBilingualRecord(record) {
  requireDataset(record?.classification === THESIS_DEMO_CLASSIFICATION, "records must be synthetic_demo");
  requireDataset(UUID_PATTERN.test(record?.id ?? ""), "records must use stable UUIDs");
  requireDataset(hasExactText(record?.translations?.en?.title), "English title is required");
  requireDataset(hasExactText(record?.translations?.vi?.title), "Vietnamese title is required");
  requireDataset(record?.source?.kind === THESIS_DEMO_CLASSIFICATION, "source kind must be synthetic_demo");
  requireDataset(
    record?.source?.attribution === "LocalLens synthetic thesis-demo fixture",
    "synthetic attribution label is required",
  );
  requireDataset(
    record?.source?.license === "Synthetic demo data; no external venue or vendor claim",
    "synthetic license label is required",
  );
}

export function validateThesisDemoDataset(dataset) {
  requireDataset(dataset !== null && typeof dataset === "object", "dataset object is required");
  requireDataset(dataset.datasetVersion === THESIS_DEMO_DATASET_VERSION, "dataset version must be thesis-demo.v2");
  requireDataset(
    dataset.upgradeFromVersion === THESIS_DEMO_UPGRADE_FROM_VERSION,
    "dataset upgrade source must be thesis-demo.v1",
  );
  requireDataset(dataset.classification === THESIS_DEMO_CLASSIFICATION, "dataset must be synthetic_demo");
  requireDataset(dataset.timezone === THESIS_DEMO_TIMEZONE, "timezone must be Asia/Ho_Chi_Minh");
  requireDataset(dataset.seedBaseDate === "2026-09-05", "seed base date must remain fixed for v2");
  requireDataset(Array.isArray(dataset.accounts) && dataset.accounts.length === 4, "four demo accounts are required");
  requireDataset(
    dataset.accounts.every((account, index) => {
      const approved = THESIS_DEMO_ACCOUNT_ALLOWLIST[index];
      return approved !== undefined
        && ["key", "email", "role", "audience"].every((field) => account?.[field] === approved[field]);
    }),
    "demo account key, email, role, and audience tuples must remain stable",
  );
  requireDataset(
    new Set(dataset.accounts.map(({ role }) => role)).size === 3
      && dataset.accounts.every(({ role }) => ["customer", "guide", "admin"].includes(role)),
    "the four accounts must cover exactly three roles",
  );
  requireDataset(Array.isArray(dataset.places) && dataset.places.length === 12, "twelve places are required");
  requireDataset(Array.isArray(dataset.tours) && dataset.tours.length === 3, "three tours are required");
  dataset.places.forEach(requireBilingualRecord);
  dataset.tours.forEach(requireBilingualRecord);

  const stableIds = [
    dataset.area?.id,
    ...dataset.places.flatMap((place) => [place.id, place.openingId]),
    ...(dataset.travelEdges ?? []).map(({ id }) => id),
    ...dataset.tours.flatMap((tour) => [
      tour.id,
      tour.versionId,
      ...tour.departures.map(({ id }) => id),
    ]),
    dataset.fixtures?.pendingPaymentBooking?.id,
    dataset.fixtures?.pendingPaymentBooking?.holdId,
    dataset.fixtures?.pendingPaymentBooking?.checkoutAttemptId,
    dataset.fixtures?.pendingPaymentBooking?.checkoutIdempotencyId,
    dataset.fixtures?.assignedGuideBooking?.id,
    dataset.fixtures?.assignedGuideBooking?.holdId,
    dataset.fixtures?.guideAssignment?.id,
    ...dataset.qa.slots.flatMap((slot) => [
      slot.recommendOperationId,
      slot.refineOperationId,
      slot.bookingId,
      slot.checkoutAttemptId,
      slot.checkoutIdempotencyId,
      slot.holdId,
      slot.paymentId,
      slot.cancelId,
    ]),
  ];
  requireDataset(stableIds.every((id) => UUID_PATTERN.test(id ?? "")), "all database identities must be UUIDs");
  requireDataset(new Set(stableIds).size === stableIds.length, "database identities must be unique");

  const departures = dataset.tours.flatMap(({ departures }) => departures);
  const departureById = new Map(departures.map((departure) => [departure.id, departure]));
  requireDataset(
    departures.every(({ dayOffset }) => [7, 14, 21].includes(dayOffset)),
    "departure offsets must be +7, +14, or +21 days",
  );
  requireDataset(
    Array.isArray(dataset.teacherDepartureIds) && dataset.teacherDepartureIds.length === 3,
    "three teacher departures are required",
  );
  requireDataset(
    Array.isArray(dataset.qaDepartureIds) && dataset.qaDepartureIds.length === 2,
    "two QA departures are required",
  );
  const teacherIds = new Set(dataset.teacherDepartureIds);
  const qaIds = new Set(dataset.qaDepartureIds);
  requireDataset([...teacherIds].every((id) => !qaIds.has(id)), "teacher and QA departures must be disjoint");
  requireDataset(
    [...teacherIds].every((id) => departureById.get(id)?.audience === "teacher" && departureById.get(id)?.status === "scheduled"),
    "teacher departures must remain scheduled",
  );
  requireDataset(
    [...qaIds].every((id) => departureById.get(id)?.audience === "qa"),
    "QA departure IDs must point only to QA departures",
  );
  const soldOut = departures.filter(({ status }) => status === "sold_out");
  requireDataset(
    soldOut.length === 1 && soldOut[0].id === dataset.qa?.soldOutDepartureId && soldOut[0].audience === "qa",
    "sold-out coverage must use only the dedicated QA departure",
  );
  requireDataset(
    departureById.get(dataset.qa?.slotDepartureId)?.capacity === 20
      && departureById.get(dataset.qa?.slotDepartureId)?.status === "scheduled",
    "the bounded QA slot departure must remain scheduled with capacity 20",
  );
  requireDataset(Array.isArray(dataset.qa?.slots) && dataset.qa.slots.length === 4, "four QA slots are required");
  requireDataset(
    dataset.qa.slots.every((slot, index) =>
      slot.id === `qa-0${index + 1}`
      && slot.maxSeats === 2
      && slot.runId === undefined
      && slot.terminalFlow === ["payment", "cancellation", "spare", "spare"][index]
      && [slot.bookingIdempotencyKey, slot.paymentIdempotencyKey, slot.cancelIdempotencyKey]
        .every((key) => hasExactText(key) && key.startsWith(`thesis-demo:v2:${slot.id}:`))),
    "QA slots must expose exact v2 identities, keys, and terminal assignments",
  );
  const qaSlotKeys = dataset.qa.slots.flatMap((slot) => [
    slot.bookingIdempotencyKey,
    slot.paymentIdempotencyKey,
    slot.cancelIdempotencyKey,
  ]);
  requireDataset(new Set(qaSlotKeys).size === qaSlotKeys.length, "QA slot keys must be unique");
  requireDataset(
    dataset.fixtures?.customerWithoutBookingAccountKey === "customer-demo"
      && dataset.fixtures?.pendingPaymentBooking?.ownerAccountKey === "customer-qa"
      && dataset.fixtures?.pendingPaymentBooking?.status === "pending_payment"
      && dataset.fixtures?.assignedGuideBooking?.ownerAccountKey === "customer-qa"
      && dataset.fixtures?.assignedGuideBooking?.status === "confirmed"
      && dataset.fixtures?.guideAssignment?.bookingId === dataset.fixtures?.assignedGuideBooking?.id
      && dataset.fixtures?.guideAssignment?.guideAccountKey === "guide-demo"
      && dataset.fixtures?.guideAssignment?.status === "assigned",
    "QA-owned cancellation and guide-assignment fixtures are required",
  );
  const cancellationFixture = dataset.fixtures.pendingPaymentBooking;
  const cancellationDeparture = departureById.get(cancellationFixture.departureId);
  requireDataset(
    hasExactText(cancellationFixture.checkoutIdempotencyKey)
      && cancellationFixture.checkoutIdempotencyKey !== cancellationFixture.idempotencyKey,
    "pending-payment checkout and cancellation idempotency keys must be distinct",
  );
  requireDataset(
    Number.isFinite(Date.parse(cancellationFixture.createdAt))
      && Date.parse(cancellationDeparture?.startAt ?? "") - Date.parse(cancellationFixture.createdAt) === 35 * 60 * 1000,
    "pending-payment fixture must retain a deterministic active hold until its departure",
  );

  return {
    datasetVersion: dataset.datasetVersion,
    classification: dataset.classification,
    accountCount: dataset.accounts.length,
    roleCount: new Set(dataset.accounts.map(({ role }) => role)).size,
    placeCount: dataset.places.length,
    tourCount: dataset.tours.length,
    teacherDepartureCount: dataset.teacherDepartureIds.length,
    qaDepartureCount: dataset.qaDepartureIds.length,
    qaSlotCount: dataset.qa.slots.length,
  };
}

function requireQuery(query) {
  requireSeed(typeof query === "function", "THESIS_DEMO_DATABASE_REQUIRED", "database query function is required");
}

async function rollbackQuietly(query) {
  try {
    await query("ROLLBACK");
  } catch {
    // Preserve the stable redacted primary error.
  }
}

export async function runThesisDemoDryRunTransaction({ query, dataset }) {
  requireQuery(query);
  validateThesisDemoDataset(dataset);
  let started = false;
  try {
    await query("BEGIN READ ONLY");
    started = true;
    await query("SET LOCAL statement_timeout = '15s'");
    const schema = await query(
      `SELECT
       pg_catalog.to_regclass('private.thesis_demo_manifest')::text AS marker_table,
       pg_catalog.to_regclass('private.thesis_demo_qa_slots')::text AS qa_slots_table`,
    );
    if (
      schema?.rows?.[0]?.marker_table !== "private.thesis_demo_manifest"
      || schema?.rows?.[0]?.qa_slots_table !== "private.thesis_demo_qa_slots"
    ) {
      throw seedError("THESIS_DEMO_SCHEMA_REQUIRED", "thesis-demo v2 schema is required");
    }
    await query("ROLLBACK");
    started = false;
    return { schemaVerified: true, authPostcondition: "DEFERRED_UNTIL_APPLY" };
  } catch {
    if (started) await rollbackQuietly(query);
    throw seedError("THESIS_DEMO_DRY_RUN_FAILED", "read-only database verification failed");
  }
}

function databaseIdentities(dataset, identities) {
  requireSeed(Array.isArray(identities) && identities.length === dataset.accounts.length,
    "THESIS_DEMO_AUTH_FAILED", "four verified Auth identities are required");
  const byEmail = new Map(identities.map((identity) => [identity.email, identity]));
  const rows = dataset.accounts.map((account) => {
    const identity = byEmail.get(account.email);
    requireSeed(hasExactText(identity?.userId), "THESIS_DEMO_AUTH_FAILED", "verified Auth user id is required");
    return {
      userId: identity.userId,
      email: account.email,
      role: account.role,
      displayName: account.displayName,
      language: account.language,
    };
  });
  requireSeed(new Set(rows.map(({ userId }) => userId)).size === rows.length,
    "THESIS_DEMO_AUTH_FAILED", "Auth identities must be unique");
  return rows;
}

async function executeParameterizedBatch(query, source, values) {
  const statements = source.trim().split(/;\s*(?=(?:WITH|INSERT|UPDATE|DELETE)\b)/i);
  for (const statementSource of statements) {
    const statement = statementSource.trim().replace(/;$/, "");
    if (statement.length === 0) continue;
    const positions = [...new Set([...statement.matchAll(/\$(\d+)/g)]
      .map((match) => Number(match[1])))]
      .sort((left, right) => left - right);
    const remapped = new Map(positions.map((position, index) => [position, index + 1]));
    const reindexedStatement = statement.replace(/\$(\d+)/g, (_match, position) =>
      `$${remapped.get(Number(position))}`);
    await query(reindexedStatement, positions.map((position) => values[position - 1]));
  }
}

const UPSERT_IDENTITIES_SQL = `
WITH identities AS (
  SELECT * FROM pg_catalog.jsonb_to_recordset($1::jsonb) AS value(
    user_id uuid, email text, role public.app_role, display_name text, language public.locale
  )
)
DELETE FROM private.user_roles AS existing
USING identities
WHERE existing.user_id = identities.user_id AND existing.role <> identities.role;

WITH identities AS (
  SELECT * FROM pg_catalog.jsonb_to_recordset($1::jsonb) AS value(
    user_id uuid, email text, role public.app_role, display_name text, language public.locale
  )
)
INSERT INTO private.user_roles (user_id, role)
SELECT user_id, role FROM identities
ON CONFLICT (user_id, role) DO NOTHING;

WITH identities AS (
  SELECT * FROM pg_catalog.jsonb_to_recordset($1::jsonb) AS value(
    user_id uuid, email text, role public.app_role, display_name text, language public.locale
  )
)
INSERT INTO public.profiles (id, display_name, language)
SELECT user_id, display_name, language FROM identities
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  language = EXCLUDED.language;

WITH identities AS (
  SELECT * FROM pg_catalog.jsonb_to_recordset($1::jsonb) AS value(
    user_id uuid, email text, role public.app_role, display_name text, language public.locale
  )
)
INSERT INTO public.guide_profiles (user_id, display_name, language)
SELECT user_id, display_name, language FROM identities WHERE role = 'guide'::public.app_role
ON CONFLICT (user_id) DO NOTHING;`;

const UPSERT_AREA_SQL = `
INSERT INTO public.areas (id, slug)
VALUES ($1::uuid, $2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.area_translations (area_id, locale, name, description) VALUES
  ($1::uuid, 'en'::public.locale, $3, $4),
  ($1::uuid, 'vi'::public.locale, $5, $6)
ON CONFLICT (area_id, locale) DO NOTHING;`;

const UPSERT_PLACES_SQL = `
WITH places AS (
  SELECT * FROM pg_catalog.jsonb_to_recordset($1::jsonb) AS value(
    id uuid, opening_id uuid, area_id uuid, slug text, price_vnd_per_person bigint,
    visit_duration_minutes smallint, source_url text, verified_at date, attribution text,
    title_en text, summary_en text, description_en text,
    title_vi text, summary_vi text, description_vi text,
    weekday smallint, opens_at time, closes_at time
  )
)
INSERT INTO public.places (
  id, area_id, slug, status, price_vnd_per_person, visit_duration_minutes,
  source_url, verified_at, attribution
)
SELECT id, area_id, slug, 'draft'::public.place_status, price_vnd_per_person,
  visit_duration_minutes, source_url, verified_at, attribution
FROM places
ON CONFLICT (id) DO NOTHING;

WITH places AS (
  SELECT * FROM pg_catalog.jsonb_to_recordset($1::jsonb) AS value(
    id uuid, title_en text, summary_en text, description_en text,
    title_vi text, summary_vi text, description_vi text
  )
), translations AS (
  SELECT id AS place_id, 'en'::public.locale AS locale, title_en AS title,
    summary_en AS summary, description_en AS description FROM places
  UNION ALL
  SELECT id, 'vi'::public.locale, title_vi, summary_vi, description_vi FROM places
)
INSERT INTO public.place_translations (place_id, locale, title, summary, description)
SELECT place_id, locale, title, summary, description FROM translations
ON CONFLICT (place_id, locale) DO NOTHING;

WITH values AS (
  SELECT * FROM pg_catalog.jsonb_to_recordset($2::jsonb) AS value(place_id uuid, experience_type text)
)
INSERT INTO public.place_experience_types (place_id, experience_type)
SELECT place_id, experience_type FROM values ON CONFLICT DO NOTHING;

WITH values AS (
  SELECT * FROM pg_catalog.jsonb_to_recordset($3::jsonb) AS value(place_id uuid, language public.locale)
)
INSERT INTO public.place_guide_languages (place_id, language)
SELECT place_id, language FROM values ON CONFLICT DO NOTHING;

WITH values AS (
  SELECT * FROM pg_catalog.jsonb_to_recordset($4::jsonb) AS value(
    place_id uuid, support_kind text, requirement text, status text
  )
)
INSERT INTO public.place_supports (place_id, support_kind, requirement, status)
SELECT place_id, support_kind, requirement, status FROM values ON CONFLICT DO NOTHING;

WITH places AS (
  SELECT * FROM pg_catalog.jsonb_to_recordset($1::jsonb) AS value(
    id uuid, opening_id uuid, weekday smallint, opens_at time, closes_at time
  )
)
INSERT INTO public.place_opening_hours (id, place_id, weekday, opens_at, closes_at)
SELECT opening_id, id, weekday, opens_at, closes_at FROM places
ON CONFLICT (id) DO NOTHING;

UPDATE public.places SET status = 'published'::public.place_status
WHERE id = ANY($5::uuid[]) AND status = 'draft'::public.place_status;`;

const UPSERT_TRAVEL_EDGES_SQL = `
WITH edges AS (
  SELECT * FROM pg_catalog.jsonb_to_recordset($1::jsonb) AS value(
    id uuid, from_place_id uuid, to_place_id uuid, mode text,
    minutes smallint, group_cost_vnd bigint, verified_at timestamptz
  )
)
INSERT INTO public.travel_edges (
  id, from_place_id, to_place_id, mode, minutes, group_cost_vnd, verified_at
)
SELECT id, from_place_id, to_place_id, mode, minutes, group_cost_vnd, verified_at FROM edges
ON CONFLICT (id) DO NOTHING;`;

const UPSERT_TOURS_SQL = `
WITH tours AS (
  SELECT * FROM pg_catalog.jsonb_to_recordset($1::jsonb) AS value(
    id uuid, version_id uuid, slug text, duration_minutes smallint,
    price_vnd_per_person bigint, inclusions text[], exclusions text[], cancellation_policy text,
    source_url text, verified_at date, attribution text, license text,
    title_en text, summary_en text, meeting_point_en text,
    title_vi text, summary_vi text, meeting_point_vi text
  )
)
INSERT INTO public.tours (id, slug, status)
SELECT id, slug, 'draft'::public.tour_status FROM tours
ON CONFLICT (id) DO NOTHING;

WITH tours AS (
  SELECT * FROM pg_catalog.jsonb_to_recordset($1::jsonb) AS value(
    id uuid, title_en text, summary_en text, meeting_point_en text,
    title_vi text, summary_vi text, meeting_point_vi text
  )
), translations AS (
  SELECT id AS tour_id, 'en'::public.locale AS locale, title_en AS title,
    summary_en AS summary, meeting_point_en AS meeting_point FROM tours
  UNION ALL
  SELECT id, 'vi'::public.locale, title_vi, summary_vi, meeting_point_vi FROM tours
)
INSERT INTO public.tour_translations (tour_id, locale, title, summary, meeting_point)
SELECT tour_id, locale, title, summary, meeting_point FROM translations
ON CONFLICT (tour_id, locale) DO NOTHING;

WITH tours AS (
  SELECT * FROM pg_catalog.jsonb_to_recordset($1::jsonb) AS value(
    id uuid, version_id uuid, duration_minutes smallint, price_vnd_per_person bigint,
    inclusions text[], exclusions text[], cancellation_policy text, source_url text,
    verified_at date, attribution text, license text
  )
)
INSERT INTO public.tour_versions (
  id, tour_id, catalog_snapshot_id, status, duration_minutes, price_vnd_per_person,
  inclusions, exclusions, cancellation_policy, source_url, verified_at, attribution, license
)
SELECT version_id, id, $2::uuid, 'draft'::public.tour_version_status, duration_minutes,
  price_vnd_per_person, inclusions, exclusions, cancellation_policy, source_url,
  verified_at, attribution, license
FROM tours ON CONFLICT (id) DO NOTHING;

WITH tours AS (
  SELECT * FROM pg_catalog.jsonb_to_recordset($1::jsonb) AS value(
    version_id uuid, title_en text, summary_en text, meeting_point_en text,
    title_vi text, summary_vi text, meeting_point_vi text
  )
), translations AS (
  SELECT version_id AS tour_version_id, 'en'::public.locale AS locale, title_en AS title,
    summary_en AS summary, meeting_point_en AS meeting_point FROM tours
  UNION ALL
  SELECT version_id, 'vi'::public.locale, title_vi, summary_vi, meeting_point_vi FROM tours
)
INSERT INTO public.tour_version_translations (tour_version_id, locale, title, summary, meeting_point)
SELECT tour_version_id, locale, title, summary, meeting_point FROM translations
ON CONFLICT (tour_version_id, locale) DO NOTHING;

WITH stops AS (
  SELECT * FROM pg_catalog.jsonb_to_recordset($3::jsonb) AS value(
    tour_version_id uuid, position smallint, place_id uuid
  )
)
INSERT INTO public.tour_version_stops (tour_version_id, catalog_snapshot_id, position, place_id)
SELECT tour_version_id, $2::uuid, position, place_id FROM stops
ON CONFLICT (tour_version_id, position) DO NOTHING;

UPDATE public.tour_versions
SET status = 'published'::public.tour_version_status, published_at = pg_catalog.clock_timestamp()
WHERE id = ANY($4::uuid[]) AND status = 'draft'::public.tour_version_status;
UPDATE public.tours SET status = 'published'::public.tour_status
WHERE id = ANY($5::uuid[]) AND status = 'draft'::public.tour_status;

WITH departures AS (
  SELECT * FROM pg_catalog.jsonb_to_recordset($6::jsonb) AS value(
    id uuid, tour_version_id uuid, start_at timestamptz, end_at timestamptz,
    status public.departure_status, capacity integer
  )
)
INSERT INTO public.departures (id, tour_version_id, start_at, end_at, status, capacity)
SELECT id, tour_version_id, start_at, end_at, 'scheduled'::public.departure_status, capacity FROM departures
ON CONFLICT (id) DO NOTHING;`;

const UPSERT_FIXTURES_SQL = `
WITH fixtures AS (
  SELECT * FROM pg_catalog.jsonb_to_recordset($1::jsonb) AS value(
    id uuid, hold_id uuid, departure_id uuid, party_size integer,
    status public.booking_status, created_at timestamptz,
    checkout_attempt_id uuid, checkout_idempotency_id uuid,
    checkout_idempotency_key text, canonical_request_hash text
  )
)
INSERT INTO public.bookings (
  id, owner_user_id, source_kind, source_id, departure_id, status,
  tour_version_id, title_en, title_vi, cancellation_policy,
  catalog_snapshot_id, travel_snapshot_id, per_person_vnd_minor,
  total_vnd_minor, checkout_currency, checkout_amount_minor,
  party_size, language, meeting_point, created_at, hold_expires_at
)
SELECT
  fixtures.id, $4::uuid, 'departure', fixtures.departure_id, fixtures.departure_id,
  fixtures.status, versions.id, title_en.title, title_vi.title,
  versions.cancellation_policy, $2::uuid, $3::uuid, versions.price_vnd_per_person,
  versions.price_vnd_per_person * fixtures.party_size, 'vnd'::public.checkout_currency,
  versions.price_vnd_per_person * fixtures.party_size, fixtures.party_size,
  'en'::public.locale, title_en.meeting_point, fixtures.created_at,
  fixtures.created_at + interval '35 minutes'
FROM fixtures
JOIN public.departures AS departures ON departures.id = fixtures.departure_id
JOIN public.tour_versions AS versions ON versions.id = departures.tour_version_id
JOIN public.tour_version_translations AS title_en
  ON title_en.tour_version_id = versions.id AND title_en.locale = 'en'::public.locale
JOIN public.tour_version_translations AS title_vi
  ON title_vi.tour_version_id = versions.id AND title_vi.locale = 'vi'::public.locale
ON CONFLICT (id) DO NOTHING;

WITH fixtures AS (
  SELECT * FROM pg_catalog.jsonb_to_recordset($1::jsonb) AS value(
    id uuid, departure_id uuid, created_at timestamptz,
    checkout_attempt_id uuid
  )
)
INSERT INTO private.checkout_attempts (
  id, booking_id, owner_user_id, source_kind, departure_id, quote_id,
  provider_idempotency_key, status, provider_session_id, provider_expires_at,
  created_at, updated_at
)
SELECT checkout_attempt_id, id, $4::uuid, 'departure', departure_id, NULL,
  'localens:stripe-checkout:v1:' || checkout_attempt_id::text,
  'created', NULL, NULL, created_at, created_at
FROM fixtures
WHERE checkout_attempt_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

WITH fixtures AS (
  SELECT * FROM pg_catalog.jsonb_to_recordset($1::jsonb) AS value(
    id uuid, created_at timestamptz, checkout_attempt_id uuid,
    checkout_idempotency_id uuid, checkout_idempotency_key text,
    canonical_request_hash text
  )
)
INSERT INTO private.checkout_idempotency (
  id, owner_user_id, idempotency_key, canonical_request_hash,
  booking_id, checkout_attempt_id, provider_idempotency_key, created_at
)
SELECT checkout_idempotency_id, $4::uuid, checkout_idempotency_key,
  canonical_request_hash, id, checkout_attempt_id,
  'localens:stripe-checkout:v1:' || checkout_attempt_id::text, created_at
FROM fixtures
WHERE checkout_idempotency_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

WITH fixtures AS (
  SELECT * FROM pg_catalog.jsonb_to_recordset($1::jsonb) AS value(
    id uuid, hold_id uuid, departure_id uuid, party_size integer,
    status public.booking_status, created_at timestamptz
  )
)
INSERT INTO private.capacity_holds (
  id, booking_id, departure_id, party_size, status, expires_at,
  created_at, consumed_at, released_at
)
SELECT hold_id, id, departure_id, party_size,
  CASE WHEN status = 'confirmed'::public.booking_status
    THEN 'consumed'::public.hold_status ELSE 'active'::public.hold_status END,
  created_at + interval '35 minutes', created_at,
  CASE WHEN status = 'confirmed'::public.booking_status THEN created_at ELSE NULL END,
  NULL
FROM fixtures
ON CONFLICT (id) DO NOTHING;`;

const INSERT_GUIDE_ASSIGNMENT_SQL = `
INSERT INTO public.guide_assignments (
  id, booking_id, guide_user_id, status, mobility_flags, dietary_flags
) VALUES ($1::uuid, $2::uuid, $3::uuid, 'assigned'::public.assignment_status, '{}'::text[], '{}'::text[])
ON CONFLICT (id) DO NOTHING;`;

const INSERT_QA_SLOTS_SQL = `
WITH slots AS (
  SELECT * FROM pg_catalog.jsonb_to_recordset($1::jsonb) AS value(
    slot_id text, terminal_flow text, max_party_size integer,
    booking_id uuid, checkout_attempt_id uuid, checkout_idempotency_id uuid,
    capacity_hold_id uuid, simulated_payment_id uuid, cancellation_id uuid,
    booking_idempotency_key text, payment_idempotency_key text,
    cancellation_idempotency_key text, recommend_operation_id uuid,
    refine_operation_id uuid
  )
)
INSERT INTO private.thesis_demo_qa_slots (
  slot_id, dataset_version, terminal_flow, owner_user_id, departure_id,
  max_party_size, booking_id, checkout_attempt_id, checkout_idempotency_id,
  capacity_hold_id, simulated_payment_id, cancellation_id,
  booking_idempotency_key, payment_idempotency_key,
  cancellation_idempotency_key, recommend_operation_id, refine_operation_id
)
SELECT
  slots.slot_id, 'thesis-demo.v2', slots.terminal_flow, $2::uuid, $3::uuid,
  slots.max_party_size, slots.booking_id, slots.checkout_attempt_id,
  slots.checkout_idempotency_id, slots.capacity_hold_id,
  slots.simulated_payment_id, slots.cancellation_id,
  slots.booking_idempotency_key, slots.payment_idempotency_key,
  slots.cancellation_idempotency_key, slots.recommend_operation_id,
  slots.refine_operation_id
FROM slots
ON CONFLICT (slot_id) DO NOTHING;`;

function qaSlotRows(dataset) {
  return dataset.qa.slots.map((slot) => ({
    slot_id: slot.id,
    terminal_flow: slot.terminalFlow,
    max_party_size: slot.maxSeats,
    booking_id: slot.bookingId,
    checkout_attempt_id: slot.checkoutAttemptId,
    checkout_idempotency_id: slot.checkoutIdempotencyId,
    capacity_hold_id: slot.holdId,
    simulated_payment_id: slot.paymentId,
    cancellation_id: slot.cancelId,
    booking_idempotency_key: slot.bookingIdempotencyKey,
    payment_idempotency_key: slot.paymentIdempotencyKey,
    cancellation_idempotency_key: slot.cancelIdempotencyKey,
    recommend_operation_id: slot.recommendOperationId,
    refine_operation_id: slot.refineOperationId,
  }));
}

function isExactV1Inventory(inventory) {
  const audited = auditInventory(inventory);
  return audited !== null
    && inventory.graphState === "upgrade-v1"
    && inventory.graphConflicts.length === 0
    && inventory.unexpectedObjects.length === 0
    && audited.unclassifiedApplicationRows === 0
    && audited.unclassifiedAuthUsers === 0
    && THESIS_DEMO_RELATIONS.every((relation) =>
      audited.demoRowsByRelation[relation] === (THESIS_DEMO_V1_DEMO_ROWS[relation] ?? 0));
}

function placeRows(dataset) {
  return dataset.places.map((place) => ({
    id: place.id,
    opening_id: place.openingId,
    area_id: place.areaId,
    slug: place.slug,
    price_vnd_per_person: place.priceVndPerPerson,
    visit_duration_minutes: place.visitDurationMinutes,
    source_url: place.source.url,
    verified_at: place.source.verifiedAt,
    attribution: place.source.attribution,
    title_en: place.translations.en.title,
    summary_en: place.translations.en.summary,
    description_en: place.translations.en.description,
    title_vi: place.translations.vi.title,
    summary_vi: place.translations.vi.summary,
    description_vi: place.translations.vi.description,
    weekday: place.openingHours.weekday,
    opens_at: place.openingHours.opensAt,
    closes_at: place.openingHours.closesAt,
  }));
}

function tourRows(dataset) {
  return dataset.tours.map((tour) => ({
    id: tour.id,
    version_id: tour.versionId,
    slug: tour.slug,
    duration_minutes: tour.durationMinutes,
    price_vnd_per_person: tour.priceVndPerPerson,
    inclusions: tour.inclusions,
    exclusions: tour.exclusions,
    cancellation_policy: tour.cancellationPolicy,
    source_url: tour.source.url,
    verified_at: tour.source.verifiedAt,
    attribution: tour.source.attribution,
    license: tour.source.license,
    title_en: tour.translations.en.title,
    summary_en: tour.translations.en.summary,
    meeting_point_en: tour.translations.en.meetingPoint,
    title_vi: tour.translations.vi.title,
    summary_vi: tour.translations.vi.summary,
    meeting_point_vi: tour.translations.vi.meetingPoint,
  }));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).sort().join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function pgTime(value) {
  return /^\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
}

function pgTimestamp(value) {
  return new Date(value).toISOString().replace(".000Z", "+00:00");
}

function checkoutCanonicalHash({ ownerUserId, departureId, partySize, language }) {
  return createHash("sha256")
    .update(`localens-checkout-v1|${ownerUserId}|departure|${departureId}|${partySize}|${language}`, "utf8")
    .digest("hex");
}

function fixtureRows(dataset, identities, catalogSnapshotId, travelSnapshotId) {
  const byKey = new Map(identities.map((identity) => [identity.key, identity]));
  const departureById = new Map(dataset.tours.flatMap((tour) =>
    tour.departures.map((departure) => [departure.id, { ...departure, tour }])));
  return [dataset.fixtures.pendingPaymentBooking, dataset.fixtures.assignedGuideBooking].map((fixture, index) => {
    const departure = departureById.get(fixture.departureId);
    const tour = departure.tour;
    const createdAt = fixture.createdAt ?? `${dataset.seedBaseDate}T00:00:0${index}.000Z`;
    return {
      id: fixture.id,
      owner_user_id: byKey.get(fixture.ownerAccountKey).userId,
      source_kind: "departure",
      source_id: fixture.departureId,
      departure_id: fixture.departureId,
      quote_id: null,
      status: fixture.status,
      tour_version_id: tour.versionId,
      title_en: tour.translations.en.title,
      title_vi: tour.translations.vi.title,
      cancellation_policy: tour.cancellationPolicy,
      catalog_snapshot_id: catalogSnapshotId,
      travel_snapshot_id: travelSnapshotId,
      fx_snapshot_id: null,
      fx_vnd_per_usd: null,
      per_person_vnd_minor: tour.priceVndPerPerson,
      total_vnd_minor: tour.priceVndPerPerson * fixture.partySize,
      checkout_currency: "vnd",
      checkout_amount_minor: tour.priceVndPerPerson * fixture.partySize,
      party_size: fixture.partySize,
      language: "en",
      meeting_point: tour.translations.en.meetingPoint,
      hold_duration_seconds: 2100,
      hold_expires_at: pgTimestamp(new Date(new Date(createdAt).valueOf() + 35 * 60 * 1000)),
      created_at: pgTimestamp(createdAt),
    };
  });
}

export function createThesisDemoExpectedGraph({
  dataset,
  identities,
  projectRef,
  catalogSnapshotId,
  travelSnapshotId,
}) {
  validateThesisDemoDataset(dataset);
  const identityRows = databaseIdentities(dataset, identities);
  requireSeed(hasExactText(projectRef), "THESIS_DEMO_PROJECT_REQUIRED", "expected project ref is required");
  requireSeed(hasExactText(catalogSnapshotId) && hasExactText(travelSnapshotId),
    "THESIS_DEMO_DATABASE_FAILED", "snapshot identities are required for graph comparison");
  const places = placeRows(dataset);
  const tours = tourRows(dataset);
  const bookings = fixtureRows(dataset, identities, catalogSnapshotId, travelSnapshotId);
  const fixtureById = new Map([
    [dataset.fixtures.pendingPaymentBooking.id, dataset.fixtures.pendingPaymentBooking],
    [dataset.fixtures.assignedGuideBooking.id, dataset.fixtures.assignedGuideBooking],
  ]);
  const guide = identityRows.find(({ role }) => role === "guide");
  const qaCustomer = identityRows.find(({ email }) => email === "customer.qa@localens.invalid");
  const cancellationFixture = dataset.fixtures.pendingPaymentBooking;
  const cancellationBooking = bookings.find(({ id }) => id === cancellationFixture.id);
  const providerIdempotencyKey = `localens:stripe-checkout:v1:${cancellationFixture.checkoutAttemptId}`;
  const cancellationCanonicalHash = checkoutCanonicalHash({
    ownerUserId: qaCustomer.userId,
    departureId: cancellationFixture.departureId,
    partySize: cancellationFixture.partySize,
    language: cancellationBooking.language,
  });

  return {
    "public.profiles": identityRows.map((row) => ({
      id: row.userId,
      display_name: row.displayName,
      language: row.language,
    })),
    "private.user_roles": identityRows.map((row) => ({ user_id: row.userId, role: row.role })),
    "public.guide_profiles": identityRows.filter(({ role }) => role === "guide").map((row) => ({
      user_id: row.userId,
      display_name: row.displayName,
      bio: null,
      language: row.language,
    })),
    "public.areas": [{ id: dataset.area.id, slug: dataset.area.slug }],
    "public.area_translations": ["en", "vi"].map((locale) => ({
      area_id: dataset.area.id,
      locale,
      name: dataset.area.translations[locale].name,
      description: dataset.area.translations[locale].description,
    })),
    "public.places": places.map((place) => ({
      id: place.id,
      area_id: place.area_id,
      slug: place.slug,
      status: "published",
      price_vnd_per_person: place.price_vnd_per_person,
      visit_duration_minutes: place.visit_duration_minutes,
      source_url: place.source_url,
      verified_at: place.verified_at,
      attribution: place.attribution,
    })),
    "public.place_translations": dataset.places.flatMap((place) => ["en", "vi"].map((locale) => ({
      place_id: place.id,
      locale,
      title: place.translations[locale].title,
      summary: place.translations[locale].summary,
      description: place.translations[locale].description,
    }))),
    "public.place_experience_types": dataset.places.flatMap((place) =>
      place.experienceTypes.map((experienceType) => ({ place_id: place.id, experience_type: experienceType }))),
    "public.place_guide_languages": dataset.places.flatMap((place) =>
      place.guideLanguages.map((language) => ({ place_id: place.id, language }))),
    "public.place_supports": dataset.places.flatMap((place) => place.supports.map((support) => ({
      place_id: place.id,
      support_kind: support.kind,
      requirement: support.requirement,
      status: support.status,
    }))),
    "public.place_opening_hours": dataset.places.map((place) => ({
      id: place.openingId,
      place_id: place.id,
      weekday: place.openingHours.weekday,
      opens_at: pgTime(place.openingHours.opensAt),
      closes_at: pgTime(place.openingHours.closesAt),
    })),
    "public.travel_edges": dataset.travelEdges.map((edge) => ({
      id: edge.id,
      from_place_id: edge.fromPlaceId,
      to_place_id: edge.toPlaceId,
      mode: edge.mode,
      minutes: edge.minutes,
      group_cost_vnd: edge.groupCostVnd,
      verified_at: `${dataset.seedBaseDate}T00:00:00+00:00`,
    })),
    "public.catalog_snapshots": [{ id: catalogSnapshotId, status: "published" }],
    "public.catalog_snapshot_areas": [{
      snapshot_id: catalogSnapshotId,
      area_id: dataset.area.id,
      slug: dataset.area.slug,
    }],
    "public.catalog_snapshot_area_translations": ["en", "vi"].map((locale) => ({
      snapshot_id: catalogSnapshotId,
      area_id: dataset.area.id,
      locale,
      name: dataset.area.translations[locale].name,
      description: dataset.area.translations[locale].description,
    })),
    "public.catalog_snapshot_places": places.map((place) => ({
      snapshot_id: catalogSnapshotId,
      place_id: place.id,
      area_id: place.area_id,
      slug: place.slug,
      price_vnd_per_person: place.price_vnd_per_person,
      visit_duration_minutes: place.visit_duration_minutes,
      source_url: place.source_url,
      verified_at: place.verified_at,
      attribution: place.attribution,
    })),
    "public.catalog_snapshot_place_translations": dataset.places.flatMap((place) =>
      ["en", "vi"].map((locale) => ({
        snapshot_id: catalogSnapshotId,
        place_id: place.id,
        locale,
        title: place.translations[locale].title,
        summary: place.translations[locale].summary,
        description: place.translations[locale].description,
      }))),
    "public.catalog_snapshot_place_experience_types": dataset.places.flatMap((place) =>
      place.experienceTypes.map((experienceType) => ({
        snapshot_id: catalogSnapshotId,
        place_id: place.id,
        experience_type: experienceType,
      }))),
    "public.catalog_snapshot_place_guide_languages": dataset.places.flatMap((place) =>
      place.guideLanguages.map((language) => ({ snapshot_id: catalogSnapshotId, place_id: place.id, language }))),
    "public.catalog_snapshot_place_supports": dataset.places.flatMap((place) =>
      place.supports.map((support) => ({
        snapshot_id: catalogSnapshotId,
        place_id: place.id,
        support_kind: support.kind,
        requirement: support.requirement,
        status: support.status,
      }))),
    "public.catalog_snapshot_place_opening_hours": dataset.places.map((place) => ({
      snapshot_id: catalogSnapshotId,
      place_id: place.id,
      opening_id: place.openingId,
      weekday: place.openingHours.weekday,
      opens_at: pgTime(place.openingHours.opensAt),
      closes_at: pgTime(place.openingHours.closesAt),
    })),
    "public.travel_snapshots": [{
      id: travelSnapshotId,
      catalog_snapshot_id: catalogSnapshotId,
      status: "published",
    }],
    "public.travel_snapshot_edges": dataset.travelEdges.map((edge) => ({
      snapshot_id: travelSnapshotId,
      catalog_snapshot_id: catalogSnapshotId,
      source_edge_id: edge.id,
      from_place_id: edge.fromPlaceId,
      to_place_id: edge.toPlaceId,
      mode: edge.mode,
      minutes: edge.minutes,
      group_cost_vnd: edge.groupCostVnd,
      verified_at: `${dataset.seedBaseDate}T00:00:00+00:00`,
    })),
    "public.tours": tours.map((tour) => ({ id: tour.id, slug: tour.slug, status: "published" })),
    "public.tour_translations": dataset.tours.flatMap((tour) => ["en", "vi"].map((locale) => ({
      tour_id: tour.id,
      locale,
      title: tour.translations[locale].title,
      summary: tour.translations[locale].summary,
      meeting_point: tour.translations[locale].meetingPoint,
    }))),
    "public.tour_versions": tours.map((tour) => ({
      id: tour.version_id,
      tour_id: tour.id,
      catalog_snapshot_id: catalogSnapshotId,
      status: "published",
      duration_minutes: tour.duration_minutes,
      price_vnd_per_person: tour.price_vnd_per_person,
      inclusions: tour.inclusions,
      exclusions: tour.exclusions,
      cancellation_policy: tour.cancellation_policy,
      source_url: tour.source_url,
      verified_at: tour.verified_at,
      attribution: tour.attribution,
      license: tour.license,
    })),
    "public.tour_version_translations": dataset.tours.flatMap((tour) => ["en", "vi"].map((locale) => ({
      tour_version_id: tour.versionId,
      locale,
      title: tour.translations[locale].title,
      summary: tour.translations[locale].summary,
      meeting_point: tour.translations[locale].meetingPoint,
    }))),
    "public.tour_version_stops": dataset.tours.flatMap((tour) => tour.stopPlaceIds.map((placeId, index) => ({
      tour_version_id: tour.versionId,
      catalog_snapshot_id: catalogSnapshotId,
      position: index + 1,
      place_id: placeId,
    }))),
    "public.departures": dataset.tours.flatMap((tour) => tour.departures.map((departure) => ({
      id: departure.id,
      tour_version_id: tour.versionId,
      start_at: departure.startAt.replace(".000Z", "+00:00"),
      end_at: departure.endAt.replace(".000Z", "+00:00"),
      status: departure.status,
      capacity: departure.capacity,
    }))),
    "public.bookings": bookings,
    "private.checkout_attempts": [{
      id: cancellationFixture.checkoutAttemptId,
      booking_id: cancellationFixture.id,
      owner_user_id: qaCustomer.userId,
      source_kind: "departure",
      departure_id: cancellationFixture.departureId,
      quote_id: null,
      provider_idempotency_key: providerIdempotencyKey,
      status: "created",
      provider_session_id: null,
      provider_expires_at: null,
      created_at: cancellationBooking.created_at,
      updated_at: cancellationBooking.created_at,
    }],
    "private.checkout_idempotency": [{
      id: cancellationFixture.checkoutIdempotencyId,
      owner_user_id: qaCustomer.userId,
      idempotency_key: cancellationFixture.checkoutIdempotencyKey,
      canonical_request_hash: cancellationCanonicalHash,
      booking_id: cancellationFixture.id,
      checkout_attempt_id: cancellationFixture.checkoutAttemptId,
      provider_idempotency_key: providerIdempotencyKey,
      created_at: cancellationBooking.created_at,
    }],
    "private.capacity_holds": bookings.map((booking) => {
      const fixture = fixtureById.get(booking.id);
      const isConsumed = fixture.status === "confirmed";
      return {
        id: fixture.holdId,
        booking_id: fixture.id,
        departure_id: fixture.departureId,
        party_size: fixture.partySize,
        status: isConsumed ? "consumed" : "active",
        expires_at: booking.hold_expires_at,
        created_at: booking.created_at,
        consumed_at: isConsumed ? booking.created_at : null,
        released_at: null,
      };
    }),
    "public.guide_assignments": [{
      id: dataset.fixtures.guideAssignment.id,
      booking_id: dataset.fixtures.guideAssignment.bookingId,
      guide_user_id: guide.userId,
      status: dataset.fixtures.guideAssignment.status,
      mobility_flags: [],
      dietary_flags: [],
      accepted_at: null,
      completed_at: null,
      closed_at: null,
    }],
    "private.thesis_demo_qa_slots": qaSlotRows(dataset).map((slot) => ({
      ...slot,
      dataset_version: dataset.datasetVersion,
      owner_user_id: qaCustomer.userId,
      departure_id: dataset.qa.slotDepartureId,
    })),
    "private.thesis_demo_manifest": [{
      project_ref: projectRef,
      environment: "thesis-demo",
      dataset_version: dataset.datasetVersion,
      seed_base_date: dataset.seedBaseDate,
    }],
    "auth.users": dataset.accounts.map((account) => ({
      id: identityRows.find(({ email }) => email === account.email).userId,
      email: account.email,
    })),
  };
}

export function compareThesisDemoDatasetGraph({ expected, actual }) {
  const conflicts = [];
  const relationNames = [...new Set([...Object.keys(expected ?? {}), ...Object.keys(actual ?? {})])]
    .sort();
  for (const relation of relationNames) {
    if (stableJson(expected?.[relation] ?? []) !== stableJson(actual?.[relation] ?? [])) {
      conflicts.push(`${relation}:content`);
    }
  }
  return conflicts.length === 0
    ? { state: "exact", conflicts: [] }
    : { state: "conflict", conflicts };
}

const GRAPH_RELATION_SCOPE_KEYS = Object.freeze({
  "auth.users": ["id"],
  "private.capacity_holds": ["id"],
  "private.checkout_attempts": ["id"],
  "private.checkout_idempotency": ["id"],
  "private.thesis_demo_manifest": ["environment"],
  "private.thesis_demo_qa_slots": ["slot_id"],
  "private.user_roles": ["user_id"],
  "public.area_translations": ["area_id"],
  "public.areas": ["id"],
  "public.bookings": ["id"],
  "public.catalog_snapshot_area_translations": ["snapshot_id"],
  "public.catalog_snapshot_areas": ["snapshot_id"],
  "public.catalog_snapshot_place_experience_types": ["snapshot_id"],
  "public.catalog_snapshot_place_guide_languages": ["snapshot_id"],
  "public.catalog_snapshot_place_opening_hours": ["snapshot_id"],
  "public.catalog_snapshot_place_supports": ["snapshot_id"],
  "public.catalog_snapshot_place_translations": ["snapshot_id"],
  "public.catalog_snapshot_places": ["snapshot_id"],
  "public.catalog_snapshots": ["id"],
  "public.departures": ["id"],
  "public.guide_assignments": ["id"],
  "public.guide_profiles": ["user_id"],
  "public.place_experience_types": ["place_id"],
  "public.place_guide_languages": ["place_id"],
  "public.place_opening_hours": ["id"],
  "public.place_supports": ["place_id"],
  "public.place_translations": ["place_id"],
  "public.places": ["id"],
  "public.profiles": ["id"],
  "public.tour_translations": ["tour_id"],
  "public.tour_version_stops": ["tour_version_id"],
  "public.tour_version_translations": ["tour_version_id"],
  "public.tour_versions": ["id"],
  "public.tours": ["id"],
  "public.travel_edges": ["id"],
  "public.travel_snapshot_edges": ["snapshot_id"],
  "public.travel_snapshots": ["id"],
});

function normalizeGraphValue(value) {
  if (Array.isArray(value)) return value.map(normalizeGraphValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalizeGraphValue(child)]));
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.valueOf())) return parsed.toISOString().replace(".000Z", "+00:00");
  }
  return value;
}

async function readGraphRelation(query, relation, expectedRows) {
  const keys = GRAPH_RELATION_SCOPE_KEYS[relation];
  const predicate = keys.map((key) =>
    `candidate.${key}::text = expected.value->>'${key}'`).join(" AND ");
  const result = await query(
    `SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(candidate)), '[]'::jsonb) AS rows
     FROM ${relation} AS candidate
     WHERE EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_array_elements($1::jsonb) AS expected(value)
       WHERE ${predicate}
     )`,
    [JSON.stringify(expectedRows)],
  );
  const rows = Array.isArray(result?.rows?.[0]?.rows) ? result.rows[0].rows : [];
  const fields = new Set(expectedRows.flatMap((row) => Object.keys(row)));
  return rows.map((row) => normalizeGraphValue(Object.fromEntries(
    [...fields].map((field) => [field, row[field]]),
  )));
}

export async function inspectThesisDemoDatasetGraph({
  query,
  dataset,
  projectRef,
  identities,
  catalogSnapshotId,
  travelSnapshotId,
}) {
  requireQuery(query);
  validateThesisDemoDataset(dataset);
  const authResult = await query(
    `SELECT id, email FROM auth.users
     WHERE email = ANY($1::text[]) ORDER BY email`,
    [dataset.accounts.map(({ email }) => email)],
  );
  const authRows = authResult?.rows ?? [];
  const effectiveIdentities = identities ?? dataset.accounts
    .filter((account) => authRows.some(({ email }) => email === account.email))
    .map((account) => ({
      ...account,
      userId: authRows.find(({ email }) => email === account.email).id,
    }));
  const identityIds = effectiveIdentities.map(({ userId }) => userId);
  const presence = await query(
    `SELECT
     (EXISTS (SELECT 1 FROM public.profiles WHERE id = ANY($1::uuid[]))
       OR EXISTS (SELECT 1 FROM private.user_roles WHERE user_id = ANY($1::uuid[]))
       OR EXISTS (SELECT 1 FROM public.guide_profiles WHERE user_id = ANY($1::uuid[])))
       AS has_identity_graph,
     (EXISTS (SELECT 1 FROM public.areas WHERE id = $2::uuid)
       OR EXISTS (SELECT 1 FROM public.places WHERE id = ANY($3::uuid[]))
       OR EXISTS (SELECT 1 FROM public.travel_edges WHERE id = ANY($4::uuid[]))
       OR EXISTS (SELECT 1 FROM public.tours WHERE id = ANY($5::uuid[]))
       OR EXISTS (SELECT 1 FROM public.tour_versions WHERE id = ANY($6::uuid[]))
       OR EXISTS (SELECT 1 FROM public.departures WHERE id = ANY($7::uuid[]))
       OR EXISTS (SELECT 1 FROM public.bookings WHERE id = ANY($8::uuid[]))
       OR EXISTS (SELECT 1 FROM public.guide_assignments WHERE id = $9::uuid)
       OR EXISTS (SELECT 1 FROM private.thesis_demo_manifest WHERE environment = 'thesis-demo'))
       AS has_dataset_graph`,
    [
      identityIds,
      dataset.area.id,
      dataset.places.map(({ id }) => id),
      dataset.travelEdges.map(({ id }) => id),
      dataset.tours.map(({ id }) => id),
      dataset.tours.map(({ versionId }) => versionId),
      dataset.tours.flatMap(({ departures }) => departures.map(({ id }) => id)),
      [dataset.fixtures.pendingPaymentBooking.id, dataset.fixtures.assignedGuideBooking.id],
      dataset.fixtures.guideAssignment.id,
    ],
  );
  const presenceRow = presence?.rows?.[0] ?? {};
  if (presenceRow.has_dataset_graph !== true) {
    if (authRows.length === 0 && presenceRow.has_identity_graph !== true) {
      return { state: "empty", conflicts: [] };
    }
    const identitiesMatchAuth = effectiveIdentities.length > 0
      && effectiveIdentities.length === authRows.length
      && effectiveIdentities.every((identity) => authRows.some((user) =>
        user.id === identity.userId && user.email === identity.email));
    if (!identitiesMatchAuth || presenceRow.has_identity_graph !== true) {
      return { state: "conflict", conflicts: ["auth.users:partial"] };
    }
    const recovery = await query(
      `SELECT
       (SELECT pg_catalog.count(*) FROM public.profiles WHERE id = ANY($1::uuid[]))::integer AS profile_count,
       (SELECT pg_catalog.count(*) FROM public.profiles
        WHERE id = ANY($1::uuid[]) AND (display_name IS NOT NULL OR language <> 'en'::public.locale))::integer
        AS profile_conflict_count,
       (SELECT pg_catalog.count(*) FROM private.user_roles WHERE user_id = ANY($1::uuid[]))::integer AS role_count,
       (SELECT pg_catalog.count(*) FROM private.user_roles
        WHERE user_id = ANY($1::uuid[]) AND role <> 'customer'::public.app_role)::integer AS role_conflict_count,
       (SELECT pg_catalog.count(*) FROM public.guide_profiles WHERE user_id = ANY($1::uuid[]))::integer AS guide_count`,
      [identityIds],
    );
    const row = recovery?.rows?.[0] ?? {};
    if (
      Number(row.profile_count) === effectiveIdentities.length
      && Number(row.profile_conflict_count) === 0
      && Number(row.role_count) === effectiveIdentities.length
      && Number(row.role_conflict_count) === 0
      && Number(row.guide_count) === 0
    ) {
      return { state: "auth-recovery", conflicts: [] };
    }
    return { state: "conflict", conflicts: ["auth.users:recovery-content"] };
  }
  if (effectiveIdentities.length !== dataset.accounts.length) {
    return { state: "conflict", conflicts: ["auth.users:partial"] };
  }

  let resolvedCatalogSnapshotId = catalogSnapshotId;
  if (!hasExactText(resolvedCatalogSnapshotId)) {
    const versionRefs = await query(
      `SELECT id, catalog_snapshot_id FROM public.tour_versions
       WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [dataset.tours.map(({ versionId }) => versionId)],
    );
    const refs = versionRefs?.rows ?? [];
    const ids = new Set(refs.map(({ catalog_snapshot_id: id }) => id));
    if (refs.length !== dataset.tours.length || ids.size !== 1) {
      return { state: "conflict", conflicts: ["public.tour_versions:partial"] };
    }
    [resolvedCatalogSnapshotId] = ids;
  }
  let resolvedTravelSnapshotId = travelSnapshotId;
  if (!hasExactText(resolvedTravelSnapshotId)) {
    const bookingRefs = await query(
      `SELECT id, travel_snapshot_id FROM public.bookings
       WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [[dataset.fixtures.pendingPaymentBooking.id, dataset.fixtures.assignedGuideBooking.id]],
    );
    const refs = bookingRefs?.rows ?? [];
    const ids = new Set(refs.map(({ travel_snapshot_id: id }) => id));
    if (refs.length !== 2 || ids.size !== 1) {
      return { state: "conflict", conflicts: ["public.bookings:partial"] };
    }
    [resolvedTravelSnapshotId] = ids;
  }

  const expected = createThesisDemoExpectedGraph({
    dataset,
    identities: effectiveIdentities,
    projectRef,
    catalogSnapshotId: resolvedCatalogSnapshotId,
    travelSnapshotId: resolvedTravelSnapshotId,
  });
  const actual = {};
  for (const [relation, expectedRows] of Object.entries(expected)) {
    actual[relation] = await readGraphRelation(query, relation, expectedRows);
  }
  const current = compareThesisDemoDatasetGraph({ expected, actual });
  if (current.state === "exact") return current;

  const legacyExpected = structuredClone(expected);
  legacyExpected["private.thesis_demo_qa_slots"] = [];
  legacyExpected["private.thesis_demo_manifest"][0].dataset_version = THESIS_DEMO_UPGRADE_FROM_VERSION;
  const legacy = compareThesisDemoDatasetGraph({ expected: legacyExpected, actual });
  return legacy.state === "exact"
    ? { state: "upgrade-v1", conflicts: [] }
    : current;
}

async function createSnapshotGraph(query, adminUserId) {
  await query("SELECT pg_catalog.set_config('request.jwt.claim.sub', $1::text, true)", [adminUserId]);
  await query("SET LOCAL ROLE localens_admin_rpc_owner");
  const catalog = await query("SELECT private.create_catalog_snapshot() AS catalog_snapshot_id");
  const travel = await query("SELECT private.create_travel_snapshot() AS travel_snapshot_id");
  await query("RESET ROLE");
  const catalogSnapshotId = catalog?.rows?.[0]?.catalog_snapshot_id;
  if (!hasExactText(catalogSnapshotId)) {
    throw seedError("THESIS_DEMO_DATABASE_FAILED", "catalog snapshot creation did not return an id");
  }
  const travelSnapshotId = travel?.rows?.[0]?.travel_snapshot_id;
  if (!hasExactText(travelSnapshotId)) {
    throw seedError("THESIS_DEMO_DATABASE_FAILED", "travel snapshot creation did not return an id");
  }
  return { catalogSnapshotId, travelSnapshotId };
}

function applySummary() {
  return {
    accountCount: 4,
    placeCount: 12,
    tourCount: 3,
    departureCount: 5,
    bookingCount: 2,
    assignmentCount: 1,
    markerCount: 1,
  };
}

export async function lockThesisDemoInventory(query) {
  // Registry readers take ACCESS SHARE for the lifetime of their transaction.
  // Taking this lock first lets a lifecycle RPC that already observed an empty
  // registry finish before the seed snapshot, while later RPCs wait for v2.
  await query(`LOCK TABLE ${THESIS_DEMO_QA_REGISTRY_RELATION} IN ACCESS EXCLUSIVE MODE`);
  for (const relation of THESIS_DEMO_INVENTORY_WRITE_LOCK_RELATIONS) {
    const ownerRole = THESIS_DEMO_INVENTORY_LOCK_OWNERS[relation];
    if (ownerRole) await query(`SET LOCAL ROLE ${ownerRole}`);
    await query(`LOCK TABLE ${relation} IN SHARE ROW EXCLUSIVE MODE`);
    if (ownerRole) await query("RESET ROLE");
  }
}

export async function runThesisDemoApplyTransaction({
  query,
  dataset,
  projectRef,
  identities,
  inspectDatasetGraph,
  readInventory,
}) {
  requireQuery(query);
  const summary = validateThesisDemoDataset(dataset);
  requireSeed(hasExactText(projectRef), "THESIS_DEMO_PROJECT_REQUIRED", "expected project ref is required");
  requireSeed(typeof inspectDatasetGraph === "function",
    "THESIS_DEMO_DATABASE_REQUIRED", "full dataset graph inspector is required");
  const identityRows = databaseIdentities(dataset, identities);
  const qaCustomer = identityRows.find(({ email }) => email === "customer.qa@localens.invalid");
  let started = false;
  try {
    await query("BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE");
    started = true;
    await query("SET LOCAL statement_timeout = '15s'");
    await lockThesisDemoInventory(query);
    const initialGraph = await inspectDatasetGraph({ query, dataset, projectRef, identities });
    if (initialGraph?.state === "conflict") {
      throw seedError("THESIS_DEMO_DATABASE_FAILED", "conflicting thesis-demo graph refused");
    }
    if (initialGraph?.state === "exact") {
      await query("COMMIT");
      started = false;
      return applySummary();
    }
    if (initialGraph?.state === "upgrade-v1") {
      requireSeed(
        typeof readInventory === "function",
        "THESIS_DEMO_DATABASE_REQUIRED",
        "transactional v1 inventory reader is required",
      );
      const upgradeInventory = await readInventory({
        query,
        dataset,
        projectRef,
        identities,
        inspectDatasetGraph,
      });
      if (!isExactV1Inventory(upgradeInventory)) {
        throw seedError("THESIS_DEMO_DATABASE_FAILED", "non-exact v1 inventory refused");
      }
      await executeParameterizedBatch(query, INSERT_QA_SLOTS_SQL, [
        JSON.stringify(qaSlotRows(dataset)),
        qaCustomer.userId,
        dataset.qa.slotDepartureId,
      ]);
      const markerUpgrade = await query(
        `UPDATE private.thesis_demo_manifest
         SET dataset_version = $1
         WHERE environment = 'thesis-demo'
           AND dataset_version = $2
           AND project_ref = $3
           AND seed_base_date = $4::date
         RETURNING dataset_version`,
        [
          THESIS_DEMO_DATASET_VERSION,
          THESIS_DEMO_UPGRADE_FROM_VERSION,
          projectRef,
          dataset.seedBaseDate,
        ],
      );
      if (markerUpgrade?.rowCount !== 1) {
        throw seedError("THESIS_DEMO_DATABASE_FAILED", "exact v1 marker upgrade failed");
      }
      const postconditions = await inspectDatasetGraph({
        query,
        dataset,
        projectRef,
        identities,
      });
      if (postconditions?.state !== "exact" || (postconditions.conflicts?.length ?? 0) !== 0) {
        throw seedError("THESIS_DEMO_DATABASE_FAILED", "v1 to v2 upgrade postconditions failed");
      }
      await query("COMMIT");
      started = false;
      return applySummary();
    }
    if (initialGraph?.state !== "empty" && initialGraph?.state !== "auth-recovery") {
      throw seedError("THESIS_DEMO_DATABASE_FAILED", "unclassified thesis-demo graph refused");
    }
    await executeParameterizedBatch(query, UPSERT_IDENTITIES_SQL, [JSON.stringify(identityRows.map((identity) => ({
      user_id: identity.userId,
      email: identity.email,
      role: identity.role,
      display_name: identity.displayName,
      language: identity.language,
    })))]);
    await executeParameterizedBatch(query, UPSERT_AREA_SQL, [
      dataset.area.id,
      dataset.area.slug,
      dataset.area.translations.en.name,
      dataset.area.translations.en.description,
      dataset.area.translations.vi.name,
      dataset.area.translations.vi.description,
    ]);
    const places = placeRows(dataset);
    await executeParameterizedBatch(query, UPSERT_PLACES_SQL, [
      JSON.stringify(places),
      JSON.stringify(dataset.places.flatMap((place) => place.experienceTypes.map((experienceType) => ({
        place_id: place.id,
        experience_type: experienceType,
      })))),
      JSON.stringify(dataset.places.flatMap((place) => place.guideLanguages.map((language) => ({
        place_id: place.id,
        language,
      })))),
      JSON.stringify(dataset.places.flatMap((place) => place.supports.map((support) => ({
        place_id: place.id,
        support_kind: support.kind,
        requirement: support.requirement,
        status: support.status,
      })))),
      dataset.places.map(({ id }) => id),
    ]);
    await executeParameterizedBatch(query, UPSERT_TRAVEL_EDGES_SQL, [JSON.stringify(dataset.travelEdges.map((edge) => ({
      id: edge.id,
      from_place_id: edge.fromPlaceId,
      to_place_id: edge.toPlaceId,
      mode: edge.mode,
      minutes: edge.minutes,
      group_cost_vnd: edge.groupCostVnd,
      verified_at: `${dataset.seedBaseDate}T00:00:00.000Z`,
    })))]);
    const admin = identityRows.find(({ role }) => role === "admin");
    const { catalogSnapshotId, travelSnapshotId } = await createSnapshotGraph(query, admin.userId);
    await query("SET LOCAL ROLE localens_tour_rpc_owner");
    await executeParameterizedBatch(query, UPSERT_TOURS_SQL, [
      JSON.stringify(tourRows(dataset)),
      catalogSnapshotId,
      JSON.stringify(dataset.tours.flatMap((tour) => tour.stopPlaceIds.map((placeId, index) => ({
        tour_version_id: tour.versionId,
        position: index + 1,
        place_id: placeId,
      })))),
      dataset.tours.map(({ versionId }) => versionId),
      dataset.tours.map(({ id }) => id),
      JSON.stringify(dataset.tours.flatMap((tour) => tour.departures.map((departure) => ({
        id: departure.id,
        tour_version_id: tour.versionId,
        start_at: departure.startAt,
        end_at: departure.endAt,
        status: "scheduled",
        capacity: departure.capacity,
      })))),
    ]);
    await query(
      `UPDATE public.departures
       SET status = 'sold_out'::public.departure_status
       WHERE id = $1::uuid AND status = 'scheduled'::public.departure_status`,
      [dataset.qa.soldOutDepartureId],
    );
    await query("RESET ROLE");
    const guide = identityRows.find(({ role }) => role === "guide");
    await executeParameterizedBatch(query, UPSERT_FIXTURES_SQL, [
      JSON.stringify([
        {
          id: dataset.fixtures.pendingPaymentBooking.id,
          hold_id: dataset.fixtures.pendingPaymentBooking.holdId,
          departure_id: dataset.fixtures.pendingPaymentBooking.departureId,
          party_size: dataset.fixtures.pendingPaymentBooking.partySize,
          status: dataset.fixtures.pendingPaymentBooking.status,
          created_at: dataset.fixtures.pendingPaymentBooking.createdAt,
          checkout_attempt_id: dataset.fixtures.pendingPaymentBooking.checkoutAttemptId,
          checkout_idempotency_id: dataset.fixtures.pendingPaymentBooking.checkoutIdempotencyId,
          checkout_idempotency_key: dataset.fixtures.pendingPaymentBooking.checkoutIdempotencyKey,
          canonical_request_hash: checkoutCanonicalHash({
            ownerUserId: qaCustomer.userId,
            departureId: dataset.fixtures.pendingPaymentBooking.departureId,
            partySize: dataset.fixtures.pendingPaymentBooking.partySize,
            language: "en",
          }),
        },
        {
          id: dataset.fixtures.assignedGuideBooking.id,
          hold_id: dataset.fixtures.assignedGuideBooking.holdId,
          departure_id: dataset.fixtures.assignedGuideBooking.departureId,
          party_size: dataset.fixtures.assignedGuideBooking.partySize,
          status: dataset.fixtures.assignedGuideBooking.status,
          created_at: `${dataset.seedBaseDate}T00:00:01.000Z`,
          checkout_attempt_id: null,
          checkout_idempotency_id: null,
          checkout_idempotency_key: null,
          canonical_request_hash: null,
        },
      ]),
      catalogSnapshotId,
      travelSnapshotId,
      qaCustomer.userId,
      dataset.fixtures.guideAssignment.id,
      dataset.fixtures.guideAssignment.bookingId,
      guide.userId,
    ]);
    await query("SET LOCAL ROLE localens_guide_assignment_rpc_owner");
    await query("SELECT pg_catalog.set_config('localens.guide_assignment_transition', 'on', true)");
    await query(INSERT_GUIDE_ASSIGNMENT_SQL, [
      dataset.fixtures.guideAssignment.id,
      dataset.fixtures.guideAssignment.bookingId,
      guide.userId,
    ]);
    await query("SELECT pg_catalog.set_config('localens.guide_assignment_transition', 'off', true)");
    await query("RESET ROLE");
    await executeParameterizedBatch(query, INSERT_QA_SLOTS_SQL, [
      JSON.stringify(qaSlotRows(dataset)),
      qaCustomer.userId,
      dataset.qa.slotDepartureId,
    ]);
    await query(
      `INSERT INTO private.thesis_demo_manifest (
        project_ref, environment, dataset_version, seed_base_date
      ) VALUES ($1, 'thesis-demo', $2, $3::date)
      ON CONFLICT (environment) DO NOTHING`,
      [projectRef, summary.datasetVersion, dataset.seedBaseDate],
    );
    const postconditions = await inspectDatasetGraph({
      query,
      dataset,
      projectRef,
      identities,
      catalogSnapshotId,
      travelSnapshotId,
    });
    if (postconditions?.state !== "exact" || (postconditions.conflicts?.length ?? 0) !== 0) {
      throw seedError("THESIS_DEMO_DATABASE_FAILED", "full-content database postconditions failed");
    }
    await query("COMMIT");
    started = false;
    return applySummary();
  } catch {
    if (started) await rollbackQuietly(query);
    throw seedError("THESIS_DEMO_DATABASE_FAILED", "transactional thesis-demo seed failed");
  }
}

/**
 * @typedef {Object} VerifyDemoTargetInput
 * @property {string} expectedProjectRef
 * @property {string} expectedOrganizationId
 * @property {{id:string, organizationId:string, name:string}} selectedProject
 * @property {{projectRef:string, hostname:string, username:string, database:string, port:number}} dashboardConnection
 * @property {string} runtimeUrl
 * @property {{hostname:string, username:string, database:string, port:number, tlsVerified:boolean}} databaseConnection
 * @property {{relations:readonly {relation:string,totalRows:number,demoRows:number,baselineRows:number,unclassifiedRows:number}[], graphState:"empty"|"auth-recovery"|"exact"|"conflict", graphConflicts:readonly string[], unexpectedObjects:readonly string[]}} inventory
 * @property {{projectRef:string, environment:"thesis-demo", datasetVersion:string}|null} marker
 */

/**
 * Fail-closed, side-effect-free verification of independent project, runtime,
 * connection, inventory, and marker evidence.
 *
 * @param {VerifyDemoTargetInput} input
 * @returns {{ok:true, projectRef:string, mode:"existing-demo"|"bootstrap-unseeded"|"bootstrap-auth-recovery"}|{ok:false, code:"PROJECT_MISMATCH"|"CONNECTION_MISMATCH"|"TLS_REQUIRED"|"MARKER_MISSING"|"MARKER_MISMATCH"}}
 */
export function verifyDemoTarget(input) {
  const expectedProjectRef = input?.expectedProjectRef;
  const expectedOrganizationId = input?.expectedOrganizationId;
  const selectedProject = input?.selectedProject;
  const dashboardConnection = input?.dashboardConnection;
  const databaseConnection = input?.databaseConnection;

  if (
    !hasExactText(expectedProjectRef)
    || !hasExactText(expectedOrganizationId)
    || selectedProject === null
    || typeof selectedProject !== "object"
    || selectedProject.id !== expectedProjectRef
    || selectedProject.organizationId !== expectedOrganizationId
    || selectedProject.name !== SEED_CONFIRMATION
    || !validRuntimeUrl(input?.runtimeUrl, expectedProjectRef)
  ) {
    return { ok: false, code: "PROJECT_MISMATCH" };
  }

  if (
    !isCompleteConnection(dashboardConnection)
    || dashboardConnection.projectRef !== expectedProjectRef
    || !isCompleteConnection(databaseConnection)
    || dashboardConnection.hostname !== databaseConnection.hostname
    || dashboardConnection.username !== databaseConnection.username
    || dashboardConnection.database !== databaseConnection.database
    || dashboardConnection.port !== databaseConnection.port
  ) {
    return { ok: false, code: "CONNECTION_MISMATCH" };
  }

  if (databaseConnection.tlsVerified !== true) {
    return { ok: false, code: "TLS_REQUIRED" };
  }

  const marker = input?.marker;
  const inventory = input?.inventory;
  const auditedInventory = auditInventory(inventory);
  if (marker === null) {
    const emptyBootstrap = auditedInventory !== null
      && inventory.graphState === "empty"
      && auditedInventory.applicationRows === 0
      && auditedInventory.demoAuthUsers === 0;
    const authRecovery = auditedInventory !== null
      && inventory.graphState === "auth-recovery"
      && auditedInventory.demoAuthUsers > 0
      && auditedInventory.demoAuthUsers <= THESIS_DEMO_ACCOUNT_EMAILS.length
      && auditedInventory.applicationRows === auditedInventory.demoAuthUsers * 2
      && auditedInventory.demoRowsByRelation["public.profiles"] === auditedInventory.demoAuthUsers
      && auditedInventory.demoRowsByRelation["private.user_roles"] === auditedInventory.demoAuthUsers;
    if (
      auditedInventory === null
      || auditedInventory.unclassifiedApplicationRows !== 0
      || auditedInventory.unclassifiedAuthUsers !== 0
      || inventory.unexpectedObjects.length !== 0
      || inventory.graphConflicts.length !== 0
      || (!emptyBootstrap && !authRecovery)
    ) {
      return { ok: false, code: "MARKER_MISSING" };
    }
    return {
      ok: true,
      projectRef: expectedProjectRef,
      mode: authRecovery ? "bootstrap-auth-recovery" : "bootstrap-unseeded",
    };
  }

  if (
    marker !== undefined
    && marker !== null
    && typeof marker === "object"
    && marker.projectRef === expectedProjectRef
    && marker.environment === "thesis-demo"
    && marker.datasetVersion === THESIS_DEMO_UPGRADE_FROM_VERSION
    && isExactV1Inventory(inventory)
  ) {
    return { ok: true, projectRef: expectedProjectRef, mode: "upgrade-v1" };
  }

  if (
    marker === undefined
    || marker === null
    || typeof marker !== "object"
    || marker.projectRef !== expectedProjectRef
    || marker.environment !== "thesis-demo"
    || marker.datasetVersion !== THESIS_DEMO_DATASET_VERSION
    || auditedInventory === null
    || auditedInventory.applicationRows === 0
    || auditedInventory.unclassifiedApplicationRows !== 0
    || auditedInventory.demoAuthUsers !== THESIS_DEMO_ACCOUNT_EMAILS.length
    || auditedInventory.unclassifiedAuthUsers !== 0
    || inventory.unexpectedObjects.length !== 0
    || inventory.graphState !== "exact"
    || inventory.graphConflicts.length !== 0
  ) {
    return { ok: false, code: "MARKER_MISMATCH" };
  }

  return { ok: true, projectRef: expectedProjectRef, mode: "existing-demo" };
}
