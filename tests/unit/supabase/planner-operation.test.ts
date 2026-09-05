// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  canonicalizePlannerOperation,
  computePlannerOperationDigest,
  parseOperationDecision,
  parseOperationRejectedCode,
  parsePlannerOperationId,
  type PlannerOperationInput,
  type OperationRejectedCode,
} from "@/supabase/functions/_shared/planner-operation";

const ids = {
  area: "10000000-0000-4000-8000-000000000001",
  diet: "10000000-0000-4000-8000-000000000002",
  lockedStop: "10000000-0000-4000-8000-000000000003",
  lockedItem: "10000000-0000-4000-8000-000000000004",
  plan: "10000000-0000-4000-8000-000000000005",
  lease: "10000000-0000-4000-8000-000000000006",
  plannerReservation: "10000000-0000-4000-8000-000000000007",
  geminiReservation: "10000000-0000-4000-8000-000000000008",
} as const;

function recommendPayload(): Record<string, unknown> {
  return {
    startAt: "2026-09-05T09:00:00+07:00",
    durationMinutes: 480,
    areas: [ids.area, "old-town"],
    budget: { currency: "VND", amountMinor: 1_500_000 },
    partySize: 2,
    guideLanguage: "vi",
    priorityWeights: {
      street_food: 0,
      history: 2,
      traditional_craft: 1,
      traditional_market: 0,
    },
    pace: "balanced",
    dietaryRequirements: [ids.diet],
    mobilityRequirements: [],
    lockedStopIds: [ids.lockedStop],
  };
}

function refinePayload(): Record<string, unknown> {
  return {
    planId: ids.plan,
    baseRevision: 1,
    scope: "partial",
    lockedItemIds: [ids.lockedItem],
    signals: {
      pace: "slower",
      food: "keep",
      preferTypes: ["history"],
      avoidTypes: [],
    },
  };
}

function operation(kind: PlannerOperationInput["kind"], payload: Record<string, unknown>): PlannerOperationInput {
  return { kind, payload };
}

describe("planner operation identifier boundary", () => {
  it.each([null, undefined, 1, {}, [], "", " not-a-uuid ", "customer:alice", "10000000-0000-4000-8000-00000000000A"])(
    "rejects an untrusted operation identifier: %j",
    (value) => expect(parsePlannerOperationId(value)).toBeNull(),
  );

  it("accepts a bounded lowercase UUID without changing its identity", () => {
    expect(parsePlannerOperationId("10000000-0000-4000-8000-000000000001")).toBe(
      "10000000-0000-4000-8000-000000000001",
    );
  });
});

describe("planner operation digest v1", () => {
  it("is stable under recursive object-key and documented set-array reordering", async () => {
    const first = operation("recommend", recommendPayload());
    const second = operation("recommend", {
      lockedStopIds: [ids.lockedStop, ids.lockedStop],
      mobilityRequirements: [],
      dietaryRequirements: [ids.diet, ids.diet],
      pace: "balanced",
      priorityWeights: {
        traditional_market: 0,
        traditional_craft: 1,
        history: 2,
        street_food: 0,
      },
      guideLanguage: "vi",
      partySize: 2,
      budget: { amountMinor: 1_500_000, currency: "VND" },
      areas: ["old-town", ids.area, "old-town"],
      durationMinutes: 480,
      startAt: "2026-09-05T02:00:00.000Z",
    });

    expect(canonicalizePlannerOperation(first)).toBe(canonicalizePlannerOperation(second));
    await expect(computePlannerOperationDigest(first)).resolves.toBe(
      await computePlannerOperationDigest(second),
    );
  });

  it("normalizes valid explicit-offset timestamps to UTC millisecond precision", () => {
    const canonical = canonicalizePlannerOperation(operation("recommend", recommendPayload()));
    expect(canonical).toContain('"startAt":"2026-09-05T02:00:00.000Z"');
  });

  it.each([
    ["budget", (value: PlannerOperationInput) => ({ ...value, payload: { ...(value.payload as Record<string, unknown>), budget: { currency: "VND", amountMinor: 1_500_001 } } })],
    ["timestamp", (value: PlannerOperationInput) => ({ ...value, payload: { ...(value.payload as Record<string, unknown>), startAt: "2026-09-05T09:01:00+07:00" } })],
    ["area", (value: PlannerOperationInput) => ({ ...value, payload: { ...(value.payload as Record<string, unknown>), areas: ["different-area"] } })],
  ] as const)("changes the recommend digest when %s changes", async (_label, mutate) => {
    const baseline = await computePlannerOperationDigest(operation("recommend", recommendPayload()));
    await expect(computePlannerOperationDigest(mutate(operation("recommend", recommendPayload())))).resolves.not.toBe(baseline);
  });

  it.each([
    ["base revision", { baseRevision: 2 }],
    ["scope", { scope: "full" }],
    ["locked IDs", { lockedItemIds: [] }],
    ["signals", { signals: { pace: "faster", food: "keep", preferTypes: ["history"], avoidTypes: [] } }],
  ] as const)("changes the refine digest when %s changes", async (_label, change) => {
    const baseline = await computePlannerOperationDigest(operation("refine", refinePayload()));
    const changed = { ...refinePayload(), ...change };
    await expect(computePlannerOperationDigest(operation("refine", changed))).resolves.not.toBe(baseline);
  });

  it.each([
    ["submillisecond timestamp", { startAt: "2026-09-05T09:00:00.0001+07:00" }],
    ["invalid calendar timestamp", { startAt: "2026-02-30T09:00:00+07:00" }],
    ["null member", { budget: null }],
    ["non-finite number", { partySize: Number.NaN }],
    ["infinite number", { durationMinutes: Number.POSITIVE_INFINITY }],
    ["unknown owner field", { ownerUserId: ids.plan }],
    ["raw locale field", { locale: "vi" }],
    ["raw correlation field", { correlationId: "request-1" }],
    ["raw feedback field", { feedback: "please make it slower" }],
  ] as const)("rejects %s instead of silently changing the digest input", (_label, change) => {
    expect(() => canonicalizePlannerOperation(operation("recommend", { ...recommendPayload(), ...change }))).toThrow(TypeError);
  });

  it.each([
    ["unknown root key", { correlationId: "request-1" }],
    ["raw feedback", { feedback: "more food" }],
    ["null locked IDs", { lockedItemIds: null }],
    ["malformed locked item UUID", { lockedItemIds: ["not-a-uuid"] }],
    ["non-finite revision", { baseRevision: Number.POSITIVE_INFINITY }],
    ["unknown signal key", { signals: { pace: "slower", food: "keep", preferTypes: [], avoidTypes: [], raw: "PII" } }],
  ] as const)("rejects refine %s", (_label, change) => {
    expect(() => canonicalizePlannerOperation(operation("refine", { ...refinePayload(), ...change }))).toThrow(TypeError);
  });
});

