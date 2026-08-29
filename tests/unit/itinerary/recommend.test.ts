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

function canonicalBanhMiSelection() {
  return {
    vendorId: "vendor-banh-mi-legacy",
    menuItemId: "menu-banh-mi-legacy",
    quantity: 2,
    priceVndMin: 30_000,
    priceVndMax: 40_000,
    paymentMode: "pay_at_vendor" as const,
    activity: "Taste and discuss the selected dish",
  };
}

function hostileFoodSelections(kind: "custom-prototype" | "sparse" | "accessor" | "symbol") {
  const valid = [{ placeId: "place-banh-mi", selection: canonicalBanhMiSelection() }];
  if (kind === "custom-prototype") {
    Object.setPrototypeOf(valid, {
      [Symbol.iterator]: function* () {
        yield valid[0];
      },
    });
    return valid;
  }
  if (kind === "sparse") {
    const sparse: unknown[] = [];
    sparse.length = 1;
    return sparse;
  }
  if (kind === "accessor") {
    Object.defineProperty(valid, "0", {
      configurable: true,
      enumerable: true,
      get: () => ({ placeId: "place-banh-mi", selection: canonicalBanhMiSelection() }),
    });
    return valid;
  }
  Object.defineProperty(valid, Symbol("inherited-looking"), {
    configurable: true,
    enumerable: true,
    value: valid[0],
  });
  return valid;
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
          foodSelections: [],
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
      "allowedMenuItemIds",
      "allowedVendorIds",
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

  it("sends food allowlists and accepts an exact canonical AI food selection", async () => {
    let captured: RankRequest | undefined;
    const result = await recommendItinerary(sourceWithMultipleCandidates(), {
      ranker: async (request) => {
        captured = request;
        return {
          orderedIds: ["place-banh-mi"],
          rationales: { "place-banh-mi": "Matches the food preference." },
          foodSelections: [{
            placeId: "place-banh-mi",
            selection: canonicalBanhMiSelection(),
          }],
        };
      },
    });

    expect(result).toMatchObject({ ok: true, value: { degraded: false } });
    if (!result.ok) return;
    expect(result.value.result.rankingSource).toBe("ai");
    expect(result.value.result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        placeId: "place-banh-mi",
        foodSelection: canonicalBanhMiSelection(),
      }),
    ]));
    expect(captured).toMatchObject({
      allowedVendorIds: ["vendor-banh-mi-legacy"],
      allowedMenuItemIds: ["menu-banh-mi-legacy"],
    });
  });

  it("rejects a cross-vendor menu selection even when both IDs are allowlisted", async () => {
    const source = sourceWithMultipleCandidates();
    const banhMi = source.catalog.places.find((place) => place.id === "place-banh-mi");
    if (!banhMi) throw new Error("fixture place missing");
    const vendor = banhMi.foodVendors[0];
    const alternateVendor = {
      ...vendor,
      id: "vendor-banh-mi-alt",
      slug: "vendor-banh-mi-alt",
      menuItems: vendor.menuItems.map((item) => ({
        ...item,
        id: "menu-banh-mi-alt",
        vendorId: "vendor-banh-mi-alt",
        slug: "banh-mi-alt",
      })),
    };
    const input = {
      ...source,
      catalog: {
        ...source.catalog,
        places: source.catalog.places.map((place) =>
          place.id === banhMi.id
            ? { ...place, foodVendors: [vendor, alternateVendor] }
            : place,
        ),
      },
    };
    const ranker = vi.fn(async () => ({
      orderedIds: ["place-banh-mi"],
      rationales: { "place-banh-mi": "matched" },
      foodSelections: [{
        placeId: "place-banh-mi",
        selection: {
          ...canonicalBanhMiSelection(),
          vendorId: "vendor-banh-mi-legacy",
          menuItemId: "menu-banh-mi-alt",
        },
      }],
    }));

    const result = await recommendItinerary(input, { ranker });

    expect(result).toMatchObject({
      ok: true,
      value: { degraded: true, messageKey: "itinerary.ai_invalid" },
    });
    expect(ranker).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["missing selection", []],
    ["unknown vendor", [{ placeId: "place-banh-mi", selection: { ...canonicalBanhMiSelection(), vendorId: "vendor-forged" } }]],
    ["unknown menu", [{ placeId: "place-banh-mi", selection: { ...canonicalBanhMiSelection(), menuItemId: "menu-forged" } }]],
    ["changed minimum price", [{ placeId: "place-banh-mi", selection: { ...canonicalBanhMiSelection(), priceVndMin: 1 } }]],
    ["changed maximum price", [{ placeId: "place-banh-mi", selection: { ...canonicalBanhMiSelection(), priceVndMax: 1 } }]],
    ["integer wrong quantity", [{ placeId: "place-banh-mi", selection: { ...canonicalBanhMiSelection(), quantity: 1 } }]],
    ["fractional quantity", [{ placeId: "place-banh-mi", selection: { ...canonicalBanhMiSelection(), quantity: 1.5 } }]],
    ["changed activity", [{ placeId: "place-banh-mi", selection: { ...canonicalBanhMiSelection(), activity: "Book a table" } }]],
    ["included in quote", [{ placeId: "place-banh-mi", selection: { ...canonicalBanhMiSelection(), paymentMode: "included_in_quote" } }]],
    ["duplicate selection", [
      { placeId: "place-banh-mi", selection: canonicalBanhMiSelection() },
      { placeId: "place-banh-mi", selection: canonicalBanhMiSelection() },
    ]],
    ["unranked selection", [{ placeId: "place-history", selection: canonicalBanhMiSelection() }]],
  ] as const)("falls back for hostile food output: %s", async (_label, foodSelections) => {
    const result = await recommendItinerary(sourceWithMultipleCandidates(), {
      ranker: async () => ({
        orderedIds: ["place-banh-mi"],
        rationales: { "place-banh-mi": "matched" },
        foodSelections,
      }),
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        degraded: true,
        messageKey: "itinerary.ai_invalid",
        result: { rankingSource: "deterministic" },
      },
    });
  });

  it.each(["custom-prototype", "sparse", "accessor", "symbol"] as const)(
    "rejects hostile food selection containers: %s",
    async (kind) => {
      const foodSelections = hostileFoodSelections(kind);
      const result = await recommendItinerary(sourceWithMultipleCandidates(), {
        ranker: async () => ({
          orderedIds: ["place-banh-mi"],
          rationales: { "place-banh-mi": "matched" },
          foodSelections: foodSelections as unknown as RankResponse["foodSelections"],
        }),
      });

      expect(result).toMatchObject({
        ok: true,
        value: { degraded: true, messageKey: "itinerary.ai_invalid" },
      });
    },
  );

  it("does not invoke a provider when the candidate set exceeds the provider cap", async () => {
    const history = itineraryFixture.catalog.places.find((place) => place.id === "place-history");
    if (!history) throw new Error("fixture place missing");
    const extraPlaces = Array.from({ length: 129 }, (_, index) => ({
      ...history,
      id: `place-history-${String(index).padStart(3, "0")}`,
      openingHours: [{ weekday: 6 as const, opensAt: "08:00", closesAt: "17:00" }],
      dietarySupport: { halal: "supported" as const },
      mobilitySupport: { "step-free": "supported" as const },
    }));
    const source = {
      ...sourceWithMultipleCandidates(),
      catalog: {
        ...sourceWithMultipleCandidates().catalog,
        places: [
          ...sourceWithMultipleCandidates().catalog.places.filter((place) => place.id === "place-banh-mi"),
          ...extraPlaces,
        ],
      },
    };
    const ranker = vi.fn(async () => ({
      orderedIds: ["place-banh-mi"],
      rationales: { "place-banh-mi": "matched" },
      foodSelections: [],
    }));

    const result = await recommendItinerary(source, { ranker });

    expect(result).toMatchObject({
      ok: true,
      value: { degraded: true, messageKey: "itinerary.ai_invalid" },
    });
    expect(ranker).not.toHaveBeenCalled();
  });

  it("does not materialize an overlarge per-place food option set", async () => {
    const source = structuredClone(sourceWithMultipleCandidates());
    const place = source.catalog.places.find((candidate) => candidate.id === "place-banh-mi");
    if (!place) throw new Error("food fixture place missing");
    const vendor = place.foodVendors[0];
    if (!vendor) throw new Error("food fixture vendor missing");
    const menu = vendor.menuItems[0];
    if (!menu) throw new Error("food fixture menu missing");
    vendor.menuItems = Array.from({ length: 65 }, (_, index) => ({
      ...menu,
      id: `menu-banh-mi-${String(index).padStart(3, "0")}`,
      slug: `banh-mi-${String(index).padStart(3, "0")}`,
    }));
    const ranker = vi.fn(async () => ({
      orderedIds: ["place-banh-mi"],
      rationales: { "place-banh-mi": "matched" },
      foodSelections: [],
    }));

    const result = await recommendItinerary(source, { ranker });

    expect(result).toMatchObject({
      ok: true,
      value: { degraded: true, messageKey: "itinerary.ai_invalid" },
    });
    expect(ranker).not.toHaveBeenCalled();
  });

  it("does not send a provider payload over the byte cap", async () => {
    const base = structuredClone(sourceWithMultipleCandidates());
    const history = base.catalog.places.find((place) => place.id === "place-history");
    if (!history) throw new Error("history fixture place missing");
    const longHistoryPlaces = Array.from({ length: 100 }, (_, index) => ({
      ...history,
      id: `place-history-${String(index).padStart(3, "0")}-${"x".repeat(140)}`,
      openingHours: [{ weekday: 6 as const, opensAt: "08:00", closesAt: "17:00" }],
      dietarySupport: { halal: "supported" as const },
      mobilitySupport: { "step-free": "supported" as const },
    }));
    base.catalog.places = [
      ...base.catalog.places.filter((place) => place.id === "place-banh-mi"),
      ...longHistoryPlaces,
    ];
    const ranker = vi.fn(async () => ({
      orderedIds: ["place-banh-mi"],
      rationales: { "place-banh-mi": "matched" },
      foodSelections: [],
    }));

    const result = await recommendItinerary(base, { ranker });

    expect(result).toMatchObject({
      ok: true,
      value: { degraded: true, messageKey: "itinerary.ai_invalid" },
    });
    expect(ranker).not.toHaveBeenCalled();
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
    const ranker = vi.fn(async () => ({ orderedIds: ["place-banh-mi"], rationales: { "place-banh-mi": "ok" }, foodSelections: [] }));

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
      foodSelections: [],
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
      foodSelections: [],
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
          foodSelections: [],
        });
      } else if (outcome === "invalid") {
        ranker = async () => ({ orderedIds: [], rationales: {}, foodSelections: [] });
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
    const ranker = vi.fn(async () => ({ orderedIds: ["place-banh-mi"], rationales: { "place-banh-mi": "ok" }, foodSelections: [] }));

    const result = await recommendItinerary(staleUsd, { ranker });

    expect(ranker).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "USD_DISABLED" }),
    });
  });

  it("never echoes a locked ID in create or recommend domain errors", async () => {
    const input = deterministicSource();
    input.request.lockedStopIds = ["guest@example.com"];
    const ranker = vi.fn(async () => ({
      orderedIds: ["guest@example.com"],
      rationales: { "guest@example.com": "must not run" },
      foodSelections: [],
    }));

    const created = createItinerary(input);
    const recommended = await recommendItinerary(input, { ranker });

    expect(JSON.stringify(created)).not.toContain("guest@example.com");
    expect(JSON.stringify(recommended)).not.toContain("guest@example.com");
    expect(created).toMatchObject({
      ok: false,
      error: { issueKeys: ["request.lockedStopIds.0"] },
    });
    expect(recommended).toMatchObject({
      ok: false,
      error: { issueKeys: ["request.lockedStopIds.0"] },
    });
    expect(ranker).not.toHaveBeenCalled();
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
      foodSelections: [],
    }));

    const result = await recommendItinerary(impossible, { ranker });

    expect(ranker).not.toHaveBeenCalled();
    expect(result).toEqual(expected);
  });
});
