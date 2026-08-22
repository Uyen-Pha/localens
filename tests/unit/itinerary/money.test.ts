// @vitest-environment node

import { describe, expect, it } from "vitest";

import type {
  FxSnapshot,
  ItineraryRequest,
} from "@/lib/domain/itinerary/contracts";
import {
  multiplyVnd,
  normalizeBudgetToVnd,
  parseFxRate,
  sumVnd,
  usdCentsToVndFloor,
  vndToUsdCentsCeil,
} from "@/lib/domain/itinerary/money";
import {
  itineraryFixture,
  usdItineraryFixture,
} from "@/tests/fixtures/itinerary/catalog.v1";

const clone = <T>(value: T): T => structuredClone(value);

const validRate = parseFxRate("25000.12345678");

function expectError(
  result: { ok: boolean; error?: unknown },
  code: string,
  messageKey = code === "USD_DISABLED"
    ? "itinerary.usd_disabled"
    : "itinerary.money.invalid",
) {
  expect(result).toEqual({
    ok: false,
    error: { code, messageKey, retryable: false },
  });
}

function expectRate(result: ReturnType<typeof parseFxRate>): { numerator: bigint; denominator: bigint } {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected a valid FX rate");
  return result.value;
}

describe("itinerary money arithmetic", () => {
  it("multiplies VND values at the safe-integer boundary", () => {
    expect(multiplyVnd(180_000, 2)).toEqual({ ok: true, value: 360_000 });
    expect(multiplyVnd(Number.MAX_SAFE_INTEGER, 1)).toEqual({
      ok: true,
      value: Number.MAX_SAFE_INTEGER,
    });
    expectError(multiplyVnd(Number.MAX_SAFE_INTEGER, 2), "INVALID_ITINERARY_INPUT");
  });

  it("rejects invalid multiplication operands", () => {
    expectError(multiplyVnd(-1, 2), "INVALID_ITINERARY_INPUT");
    expectError(multiplyVnd(1.5, 2), "INVALID_ITINERARY_INPUT");
    expectError(multiplyVnd(Number.NaN, 2), "INVALID_ITINERARY_INPUT");
  });

  it("sums VND values without crossing the safe-integer boundary", () => {
    expect(sumVnd([180_000, 120_000, 30_000])).toEqual({
      ok: true,
      value: 330_000,
    });
    expect(sumVnd([Number.MAX_SAFE_INTEGER, 0])).toEqual({
      ok: true,
      value: Number.MAX_SAFE_INTEGER,
    });
    expectError(sumVnd([Number.MAX_SAFE_INTEGER, 1]), "INVALID_ITINERARY_INPUT");
    expectError(sumVnd([1, -1]), "INVALID_ITINERARY_INPUT");
    expectError(sumVnd([Number.NaN]), "INVALID_ITINERARY_INPUT");
    expectError(sumVnd([Number.POSITIVE_INFINITY]), "INVALID_ITINERARY_INPUT");
  });
});

