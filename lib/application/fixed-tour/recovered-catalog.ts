import type { PublishedTour } from "@/lib/domain/data/contracts";
import type { Locale } from "@/lib/i18n/config";

import { additionalPublishedTours } from "./additions";

/**
 * Adds the historical, source-backed proposal cards to the current runtime
 * catalog without touching Supabase. Existing runtime rows always win when a
 * stable locale/slug pair is already present.
 */
export function mergeRecoveredPublishedTours(
  publishedTours: readonly PublishedTour[],
  locale: Locale,
): PublishedTour[] {
  const merged = [...publishedTours];
  const keys = new Set(publishedTours.map((tour) => `${tour.locale}:${tour.slug}`));

  for (const tour of additionalPublishedTours(locale)) {
    const key = `${tour.locale}:${tour.slug}`;
    if (keys.has(key)) continue;
    keys.add(key);
    merged.push(tour);
  }

  return merged;
}
