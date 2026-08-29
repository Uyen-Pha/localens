// @vitest-environment node

import { describe, expect, it } from "vitest";

import { filterCandidates } from "@/lib/domain/itinerary/candidate-filter";
import type { FoodVendorCandidate } from "@/lib/domain/food/contracts";
import { itineraryFixture } from "@/tests/fixtures/itinerary/catalog.v1";

const clone = <T>(value: T): T => structuredClone(value);

const marketVendor = (): FoodVendorCandidate => ({
  id: "vendor-market-filter",
  placeId: "place-market",
  slug: "vendor-market-filter",
  title: { en: "Market stall", vi: "Sạp chợ" },
  description: { en: "A market stall", vi: "Một sạp chợ" },
  locationNote: "Aisle A",
  serviceType: "stall",
  capacityNote: "Small group",
  dietarySupport: { halal: "supported" },
  mobilitySupport: { "step-free": "supported" },
  openingHours: [{ weekday: 6, opensAt: "08:00", closesAt: "17:00" }],
  openingExceptions: [],
  status: "sellable",
  menuItems: [{
    id: "menu-market-filter",
    vendorId: "vendor-market-filter",
    slug: "market-noodles",
    title: { en: "Market noodles", vi: "Mì chợ" },
    description: { en: "A bowl", vi: "Một tô" },
    servingUnit: "bowl",
    priceVndMin: 40_000,
    priceVndMax: 50_000,
    portionDescription: "One bowl",
    dietarySupport: { halal: "supported" },
    allergens: [],
    available: false,
    status: "sellable",
    verifiedAt: "2026-08-28",
  }],
});

describe("filterCandidates", () => {
  it("returns only candidates satisfying all catalog hard constraints in ID order", () => {
    const result = filterCandidates(itineraryFixture, 2_000_000);

    expect(result).toEqual({
      ok: true,
      value: [itineraryFixture.catalog.places[0]],
    });
  });

  it("keeps a locked candidate whose types all have zero weight", () => {
    const input = clone(itineraryFixture);
    input.request.priorityWeights = {
      ...input.request.priorityWeights,
      street_food: 0,
    };

    const result = filterCandidates(input, 2_000_000);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.map((place) => place.id)).toEqual(["place-banh-mi"]);
  });

  it("rejects unknown support values for mandatory requirements", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = [];
    input.request.dietaryRequirements = ["vegetarian"];

    const result = filterCandidates(input, 2_000_000);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it("rejects a locked place absent from the catalog with a stable domain failure", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = ["missing-place"];

    const result = filterCandidates(input, 2_000_000);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "NO_FEASIBLE_ITINERARY",
        messageKey: "itinerary.locked_stop.ineligible",
        retryable: false,
        issueKeys: ["request.lockedStopIds.0"],
      },
    });
  });

  it("rejects a locked place that fails a non-time hard constraint", () => {
    const input = clone(itineraryFixture);
    input.catalog.places[0].guideLanguages = ["vi"];

    const result = filterCandidates(input, 2_000_000);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NO_FEASIBLE_ITINERARY");
      expect(result.error.issueKeys).toEqual(["request.lockedStopIds.0"]);
    }
  });

  it("does not include a candidate whose single-place group cost exceeds budget", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = [];
    input.request.priorityWeights = {
      ...input.request.priorityWeights,
      history: 5,
      traditional_craft: 5,
      traditional_market: 5,
    };

    const result = filterCandidates(input, 100_000);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it("returns catalog candidates in lexicographic order regardless of input order", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = [];
    input.request.dietaryRequirements = [];
    input.request.mobilityRequirements = [];
    input.catalog.places.forEach((place) => {
      place.guideLanguages = ["en"];
      place.dietarySupport = { halal: "supported" };
      place.mobilitySupport = { "step-free": "supported" };
    });
    input.catalog.places.reverse();

    const result = filterCandidates(input, 2_000_000);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.map((place) => place.id)).toEqual([
      "place-banh-mi",
      "place-craft",
      "place-history",
      "place-market",
    ]);
  });

  it("never accepts a non-sellable or inactive candidate when optional catalog flags exist", () => {
    const input = clone(itineraryFixture) as typeof itineraryFixture & {
      catalog: { places: Array<(typeof itineraryFixture.catalog.places)[number] & { active?: boolean; sellable?: boolean }> };
    };
    input.request.lockedStopIds = [];
    input.request.dietaryRequirements = [];
    input.request.mobilityRequirements = [];
    input.catalog.places[2].guideLanguages = ["en"];
    input.catalog.places[2].dietarySupport = { halal: "supported" };
    input.catalog.places[2].mobilitySupport = { "step-free": "supported" };
    (input.catalog.places[0] as { active?: boolean }).active = false;
    (input.catalog.places[1] as { sellable?: boolean }).sellable = false;

    const result = filterCandidates(input, 2_000_000);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.map((place) => place.id)).toEqual([
      "place-craft",
      "place-market",
    ]);
  });

  it("keeps museum/history filtering unchanged when the request is food-prioritized", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = [];
    input.request.areas = ["district-1"];
    input.request.dietaryRequirements = [];
    input.request.mobilityRequirements = [];
    input.request.priorityWeights = {
      street_food: 5,
      history: 4,
      traditional_craft: 0,
      traditional_market: 0,
    };
    input.catalog.places = [
      { ...input.catalog.places[1], types: ["history"] },
    ];

    const result = filterCandidates(input, 2_000_000);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.map((candidate) => candidate.id)).toEqual([
      "place-history",
    ]);
  });

  it("requires a concrete food selection before admitting a food-priority market", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = [];
    input.request.areas = ["district-5"];
    input.request.dietaryRequirements = ["halal"];
    input.request.mobilityRequirements = ["step-free"];
    input.request.priorityWeights = {
      street_food: 5,
      history: 0,
      traditional_craft: 0,
      traditional_market: 5,
    };
    input.catalog.places = [{
      ...input.catalog.places[3],
      mobilitySupport: { "step-free": "supported" },
      foodVendors: [marketVendor()],
    }];

    const result = filterCandidates(input, 2_000_000);

    expect(result).toEqual({ ok: true, value: [] });
  });
});
