// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// @ts-expect-error The executable JavaScript fixture boundary is covered here.
import {
  E19_ASSIGNMENT_IDEMPOTENCY_KEY,
  E19_FIXTURE_VERSION,
  planE19AssignmentFixture,
  runE19AssignmentFixture,
  validateE19ConnectionTarget,
  validateE19AssignmentManifest,
} from "@/scripts/seed-thesis-demo-e19-assignment.mjs";

type QueryCall = { sql: string; values: unknown[] };
type QueryResult = { rows: Record<string, unknown>[] };

const repoRoot = process.cwd();
const manifest = JSON.parse(
  readFileSync(join(repoRoot, "data", "demo", "thesis-demo.e19-assignment.v1.json"), "utf8"),
);

const ownerId = "d1700000-0000-4000-8000-00000000aa01";
const guideId = "d1700000-0000-4000-8000-00000000aa02";
const adminId = "d1700000-0000-4000-8000-00000000aa03";
const catalogSnapshotId = "d1700000-0000-4000-8000-00000000bb01";
const travelSnapshotId = "d1700000-0000-4000-8000-00000000bb02";

const marker = {
  environment: "thesis-demo",
  dataset_version: "thesis-demo.v2",
  seed_base_date: "2026-09-05",
};

const sourceBooking = {
  id: manifest.sourceBookingId,
  owner_user_id: ownerId,
  owner_email: manifest.ownerEmail,
  source_kind: "departure",
  source_id: manifest.sourceDepartureId,
  departure_id: manifest.sourceDepartureId,
  quote_id: null,
  status: "confirmed",
  tour_version_id: manifest.sourceTourVersionId,
  title_en: "Synthetic assignment tour",
  title_vi: "Tour phân công mô phỏng",
  cancellation_policy: "Synthetic demo policy",
  catalog_snapshot_id: catalogSnapshotId,
  travel_snapshot_id: travelSnapshotId,
  fx_snapshot_id: null,
  fx_vnd_per_usd: null,
  per_person_vnd_minor: "250000",
  total_vnd_minor: "250000",
  checkout_currency: "vnd",
  checkout_amount_minor: "250000",
  party_size: 1,
  language: "en",
  meeting_point: "Synthetic meeting point",
  hold_duration_seconds: 2100,
  created_at: "2026-09-12T06:25:00.000Z",
  hold_expires_at: "2026-09-12T07:00:00.000Z",
};

const sourceDeparture = {
  id: manifest.sourceDepartureId,
  tour_version_id: manifest.sourceTourVersionId,
  start_at: "2026-09-12T07:00:00.000Z",
  end_at: "2026-09-12T10:00:00.000Z",
  status: "scheduled",
  capacity: 12,
};

const sourceHold = {
  id: manifest.sourceHoldId,
  booking_id: manifest.sourceBookingId,
  departure_id: manifest.sourceDepartureId,
  party_size: 1,
  status: "consumed",
  expires_at: "2026-09-12T07:00:00.000Z",
  created_at: "2026-09-12T06:25:00.000Z",
  consumed_at: "2026-09-12T06:25:00.000Z",
  released_at: null,
};

const sourceTour = {
  tour_id: manifest.sourceTourId,
  tour_version_id: manifest.sourceTourVersionId,
  tour_status: "published",
  tour_version_status: "published",
  published_at: "2026-09-05T00:00:00.000Z",
  price_vnd_per_person: "250000",
};

const identities = [
  { email: manifest.ownerEmail, user_id: ownerId },
  { email: manifest.guideEmail, user_id: guideId },
  { email: manifest.assignmentActorEmail, user_id: adminId },
];

const identityRoles = [
  { user_id: ownerId, role: "customer" },
  { user_id: guideId, role: "guide" },
  { user_id: adminId, role: "admin" },
];

const identityGuides = [{ user_id: guideId }];

