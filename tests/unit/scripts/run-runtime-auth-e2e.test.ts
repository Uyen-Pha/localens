import { randomUUID } from "node:crypto";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

// @ts-expect-error The executable JavaScript boundary is covered by focused runtime tests.
import { DOCKER_DESKTOP_CLI_DIR, createRuntimeAuthPasswords, ensureDockerCliOnPath, parseLocalRuntimeStatus, requirePinnedLocalSupabase, runRuntimeAuthE2E } from "@/scripts/run-runtime-auth-e2e.mjs";

const LOCAL_STATUS = [
  'API_URL="http://127.0.0.1:54321"',
  'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"',
  `PUBLISHABLE_KEY="publishable-${randomUUID()}"`,
  `SERVICE_ROLE_KEY="service-${randomUUID()}"`,
].join("\n");

describe("Task 6 runtime Auth runner", () => {
  it("accepts only the loopback Supabase status fields needed by browser and seed children", () => {
    expect(parseLocalRuntimeStatus(LOCAL_STATUS)).toEqual({
      apiUrl: "http://127.0.0.1:54321",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      publishableKey: expect.stringMatching(/^publishable-/),
    });

    expect(() => parseLocalRuntimeStatus(LOCAL_STATUS.replace("127.0.0.1:54321", "project.supabase.co")))
      .toThrow(/RUNTIME_AUTH_LOCAL_ONLY/);
    expect(() => parseLocalRuntimeStatus(LOCAL_STATUS.replace("127.0.0.1:54322", "db.example.com:5432")))
      .toThrow(/RUNTIME_AUTH_LOCAL_ONLY/);
  });

  it("generates distinct strong per-run passwords only for missing environment values", () => {
    const suppliedCustomer = `customer-${randomUUID()}`;
    const passwords = createRuntimeAuthPasswords({
      LOCALENS_RUNTIME_CUSTOMER_PASSWORD: suppliedCustomer,
    });

    expect(passwords.customer).toBe(suppliedCustomer);
    expect(passwords.guide).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(passwords.admin).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Set(Object.values(passwords))).toHaveLength(3);
  });

  it("prepends the verified Docker Desktop CLI directory only when docker is absent", () => {
    const env = { Path: "C:\\Windows\\System32" };
    const probes: string[] = [];

    ensureDockerCliOnPath({
      env,
      platform: "win32",
      exists: (candidate: string) => candidate === path.join(DOCKER_DESKTOP_CLI_DIR, "docker.exe"),
      probe: (_command: string, options: { env: Record<string, string> }) => {
        probes.push(options.env.Path);
        return probes.length === 1 ? { error: { code: "ENOENT" }, status: null } : { status: 0 };
      },
    });

    expect(env.Path.split(path.delimiter)[0]).toBe(DOCKER_DESKTOP_CLI_DIR);
    expect(probes).toHaveLength(2);
  });

  it("rejects any Supabase CLI dependency that is not the reviewed exact pin", () => {
    const requireLocalCli = vi.fn();

    expect(() => requirePinnedLocalSupabase({
      cwd: "C:/repo",
      readPackage: () => ({ devDependencies: { supabase: "latest" } }),
      requireLocalCli,
    })).toThrow(/RUNTIME_AUTH_SUPABASE_PIN_REQUIRED/);
    expect(requireLocalCli).not.toHaveBeenCalled();
  });

  it("runs local setup before Playwright, isolates secrets, and leaves Supabase running by default", async () => {
    const calls: Array<{ name: string; env: Record<string, string | undefined>; stdio?: string }> = [];
    const logs: string[] = [];
    const env = {
      Path: "C:\\Windows\\System32",
      LOCALENS_RUNTIME_CUSTOMER_PASSWORD: `customer-${randomUUID()}`,
      LOCALENS_RUNTIME_GUIDE_PASSWORD: `guide-${randomUUID()}`,
      LOCALENS_RUNTIME_ADMIN_PASSWORD: `admin-${randomUUID()}`,
      NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES: "1",
    };

    await runRuntimeAuthE2E({
      cwd: process.cwd(),
      env,
      requireLocalCli: () => "C:/repo/node_modules/.bin/supabase.cmd",
      prepareDocker: () => undefined,
      status: () => ({ status: 0, stdout: LOCAL_STATUS, stderr: "" }),
      runStep: async (spec: { name: string; env: Record<string, string | undefined>; stdio?: string }) => {
        calls.push({ name: spec.name, env: spec.env, stdio: spec.stdio });
        return { status: 0 };
      },
      logger: (message: string) => logs.push(message),
    });

    expect(calls.map(({ name }) => name)).toEqual([
      "db:start",
      "db:reset",
      "db:seed:runtime-auth",
      "test:e2e:runtime-auth:playwright",
    ]);
    expect(calls[0]!.stdio).toBe("pipe");
    const seedEnv = calls[2]!.env;
    const playwrightEnv = calls[3]!.env;
    expect(seedEnv.LOCALENS_DB_URL).toBe("postgresql://postgres:postgres@127.0.0.1:54322/postgres");
    expect(playwrightEnv).toMatchObject({
      NEXT_PUBLIC_LOCALLENS_RUNTIME: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: expect.stringMatching(/^publishable-/),
      LOCALENS_RUNTIME_CUSTOMER_PASSWORD: env.LOCALENS_RUNTIME_CUSTOMER_PASSWORD,
      LOCALENS_RUNTIME_GUIDE_PASSWORD: env.LOCALENS_RUNTIME_GUIDE_PASSWORD,
      LOCALENS_RUNTIME_ADMIN_PASSWORD: env.LOCALENS_RUNTIME_ADMIN_PASSWORD,
    });
    expect(playwrightEnv.NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES).toBeUndefined();
    const output = logs.join("\n");
    for (const secret of [
      ...Object.values(env).filter((value) => value.includes("-")),
      parseLocalRuntimeStatus(LOCAL_STATUS).publishableKey,
    ]) {
      expect(output).not.toContain(secret);
    }
  });

  it("stops local Supabase only when the explicit stop flag is supplied", async () => {
    const calls: string[] = [];
    await runRuntimeAuthE2E({
      cwd: process.cwd(),
      env: { LOCALENS_RUNTIME_STOP_DB: "1" },
      requireLocalCli: () => "C:/repo/node_modules/.bin/supabase.cmd",
      prepareDocker: () => undefined,
      status: () => ({ status: 0, stdout: LOCAL_STATUS, stderr: "" }),
      runStep: async (spec: { name: string }) => {
        calls.push(spec.name);
        return { status: 0 };
      },
      logger: vi.fn(),
    });

    expect(calls).toEqual([
      "db:start",
      "db:reset",
      "db:seed:runtime-auth",
      "test:e2e:runtime-auth:playwright",
      "db:stop",
    ]);
  });
});
