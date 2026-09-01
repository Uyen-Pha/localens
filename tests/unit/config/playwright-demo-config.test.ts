import { describe, expect, it } from "vitest";

import config from "@/playwright.config";

describe("demo Playwright server isolation", () => {
  it("owns a clean non-manual port through the signal-forwarding Next wrapper", () => {
    expect(config.testIgnore).toBe("runtime-auth.spec.ts");
    expect(config.use?.baseURL).toBe("http://127.0.0.1:3300");
    expect(config.webServer).toMatchObject({
      command: "node scripts/run-next-mode.mjs dev demo --hostname 127.0.0.1 --port 3300",
      url: "http://127.0.0.1:3300/en/",
      reuseExistingServer: false,
    });
  });
});
