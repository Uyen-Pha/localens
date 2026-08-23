// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  itineraryResultSchema,
  parseEngineInput,
  type EngineInput,
  type ItineraryRequest,
  type OpeningWindow,
} from "@/lib/domain/itinerary/contracts";
import { domainError } from "@/lib/domain/itinerary/errors";
import {
  budgetBoundaryFixture,
  itineraryFixture,
  usdItineraryFixture,
} from "@/tests/fixtures/itinerary/catalog.v1";

const clone = <T>(value: T): T => structuredClone(value);

function expectInvalid(source: unknown, issueKey?: string) {
  const result = parseEngineInput(source);
  expect(result.ok).toBe(false);
  if (!result.ok && issueKey) {
    expect(result.error.issueKeys?.some((key) => key.includes(issueKey))).toBe(
      true,
    );
  }
}

describe("itinerary domain contracts", () => {
  it("infers OpeningWindow weekdays as the seven literal weekday values", () => {
    const weekday: OpeningWindow["weekday"] = 6;
    expect(weekday).toBe(6);
    // @ts-expect-error OpeningWindow weekdays are restricted to 0 through 6.
    const invalidWeekday: OpeningWindow["weekday"] = 7;
    expect(invalidWeekday).toBe(7);
  });

  it("parses the complete deterministic catalog fixture", () => {
    const result = parseEngineInput(itineraryFixture);

    expect(result).toEqual({ ok: true, value: itineraryFixture });
  });

  it("accepts USD only when an FX snapshot is present", () => {
    const result = parseEngineInput(usdItineraryFixture);

    expect(result.ok).toBe(true);
  });

  it("accepts the zero-VND budget structural boundary", () => {
    expect(parseEngineInput(budgetBoundaryFixture).ok).toBe(true);
  });

  it("rejects a request start without an explicit offset", () => {
    const source = clone(itineraryFixture);
    source.request.startAt = "2026-09-05T01:00:00";

    expectInvalid(source, "request.startAt");
  });

  it("accepts request seconds and milliseconds for Task 2 normalization", () => {
    const source = clone(itineraryFixture);
    source.request.startAt = "2026-09-05T01:00:00.125+07:00";

    expect(parseEngineInput(source).ok).toBe(true);
  });

  it("rejects duplicate catalog IDs and duplicate lock IDs", () => {
    const duplicateCatalog = clone(itineraryFixture);
    duplicateCatalog.catalog.places.push(
      clone(duplicateCatalog.catalog.places[0]),
    );
    expectInvalid(duplicateCatalog, "catalog.places");

    const duplicateLocks = clone(itineraryFixture);
    duplicateLocks.request.lockedStopIds.push("place-banh-mi");
    expectInvalid(duplicateLocks, "request.lockedStopIds");
  });

  it("rejects control delimiters from catalog and request IDs", () => {
    const catalogControl = clone(itineraryFixture);
    catalogControl.catalog.places[0].id = "place\u0000banh-mi";
    expectInvalid(catalogControl, "catalog.places");

    const lockControl = clone(itineraryFixture);
    lockControl.request.lockedStopIds = ["place\u0001banh-mi"];
    expectInvalid(lockControl, "lockedStopIds");
  });

  it("rejects unknown keys at every external object boundary", () => {
    const source = clone(itineraryFixture);
    (source.request as unknown as Record<string, unknown>).unexpected = true;

    expectInvalid(source, "request");
  });

  it("requires at least one positive priority weight", () => {
    const source = clone(itineraryFixture);
    source.request.priorityWeights = {
      street_food: 0,
      history: 0,
      traditional_craft: 0,
      traditional_market: 0,
    } as ItineraryRequest["priorityWeights"];

    expectInvalid(source, "request.priorityWeights");
  });

  it("rejects invalid enums, time strings, and calendar dates", () => {
    const invalidEnum = clone(itineraryFixture);
    (invalidEnum.request as { pace: string }).pace = "fast";
    expectInvalid(invalidEnum, "request.pace");

    const invalidTime = clone(itineraryFixture);
    invalidTime.catalog.places[0].openingHours[0].opensAt = "25:00";
    expectInvalid(invalidTime, "openingHours");

    const invalidDate = clone(itineraryFixture);
    invalidDate.catalog.places[0].openingExceptions[0].localDate =
      "2026-02-30";
    expectInvalid(invalidDate, "openingExceptions");
  });

  it("rejects equal and overlapping normal opening windows", () => {
    const equal = clone(itineraryFixture);
    equal.catalog.places[0].openingHours[1] = {
      weekday: 5,
      opensAt: "13:00",
      closesAt: "13:00",
    };
    expectInvalid(equal, "openingHours");

    const overlap = clone(itineraryFixture);
    overlap.catalog.places[0].openingHours[1] = {
      weekday: 5,
      opensAt: "11:00",
      closesAt: "14:00",
    };
    expectInvalid(overlap, "openingHours");
  });

  it("treats overnight windows as belonging to their starting weekday", () => {
    const source = clone(itineraryFixture);
    source.catalog.places[1].openingHours = [
      { weekday: 5, opensAt: "22:00", closesAt: "02:00" },
      { weekday: 5, opensAt: "01:00", closesAt: "03:00" },
    ];

    expect(parseEngineInput(source).ok).toBe(true);
  });

  it("rejects duplicate exception dates, closed windows, and overlapping exception windows", () => {
    const duplicateDates = clone(itineraryFixture);
    duplicateDates.catalog.places[0].openingExceptions.push(
      clone(duplicateDates.catalog.places[0].openingExceptions[0]),
    );
    expectInvalid(duplicateDates, "openingExceptions");

    const closedWithWindows = clone(itineraryFixture);
    closedWithWindows.catalog.places[2].openingExceptions[0] = {
      localDate: "2026-09-06",
      closed: true,
      windows: [{ opensAt: "09:00", closesAt: "10:00" }],
    };
    expectInvalid(closedWithWindows, "openingExceptions");

    const overlapping = clone(itineraryFixture);
    overlapping.catalog.places[0].openingExceptions[0].windows = [
      { opensAt: "09:00", closesAt: "12:00" },
      { opensAt: "11:00", closesAt: "13:00" },
    ];
    expectInvalid(overlapping, "openingExceptions");
  });

  it("rejects unsafe monetary and multiplication inputs", () => {
    const unsafeBudget = clone(itineraryFixture);
    unsafeBudget.request.budget.amountMinor = Number.MAX_SAFE_INTEGER + 1;
    expectInvalid(unsafeBudget, "request.budget.amountMinor");

    const unsafePlaceCost = clone(itineraryFixture);
    unsafePlaceCost.catalog.places[0].priceVndPerPerson =
      Number.MAX_SAFE_INTEGER;
    expectInvalid(unsafePlaceCost, "places");

    const unsafeTravelCost = clone(itineraryFixture);
    unsafeTravelCost.travel.edges[0].groupCostVnd = Number.MAX_SAFE_INTEGER;
    expectInvalid(unsafeTravelCost, "groupCostVnd");
  });

  it("rejects USD without FX and as-of timestamps before the FX observation", () => {
    const missingFx = clone(usdItineraryFixture);
    delete missingFx.fx;
    expectInvalid(missingFx, "fx");

    const beforeFx = clone(usdItineraryFixture);
    beforeFx.asOfUtc = "2026-09-05T00:59:59Z";
    expectInvalid(beforeFx, "asOfUtc");
  });

  it("enforces the FX numeric(20,8) precision boundary", () => {
    const tooManyIntegerDigits = clone(usdItineraryFixture);
    tooManyIntegerDigits.fx!.vndPerUsd = "1234567890123";
    expectInvalid(tooManyIntegerDigits, "fx.vndPerUsd");

    const tooManyFractionDigits = clone(usdItineraryFixture);
    tooManyFractionDigits.fx!.vndPerUsd = "1.123456789";
    expectInvalid(tooManyFractionDigits, "fx.vndPerUsd");

    const giantRate = clone(usdItineraryFixture);
    giantRate.fx!.vndPerUsd = "9".repeat(100_000);
    expectInvalid(giantRate, "fx.vndPerUsd");
  });

  it("rejects an invalid canonical as-of timestamp", () => {
    const source = clone(itineraryFixture);
    source.asOfUtc = "2026-09-05T01:00:00+07:00";

    expectInvalid(source, "asOfUtc");
  });

  it("rejects normalized calendar dates in every input timestamp field", () => {
    const invalidStart = clone(itineraryFixture);
    invalidStart.request.startAt = "2026-02-30T01:00:00Z";
    expectInvalid(invalidStart, "startAt");

    const invalidAsOf = clone(itineraryFixture);
    invalidAsOf.asOfUtc = "2026-02-30T01:00:00Z";
    expectInvalid(invalidAsOf, "asOfUtc");

    const invalidFxObservation = clone(itineraryFixture);
    invalidFxObservation.fx!.observedAtUtc = "2026-02-30T01:00:00Z";
    expectInvalid(invalidFxObservation, "observedAtUtc");

    const invalidTravelVerification = clone(itineraryFixture);
    invalidTravelVerification.travel.edges[0].verifiedAt =
      "2026-02-30T18:00:00+07:00";
    expectInvalid(invalidTravelVerification, "verifiedAt");
  });

  it("requires full canonical HCMC timestamps for itinerary results", () => {
    const validResult = {
      normalizedStartAt: "2026-09-05T08:00:00+07:00",
      budgetVnd: 2_000_000,
      rankingSource: "deterministic" as const,
      items: [
        {
          placeId: "place-banh-mi",
          startAt: "2026-09-05T08:00:00+07:00",
          endAt: "2026-09-05T08:45:00+07:00",
          visitDurationMinutes: 45,
          travelMinutesBefore: 0,
          transitionBufferMinutesBefore: 0 as const,
          travelCostVndBefore: 0,
          placeCostVnd: 360_000,
          score: 5_001,
        },
      ],
      totals: {
        durationMinutes: 45,
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

    expect(itineraryResultSchema.safeParse(validResult).success).toBe(true);

    const malformed = structuredClone(validResult);
    malformed.normalizedStartAt = "not-a-date+07:00";
    expect(itineraryResultSchema.safeParse(malformed).success).toBe(false);

    const missingSeconds = structuredClone(validResult);
    missingSeconds.items[0].startAt = "2026-09-05T08:00+07:00";
    expect(itineraryResultSchema.safeParse(missingSeconds).success).toBe(false);

    const invalidDate = structuredClone(validResult);
    invalidDate.items[0].endAt = "2026-02-30T08:45:00+07:00";
    expect(itineraryResultSchema.safeParse(invalidDate).success).toBe(false);
  });

  it("rejects overnight opening overlap from Friday into Saturday", () => {
    const source = clone(itineraryFixture);
    source.catalog.places[0].openingHours = [
      { weekday: 5, opensAt: "22:00", closesAt: "02:00" },
      { weekday: 6, opensAt: "01:00", closesAt: "03:00" },
    ];

    expectInvalid(source, "openingHours");
  });

  it("rejects overnight opening overlap across the Sunday-to-Monday boundary", () => {
    const source = clone(itineraryFixture);
    source.catalog.places[0].openingHours = [
      { weekday: 0, opensAt: "23:00", closesAt: "02:00" },
      { weekday: 1, opensAt: "01:00", closesAt: "03:00" },
    ];

    expectInvalid(source, "openingHours");
  });

  it("rejects more than 5,000 catalog places", () => {
    const source = clone(itineraryFixture);
    source.catalog.places = Array.from({ length: 5001 }, (_, index) => ({
      ...source.catalog.places[0],
      id: `place-${index}`,
    }));

    expectInvalid(source, "catalog.places");
  });

  it("uses the fixed retryability mapping for domain errors", () => {
    expect(domainError("ITINERARY_SEARCH_LIMIT", "itinerary.search_limit")).toEqual({
      code: "ITINERARY_SEARCH_LIMIT",
      messageKey: "itinerary.search_limit",
      retryable: true,
    });
    expect(domainError("USD_DISABLED", "itinerary.usd_disabled", ["fx"])).toEqual({
      code: "USD_DISABLED",
      messageKey: "itinerary.usd_disabled",
      retryable: false,
      issueKeys: ["fx"],
    });
  });

  it("exports the public request and input types for later engine tasks", () => {
    const typedRequest: ItineraryRequest = itineraryFixture.request;
    const typedInput: EngineInput = itineraryFixture;

    expect(typedRequest.guideLanguage).toBe("en");
    expect(typedInput.catalog.id).toBe("catalog-v1-2026-09-05");
  });
});
