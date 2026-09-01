import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3200";

export function createRuntimePlaywrightConfig(env: Record<string, string | undefined>) {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const outputDir = env.LOCALENS_RUNTIME_PLAYWRIGHT_OUTPUT_DIR;
  if (!supabaseUrl || !publishableKey) {
    throw new Error("Local runtime Auth Playwright requires explicit Supabase browser configuration");
  }
  if (!outputDir) {
    throw new Error("Local runtime Auth Playwright requires an owned output directory");
  }

  return {
    testDir: "./tests/e2e",
    testMatch: "runtime-auth.spec.ts",
    outputDir,
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
    webServer: {
      command: "node scripts/run-next-mode.mjs dev supabase --hostname 127.0.0.1 --port 3200",
      url: `${baseURL}/en/sign-in/`,
      env: {
        NEXT_PUBLIC_LOCALLENS_RUNTIME: "supabase",
        NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  };
}

export default defineConfig(createRuntimePlaywrightConfig(process.env));
