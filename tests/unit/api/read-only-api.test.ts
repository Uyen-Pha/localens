// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  createReadOnlyApi,
  type ApiError,
} from "@/lib/application/api/read-only-api";

const validRequest = {
  startAt: "2026-09-05T01:00:00Z",
  durationMinutes: 360,
  areas: ["demo-hcmc-district-1", "demo-hcmc-district-5"],
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
  dietaryRequirements: [],
  mobilityRequirements: [],
  lockedStopIds: ["demo-hcmc-ben-thanh-market"],
} as const;

function errorOf(result: { ok: boolean; error?: ApiError }): ApiError {
  if (result.ok || result.error === undefined) throw new Error("expected API error");
  return result.error;
}

describe("read-only API application boundary", () => {
  it("returns a localized fixed-tour catalog from the internal demo HCMC repository", () => {
    const result = createReadOnlyApi().listTours("en");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.environment).toBe("demo");
    expect(result.value.city).toBe("Ho Chi Minh City");
    expect(result.value.locale).toBe("en");
    expect(result.value.tours.length).toBeGreaterThanOrEqual(4);
    expect(new Set(result.value.tours.flatMap((tour) => tour.experienceTypes))).toEqual(
      new Set(["street_food", "history", "traditional_craft", "traditional_market"]),
    );
    expect(result.value.tours.every((tour) => !Object.hasOwn(tour, "catalog"))).toBe(true);
  });

  it("rejects an unsupported locale instead of falling back silently", () => {
    const result = createReadOnlyApi().listTours("fr");
    const error = errorOf(result);

    expect(error).toMatchObject({
      code: "INVALID_REQUEST",
      messageKey: "api.locale.invalid",
      retryable: false,
    });
    expect(error.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("builds a deterministic preview and returns only the allowlisted result DTO", () => {
    const result = createReadOnlyApi().previewItinerary(validRequest);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.environment).toBe("demo");
    expect(result.value.city).toBe("Ho Chi Minh City");
    expect(result.value.rankingSource).toBe("deterministic");
    expect(result.value.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        placeId: "demo-hcmc-ben-thanh-market",
        visitDurationMinutes: expect.any(Number),
        startAt: expect.stringMatching(/\+07:00$/),
        endAt: expect.stringMatching(/\+07:00$/),
      }),
    ]));
    expect(result.value).not.toHaveProperty("catalog");
    expect(result.value).not.toHaveProperty("travel");
    expect(result.value).not.toHaveProperty("fx");
    expect(result.value).not.toHaveProperty("rationales");
  });

  it("rejects extra request fields at the server boundary", () => {
    const result = createReadOnlyApi().previewItinerary({ ...validRequest, externalPlace: "https://maps.example/1" });
    const error = errorOf(result);

    expect(error).toMatchObject({
      code: "UNKNOWN_FIELD",
      messageKey: "api.request.unknown_field",
      retryable: false,
      fieldErrors: { externalPlace: "api.request.unknown_field" },
    });
  });

  it("rejects extra nested fields instead of silently stripping them", () => {
    const result = createReadOnlyApi().previewItinerary({
      ...validRequest,
      budget: { ...validRequest.budget, paymentToken: "secret" },
    });
    const error = errorOf(result);

    expect(error).toMatchObject({
      code: "UNKNOWN_FIELD",
      messageKey: "api.request.unknown_field",
      fieldErrors: { "budget.paymentToken": "api.request.unknown_field" },
    });
  });

  it("rejects unknown or external locked place IDs before invoking the engine", () => {
    const result = createReadOnlyApi().previewItinerary({
      ...validRequest,
      lockedStopIds: ["https://maps.example/place/1"],
    });
    const error = errorOf(result);

    expect(error).toMatchObject({
      code: "UNKNOWN_PLACE_ID",
      messageKey: "api.place.unknown",
      retryable: false,
      fieldErrors: { lockedStopIds: "api.place.unknown" },
    });
  });

  it("rejects unsafe money and time values with safe field errors", () => {
    const money = createReadOnlyApi().previewItinerary({
      ...validRequest,
      budget: { currency: "VND", amountMinor: Number.MAX_SAFE_INTEGER + 1 },
    });
    const time = createReadOnlyApi().previewItinerary({
      ...validRequest,
      startAt: "2026-09-05T01:00:00",
    });

    expect(errorOf(money)).toMatchObject({
      code: "UNSAFE_MONEY",
      messageKey: "api.money.unsafe",
      fieldErrors: { "budget.amountMinor": "api.money.unsafe" },
    });
    expect(errorOf(time)).toMatchObject({
      code: "UNSAFE_TIME",
      messageKey: "api.time.unsafe",
      fieldErrors: { startAt: "api.time.unsafe" },
    });
  });
});
