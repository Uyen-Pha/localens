// @vitest-environment node

import { describe, expect, it } from "vitest";

import { createItinerary } from "@/lib/domain/itinerary/engine";
import { filterCandidates } from "@/lib/domain/itinerary/candidate-filter";
import { normalizeBudgetToVnd } from "@/lib/domain/itinerary/money";
import { buildRankOrder } from "@/lib/domain/itinerary/scoring";
import { validateItinerary } from "@/lib/domain/itinerary/validator";
import { itineraryFixture } from "@/tests/fixtures/itinerary/catalog.v1";

const clone = <T>(value: T): T => structuredClone(value);

describe("itinerary engine invariants", () => {
  it("holds the domain invariants across 36 deterministic input variations", () => {
    const variants = Array.from({ length: 36 }, (_, index) => {
      const input = clone(itineraryFixture);
      input.request.areas = index % 2 === 0
        ? ["district-1", "district-5"]
        : ["district-5", "district-1"];
      input.request.budget = { currency: "VND", amountMinor: 2_000_000 - (index % 6) * 50_000 };
      input.request.durationMinutes = 360 + (index % 5) * 15;
      input.request.pace = (["relaxed", "balanced", "active"] as const)[index % 3];
      input.request.priorityWeights = {
        street_food: (index % 5) + 1 as 1 | 2 | 3 | 4 | 5,
        history: index % 2 === 0 ? 4 : 3,
        traditional_craft: 3,
        traditional_market: 2,
      };
      return input;
    });

    expect(variants).toHaveLength(36);
    for (const input of variants) {
      const first = createItinerary(input);
      const second = createItinerary(input);
      expect(first).toEqual(second);
      if (!first.ok) {
        expect([
          "INVALID_ITINERARY_INPUT",
          "USD_DISABLED",
          "NO_FEASIBLE_ITINERARY",
          "ITINERARY_SEARCH_LIMIT",
          "INVALID_ITINERARY_RESULT",
        ]).toContain(first.error.code);
        continue;
      }

      const result = first.value;
      const ids = result.items.map((item) => item.placeId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(result.items.length).toBeLessThanOrEqual(8);
      const lockIds = input.request.lockedStopIds;
      expect(lockIds.every((id) => ids.includes(id))).toBe(true);
      expect(lockIds.map((id) => ids.indexOf(id))).toEqual([...lockIds].sort((a, b) => ids.indexOf(a) - ids.indexOf(b)).map((id) => ids.indexOf(id)));
      expect(result.budgetVnd).toBeLessThanOrEqual(input.request.budget.amountMinor);
      expect(result.totals.durationMinutes).toBeLessThanOrEqual(input.request.durationMinutes);

      const budget = normalizeBudgetToVnd(input.request, input.fx, input.asOfUtc);
      expect(budget.ok).toBe(true);
      if (!budget.ok) continue;
      const filtered = filterCandidates(input, budget.value.budgetVnd);
      expect(filtered.ok).toBe(true);
      if (!filtered.ok) continue;
      const rank = buildRankOrder(filtered.value.map((place) => place.id));
      expect(rank.ok).toBe(true);
      if (!rank.ok) continue;
      expect(validateItinerary(input, result, rank.value)).toEqual({ valid: true });
    }
  });
});
