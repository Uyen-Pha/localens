// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { recommendItinerary } from "@/lib/application/itinerary/recommend";
import type { RankRequest, RankResponse } from "@/lib/application/itinerary/ranking-port";
import { itineraryFixture } from "@/tests/fixtures/itinerary/catalog.v1";

function sourceWithMultipleCandidates() {
  return {
    ...itineraryFixture,
    request: {
      ...itineraryFixture.request,
      startAt: "2026-09-05T01:00:00Z",
      areas: ["district-1"],
      dietaryRequirements: [],
      mobilityRequirements: [],
      lockedStopIds: [],
      budget: { currency: "VND" as const, amountMinor: 2_000_000 },
    },
  };
}

function deterministicSource() {
  return {
    ...sourceWithMultipleCandidates(),
    request: {
      ...sourceWithMultipleCandidates().request,
      lockedStopIds: ["place-banh-mi"],
    },
  };
}

describe("recommendItinerary", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("projects only the public candidate fields and accepts an omitted subset", async () => {
    let captured: RankRequest | undefined;
    const result = await recommendItinerary(sourceWithMultipleCandidates(), {
      ranker: async (request) => {
        captured = request;
        return {
          orderedIds: ["place-history"],
          rationales: { "place-history": "Best fit for the selected history preference." },
        };
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.degraded).toBe(false);
    expect(result.value.messageKey).toBeUndefined();
    expect(result.value.result.rankingSource).toBe("ai");
    expect(result.value.rationales).toEqual({
      "place-history": "Best fit for the selected history preference.",
    });
    expect(captured).toBeDefined();
    expect(Object.keys(captured ?? {}).sort()).toEqual([
      "candidates",
      "pace",
      "priorityWeights",
    ]);
    for (const candidate of captured?.candidates ?? []) {
      expect(Object.keys(candidate).sort()).toEqual([
        "areaId",
        "id",
        "types",
        "visitDurationMinutes",
      ]);
    }
  });

  it.each([
    ["empty", { orderedIds: [], rationales: {} }],
    ["duplicate", { orderedIds: ["place-history", "place-history"], rationales: { "place-history": "ok" } }],
    ["unknown", { orderedIds: ["not-filtered"], rationales: { "not-filtered": "ok" } }],
    ["missing rationale", { orderedIds: ["place-history"], rationales: {} }],
    ["extra rationale", { orderedIds: ["place-history"], rationales: { "place-history": "ok", "place-banh-mi": "extra" } }],
    ["overlong rationale", { orderedIds: ["place-history"], rationales: { "place-history": "😀".repeat(241) } }],
  ] as const)("falls back safely for %s AI output", async (_name, response) => {
    const ranker = vi.fn(async (): Promise<RankResponse> =>
      response as unknown as RankResponse,
    );
    const result = await recommendItinerary(deterministicSource(), { ranker });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.result.rankingSource).toBe("deterministic");
    expect(result.value.degraded).toBe(true);
    expect(result.value.messageKey).toBe("itinerary.ai_invalid");
    expect(result.value.rationales).toEqual({});
  });

  it("turns provider exceptions into a deterministic fallback", async () => {
    const result = await recommendItinerary(deterministicSource(), {
      ranker: async () => {
        throw new Error("provider unavailable");
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.result.rankingSource).toBe("deterministic");
      expect(result.value.messageKey).toBe("itinerary.ai_invalid");
      expect(result.value.rationales).toEqual({});
    }
  });

  it("uses the unavailable fallback when no ranker is configured", async () => {
    const result = await recommendItinerary(deterministicSource());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.degraded).toBe(true);
      expect(result.value.messageKey).toBe("itinerary.ai_unavailable");
      expect(result.value.rationales).toEqual({});
    }
  });

  it("does not invoke a ranker when the caller is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const ranker = vi.fn(async () => ({ orderedIds: ["place-banh-mi"], rationales: { "place-banh-mi": "ok" } }));

    const result = await recommendItinerary(deterministicSource(), {
      ranker,
      signal: controller.signal,
    });

    expect(ranker).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.messageKey).toBe("itinerary.ai_aborted");
  });

  it("converts the exact eight-second provider timeout into an aborted fallback", async () => {
    vi.useFakeTimers();
    const ranker = vi.fn((_request: RankRequest, signal: AbortSignal) =>
      new Promise<RankResponse>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
    );

    const promise = recommendItinerary(deterministicSource(), { ranker });
    await vi.advanceTimersByTimeAsync(7_999);
    expect(ranker).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const result = await promise;

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.messageKey).toBe("itinerary.ai_aborted");
  });

  it("preserves deterministic domain errors and skips the provider", async () => {
    const staleUsd = {
      ...deterministicSource(),
      request: {
        ...deterministicSource().request,
        budget: { currency: "USD" as const, amountMinor: 1_000 },
      },
      asOfUtc: "2026-09-12T01:01:00Z",
    };
    const ranker = vi.fn(async () => ({ orderedIds: ["place-banh-mi"], rationales: { "place-banh-mi": "ok" } }));

    const result = await recommendItinerary(staleUsd, { ranker });

    expect(ranker).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "USD_DISABLED" }),
    });
  });
});