function emptyPreservedGraph() {
  return {
    marker: [marker],
    tour: [sourceTour],
    departures: [
      { id: "d1700000-0000-4000-8000-000000000421", tour_version_id: manifest.sourceTourVersionId, start_at: "2026-09-12T02:00:00.000Z", end_at: "2026-09-12T05:00:00.000Z", status: "scheduled", capacity: 12 },
      { id: "d1700000-0000-4000-8000-000000000422", tour_version_id: "d1700000-0000-4000-8000-000000000412", start_at: "2026-09-19T02:00:00.000Z", end_at: "2026-09-19T05:30:00.000Z", status: "scheduled", capacity: 12 },
      { id: "d1700000-0000-4000-8000-000000000423", tour_version_id: "d1700000-0000-4000-8000-000000000413", start_at: "2026-09-26T02:00:00.000Z", end_at: "2026-09-26T05:00:00.000Z", status: "scheduled", capacity: 12 },
      { id: "d1700000-0000-4000-8000-000000000431", tour_version_id: manifest.sourceTourVersionId, start_at: "2026-09-12T07:00:00.000Z", end_at: "2026-09-12T10:00:00.000Z", status: "scheduled", capacity: 2 },
      { id: "d1700000-0000-4000-8000-000000000432", tour_version_id: "d1700000-0000-4000-8000-000000000412", start_at: "2026-09-19T07:00:00.000Z", end_at: "2026-09-19T10:00:00.000Z", status: "sold_out", capacity: 2 },
    ],
    bookings: [
      { id: "d1700000-0000-4000-8000-000000000501", owner_user_id: ownerId, departure_id: manifest.sourceDepartureId, status: "pending_payment", tour_version_id: manifest.sourceTourVersionId, party_size: 1 },
      { id: manifest.sourceBookingId, owner_user_id: ownerId, departure_id: manifest.sourceDepartureId, status: "confirmed", tour_version_id: manifest.sourceTourVersionId, party_size: 1 },
    ],
    holds: [
      { id: "d1700000-0000-4000-8000-000000000551", booking_id: "d1700000-0000-4000-8000-000000000501", departure_id: manifest.sourceDepartureId, party_size: 1, status: "active" },
      sourceHold,
    ],
    assignments: [
      { id: "d1700000-0000-4000-8000-000000000601", booking_id: manifest.sourceBookingId, guide_user_id: guideId, status: "assigned" },
    ],
    qaSlots: [
      { slot_id: "qa-01", dataset_version: "thesis-demo.v2", booking_id: "d1700000-0000-4000-8000-000000000711" },
      { slot_id: "qa-02", dataset_version: "thesis-demo.v2", booking_id: "d1700000-0000-4000-8000-000000000712" },
      { slot_id: "qa-03", dataset_version: "thesis-demo.v2", booking_id: "d1700000-0000-4000-8000-000000000713" },
      { slot_id: "qa-04", dataset_version: "thesis-demo.v2", booking_id: "d1700000-0000-4000-8000-000000000714" },
    ],
    lifecycle: [
      {
        relation: "private.simulated_payment_receipts",
        row_key: "d1700000-0000-4000-8000-000000000721",
        row_data: {
          id: "d1700000-0000-4000-8000-000000000721",
          booking_id: "d1700000-0000-4000-8000-000000000711",
          owner_user_id: ownerId,
          checkout_attempt_id: "d1700000-0000-4000-8000-000000000761",
          idempotency_key: "thesis-demo:v2:qa-01:payment",
          result_booking_status: "confirmed",
          result_payment_status: "paid",
          amount_minor: "250000",
          currency: "vnd",
          simulated_at: "2026-09-12T06:30:00.000Z",
          created_at: "2026-09-12T06:30:00.000Z",
        },
      },
      {
        relation: "private.booking_cancellations",
        row_key: "d1700000-0000-4000-8000-000000000732",
        row_data: {
          id: "d1700000-0000-4000-8000-000000000732",
          booking_id: "d1700000-0000-4000-8000-000000000712",
          customer_user_id: ownerId,
          source_kind: "departure",
          reason_code: "trip_plan_changed",
          other_reason: null,
          request_idempotency_key: "thesis-demo:v2:qa-02:cancel",
          cancelled_at: "2026-09-12T06:45:00.000Z",
        },
      },
    ],
  };
}

