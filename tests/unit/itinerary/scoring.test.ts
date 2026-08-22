// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  buildRankOrder,
  comparePaths,
  scoreCandidate,
} from "@/lib/domain/itinerary/scoring";
import { itineraryFixture } from "@/tests/fixtures/itinerary/catalog.v1";

describe("itinerary scoring", () => {
  it("uses a zero-based rank bonus and the filtered candidate count", () => {
    const candidate = itineraryFixture.catalog.places[0];

    expect(
      scoreCandidate(
        candidate,
        itineraryFixture.request.priorityWeights,
        0,
        4,
      ),
    ).toBe(5_004);
    expect(
      scoreCandidate(
        candidate,
        itineraryFixture.request.priorityWeights,
        1,
        4,
      ),
    ).toBe(5_003);
  });

  it("appends omitted IDs in lexicographic order after the supplied subset", () => {
    expect(buildRankOrder(["z", "a", "m"], ["m"])).toEqual({
      ok: true,
      value: ["m", "a", "z"],
    });
  });

  it("rejects duplicate, unknown, and malformed direct ranking lists", () => {
    expect(buildRankOrder(["a", "b"], ["a", "a"])).toMatchObject({
      ok: false,
      error: { code: "INVALID_ITINERARY_INPUT" },
    });
    expect(buildRankOrder(["a", "b"], ["unknown"])).toMatchObject({
      ok: false,
      error: { code: "INVALID_ITINERARY_INPUT" },
    });
    expect(buildRankOrder(["a", "a"])).toMatchObject({
      ok: false,
      error: { code: "INVALID_ITINERARY_INPUT" },
    });
  });

  it("rejects sparse filtered and ranked arrays instead of skipping holes", () => {
    const sparseFiltered = new Array(2) as string[];
    sparseFiltered[0] = "a";
    const sparseRanked = new Array(1) as string[];

    expect(buildRankOrder(sparseFiltered)).toMatchObject({
      ok: false,
      error: { code: "INVALID_ITINERARY_INPUT" },
    });
    expect(buildRankOrder(["a"], sparseRanked)).toMatchObject({
      ok: false,
      error: { code: "INVALID_ITINERARY_INPUT" },
    });
  });

  it("normalizes padded IDs and rejects control delimiters", () => {
    expect(buildRankOrder([" place-a ", "place-b"], [" place-a "])).toEqual({
      ok: true,
      value: ["place-a", "place-b"],
    });
    expect(buildRankOrder(["place\u0000a"])).toMatchObject({
      ok: false,
      error: { code: "INVALID_ITINERARY_INPUT" },
    });
  });

  it("sorts paths by score, cost, finish, and joined IDs in that order", () => {
    const base = { score: 10, groupCostVnd: 100, finishEpochMinute: 500 };
    expect(comparePaths({ ...base, placeIds: ["z"] }, { ...base, placeIds: ["a"] })).toBeGreaterThan(0);
    expect(comparePaths({ ...base, groupCostVnd: 99 }, base)).toBeLessThan(0);
    expect(comparePaths({ ...base, finishEpochMinute: 499 }, base)).toBeLessThan(0);
    expect(comparePaths({ ...base, score: 11 }, base)).toBeLessThan(0);
  });
});
