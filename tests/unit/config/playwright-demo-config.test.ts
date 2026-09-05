import { afterEach, describe, expect, it, vi } from "vitest";

import config from "@/playwright.config";

const originalBrowser = process.env.LOCALENS_RUNTIME_BROWSER;
const originalCI = process.env.CI;

async function loadDemoConfig({
  browser,
  ci,
}: {
  browser?: string;
  ci?: string;
}) {
  vi.resetModules();

  if (browser === undefined) delete process.env.LOCALENS_RUNTIME_BROWSER;
  else process.env.LOCALENS_RUNTIME_BROWSER = browser;

  if (ci === undefined) delete process.env.CI;
  else process.env.CI = ci;

  return (await import("@/playwright.config")).default;
}

afterEach(() => {
  if (originalBrowser === undefined) delete process.env.LOCALENS_RUNTIME_BROWSER;
  else process.env.LOCALENS_RUNTIME_BROWSER = originalBrowser;

  if (originalCI === undefined) delete process.env.CI;
  else process.env.CI = originalCI;

  vi.resetModules();
});

describe("demo Playwright server isolation", () => {
  it("owns a clean non-manual port through the signal-forwarding Next wrapper", () => {
    expect(config.testIgnore).toEqual([
      "runtime-auth.spec.ts",
      "runtime-itinerary.spec.ts",
      "runtime-fixed-tour.spec.ts",
      "runtime-guide-assignment.spec.ts",
    ]);
    expect(config.timeout).toBe(120_000);
    expect(config.use?.baseURL).toBe("http://127.0.0.1:3300");
    expect(config.webServer).toMatchObject({
      command: "node scripts/run-next-mode.mjs dev demo --hostname 127.0.0.1 --port 3300",
      url: "http://127.0.0.1:3300/en/",
      reuseExistingServer: false,
    });
  });

  it("selects the installed Chrome channel for an approved local run", async () => {
    const chromeConfig = await loadDemoConfig({ browser: "chrome" });

    expect(chromeConfig.projects).toEqual([
      expect.objectContaining({
        name: "chrome",
        use: expect.objectContaining({ channel: "chrome" }),
      }),
    ]);
  });

  it("keeps bundled Chromium as the local default", async () => {
    const defaultConfig = await loadDemoConfig({});

    expect(defaultConfig.projects).toEqual([
      expect.objectContaining({ name: "chromium" }),
    ]);
    expect(defaultConfig.projects?.[0]?.use).not.toHaveProperty("channel");
  });

  it("honors the approved Chrome channel in CI when requested", async () => {
    const ciConfig = await loadDemoConfig({ browser: "chrome", ci: "1" });

    expect(ciConfig.projects).toEqual([
      expect.objectContaining({
        name: "chrome",
        use: expect.objectContaining({ channel: "chrome" }),
      }),
    ]);
  });
});
