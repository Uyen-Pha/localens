import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  THESIS_DEMO_RELATIONS,
  THESIS_DEMO_DATASET_VERSION,
  compareThesisDemoDatasetGraph,
  createThesisDemoExpectedGraph,
  runThesisDemoApplyTransaction,
  runThesisDemoDryRunTransaction,
  runThesisDemoSeed,
  validateThesisDemoDataset,
  verifyDemoTarget,
// @ts-expect-error Task 17 exercises this JavaScript module through a unit-only contract.
} from "../../../scripts/lib/thesis-demo-seed.mjs";
import {
  listExpectedThesisDemoRelations,
  loadControllerMetadata,
  readThesisDemoInventory,
  runThesisDemoCloudCli,
  runThesisDemoCloudMain,
// @ts-expect-error Task 17 exercises this JavaScript CLI through injected local-only dependencies.
} from "../../../scripts/seed-thesis-demo-cloud.mjs";
// @ts-expect-error Task 19A checks the JavaScript inventory classifier contract.
import * as thesisDemoCloudSeed from "../../../scripts/seed-thesis-demo-cloud.mjs";

const PROJECT_REF = "abcdefghijklmnopqrst";
const ORGANIZATION_ID = "organization-demo";
const DATASET_VERSION = "thesis-demo.v2";
const PROJECT_ROOT = path.resolve(import.meta.dirname, "../../..");
const SERVICE_ROLE_KEY = "unit-service-role-key-not-real";
const DATABASE_URL = "postgresql://unit-user:unit-db-value@unit.invalid:6543/postgres?sslmode=verify-full";
const PASSWORDS = {
  customer: "unit-customer-value",
  guide: "unit-guide-value",
  admin: "unit-admin-value",
  qaCustomer: "unit-qa-value",
};

const REQUIRED_RELATION_ROWS: Record<string, number> = {
  "auth.users": 4,
  "private.capacity_holds": 2,
  "private.checkout_attempts": 1,
  "private.checkout_idempotency": 1,
  "private.thesis_demo_qa_slots": 4,
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
};

function completeInventory({
  graphState = "empty",
  authDemoRows = graphState === "exact" || graphState === "auth-recovery" ? 4 : 0,
  relationOverrides = {},
  unexpectedObjects = [],
}: {
  graphState?: "empty" | "auth-recovery" | "upgrade-v1" | "exact" | "conflict";
  authDemoRows?: number;
  relationOverrides?: Record<string, Partial<{
    totalRows: number;
    demoRows: number;
    baselineRows: number;
    unclassifiedRows: number;
  }>>;
  unexpectedObjects?: string[];
} = {}) {
  const relations = THESIS_DEMO_RELATIONS.map((relation: string) => {
    const baselineRows = relation === "private.stripe_test_settings" ? 1 : 0;
    const populatedGraph = graphState === "exact" || graphState === "upgrade-v1";
    const demoRows = relation === "auth.users"
      ? authDemoRows
      : populatedGraph
        ? (graphState === "upgrade-v1" && relation === "private.thesis_demo_qa_slots"
            ? 0
            : (REQUIRED_RELATION_ROWS[relation] ?? 0))
        : graphState === "auth-recovery" && ["public.profiles", "private.user_roles"].includes(relation)
          ? authDemoRows
        : 0;
    return {
      relation,
      totalRows: baselineRows + demoRows,
      demoRows,
      baselineRows,
      unclassifiedRows: 0,
      ...relationOverrides[relation],
    };
  });
  return { relations, graphState, graphConflicts: [], unexpectedObjects };
}

function readDataset() {
  return JSON.parse(readFileSync(path.join(PROJECT_ROOT, "data", "demo", "thesis-demo.v2.json"), "utf8"));
}

function readV1DatasetSource() {
  return readFileSync(path.join(PROJECT_ROOT, "data", "demo", "thesis-demo.v1.json"), "utf8");
}

async function readInventoryFixture(inventory: ReturnType<typeof completeInventory>) {
  const query = vi.fn(async (sql: string) => {
    if (/information_schema\.tables/i.test(sql)) return { rows: [] };
    return {
      rows: inventory.relations.map((row: {
        relation: string;
        totalRows: number;
        demoRows: number;
        baselineRows: number;
      }) => ({
        relation: row.relation,
        total_rows: row.totalRows,
        demo_rows: row.demoRows,
        baseline_rows: row.baselineRows,
      })),
    };
  });
  return readThesisDemoInventory({
    query,
    dataset: readDataset(),
    projectRef: PROJECT_REF,
    inspectDatasetGraph: vi.fn(async () => ({ state: "upgrade-v1", conflicts: [] })),
  });
}

function validTarget(overrides: Record<string, unknown> = {}) {
  return {
    expectedProjectRef: PROJECT_REF,
    expectedOrganizationId: ORGANIZATION_ID,
    selectedProject: {
      id: PROJECT_REF,
      organizationId: ORGANIZATION_ID,
      name: "localens-thesis-demo",
    },
    dashboardConnection: {
      projectRef: PROJECT_REF,
      hostname: "aws-0-ap-southeast-1.pooler.supabase.com",
      username: `postgres.${PROJECT_REF}`,
      database: "postgres",
      port: 6543,
    },
    runtimeUrl: `https://${PROJECT_REF}.supabase.co`,
    databaseConnection: {
      hostname: "aws-0-ap-southeast-1.pooler.supabase.com",
      username: `postgres.${PROJECT_REF}`,
      database: "postgres",
      port: 6543,
      tlsVerified: true,
    },
    inventory: completeInventory(),
    marker: null,
    ...overrides,
  };
}

