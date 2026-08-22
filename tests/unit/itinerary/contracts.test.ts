// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  parseEngineInput,
  type EngineInput,
  type ItineraryRequest,
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

  it("rejects an invalid canonical as-of timestamp", () => {
    const source = clone(itineraryFixture);
    source.asOfUtc = "2026-09-05T01:00:00+07:00";

    expectInvalid(source, "asOfUtc");
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
