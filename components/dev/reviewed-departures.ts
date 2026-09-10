// Localhost illustration only. Weekdays use the tour's Ho Chi Minh City date.
export const tourOperatingDays = [[0, 1, 2, 3, 4, 5, 6], [0, 1, 2, 3, 4, 5, 6], [0, 1, 2, 3, 4, 5, 6]] as const;

export function reviewedDepartures<T extends { id: string; startAt: string; endAt: string }>(departure: T, tourIndex: number): T[] {
  return Array.from({ length: 175 }, (_, index) => {
    const shift = index * 86400000;
    return { ...departure,
      id: index === 0 ? departure.id : `d1800000-0000-4000-8000-${String(Number(departure.id.slice(-12)) * 1000 + index).padStart(12, "0")}`,
      startAt: new Date(Date.parse(departure.startAt) + shift).toISOString(),
      endAt: new Date(Date.parse(departure.endAt) + shift).toISOString(),
    };
  }).filter(d => (tourOperatingDays[tourIndex] as readonly number[]).includes(new Date(Date.parse(d.startAt) + 7 * 3600000).getUTCDay()));
}
