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
      { key: "item.score", itemIndex: 1, placeId: "place-market" },
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

      const forged = clone(repaired.value);
      forged.items[0].score = 0;
      forged.totals.score = 0;
      const invalid = validateItinerary(setup.input, forged, remainingRankOrder);
      expect(invalid.valid).toBe(false);
      if (!invalid.valid) expect(invalid.issues.some((issue) => issue.key === "item.score")).toBe(true);
    }
    expect(setup).toEqual(before);
  });

  it("never excludes a locked item even when the validator names it", () => {
    const setup = repairSetup();
    const issues: ValidationIssue[] = [
      { key: "item.duration", itemIndex: 0, placeId: "place-banh-mi" },
    ];

    const repaired = repairItinerary(setup.input, setup.invalid, issues, setup.rankOrder);

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
    if (repaired.ok) expect(repaired.value.items.map((item) => item.placeId)).not.toContain("place-market");
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
});
