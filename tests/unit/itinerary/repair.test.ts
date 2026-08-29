// @vitest-environment node

import { describe, expect, it } from "vitest";

import { filterCandidates } from "@/lib/domain/itinerary/candidate-filter";
import { normalizeBudgetToVnd } from "@/lib/domain/itinerary/money";
import { buildRankOrder } from "@/lib/domain/itinerary/scoring";
import { repairItinerary } from "@/lib/domain/itinerary/repair";
import { validateItinerary } from "@/lib/domain/itinerary/validator";
import { itineraryFixture } from "@/tests/fixtures/itinerary/catalog.v1";
import type { ItineraryResult } from "@/lib/domain/itinerary/contracts";
import type { ValidationIssue } from "@/lib/domain/itinerary/validator";

const clone = <T>(value: T): T => structuredClone(value);

function repairSetup() {
  const input = clone(itineraryFixture);
  input.request.lockedStopIds = ["place-banh-mi"];
  input.request.dietaryRequirements = [];
  input.request.mobilityRequirements = [];
  input.catalog.places.forEach((place) => {
    place.guideLanguages = ["en"];
    place.dietarySupport = {};
    place.mobilitySupport = {};
  });
  const budget = normalizeBudgetToVnd(input.request, input.fx, input.asOfUtc);
  if (!budget.ok) throw new Error("fixture budget should normalize");
  const filtered = filterCandidates(input, budget.value.budgetVnd);
  if (!filtered.ok) throw new Error("fixture should filter");
  const rank = buildRankOrder(filtered.value.map((place) => place.id));
  if (!rank.ok) throw new Error("fixture should rank");
  const invalid: ItineraryResult = {
    normalizedStartAt: "2026-09-05T08:00:00+07:00",
    budgetVnd: budget.value.budgetVnd,
    rankingSource: "deterministic",
    items: [
      {
        placeId: "place-market",
        startAt: "2026-09-05T08:00:00+07:00",
        endAt: "2026-09-05T08:30:00+07:00",
        visitDurationMinutes: 30,
        travelMinutesBefore: 0,
        transitionBufferMinutesBefore: 0,
        travelCostVndBefore: 0,
        placeCostVnd: 160_000,
        foodSelection: {
          vendorId: "vendor-market-legacy",
          menuItemId: "menu-market-legacy",
          quantity: 2,
          priceVndMin: 20_000,
          priceVndMax: 30_000,
          paymentMode: "pay_at_vendor",
          activity: "Taste and discuss the selected dish",
        },
        foodCostMinVnd: 40_000,
        foodCostMaxVnd: 60_000,
        payAtVendorMinVnd: 40_000,
        payAtVendorMaxVnd: 60_000,
        customerPayableVnd: 160_000,
        score: 0,
      },
      {
        placeId: "place-banh-mi",
        startAt: "2026-09-05T09:00:00+07:00",
        endAt: "2026-09-05T09:45:00+07:00",
        visitDurationMinutes: 45,
        travelMinutesBefore: 0,
        transitionBufferMinutesBefore: 0,
        travelCostVndBefore: 0,
        placeCostVnd: 360_000,
        foodSelection: {
          vendorId: "vendor-banh-mi-legacy",
          menuItemId: "menu-banh-mi-legacy",
          quantity: 2,
          priceVndMin: 30_000,
          priceVndMax: 40_000,
          paymentMode: "pay_at_vendor",
          activity: "Taste and discuss the selected dish",
        },
        foodCostMinVnd: 60_000,
        foodCostMaxVnd: 80_000,
        payAtVendorMinVnd: 60_000,
        payAtVendorMaxVnd: 80_000,
        customerPayableVnd: 360_000,
        score: 0,
      },
    ],
    totals: {
      durationMinutes: 0,
      visitMinutes: 0,
      travelMinutes: 0,
      transitionBufferMinutes: 0,
      admissionCostVnd: 0,
      foodCostMinVnd: 0,
      foodCostMaxVnd: 0,
      travelCostVnd: 0,
      guideCostVnd: 0,
      payAtVendorMinVnd: 0,
      payAtVendorMaxVnd: 0,
      customerPayableVnd: 0,
      groupCostMinVnd: 0,
      groupCostMaxVnd: 0,
      groupCostVnd: 0,
      score: 0,
    },
    snapshotIds: {
      catalog: input.catalog.id,
      travel: input.travel.id,
      fx: null,
    },
  };
  return { input, filtered: filtered.value, rankOrder: rank.value, invalid };
}

