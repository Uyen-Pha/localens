// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  getTransition,
  indexTravelSnapshot,
  toScheduledTransition,
} from "@/lib/domain/itinerary/travel";
import { itineraryFixture } from "@/tests/fixtures/itinerary/catalog.v1";

const clone = <T>(value: T): T => structuredClone(value);

describe("directed itinerary travel primitives", () => {
  it("keeps directed edges asymmetric and preserves verification metadata", () => {
    const result = indexTravelSnapshot(itineraryFixture.travel);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(getTransition(result.value, "place-banh-mi", "place-history")).toEqual(
      itineraryFixture.travel.edges[0],
    );
    expect(getTransition(result.value, "place-history", "place-banh-mi")).toEqual(
      itineraryFixture.travel.edges[1],
    );
    expect(
      getTransition(result.value, "place-history", "place-banh-mi")?.verifiedAt,
    ).toBe("2026-09-04T18:00:00+07:00");
  });

  it("rejects duplicate directed edges deterministically", () => {
    const snapshot = clone(itineraryFixture.travel);
    snapshot.edges.push(clone(snapshot.edges[0]));

    expect(indexTravelSnapshot(snapshot)).toEqual({
      ok: false,
      error: {
        code: "INVALID_ITINERARY_INPUT",
        messageKey: "itinerary.travel.duplicate_edge",
        retryable: false,
        issueKeys: ["travel.edges"],
      },
    });
  });

  it("returns null for missing transitions without synthesizing self-edges", () => {
    const result = indexTravelSnapshot(itineraryFixture.travel);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(getTransition(result.value, "place-history", "place-craft")).toBeNull();
    expect(getTransition(result.value, "place-banh-mi", "place-banh-mi")).toBeNull();
  });

  it("adds exactly ten minutes of transition buffer", () => {
    const edge = itineraryFixture.travel.edges[1];

    expect(toScheduledTransition(edge)).toEqual({
      travelMinutes: 8,
      bufferMinutes: 10,
      groupCostVnd: 45_000,
    });
  });
});