describe("precise FX rate arithmetic", () => {
  it("parses decimal rates without floating-point rounding", () => {
    expect(parseFxRate("25000.12345678")).toEqual({
      ok: true,
      value: {
        numerator: BigInt("2500012345678"),
        denominator: BigInt("100000000"),
      },
    });
    expect(parseFxRate("0.00000001")).toEqual({
      ok: true,
      value: { numerator: BigInt("1"), denominator: BigInt("100000000") },
    });
  });

  it("rejects zero, signed, malformed, and over-precise rates", () => {
    for (const value of ["0", "-1", "+1", "01", "1.", "1.123456789", ""]) {
      expectError(parseFxRate(value), "INVALID_ITINERARY_INPUT");
    }
    expectError(parseFxRate("9".repeat(100_000)), "INVALID_ITINERARY_INPUT");
  });

  it("floors USD cents to VND using the exact rational rate", () => {
    const rate = expectRate(validRate);

    expect(usdCentsToVndFloor(123, rate)).toEqual({
      ok: true,
      value: 30_750,
    });
    expect(usdCentsToVndFloor(0, rate)).toEqual({ ok: true, value: 0 });
  });

  it("ceils VND to USD cents using the exact rational rate", () => {
    const rate = expectRate(validRate);

    expect(vndToUsdCentsCeil(30_750, rate)).toEqual({ ok: true, value: 123 });
    expect(vndToUsdCentsCeil(30_751, rate)).toEqual({ ok: true, value: 124 });
  });

  it("rejects conversion results that cannot be represented safely", () => {
    const highRate = expectRate(parseFxRate("100000000"));
    const tinyRate = expectRate(parseFxRate("0.00000001"));

    expectError(
      usdCentsToVndFloor(Number.MAX_SAFE_INTEGER, highRate),
      "INVALID_ITINERARY_INPUT",
    );
    expectError(
      vndToUsdCentsCeil(Number.MAX_SAFE_INTEGER, tinyRate),
      "INVALID_ITINERARY_INPUT",
    );
    expectError(usdCentsToVndFloor(-1, highRate), "INVALID_ITINERARY_INPUT");
  });

  it("rejects malformed BigInt rate shapes before arithmetic", () => {
    const malformedRates = [
      { numerator: BigInt("1"), denominator: 1 as unknown as bigint },
      { numerator: BigInt("0"), denominator: BigInt("1") },
      { numerator: BigInt("1"), denominator: BigInt("0") },
      { numerator: BigInt("-1"), denominator: BigInt("1") },
      null,
    ];

    for (const rate of malformedRates) {
      expectError(
        usdCentsToVndFloor(1, rate as never),
        "INVALID_ITINERARY_INPUT",
      );
      expectError(
        vndToUsdCentsCeil(1, rate as never),
        "INVALID_ITINERARY_INPUT",
      );
    }
  });

  it("keeps a VND/USD round trip on the safe side of the original amount", () => {
    const rate = expectRate(parseFxRate("25000.12345678"));
    const originalVnd = 30_751;
    const usdCents = vndToUsdCentsCeil(originalVnd, rate);
    expect(usdCents.ok).toBe(true);
    if (!usdCents.ok) return;

    const roundTrip = usdCentsToVndFloor(usdCents.value, rate);
    expect(roundTrip).toEqual({ ok: true, value: 31_000 });
    if (roundTrip.ok) expect(roundTrip.value).toBeGreaterThanOrEqual(originalVnd);
  });
});