describe("verifyDemoTarget", () => {
  it("accepts only an independently matched empty project for bootstrap", () => {
    expect(verifyDemoTarget(validTarget())).toEqual({
      ok: true,
      projectRef: PROJECT_REF,
      mode: "bootstrap-unseeded",
    });
  });

  it("accepts only the exact immutable v1 graph as the one supported upgrade", () => {
    expect(verifyDemoTarget(validTarget({
      inventory: completeInventory({ graphState: "upgrade-v1", authDemoRows: 4 }),
      marker: {
        projectRef: PROJECT_REF,
        environment: "thesis-demo",
        datasetVersion: "thesis-demo.v1",
      },
    }))).toEqual({
      ok: true,
      projectRef: PROJECT_REF,
      mode: "upgrade-v1",
    });

    expect(verifyDemoTarget(validTarget({
      inventory: completeInventory({ graphState: "conflict", authDemoRows: 4 }),
      marker: {
        projectRef: PROJECT_REF,
        environment: "thesis-demo",
        datasetVersion: "thesis-demo.v1",
      },
    }))).toEqual({ ok: false, code: "MARKER_MISMATCH" });
  });

  it.each([
    "private.thesis_demo_qa_slots",
    "private.booking_cancellations",
    "private.capacity_holds",
    "private.checkout_attempts",
    "private.checkout_idempotency",
    "private.simulated_payment_receipts",
    "private.runtime_planner_operations",
    "private.quota_reservations",
    "private.quota_buckets",
    "private.quota_global_buckets",
    "private.recommendation_runs",
    "public.bookings",
    "public.trip_plans",
    "public.trip_plan_revisions",
    "public.trip_plan_items",
  ])("rejects a classified %s row from the exact v1 upgrade inventory", (relation) => {
    const expectedV1Rows = relation === "private.thesis_demo_qa_slots"
      ? 0
      : (REQUIRED_RELATION_ROWS[relation] ?? 0);
    const inventory = completeInventory({
      graphState: "upgrade-v1",
      authDemoRows: 4,
      relationOverrides: {
        [relation]: {
          totalRows: expectedV1Rows + 1,
          demoRows: expectedV1Rows + 1,
        },
      },
    });

    expect(verifyDemoTarget(validTarget({
      inventory,
      marker: {
        projectRef: PROJECT_REF,
        environment: "thesis-demo",
        datasetVersion: "thesis-demo.v1",
      },
    }))).toEqual({ ok: false, code: "MARKER_MISMATCH" });
  });

  it.each([
    {
      selectedProject: { id: "wrong-project", organizationId: ORGANIZATION_ID, name: "localens-thesis-demo" },
    },
    {
      selectedProject: { id: PROJECT_REF, organizationId: "wrong-organization", name: "localens-thesis-demo" },
    },
    {
      selectedProject: { id: PROJECT_REF, organizationId: ORGANIZATION_ID, name: "another-project" },
    },
    { runtimeUrl: "http://127.0.0.1:54321" },
    { runtimeUrl: "https://forged-project.supabase.co" },
    { dashboardConnection: undefined },
  ])("rejects a mismatched or incomplete independent project identity before seeding: %o", (override) => {
    expect(verifyDemoTarget(validTarget(override))).toMatchObject({ ok: false });
  });

  it("rejects a shared pooler host when the username project identity differs", () => {
    const result = verifyDemoTarget(validTarget({
      databaseConnection: {
        hostname: "aws-0-ap-southeast-1.pooler.supabase.com",
        username: "postgres.differentproject",
        database: "postgres",
        port: 6543,
        tlsVerified: true,
      },
    }));

    expect(result).toEqual({ ok: false, code: "CONNECTION_MISMATCH" });
  });

  it("requires a verified TLS connection", () => {
    expect(verifyDemoTarget(validTarget({
      databaseConnection: {
        ...validTarget().databaseConnection,
        tlsVerified: false,
      },
    }))).toEqual({ ok: false, code: "TLS_REQUIRED" });
  });

  it("refuses marker-missing bootstrap for partial/foreign Auth, application data, or unexpected objects", () => {
    for (const inventory of [
      completeInventory({ authDemoRows: 5 }),
      completeInventory({ relationOverrides: { "public.places": { totalRows: 1, demoRows: 1 } } }),
      completeInventory({
        relationOverrides: {
          "auth.users": { totalRows: 1, demoRows: 0, unclassifiedRows: 1 },
        },
      }),
      completeInventory({ unexpectedObjects: ["public.foreign"] }),
    ]) {
      expect(verifyDemoTarget(validTarget({ inventory }))).toEqual({ ok: false, code: "MARKER_MISSING" });
    }
  });

  it("accepts marker-missing recovery only for an exact allowlisted Auth trigger graph", () => {
    expect(verifyDemoTarget(validTarget({
      inventory: completeInventory({ graphState: "auth-recovery" }),
    }))).toEqual({
      ok: true,
      projectRef: PROJECT_REF,
      mode: "bootstrap-auth-recovery",
    });

    expect(verifyDemoTarget(validTarget({
      inventory: completeInventory({
        graphState: "auth-recovery",
        authDemoRows: 4,
        relationOverrides: {
          "auth.users": { totalRows: 5, demoRows: 4, unclassifiedRows: 1 },
        },
      }),
    }))).toEqual({ ok: false, code: "MARKER_MISSING" });

    expect(verifyDemoTarget(validTarget({
      inventory: completeInventory({
        graphState: "auth-recovery",
        authDemoRows: 1,
      }),
    }))).toEqual({
      ok: true,
      projectRef: PROJECT_REF,
      mode: "bootstrap-auth-recovery",
    });
  });

  it("accepts an exact marker only when all existing rows belong to the demo dataset", () => {
    expect(verifyDemoTarget(validTarget({
      inventory: completeInventory({ graphState: "exact" }),
      marker: {
        projectRef: PROJECT_REF,
        environment: "thesis-demo",
        datasetVersion: DATASET_VERSION,
      },
    }))).toEqual({ ok: true, projectRef: PROJECT_REF, mode: "existing-demo" });
  });

  it.each([
    { projectRef: "wrong-project", environment: "thesis-demo", datasetVersion: DATASET_VERSION },
    { projectRef: PROJECT_REF, environment: "production", datasetVersion: DATASET_VERSION },
    { projectRef: PROJECT_REF, environment: "thesis-demo", datasetVersion: "thesis-demo.v0" },
  ])("rejects a mismatched marker: %o", (marker) => {
    expect(verifyDemoTarget(validTarget({ marker }))).toEqual({ ok: false, code: "MARKER_MISMATCH" });
  });

  it("refuses incomplete relation coverage and full-content graph conflicts during preflight", () => {
    const incomplete = completeInventory({ graphState: "exact" });
    incomplete.relations.pop();
    const marker = { projectRef: PROJECT_REF, environment: "thesis-demo", datasetVersion: DATASET_VERSION };
    const unclassified = completeInventory({
      graphState: "exact",
      relationOverrides: {
        "public.content_drafts": { totalRows: 1, demoRows: 0, unclassifiedRows: 1 },
      },
    });

    expect(verifyDemoTarget(validTarget({ marker, inventory: incomplete })))
      .toEqual({ ok: false, code: "MARKER_MISMATCH" });
    expect(verifyDemoTarget(validTarget({ marker, inventory: unclassified })))
      .toEqual({ ok: false, code: "MARKER_MISMATCH" });
    expect(verifyDemoTarget(validTarget({
      marker,
      inventory: {
        ...completeInventory({ graphState: "conflict" }),
        graphConflicts: ["public.bookings:content"],
      },
    }))).toEqual({ ok: false, code: "MARKER_MISMATCH" });
  });
});

