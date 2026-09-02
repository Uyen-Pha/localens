import { afterEach, describe, expect, it, vi } from "vitest";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";

const originalRuntimeMode = process.env.NEXT_PUBLIC_LOCALLENS_RUNTIME;
const originalDistDir = process.env.LOCALLENS_NEXT_DIST_DIR;
const mutableEnv = process.env as unknown as Record<string, string | undefined>;

async function configFor(runtimeMode: string | undefined, phase: string, distDir?: string) {
  vi.resetModules();

  if (runtimeMode === undefined) {
    delete mutableEnv.NEXT_PUBLIC_LOCALLENS_RUNTIME;
  } else {
    mutableEnv.NEXT_PUBLIC_LOCALLENS_RUNTIME = runtimeMode;
  }
  if (distDir === undefined) delete mutableEnv.LOCALLENS_NEXT_DIST_DIR;
  else mutableEnv.LOCALLENS_NEXT_DIST_DIR = distDir;

  const { default: config } = await import("../../../next.config");
  return config(phase);
}

async function outputFor(runtimeMode: string | undefined, phase: string) {
  return (await configFor(runtimeMode, phase)).output;
}

afterEach(() => {
  if (originalRuntimeMode === undefined) {
    delete mutableEnv.NEXT_PUBLIC_LOCALLENS_RUNTIME;
  } else {
    mutableEnv.NEXT_PUBLIC_LOCALLENS_RUNTIME = originalRuntimeMode;
  }
  if (originalDistDir === undefined) delete mutableEnv.LOCALLENS_NEXT_DIST_DIR;
  else mutableEnv.LOCALLENS_NEXT_DIST_DIR = originalDistDir;
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

  it("isolates an explicitly owned relative E2E dist directory", async () => {
    const config = await configFor("demo", PHASE_DEVELOPMENT_SERVER, ".next/e2e-demo-3300");
    expect(config.distDir).toBe(".next/e2e-demo-3300");
  });

  it.each(["C:/temp/next", "../outside", ".next/../../outside", "next-e2e"])(
    "rejects unsafe owned dist directory %s",
    async (distDir) => {
      await expect(configFor("supabase", PHASE_DEVELOPMENT_SERVER, distDir))
        .rejects.toThrow(/LOCALLENS_NEXT_DIST_DIR/);
    },
  );
});
