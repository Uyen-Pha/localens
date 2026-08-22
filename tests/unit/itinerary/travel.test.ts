// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  getTransition,
  indexTravelSnapshot,
  toScheduledTransition,
} from "@/lib/domain/itinerary/travel";
import { itineraryFixture } from "@/tests/fixtures/itinerary/catalog.v1";

const clone = <T>(value: T): T => structuredClone(value);

function mutateReachableObjects(value: unknown, seen = new Set<object>()): void {
  if (value instanceof Map) {
    value.clear();
    return;
  }
  if (value instanceof Set) {
    value.clear();
    return;
  }
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function") ||
    seen.has(value)
  ) {
    return;
  }

  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor && "value" in descriptor) {
      mutateReachableObjects(descriptor.value, seen);
    }
  }
}

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

  it("keeps transitions stable against runtime backing-map mutation", () => {
    const result = indexTravelSnapshot(itineraryFixture.travel);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const expected = itineraryFixture.travel.edges[0];
    const outer = result.value;
    const nested = outer.get(expected.fromPlaceId);

    expect(Object.isFrozen(outer)).toBe(true);
    expect(nested).toBeDefined();
    if (!nested) return;
    expect(Object.isFrozen(nested)).toBe(true);

    mutateReachableObjects(nested);
    mutateReachableObjects(outer);
    Reflect.set(outer, "backing", new Map());

    expect(getTransition(outer, expected.fromPlaceId, expected.toPlaceId)).toEqual(
      expected,
    );
  });

  it("distinguishes duplicate pairs after edge ID normalization", () => {
    const snapshot = clone(itineraryFixture.travel);
    const edge = snapshot.edges[0];
    snapshot.edges.push({
      ...edge,
      fromPlaceId: ` ${edge.fromPlaceId}`,
      toPlaceId: `${edge.toPlaceId} `,
    });

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

  it("returns a domain error instead of throwing for malformed snapshots", () => {
    const malformed: unknown[] = [
      null,
      { edges: null },
      { edges: [null] },
      { edges: [{ fromPlaceId: "origin", toPlaceId: "destination" }] },
    ];

    for (const source of malformed) {
      expect(() => indexTravelSnapshot(source as never)).not.toThrow();
      const result = indexTravelSnapshot(source as never);
      expect(result).toEqual({
        ok: false,
        error: {
          code: "INVALID_ITINERARY_INPUT",
          messageKey: "itinerary.travel.invalid",
          retryable: false,
          issueKeys: ["travel.edges"],
        },
      });
    }
  });

  it("accepts the declared travel integer boundaries without changing values", () => {
    const snapshot = clone(itineraryFixture.travel);
    snapshot.edges[0].minutes = 1;
    snapshot.edges[0].groupCostVnd = 0;
    snapshot.edges[1].minutes = 240;
    snapshot.edges[1].groupCostVnd = Math.floor(Number.MAX_SAFE_INTEGER / 8);

    const result = indexTravelSnapshot(snapshot);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(toScheduledTransition(result.value.get("place-history")!.get("place-banh-mi")!)).toEqual({
      travelMinutes: 240,
      bufferMinutes: 10,
      groupCostVnd: Math.floor(Number.MAX_SAFE_INTEGER / 8),
    });
  });

  it("returns the same transition values across repeated indexing", () => {
    const summaries = Array.from({ length: 8 }, () => {
      const result = indexTravelSnapshot(itineraryFixture.travel);
      expect(result.ok).toBe(true);
      if (!result.ok) return null;
      return {
        forward: getTransition(result.value, "place-banh-mi", "place-history"),
        reverse: getTransition(result.value, "place-history", "place-banh-mi"),
      };
    });

    expect(summaries.every((summary) => summary !== null && summary.forward?.verifiedAt === "2026-09-04T18:00:00+07:00")).toBe(true);
    expect(summaries).toEqual(Array.from({ length: 8 }, () => summaries[0]));
  });
});
