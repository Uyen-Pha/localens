import { afterEach, describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

type ZodGlobalConfig = { jitless?: boolean };
type GlobalWithZodConfig = typeof globalThis & {
  __zod_globalConfig?: ZodGlobalConfig;
};

const globalWithZodConfig = globalThis as GlobalWithZodConfig;
const originalFunction = globalThis.Function;
const originalZodGlobalConfig = globalWithZodConfig.__zod_globalConfig;
const originalJitless = originalZodGlobalConfig?.jitless;

afterEach(() => {
  globalThis.Function = originalFunction;
  if (originalZodGlobalConfig === undefined) {
    delete globalWithZodConfig.__zod_globalConfig;
  } else {
    if (originalJitless === undefined) {
      delete originalZodGlobalConfig.jitless;
    } else {
      originalZodGlobalConfig.jitless = originalJitless;
    }
    globalWithZodConfig.__zod_globalConfig = originalZodGlobalConfig;
  }
});

describe("client instrumentation", () => {
  it("configures Zod jitless mode before client schemas are initialized", async () => {
    const blockedEvalCalls: string[] = [];
    globalThis.Function = function blockedFunction() {
      blockedEvalCalls.push("Function");
      throw new Error("CSP blocked eval");
    } as unknown as typeof Function;

    const instrumentationUrl = pathToFileURL(
      resolve(process.cwd(), "instrumentation-client.ts"),
    ).href;
    const instrumentationLoaded = await import(/* @vite-ignore */ instrumentationUrl)
      .then(() => true, () => false);
    expect(instrumentationLoaded).toBe(true);

    const { z } = await import("zod");
    const schema = z.object({ name: z.string() });

    expect(schema.parse({ name: "LocalLens" })).toEqual({ name: "LocalLens" });
    expect(z.config().jitless).toBe(true);
    expect(blockedEvalCalls).toEqual([]);
  });
});