describe("thesis demo dataset versions", () => {
  it("keeps the checked-in v1 dataset byte-for-byte immutable", () => {
    const source = readV1DatasetSource();

    expect(createHash("sha256").update(source, "utf8").digest("hex"))
      .toBe("a84de06d18c7958e435d44bbd14de774f728c891585176bb4d5b47b5d8429a2f");
    expect(JSON.parse(source).datasetVersion).toBe("thesis-demo.v1");
  });

  it("is a stable, bilingual synthetic dataset with the expected account, place, and tour counts", () => {
    const dataset = readDataset();

    expect(validateThesisDemoDataset(dataset)).toEqual({
      datasetVersion: "thesis-demo.v2",
      classification: "synthetic_demo",
      accountCount: 4,
      roleCount: 3,
      placeCount: 12,
      tourCount: 3,
      teacherDepartureCount: 3,
      qaDepartureCount: 2,
      qaSlotCount: 4,
    });
    expect(THESIS_DEMO_DATASET_VERSION).toBe(DATASET_VERSION);
    expect(dataset.accounts.map(({ email }: { email: string }) => email)).toEqual([
      "customer.demo@localens.invalid",
      "guide.demo@localens.invalid",
      "admin.demo@localens.invalid",
      "customer.qa@localens.invalid",
    ]);
    expect(new Set(dataset.accounts.map(({ role }: { role: string }) => role))).toEqual(
      new Set(["customer", "guide", "admin"]),
    );
    expect(dataset.accounts.map(({ key, email, role, audience }: Record<string, string>) => ({
      key,
      email,
      role,
      audience,
    }))).toEqual([
      { key: "customer-demo", email: "customer.demo@localens.invalid", role: "customer", audience: "teacher" },
      { key: "guide-demo", email: "guide.demo@localens.invalid", role: "guide", audience: "teacher" },
      { key: "admin-demo", email: "admin.demo@localens.invalid", role: "admin", audience: "operator" },
      { key: "customer-qa", email: "customer.qa@localens.invalid", role: "customer", audience: "qa" },
    ]);
    for (const record of [...dataset.places, ...dataset.tours]) {
      expect(record.classification).toBe("synthetic_demo");
      expect(record.translations.en.title).toBeTruthy();
      expect(record.translations.vi.title).toBeTruthy();
      expect(record.source).toEqual(expect.objectContaining({
        kind: "synthetic_demo",
        attribution: "LocalLens synthetic thesis-demo fixture",
        license: "Synthetic demo data; no external venue or vendor claim",
      }));
    }
  });

  it("rejects role, key, or audience swaps inside the immutable account allowlist", () => {
    const mutations = [
      (dataset: ReturnType<typeof readDataset>) => {
        [dataset.accounts[0].role, dataset.accounts[2].role] = [dataset.accounts[2].role, dataset.accounts[0].role];
      },
      (dataset: ReturnType<typeof readDataset>) => {
        [dataset.accounts[0].key, dataset.accounts[1].key] = [dataset.accounts[1].key, dataset.accounts[0].key];
      },
      (dataset: ReturnType<typeof readDataset>) => {
        [dataset.accounts[2].audience, dataset.accounts[3].audience] = [dataset.accounts[3].audience, dataset.accounts[2].audience];
      },
    ];

    for (const mutate of mutations) {
      const dataset = readDataset();
      mutate(dataset);
      expect(() => validateThesisDemoDataset(dataset)).toThrow(
        expect.objectContaining({ code: "THESIS_DEMO_DATASET_INVALID" }),
      );
    }
  });

  it("uses fixed Asia/Ho_Chi_Minh dates and disjoint teacher/QA departures", () => {
    const dataset = readDataset();
    const departures = dataset.tours.flatMap(({ departures }: { departures: unknown[] }) => departures);

    expect(dataset.timezone).toBe("Asia/Ho_Chi_Minh");
    expect(dataset.seedBaseDate).toBe("2026-09-05");
    expect(departures.map(({ dayOffset }: { dayOffset: number }) => dayOffset).sort((a: number, b: number) => a - b))
      .toEqual([7, 7, 14, 14, 21]);
    expect(departures.map(({ startAt }: { startAt: string }) => startAt).sort()).toEqual([
      "2026-09-12T02:00:00.000Z",
      "2026-09-12T07:00:00.000Z",
      "2026-09-19T02:00:00.000Z",
      "2026-09-19T07:00:00.000Z",
      "2026-09-26T02:00:00.000Z",
    ]);

    const teacherIds = new Set<string>(dataset.teacherDepartureIds);
    const qaIds = new Set<string>(dataset.qaDepartureIds);
    expect([...teacherIds].filter((id) => qaIds.has(id))).toEqual([]);
    expect(departures.filter(({ status }: { status: string }) => status === "sold_out"))
      .toEqual([expect.objectContaining({ id: dataset.qa.soldOutDepartureId, audience: "qa" })]);
    expect(departures.filter(({ audience }: { audience: string }) => audience === "teacher")
      .every(({ status }: { status: string }) => status === "scheduled")).toBe(true);
  });

  it("reserves exactly four bounded QA slots against a capacity-20 QA departure", () => {
    const dataset = readDataset();
    const departures = dataset.tours.flatMap(({ departures }: { departures: unknown[] }) => departures);
    const qaDeparture = departures.find(({ id }: { id: string }) => id === dataset.qa.slotDepartureId);

    expect(qaDeparture).toEqual(expect.objectContaining({ audience: "qa", capacity: 20, status: "scheduled" }));
    expect(dataset.qa.slots.map(({ id }: { id: string }) => id)).toEqual(["qa-01", "qa-02", "qa-03", "qa-04"]);
    expect(dataset.qa.slots.map(({ terminalFlow }: { terminalFlow: string }) => terminalFlow))
      .toEqual(["payment", "cancellation", "spare", "spare"]);
    expect(dataset.qa.slots.every(({ maxSeats }: { maxSeats: number }) => maxSeats === 2)).toBe(true);
    expect(new Set(dataset.qa.slots.flatMap((slot: Record<string, string>) => [
      slot.bookingId,
      slot.checkoutAttemptId,
      slot.checkoutIdempotencyId,
      slot.holdId,
      slot.paymentId,
      slot.cancelId,
      slot.recommendOperationId,
      slot.refineOperationId,
      slot.bookingIdempotencyKey,
      slot.paymentIdempotencyKey,
      slot.cancelIdempotencyKey,
    ])).size).toBe(44);
    expect(dataset.qa.slots.every((slot: Record<string, string>) =>
      [slot.bookingIdempotencyKey, slot.paymentIdempotencyKey, slot.cancelIdempotencyKey]
        .every((key) => key.startsWith(`thesis-demo:v2:${slot.id}:`)))).toBe(true);
  });

  it("contains no password or credential values", () => {
    const dataset = readDataset();
    const serialized = JSON.stringify(dataset);
    expect(serialized).not.toMatch(/password|service[_-]?role|access[_-]?token|secret[_-]?key|database[_-]?url/i);
  });

  it("keeps the teacher account empty while QA owns the cancellation and guide-assignment fixtures", () => {
    const dataset = readDataset();

    expect(dataset.fixtures.customerWithoutBookingAccountKey).toBe("customer-demo");
    expect(dataset.fixtures.pendingPaymentBooking).toEqual(expect.objectContaining({
      id: "d1700000-0000-4000-8000-000000000501",
      holdId: "d1700000-0000-4000-8000-000000000551",
      checkoutAttemptId: "d1700000-0000-4000-8000-000000000561",
      checkoutIdempotencyId: "d1700000-0000-4000-8000-000000000571",
      checkoutIdempotencyKey: "thesis-demo:v1:fixture:pending-payment-checkout",
      ownerAccountKey: "customer-qa",
      status: "pending_payment",
    }));
    expect(dataset.fixtures.assignedGuideBooking).toEqual(expect.objectContaining({
      id: "d1700000-0000-4000-8000-000000000502",
      holdId: "d1700000-0000-4000-8000-000000000552",
      ownerAccountKey: "customer-qa",
      status: "confirmed",
    }));
    expect(dataset.fixtures.guideAssignment).toEqual(expect.objectContaining({
      bookingId: dataset.fixtures.assignedGuideBooking.id,
      guideAccountKey: "guide-demo",
      status: "assigned",
    }));
  });
});

