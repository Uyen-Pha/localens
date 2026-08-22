// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  canonicalizeItinerary,
  fingerprintItinerary,
} from "@/lib/domain/itinerary/fingerprint";
import type {
  EngineInput,
  ItineraryResult,
} from "@/lib/domain/itinerary/contracts";
import { itineraryFixture } from "@/tests/fixtures/itinerary/catalog.v1";

const clone = <T>(value: T): T => structuredClone(value);

function fingerprintResult(): ItineraryResult {
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
        score: 5_004,
      },
    ],
    totals: {
      durationMinutes: 105,
      visitMinutes: 45,
      travelMinutes: 0,
      transitionBufferMinutes: 0,
      groupCostVnd: 360_000,
      score: 5_004,
    },
    snapshotIds: {
      catalog: "catalog-v1-2026-09-05",
      travel: "travel-v1-2026-09-05",
      fx: null,
    },
  };
}

function fingerprintInput(): EngineInput {
  const input = clone(itineraryFixture);
  input.request.areas = ["district-5", "district-1"];
  input.request.dietaryRequirements = ["vegetarian", "halal"];
  input.request.mobilityRequirements = ["ramp", "step-free"];
  input.request.lockedStopIds = ["place-banh-mi", "place-history"];
  input.request.priorityWeights = {
    traditional_market: 2,
    street_food: 5,
    traditional_craft: 3,
    history: 4,
  };
  return input;
}

describe("canonical itinerary fingerprint material", () => {
  it("projects only the versioned whitelist with sorted arrays, null FX, and decimal money strings", () => {
    const input = fingerprintInput();
    const result = fingerprintResult();
    const source = input as EngineInput & {
      token: string;
      planId: string;
      fxContents: unknown;
    };
    source.token = "secret-token";
    source.planId = "plan-ignored";
    source.fxContents = { vndPerUsd: "25000.00000000" };
    (source.request as EngineInput["request"] & { rationale: string }).rationale = "ignore";
    const resultWithExtras = result as ItineraryResult & {
      correlationId: string;
      rationale: string;
    };
    resultWithExtras.correlationId = "request-ignored";
    resultWithExtras.rationale = "ignore";
    (result.items[0] as ItineraryResult["items"][number] & { planRevision: number }).planRevision = 7;

    expect(canonicalizeItinerary(source, resultWithExtras)).toBe(
      '{"items":[{"endAt":"2026-09-05T09:45:00+07:00","placeCostVnd":"360000","placeId":"place-banh-mi","score":5004,"startAt":"2026-09-05T09:00:00+07:00","transitionBufferMinutesBefore":0,"travelCostVndBefore":"0","travelMinutesBefore":0,"visitDurationMinutes":45}],"rankingSource":"deterministic","request":{"areas":["district-1","district-5"],"budget":{"amountMinor":2000000,"currency":"VND"},"budgetVnd":"2000000","dietaryRequirements":["halal","vegetarian"],"durationMinutes":360,"guideLanguage":"en","lockedStopIds":["place-banh-mi","place-history"],"mobilityRequirements":["ramp","step-free"],"normalizedStartAt":"2026-09-05T08:00:00+07:00","pace":"balanced","partySize":2,"priorityWeights":{"history":4,"street_food":5,"traditional_craft":3,"traditional_market":2}},"snapshotIds":{"catalog":"catalog-v1-2026-09-05","fx":null,"travel":"travel-v1-2026-09-05"},"totals":{"durationMinutes":105,"groupCostVnd":"360000","score":5004,"transitionBufferMinutes":0,"travelMinutes":0,"visitMinutes":45},"version":1}',
    );
    expect(canonicalizeItinerary(input, result)).not.toContain("secret-token");
    expect(canonicalizeItinerary(input, result)).not.toContain("25000.00000000");
  });

  it("is independent of object insertion order while preserving locked and item array order", () => {
    const input = fingerprintInput();
    const result = fingerprintResult();
    const reorderedInput = {
      asOfUtc: input.asOfUtc,
      fx: input.fx,
      travel: input.travel,
      catalog: input.catalog,
      request: {
        ...input.request,
        priorityWeights: {
          history: 4,
          street_food: 5,
          traditional_market: 2,
          traditional_craft: 3,
        },
      },
    } satisfies EngineInput;
    const reorderedResult = {
      snapshotIds: result.snapshotIds,
      totals: result.totals,
      items: result.items,
      rankingSource: result.rankingSource,
      budgetVnd: result.budgetVnd,
      normalizedStartAt: result.normalizedStartAt,
    } satisfies ItineraryResult;

    expect(canonicalizeItinerary(input, result)).toBe(
      canonicalizeItinerary(reorderedInput, reorderedResult),
    );
    expect(canonicalizeItinerary(input, result)).toContain(
      '"lockedStopIds":["place-banh-mi","place-history"]',
    );
  });

  it("emits UTF-8 JSON text rather than a machine-dependent representation", () => {
    const input = fingerprintInput();
    input.request.areas = ["đường-1"];
    const result = fingerprintResult();
    const canonical = canonicalizeItinerary(input, result);

    expect(canonical).toContain('"areas":["đường-1"]');
    expect(new TextEncoder().encode(canonical)).toContain(0xc4);
  });
});

