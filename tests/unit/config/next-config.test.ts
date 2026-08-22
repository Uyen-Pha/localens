import { afterEach, describe, expect, it, vi } from "vitest";

const originalNodeEnv = process.env.NODE_ENV;
const mutableEnv = process.env as unknown as Record<string, string | undefined>;

async function outputFor(nodeEnv: string | undefined) {
  vi.resetModules();

  if (nodeEnv === undefined) {
    delete mutableEnv.NODE_ENV;
  } else {
    mutableEnv.NODE_ENV = nodeEnv;
  }

  const { default: config } = await import("../../../next.config");
  return config.output;
}

afterEach(() => {
  if (originalNodeEnv === undefined) {
    delete mutableEnv.NODE_ENV;
  } else {
    mutableEnv.NODE_ENV = originalNodeEnv;
  }
  vi.resetModules();
});

describe("Next static export configuration", () => {
  it("omits export only in development", async () => {
    expect(await outputFor("development")).toBeUndefined();
    expect(await outputFor("test")).toBe("export");
    expect(await outputFor("production")).toBe("export");
    expect(await outputFor(undefined)).toBe("export");
  });
});
