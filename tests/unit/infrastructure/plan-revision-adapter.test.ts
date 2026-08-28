// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { EngineInput, ItineraryResult } from "@/lib/domain/itinerary/contracts";
import { toPlanRevisionInsert } from "@/lib/infrastructure/supabase/plan-revision-adapter";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260823095000_trip_plans_revisions.sql"),
  "utf8",
);
const databaseFixture = readFileSync(
  join(process.cwd(), "supabase", "tests", "database", "trip_plan_revisions_test.sql"),
  "utf8",
);
const guestQuotaMigration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260823100000_guest_quota.sql"),
  "utf8",
);
const guestQuotaDatabaseFixture = readFileSync(
  join(process.cwd(), "supabase", "tests", "database", "guest_quota_test.sql"),
  "utf8",
);

const ids = {
  catalog: "00000000-0000-0000-0000-000000000601",
  travel: "00000000-0000-0000-0000-000000000602",
  fx: "00000000-0000-0000-0000-000000000603",
  area: "00000000-0000-0000-0000-000000000604",
  firstPlace: "00000000-0000-0000-0000-000000000605",
  secondPlace: "00000000-0000-0000-0000-000000000606",
};

const place = (id: string, areaId = ids.area) => ({
  id,
  areaId,
  types: ["street_food" as const],
  priceVndPerPerson: 180_000,
  visitDurationMinutes: 45,
  guideLanguages: ["en" as const],
  dietarySupport: { halal: "supported" as const },
  mobilitySupport: { "step-free": "supported" as const },
  openingHours: [{ weekday: 5 as const, opensAt: "08:00", closesAt: "18:00" }],
  openingExceptions: [],
  foodVendors: [],
});

const input: EngineInput = {
  request: {
    startAt: "2026-09-05T01:00:00Z",
    durationMinutes: 240,
    areas: [ids.area],
    budget: { currency: "USD", amountMinor: 10_000 },
    partySize: 2,
    guideLanguage: "en",
    priorityWeights: {
      street_food: 5,
      history: 0,
      traditional_craft: 0,
      traditional_market: 0,
    },
    pace: "balanced",
    dietaryRequirements: ["halal"],
    mobilityRequirements: ["step-free"],
    lockedStopIds: [ids.firstPlace],
  },
  catalog: {
    id: ids.catalog,
    places: [place(ids.firstPlace), place(ids.secondPlace)],
  },
  travel: {
    id: ids.travel,
    edges: [{
      fromPlaceId: ids.firstPlace,
      toPlaceId: ids.secondPlace,
      mode: "walk",
      minutes: 12,
      groupCostVnd: 45_000,
      verifiedAt: "2026-09-04T18:00:00+07:00",
    }],
  },
  fx: {
    id: ids.fx,
    vndPerUsd: "25000.00000000",
    observedAtUtc: "2026-09-05T01:00:00Z",
  },
  asOfUtc: "2026-09-05T01:00:00Z",
};

const result: ItineraryResult = {
  normalizedStartAt: "2026-09-05T08:00:00+07:00",
  budgetVnd: 250_000_000,
  rankingSource: "ai",
  items: [
    {
      placeId: ids.firstPlace,
      startAt: "2026-09-05T08:00:00+07:00",
      endAt: "2026-09-05T08:45:00+07:00",
      visitDurationMinutes: 45,
      travelMinutesBefore: 0,
      transitionBufferMinutesBefore: 0,
      travelCostVndBefore: 0,
      placeCostVnd: 180_000,
      foodSelection: null,
      foodCostMinVnd: 0,
      foodCostMaxVnd: 0,
      payAtVendorMinVnd: 0,
      payAtVendorMaxVnd: 0,
      customerPayableVnd: 180_000,
      score: 4,
    },
    {
      placeId: ids.secondPlace,
      startAt: "2026-09-05T09:07:00+07:00",
      endAt: "2026-09-05T09:52:00+07:00",
      visitDurationMinutes: 45,
      travelMinutesBefore: 12,
      transitionBufferMinutesBefore: 10,
      travelCostVndBefore: 45_000,
      placeCostVnd: 180_000,
      foodSelection: null,
      foodCostMinVnd: 0,
      foodCostMaxVnd: 0,
      payAtVendorMinVnd: 0,
      payAtVendorMaxVnd: 0,
      customerPayableVnd: 225_000,
      score: 3,
    },
  ],
  totals: {
    durationMinutes: 112,
    visitMinutes: 90,
    travelMinutes: 12,
    transitionBufferMinutes: 10,
    admissionCostVnd: 360_000,
    foodCostMinVnd: 0,
    foodCostMaxVnd: 0,
    travelCostVnd: 45_000,
    guideCostVnd: 0,
    payAtVendorMinVnd: 0,
    payAtVendorMaxVnd: 0,
    customerPayableVnd: 405_000,
    groupCostMinVnd: 405_000,
    groupCostMaxVnd: 405_000,
    groupCostVnd: 405_000,
    score: 7,
  },
  snapshotIds: { catalog: ids.catalog, travel: ids.travel, fx: ids.fx },
};

