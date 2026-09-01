import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3200";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !publishableKey) {
  throw new Error("Local runtime Auth Playwright requires explicit Supabase browser configuration");
}

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "runtime-auth.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["line"], ["html", { open: "never", outputFolder: "playwright-report-runtime-auth" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev:supabase --hostname 127.0.0.1 --port 3200",
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
});