describe("complete inventory and stable graph comparison", () => {
  it("covers every public/private migration table plus auth.users exactly once", () => {
    const fromMigrations = new Set<string>(["auth.users"]);
    const migrationsPath = path.join(PROJECT_ROOT, "supabase", "migrations");
    for (const filename of readdirSync(migrationsPath).filter((name) => name.endsWith(".sql"))) {
      const source = readFileSync(path.join(migrationsPath, filename), "utf8");
      for (const match of source.matchAll(
        /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(public|private|auth)\.([a-z_][a-z0-9_]*)/gi,
      )) fromMigrations.add(`${match[1].toLowerCase()}.${match[2].toLowerCase()}`);
    }

    expect(listExpectedThesisDemoRelations()).toEqual([...fromMigrations].sort());
    expect(THESIS_DEMO_RELATIONS).toEqual([...fromMigrations].sort());
    expect(new Set(THESIS_DEMO_RELATIONS).size).toBe(THESIS_DEMO_RELATIONS.length);
  });

  it("builds one explicit count/classification arm for every relation without substring ownership inference", async () => {
    const expected = completeInventory();
    const statements: string[] = [];
    const query = vi.fn(async (sql: string) => {
      statements.push(sql);
      if (/information_schema\.tables/i.test(sql)) return { rows: [] };
      return {
        rows: expected.relations.map((row: {
          relation: string;
          totalRows: number;
          demoRows: number;
          baselineRows: number;
        }) => ({
          relation: row.relation,
          total_rows: row.totalRows,
          demo_rows: row.demoRows,
          baseline_rows: row.baselineRows,
        })),
      };
    });

    const inventory = await readThesisDemoInventory({
      query,
      dataset: readDataset(),
      projectRef: PROJECT_REF,
      inspectDatasetGraph: vi.fn(async () => ({ state: "empty", conflicts: [] })),
    });

    expect(inventory).toEqual(expected);
    const discoverySql = statements.find((sql) => /information_schema\.tables/i.test(sql)) ?? "";
    expect(discoverySql).toContain("table_schema IN ('public', 'private')");
    expect(discoverySql).not.toContain("table_schema IN ('public', 'private', 'auth')");
    const countSql = statements.find((sql) => /AS demo_rows/i.test(sql)) ?? "";
    for (const relation of THESIS_DEMO_RELATIONS) {
      expect(countSql).toContain(`'${relation}' AS relation`);
    }
    expect(countSql).not.toMatch(/LIKE\s+['"]%.*demo/i);
    expect(countSql).not.toMatch(/position\s*\(/i);
  });

  it("rejects crossed quota bucket hash positions while accepting each exact kind/hash pair", () => {
    const matchesQuotaBucket = (thesisDemoCloudSeed as unknown as {
      matchesThesisDemoQuotaBucket?: (
        bucket: { bucketKind: string; bucketHash: string; periodStart: string },
        reservation: { kind: string; bucketHashes: [string, string]; periodStart: string },
      ) => boolean;
    }).matchesThesisDemoQuotaBucket;
    const reservation = {
      kind: "planner",
      bucketHashes: ["ip-hash", "device-hash"] as [string, string],
      periodStart: "2026-09-05T00:00:00.000Z",
    };

    expect([
      matchesQuotaBucket?.({ bucketKind: "planner_ip", bucketHash: "ip-hash", periodStart: reservation.periodStart }, reservation),
      matchesQuotaBucket?.({ bucketKind: "planner_device", bucketHash: "device-hash", periodStart: reservation.periodStart }, reservation),
      matchesQuotaBucket?.({ bucketKind: "planner_ip", bucketHash: "device-hash", periodStart: reservation.periodStart }, reservation),
      matchesQuotaBucket?.({ bucketKind: "planner_device", bucketHash: "ip-hash", periodStart: reservation.periodStart }, reservation),
    ]).toEqual([true, true, false, false]);
  });

  it("compares full stable booking ownership and departure relationships", () => {
    const expected = createThesisDemoExpectedGraph({
      dataset: readDataset(),
      identities: stableIdentities(),
      projectRef: PROJECT_REF,
      catalogSnapshotId: "00000000-0000-4000-8000-000000000901",
      travelSnapshotId: "00000000-0000-4000-8000-000000000902",
    });
    const conflicting = structuredClone(expected);
    conflicting["public.bookings"][0].owner_user_id = "00000000-0000-4000-8000-000000000999";
    conflicting["public.bookings"][0].departure_id = readDataset().qa.soldOutDepartureId;

    expect(compareThesisDemoDatasetGraph({ expected, actual: expected }))
      .toEqual({ state: "exact", conflicts: [] });
    expect(compareThesisDemoDatasetGraph({ expected, actual: conflicting }))
      .toEqual({ state: "conflict", conflicts: ["public.bookings:content"] });
  });

  it("models a complete cancellable checkout graph for the pending-payment fixture", () => {
    const dataset = readDataset();
    const expected = createThesisDemoExpectedGraph({
      dataset,
      identities: stableIdentities(),
      projectRef: PROJECT_REF,
      catalogSnapshotId: "00000000-0000-4000-8000-000000000901",
      travelSnapshotId: "00000000-0000-4000-8000-000000000902",
    });
    const fixture = dataset.fixtures.pendingPaymentBooking;
    const booking = expected["public.bookings"].find(({ id }: { id: string }) => id === fixture.id);

    expect(expected["private.checkout_attempts"]).toEqual([
      expect.objectContaining({
        id: fixture.checkoutAttemptId,
        booking_id: fixture.id,
        status: "created",
        provider_session_id: null,
      }),
    ]);
    expect(expected["private.checkout_idempotency"]).toEqual([
      expect.objectContaining({
        id: fixture.checkoutIdempotencyId,
        idempotency_key: fixture.checkoutIdempotencyKey,
        booking_id: fixture.id,
        checkout_attempt_id: fixture.checkoutAttemptId,
        canonical_request_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    ]);
    expect(booking.hold_expires_at).toBe(
      dataset.tours.flatMap(({ departures }: { departures: Array<{ id: string; startAt: string }> }) => departures)
        .find(({ id }: { id: string }) => id === fixture.departureId)?.startAt.replace(".000Z", "+00:00"),
    );
  });

  it("hardens the guide-assignment transition guard against an absent setting", () => {
    const migration = readFileSync(
      path.join(PROJECT_ROOT, "supabase", "migrations", "20260905140000_thesis_demo_manifest.sql"),
      "utf8",
    );

    expect(migration).toMatch(
      /current_setting\('localens\.guide_assignment_transition', true\)\s+IS DISTINCT FROM\s+'on'/i,
    );
  });
});

function validSeedOptions(overrides: Record<string, unknown> = {}) {
  return {
    mode: "dry-run",
    confirmation: "localens-thesis-demo",
    expectedProjectRef: PROJECT_REF,
    expectedOrganizationId: ORGANIZATION_ID,
    runtimeUrl: `https://${PROJECT_REF}.supabase.co`,
    databaseUrl: DATABASE_URL,
    serviceRoleKey: SERVICE_ROLE_KEY,
    passwords: PASSWORDS,
    dataset: readDataset(),
    ...overrides,
  };
}

function createSeedHarness({ marker = null }: { marker?: Record<string, string> | null } = {}) {
  const authUsers = new Map<string, { id: string; email: string }>();
  let nextUser = 1;
  const dependencies = {
    readSelectedProject: vi.fn(async () => validTarget().selectedProject),
    readDashboardConnection: vi.fn(async () => validTarget().dashboardConnection),
    readDatabaseConnection: vi.fn(async () => validTarget().databaseConnection),
    readInventory: vi.fn(async () => marker
      ? completeInventory({
          graphState: marker.datasetVersion === "thesis-demo.v1" ? "upgrade-v1" : "exact",
          authDemoRows: 4,
        })
      : authUsers.size > 0
        ? completeInventory({ graphState: "auth-recovery", authDemoRows: authUsers.size })
        : completeInventory()),
    readMarker: vi.fn(async () => marker),
    runDryRunTransaction: vi.fn(async () => ({ schemaVerified: true, authPostcondition: "DEFERRED_UNTIL_APPLY" })),
    listAuthUsers: vi.fn(async () => [...authUsers.values()]),
    createAuthUser: vi.fn(async ({ email }: { email: string }) => {
      const user = {
        id: `00000000-0000-4000-8000-${String(nextUser).padStart(12, "0")}`,
        email,
      };
      nextUser += 1;
      authUsers.set(email, user);
      return user;
    }),
    runApplyTransaction: vi.fn(async ({ identities }: { identities: Array<{ userId: string }> }) => ({
      accountCount: identities.length,
      placeCount: 12,
      tourCount: 3,
      departureCount: 5,
      markerCount: 1,
    })),
  };
  return { dependencies, authUsers };
}

function everyDependencyWasIdle(dependencies: Record<string, ReturnType<typeof vi.fn>>) {
  return Object.values(dependencies).every((dependency) => dependency.mock.calls.length === 0);
}

describe("runThesisDemoSeed", () => {
  it.each([
    ["confirmation", undefined, "THESIS_DEMO_CONFIRM_REQUIRED"],
    ["databaseUrl", undefined, "THESIS_DEMO_DATABASE_URL_REQUIRED"],
    ["serviceRoleKey", undefined, "THESIS_DEMO_SERVICE_KEY_REQUIRED"],
    ["expectedProjectRef", undefined, "THESIS_DEMO_PROJECT_REQUIRED"],
    ["expectedOrganizationId", undefined, "THESIS_DEMO_ORGANIZATION_REQUIRED"],
    ["runtimeUrl", undefined, "THESIS_DEMO_RUNTIME_URL_REQUIRED"],
    ["passwords", { ...PASSWORDS, customer: "" }, "THESIS_DEMO_PASSWORDS_REQUIRED"],
    ["passwords", { ...PASSWORDS, guide: "" }, "THESIS_DEMO_PASSWORDS_REQUIRED"],
    ["passwords", { ...PASSWORDS, admin: "" }, "THESIS_DEMO_PASSWORDS_REQUIRED"],
    ["passwords", { ...PASSWORDS, qaCustomer: "" }, "THESIS_DEMO_PASSWORDS_REQUIRED"],
  ])("rejects the %s guard before any dependency can read or mutate state", async (field, value, code) => {
    const { dependencies } = createSeedHarness();

    await expect(runThesisDemoSeed(validSeedOptions({ [field]: value }), dependencies))
      .rejects.toMatchObject({ code });
    expect(everyDependencyWasIdle(dependencies)).toBe(true);
  });

  it("performs an entirely read-only dry-run and defers Auth-dependent postconditions", async () => {
    const { dependencies } = createSeedHarness();
    const logs: string[] = [];

    const result = await runThesisDemoSeed(
      validSeedOptions({ logger: (message: string) => logs.push(message) }),
      dependencies,
    );

    expect(result).toEqual(expect.objectContaining({
      mode: "dry-run",
      targetMode: "bootstrap-unseeded",
      authPostcondition: "DEFERRED_UNTIL_APPLY",
      accountCount: 4,
      placeCount: 12,
      tourCount: 3,
    }));
    expect(dependencies.readSelectedProject).toHaveBeenCalledTimes(1);
    expect(dependencies.readDashboardConnection).toHaveBeenCalledTimes(1);
    expect(dependencies.readDatabaseConnection).toHaveBeenCalledTimes(1);
    expect(dependencies.readInventory).toHaveBeenCalledTimes(1);
    expect(dependencies.readMarker).toHaveBeenCalledTimes(1);
    expect(dependencies.runDryRunTransaction).toHaveBeenCalledTimes(1);
    expect(dependencies.listAuthUsers).not.toHaveBeenCalled();
    expect(dependencies.createAuthUser).not.toHaveBeenCalled();
    expect(dependencies.runApplyTransaction).not.toHaveBeenCalled();
    for (const secret of [SERVICE_ROLE_KEY, DATABASE_URL, ...Object.values(PASSWORDS)]) {
      expect(logs.join("\n")).not.toContain(secret);
    }
  });

  it("refuses mismatched independent evidence before Auth or apply mutation", async () => {
    const { dependencies } = createSeedHarness();
    dependencies.readDatabaseConnection.mockResolvedValueOnce({
      ...validTarget().databaseConnection,
      username: "postgres.differentproject",
    });

    await expect(runThesisDemoSeed(validSeedOptions({ mode: "apply" }), dependencies))
      .rejects.toMatchObject({ code: "CONNECTION_MISMATCH" });
    expect(dependencies.listAuthUsers).not.toHaveBeenCalled();
    expect(dependencies.createAuthUser).not.toHaveBeenCalled();
    expect(dependencies.runApplyTransaction).not.toHaveBeenCalled();
  });

  it("reuses stable Auth identities without resetting credentials and creates only missing accounts", async () => {
    const { dependencies, authUsers } = createSeedHarness();
    authUsers.set("customer.demo@localens.invalid", {
      id: "00000000-0000-4000-8000-000000000091",
      email: "customer.demo@localens.invalid",
    });

    const result = await runThesisDemoSeed(validSeedOptions({ mode: "apply" }), dependencies);

    expect(result).toEqual(expect.objectContaining({ mode: "apply", accountCount: 4, createdAuthCount: 3 }));
    expect(dependencies.createAuthUser).toHaveBeenCalledTimes(3);
    expect(dependencies.createAuthUser).not.toHaveBeenCalledWith(expect.objectContaining({
      email: "customer.demo@localens.invalid",
    }));
    expect(dependencies.runApplyTransaction).toHaveBeenCalledWith(expect.objectContaining({
      identities: expect.arrayContaining([
        expect.objectContaining({
          email: "customer.demo@localens.invalid",
          userId: "00000000-0000-4000-8000-000000000091",
          seedStatus: "reused",
        }),
      ]),
    }));
  });

  it("leaves partial Auth success recoverable and completes on a rerun", async () => {
    const { dependencies, authUsers } = createSeedHarness();
    dependencies.createAuthUser.mockImplementationOnce(async ({ email }: { email: string }) => {
      const user = { id: "00000000-0000-4000-8000-000000000081", email };
      authUsers.set(email, user);
      return user;
    }).mockRejectedValueOnce(new Error(`${SERVICE_ROLE_KEY} ${PASSWORDS.guide}`));

    const firstError = await runThesisDemoSeed(validSeedOptions({ mode: "apply" }), dependencies)
      .catch((error: unknown) => error as Error & { code?: string; recoverable?: boolean });
    expect(firstError).toMatchObject({ code: "THESIS_DEMO_AUTH_FAILED", recoverable: true });
    expect(firstError.message).not.toContain(SERVICE_ROLE_KEY);
    expect(firstError.message).not.toContain(PASSWORDS.guide);
    expect(dependencies.runApplyTransaction).not.toHaveBeenCalled();
    expect(authUsers.size).toBe(1);

    dependencies.createAuthUser.mockImplementation(async ({ email }: { email: string }) => {
      const user = {
        id: `00000000-0000-4000-8000-${String(authUsers.size + 82).padStart(12, "0")}`,
        email,
      };
      authUsers.set(email, user);
      return user;
    });
    const second = await runThesisDemoSeed(validSeedOptions({ mode: "apply" }), dependencies);

    expect(second).toEqual(expect.objectContaining({ accountCount: 4 }));
    expect(authUsers.size).toBe(4);
    expect(dependencies.runApplyTransaction).toHaveBeenCalledTimes(1);
  });

  it("keeps Auth users after a database failure so the next run can reuse them", async () => {
    const { dependencies, authUsers } = createSeedHarness();
    dependencies.runApplyTransaction.mockRejectedValueOnce(new Error(`${DATABASE_URL} ${PASSWORDS.admin}`));

    const firstError = await runThesisDemoSeed(validSeedOptions({ mode: "apply" }), dependencies)
      .catch((error: unknown) => error as Error & { code?: string; recoverable?: boolean });
    expect(firstError).toMatchObject({ code: "THESIS_DEMO_DATABASE_FAILED", recoverable: true });
    expect(firstError.message).not.toContain(DATABASE_URL);
    expect(firstError.message).not.toContain(PASSWORDS.admin);
    expect(authUsers.size).toBe(4);

    const second = await runThesisDemoSeed(validSeedOptions({ mode: "apply" }), dependencies);

    expect(second).toEqual(expect.objectContaining({ accountCount: 4, createdAuthCount: 0 }));
    expect(dependencies.createAuthUser).toHaveBeenCalledTimes(4);
    expect(dependencies.runApplyTransaction).toHaveBeenCalledTimes(2);
  });

  it("does not expose dependency errors or credentials through the logger", async () => {
    const { dependencies } = createSeedHarness();
    const logger = vi.fn();
    dependencies.readMarker.mockRejectedValueOnce(new Error(`${SERVICE_ROLE_KEY} ${DATABASE_URL}`));

    const cause = await runThesisDemoSeed(validSeedOptions({ logger }), dependencies)
      .catch((error: unknown) => error as Error & { code?: string });

    expect(cause.code).toBe("THESIS_DEMO_PREFLIGHT_FAILED");
    expect(cause.message).toBe("THESIS_DEMO_PREFLIGHT_FAILED: verified target preflight failed");
    expect(logger).not.toHaveBeenCalledWith(expect.stringContaining(SERVICE_ROLE_KEY));
    expect(logger).not.toHaveBeenCalledWith(expect.stringContaining(DATABASE_URL));
  });
});

function stableIdentities() {
  return readDataset().accounts.map((account: Record<string, string>, index: number) => ({
    ...account,
    userId: `00000000-0000-4000-8000-${String(index + 51).padStart(12, "0")}`,
    seedStatus: "created",
  }));
}

function createTransactionQuery({
  failOn,
  initialGraphState = "auth-recovery",
  postGraphState = "exact",
  graphConflicts = [],
}: {
  failOn?: RegExp;
  initialGraphState?: "empty" | "auth-recovery" | "upgrade-v1" | "exact" | "conflict";
  postGraphState?: "empty" | "auth-recovery" | "upgrade-v1" | "exact" | "conflict";
  graphConflicts?: string[];
} = {}) {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const inspectDatasetGraph = vi.fn()
    .mockResolvedValueOnce({ state: initialGraphState, conflicts: graphConflicts })
    .mockResolvedValue({ state: postGraphState, conflicts: graphConflicts });
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    statements.push({ sql, values });
    if (failOn?.test(sql)) throw new Error(`${SERVICE_ROLE_KEY} ${DATABASE_URL}`);
    if (/private\.create_catalog_snapshot\(\)/i.test(sql)) {
      return { rows: [{ catalog_snapshot_id: "00000000-0000-4000-8000-000000000901" }] };
    }
    if (/private\.create_travel_snapshot\(\)/i.test(sql)) {
      return { rows: [{ travel_snapshot_id: "00000000-0000-4000-8000-000000000902" }] };
    }
    if (/FROM public\.travel_snapshots/i.test(sql)) {
      return { rows: [{ travel_snapshot_id: "00000000-0000-4000-8000-000000000902" }] };
    }
    if (/to_regclass\('private\.thesis_demo_manifest'\)/i.test(sql)) {
      return { rows: [{
        marker_table: "private.thesis_demo_manifest",
        qa_slots_table: "private.thesis_demo_qa_slots",
      }] };
    }
    return { rows: [], rowCount: 1 };
  });
  return { query, statements, inspectDatasetGraph };
}

describe("thesis demo database transactions", () => {
  it("keeps dry-run read-only and always rolls it back", async () => {
    const database = createTransactionQuery();

    const result = await runThesisDemoDryRunTransaction({
      query: database.query,
      dataset: readDataset(),
    });

    expect(result).toEqual({ schemaVerified: true, authPostcondition: "DEFERRED_UNTIL_APPLY" });
    expect(database.statements[0]?.sql).toBe("BEGIN READ ONLY");
    expect(database.statements[1]?.sql).toMatch(/SET LOCAL statement_timeout/i);
    expect(database.statements.at(-1)?.sql).toBe("ROLLBACK");
    const sql = database.statements.map(({ sql }) => sql).join("\n");
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP)\b/i);
  });

  it("rolls back a failed dry-run without exposing the dependency error", async () => {
    const database = createTransactionQuery({ failOn: /to_regclass/i });

    const cause = await runThesisDemoDryRunTransaction({ query: database.query, dataset: readDataset() })
      .catch((error: unknown) => error as Error & { code?: string });

    expect(cause.code).toBe("THESIS_DEMO_DRY_RUN_FAILED");
    expect(cause.message).not.toContain(SERVICE_ROLE_KEY);
    expect(cause.message).not.toContain(DATABASE_URL);
    expect(database.statements.at(-1)?.sql).toBe("ROLLBACK");
  });

  it("applies stable IDs and the marker in one bounded transaction", async () => {
    const database = createTransactionQuery();

    const result = await runThesisDemoApplyTransaction({
      query: database.query,
      dataset: readDataset(),
      projectRef: PROJECT_REF,
      identities: stableIdentities(),
      inspectDatasetGraph: database.inspectDatasetGraph,
    });

    expect(result).toEqual({
      accountCount: 4,
      placeCount: 12,
      tourCount: 3,
      departureCount: 5,
      bookingCount: 2,
      assignmentCount: 1,
      markerCount: 1,
    });
    expect(database.statements[0]?.sql).toBe("BEGIN");
    expect(database.statements[1]?.sql).toMatch(/SET LOCAL statement_timeout/i);
    expect(database.statements.at(-1)?.sql).toBe("COMMIT");
    const sql = database.statements.map(({ sql }) => sql).join("\n");
    for (const relation of [
      "private.user_roles",
      "public.profiles",
      "public.guide_profiles",
      "public.areas",
      "public.area_translations",
      "public.places",
      "public.place_translations",
      "public.place_experience_types",
      "public.place_guide_languages",
      "public.place_supports",
      "public.place_opening_hours",
      "public.travel_edges",
      "public.tours",
      "public.tour_translations",
      "public.tour_versions",
      "public.tour_version_translations",
      "public.tour_version_stops",
      "public.departures",
      "public.bookings",
      "private.capacity_holds",
      "private.checkout_attempts",
      "private.checkout_idempotency",
      "private.thesis_demo_qa_slots",
      "public.guide_assignments",
      "private.thesis_demo_manifest",
    ]) expect(sql).toContain(relation);
    expect(sql).toContain("private.create_catalog_snapshot()");
    expect(sql).toContain("private.create_travel_snapshot()");
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(database.inspectDatasetGraph).toHaveBeenCalledTimes(2);
    expect(database.statements.every(({ sql: statement }) =>
      statement.split(";").filter((part) => part.trim().length > 0).length <= 1)).toBe(true);
    for (const statement of database.statements) {
      const positions = [...new Set([...statement.sql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1])))]
        .sort((left, right) => left - right);
      expect(positions).toEqual(Array.from({ length: positions.length }, (_, index) => index + 1));
      expect(statement.values).toHaveLength(positions.length);
    }
  });

  it("upgrades only an exact v1 graph by inserting registry metadata and advancing the marker atomically", async () => {
    const database = createTransactionQuery({ initialGraphState: "upgrade-v1" });
    const readInventory = vi.fn(async () => readInventoryFixture(completeInventory({
      graphState: "upgrade-v1",
      authDemoRows: 4,
    })));

    await runThesisDemoApplyTransaction({
      query: database.query,
      dataset: readDataset(),
      projectRef: PROJECT_REF,
      identities: stableIdentities(),
      inspectDatasetGraph: database.inspectDatasetGraph,
      readInventory,
    });

    expect(database.statements[0]?.sql).toBe("BEGIN");
    expect(database.statements.at(-1)?.sql).toBe("COMMIT");
    const mutations = database.statements.filter(({ sql }) =>
      /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(sql));
    expect(mutations).toHaveLength(2);
    expect(mutations[0]?.sql).toMatch(/INSERT INTO private\.thesis_demo_qa_slots/i);
    expect(JSON.parse(mutations[0]?.values[0] as string)).toHaveLength(4);
    expect(mutations[1]?.sql).toMatch(
      /UPDATE private\.thesis_demo_manifest[\s\S]+dataset_version = \$1[\s\S]+dataset_version = \$2[\s\S]+RETURNING/i,
    );
    expect(mutations[1]?.values).toEqual([
      "thesis-demo.v2",
      "thesis-demo.v1",
      PROJECT_REF,
      "2026-09-05",
    ]);
    expect(database.inspectDatasetGraph).toHaveBeenCalledTimes(2);
    expect(readInventory).toHaveBeenCalledTimes(1);
  });

  it("rolls back a v1 upgrade when the in-transaction inventory contains a classified v2 lifecycle row", async () => {
    const database = createTransactionQuery({ initialGraphState: "upgrade-v1" });
    const readInventory = vi.fn(async () => readInventoryFixture(completeInventory({
      graphState: "upgrade-v1",
      authDemoRows: 4,
      relationOverrides: {
        "private.runtime_planner_operations": { totalRows: 1, demoRows: 1 },
      },
    })));

    const cause = await runThesisDemoApplyTransaction({
      query: database.query,
      dataset: readDataset(),
      projectRef: PROJECT_REF,
      identities: stableIdentities(),
      inspectDatasetGraph: database.inspectDatasetGraph,
      readInventory,
    }).catch((error: unknown) => error as Error & { code?: string });

    expect(cause.code).toBe("THESIS_DEMO_DATABASE_FAILED");
    expect(database.statements.at(-1)?.sql).toBe("ROLLBACK");
    expect(database.statements.some(({ sql }) => /INSERT INTO private\.thesis_demo_qa_slots/i.test(sql)))
      .toBe(false);
  });

  it("never pre-creates slot-owned booking, payment, cancellation, hold, checkout, or planner rows", async () => {
    const database = createTransactionQuery();
    const dataset = readDataset();

    await runThesisDemoApplyTransaction({
      query: database.query,
      dataset,
      projectRef: PROJECT_REF,
      identities: stableIdentities(),
      inspectDatasetGraph: database.inspectDatasetGraph,
    });

    const registryStatement = database.statements.find(({ sql }) =>
      /INSERT INTO private\.thesis_demo_qa_slots/i.test(sql));
    for (const slot of dataset.qa.slots) {
      for (const value of [
        slot.bookingId,
        slot.checkoutAttemptId,
        slot.checkoutIdempotencyId,
        slot.holdId,
        slot.paymentId,
        slot.cancelId,
        slot.recommendOperationId,
        slot.refineOperationId,
      ]) {
        expect(registryStatement?.values).toContainEqual(expect.stringContaining(value));
      }
    }
    const lifecycleStatements = database.statements.filter(({ sql }) =>
      /INSERT INTO (?:public\.bookings|private\.(?:capacity_holds|checkout_attempts|checkout_idempotency|simulated_payment_receipts|booking_cancellations|runtime_planner_operations)|public\.(?:trip_plans|trip_plan_revisions|trip_plan_items))/i.test(sql));
    expect(lifecycleStatements).toHaveLength(4);
    const lifecycleValues = JSON.stringify(lifecycleStatements.map(({ values }) => values));
    expect(dataset.qa.slots.every((slot: Record<string, string>) =>
      !lifecycleValues.includes(slot.bookingId))).toBe(true);
  });

  it("inserts every departure as scheduled, then transitions only the dedicated QA departure under the tour owner", async () => {
    const database = createTransactionQuery();
    const dataset = readDataset();

    await runThesisDemoApplyTransaction({
      query: database.query,
      dataset,
      projectRef: PROJECT_REF,
      identities: stableIdentities(),
      inspectDatasetGraph: database.inspectDatasetGraph,
    });

    const departureInsertIndex = database.statements.findIndex(({ sql }) =>
      /INSERT INTO public\.departures/i.test(sql));
    const transitionIndex = database.statements.findIndex(({ sql }) =>
      /UPDATE public\.departures[\s\S]+sold_out/i.test(sql));
    const ownerIndex = database.statements.findIndex(({ sql }) =>
      sql === "SET LOCAL ROLE localens_tour_rpc_owner");
    const resetIndex = database.statements.findIndex(({ sql }, index) =>
      index > ownerIndex && sql === "RESET ROLE");

    expect(ownerIndex).toBeGreaterThanOrEqual(0);
    expect(ownerIndex).toBeLessThan(departureInsertIndex);
    expect(departureInsertIndex).toBeLessThan(transitionIndex);
    expect(transitionIndex).toBeLessThan(resetIndex);
    const inserted = JSON.parse(database.statements[departureInsertIndex].values[0] as string);
    expect(inserted).toHaveLength(5);
    expect(inserted.every(({ status }: { status: string }) => status === "scheduled")).toBe(true);
    expect(database.statements[transitionIndex].values).toEqual([dataset.qa.soldOutDepartureId]);
  });

  it("inserts the guide assignment only under its narrow RPC owner and explicit transition", async () => {
    const database = createTransactionQuery();

    await runThesisDemoApplyTransaction({
      query: database.query,
      dataset: readDataset(),
      projectRef: PROJECT_REF,
      identities: stableIdentities(),
      inspectDatasetGraph: database.inspectDatasetGraph,
    });

    const assignmentIndex = database.statements.findIndex(({ sql }) =>
      /INSERT INTO public\.guide_assignments/i.test(sql));
    expect(assignmentIndex).toBeGreaterThan(0);
    expect(database.statements[assignmentIndex - 2]?.sql).toBe("SET LOCAL ROLE localens_guide_assignment_rpc_owner");
    expect(database.statements[assignmentIndex - 1]?.sql).toMatch(
      /set_config\('localens\.guide_assignment_transition', 'on', true\)/i,
    );
    expect(database.statements[assignmentIndex + 1]?.sql).toMatch(
      /set_config\('localens\.guide_assignment_transition', 'off', true\)/i,
    );
    expect(database.statements[assignmentIndex + 2]?.sql).toBe("RESET ROLE");
  });

  it("converges Auth-trigger defaults to the exact requested profile and role graph", async () => {
    const database = createTransactionQuery();

    await runThesisDemoApplyTransaction({
      query: database.query,
      dataset: readDataset(),
      projectRef: PROJECT_REF,
      identities: stableIdentities(),
      inspectDatasetGraph: database.inspectDatasetGraph,
    });

    const sql = database.statements.map(({ sql }) => sql).join("\n");
    expect(sql).toMatch(/DELETE FROM private\.user_roles[\s\S]+existing\.role <> identities\.role/i);
    expect(sql).toMatch(/INSERT INTO public\.profiles[\s\S]+ON CONFLICT \(id\) DO UPDATE[\s\S]+display_name = EXCLUDED\.display_name[\s\S]+language = EXCLUDED\.language/i);
  });

  it("refuses a partial or conflicting stable graph before the first database mutation", async () => {
    for (const conflict of ["public.tour_version_stops:partial", "public.bookings:content"]) {
      const database = createTransactionQuery({
        initialGraphState: "conflict",
        graphConflicts: [conflict],
      });

      await expect(runThesisDemoApplyTransaction({
        query: database.query,
        dataset: readDataset(),
        projectRef: PROJECT_REF,
        identities: stableIdentities(),
        inspectDatasetGraph: database.inspectDatasetGraph,
      })).rejects.toMatchObject({ code: "THESIS_DEMO_DATABASE_FAILED" });

      const mutationSql = database.statements
        .map(({ sql }) => sql)
        .filter((sql) => /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(sql));
      expect(mutationSql).toEqual([]);
      expect(database.statements.at(-1)?.sql).toBe("ROLLBACK");
    }
  });

  it("reuses the same snapshot graph on rerun instead of creating duplicates", async () => {
    const database = createTransactionQuery({
      initialGraphState: "exact",
    });

    const first = await runThesisDemoApplyTransaction({
      query: database.query,
      dataset: readDataset(),
      projectRef: PROJECT_REF,
      identities: stableIdentities(),
      inspectDatasetGraph: database.inspectDatasetGraph,
    });
    const second = await runThesisDemoApplyTransaction({
      query: database.query,
      dataset: readDataset(),
      projectRef: PROJECT_REF,
      identities: stableIdentities(),
      inspectDatasetGraph: database.inspectDatasetGraph,
    });

    expect(second).toEqual(first);
    const sql = database.statements.map(({ sql }) => sql).join("\n");
    expect(sql).not.toContain("private.create_catalog_snapshot()");
    expect(sql).not.toContain("private.create_travel_snapshot()");
    expect(sql).not.toMatch(/INSERT INTO public\.(?:tour_translations|tour_versions|tour_version_translations|tour_version_stops|departures)/i);
  });

  it("rolls back every database write when a statement or postcondition fails", async () => {
    for (const options of [
      { failOn: /private\.thesis_demo_manifest/i },
      { postGraphState: "conflict" as const, graphConflicts: ["public.bookings:content"] },
    ]) {
      const database = createTransactionQuery(options);
      const cause = await runThesisDemoApplyTransaction({
        query: database.query,
        dataset: readDataset(),
        projectRef: PROJECT_REF,
        identities: stableIdentities(),
        inspectDatasetGraph: database.inspectDatasetGraph,
      }).catch((error: unknown) => error as Error & { code?: string });

      expect(cause.code).toBe("THESIS_DEMO_DATABASE_FAILED");
      expect(cause.message).not.toContain(SERVICE_ROLE_KEY);
      expect(database.statements.some(({ sql }) => sql === "COMMIT")).toBe(false);
      expect(database.statements.at(-1)?.sql).toBe("ROLLBACK");
    }
  });
});

