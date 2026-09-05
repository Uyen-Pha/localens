import { afterAll, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";

const originalEnv = vi.hoisted(() => {
  const original = { ...process.env };
  process.env.PLAYWRIGHT_BASE_URL = "http://127.0.0.1:60337";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:60327";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-test";
  process.env.LOCALENS_RUNTIME_ISOLATED_PROJECT_ID = "localens-itinerary-0123456789abcdef";
  process.env.LOCALENS_RUNTIME_PLAYWRIGHT_OUTPUT_DIR = `${process.env.TEMP}/localens-runtime-itinerary-playwright-auth`;
  process.env.LOCALENS_RUNTIME_BROWSER = "chrome";
  return original;
});

import { createRuntimePlaywrightConfig } from "@/playwright.runtime.config";

afterAll(() => {
  process.env = { ...originalEnv };
});

describe("runtime Auth Playwright artifact boundary", () => {
  it("uses only the line reporter and disables every password-bearing browser artifact", async () => {
    const config = createRuntimePlaywrightConfig(process.env);

    expect(config.reporter).toEqual([["line"]]);
    expect(config.outputDir).toBe(resolve(process.env.LOCALENS_RUNTIME_PLAYWRIGHT_OUTPUT_DIR!));
    expect(config.preserveOutput).toBe("never");
    expect(config.use).toMatchObject({ trace: "off", screenshot: "off", video: "off" });
    expect(config.use).toMatchObject({ baseURL: process.env.PLAYWRIGHT_BASE_URL });
    expect(config.projects).toEqual([expect.objectContaining({ name: "chrome" })]);
    expect("webServer" in config).toBe(false);
  });

  it("fails closed without an owned output directory", async () => {
    expect(() => createRuntimePlaywrightConfig({
      PLAYWRIGHT_BASE_URL: "http://127.0.0.1:60337",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:60327",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test",
      LOCALENS_RUNTIME_ISOLATED_PROJECT_ID: "localens-itinerary-0123456789abcdef",
      LOCALENS_RUNTIME_BROWSER: "chrome",
    })).toThrow(/output directory/i);
  });

  it("fails closed on the presentation application and Supabase ports", () => {
    expect(() => createRuntimePlaywrightConfig({
      ...process.env,
      PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3200",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    })).toThrow(/isolated runner-owned project/i);
  });
});
