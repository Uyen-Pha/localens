// @vitest-environment node

import { describe, expect, it } from "vitest";

import { validateItinerary } from "@/lib/domain/itinerary/validator";
import { itineraryFixture } from "@/tests/fixtures/itinerary/catalog.v1";
import type { ItineraryResult } from "@/lib/domain/itinerary/contracts";

const clone = <T>(value: T): T => structuredClone(value);

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
        score: 5_001,
      },
    ],
    totals: {
      durationMinutes: 105,
      visitMinutes: 45,
      travelMinutes: 0,
      transitionBufferMinutes: 0,
      groupCostVnd: 360_000,
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

  it("is total for null, malformed, and adversarial result values", () => {
    const adversarial = {
      get items() {
        throw new Error("getter must not escape validator");
      },
    };

    expectIssue(validateItinerary(itineraryFixture, null, ["place-banh-mi"]), "result.malformed");
    expectIssue(validateItinerary(itineraryFixture, adversarial, []), "result.malformed");
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
    result.totals = { durationMinutes: 180, visitMinutes: 105, travelMinutes: 0, transitionBufferMinutes: 10, groupCostVnd: 600_000, score: 9_003 };
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

    expectIssue(validateItinerary(itineraryFixture, validResult(), []), "rank_order");
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
});