function makeQuery(options: {
  extension?: "absent" | "complete" | "partial";
  overlap?: boolean;
  failOn?: string;
  mutatePreservedGraph?: boolean;
  mutatePreservedLifecycle?: boolean;
} = {}) {
  const calls: QueryCall[] = [];
  const graph = emptyPreservedGraph();
  let writes = 0;
  let readOnlyTransaction = false;

  const query = async (sql: string, values: unknown[] = []): Promise<QueryResult> => {
    calls.push({ sql, values });
    if (/BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY/i.test(sql)) readOnlyTransaction = true;
    if (readOnlyTransaction && /\bFOR SHARE\b/i.test(sql)) {
      throw new Error("SELECT FOR SHARE is not allowed in a read-only transaction");
    }
    if (/^\s*ROLLBACK\b/i.test(sql)) readOnlyTransaction = false;
    if (options.failOn && sql.includes(options.failOn)) throw new Error("synthetic query failure");
    if (sql.includes("e19:insert-")) writes += 1;
    if (sql.includes("e19:base-manifest")) return { rows: [marker] };
    if (sql.includes("e19:source-booking")) return { rows: [sourceBooking] };
    if (sql.includes("e19:source-hold")) return { rows: [sourceHold] };
    if (sql.includes("e19:source-departure")) return { rows: [sourceDeparture] };
    if (sql.includes("e19:source-tour")) return { rows: [sourceTour] };
    if (sql.includes("e19:identities")) return { rows: identities };
    if (sql.includes("e19:identity-roles")) return { rows: identityRoles };
    if (sql.includes("e19:identity-guides")) return { rows: identityGuides };
    if (sql.includes("e19:overlap")) return { rows: options.overlap ? [{ id: "overlap" }] : [] };
    const departurePresent = options.extension === "complete"
      || options.extension === "partial"
      || writes >= 3;
    const extensionPresent = options.extension === "complete" || writes >= 3;
    if (sql.includes("e19:extension-departure")) {
      return {
        rows: !departurePresent
          ? []
          : [{
            id: manifest.departure.id,
            tour_version_id: manifest.sourceTourVersionId,
            start_at: manifest.departure.startAt,
            end_at: manifest.departure.endAt,
            status: "scheduled",
            capacity: 1,
          }],
      };
    }
    if (sql.includes("e19:extension-booking")) {
      return {
        rows: extensionPresent
          ? [{
            ...sourceBooking,
            id: manifest.booking.id,
            source_id: manifest.departure.id,
            departure_id: manifest.departure.id,
            created_at: manifest.booking.createdAt,
            hold_expires_at: "2026-10-03T00:35:01.000Z",
          }]
          : [],
      };
    }
    if (sql.includes("e19:extension-hold")) {
      return {
        rows: extensionPresent
          ? [{
            ...sourceHold,
            id: manifest.booking.holdId,
            booking_id: manifest.booking.id,
            departure_id: manifest.departure.id,
            created_at: manifest.booking.createdAt,
            expires_at: "2026-10-03T00:35:01.000Z",
            consumed_at: manifest.booking.createdAt,
          }]
          : [],
      };
    }
    if (sql.includes("e19:extension-assignment")) return { rows: [] };
    if (sql.includes("e19:extension-references")) return { rows: [] };
    if (sql.includes("e19:extension-qa-slot")) return { rows: [] };
    if (sql.includes("e19:preserved-")) {
      const snapshot = JSON.parse(JSON.stringify(graph));
      if (options.mutatePreservedGraph && writes >= 3) snapshot.departures[0].capacity = 99;
      if (options.mutatePreservedLifecycle && writes >= 3) snapshot.lifecycle[0].row_data.result_payment_status = "tampered";
      if (sql.includes("e19:preserved-marker")) return { rows: snapshot.marker };
      if (sql.includes("e19:preserved-tour")) return { rows: snapshot.tour };
      if (sql.includes("e19:preserved-departures")) return { rows: snapshot.departures };
      if (sql.includes("e19:preserved-bookings")) return { rows: snapshot.bookings };
      if (sql.includes("e19:preserved-holds")) return { rows: snapshot.holds };
      if (sql.includes("e19:preserved-assignments")) return { rows: snapshot.assignments };
      if (sql.includes("e19:preserved-lifecycle")) return { rows: snapshot.lifecycle };
      if (sql.includes("e19:preserved-slots")) return { rows: snapshot.qaSlots };
    }
    return { rows: [] };
  };

  return { query, calls };
}

