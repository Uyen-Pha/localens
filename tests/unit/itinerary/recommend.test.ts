// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  recommendItinerary,
  type TimeoutSignalHandle,
  type TimeoutSignalFactory,
} from "@/lib/application/itinerary/recommend";
import type {
  Ranker,
  RankRequest,
  RankResponse,
} from "@/lib/application/itinerary/ranking-port";
import { createItinerary } from "@/lib/domain/itinerary/engine";
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

function manualTimeoutFactory() {
  const controller = new AbortController();
  let cancelCount = 0;
  let requestedTimeout = 0;
  const factory: TimeoutSignalFactory = (timeoutMs): TimeoutSignalHandle => {
    requestedTimeout = timeoutMs;
    return {
      signal: controller.signal,
      cancel: () => {
        cancelCount += 1;
      },
    };
  };
  return {
    controller,
    factory,
    get cancelCount() {
      return cancelCount;
    },
    get requestedTimeout() {
      return requestedTimeout;
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

  it("settles on timeout when a provider ignores abort and resolves late", async () => {
    vi.useFakeTimers();
    let resolveLate!: (response: RankResponse) => void;
    const ranker = vi.fn(() => new Promise<RankResponse>((resolve) => {
      resolveLate = resolve;
    }));

    const pending = recommendItinerary(deterministicSource(), { ranker });
    await vi.advanceTimersByTimeAsync(8_000);
    const timedOut = await pending;

    expect(timedOut).toMatchObject({
      ok: true,
      value: {
        degraded: true,
        messageKey: "itinerary.ai_aborted",
        rationales: {},
      },
    });
    resolveLate({
      orderedIds: ["place-banh-mi"],
      rationales: { "place-banh-mi": "late" },
    });
    await Promise.resolve();
    expect(timedOut).toMatchObject({
      ok: true,
      value: { messageKey: "itinerary.ai_aborted", rationales: {} },
    });
  });

  it("observes a late provider rejection after timeout without an unhandled rejection", async () => {
    vi.useFakeTimers();
    let rejectLate!: (reason: unknown) => void;
    const ranker = vi.fn(() => new Promise<RankResponse>((_resolve, reject) => {
      rejectLate = reject;
    }));
    let unhandled = false;
    const onUnhandled = () => {
      unhandled = true;
    };
    process.on("unhandledRejection", onUnhandled);

    try {
      const pending = recommendItinerary(deterministicSource(), { ranker });
      await vi.advanceTimersByTimeAsync(8_000);
      const timedOut = await pending;
      rejectLate(new Error("late provider failure"));
      await vi.runAllTicks();

      expect(timedOut).toMatchObject({
        ok: true,
        value: { messageKey: "itinerary.ai_aborted", rationales: {} },
      });
      expect(unhandled).toBe(false);
    } finally {
      process.removeListener("unhandledRejection", onUnhandled);
    }
  });

  it("converts caller abort after provider start and ignores a late provider result", async () => {
    const caller = new AbortController();
    let resolveLate!: (response: RankResponse) => void;
    const ranker = vi.fn(() => new Promise<RankResponse>((resolve) => {
      resolveLate = resolve;
    }));

    const pending = recommendItinerary(deterministicSource(), {
      ranker,
      signal: caller.signal,
    });
    expect(ranker).toHaveBeenCalledTimes(1);
    caller.abort();
    const aborted = await pending;

    expect(aborted).toMatchObject({
      ok: true,
      value: { messageKey: "itinerary.ai_aborted", rationales: {} },
    });
    resolveLate({
      orderedIds: ["place-banh-mi"],
      rationales: { "place-banh-mi": "late" },
    });
    await Promise.resolve();
    expect(aborted).toMatchObject({
      ok: true,
      value: { messageKey: "itinerary.ai_aborted", rationales: {} },
    });
  });

  it("handles caller and timeout aborts racing without double completion", async () => {
    const caller = new AbortController();
    const timeout = manualTimeoutFactory();
    const ranker = vi.fn(() => new Promise<RankResponse>(() => undefined));

    const pending = recommendItinerary(deterministicSource(), {
      ranker,
      signal: caller.signal,
      timeoutSignalFactory: timeout.factory,
    });
    caller.abort();
    timeout.controller.abort();
    const result = await pending;

    expect(result).toMatchObject({
      ok: true,
      value: { messageKey: "itinerary.ai_aborted", rationales: {} },
    });
    expect(timeout.cancelCount).toBe(1);
    expect(timeout.requestedTimeout).toBe(8_000);
  });

  it.each(["success", "invalid", "provider reject", "caller abort", "timeout"] as const)(
    "cancels the injected timeout exactly once on %s",
    async (outcome) => {
      const timeout = manualTimeoutFactory();
      const caller = new AbortController();
      let ranker: Ranker;
      if (outcome === "success") {
        ranker = async () => ({
          orderedIds: ["place-banh-mi"],
          rationales: { "place-banh-mi": "ok" },
        });
      } else if (outcome === "invalid") {
        ranker = async () => ({ orderedIds: [], rationales: {} });
      } else if (outcome === "provider reject") {
        ranker = async () => {
          throw new Error("provider failure");
        };
      } else {
        ranker = () => new Promise<RankResponse>(() => undefined);
      }

      const pending = recommendItinerary(deterministicSource(), {
        ranker,
        signal: caller.signal,
        timeoutSignalFactory: timeout.factory,
      });
      if (outcome === "caller abort") caller.abort();
      if (outcome === "timeout") timeout.controller.abort();
      const result = await pending;

      expect(result.ok).toBe(true);
      expect(timeout.cancelCount).toBe(1);
      expect(timeout.requestedTimeout).toBe(8_000);
    },
  );

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

  it("returns a deterministic preflight error unchanged without invoking the provider", async () => {
    const impossible = {
      ...deterministicSource(),
      request: {
        ...deterministicSource().request,
        budget: { currency: "VND" as const, amountMinor: 0 },
      },
    };
    const expected = createItinerary(impossible);
    const ranker = vi.fn(async () => ({
      orderedIds: ["place-banh-mi"],
      rationales: { "place-banh-mi": "must not run" },
    }));

    const result = await recommendItinerary(impossible, { ranker });

    expect(ranker).not.toHaveBeenCalled();
    expect(result).toEqual(expected);
  });
});
