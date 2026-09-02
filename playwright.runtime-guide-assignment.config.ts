import { defineConfig } from "@playwright/test";

import { createRuntimeFixedTourPlaywrightConfig } from "./playwright.runtime-fixed-tour.config";

export function createRuntimeGuideAssignmentPlaywrightConfig(env: Record<string, string | undefined>) {
  return {
    ...createRuntimeFixedTourPlaywrightConfig(env),
    testMatch: "runtime-guide-assignment.spec.ts",
  };
}

export default defineConfig(createRuntimeGuideAssignmentPlaywrightConfig(process.env));