describe("toPlanRevisionInsert", () => {
  it("projects only immutable persistence fields and serializes every database bigint as a decimal string", () => {
    const mapped = toPlanRevisionInsert(input, result, "a".repeat(64), 3);

    expect(mapped).toEqual({
      ok: true,
      value: {
        revisionNo: 3,
        request: input.request,
        result,
        fingerprint: "a".repeat(64),
        rankingSource: "ai",
        catalogSnapshotId: ids.catalog,
        travelSnapshotId: ids.travel,
        fxSnapshotId: ids.fx,
        fxVndPerUsd: "25000.00000000",
        currency: "USD",
        budgetVnd: "250000000",
        totalCostVnd: "405000",
        totalDurationMinutes: 112,
        lockedPlaceIds: [ids.firstPlace],
        items: [
          expect.objectContaining({
            placeId: ids.firstPlace,
            travelCostVndBefore: "0",
            placeCostVnd: "180000",
          }),
          expect.objectContaining({
            placeId: ids.secondPlace,
            travelCostVndBefore: "45000",
            placeCostVnd: "180000",
          }),
        ],
      },
    });

    if (mapped.ok) {
      expect(Object.keys(mapped.value)).toEqual([
        "revisionNo", "request", "result", "fingerprint", "rankingSource",
        "catalogSnapshotId", "travelSnapshotId", "fxSnapshotId", "fxVndPerUsd",
        "currency", "budgetVnd", "totalCostVnd", "totalDurationMinutes",
        "lockedPlaceIds", "items",
      ]);
      expect(mapped.value.items).toHaveLength(2);
      expect(Object.keys(mapped.value.items[0] ?? {})).toEqual([
        "placeId", "startAt", "endAt", "visitDurationMinutes", "travelMinutesBefore",
        "transitionBufferMinutesBefore", "travelCostVndBefore", "placeCostVnd", "score",
      ]);
    }
  });

  it("rejects a result from a different immutable snapshot set", () => {
    expect(toPlanRevisionInsert(input, {
      ...result,
      snapshotIds: { ...result.snapshotIds, catalog: ids.travel },
    }, "a".repeat(64), 1)).toMatchObject({
      ok: false,
      error: { code: "SNAPSHOT_MISMATCH" },
    });
  });

  it("rejects non-UUID persistence identifiers, unsafe revisions, and non-canonical fingerprints", () => {
    expect(toPlanRevisionInsert({ ...input, catalog: { ...input.catalog, id: "catalog-v1" } }, result, "a".repeat(64), 1)).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE" },
    });
    expect(toPlanRevisionInsert(input, { ...result, items: [{ ...result.items[0], placeId: "place-1" }, ...result.items.slice(1)] }, "a".repeat(64), 1)).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE" },
    });
    expect(toPlanRevisionInsert(input, result, "A".repeat(64), 1)).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE" },
    });
    expect(toPlanRevisionInsert(input, result, "a".repeat(64), 0)).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE" },
    });
  });

  it("rejects runtime extras instead of persisting caller metadata", () => {
    const source = { ...input, request: { ...input.request, ownerUserId: "forged" } } as unknown as EngineInput;
    const output = toPlanRevisionInsert(source, result, "a".repeat(64), 1);
    expect(output).toMatchObject({ ok: false, error: { code: "UNKNOWN_FIELD" } });
  });

  it("requires USD FX parity and persists no FX facts for VND", () => {
    const vndInput = {
      ...input,
      fx: undefined,
      request: { ...input.request, budget: { currency: "VND" as const, amountMinor: 2_000_000 } },
    };
    const vndResult = { ...result, snapshotIds: { ...result.snapshotIds, fx: null } };
    const mapped = toPlanRevisionInsert(vndInput, vndResult, "a".repeat(64), 1);
    expect(mapped).toMatchObject({ ok: true, value: { currency: "VND", fxSnapshotId: null, fxVndPerUsd: null } });

    expect(toPlanRevisionInsert(vndInput, result, "a".repeat(64), 1)).toMatchObject({
      ok: false,
      error: { code: "SNAPSHOT_MISMATCH" },
    });
    expect(toPlanRevisionInsert({ ...input, fx: undefined }, result, "a".repeat(64), 1)).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE" },
    });
  });

  it("requires every locked stop to be selected in the same relative order", () => {
    const missingLockedStop = toPlanRevisionInsert(
      {
        ...input,
        request: { ...input.request, lockedStopIds: [ids.firstPlace, ids.secondPlace] },
      },
      { ...result, items: [result.items[0]!] },
      "a".repeat(64),
      1,
    );
    expect(missingLockedStop).toMatchObject({
      ok: false,
      error: { code: "SNAPSHOT_MISMATCH" },
    });

    const outOfOrderLockedStops = toPlanRevisionInsert(
      {
        ...input,
        request: { ...input.request, lockedStopIds: [ids.secondPlace, ids.firstPlace] },
      },
      result,
      "a".repeat(64),
      1,
    );
    expect(outOfOrderLockedStops).toMatchObject({
      ok: false,
      error: { code: "SNAPSHOT_MISMATCH" },
    });
  });

  it("rejects values outside the persistence integer bounds", () => {
    expect(toPlanRevisionInsert(input, result, "a".repeat(64), 2_147_483_648)).toMatchObject({
      ok: false,
      error: { code: "INVALID_DB_INTEGER" },
    });

    expect(toPlanRevisionInsert(input, {
      ...result,
      totals: { ...result.totals, durationMinutes: 721 },
    }, "a".repeat(64), 1)).toMatchObject({
      ok: false,
      error: { code: "INVALID_DB_INTEGER" },
    });

    expect(toPlanRevisionInsert(input, {
      ...result,
      items: [{ ...result.items[0]!, travelMinutesBefore: 721 }, result.items[1]!],
    }, "a".repeat(64), 1)).toMatchObject({
      ok: false,
      error: { code: "INVALID_DB_INTEGER" },
    });
  });
});