describe("repairItinerary", () => {
  it("excludes only named unlocked issue IDs and reruns with the matching rank order", () => {
    const setup = repairSetup();
    const before = clone(setup);
    const issues: ValidationIssue[] = [
      { key: "item.score", itemIndex: 0, placeId: "place-market" },
    ];

    const repaired = repairItinerary(
      setup.input,
      setup.invalid,
      issues,
      setup.rankOrder,
    );

    expect(repaired.ok).toBe(true);
    if (repaired.ok) {
      expect(repaired.value.items.map((item) => item.placeId)).not.toContain("place-market");
      expect(repaired.value.items.map((item) => item.placeId)).toContain("place-banh-mi");
      const remainingRankOrder = setup.rankOrder.filter((id) => id !== "place-market");
      expect(validateItinerary(setup.input, repaired.value, remainingRankOrder)).toEqual({ valid: true });
      expect(validateItinerary(setup.input, repaired.value, remainingRankOrder, {
        candidateIds: remainingRankOrder,
      })).toEqual({ valid: true });

      const forged = clone(repaired.value);
      forged.items[0].score = 0;
      forged.totals.score = 0;
      const invalid = validateItinerary(setup.input, forged, remainingRankOrder, {
        candidateIds: remainingRankOrder,
      });
      expect(invalid.valid).toBe(false);
      if (!invalid.valid) expect(invalid.issues.some((issue) => issue.key === "item.score")).toBe(true);
    }
    expect(setup).toEqual(before);
  });

  it("never excludes a locked item even when the validator names it", () => {
    const setup = repairSetup();
    const invalidResult = clone(setup.invalid);
    invalidResult.items[0].placeId = "place-banh-mi";
    invalidResult.items[0].foodSelection = {
      vendorId: "vendor-banh-mi-legacy",
      menuItemId: "menu-banh-mi-legacy",
      quantity: 2,
      priceVndMin: 30_000,
      priceVndMax: 40_000,
      paymentMode: "pay_at_vendor",
      activity: "Taste and discuss the selected dish",
    };
    const issues: ValidationIssue[] = [
      { key: "item.duration", itemIndex: 0, placeId: "place-banh-mi" },
    ];

    const repaired = repairItinerary(setup.input, invalidResult, issues, setup.rankOrder);

    expect(repaired.ok).toBe(true);
    if (repaired.ok) {
      expect(repaired.value.items.map((item) => item.placeId)).toContain("place-banh-mi");
    }
  });

  it("does not let unknown or duplicate issue IDs escape the safe Result boundary", () => {
    const setup = repairSetup();
    const repaired = repairItinerary(
      setup.input,
      setup.invalid,
      [
        { key: "candidate.membership", placeId: "unknown@example.com" },
        { key: "candidate.membership", placeId: "place-market" },
        { key: "candidate.membership", placeId: "place-market" },
      ],
      setup.rankOrder,
    );

    expect(repaired.ok).toBe(true);
    if (repaired.ok) expect(repaired.value.items[0]?.score).toBe(5_003);
  });

  it("ignores a forged issue whose index and place ID do not match the invalid result", () => {
    const setup = repairSetup();
    const repaired = repairItinerary(
      setup.input,
      setup.invalid,
      [{ key: "item.score", itemIndex: 0, placeId: "place-history" }],
      setup.rankOrder,
    );

    expect(repaired.ok).toBe(true);
    if (repaired.ok) expect(repaired.value.items[0]?.score).toBe(5_003);
  });

  it("returns stable domain errors for adversarial runtime arguments", () => {
    const setup = repairSetup();
    const throwing = {
      get key(): string {
        throw new Error("hostile getter");
      },
    };

    const result = repairItinerary(
      null as unknown as typeof setup.input,
      setup.invalid,
      [throwing] as unknown as ValidationIssue[],
      null as unknown as string[],
    );

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_ITINERARY_INPUT" } });
  });

  it("preserves the locked food selection exactly", () => {
    const setup = repairSetup();
    const locked = clone(setup.invalid.items[1].foodSelection);
    const repaired = repairItinerary(setup.input, setup.invalid, [], setup.rankOrder);

    expect(repaired.ok).toBe(true);
    if (repaired.ok) {
      expect(repaired.value.items.find((item) => item.placeId === "place-banh-mi")?.foodSelection).toEqual(locked);
    }
  });

  it("returns NO_FEASIBLE_ITINERARY when a locked food selection cannot be verified", () => {
    const setup = repairSetup();
    setup.invalid.items[1].foodSelection = {
      ...setup.invalid.items[1].foodSelection!,
      menuItemId: "stale-menu-id",
    };

    expect(repairItinerary(setup.input, setup.invalid, [], setup.rankOrder)).toMatchObject({
      ok: false,
      error: { code: "NO_FEASIBLE_ITINERARY" },
    });
  });

  it("replaces an invalid unlocked food selection with a canonical choice", () => {
    const setup = repairSetup();
    setup.input.request.lockedStopIds = [];
    setup.input.catalog.places = [setup.input.catalog.places[3]];
    setup.input.catalog.places[0].openingHours = [{ weekday: 6, opensAt: "06:00", closesAt: "18:00" }];
    setup.invalid.items = [{
      ...setup.invalid.items[0],
      placeId: "place-market",
      foodSelection: { ...setup.invalid.items[0].foodSelection!, menuItemId: "untrusted-menu" },
    }];
    setup.rankOrder = ["place-market"];

    const repaired = repairItinerary(setup.input, setup.invalid, [], setup.rankOrder);

    expect(repaired.ok).toBe(true);
    if (repaired.ok) expect(repaired.value.items[0]?.foodSelection?.menuItemId).toBe("menu-market-legacy");
  });
});
