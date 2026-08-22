// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  findEarliestVisitStart,
  getOpeningIntervals,
} from "@/lib/domain/itinerary/opening-hours";
import { normalizeToHcmMinute } from "@/lib/domain/itinerary/local-time";
import {
  placeCandidateSchema,
  type PlaceCandidate,
} from "@/lib/domain/itinerary/contracts";
import { itineraryFixture } from "@/tests/fixtures/itinerary/catalog.v1";

const clone = <T>(value: T): T => structuredClone(value);

const localMinute = (value: string): number => {
  const result = normalizeToHcmMinute(`${value}+07:00`);
  if (!result.ok) throw new Error(`invalid test time: ${value}`);
  return result.value;
};

const placeWithHours = (
  openingHours: PlaceCandidate["openingHours"],
  openingExceptions: PlaceCandidate["openingExceptions"] = [],
): PlaceCandidate => ({
  ...clone(itineraryFixture.catalog.places[0]),
  openingHours,
  openingExceptions,
});

describe("opening hours in HCMC minutes", () => {
  it("projects a normal window and allows an exact finish at close", () => {
    const place = placeWithHours([
      { weekday: 6, opensAt: "08:00", closesAt: "10:00" },
    ]);
    const intervals = getOpeningIntervals(place, "2026-09-05");

    expect(intervals).toEqual({
      ok: true,
      value: [
        {
          startEpochMinute: localMinute("2026-09-05T08:00:00"),
          endEpochMinute: localMinute("2026-09-05T10:00:00"),
          sourceWindowKey: "normal:6:0",
        },
      ],
    });
    expect(
      findEarliestVisitStart(
        place,
        localMinute("2026-09-05T08:30:00"),
        localMinute("2026-09-05T10:00:00"),
        90,
      ),
    ).toEqual({ ok: true, value: localMinute("2026-09-05T08:30:00") });
  });

  it("splits overnight windows across dates while retaining one source key", () => {
    const place = placeWithHours([
      { weekday: 6, opensAt: "23:00", closesAt: "02:00" },
    ]);
    const firstDate = getOpeningIntervals(place, "2026-09-05");
    const secondDate = getOpeningIntervals(place, "2026-09-06");

    expect(firstDate).toEqual({
      ok: true,
      value: [
        {
          startEpochMinute: localMinute("2026-09-05T23:00:00"),
          endEpochMinute: localMinute("2026-09-06T00:00:00"),
          sourceWindowKey: "normal:6:0",
        },
      ],
    });
    expect(secondDate).toEqual({
      ok: true,
      value: [
        {
          startEpochMinute: localMinute("2026-09-06T00:00:00"),
          endEpochMinute: localMinute("2026-09-06T02:00:00"),
          sourceWindowKey: "normal:6:0",
        },
      ],
    });
    expect(
      findEarliestVisitStart(
        place,
        localMinute("2026-09-05T23:30:00"),
        localMinute("2026-09-06T01:30:00"),
        120,
      ),
    ).toEqual({ ok: true, value: localMinute("2026-09-05T23:30:00") });
  });

  it("replaces normal windows with a same-date exception", () => {
    const place = placeWithHours(
      [{ weekday: 6, opensAt: "08:00", closesAt: "12:00" }],
      [
        {
          localDate: "2026-09-05",
          closed: false,
          windows: [{ opensAt: "09:00", closesAt: "10:00" }],
        },
      ],
    );

    expect(getOpeningIntervals(place, "2026-09-05")).toEqual({
      ok: true,
      value: [
        {
          startEpochMinute: localMinute("2026-09-05T09:00:00"),
          endEpochMinute: localMinute("2026-09-05T10:00:00"),
          sourceWindowKey: "exception:2026-09-05:0",
        },
      ],
    });
  });

  it("sorts exception fragments before finding the earliest visit", () => {
    const place = placeWithHours(
      [],
      [
        {
          localDate: "2026-09-05",
          closed: false,
          windows: [
            { opensAt: "12:00", closesAt: "13:00" },
            { opensAt: "09:00", closesAt: "10:00" },
          ],
        },
      ],
    );

    expect(getOpeningIntervals(place, "2026-09-05")).toEqual({
      ok: true,
      value: [
        {
          startEpochMinute: localMinute("2026-09-05T09:00:00"),
          endEpochMinute: localMinute("2026-09-05T10:00:00"),
          sourceWindowKey: "exception:2026-09-05:1",
        },
        {
          startEpochMinute: localMinute("2026-09-05T12:00:00"),
          endEpochMinute: localMinute("2026-09-05T13:00:00"),
          sourceWindowKey: "exception:2026-09-05:0",
        },
      ],
    });
    expect(
      findEarliestVisitStart(
        place,
        localMinute("2026-09-05T08:00:00"),
        localMinute("2026-09-05T14:00:00"),
        30,
      ),
    ).toEqual({ ok: true, value: localMinute("2026-09-05T09:00:00") });
  });

  it("omits a zero-length carry fragment for an overnight close at midnight", () => {
    const place = placeWithHours([
      { weekday: 6, opensAt: "23:00", closesAt: "00:00" },
    ]);

    expect(getOpeningIntervals(place, "2026-09-06")).toEqual({
      ok: true,
      value: [],
    });
    expect(
      findEarliestVisitStart(
        place,
        localMinute("2026-09-05T23:00:00"),
        localMinute("2026-09-06T00:00:00"),
        60,
      ),
    ).toEqual({ ok: true, value: localMinute("2026-09-05T23:00:00") });
  });

  it("suppresses prior-day overnight carry-over when the next date is closed", () => {
    const place = placeWithHours(
      [{ weekday: 5, opensAt: "23:00", closesAt: "02:00" }],
      [{ localDate: "2026-09-06", closed: true, windows: [] }],
    );

    expect(getOpeningIntervals(place, "2026-09-06")).toEqual({
      ok: true,
      value: [],
    });
    expect(
      findEarliestVisitStart(
        place,
        localMinute("2026-09-06T00:00:00"),
        localMinute("2026-09-06T02:00:00"),
        30,
      ),
    ).toEqual({ ok: true, value: null });
  });

  it("never returns a visit whose finish exceeds latestEnd", () => {
    const place = placeWithHours([
      { weekday: 6, opensAt: "08:00", closesAt: "10:00" },
    ]);

    expect(
      findEarliestVisitStart(
        place,
        localMinute("2026-09-05T08:00:00"),
        localMinute("2026-09-05T09:59:00"),
        120,
      ),
    ).toEqual({ ok: true, value: null });
  });

  it("returns null when a place has no interval for the requested visit", () => {
    const place = placeWithHours([
      { weekday: 6, opensAt: "08:00", closesAt: "10:00" },
    ]);

    expect(
      findEarliestVisitStart(
        place,
        localMinute("2026-09-05T11:00:00"),
        localMinute("2026-09-05T12:00:00"),
        30,
      ),
    ).toEqual({ ok: true, value: null });
  });

  it("rejects reversed, overlong, and invalid-duration search horizons", () => {
    const place = placeWithHours([]);
    const earliest = localMinute("2026-09-05T08:00:00");

    for (const result of [
      findEarliestVisitStart(place, earliest, earliest - 1, 30),
      findEarliestVisitStart(place, earliest, earliest + 721, 30),
      findEarliestVisitStart(place, earliest, earliest + 60, 721),
    ]) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_ITINERARY_INPUT");
      }
    }
  });

  it("reuses the strict place schema for runtime validation", () => {
    const withExtraField = clone(placeWithHours([])) as PlaceCandidate &
      Record<string, unknown>;
    withExtraField.unexpected = true;
    expect(placeCandidateSchema.safeParse(withExtraField).success).toBe(false);
    expect(getOpeningIntervals(withExtraField, "2026-09-05").ok).toBe(false);

    const crossWeekOverlap = placeWithHours([
      { weekday: 0, opensAt: "23:00", closesAt: "02:00" },
      { weekday: 1, opensAt: "01:00", closesAt: "03:00" },
    ]);
    expect(placeCandidateSchema.safeParse(crossWeekOverlap).success).toBe(false);
    expect(getOpeningIntervals(crossWeekOverlap, "2026-09-07").ok).toBe(false);
  });
});
