import type { EngineInput } from "@/lib/domain/itinerary/contracts";

export const itineraryFixture: EngineInput = {
  request: {
    startAt: "2026-09-05T01:00:00Z",
    durationMinutes: 360,
    areas: ["district-1", "district-5"],
    budget: { currency: "VND", amountMinor: 2_000_000 },
    partySize: 2,
    guideLanguage: "en",
    priorityWeights: {
      street_food: 5,
      history: 4,
      traditional_craft: 3,
      traditional_market: 2,
    },
    pace: "balanced",
    dietaryRequirements: ["halal"],
    mobilityRequirements: ["step-free"],
    lockedStopIds: ["place-banh-mi"],
  },
  catalog: {
    id: "catalog-v1-2026-09-05",
    places: [
      {
        id: "place-banh-mi",
        areaId: "district-1",
        types: ["street_food"],
        priceVndPerPerson: 180_000,
        visitDurationMinutes: 45,
        guideLanguages: ["en", "vi"],
        dietarySupport: { halal: "supported", vegetarian: "unknown" },
        mobilitySupport: { "step-free": "supported" },
        openingHours: [
          { weekday: 5, opensAt: "08:00", closesAt: "12:00" },
          { weekday: 5, opensAt: "13:00", closesAt: "18:00" },
        ],
        openingExceptions: [
          {
            localDate: "2026-09-05",
            closed: false,
            windows: [{ opensAt: "09:00", closesAt: "17:00" }],
          },
        ],
      },
      {
        id: "place-history",
        areaId: "district-1",
        types: ["history"],
        priceVndPerPerson: 120_000,
        visitDurationMinutes: 60,
        guideLanguages: ["en"],
        dietarySupport: { halal: "unsupported" },
        mobilitySupport: { "step-free": "supported" },
        openingHours: [
          { weekday: 5, opensAt: "22:00", closesAt: "02:00" },
        ],
        openingExceptions: [],
      },
      {
        id: "place-craft",
        areaId: "district-5",
        types: ["traditional_craft"],
        priceVndPerPerson: 250_000,
        visitDurationMinutes: 90,
        guideLanguages: ["vi"],
        dietarySupport: { halal: "unknown" },
        mobilitySupport: { "step-free": "unsupported" },
        openingHours: [
          { weekday: 5, opensAt: "09:00", closesAt: "16:00" },
        ],
        openingExceptions: [
          { localDate: "2026-09-06", closed: true, windows: [] },
        ],
      },
      {
        id: "place-market",
        areaId: "district-5",
        types: ["traditional_market"],
        priceVndPerPerson: 80_000,
        visitDurationMinutes: 30,
        guideLanguages: ["en", "vi"],
        dietarySupport: { halal: "supported" },
        mobilitySupport: { "step-free": "unknown" },
        openingHours: [
          { weekday: 5, opensAt: "06:00", closesAt: "11:00" },
        ],
        openingExceptions: [],
      },
    ],
  },
  travel: {
    id: "travel-v1-2026-09-05",
    edges: [
      {
        fromPlaceId: "place-banh-mi",
        toPlaceId: "place-history",
        mode: "walk",
        minutes: 12,
        groupCostVnd: 0,
        verifiedAt: "2026-09-04T18:00:00+07:00",
      },
      {
        fromPlaceId: "place-history",
        toPlaceId: "place-banh-mi",
        mode: "taxi",
        minutes: 8,
        groupCostVnd: 45_000,
        verifiedAt: "2026-09-04T18:00:00+07:00",
      },
      {
        fromPlaceId: "place-craft",
        toPlaceId: "place-market",
        mode: "public_transport",
        minutes: 20,
        groupCostVnd: 30_000,
        verifiedAt: "2026-09-04T18:00:00+07:00",
      },
    ],
  },
  fx: {
    id: "fx-v1-2026-09-05",
    vndPerUsd: "25000.00000000",
    observedAtUtc: "2026-09-05T01:00:00Z",
  },
  asOfUtc: "2026-09-05T01:00:00Z",
};

export const usdItineraryFixture: EngineInput = {
  ...itineraryFixture,
  request: {
    ...itineraryFixture.request,
    budget: { currency: "USD", amountMinor: 10_000 },
  },
};

export const budgetBoundaryFixture: EngineInput = {
  ...itineraryFixture,
  request: {
    ...itineraryFixture.request,
    budget: { currency: "VND", amountMinor: 0 },
  },
};
