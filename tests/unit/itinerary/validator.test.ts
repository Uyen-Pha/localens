// @vitest-environment node

import { describe, expect, it } from "vitest";

import { validateItinerary } from "@/lib/domain/itinerary/validator";
import { itineraryFixture } from "@/tests/fixtures/itinerary/catalog.v1";
import type { EngineInput, ItineraryResult } from "@/lib/domain/itinerary/contracts";
import { filterCandidates } from "@/lib/domain/itinerary/candidate-filter";
import { buildRankOrder } from "@/lib/domain/itinerary/scoring";

const clone = <T>(value: T): T => structuredClone(value);

const zeroFoodItemFields = {
  foodSelection: null,
  foodCostMinVnd: 0,
  foodCostMaxVnd: 0,
  payAtVendorMinVnd: 0,
  payAtVendorMaxVnd: 0,
  customerPayableVnd: 0,
} as const;

const zeroFoodTotalsFields = {
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
} as const;

const banhMiSelection = {
  vendorId: "vendor-banh-mi-legacy",
  menuItemId: "menu-banh-mi-legacy",
  quantity: 2,
  priceVndMin: 30_000,
  priceVndMax: 40_000,
  paymentMode: "pay_at_vendor" as const,
  activity: "Taste and discuss the selected dish",
};

function validResult(): ItineraryResult {
  return {
    normalizedStartAt: "2026-09-05T08:00:00+07:00",
    budgetVnd: 2_000_000,
    rankingSource: "deterministic",
    items: [
      {
        placeId: "place-banh-mi",
        startAt: "2026-09-05T09:00:00+07:00",
        endAt: "2026-09-05T09:45:00+07:00",
        visitDurationMinutes: 45,
        travelMinutesBefore: 0,
        transitionBufferMinutesBefore: 0,
        travelCostVndBefore: 0,
        placeCostVnd: 360_000,
        foodSelection: banhMiSelection,
        foodCostMinVnd: 60_000,
        foodCostMaxVnd: 80_000,
        payAtVendorMinVnd: 60_000,
        payAtVendorMaxVnd: 80_000,
        customerPayableVnd: 360_000,
        score: 5_001,
      },
    ],
    totals: {
      durationMinutes: 105,
      visitMinutes: 45,
      travelMinutes: 0,
      transitionBufferMinutes: 0,
      ...zeroFoodTotalsFields,
      admissionCostVnd: 360_000,
      foodCostMinVnd: 60_000,
      foodCostMaxVnd: 80_000,
      customerPayableVnd: 360_000,
      payAtVendorMinVnd: 60_000,
      payAtVendorMaxVnd: 80_000,
      groupCostMinVnd: 420_000,
      groupCostMaxVnd: 440_000,
      groupCostVnd: 440_000,
      score: 5_001,
    },
    snapshotIds: {
      catalog: "catalog-v1-2026-09-05",
      travel: "travel-v1-2026-09-05",
      fx: null,
    },
  };
}

function expectIssue(result: ReturnType<typeof validateItinerary>, key: string) {
  expect(result.valid).toBe(false);
  if (!result.valid) expect(result.issues.some((issue) => issue.key === key)).toBe(true);
}

