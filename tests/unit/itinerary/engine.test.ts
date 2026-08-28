// @vitest-environment node

import { describe, expect, it } from "vitest";

import { createItinerary } from "@/lib/domain/itinerary/engine";
import { filterCandidates } from "@/lib/domain/itinerary/candidate-filter";
import { normalizeBudgetToVnd } from "@/lib/domain/itinerary/money";
import { buildRankOrder } from "@/lib/domain/itinerary/scoring";
import { validateItinerary } from "@/lib/domain/itinerary/validator";
import { itineraryFixture, usdItineraryFixture } from "@/tests/fixtures/itinerary/catalog.v1";

const clone = <T>(value: T): T => structuredClone(value);

describe("createItinerary", () => {
  it("runs the canonical pipeline and returns an authoritative valid result", () => {
    const first = createItinerary(itineraryFixture);
    const second = createItinerary(itineraryFixture);

    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const budget = normalizeBudgetToVnd(itineraryFixture.request, itineraryFixture.fx, itineraryFixture.asOfUtc);
    expect(budget.ok).toBe(true);
    if (!budget.ok) return;
    const filtered = filterCandidates(itineraryFixture, budget.value.budgetVnd);
    expect(filtered.ok).toBe(true);
    if (!filtered.ok) return;
    const rankOrder = buildRankOrder(filtered.value.map((place) => place.id));
    expect(rankOrder.ok).toBe(true);
    if (!rankOrder.ok) return;
    expect(validateItinerary(itineraryFixture, first.value, rankOrder.value)).toEqual({ valid: true });
  });

  it("accepts a valid ranking subset and preserves its source", () => {
    const input = clone(itineraryFixture);
    input.request.dietaryRequirements = [];
    input.request.mobilityRequirements = [];
    input.catalog.places.forEach((place) => {
      place.guideLanguages = ["en"];
      place.dietarySupport = {};
      place.mobilitySupport = {};
    });
    const result = createItinerary(input, ["place-history"], "ai");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.rankingSource).toBe("ai");
  });

  it("rejects malformed, duplicate, and unknown ranked subsets without throwing", () => {
    expect(createItinerary(itineraryFixture, ["place-banh-mi", "place-banh-mi"])).toMatchObject({
      ok: false,
      error: { code: "INVALID_ITINERARY_INPUT" },
    });
    expect(createItinerary(itineraryFixture, ["not-in-catalog"])).toMatchObject({
      ok: false,
      error: { code: "INVALID_ITINERARY_INPUT" },
    });
    expect(createItinerary(null)).toMatchObject({
      ok: false,
      error: { code: "INVALID_ITINERARY_INPUT" },
    });
    expect(createItinerary({ request: { get startAt(): string { throw new Error("getter"); } } })).toMatchObject({
      ok: false,
      error: { code: "INVALID_ITINERARY_INPUT" },
    });
  });

  it("propagates authoritative USD and no-feasible errors", () => {
    const staleUsd = clone(usdItineraryFixture);
    staleUsd.asOfUtc = "2026-09-13T01:01:00Z";
    expect(createItinerary(staleUsd)).toMatchObject({
      ok: false,
      error: { code: "USD_DISABLED", retryable: false },
    });

    const impossible = clone(itineraryFixture);
    impossible.request.budget = { currency: "VND", amountMinor: 0 };
    expect(createItinerary(impossible)).toMatchObject({
      ok: false,
      error: { code: "NO_FEASIBLE_ITINERARY", retryable: false },
    });
  });

  it("propagates the scheduler search-limit error without changing its retryability", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = ["lock-a", "lock-b"];
    input.request.areas = ["district-1"];
    input.request.durationMinutes = 720;
    input.request.pace = "active";
    input.request.dietaryRequirements = [];
    input.request.mobilityRequirements = [];
    const place = (id: string) => ({
      id,
      areaId: "district-1",
      types: ["history"] as ["history"],
      priceVndPerPerson: 10_000,
      visitDurationMinutes: 15,
      guideLanguages: ["en"] as ["en"],
      dietarySupport: {},
      mobilitySupport: {},
      openingHours: [{ weekday: 6 as const, opensAt: "08:00", closesAt: "20:00" }],
      openingExceptions: [],
      foodVendors: [],
    });
    const unlocked = Array.from({ length: 10 }, (_, index) => place(`u-${String(index).padStart(2, "0")}`));
    input.catalog.places = [...unlocked, place("lock-a"), place("lock-b")];
    input.travel.edges = unlocked.flatMap((from) => unlocked
      .filter((to) => to.id !== from.id)
      .map((to) => ({
        fromPlaceId: from.id,
        toPlaceId: to.id,
        mode: "walk" as const,
        minutes: 1,
        groupCostVnd: 0,
        verifiedAt: "2026-09-04T18:00:00+07:00",
      })));

    expect(createItinerary(input)).toEqual({
      ok: false,
      error: {
        code: "ITINERARY_SEARCH_LIMIT",
        messageKey: "itinerary.search_limit",
        retryable: true,
      },
    });
  });
});
