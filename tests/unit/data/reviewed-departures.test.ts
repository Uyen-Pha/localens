import { expect, it } from "vitest";
import { reviewedDataset } from "@/components/dev/reviewed-tours";
import { reviewedDepartures } from "@/components/dev/reviewed-departures";

it("runs each tour seven days every week, preserves duration and uses unique departure IDs", () => {
  const ids: string[] = [];
  const weekdaySets: number[][] = [];
  reviewedDataset.tours.forEach((tour, index) => {
    const base = tour.departures[0];
    const departures = reviewedDepartures(base, index);
    expect(departures).toHaveLength(175);
    expect(departures[0].id).toBe(base.id);
    for (let week = 0; week < 25; week++) {
      expect(departures.filter(d => Math.floor((Date.parse(d.startAt) - Date.parse(base.startAt)) / 604800000) === week)).toHaveLength(7);
    }
    const days = [...new Set(departures.map(d => new Date(Date.parse(d.startAt) + 25200000).getUTCDay()))];
    expect([...days].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(days).toContain(6);
    weekdaySets.push(days);
    departures.forEach(d => {
      ids.push(d.id);
      expect(Date.parse(d.endAt) - Date.parse(d.startAt)).toBe(tour.durationMinutes * 60000);
      expect(d.startAt.slice(11)).toBe(base.startAt.slice(11));
    });
  });
  expect(new Set(ids).size).toBe(ids.length);
  expect(new Set(weekdaySets.flat()).size).toBe(7);
  expect(new Set(weekdaySets.map(d => [...d].sort().join())).size).toBe(1);
});

