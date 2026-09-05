import { afterAll, describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalEnv = vi.hoisted(() => {
  const original = { ...process.env };
  const temporaryRoot = process.env.TEMP ?? process.env.TMPDIR ?? "/tmp";
  process.env.PLAYWRIGHT_BASE_URL = "http://127.0.0.1:55440";
  process.env.LOCALENS_RUNTIME_PLAYWRIGHT_OUTPUT_DIR = `${temporaryRoot}/localens-runtime-itinerary-playwright-config`;
  process.env.LOCALENS_RUNTIME_BROWSER = "chrome";
  process.env.LOCALENS_RUNTIME_ISOLATED_PROJECT_ID = "localens-itinerary-0123456789abcdef";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:55431";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_local_test";
  return original;
});

import { createRuntimeItineraryPlaywrightConfig } from "@/playwright.runtime-itinerary.config";

const outputDir = join(tmpdir(), "localens-runtime-itinerary-playwright-config");
const validEnv = {
  PLAYWRIGHT_BASE_URL: "http://127.0.0.1:55440",
  LOCALENS_RUNTIME_PLAYWRIGHT_OUTPUT_DIR: outputDir,
  LOCALENS_RUNTIME_BROWSER: "chrome",
  LOCALENS_RUNTIME_ISOLATED_PROJECT_ID: "localens-itinerary-0123456789abcdef",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55431",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_test",
};

afterAll(() => { process.env = { ...originalEnv }; });

describe("runtime itinerary Playwright configuration", () => {
  it("runs only the isolated itinerary spec against the runner-owned server", () => {
    const config = createRuntimeItineraryPlaywrightConfig(validEnv);

    expect(config.testMatch).toBe("runtime-itinerary.spec.ts");
    expect(config.outputDir).toBe(outputDir);
    expect(config.workers).toBe(1);
    expect(config.retries).toBe(0);
    expect(config.use).toMatchObject({
      baseURL: "http://127.0.0.1:55440",
      screenshot: "off",
      trace: "off",
      video: "off",
    });
    expect(config.projects).toEqual([
      expect.objectContaining({
        name: "chrome",
        use: expect.objectContaining({ channel: "chrome" }),
      }),
    ]);
  });

  it("honors approved installed browser channels locally and in CI", () => {
    expect(createRuntimeItineraryPlaywrightConfig({
      ...validEnv,
      LOCALENS_RUNTIME_BROWSER: "msedge",
    }).projects[0]).toEqual(expect.objectContaining({
      name: "msedge",
      use: expect.objectContaining({ channel: "msedge" }),
    }));
    expect(createRuntimeItineraryPlaywrightConfig({
      ...validEnv,
      CI: "1",
      LOCALENS_RUNTIME_BROWSER: "chrome",
    }).projects[0]).toEqual(expect.objectContaining({
      name: "chrome",
      use: expect.objectContaining({ channel: "chrome" }),
    }));
    expect(createRuntimeItineraryPlaywrightConfig({
      ...validEnv,
      CI: "1",
      LOCALENS_RUNTIME_BROWSER: undefined,
    }).projects[0]).toEqual(expect.objectContaining({ name: "chromium" }));
    expect(() => createRuntimeItineraryPlaywrightConfig({
      ...validEnv,
      LOCALENS_RUNTIME_BROWSER: undefined,
    })).toThrow(/browser/i);
  });

  it("fails closed without loopback runtime endpoints or owned output", () => {
    for (const env of [
      { ...validEnv, PLAYWRIGHT_BASE_URL: undefined },
      { ...validEnv, PLAYWRIGHT_BASE_URL: "https://staging.example.com" },
      { ...validEnv, NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co" },
      { ...validEnv, PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3200" },
      { ...validEnv, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" },
      { ...validEnv, LOCALENS_RUNTIME_ISOLATED_PROJECT_ID: undefined },
      { ...validEnv, LOCALENS_RUNTIME_ISOLATED_PROJECT_ID: "localens-mvp" },
      { ...validEnv, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined },
      { ...validEnv, LOCALENS_RUNTIME_PLAYWRIGHT_OUTPUT_DIR: undefined },
      { ...validEnv, LOCALENS_RUNTIME_PLAYWRIGHT_OUTPUT_DIR: join(process.cwd(), "test-results") },
    ]) {
      expect(() => createRuntimeItineraryPlaywrightConfig(env)).toThrow(/local|requires/i);
    }
  });
});
