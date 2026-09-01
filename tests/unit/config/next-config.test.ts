import { afterEach, describe, expect, it, vi } from "vitest";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";

const originalRuntimeMode = process.env.NEXT_PUBLIC_LOCALLENS_RUNTIME;
const mutableEnv = process.env as unknown as Record<string, string | undefined>;

async function outputFor(runtimeMode: string | undefined, phase: string) {
  vi.resetModules();

  if (runtimeMode === undefined) {
    delete mutableEnv.NEXT_PUBLIC_LOCALLENS_RUNTIME;
  } else {
    mutableEnv.NEXT_PUBLIC_LOCALLENS_RUNTIME = runtimeMode;
  }

  const { default: config } = await import("../../../next.config");
  return config(phase).output;
}

afterEach(() => {
  if (originalRuntimeMode === undefined) {
    delete mutableEnv.NEXT_PUBLIC_LOCALLENS_RUNTIME;
  } else {
    mutableEnv.NEXT_PUBLIC_LOCALLENS_RUNTIME = originalRuntimeMode;
  }
  vi.resetModules();
});

describe("Next static export configuration", () => {
  it("enables static export only for demo production builds", async () => {
    expect(await outputFor("demo", PHASE_PRODUCTION_BUILD)).toBe("export");
    expect(await outputFor("demo", PHASE_DEVELOPMENT_SERVER)).toBeUndefined();
    expect(await outputFor("supabase", PHASE_PRODUCTION_BUILD)).toBeUndefined();
    expect(await outputFor("supabase", PHASE_DEVELOPMENT_SERVER)).toBeUndefined();
  });

  it("rejects a missing runtime mode instead of inferring from NODE_ENV", async () => {
    await expect(outputFor(undefined, PHASE_PRODUCTION_BUILD)).rejects.toThrow(/NEXT_PUBLIC_LOCALLENS_RUNTIME/);
  });
});