describe("E19 assignment-only thesis fixture", () => {
  it("loads the exact reviewed base marker, interval, capacity, and replay key", () => {
    const checked = validateE19AssignmentManifest(manifest);

    expect(checked.fixtureVersion).toBe(E19_FIXTURE_VERSION);
    expect(checked.baseDatasetVersion).toBe("thesis-demo.v2");
    expect(checked.departure.capacity).toBe(1);
    expect(checked.departure.startAt).toBe("2026-10-03T02:00:00.000Z");
    expect(checked.departure.endAt).toBe("2026-10-03T05:00:00.000Z");
    expect(checked.assignmentIdempotencyKey).toBe(E19_ASSIGNMENT_IDEMPOTENCY_KEY);
    expect(checked.constraints.mustNotCreateInitialAssignment).toBe(true);
  });

  it("rejects a manifest that changes the protected base or creates an assignment", () => {
    expect(() => validateE19AssignmentManifest({
      ...manifest,
      baseDatasetVersion: "thesis-demo.v1",
    })).toThrow(/E19_MANIFEST_INVALID/);
    expect(() => validateE19AssignmentManifest({
      ...manifest,
      constraints: { ...manifest.constraints, mustNotCreateInitialAssignment: false },
    })).toThrow(/E19_MANIFEST_INVALID/);
    expect(() => validateE19AssignmentManifest({
      ...manifest,
      departure: { ...manifest.departure, capacity: 12 },
    })).toThrow(/E19_MANIFEST_INVALID/);
  });

  it("requires an exact verified project, database target, and TLS mode at the CLI boundary", () => {
    const target = {
      LOCALENS_THESIS_DEMO_E19_CONFIRM: "localens-thesis-demo-e19-assignment",
      LOCALENS_THESIS_DEMO_E19_DB_URL: "postgres://postgres@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full",
      LOCALENS_THESIS_DEMO_E19_EXPECTED_PROJECT_REF: "abcdefghijklmnopqrst",
      LOCALENS_THESIS_DEMO_E19_EXPECTED_DB_HOST: "aws-0-ap-southeast-1.pooler.supabase.com",
      LOCALENS_THESIS_DEMO_E19_EXPECTED_DB_PORT: "5432",
      LOCALENS_THESIS_DEMO_E19_EXPECTED_DB_NAME: "postgres",
      LOCALENS_THESIS_DEMO_E19_EXPECTED_DB_USER: "postgres",
      LOCALENS_THESIS_DEMO_E19_EXPECTED_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co/",
    };

    expect(validateE19ConnectionTarget(target)).toMatchObject({
      projectRef: "abcdefghijklmnopqrst",
      databaseHost: target.LOCALENS_THESIS_DEMO_E19_EXPECTED_DB_HOST,
      databasePort: "5432",
      databaseUser: "postgres",
      databaseLogin: "postgres",
    });
    expect(validateE19ConnectionTarget({
      ...target,
      LOCALENS_THESIS_DEMO_E19_DB_URL: "postgres://postgres.abcdefghijklmnopqrst@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full",
    })).toMatchObject({
      databaseUser: "postgres",
      databaseLogin: "postgres.abcdefghijklmnopqrst",
    });
    expect(validateE19ConnectionTarget({
      ...target,
      LOCALENS_THESIS_DEMO_E19_EXPECTED_DB_USER: "postgres.abcdefghijklmnopqrst",
      LOCALENS_THESIS_DEMO_E19_DB_URL: "postgres://postgres.abcdefghijklmnopqrst@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full",
    })).toMatchObject({
      databaseUser: "postgres",
      databaseLogin: "postgres.abcdefghijklmnopqrst",
    });
    expect(() => validateE19ConnectionTarget({
      ...target,
      LOCALENS_THESIS_DEMO_E19_DB_URL: target.LOCALENS_THESIS_DEMO_E19_DB_URL.replace("verify-full", "require"),
    })).toThrow(/E19_TARGET_INVALID/);
    expect(() => validateE19ConnectionTarget({
      ...target,
      LOCALENS_THESIS_DEMO_E19_DB_URL: target.LOCALENS_THESIS_DEMO_E19_DB_URL.replace("aws-0-ap-southeast-1", "other"),
    })).toThrow(/E19_TARGET_INVALID/);
    expect(() => validateE19ConnectionTarget({
      ...target,
      LOCALENS_THESIS_DEMO_E19_DB_URL: "postgres://postgres.otherproject@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full",
    })).toThrow(/E19_TARGET_INVALID/);
  });

  it("inserts one departure, booking, and consumed hold in a guarded forward-only transaction", async () => {
    const { query, calls } = makeQuery({ extension: "absent" });

    const result = await runE19AssignmentFixture({ query, manifest });

    expect(result.status).toBe("applied");
    const inserts = calls.filter(({ sql }) => sql.includes("INSERT INTO")).map(({ sql }) => sql);
    expect(inserts).toHaveLength(3);
    expect(inserts[0]).toMatch(/public\.departures/);
    expect(inserts[1]).toMatch(/public\.bookings/);
    expect(inserts[2]).toMatch(/private\.capacity_holds/);
    expect(inserts.join("\n")).not.toMatch(/guide_assignments|qa_slots|thesis_demo_manifest/i);
    expect(calls.some(({ sql }) => /UPDATE|DELETE|TRUNCATE|DROP/i.test(sql))).toBe(false);
    expect(calls.at(-1)?.sql).toMatch(/COMMIT/);
  });

  it("offers a read-only plan that rolls back before any INSERT", async () => {
    const { query, calls } = makeQuery({ extension: "absent" });

    const result = await planE19AssignmentFixture({ query, manifest });

    expect(result.status).toBe("dry-run");
    expect(result.writes).toEqual(["public.departures", "public.bookings", "private.capacity_holds"]);
    expect(calls.some(({ sql }) => sql.includes("INSERT INTO"))).toBe(false);
    expect(calls.some(({ sql }) => sql.includes("READ ONLY"))).toBe(true);
    expect(calls.some(({ sql }) => /\bFOR SHARE\b/i.test(sql))).toBe(false);
    expect(calls.at(-1)?.sql).toMatch(/ROLLBACK/);
  });

  it("returns already-present only for the complete exact extension and never inserts twice", async () => {
    const { query, calls } = makeQuery({ extension: "complete" });

    const result = await runE19AssignmentFixture({ query, manifest });

    expect(result.status).toBe("already-present");
    expect(calls.some(({ sql }) => sql.includes("INSERT INTO"))).toBe(false);
    expect(calls.at(-1)?.sql).toMatch(/ROLLBACK/);
  });

  it("fails closed on a partial target collision or overlapping departure", async () => {
    const partial = makeQuery({ extension: "partial" });
    await expect(runE19AssignmentFixture({ query: partial.query, manifest })).rejects.toThrow(/E19_ASSIGNMENT_FIXTURE_DRIFT/);
    expect(partial.calls.some(({ sql }) => sql.includes("INSERT INTO"))).toBe(false);

    const overlap = makeQuery({ extension: "absent", overlap: true });
    await expect(runE19AssignmentFixture({ query: overlap.query, manifest })).rejects.toThrow(/E19_ASSIGNMENT_INTERVAL_OVERLAP/);
    expect(overlap.calls.some(({ sql }) => sql.includes("INSERT INTO"))).toBe(false);
  });

  it("rolls back when an insertion fails and never commits a partial delta", async () => {
    const { query, calls } = makeQuery({ extension: "absent", failOn: "e19:insert-booking" });

    await expect(runE19AssignmentFixture({ query, manifest })).rejects.toThrow(/E19_ASSIGNMENT_TRANSACTION_FAILED/);
    expect(calls.some(({ sql }) => sql.includes("ROLLBACK"))).toBe(true);
    expect(calls.some(({ sql }) => sql.includes("COMMIT"))).toBe(false);
  });

  it("rolls back when the protected graph changes during the transaction", async () => {
    const { query, calls } = makeQuery({ extension: "absent", mutatePreservedGraph: true });

    await expect(runE19AssignmentFixture({ query, manifest })).rejects.toThrow(/E19_EXISTING_GRAPH_CHANGED/);
    expect(calls.some(({ sql }) => sql.includes("ROLLBACK"))).toBe(true);
    expect(calls.some(({ sql }) => sql.includes("COMMIT"))).toBe(false);
  });

  it("rolls back when a preserved payment receipt or cancellation changes", async () => {
    const { query, calls } = makeQuery({ extension: "absent", mutatePreservedLifecycle: true });

    await expect(runE19AssignmentFixture({ query, manifest })).rejects.toThrow(/E19_EXISTING_GRAPH_CHANGED/);
    expect(calls.some(({ sql }) => sql.includes("ROLLBACK"))).toBe(true);
    expect(calls.some(({ sql }) => sql.includes("COMMIT"))).toBe(false);
  });
});
