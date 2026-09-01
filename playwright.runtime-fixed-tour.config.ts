import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3200";

export function createRuntimeFixedTourPlaywrightConfig(env: Record<string, string | undefined>) {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Runtime fixed-tour Playwright requires explicit Supabase browser configuration");
  }
  if (!env.LOCALENS_RUNTIME_PLAYWRIGHT_OUTPUT_DIR) {
    throw new Error("Runtime fixed-tour Playwright requires an owned output directory");
  }
  return {
    testDir: "./tests/e2e",
    testMatch: "runtime-fixed-tour.spec.ts",
    outputDir: env.LOCALENS_RUNTIME_PLAYWRIGHT_OUTPUT_DIR,
    preserveOutput: "never" as const,
    fullyParallel: false,
    workers: 1,
    forbidOnly: Boolean(env.CI),
    retries: 0,
    reporter: [["line"]] as [["line"]],
    use: {
      baseURL,
      trace: "off" as const,
      screenshot: "off" as const,
      video: "off" as const,
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  };
}

export default defineConfig(createRuntimeFixedTourPlaywrightConfig(process.env));
