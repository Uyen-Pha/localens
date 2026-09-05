import { defineConfig } from "@playwright/test";

import { createRuntimeItineraryPlaywrightConfig } from "./playwright.runtime-itinerary.config";

export function createRuntimeFixedTourPlaywrightConfig(env: Record<string, string | undefined>) {
  const base = createRuntimeItineraryPlaywrightConfig(env);
  return {
    ...base,
    testMatch: "runtime-fixed-tour.spec.ts",
    timeout: 120_000,
  };
}

export default defineConfig(createRuntimeFixedTourPlaywrightConfig(process.env));