describe("thesis demo cloud CLI boundary", () => {
  it.each([undefined, "", "true", "apply", "yes", " 1"])(
    "fails closed before opening clients when the dry-run selector is invalid: %o",
    async (dryRunSelector) => {
      const createRuntime = vi.fn();
      const env = {
        LOCALLENS_THESIS_DEMO_SEED_CONFIRM: "localens-thesis-demo",
        LOCALLENS_THESIS_DEMO_SEED_DRY_RUN: dryRunSelector,
        LOCALLENS_THESIS_DEMO_DB_URL: DATABASE_URL,
        LOCALLENS_THESIS_DEMO_EXPECTED_PROJECT_REF: PROJECT_REF,
        LOCALLENS_THESIS_DEMO_EXPECTED_ORGANIZATION_ID: ORGANIZATION_ID,
        LOCALLENS_THESIS_DEMO_SELECTED_PROJECT_FILE: "C:\\secure\\selected-project.json",
        LOCALLENS_THESIS_DEMO_DASHBOARD_CONNECTION_FILE: "C:\\secure\\dashboard-connection.json",
        NEXT_PUBLIC_SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
        SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
        LOCALLENS_DEMO_CUSTOMER_PASSWORD: PASSWORDS.customer,
        LOCALLENS_DEMO_GUIDE_PASSWORD: PASSWORDS.guide,
        LOCALLENS_DEMO_ADMIN_PASSWORD: PASSWORDS.admin,
        LOCALLENS_DEMO_QA_CUSTOMER_PASSWORD: PASSWORDS.qaCustomer,
      };

      await expect(runThesisDemoCloudCli({ env, createRuntime })).rejects.toMatchObject({
        code: "THESIS_DEMO_ENV_REQUIRED",
      });
      expect(createRuntime).not.toHaveBeenCalled();
    },
  );

  it("requires two explicit verified metadata files and never derives them from URLs", () => {
    const readJsonFile = vi.fn();

    expect(() => loadControllerMetadata({
      selectedProjectPath: undefined,
      dashboardConnectionPath: undefined,
      readJsonFile,
    })).toThrow(expect.objectContaining({ code: "THESIS_DEMO_METADATA_REQUIRED" }));
    expect(readJsonFile).not.toHaveBeenCalled();
  });

  it("accepts only controller metadata with independent source attestations", () => {
    const readJsonFile = vi.fn((filePath: string) => {
      if (filePath === "C:\\secure\\selected-project.json") {
        return {
          source: "supabase-cli-projects-list",
          verified: true,
          project: validTarget().selectedProject,
        };
      }
      return {
        source: "supabase-dashboard-connection-panel",
        verified: true,
        connection: validTarget().dashboardConnection,
      };
    });

    expect(loadControllerMetadata({
      selectedProjectPath: "C:\\secure\\selected-project.json",
      dashboardConnectionPath: "C:\\secure\\dashboard-connection.json",
      readJsonFile,
    })).toEqual({
      selectedProject: validTarget().selectedProject,
      dashboardConnection: validTarget().dashboardConnection,
    });

    readJsonFile.mockReturnValueOnce({
      source: "connection-string-parser",
      verified: true,
      project: validTarget().selectedProject,
    });
    expect(() => loadControllerMetadata({
      selectedProjectPath: "C:\\secure\\selected-project.json",
      dashboardConnectionPath: "C:\\secure\\dashboard-connection.json",
      readJsonFile,
    })).toThrow(expect.objectContaining({ code: "THESIS_DEMO_METADATA_INVALID" }));
  });

  it("maps environment input into the injected orchestration without opening real clients", async () => {
    const { dependencies } = createSeedHarness();
    const close = vi.fn(async () => {});
    const createRuntime = vi.fn(() => ({ dependencies, close }));
    const readJsonFile = vi.fn((filePath: string) => filePath.endsWith("selected-project.json")
      ? { source: "supabase-cli-projects-list", verified: true, project: validTarget().selectedProject }
      : { source: "supabase-management-api", verified: true, connection: validTarget().dashboardConnection });
    const env = {
      LOCALLENS_THESIS_DEMO_SEED_CONFIRM: "localens-thesis-demo",
      LOCALLENS_THESIS_DEMO_SEED_DRY_RUN: "1",
      LOCALLENS_THESIS_DEMO_DB_URL: DATABASE_URL,
      LOCALLENS_THESIS_DEMO_EXPECTED_PROJECT_REF: PROJECT_REF,
      LOCALLENS_THESIS_DEMO_EXPECTED_ORGANIZATION_ID: ORGANIZATION_ID,
      LOCALLENS_THESIS_DEMO_SELECTED_PROJECT_FILE: "C:\\secure\\selected-project.json",
      LOCALLENS_THESIS_DEMO_DASHBOARD_CONNECTION_FILE: "C:\\secure\\dashboard-connection.json",
      NEXT_PUBLIC_SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
      LOCALLENS_DEMO_CUSTOMER_PASSWORD: PASSWORDS.customer,
      LOCALLENS_DEMO_GUIDE_PASSWORD: PASSWORDS.guide,
      LOCALLENS_DEMO_ADMIN_PASSWORD: PASSWORDS.admin,
      LOCALLENS_DEMO_QA_CUSTOMER_PASSWORD: PASSWORDS.qaCustomer,
    };

    const result = await runThesisDemoCloudCli({ env, readJsonFile, createRuntime });

    expect(result).toEqual(expect.objectContaining({ mode: "dry-run", accountCount: 4 }));
    expect(createRuntime).toHaveBeenCalledWith(expect.objectContaining({
      databaseUrl: DATABASE_URL,
      serviceRoleKey: SERVICE_ROLE_KEY,
      selectedProject: validTarget().selectedProject,
      dashboardConnection: validTarget().dashboardConnection,
    }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("requires an explicit zero selector before mapping the CLI boundary to apply", async () => {
    const { dependencies } = createSeedHarness();
    const close = vi.fn(async () => {});
    const createRuntime = vi.fn(() => ({ dependencies, close }));
    const readJsonFile = vi.fn((filePath: string) => filePath.endsWith("selected-project.json")
      ? { source: "supabase-cli-projects-list", verified: true, project: validTarget().selectedProject }
      : { source: "supabase-management-api", verified: true, connection: validTarget().dashboardConnection });
    const env = {
      LOCALLENS_THESIS_DEMO_SEED_CONFIRM: "localens-thesis-demo",
      LOCALLENS_THESIS_DEMO_SEED_DRY_RUN: "0",
      LOCALLENS_THESIS_DEMO_DB_URL: DATABASE_URL,
      LOCALLENS_THESIS_DEMO_EXPECTED_PROJECT_REF: PROJECT_REF,
      LOCALLENS_THESIS_DEMO_EXPECTED_ORGANIZATION_ID: ORGANIZATION_ID,
      LOCALLENS_THESIS_DEMO_SELECTED_PROJECT_FILE: "C:\\secure\\selected-project.json",
      LOCALLENS_THESIS_DEMO_DASHBOARD_CONNECTION_FILE: "C:\\secure\\dashboard-connection.json",
      NEXT_PUBLIC_SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
      LOCALLENS_DEMO_CUSTOMER_PASSWORD: PASSWORDS.customer,
      LOCALLENS_DEMO_GUIDE_PASSWORD: PASSWORDS.guide,
      LOCALLENS_DEMO_ADMIN_PASSWORD: PASSWORDS.admin,
      LOCALLENS_DEMO_QA_CUSTOMER_PASSWORD: PASSWORDS.qaCustomer,
    };

    const result = await runThesisDemoCloudCli({ env, readJsonFile, createRuntime });

    expect(result).toEqual(expect.objectContaining({ mode: "apply", accountCount: 4 }));
    expect(dependencies.runApplyTransaction).toHaveBeenCalledTimes(1);
    expect(dependencies.runDryRunTransaction).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("returns a stable redacted main-process failure", async () => {
    const errorLogger = vi.fn();
    const exitCode = await runThesisDemoCloudMain({
      run: async () => { throw new Error(`${SERVICE_ROLE_KEY} ${DATABASE_URL} ${PASSWORDS.qaCustomer}`); },
      errorLogger,
    });

    expect(exitCode).toBe(2);
    expect(errorLogger).toHaveBeenCalledWith("THESIS_DEMO_SEED_FAILED: thesis-demo seed did not complete");
  });
});