const rejectedCodes: readonly OperationRejectedCode[] = [
  "QUOTA_EXCEEDED",
  "CATALOG_UNAVAILABLE",
  "TRAVEL_DATA_UNAVAILABLE",
  "FX_UNAVAILABLE",
  "STALE_REVISION",
  "INVALID_ITINERARY_INPUT",
  "USD_DISABLED",
  "NO_FEASIBLE_ITINERARY",
  "ITINERARY_SEARCH_LIMIT",
  "INVALID_ITINERARY_RESULT",
  "PLAN_NOT_FOUND",
  "PLAN_UNAVAILABLE",
  "SNAPSHOT_MISMATCH",
  "LOCKED_ITEM_INVALID",
];

describe("strict operation decision parser", () => {
  it("accepts each decision state with its exact shape", () => {
    expect(parseOperationDecision({
      state: "claimed",
      leaseToken: ids.lease,
      leaseExpiresAt: "2099-09-05T00:00:00.000Z",
      planId: ids.plan,
      plannerReservationId: ids.plannerReservation,
      geminiReservationId: ids.geminiReservation,
    })).toEqual({
      state: "claimed",
      leaseToken: ids.lease,
      leaseExpiresAt: "2099-09-05T00:00:00.000Z",
      planId: ids.plan,
      plannerReservationId: ids.plannerReservation,
      geminiReservationId: ids.geminiReservation,
    });
    expect(parseOperationDecision({ state: "in_progress" })).toEqual({ state: "in_progress" });
    expect(parseOperationDecision({ state: "completed", planId: ids.plan, revision: 2 })).toEqual({
      state: "completed",
      planId: ids.plan,
      revision: 2,
    });
    expect(parseOperationDecision({ state: "rejected", errorCode: "QUOTA_EXCEEDED" })).toEqual({
      state: "rejected",
      errorCode: "QUOTA_EXCEEDED",
    });
    expect(parseOperationDecision({ state: "interrupted" })).toEqual({ state: "interrupted" });
    expect(parseOperationDecision({ state: "conflict" })).toEqual({ state: "conflict" });
    expect(parseOperationDecision({ state: "missing" })).toEqual({ state: "missing" });
  });

  it.each(rejectedCodes)("accepts the allowlisted rejected code %s", (code) => {
    expect(parseOperationRejectedCode(code)).toBe(code);
    expect(parseOperationDecision({ state: "rejected", errorCode: code })).toEqual({ state: "rejected", errorCode: code });
  });

  it.each([
    null,
    undefined,
    [],
    { state: "terminal" },
    { state: "conflict", operationState: "rejected" },
    { state: "in_progress", planId: ids.plan },
    { state: "claimed", leaseToken: "not-a-uuid", leaseExpiresAt: "2099-09-05T00:00:00.000Z", planId: ids.plan, plannerReservationId: ids.plannerReservation, geminiReservationId: ids.geminiReservation },
    { state: "claimed", leaseToken: ids.lease, leaseExpiresAt: "2099-09-05T00:00:00.0001Z", planId: ids.plan, plannerReservationId: ids.plannerReservation, geminiReservationId: ids.geminiReservation },
    { state: "claimed", leaseToken: ids.lease, leaseExpiresAt: "2099-09-05T00:00:00.000Z", planId: ids.plan, plannerReservationId: ids.plannerReservation, geminiReservationId: ids.plannerReservation },
    { state: "completed", planId: ids.plan, revision: 0 },
    { state: "completed", planId: ids.plan, revision: 1.5 },
    { state: "rejected", errorCode: "UNKNOWN" },
    { state: "rejected", errorCode: "QUOTA_EXCEEDED", message: "raw PII" },
    { state: "interrupted", operationState: "interrupted" },
  ])("rejects malformed, unknown-key, unsafe, and invented terminal decisions: %j", (value) => {
    expect(parseOperationDecision(value)).toBeNull();
  });

  it.each(["", "UNKNOWN", null, 1, {}, "QUOTA_EXCEEDED "])("rejects a non-allowlisted rejection code: %j", (value) => {
    expect(parseOperationRejectedCode(value)).toBeNull();
  });
});