describe("trip-plan revision migration contract", () => {
  it("defines owner-scoped plan/revision/item history with restrictive snapshot membership", () => {
    expect(migration).toMatch(/CREATE TABLE public\.trip_plans[\s\S]*owner_user_id uuid[\s\S]*guest_binding_id uuid/);
    expect(migration).toMatch(/CREATE TABLE public\.trip_plan_revisions[\s\S]*UNIQUE \(plan_id, revision_no\)/);
    expect(migration).toMatch(/CREATE TABLE public\.trip_plan_items[\s\S]*UNIQUE \(revision_id, position\)[\s\S]*UNIQUE \(revision_id, place_id\)/);
    expect(migration).toMatch(/FOREIGN KEY \(catalog_snapshot_id, place_id\)[\s\S]*ON DELETE RESTRICT/);
    expect(migration).toMatch(/FOREIGN KEY \(travel_snapshot_id\)[\s\S]*ON DELETE RESTRICT/);
    expect(migration).toMatch(/FOREIGN KEY \(fx_snapshot_id\)[\s\S]*ON DELETE RESTRICT/);
    expect(migration).toMatch(/CREATE TABLE private\.recommendation_runs[\s\S]*append/i);
    expect(migration).toMatch(/trip_plan_revisions_append_only/);
    expect(migration).toMatch(/trip_plan_items_append_only/);
  });

  it("hands the Task 6 placeholder to Task 7 without exposing private CAS", () => {
    expect(migration).toMatch(/guest_binding_id uuid\s*,/);
    expect(migration).not.toMatch(/guest_binding_id uuid[^\n]*REFERENCES/);
    expect(migration).not.toMatch(/TO anon[\s\S]*trip_plans/);
    expect(migration).toMatch(/ALTER TABLE public\.trip_plans ENABLE ROW LEVEL SECURITY/);
    expect(migration).toMatch(/ALTER TABLE public\.trip_plans FORCE ROW LEVEL SECURITY/);
    expect(guestQuotaMigration).toMatch(/ADD CONSTRAINT trip_plans_guest_binding_fk[\s\S]*REFERENCES private\.guest_bindings\(id\)/);
    expect(guestQuotaMigration).toMatch(/GRANT EXECUTE ON FUNCTION public\.advance_trip_plan_revision\(uuid, integer, jsonb\) TO authenticated/);
    expect(guestQuotaMigration).toMatch(/REVOKE ALL ON FUNCTION private\.advance_trip_plan_revision\(uuid, integer, jsonb\) FROM authenticated/);
    expect(guestQuotaDatabaseFixture).toMatch(/public\.advance_trip_plan_revision/);
    expect(guestQuotaDatabaseFixture).not.toMatch(/\$\$SELECT \* FROM private\.advance_trip_plan_revision/);
    expect(guestQuotaDatabaseFixture).toMatch(/NOT has_schema_privilege\('authenticated', 'private', 'USAGE'\)/);
  });

  it("uses a locked customer-owner compare-and-swap and stable stale error", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION private\.advance_trip_plan_revision\(\s*plan_id uuid,\s*base_revision_no integer,\s*persistence_dto jsonb\s*\)/);
    expect(migration).toMatch(/actor_user_id\s*:=\s*auth\.uid\(\)/);
    expect(migration).toMatch(/SELECT[\s\S]*FROM public\.trip_plans[\s\S]*FOR UPDATE/);
    expect(migration).toMatch(/STALE_REVISION/);
    expect(migration).toMatch(/RAISE EXCEPTION[\s\S]*STALE_REVISION/);
    expect(migration).toMatch(/INSERT INTO public\.trip_plan_revisions/);
    expect(migration).toMatch(/INSERT INTO public\.trip_plan_items/);
    expect(migration).toMatch(/ON CONFLICT \(plan_id, revision_no\)/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION private\.advance_trip_plan_revision/);
  });

  it("pins definer security, least-privilege grants, and owner-only RLS", () => {
    expect(migration).toMatch(/CREATE ROLE localens_plan_rpc_owner NOLOGIN NOBYPASSRLS/);
    expect(migration).toMatch(/SECURITY DEFINER[\s\S]*SET search_path = ''/);
    expect(migration).toMatch(/ALTER FUNCTION private\.advance_trip_plan_revision[\s\S]*OWNER TO localens_plan_rpc_owner/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION private\.advance_trip_plan_revision[\s\S]*TO authenticated/);
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.trip_plans, public\.trip_plan_revisions, public\.trip_plan_items FROM PUBLIC, anon, authenticated/);
    expect(migration).toMatch(/trip_plans_owner_select[\s\S]*TO authenticated[\s\S]*auth\.uid\(\) = owner_user_id/);
    expect(migration).toMatch(/trip_plan_revisions_owner_select[\s\S]*TO authenticated/);
    expect(migration).not.toMatch(/CREATE POLICY[^\n]*TO anon[^\n]*trip_plan/);
  });

  it("rechecks canonical persistence shape, snapshot IDs, fingerprints, and FX nullability in SQL", () => {
    expect(migration).toMatch(/jsonb_typeof\(persistence_dto\) = 'object'/);
    expect(migration).toMatch(/jsonb_object_keys\(persistence_dto\)/);
    expect(migration).toMatch(/fingerprint[\s\S]*~ '\^\[0-9a-f\]\{64\}\$'/);
    expect(migration).toMatch(/fx_snapshot_id IS NULL[\s\S]*fx_vnd_per_usd IS NULL/);
    expect(migration).toMatch(/fx_snapshot_id IS NOT NULL[\s\S]*fx_vnd_per_usd IS NOT NULL/);
    expect(migration).toMatch(/catalog_snapshot_id[\s\S]*travel_snapshot_id/);
  });

  it("requires canonical nested request/result JSON and parity before inserts", () => {
    expect(migration).toMatch(/expected_request_keys constant text\[\] := ARRAY/);
    expect(migration).toMatch(/expected_result_keys constant text\[\] := ARRAY/);
    expect(migration).toMatch(/request_json->'budget'/);
    expect(migration).toMatch(/request_json->'lockedStopIds'[\s\S]*lockedPlaceIds/);
    expect(migration).toMatch(/result_json->>'rankingSource'[\s\S]*rankingSource/);
    expect(migration).toMatch(/result_json->'snapshotIds'[\s\S]*catalogSnapshotId/);
    expect(migration).toMatch(/result_json->>'budgetVnd'[\s\S]*budgetVnd/);
    expect(migration).toMatch(/result_json->'totals'[\s\S]*totalDurationMinutes/);
    expect(migration).toMatch(/result_json->'items'[\s\S]*WITH ORDINALITY/);
    expect(migration).toMatch(/result item facts do not match/);
    expect(migration).toMatch(/expected_priority_keys constant text\[\] := ARRAY/);
    expect(migration).toMatch(/budget'->'amountMinor'[\s\S]*9007199254740991/);
    expect(migration).toMatch(/priorityWeights'[\s\S]*traditional_market/);
    expect(migration).toMatch(/totals'->>'visitMinutes'[\s\S]*720/);
    expect(migration).toMatch(/totals'->'score'[\s\S]*9007199254740991/);
    expect(migration).toMatch(/invalid nested request facts/);
    expect(migration).toMatch(/jsonb_typeof\(request_json\) IS DISTINCT FROM 'object'/);
    expect(migration).toMatch(/jsonb_typeof\(result_json\) IS DISTINCT FROM 'object'/);
  });

  it("guards every integer cast with the database range", () => {
    expect(migration).toMatch(/revisionNo[\s\S]*2147483647/);
    expect(migration).toMatch(/budgetVnd[\s\S]*9007199254740991/);
    expect(migration).toMatch(/totalCostVnd[\s\S]*9007199254740991/);
    expect(migration).toMatch(/totalDurationMinutes[\s\S]*720/);
    expect(migration).toMatch(/travelMinutesBefore[\s\S]*720/);
    expect(migration).toMatch(/visitDurationMinutes[\s\S]*480/);
    expect(migration).toMatch(/length\(persistence_dto->>'budgetVnd'\) > 16/);
    expect(migration).toMatch(/length\(item->>'travelCostVndBefore'\) > 16/);
    expect(migration).toContain("jsonb_typeof(item->'score') IS DISTINCT FROM 'number'");
    expect(migration).toContain("jsonb_typeof(result_item->'score') IS DISTINCT FROM 'number'");
    expect(migration).toContain("item->>'score' !~ '^-?(?:0|[1-9][0-9]{0,15})(?:\\.[0-9]{1,12})?$'");
    expect(migration).toContain("result_item->>'score' !~ '^-?(?:0|[1-9][0-9]{0,15})(?:\\.[0-9]{1,12})?$'");
    expect(migration).toMatch(/abs\(\(result_json->'totals'->>'score'\)::numeric\) > 9007199254740991/);
    expect(migration).toMatch(/abs\(\(item->>'score'\)::numeric\) > 9007199254740991/);
    expect(migration).toMatch(/abs\(\(result_item->>'score'\)::numeric\) > 9007199254740991/);
  });

  it("mirrors canonical engine request and result snapshot facts in SQL", () => {
    expect(migration).toMatch(/iso_offset_pattern constant text/);
    expect(migration).toMatch(/request_json->>'startAt' !~ iso_offset_pattern/);
    expect(migration).toMatch(/request_json->>'durationMinutes'[\s\S]*'60'/);
    expect(migration).toMatch(/canonical_hcm_pattern constant text/);
    expect(migration).toMatch(/result_json->>'normalizedStartAt' !~ canonical_hcm_pattern/);
    expect(migration).not.toMatch(/result_json->>'normalizedStartAt' IS DISTINCT FROM request_json->>'startAt'/);
    expect(migration).toMatch(/jsonb_array_elements_text\(request_json->'areas'\)/);
    expect(migration).toMatch(/jsonb_array_elements_text\(request_json->'dietaryRequirements'\)/);
    expect(migration).toMatch(/jsonb_array_elements_text\(request_json->'mobilityRequirements'\)/);
    expect(migration).toMatch(/jsonb_array_elements_text\(request_json->'lockedStopIds'\)/);
    expect(migration).toMatch(/count\(DISTINCT value\)/);
    expect(migration).toMatch(/invalid nested request arrays/);
  });

  it("gives the authenticated pgTAP role only fixture read access", () => {
    expect(databaseFixture).toMatch(
      /CREATE TEMP TABLE task6_revision_fixture[\s\S]*GRANT SELECT ON task6_revision_fixture TO authenticated;/,
    );
  });
});
