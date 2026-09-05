import { afterAll, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";

const originalEnv = vi.hoisted(() => {
  const original = { ...process.env };
  process.env.PLAYWRIGHT_BASE_URL = "http://127.0.0.1:55440";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:55431";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-test";
  process.env.LOCALENS_RUNTIME_PLAYWRIGHT_OUTPUT_DIR = `${process.env.TEMP ?? process.env.TMPDIR ?? "/tmp"}/localens-runtime-itinerary-playwright-fixed-tour`;
  process.env.LOCALENS_RUNTIME_BROWSER = "chrome";
  process.env.LOCALENS_RUNTIME_ISOLATED_PROJECT_ID = "localens-itinerary-0123456789abcdef";
  return original;
});

import { createRuntimeFixedTourPlaywrightConfig } from "@/playwright.runtime-fixed-tour.config";

afterAll(() => { process.env = { ...originalEnv }; });

const outputDir = join(tmpdir(), "localens-runtime-itinerary-playwright-fixed-tour");

describe("runtime fixed-tour Playwright boundary", () => {
  it("collects only the serial fixed-tour spec against the isolated runner", () => {
    const config = createRuntimeFixedTourPlaywrightConfig(process.env);

    expect(config.testMatch).toBe("runtime-fixed-tour.spec.ts");
    expect(config.fullyParallel).toBe(false);
    expect(config.workers).toBe(1);
    expect(config.timeout).toBe(120_000);
    expect(config.retries).toBe(0);
    expect(config.projects).toHaveLength(1);
    expect(config.projects[0]?.name).toBe("chrome");
    expect(config.use?.baseURL).toBe("http://127.0.0.1:55440");
    expect("webServer" in config).toBe(false);
  });

  it("uses no password-bearing artifacts and requires its owned output directory", () => {
    const config = createRuntimeFixedTourPlaywrightConfig(process.env);

    expect(config.reporter).toEqual([["line"]]);
    expect(config.outputDir).toBe(outputDir);
    expect(config.preserveOutput).toBe("never");
    expect(config.use).toMatchObject({ trace: "off", screenshot: "off", video: "off" });
    expect(() => createRuntimeFixedTourPlaywrightConfig({
      PLAYWRIGHT_BASE_URL: "http://127.0.0.1:55440",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55431",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test",
      LOCALENS_RUNTIME_BROWSER: "chrome",
      LOCALENS_RUNTIME_ISOLATED_PROJECT_ID: "localens-itinerary-0123456789abcdef",
    })).toThrow(/output directory/i);
  });

  it("rejects standard presentation ports and non-owned runtime markers", () => {
    for (const env of [
      { ...process.env, PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3200" },
      { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" },
      { ...process.env, LOCALENS_RUNTIME_ISOLATED_PROJECT_ID: undefined },
      { ...process.env, LOCALENS_RUNTIME_ISOLATED_PROJECT_ID: "localens-mvp" },
    ]) {
      expect(() => createRuntimeFixedTourPlaywrightConfig(env)).toThrow(/isolated|local|requires/i);
    }
  });

  it("selects the installed Chrome channel for an approved local run", () => {
    const config = createRuntimeFixedTourPlaywrightConfig({
      ...process.env,
      CI: undefined,
      LOCALENS_RUNTIME_BROWSER: "chrome",
    });

    expect(config.projects).toEqual([
      expect.objectContaining({
        name: "chrome",
        use: expect.objectContaining({ channel: "chrome" }),
      }),
    ]);
  });

  it("fails closed locally until an approved browser is explicit", () => {
    expect(() => createRuntimeFixedTourPlaywrightConfig({
      ...process.env,
      CI: undefined,
      LOCALENS_RUNTIME_BROWSER: undefined,
    })).toThrow(/browser/i);
  });

  it("honors the approved Chrome channel in CI when requested", () => {
    const config = createRuntimeFixedTourPlaywrightConfig({
      ...process.env,
      CI: "1",
      LOCALENS_RUNTIME_BROWSER: "chrome",
    });

    expect(config.projects).toEqual([
      expect.objectContaining({
        name: "chrome",
        use: expect.objectContaining({ channel: "chrome" }),
      }),
    ]);
  });
});
