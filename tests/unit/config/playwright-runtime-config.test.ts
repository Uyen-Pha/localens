import { afterAll, describe, expect, it, vi } from "vitest";

const originalEnv = vi.hoisted(() => {
  const original = { ...process.env };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-test";
  process.env.LOCALENS_RUNTIME_PLAYWRIGHT_OUTPUT_DIR = "C:/temp/localens-runtime-auth-owned";
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
    expect(config.outputDir).toBe("C:/temp/localens-runtime-auth-owned");
    expect(config.preserveOutput).toBe("never");
    expect(config.use).toMatchObject({ trace: "off", screenshot: "off", video: "off" });
    expect("webServer" in config).toBe(false);
  });

  it("fails closed without an owned output directory", async () => {
    expect(() => createRuntimePlaywrightConfig({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test",
    })).toThrow(/output directory/i);
  });
});
