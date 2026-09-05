import { defineConfig } from "@playwright/test";

import { createRuntimeItineraryPlaywrightConfig } from "./playwright.runtime-itinerary.config";

export function createRuntimePlaywrightConfig(env: Record<string, string | undefined>) {
  const base = createRuntimeItineraryPlaywrightConfig(env);
  return {
    ...base,
    testMatch: "runtime-auth.spec.ts",
  };
}

export default defineConfig(createRuntimePlaywrightConfig(process.env));