describe("async itinerary fingerprint", () => {
  it("injects UTF-8 bytes into SHA-256 and returns lowercase 64-character hex", async () => {
    const input = fingerprintInput();
    const result = fingerprintResult();
    let received: Uint8Array<ArrayBufferLike> = new Uint8Array();
    const digest = await fingerprintItinerary(input, result, async (bytes) => {
      received = bytes;
      return Uint8Array.from({ length: 32 }, (_, index) => index);
    });

    expect(digest).toBe("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
    expect(new TextDecoder().decode(received)).toBe(canonicalizeItinerary(input, result));
  });

  it("changes when schedule, cost, snapshot, request, or ranking source changes", async () => {
    const input = fingerprintInput();
    const result = fingerprintResult();
    const hash = (bytes: Uint8Array) => {
      const digest = new Uint8Array(32);
      for (const [index, byte] of bytes.entries()) {
        digest[index % digest.length] = (digest[index % digest.length] + byte + index) % 256;
      }
      return Promise.resolve(digest);
    };
    const baseline = await fingerprintItinerary(input, result, hash);
    const cases: Array<[
      string,
      (changedInput: EngineInput, changedResult: ItineraryResult) => void,
    ]> = [
      ["schedule", (_changedInput, changedResult) => { changedResult.items[0].startAt = "2026-09-05T09:01:00+07:00"; }],
      ["cost", (_changedInput, changedResult) => { changedResult.totals.groupCostVnd = 360_001; }],
      ["snapshot", (_changedInput, changedResult) => { changedResult.snapshotIds.travel = "travel-v2"; }],
      ["request", (changedInput) => { changedInput.request.pace = "active"; }],
      ["ranking source", (_changedInput, changedResult) => { changedResult.rankingSource = "ai"; }],
    ];

    for (const [label, change] of cases) {
      const changedInput = clone(input);
      const changedResult = clone(result);
      change(changedInput, changedResult);
      const changed = await fingerprintItinerary(changedInput, changedResult, hash);
      expect(changed, `${label} changes must alter the fingerprint`).not.toBe(baseline);
    }
  });

  it("excludes non-fingerprint metadata from the digest", async () => {
    const input = fingerprintInput();
    const result = fingerprintResult();
    const hash = (bytes: Uint8Array) => Promise.resolve(bytes.slice(0, 32));
    const baseline = await fingerprintItinerary(input, result, hash);
    const changedInput = clone(input) as EngineInput & { asOfUtc: string; token: string };
    changedInput.asOfUtc = "2026-09-05T02:00:00Z";
    changedInput.token = "ignored";
    const changedResult = clone(result) as ItineraryResult & { rationale: string };
    changedResult.rationale = "ignored";

    await expect(fingerprintItinerary(changedInput, changedResult, hash)).resolves.toBe(baseline);
  });

  it("rejects a provider digest unless it is exactly 32 bytes", async () => {
    const input = fingerprintInput();
    const result = fingerprintResult();

    await expect(fingerprintItinerary(input, result, async () => new Uint8Array(31)))
      .rejects.toThrow("SHA-256 digest must contain exactly 32 bytes");
    await expect(fingerprintItinerary(input, result, async () => new Uint8Array(33)))
      .rejects.toThrow("SHA-256 digest must contain exactly 32 bytes");
  });

  it("propagates provider failures without inventing a digest", async () => {
    const input = fingerprintInput();
    const result = fingerprintResult();
    const failure = new Error("provider unavailable");

    await expect(fingerprintItinerary(input, result, async () => {
      throw failure;
    })).rejects.toBe(failure);
  });
});