describe("validateItinerary", () => {
  it("accepts a fully authoritative result", () => {
    expect(validateItinerary(itineraryFixture, validResult(), ["place-banh-mi"])).toEqual({
      valid: true,
    });
  });

  it("keeps default rank coverage strict and uses the full filtered count for scores", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = [];
    input.request.dietaryRequirements = [];
    input.request.mobilityRequirements = [];
    input.catalog.places.forEach((place) => {
      place.guideLanguages = ["en"];
      place.dietarySupport = {};
      place.mobilitySupport = {};
    });
    const filtered = filterCandidates(input, 2_000_000);
    expect(filtered.ok).toBe(true);
    if (!filtered.ok) return;
    const rank = buildRankOrder(filtered.value.map((place) => place.id));
    expect(rank.ok).toBe(true);
    if (!rank.ok) return;

    const result = validResult();
    const defaultValidation = validateItinerary(input, result, rank.value);
    expect(defaultValidation.valid).toBe(false);
    if (!defaultValidation.valid) {
      expect(defaultValidation.issues.some((issue) => issue.key === "item.score")).toBe(true);
      expect(defaultValidation.issues.some((issue) => issue.key === "totals.score")).toBe(true);
    }

    const partialRank = rank.value.slice(0, -1);
    const partialValidation = validateItinerary(input, result, partialRank);
    expect(partialValidation.valid).toBe(false);
    if (!partialValidation.valid) expect(partialValidation.issues.some((issue) => issue.key === "rank_order")).toBe(true);
  });

  it("rejects malformed or non-authoritative validation scopes without fail-open", () => {
    const result = validResult();
    const malformed = validateItinerary(itineraryFixture, result, ["place-banh-mi"], {
      candidateIds: ["not-in-catalog"],
    });
    expect(malformed.valid).toBe(false);
    if (!malformed.valid) expect(malformed.issues.some((issue) => issue.key === "rank_scope")).toBe(true);

    const duplicate = validateItinerary(itineraryFixture, result, ["place-banh-mi"], {
      candidateIds: ["place-banh-mi", "place-banh-mi"],
    });
    expect(duplicate.valid).toBe(false);
    if (!duplicate.valid) expect(duplicate.issues.some((issue) => issue.key === "rank_scope")).toBe(true);

    const throwingRank = [] as unknown as string[];
    Object.defineProperty(throwingRank, "0", {
      get() {
        throw new Error("hostile rank getter");
      },
      enumerable: true,
    });
    throwingRank.length = 1;
    const hostile = validateItinerary(itineraryFixture, result, throwingRank);
    expect(hostile.valid).toBe(false);
    if (!hostile.valid) {
      expect(hostile.issues.some((issue) => issue.key === "rank_order")).toBe(true);
      expect(hostile.issues.some((issue) => issue.key === "result.malformed")).toBe(false);
    }
  });

  it("is total for null, malformed, and adversarial result values", () => {
    const adversarial = {
      get items() {
        throw new Error("getter must not escape validator");
      },
    };

    expectIssue(validateItinerary(itineraryFixture, null, ["place-banh-mi"]), "result.malformed");
    expectIssue(validateItinerary(itineraryFixture, adversarial, []), "result.malformed");
  });

  it("does not let an unknown item contaminate trusted totals", () => {
    const result = validResult();
    result.items.push({
      ...zeroFoodItemFields,
      placeId: "unknown-result-place",
      startAt: "2026-09-05T10:00:00+07:00",
      endAt: "2026-09-05T12:00:00+07:00",
      visitDurationMinutes: 120,
      travelMinutesBefore: 0,
      transitionBufferMinutesBefore: 0,
      travelCostVndBefore: 0,
      placeCostVnd: 0,
      score: 0,
    });
    result.totals.durationMinutes = 240;
    result.totals.visitMinutes = 165;
    result.totals.score = 5_001;

    const validation = validateItinerary(itineraryFixture, result, ["place-banh-mi"]);

    expectIssue(validation, "candidate.membership");
    if (!validation.valid) {
      expect(validation.issues.some((issue) => issue.key === "totals.visit")).toBe(true);
      expect(validation.issues.some((issue) => issue.key === "result.malformed")).toBe(false);
    }
  });

  it("rejects a result place outside the filtered candidate set", () => {
    const result = validResult();
    result.items[0].placeId = "place-history";
    expectIssue(validateItinerary(itineraryFixture, result, ["place-banh-mi"]), "candidate.membership");
  });

  it("recomputes area, selected type, language, and mandatory support", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = [];
    input.request.dietaryRequirements = [];
    input.request.mobilityRequirements = [];
    input.catalog.places[0].areaId = "other-area";
    expectIssue(validateItinerary(input, validResult(), ["place-banh-mi"]), "candidate.area");
  });

  it("recomputes normalized budget and FX snapshot", () => {
    const result = validResult();
    result.budgetVnd = 1;
    expectIssue(validateItinerary(itineraryFixture, result, ["place-banh-mi"]), "budget.normalized");

    const usdInput = clone(itineraryFixture);
    usdInput.request.budget = { currency: "USD", amountMinor: 10_000 };
    const usdResult = validResult();
    usdResult.budgetVnd = 2_500_000;
    usdResult.snapshotIds.fx = "wrong-fx";
    expectIssue(validateItinerary(usdInput, usdResult, ["place-banh-mi"]), "snapshot.fx");
  });

  it("recomputes exact place duration and cost", () => {
    const durationResult = validResult();
    durationResult.items[0].visitDurationMinutes = 44;
    expectIssue(validateItinerary(itineraryFixture, durationResult, ["place-banh-mi"]), "item.duration");

    const costResult = validResult();
    costResult.items[0].placeCostVnd = 1;
    expectIssue(validateItinerary(itineraryFixture, costResult, ["place-banh-mi"]), "item.place_cost");
  });

  it("rejects an attacker-supplied visit duration even when end time and totals collude", () => {
    const result = validResult();
    result.items[0].visitDurationMinutes = 30;
    result.items[0].endAt = "2026-09-05T09:30:00+07:00";
    result.totals.durationMinutes = 90;
    result.totals.visitMinutes = 30;

    const validation = validateItinerary(itineraryFixture, result, ["place-banh-mi"]);

    expect(validation.valid).toBe(false);
    if (!validation.valid) {
      expect(validation.issues.some((issue) => issue.key === "item.duration")).toBe(true);
      expect(validation.issues.some((issue) => issue.key === "result.malformed")).toBe(false);
    }
  });

  it("rejects item and total scores that collude around the trusted recomputed score", () => {
    const result = validResult();
    result.items[0].score = 1;
    result.totals.score = 1;

    const validation = validateItinerary(itineraryFixture, result, ["place-banh-mi"]);

    expect(validation.valid).toBe(false);
    if (!validation.valid) {
      expect(validation.issues.some((issue) => issue.key === "item.score")).toBe(true);
      expect(validation.issues.some((issue) => issue.key === "totals.score")).toBe(true);
      expect(validation.issues.some((issue) => issue.key === "result.malformed")).toBe(false);
    }
  });

  it("reports a selected-type violation independently of result shape", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = [];
    input.request.priorityWeights = { street_food: 0, history: 5, traditional_craft: 0, traditional_market: 0 };
    const validation = validateItinerary(input, validResult(), ["place-banh-mi"]);
    expectIssue(validation, "candidate.type");
    if (!validation.valid) expect(validation.issues.some((issue) => issue.key === "result.malformed")).toBe(false);
  });

  it("reports a guide-language violation independently of result shape", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = [];
    input.request.guideLanguage = "vi";
    input.catalog.places[0].guideLanguages = ["en"];
    const validation = validateItinerary(input, validResult(), ["place-banh-mi"]);
    expectIssue(validation, "candidate.language");
    if (!validation.valid) expect(validation.issues.some((issue) => issue.key === "result.malformed")).toBe(false);
  });

  it("reports a dietary-support violation independently of result shape", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = [];
    input.request.dietaryRequirements = ["vegetarian"];
    const validation = validateItinerary(input, validResult(), ["place-banh-mi"]);
    expectIssue(validation, "candidate.dietary_support");
    if (!validation.valid) expect(validation.issues.some((issue) => issue.key === "result.malformed")).toBe(false);
  });

  it("reports a mobility-support violation independently of result shape", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = [];
    input.request.mobilityRequirements = ["wheelchair-lift"];
    const validation = validateItinerary(input, validResult(), ["place-banh-mi"]);
    expectIssue(validation, "candidate.mobility_support");
    if (!validation.valid) expect(validation.issues.some((issue) => issue.key === "result.malformed")).toBe(false);
  });

  it("recomputes directed travel, transition buffer, and travel cost", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = [];
    input.request.dietaryRequirements = [];
    input.request.mobilityRequirements = [];
    input.catalog.places[1].openingHours = [{ weekday: 5, opensAt: "08:00", closesAt: "18:00" }];
    input.catalog.places[1].dietarySupport = {};
    input.catalog.places[1].mobilitySupport = {};
    input.catalog.places[1].guideLanguages = ["en"];
    const result = validResult();
    result.items.push({
      ...zeroFoodItemFields,
      placeId: "place-history",
      startAt: "2026-09-05T10:00:00+07:00",
      endAt: "2026-09-05T11:00:00+07:00",
      visitDurationMinutes: 60,
      travelMinutesBefore: 12,
      transitionBufferMinutesBefore: 10,
      travelCostVndBefore: 0,
      placeCostVnd: 240_000,
      score: 4_002,
    });
    result.totals = {
      ...zeroFoodTotalsFields,
      durationMinutes: 180,
      visitMinutes: 105,
      travelMinutes: 12,
      transitionBufferMinutes: 10,
      groupCostVnd: 600_000,
      score: 9_003,
    };
    result.items[1].travelMinutesBefore = 11;
    expectIssue(validateItinerary(input, result, ["place-banh-mi", "place-history"]), "travel.minutes");
  });

  it("recomputes a directed transition buffer independently", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = [];
    input.request.dietaryRequirements = [];
    input.request.mobilityRequirements = [];
    input.catalog.places[1].openingHours = [{ weekday: 5, opensAt: "08:00", closesAt: "18:00" }];
    input.catalog.places[1].dietarySupport = {};
    input.catalog.places[1].mobilitySupport = {};
    input.catalog.places[1].guideLanguages = ["en"];
    const result = validResult();
    result.items.push({ ...zeroFoodItemFields, placeId: "place-history", startAt: "2026-09-05T10:00:00+07:00", endAt: "2026-09-05T11:00:00+07:00", visitDurationMinutes: 60, travelMinutesBefore: 12, transitionBufferMinutesBefore: 0, travelCostVndBefore: 0, placeCostVnd: 240_000, score: 4_002 });
    result.totals = { ...zeroFoodTotalsFields, durationMinutes: 180, visitMinutes: 105, travelMinutes: 12, transitionBufferMinutes: 10, groupCostVnd: 600_000, score: 9_003 };
    expectIssue(validateItinerary(input, result, ["place-banh-mi", "place-history"]), "travel.buffer");
  });

  it("recomputes a directed transition cost independently", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = [];
    input.request.dietaryRequirements = [];
    input.request.mobilityRequirements = [];
    input.catalog.places[1].openingHours = [{ weekday: 5, opensAt: "08:00", closesAt: "18:00" }];
    input.catalog.places[1].dietarySupport = {};
    input.catalog.places[1].mobilitySupport = {};
    input.catalog.places[1].guideLanguages = ["en"];
    const result = validResult();
    result.items.push({ ...zeroFoodItemFields, placeId: "place-history", startAt: "2026-09-05T10:00:00+07:00", endAt: "2026-09-05T11:00:00+07:00", visitDurationMinutes: 60, travelMinutesBefore: 12, transitionBufferMinutesBefore: 10, travelCostVndBefore: 1, placeCostVnd: 240_000, score: 4_002 });
    result.totals = { ...zeroFoodTotalsFields, durationMinutes: 180, visitMinutes: 105, travelMinutes: 12, transitionBufferMinutes: 10, groupCostVnd: 600_000, score: 9_003 };
    expectIssue(validateItinerary(input, result, ["place-banh-mi", "place-history"]), "travel.cost");
  });

  it("rejects a transition that starts before directed travel and buffer finish", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = [];
    input.request.dietaryRequirements = [];
    input.request.mobilityRequirements = [];
    input.catalog.places[1].openingHours = [{ weekday: 5, opensAt: "08:00", closesAt: "18:00" }];
    input.catalog.places[1].dietarySupport = {};
    input.catalog.places[1].mobilitySupport = {};
    input.catalog.places[1].guideLanguages = ["en"];
    const result = validResult();
    result.items.push({ ...zeroFoodItemFields, placeId: "place-history", startAt: "2026-09-05T09:50:00+07:00", endAt: "2026-09-05T10:50:00+07:00", visitDurationMinutes: 60, travelMinutesBefore: 12, transitionBufferMinutesBefore: 10, travelCostVndBefore: 0, placeCostVnd: 240_000, score: 4_002 });
    result.totals = { ...zeroFoodTotalsFields, durationMinutes: 170, visitMinutes: 105, travelMinutes: 12, transitionBufferMinutes: 10, groupCostVnd: 600_000, score: 9_003 };
    expectIssue(validateItinerary(input, result, ["place-banh-mi", "place-history"]), "travel.transition");
  });

  it("rejects a missing directed transition", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = [];
    input.request.dietaryRequirements = [];
    input.request.mobilityRequirements = [];
    input.catalog.places[1].openingHours = [{ weekday: 5, opensAt: "08:00", closesAt: "18:00" }];
    input.catalog.places[1].dietarySupport = {};
    input.catalog.places[1].mobilitySupport = {};
    input.catalog.places[1].guideLanguages = ["en"];
    const result = validResult();
    result.items.push({
      ...zeroFoodItemFields,
      placeId: "place-history",
      startAt: "2026-09-05T10:00:00+07:00",
      endAt: "2026-09-05T11:00:00+07:00",
      visitDurationMinutes: 60,
      travelMinutesBefore: 0,
      transitionBufferMinutesBefore: 10,
      travelCostVndBefore: 0,
      placeCostVnd: 240_000,
      score: 4_002,
    });
    result.totals = { ...zeroFoodTotalsFields, durationMinutes: 180, visitMinutes: 105, travelMinutes: 0, transitionBufferMinutes: 10, groupCostVnd: 600_000, score: 9_003 };
    input.travel.edges = input.travel.edges.filter((edge) => edge.fromPlaceId !== "place-banh-mi" || edge.toPlaceId !== "place-history");
    expectIssue(validateItinerary(input, result, ["place-banh-mi", "place-history"]), "travel.missing");
  });

  it("recomputes opening windows, overlap, and request start/end", () => {
    const opening = validResult();
    opening.items[0].startAt = "2026-09-05T08:00:00+07:00";
    opening.items[0].endAt = "2026-09-05T08:45:00+07:00";
    expectIssue(validateItinerary(itineraryFixture, opening, ["place-banh-mi"]), "opening_hours");

    const overlap = validResult();
    overlap.items[0].startAt = "2026-09-05T07:00:00+07:00";
    overlap.items[0].endAt = "2026-09-05T07:45:00+07:00";
    expectIssue(validateItinerary(itineraryFixture, overlap, ["place-banh-mi"]), "request.start");

    const beyond = validResult();
    beyond.items[0].endAt = "2026-09-05T21:00:00+07:00";
    expectIssue(validateItinerary(itineraryFixture, beyond, ["place-banh-mi"]), "request.duration");
  });

  it("rejects overlap and enforces locked presence and order", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = ["place-banh-mi", "place-banh-mi-2"];
    input.catalog.places.push({ ...clone(input.catalog.places[0]), id: "place-banh-mi-2" });
    const result = validResult();
    expectIssue(validateItinerary(input, result, ["place-banh-mi", "place-banh-mi-2"]), "lock.missing");

    const duplicate = validResult();
    duplicate.items.push({ ...duplicate.items[0] });
    expectIssue(validateItinerary(itineraryFixture, duplicate, ["place-banh-mi"]), "items.duplicate");
  });

  it("rejects reversed locked order", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = ["place-history", "place-banh-mi"];
    input.request.dietaryRequirements = [];
    input.request.mobilityRequirements = [];
    input.catalog.places[1].openingHours = [{ weekday: 5, opensAt: "08:00", closesAt: "18:00" }];
    input.catalog.places[1].dietarySupport = {};
    input.catalog.places[1].mobilitySupport = {};
    input.catalog.places[1].guideLanguages = ["en"];
    const result = validResult();
    result.items.push({ ...zeroFoodItemFields, placeId: "place-history", startAt: "2026-09-05T10:00:00+07:00", endAt: "2026-09-05T11:00:00+07:00", visitDurationMinutes: 60, travelMinutesBefore: 12, transitionBufferMinutesBefore: 10, travelCostVndBefore: 0, placeCostVnd: 240_000, score: 4_002 });
    result.totals = { ...zeroFoodTotalsFields, durationMinutes: 180, visitMinutes: 105, travelMinutes: 12, transitionBufferMinutes: 10, groupCostVnd: 600_000, score: 9_003 };
    expectIssue(validateItinerary(input, result, ["place-banh-mi", "place-history"]), "lock.order");
  });

  it("reports overlap between two distinct items", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = [];
    input.request.dietaryRequirements = [];
    input.request.mobilityRequirements = [];
    input.catalog.places[1].openingHours = [{ weekday: 5, opensAt: "08:00", closesAt: "18:00" }];
    input.catalog.places[1].dietarySupport = {};
    input.catalog.places[1].mobilitySupport = {};
    input.catalog.places[1].guideLanguages = ["en"];
    const result = validResult();
    result.items.push({ ...zeroFoodItemFields, placeId: "place-history", startAt: "2026-09-05T09:30:00+07:00", endAt: "2026-09-05T10:30:00+07:00", visitDurationMinutes: 60, travelMinutesBefore: 12, transitionBufferMinutesBefore: 10, travelCostVndBefore: 0, placeCostVnd: 240_000, score: 4_002 });
    result.totals = { ...zeroFoodTotalsFields, durationMinutes: 150, visitMinutes: 105, travelMinutes: 12, transitionBufferMinutes: 10, groupCostVnd: 600_000, score: 9_003 };
    expectIssue(validateItinerary(input, result, ["place-banh-mi", "place-history"]), "timeline.overlap");
  });

  it("enforces pace and the global eight-stop cap", () => {
    const input = clone(itineraryFixture);
    input.request.pace = "relaxed";
    const result = validResult();
    result.items = Array.from({ length: 4 }, (_, index) => ({
      ...result.items[0],
      placeId: index === 0 ? "place-banh-mi" : `place-${index}`,
    }));
    expectIssue(validateItinerary(input, result, ["place-banh-mi"]), "pace");
  });

  it("observes a true result with more than eight items even when the result schema rejects it", () => {
    const result = validResult();
    result.items = Array.from({ length: 9 }, () => ({ ...validResult().items[0] }));
    const validation = validateItinerary(itineraryFixture, result, ["place-banh-mi"]);
    expectIssue(validation, "global_cap");
  });

  it("recomputes snapshots, complete rank order, every item score, and all totals", () => {
    const result = validResult();
    result.snapshotIds.catalog = "wrong-catalog";
    expectIssue(validateItinerary(itineraryFixture, result, ["place-banh-mi"]), "snapshot.catalog");

    const wrongRankScore = validResult();
    wrongRankScore.items[0].score = 1;
    expectIssue(validateItinerary(itineraryFixture, wrongRankScore, ["place-banh-mi"]), "item.score");

    const wrongTotal = validResult();
    wrongTotal.totals.groupCostVnd = 1;
    expectIssue(validateItinerary(itineraryFixture, wrongTotal, ["place-banh-mi"]), "totals.group_cost");

    const wrongDuration = validResult();
    wrongDuration.totals.durationMinutes = 1;
    expectIssue(validateItinerary(itineraryFixture, wrongDuration, ["place-banh-mi"]), "totals.duration");

    const wrongVisit = validResult();
    wrongVisit.totals.visitMinutes = 1;
    expectIssue(validateItinerary(itineraryFixture, wrongVisit, ["place-banh-mi"]), "totals.visit");

    const wrongTravel = validResult();
    wrongTravel.totals.travelMinutes = 1;
    expectIssue(validateItinerary(itineraryFixture, wrongTravel, ["place-banh-mi"]), "totals.travel");

    const wrongBuffer = validResult();
    wrongBuffer.totals.transitionBufferMinutes = 1;
    expectIssue(validateItinerary(itineraryFixture, wrongBuffer, ["place-banh-mi"]), "totals.buffer");

    expectIssue(validateItinerary(itineraryFixture, validResult(), []), "rank_order");
  });

  it("checks each catalog, travel, and FX snapshot ID independently", () => {
    const wrongCatalog = validResult();
    wrongCatalog.snapshotIds.catalog = "wrong-catalog";
    expectIssue(validateItinerary(itineraryFixture, wrongCatalog, ["place-banh-mi"]), "snapshot.catalog");

    const wrongTravel = validResult();
    wrongTravel.snapshotIds.travel = "wrong-travel";
    expectIssue(validateItinerary(itineraryFixture, wrongTravel, ["place-banh-mi"]), "snapshot.travel");

    const usdInput = clone(itineraryFixture);
    usdInput.request.budget = { currency: "USD", amountMinor: 10_000 };
    const wrongFx = validResult();
    wrongFx.budgetVnd = 250_000_000;
    wrongFx.snapshotIds.fx = "wrong-fx";
    expectIssue(validateItinerary(usdInput, wrongFx, ["place-banh-mi"]), "snapshot.fx");
  });

  it("reports no PII in validation issues", () => {
    const result = validResult();
    result.items[0].placeId = "guest@example.com";
    const validation = validateItinerary(itineraryFixture, result, ["place-banh-mi"]);
    expect(validation.valid).toBe(false);
    if (!validation.valid) {
      expect(JSON.stringify(validation.issues)).not.toMatch(/guest@example\.com/);
    }
  });

  it("rejects stale, cross-parent, malformed, unsupported, and closed food facts", () => {
    const cases: Array<[string, (input: EngineInput, result: ItineraryResult) => void]> = [
      ["food.menu.parent", (_input, result) => { result.items[0].foodSelection = { ...banhMiSelection, menuItemId: "menu-market-legacy" }; }],
      ["food.price_snapshot", (_input, result) => { result.items[0].foodSelection = { ...banhMiSelection, priceVndMax: 40_001 }; }],
      ["food.quantity", (_input, result) => { result.items[0].foodSelection = { ...banhMiSelection, quantity: 1 }; }],
      ["food.payment_mode", (_input, result) => { result.items[0].foodSelection = { ...banhMiSelection, paymentMode: "included_in_quote" as const }; }],
      ["food.support", (input) => { input.catalog.places[0].foodVendors[0].menuItems[0].dietarySupport = { halal: "unknown" }; }],
      ["food.item.status", (input) => { input.catalog.places[0].foodVendors[0].menuItems[0].available = false; }],
      ["food.vendor.opening_hours", (input) => { input.catalog.places[0].foodVendors[0].openingHours = [{ weekday: 6, opensAt: "11:00", closesAt: "12:00" }]; }],
    ];

    for (const [key, mutate] of cases) {
      const input = clone(itineraryFixture);
      const result = validResult();
      mutate(input, result);
      expectIssue(validateItinerary(input, result, ["place-banh-mi"]), key);
    }
  });

  it("recomputes every food field and ignores forged client food totals", () => {
    const result = validResult();
    result.items[0].foodCostMinVnd = 0;
    result.items[0].foodCostMaxVnd = 0;
    result.items[0].payAtVendorMinVnd = 0;
    result.items[0].payAtVendorMaxVnd = 0;
    result.items[0].customerPayableVnd = 1;
    result.totals.foodCostMinVnd = 0;
    result.totals.foodCostMaxVnd = 0;
    result.totals.payAtVendorMinVnd = 0;
    result.totals.payAtVendorMaxVnd = 0;
    result.totals.groupCostMinVnd = 0;
    result.totals.groupCostMaxVnd = 0;
    result.totals.groupCostVnd = 0;
    expectIssue(validateItinerary(itineraryFixture, result, ["place-banh-mi"]), "item.food_cost");
    expectIssue(validateItinerary(itineraryFixture, result, ["place-banh-mi"]), "totals.food_cost");
  });
});
