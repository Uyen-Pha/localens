import { afterAll, describe, expect, it, vi } from "vitest";

const originalEnv = vi.hoisted(() => {
  const original = { ...process.env };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-test";
  process.env.LOCALENS_RUNTIME_PLAYWRIGHT_OUTPUT_DIR = "C:/Temp/localens-runtime-fixed-tour-owned";
  return original;
});

import { createRuntimeFixedTourPlaywrightConfig } from "@/playwright.runtime-fixed-tour.config";

afterAll(() => { process.env = { ...originalEnv }; });

describe("runtime fixed-tour Playwright boundary", () => {
  it("collects only the serial Chromium fixed-tour spec without owning a web server", () => {
    const config = createRuntimeFixedTourPlaywrightConfig(process.env);

    expect(config.testMatch).toBe("runtime-fixed-tour.spec.ts");
    expect(config.fullyParallel).toBe(false);
    expect(config.workers).toBe(1);
    expect(config.retries).toBe(0);
    expect(config.projects).toHaveLength(1);
    expect(config.projects[0]?.name).toBe("chromium");
    expect(config.use?.baseURL).toBe("http://127.0.0.1:3200");
    expect("webServer" in config).toBe(false);
  });

  it("uses no password-bearing artifacts and requires its owned output directory", () => {
    const config = createRuntimeFixedTourPlaywrightConfig(process.env);

    expect(config.reporter).toEqual([["line"]]);
    expect(config.outputDir).toBe("C:/Temp/localens-runtime-fixed-tour-owned");
    expect(config.preserveOutput).toBe("never");
    expect(config.use).toMatchObject({ trace: "off", screenshot: "off", video: "off" });
    expect(() => createRuntimeFixedTourPlaywrightConfig({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test",
    })).toThrow(/output directory/i);
  });
});