describe("budget FX snapshot normalization", () => {
  const observedAtUtc = "2026-09-05T01:00:00Z";
  const validFx: FxSnapshot = {
    id: "fx-test",
    vndPerUsd: "25000.00000000",
    observedAtUtc,
  };

  it("leaves VND budgets unchanged and does not require FX", () => {
    const request = clone(itineraryFixture.request);

    expect(normalizeBudgetToVnd(request, undefined, observedAtUtc)).toEqual({
      ok: true,
      value: { budgetVnd: request.budget.amountMinor, fxSnapshotId: null },
    });
  });

  it("ignores stale or absent FX when the request is already in VND", () => {
    const request = clone(itineraryFixture.request);
    const staleFx = { ...validFx, observedAtUtc: "2020-01-01T00:00:00Z" };

    expect(normalizeBudgetToVnd(request, staleFx, observedAtUtc)).toEqual({
      ok: true,
      value: { budgetVnd: request.budget.amountMinor, fxSnapshotId: null },
    });
  });

  it("converts USD budgets at the exact seven-day freshness boundary", () => {
    const request = clone(usdItineraryFixture.request);
    const asOfUtc = "2026-09-12T01:00:00Z";

    expect(normalizeBudgetToVnd(request, validFx, asOfUtc)).toEqual({
      ok: true,
      value: { budgetVnd: 2_500_000, fxSnapshotId: validFx.id },
    });
  });

  it("keeps seconds and milliseconds exact at the freshness boundary", () => {
    const request = clone(usdItineraryFixture.request);
    const fx = {
      ...validFx,
      observedAtUtc: "2026-09-05T01:00:00.999Z",
    };

    expect(
      normalizeBudgetToVnd(request, fx, "2026-09-12T01:00:00.999Z"),
    ).toEqual({
      ok: true,
      value: { budgetVnd: 2_500_000, fxSnapshotId: validFx.id },
    });
    expectError(
      normalizeBudgetToVnd(request, fx, "2026-09-12T01:00:01.000Z"),
      "USD_DISABLED",
    );
  });

  it("disables USD one minute after the seven-day freshness boundary", () => {
    const request = clone(usdItineraryFixture.request);
    const result = normalizeBudgetToVnd(
      request,
      validFx,
      "2026-09-12T01:01:00Z",
    );

    expectError(result, "USD_DISABLED");
  });

  it("disables USD when its FX snapshot is missing", () => {
    const request = clone(usdItineraryFixture.request);

    expectError(normalizeBudgetToVnd(request, undefined, observedAtUtc), "USD_DISABLED");
  });

  it("rejects an as-of timestamp earlier than the FX observation", () => {
    const request = clone(usdItineraryFixture.request);

    expectError(
      normalizeBudgetToVnd(request, validFx, "2026-09-05T00:59:59Z"),
      "INVALID_ITINERARY_INPUT",
    );
  });

  it("rejects impossible calendar dates in the USD timestamps", () => {
    const request = clone(usdItineraryFixture.request);

    expectError(
      normalizeBudgetToVnd(request, validFx, "2026-02-30T01:00:00Z"),
      "INVALID_ITINERARY_INPUT",
    );
    expectError(
      normalizeBudgetToVnd(
        request,
        { ...validFx, observedAtUtc: "2026-02-30T01:00:00Z" },
        observedAtUtc,
      ),
      "INVALID_ITINERARY_INPUT",
    );
  });

  it("rejects an invalid FX rate instead of using floating-point coercion", () => {
    const request = clone(usdItineraryFixture.request);
    const invalidFx = { ...validFx, vndPerUsd: "25000.123456789" };

    expectError(
      normalizeBudgetToVnd(request, invalidFx, observedAtUtc),
      "INVALID_ITINERARY_INPUT",
    );
  });

  it("rejects malformed FX objects and IDs at the runtime boundary", () => {
    const request = clone(usdItineraryFixture.request);
    const malformedFxValues: unknown[] = [
      null,
      {},
      { ...validFx, id: "" },
      { ...validFx, id: "   " },
      { ...validFx, id: "x".repeat(161) },
      { ...validFx, id: 42 },
      { ...validFx, vndPerUsd: undefined },
      { ...validFx, observedAtUtc: undefined },
    ];

    for (const fx of malformedFxValues) {
      expectError(
        normalizeBudgetToVnd(request, fx as FxSnapshot, observedAtUtc),
        "INVALID_ITINERARY_INPUT",
      );
    }
  });

  it("returns the trimmed FX snapshot ID used by contract normalization", () => {
    const request = clone(usdItineraryFixture.request);

    expect(
      normalizeBudgetToVnd(
        request,
        { ...validFx, id: "  fx-test  " },
        observedAtUtc,
      ),
    ).toEqual({
      ok: true,
      value: { budgetVnd: 2_500_000, fxSnapshotId: "fx-test" },
    });
  });

  it("does not exceed the public safe-integer boundary for USD budgets", () => {
    const request = clone(usdItineraryFixture.request);
    request.budget = {
      currency: "USD",
      amountMinor: Number.MAX_SAFE_INTEGER,
    };
    const highFx = { ...validFx, vndPerUsd: "100000000" };

    expectError(
      normalizeBudgetToVnd(request, highFx, observedAtUtc),
      "INVALID_ITINERARY_INPUT",
    );
  });

  it("accepts the full request type as the normalization input", () => {
    const request: ItineraryRequest = clone(itineraryFixture.request);
    expect(normalizeBudgetToVnd(request, undefined, observedAtUtc).ok).toBe(true);
  });
});
