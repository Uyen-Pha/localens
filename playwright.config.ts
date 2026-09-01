import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3300);
const localBaseURL = `http://127.0.0.1:${port}`;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? localBaseURL;
const hasBaseURLOverride = Boolean(process.env.PLAYWRIGHT_BASE_URL);
const useStaticPreview = process.env.PLAYWRIGHT_STATIC === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["runtime-auth.spec.ts", "runtime-fixed-tour.spec.ts"],
  // Keep deterministic visual evidence serial: Next dev can compile several
  // route modules concurrently and surface transient JSON parse overlays.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["line"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  ...(hasBaseURLOverride
    ? {}
    : {
        webServer: {
          command: useStaticPreview
            ? `node scripts/static-preview-server.mjs --port ${port}`
            : `node scripts/run-next-mode.mjs dev demo --hostname 127.0.0.1 --port ${port}`,
          url: `${localBaseURL}/en/`,
          env: {
            NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES: "1",
          },
          reuseExistingServer: false,
          timeout: 120_000,
        },
      }),
});
