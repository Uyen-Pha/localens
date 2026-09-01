import { describe, expect, it, vi } from "vitest";

// @ts-expect-error The executable JavaScript boundary is covered by focused runtime tests.
import { createRuntimeFixedTourPasswords, runRuntimeFixedTourE2E, runRuntimeFixedTourE2EMain, selectRuntimeFixedTourBaseEnv } from "@/scripts/run-runtime-fixed-tour-e2e.mjs";

const localStatus = [
  "API_URL=http://127.0.0.1:54321",
  "DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  "PUBLISHABLE_KEY=publishable-test",
  "SERVICE_ROLE_KEY=must-never-leave-status",
].join("\n");

function deterministicRandom() {
  let call = 0;
  return (size: number) => Buffer.alloc(size, ++call);
}

function successfulHarness(overrides: Record<string, unknown> = {}) {
  const events: string[] = [];
  const specs: Array<{ name: string; env: Record<string, string | undefined> }> = [];
  const serverEnvironments: Record<string, string | undefined>[] = [];
  const options = {
    cwd: "C:/repo",
    env: {
      Path: "C:/Windows/System32",
      SystemRoot: "C:/Windows",
      ComSpec: "C:/Windows/System32/cmd.exe",
      TEMP: "C:/Temp",
      LOCALAPPDATA: "C:/Users/Test/AppData/Local",
      LOCALENS_RUNTIME_CUSTOMER_PASSWORD: "customer-secret",
      LOCALENS_RUNTIME_GUIDE_PASSWORD: "guide-secret",
      LOCALENS_RUNTIME_ADMIN_PASSWORD: "admin-secret",
      LOCALENS_RUNTIME_FIXED_TOUR_CUSTOMER_PASSWORD: "customer-b-secret",
      LOCALENS_DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      SUPABASE_SERVICE_ROLE_KEY: "parent-service-secret",
      NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES: "1",
      UNRELATED_PARENT_SECRET: "drop-me",
    },
    logger: vi.fn(),
    prepareDocker: vi.fn(),
    requirePinnedCli: vi.fn(),
    runStep: vi.fn(async (spec: { name: string; env: Record<string, string | undefined> }) => {
      events.push(spec.name);
      specs.push(spec);
      return { status: 0 };
    }),
    status: vi.fn(() => {
      events.push("status");
      return { status: 0, stdout: localStatus };
    }),
    createOutputDirectory: vi.fn(() => {
      events.push("output:create");
      return "C:/Temp/localens-runtime-fixed-tour-owned";
    }),
    removeOutputDirectory: vi.fn(() => { events.push("output:remove"); }),
    startServer: vi.fn(async (env: Record<string, string | undefined>) => {
      events.push("runtime:server:start");
      serverEnvironments.push(env);
      return { stop: vi.fn(async () => { events.push("runtime:server:stop"); }) };
    }),
    random: deterministicRandom(),
    platform: "win32",
    ...overrides,
  };
  return { events, specs, serverEnvironments, options };
}

