// @vitest-environment node

import { describe, expect, it } from "vitest";

import { filterCandidates } from "@/lib/domain/itinerary/candidate-filter";
import { buildRankOrder } from "@/lib/domain/itinerary/scoring";
import { scheduleItinerary } from "@/lib/domain/itinerary/scheduler";
import { validateItinerary } from "@/lib/domain/itinerary/validator";
import { itineraryFixture } from "@/tests/fixtures/itinerary/catalog.v1";

const clone = <T>(value: T): T => structuredClone(value);

function candidatesFor(input = itineraryFixture) {
  const filtered = filterCandidates(input, 2_000_000);
  if (!filtered.ok) throw new Error("fixture should filter");
  const rankOrder = buildRankOrder(filtered.value.map((place) => place.id));
  if (!rankOrder.ok) throw new Error("fixture should rank");
  return { filtered: filtered.value, rankOrder: rankOrder.value };
}

describe("scheduleItinerary", () => {
  it("emits a concrete food selection and separates pay-at-vendor totals", () => {
    const { filtered, rankOrder } = candidatesFor();
    const result = scheduleItinerary(
      itineraryFixture,
      filtered,
      rankOrder,
      2_000_000,
      "deterministic",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items[0]).toMatchObject({
      placeId: "place-banh-mi",
      foodSelection: {
        vendorId: "vendor-banh-mi-legacy",
        menuItemId: "menu-banh-mi-legacy",
        quantity: 2,
        priceVndMin: 30_000,
        priceVndMax: 40_000,
        paymentMode: "pay_at_vendor",
      },
      foodCostMinVnd: 60_000,
      foodCostMaxVnd: 80_000,
      payAtVendorMinVnd: 60_000,
      payAtVendorMaxVnd: 80_000,
      customerPayableVnd: 360_000,
    });
    expect(result.value.totals).toMatchObject({
      admissionCostVnd: 360_000,
      foodCostMinVnd: 60_000,
      foodCostMaxVnd: 80_000,
      payAtVendorMinVnd: 60_000,
      payAtVendorMaxVnd: 80_000,
      customerPayableVnd: 360_000,
      groupCostMinVnd: 420_000,
      groupCostMaxVnd: 440_000,
      groupCostVnd: 440_000,
    });
  });

  it("rejects a food stop when its vendor is closed for the proposed interval", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = ["place-banh-mi"];
    input.catalog.places[0].foodVendors[0].openingHours = [
      { weekday: 6, opensAt: "18:00", closesAt: "19:00" },
    ];
    const result = scheduleItinerary(
      input,
      [input.catalog.places[0]],
      ["place-banh-mi"],
      2_000_000,
      "deterministic",
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "NO_FEASIBLE_ITINERARY" },
    });
  });

  it("waits for a later vendor opening when the joint interval still fits", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = ["place-banh-mi"];
    input.request.durationMinutes = 180;
    input.catalog.places[0].openingHours = [
      { weekday: 6, opensAt: "08:00", closesAt: "14:00" },
    ];
    input.catalog.places[0].openingExceptions = [];
    input.catalog.places[0].foodVendors[0].openingHours = [
      { weekday: 6, opensAt: "10:00", closesAt: "14:00" },
    ];
    const result = scheduleItinerary(
      input,
      [input.catalog.places[0]],
      ["place-banh-mi"],
      2_000_000,
      "deterministic",
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.items[0]?.startAt).toBe("2026-09-05T10:00:00+07:00");
  });

  it("uses the food upper bound for hard-budget pruning", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = ["place-banh-mi"];
    input.catalog.places[0].foodVendors[0].menuItems[0].priceVndMin = 1;
    input.catalog.places[0].foodVendors[0].menuItems[0].priceVndMax = 1_000_000;
    const result = scheduleItinerary(
      input,
      [input.catalog.places[0]],
      ["place-banh-mi"],
      360_001,
      "deterministic",
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "NO_FEASIBLE_ITINERARY" },
    });
  });

  it("uses zero travel, buffer, and cost for the first stop", () => {
    const { filtered, rankOrder } = candidatesFor();
    const result = scheduleItinerary(
      itineraryFixture,
      filtered,
      rankOrder,
      2_000_000,
      "deterministic",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items[0]).toMatchObject({
        placeId: "place-banh-mi",
        startAt: "2026-09-05T09:00:00+07:00",
        travelMinutesBefore: 0,
        transitionBufferMinutesBefore: 0,
        travelCostVndBefore: 0,
      });
      expect(validateItinerary(itineraryFixture, result.value, rankOrder)).toEqual({ valid: true });
    }
  });

  it("builds deterministic byte-equal schedules and respects the pace cap", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = [];
    input.request.dietaryRequirements = [];
    input.request.mobilityRequirements = [];
    input.catalog.places.forEach((place) => {
      place.guideLanguages = ["en"];
      place.dietarySupport = {};
      place.mobilitySupport = {};
    });
    const { filtered, rankOrder } = candidatesFor(input);
    const first = scheduleItinerary(input, filtered, rankOrder, 2_000_000, "ai");
    const second = scheduleItinerary(input, filtered, rankOrder, 2_000_000, "ai");
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.value.items.length).toBeLessThanOrEqual(5);
  });

  it("requires directed edges, adds the exact transition buffer, and waits for opening", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = ["place-banh-mi", "place-history"];
    input.request.durationMinutes = 360;
    input.request.dietaryRequirements = [];
    input.catalog.places[1].openingHours = [
      { weekday: 6, opensAt: "11:00", closesAt: "14:00" },
    ];
    input.catalog.places[1].openingExceptions = [];
    const filtered = filterCandidates(input, 2_000_000);
    expect(filtered.ok).toBe(true);
    if (!filtered.ok) return;
    const rankOrder = buildRankOrder(filtered.value.map((place) => place.id), ["place-banh-mi", "place-history"]);
    expect(rankOrder.ok).toBe(true);
    if (!rankOrder.ok) return;

    const result = scheduleItinerary(input, filtered.value, rankOrder.value, 2_000_000, "deterministic");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items.map((item) => item.placeId)).toEqual(["place-banh-mi", "place-history"]);
      expect(result.value.items[1]).toMatchObject({
        startAt: "2026-09-05T11:00:00+07:00",
        travelMinutesBefore: 12,
        transitionBufferMinutesBefore: 10,
        travelCostVndBefore: 0,
      });
      expect(result.value.totals).toMatchObject({
        durationMinutes: 240,
        travelMinutes: 12,
        transitionBufferMinutes: 10,
      });
    }
  });

  it("applies relaxed, balanced, active, and global eight-stop caps", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = [];
    input.request.areas = ["district-1"];
    input.request.durationMinutes = 720;
    input.request.dietaryRequirements = [];
    input.request.mobilityRequirements = [];
    const candidates = Array.from({ length: 9 }, (_, index) => ({
      id: `pace-${index}`,
      areaId: "district-1",
      types: ["history"] as ["history"],
      priceVndPerPerson: 10_000,
      visitDurationMinutes: 15,
      guideLanguages: ["en"] as ["en"],
      dietarySupport: {},
      mobilitySupport: {},
      openingHours: [{ weekday: 6 as const, opensAt: "08:00", closesAt: "20:00" }],
      openingExceptions: [],
      foodVendors: [],
    }));
    input.travel.edges = candidates.flatMap((from) => candidates
      .filter((to) => to.id !== from.id)
      .map((to) => ({
        fromPlaceId: from.id,
        toPlaceId: to.id,
        mode: "walk" as const,
        minutes: 1,
        groupCostVnd: 0,
        verifiedAt: "2026-09-04T18:00:00+07:00",
      })));
    const ranking = buildRankOrder(candidates.map((candidate) => candidate.id));
    expect(ranking.ok).toBe(true);
    if (!ranking.ok) return;
    input.catalog.places = candidates;

    for (const [pace, expected] of [["relaxed", 3], ["balanced", 5], ["active", 8]] as const) {
      input.request.pace = pace;
      const result = scheduleItinerary(input, candidates, ranking.value, 2_000_000, "deterministic");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.items).toHaveLength(expected);
    }
  });

  it("rejects a rank order that is not a complete order of supplied candidates", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = [];
    input.request.dietaryRequirements = [];
    input.request.mobilityRequirements = [];
    input.catalog.places.forEach((place) => {
      place.guideLanguages = ["en"];
      place.dietarySupport = {};
      place.mobilitySupport = {};
    });
    const { filtered } = candidatesFor(input);
    const result = scheduleItinerary(
      itineraryFixture,
      filtered,
      [filtered[0].id],
      2_000_000,
      "deterministic",
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_ITINERARY_INPUT" },
    });
  });

  it("distinguishes malformed, sparse, and empty filtered collections", () => {
    const { filtered, rankOrder } = candidatesFor();
    const invalidCollection = scheduleItinerary(
      itineraryFixture,
      null as unknown as typeof filtered,
      rankOrder,
      2_000_000,
      "deterministic",
    );
    expect(invalidCollection).toMatchObject({
      ok: false,
      error: { code: "INVALID_ITINERARY_INPUT" },
    });

    const sparse = new Array(filtered.length + 1) as typeof filtered;
    sparse[0] = filtered[0];
    const sparseResult = scheduleItinerary(
      itineraryFixture,
      sparse,
      rankOrder,
      2_000_000,
      "deterministic",
    );
    expect(sparseResult).toMatchObject({
      ok: false,
      error: { code: "INVALID_ITINERARY_INPUT" },
    });

    const emptyResult = scheduleItinerary(
      itineraryFixture,
      [],
      [],
      2_000_000,
      "deterministic",
    );
    expect(emptyResult).toMatchObject({
      ok: false,
      error: { code: "NO_FEASIBLE_ITINERARY" },
    });
  });

  it("uses canonical catalog facts and rejects external or same-ID forged candidates", () => {
    const { filtered, rankOrder } = candidatesFor();
    const external = { ...filtered[0], id: "external-fake" };
    const externalResult = scheduleItinerary(
      itineraryFixture,
      [external],
      ["external-fake"],
      2_000_000,
      "deterministic",
    );
    expect(externalResult).toMatchObject({
      ok: false,
      error: { code: "INVALID_ITINERARY_INPUT" },
    });

    const forged = { ...filtered[0], priceVndPerPerson: 0, visitDurationMinutes: 15 };
    const forgedResult = scheduleItinerary(
      itineraryFixture,
      [forged],
      rankOrder,
      2_000_000,
      "deterministic",
    );
    expect(forgedResult).toMatchObject({
      ok: false,
      error: { code: "INVALID_ITINERARY_INPUT" },
    });
  });

  it("normalizes padded filtered and rank IDs while scheduling canonical catalog facts", () => {
    const { filtered } = candidatesFor();
    const padded = { ...filtered[0], id: ` ${filtered[0].id} ` };
    const result = scheduleItinerary(
      itineraryFixture,
      [padded],
      [` ${filtered[0].id} `],
      2_000_000,
      "deterministic",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items[0].placeId).toBe(filtered[0].id);
      expect(result.value.items[0].placeCostVnd).toBe(360_000);
      expect(result.value.items[0].visitDurationMinutes).toBe(45);
    }
  });

  it("uses DFS to recover a locked route whose low-ranked bridge was pruned by the beam", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = ["lock-a", "lock-b"];
    input.request.areas = ["district-1"];
    input.request.durationMinutes = 720;
    input.request.pace = "active";
    input.request.dietaryRequirements = [];
    input.request.mobilityRequirements = [];
    const place = (id: string, type: "history" | "street_food" = "history") => ({
      id,
      areaId: "district-1",
      types: [type] as ["history"] | ["street_food"],
      priceVndPerPerson: 10_000,
      visitDurationMinutes: 15,
      guideLanguages: ["en"] as ["en"],
      dietarySupport: {},
      mobilitySupport: {},
      openingHours: [{ weekday: 6 as const, opensAt: "08:00", closesAt: "20:00" }],
      openingExceptions: [],
      foodVendors: [],
    });
    const distractors = Array.from({ length: 52 }, (_, index) => place(`d-${String(index).padStart(2, "0")}`, "street_food"));
    const bridge = place("z-bridge", "history");
    const lockA = place("lock-a");
    const lockB = place("lock-b");
    const filtered = [...distractors, bridge, lockA, lockB];
    input.catalog.places = filtered;
    input.travel.edges = [
      {
        fromPlaceId: "lock-a",
        toPlaceId: "z-bridge",
        mode: "walk",
        minutes: 1,
        groupCostVnd: 0,
        verifiedAt: "2026-09-04T18:00:00+07:00",
      },
      {
        fromPlaceId: "z-bridge",
        toPlaceId: "lock-b",
        mode: "walk",
        minutes: 1,
        groupCostVnd: 0,
        verifiedAt: "2026-09-04T18:00:00+07:00",
      },
      ...distractors.slice(1).map((from) => ({
        fromPlaceId: from.id,
        toPlaceId: distractors[0].id,
        mode: "walk" as const,
        minutes: 1,
        groupCostVnd: 0,
        verifiedAt: "2026-09-04T18:00:00+07:00",
      })),
    ];
    const ranking = buildRankOrder(
      filtered.map((candidate) => candidate.id),
      ["lock-a", "lock-b", ...distractors.map((candidate) => candidate.id), "z-bridge"],
    );
    if (!ranking.ok) throw new Error("fixture should rank");

    const result = scheduleItinerary(input, filtered, ranking.value, 2_000_000, "deterministic");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.items.map((item) => item.placeId)).toEqual(["lock-a", "z-bridge", "lock-b"]);
  });

  it("returns a retryable search-limit error when DFS would exceed 20,000 states", () => {
    const input = clone(itineraryFixture);
    input.request.lockedStopIds = ["lock-a", "lock-b"];
    input.request.areas = ["district-1"];
    input.request.durationMinutes = 720;
    input.request.pace = "active";
    input.request.dietaryRequirements = [];
    input.request.mobilityRequirements = [];
    const place = (id: string) => ({
      id,
      areaId: "district-1",
      types: ["history"] as ["history"],
      priceVndPerPerson: 10_000,
      visitDurationMinutes: 15,
      guideLanguages: ["en"] as ["en"],
      dietarySupport: {},
      mobilitySupport: {},
      openingHours: [{ weekday: 6 as const, opensAt: "08:00", closesAt: "20:00" }],
      openingExceptions: [],
      foodVendors: [],
    });
    const unlocked = Array.from({ length: 10 }, (_, index) => place(`u-${String(index).padStart(2, "0")}`));
    const lockA = place("lock-a");
    const lockB = place("lock-b");
    const filtered = [...unlocked, lockA, lockB];
    input.catalog.places = filtered;
    input.travel.edges = unlocked.flatMap((from) => unlocked
      .filter((to) => to.id !== from.id)
      .map((to) => ({
        fromPlaceId: from.id,
        toPlaceId: to.id,
        mode: "walk" as const,
        minutes: 1,
        groupCostVnd: 0,
        verifiedAt: "2026-09-04T18:00:00+07:00",
      })));
    const ranking = buildRankOrder(filtered.map((candidate) => candidate.id));
    if (!ranking.ok) throw new Error("fixture should rank");

    const result = scheduleItinerary(input, filtered, ranking.value, 2_000_000, "deterministic");

    expect(result).toEqual({
      ok: false,
      error: {
        code: "ITINERARY_SEARCH_LIMIT",
        messageKey: "itinerary.search_limit",
        retryable: true,
      },
    });
  });
});