describe("B2.2a runtime fixed-tour runner", () => {
  it("generates independent strong values only for missing role passwords", () => {
    const passwords = createRuntimeFixedTourPasswords(
      { LOCALENS_RUNTIME_CUSTOMER_PASSWORD: "provided-customer" },
      deterministicRandom(),
    );

    expect(passwords.customer).toBe("provided-customer");
    expect(new Set(Object.values(passwords)).size).toBe(4);
    expect(passwords.guide.length).toBeGreaterThanOrEqual(40);
    expect(passwords.admin.length).toBeGreaterThanOrEqual(40);
    expect(passwords.customerB.length).toBeGreaterThanOrEqual(40);
  });

  it("builds a base environment from an allowlist instead of cloning parent secrets", () => {
    const base = selectRuntimeFixedTourBaseEnv({
      Path: "C:/Windows/System32",
      SystemRoot: "C:/Windows",
      TEMP: "C:/Temp",
      CI: "1",
      LOCALENS_DB_URL: "database-secret",
      LOCALENS_RUNTIME_CUSTOMER_PASSWORD: "password-secret",
      SUPABASE_SERVICE_ROLE_KEY: "service-secret",
      NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES: "1",
      UNRELATED_PARENT_SECRET: "drop-me",
    }, "win32");

    expect(base).toMatchObject({
      Path: "C:/Windows/System32",
      SystemRoot: "C:/Windows",
      TEMP: "C:/Temp",
      CI: "1",
      NEXT_TELEMETRY_DISABLED: "1",
    });
    expect(base).not.toHaveProperty("LOCALENS_DB_URL");
    expect(base).not.toHaveProperty("LOCALENS_RUNTIME_CUSTOMER_PASSWORD");
    expect(base).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
    expect(base).not.toHaveProperty("NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES");
    expect(base).not.toHaveProperty("UNRELATED_PARENT_SECRET");
  });

  it("runs every local gate in order and gives each child only its required secrets", async () => {
    const harness = successfulHarness();
    await runRuntimeFixedTourE2E(harness.options);

    expect(harness.events).toEqual([
      "db:start",
      "db:reset",
      "db:test",
      "status",
      "db:seed:runtime-auth",
      "db:seed:runtime-fixed-tour",
      "db:seed:runtime-fixed-tour",
      "output:create",
      "runtime:server:start",
      "test:e2e:runtime-fixed-tour:playwright",
      "runtime:server:stop",
      "output:remove",
    ]);

    const [start, reset, dbTest, authSeed, fixedSeedOne, fixedSeedTwo, playwright] = harness.specs;
    for (const step of [start, reset, dbTest]) {
      expect(step?.env).not.toHaveProperty("LOCALENS_DB_URL");
      expect(Object.keys(step?.env ?? {}).some((key) => key.includes("PASSWORD"))).toBe(false);
      expect(step?.env).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
    }
    expect(authSeed?.env).toMatchObject({
      LOCALENS_RUNTIME_CUSTOMER_PASSWORD: "customer-secret",
      LOCALENS_RUNTIME_GUIDE_PASSWORD: "guide-secret",
      LOCALENS_RUNTIME_ADMIN_PASSWORD: "admin-secret",
      LOCALENS_DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    });
    expect(authSeed?.env).not.toHaveProperty("LOCALENS_RUNTIME_FIXED_TOUR_CUSTOMER_PASSWORD");
    for (const fixedSeed of [fixedSeedOne, fixedSeedTwo]) {
      expect(fixedSeed?.env).toMatchObject({
        LOCALENS_RUNTIME_FIXED_TOUR_CUSTOMER_PASSWORD: "customer-b-secret",
        LOCALENS_DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      });
      expect(fixedSeed?.env).not.toHaveProperty("LOCALENS_RUNTIME_CUSTOMER_PASSWORD");
      expect(fixedSeed?.env).not.toHaveProperty("LOCALENS_RUNTIME_GUIDE_PASSWORD");
      expect(fixedSeed?.env).not.toHaveProperty("LOCALENS_RUNTIME_ADMIN_PASSWORD");
    }

    const serverEnv = harness.serverEnvironments[0];
    expect(serverEnv).toEqual({
      NEXT_PUBLIC_LOCALLENS_RUNTIME: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test",
      NEXT_TELEMETRY_DISABLED: "1",
    });
    expect(playwright?.env).toMatchObject({
      LOCALENS_RUNTIME_CUSTOMER_PASSWORD: "customer-secret",
      LOCALENS_RUNTIME_GUIDE_PASSWORD: "guide-secret",
      LOCALENS_RUNTIME_ADMIN_PASSWORD: "admin-secret",
      LOCALENS_RUNTIME_FIXED_TOUR_CUSTOMER_PASSWORD: "customer-b-secret",
      LOCALENS_RUNTIME_PLAYWRIGHT_OUTPUT_DIR: "C:/Temp/localens-runtime-fixed-tour-owned",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test",
    });
    expect(playwright?.env).not.toHaveProperty("LOCALENS_DB_URL");
    expect(playwright?.env).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
    expect(playwright?.env).not.toHaveProperty("NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES");
    expect(playwright?.env).not.toHaveProperty("UNRELATED_PARENT_SECRET");
  });

  it("rejects remote and nonstandard database URLs before starting any child", async () => {
    for (const databaseUrl of [
      "postgresql://postgres:postgres@example.com:54322/postgres",
      "postgresql://postgres:postgres@127.0.0.1:55432/postgres",
    ]) {
      const harness = successfulHarness({
        env: { Path: "C:/Windows/System32", LOCALENS_DB_URL: databaseUrl },
      });
      await expect(runRuntimeFixedTourE2E(harness.options)).rejects.toThrow(/local|loopback/i);
      expect(harness.specs).toHaveLength(0);
    }
  });

  it("does not capture status, seed, or start a browser when pgTAP fails", async () => {
    const harness = successfulHarness({
      runStep: vi.fn(async (spec: { name: string }) => {
        harness.events.push(spec.name);
        harness.specs.push(spec as never);
        return { status: spec.name === "db:test" ? 1 : 0 };
      }),
    });

    await expect(runRuntimeFixedTourE2E(harness.options)).rejects.toMatchObject({
      code: "RUNTIME_FIXED_TOUR_STEP_FAILED",
      step: "db:test",
    });
    expect(harness.events).toEqual(["db:start", "db:reset", "db:test"]);
  });

  it("does not start the owned Next server when either seed fails", async () => {
    const harness = successfulHarness({
      runStep: vi.fn(async (spec: { name: string }) => {
        harness.events.push(spec.name);
        harness.specs.push(spec as never);
        return { status: spec.name === "db:seed:runtime-fixed-tour" ? 1 : 0 };
      }),
    });

    await expect(runRuntimeFixedTourE2E(harness.options)).rejects.toMatchObject({
      code: "RUNTIME_FIXED_TOUR_STEP_FAILED",
      step: "db:seed:runtime-fixed-tour",
    });
    expect(harness.events).not.toContain("runtime:server:start");
    expect(harness.events).not.toContain("test:e2e:runtime-fixed-tour:playwright");
  });

  it("cleans owned server and output after browser failure without hiding the primary error", async () => {
    const harness = successfulHarness({
      runStep: vi.fn(async (spec: { name: string }) => {
        harness.events.push(spec.name);
        harness.specs.push(spec as never);
        return { status: spec.name === "test:e2e:runtime-fixed-tour:playwright" ? 7 : 0 };
      }),
      startServer: vi.fn(async (env: Record<string, string | undefined>) => {
        harness.events.push("runtime:server:start");
        harness.serverEnvironments.push(env);
        return {
          stop: vi.fn(async () => {
            harness.events.push("runtime:server:stop");
            throw new Error("cleanup-secret");
          }),
        };
      }),
    });

    const error = await runRuntimeFixedTourE2E(harness.options).catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      code: "RUNTIME_FIXED_TOUR_STEP_FAILED",
      step: "test:e2e:runtime-fixed-tour:playwright",
      status: 7,
    });
    expect(String(error.message)).not.toContain("cleanup-secret");
    expect(harness.events).toContain("runtime:server:stop");
    expect(harness.events).toContain("output:remove");
  });

  it("stops local Supabase only after cleanup when explicitly requested", async () => {
    const harness = successfulHarness({
      env: {
        Path: "C:/Windows/System32",
        LOCALENS_RUNTIME_STOP_DB: "1",
      },
    });
    await runRuntimeFixedTourE2E(harness.options);

    expect(harness.events.slice(-3)).toEqual([
      "runtime:server:stop",
      "output:remove",
      "db:stop",
    ]);
    expect(harness.specs.at(-1)?.env).not.toHaveProperty("LOCALENS_DB_URL");
  });

  it("main reports only a stable redacted error", async () => {
    const errorLogger = vi.fn();
    const status = await runRuntimeFixedTourE2EMain({
      run: async () => { throw new Error("postgresql://user:secret@127.0.0.1:54322/postgres"); },
      errorLogger,
    });

    expect(status).toBe(2);
    expect(errorLogger).toHaveBeenCalledWith(expect.stringMatching(/^RUNTIME_FIXED_TOUR_FAILED:/));
    expect(errorLogger.mock.calls.flat().join(" ")).not.toContain("secret");
  });
});
