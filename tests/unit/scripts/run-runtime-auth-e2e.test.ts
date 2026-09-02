import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { createServer } from "node:net";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

// @ts-expect-error The executable JavaScript boundary is covered by focused runtime tests.
import { createRuntimeAuthPasswords, dockerCliDirectories, ensureDockerCliOnPath, parseLocalRuntimeStatus, requirePinnedLocalSupabase, runRuntimeAuthE2E, startOwnedRuntimeServer, stopOwnedRuntimeServer } from "@/scripts/run-runtime-auth-e2e.mjs";

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

  it("accepts a working Docker CLI already on PATH without probing install roots", () => {
    const env = { Path: "D:\\tools" };
    const exists = vi.fn();

    ensureDockerCliOnPath({ env, platform: "win32", exists, probe: () => ({ status: 0 }) });

    expect(env.Path).toBe("D:\\tools");
    expect(exists).not.toHaveBeenCalled();
  });

  it("derives and prepends a verified Docker Desktop CLI directory from a different user root", () => {
    const env = { Path: "C:\\Windows\\System32" };
    Object.assign(env, { LOCALAPPDATA: "D:\\Profiles\\Other\\AppData\\Local" });
    const probes: string[] = [];
    const expectedDirectory = "D:\\Profiles\\Other\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin";

    ensureDockerCliOnPath({
      env,
      platform: "win32",
      exists: (candidate: string) => candidate === path.win32.join(expectedDirectory, "docker.exe"),
      probe: (_command: string, options: { env: Record<string, string> }) => {
        probes.push(options.env.Path);
        return probes.length === 1 ? { error: { code: "ENOENT" }, status: null } : { status: 0 };
      },
    });

    expect(env.Path.split(path.delimiter)[0]).toBe(expectedDirectory);
    expect(probes).toHaveLength(2);
  });

  it("derives machine-wide Docker candidates from supplied Windows environment roots", () => {
    expect(dockerCliDirectories({
      LOCALAPPDATA: "D:\\Users\\Example\\AppData\\Local",
      ProgramFiles: "E:\\Apps",
      ProgramW6432: "F:\\Programs64",
    }, "win32")).toEqual([
      "D:\\Users\\Example\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin",
      "D:\\Users\\Example\\AppData\\Local\\Programs\\Docker\\Docker\\resources\\bin",
      "E:\\Apps\\Docker\\Docker\\resources\\bin",
      "F:\\Programs64\\Docker\\Docker\\resources\\bin",
    ]);
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

  it("requires the resolved project-local Supabase executable to report exactly 2.115.0", () => {
    const cliPath = "C:/repo/node_modules/.bin/supabase.cmd";
    const versionProbe = vi.fn(() => ({ status: 0, stdout: "2.115.0\n", stderr: "" }));

    expect(requirePinnedLocalSupabase({
      cwd: "C:/repo",
      env: { NEXT_TELEMETRY_DISABLED: "1" },
      readPackage: () => ({ devDependencies: { supabase: "2.115.0" } }),
      requireLocalCli: () => cliPath,
      versionProbe,
    })).toBe(cliPath);
    expect(versionProbe).toHaveBeenCalledWith(cliPath, expect.objectContaining({ cwd: "C:/repo" }));
  });

  it("fails closed before spawning when the runtime server port is already occupied", async () => {
    const child = Object.assign(new EventEmitter(), {
      exitCode: null,
      signalCode: null,
      kill: vi.fn(() => true),
    });
    const spawnChild = vi.fn(() => child);

    await expect(startOwnedRuntimeServer({ NEXT_PUBLIC_LOCALLENS_RUNTIME: "supabase" }, {
      cwd: process.cwd(),
      spawnChild,
      fetchImpl: async () => ({ ok: true, status: 200 }),
    })).rejects.toThrow(/RUNTIME_AUTH_SERVER_PORT_IN_USE/);
    expect(spawnChild).not.toHaveBeenCalled();
  });

  it("can start a directly-owned demo server on a caller-selected port", async () => {
    const child = Object.assign(new EventEmitter(), {
      exitCode: null,
      signalCode: null,
      kill: vi.fn(() => {
        child.exitCode = 0;
        queueMicrotask(() => child.emit("close", 0));
        return true;
      }),
    });
    const spawnChild = vi.fn(() => child);
    let probe = 0;
    const server = await startOwnedRuntimeServer({ NEXT_PUBLIC_LOCALLENS_RUNTIME: "demo" }, {
      cwd: "C:/repo",
      spawnChild,
      fetchImpl: async () => {
        if (child.exitCode !== null) throw new Error("endpoint closed");
        return { ok: probe++ > 0, status: probe > 1 ? 200 : 503 };
      },
      mode: "demo",
      port: 3300,
      serverUrl: "http://127.0.0.1:3300/en/",
      platform: "linux",
    });

    expect(spawnChild).toHaveBeenCalledWith(
      process.execPath,
      expect.arrayContaining([
        expect.stringMatching(/node_modules[\\/]next[\\/]dist[\\/]bin[\\/]next$/),
        "dev",
        "--port",
        "3300",
      ]),
      expect.objectContaining({
        env: expect.objectContaining({ NEXT_PUBLIC_LOCALLENS_RUNTIME: "demo" }),
      }),
    );
    await server.stop();
  });

  it("reports startup and cleanup failure without leaking the child error", async () => {
    const secret = `startup-${randomUUID()}`;
    const child = Object.assign(new EventEmitter(), {
      exitCode: null,
      signalCode: null,
      kill: vi.fn(() => false),
    });
    const startup = startOwnedRuntimeServer({ NEXT_PUBLIC_LOCALLENS_RUNTIME: "supabase" }, {
      cwd: process.cwd(),
      spawnChild: () => {
        queueMicrotask(() => child.emit("error", new Error(secret)));
        return child;
      },
      fetchImpl: async () => ({ ok: false, status: 503 }),
      platform: "linux",
    });

    let caught: unknown;
    try {
      await startup;
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      code: "RUNTIME_AUTH_SERVER_FAILED",
      serverCleanupError: { code: "RUNTIME_AUTH_SERVER_CLEANUP_FAILED" },
    });
    expect(String(caught)).not.toContain(secret);
    expect(String((caught as { serverCleanupError?: unknown }).serverCleanupError)).not.toContain(secret);
  });

  it("fails closed when neither shutdown signal is accepted and no close event arrives", async () => {
    const child = Object.assign(new EventEmitter(), {
      exitCode: null,
      signalCode: null,
      kill: vi.fn(() => false),
    });

    await expect(stopOwnedRuntimeServer(child, { graceMs: 1, forceConfirmMs: 1, platform: "linux" }))
      .rejects.toThrow(/RUNTIME_AUTH_SERVER_CLEANUP_FAILED/);
    expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
    expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
  });

  it("bounds cleanup when shutdown signals are accepted but no close event arrives", async () => {
    const child = Object.assign(new EventEmitter(), {
      exitCode: null,
      signalCode: null,
      kill: vi.fn(() => true),
    });

    await expect(stopOwnedRuntimeServer(child, { graceMs: 1, forceConfirmMs: 1, platform: "linux" }))
      .rejects.toThrow(/RUNTIME_AUTH_SERVER_CLEANUP_FAILED/);
    expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
    expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
  });

  it("redacts shutdown signal exceptions instead of escaping from cleanup timers", async () => {
    const secret = `shutdown-${randomUUID()}`;
    const child = Object.assign(new EventEmitter(), {
      exitCode: null,
      signalCode: null,
      kill: vi.fn(() => { throw new Error(secret); }),
    });

    let caught: unknown;
    try {
      await stopOwnedRuntimeServer(child, { graceMs: 1, forceConfirmMs: 1, platform: "linux" });
    } catch (error) {
      caught = error;
    }

    expect(String(caught)).toMatch(/RUNTIME_AUTH_SERVER_CLEANUP_FAILED/);
    expect(String(caught)).not.toContain(secret);
    expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
    expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
  });

  it("uses the owning controller to stop and confirm a Windows process tree", async () => {
    const child = Object.assign(new EventEmitter(), {
      exitCode: null,
      signalCode: null,
      pid: 4321,
      kill: vi.fn(),
    });
    const forceOwnedTree = vi.fn(() => {
      child.exitCode = 1;
      queueMicrotask(() => child.emit("close", 1));
      return true;
    });
    const fetchImpl = vi.fn(async () => {
      throw new Error("endpoint closed");
    });

    await stopOwnedRuntimeServer(child, {
      platform: "win32",
      forceOwnedTree,
      fetchImpl,
      serverUrl: "http://127.0.0.1:3300/en/",
      forceConfirmMs: 100,
    });

    expect(forceOwnedTree).toHaveBeenCalledWith(child);
    expect(child.kill).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledWith("http://127.0.0.1:3300/en/", { redirect: "manual" });
  });

  it.skipIf(process.platform !== "win32")(
    "kills a real directly-owned Windows server and confirms its endpoint is closed",
    async () => {
      const reservation = createServer();
      await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve));
      const address = reservation.address();
      if (!address || typeof address === "string") throw new Error("test port unavailable");
      const port = address.port;
      await new Promise<void>((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));

      const serverSource = [
        "const http = require('node:http')",
        `http.createServer((_req, res) => res.end('ok')).listen(${port}, '127.0.0.1')`,
        "setInterval(() => {}, 1000)",
      ].join(";");
      const server = spawn(process.execPath, ["-e", serverSource], {
        stdio: "ignore",
        windowsHide: true,
      });
      const url = `http://127.0.0.1:${port}/`;

      try {
        const deadline = Date.now() + 5_000;
        while (true) {
          try {
            const response = await fetch(url);
            if (response.ok) break;
          } catch {
            if (Date.now() >= deadline) throw new Error("descendant server did not start");
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        await stopOwnedRuntimeServer(server, { serverUrl: url, forceConfirmMs: 3_000 });
        await expect(fetch(url)).rejects.toThrow();
      } finally {
        if (server.exitCode === null && server.signalCode === null) server.kill("SIGKILL");
      }
    },
    15_000,
  );

  it.each([
    ["stale", { status: 0, stdout: "2.114.0\n", stderr: "" }],
    ["malformed", { status: 0, stdout: "supabase version 2.115.0\n", stderr: "" }],
    ["extra-newline", { status: 0, stdout: "2.115.0\n\n", stderr: "" }],
    ["failed", { status: 1, stdout: "", stderr: "failure" }],
  ])("fails closed for a %s project-local Supabase executable", (_label, result) => {
    expect(() => requirePinnedLocalSupabase({
      cwd: "C:/repo",
      readPackage: () => ({ devDependencies: { supabase: "2.115.0" } }),
      requireLocalCli: () => "C:/repo/node_modules/.bin/supabase.cmd",
      versionProbe: () => result,
    })).toThrow(/RUNTIME_AUTH_SUPABASE_VERSION_MISMATCH/);
  });

  it("runs local setup before Playwright, isolates secrets, and leaves Supabase running by default", async () => {
    const calls: Array<{ name: string; env: Record<string, string | undefined>; stdio?: string }> = [];
    const serverEnvironments: Array<Record<string, string | undefined>> = [];
    const stopServer = vi.fn(async () => undefined);
    const logs: string[] = [];
    const statusEnvironments: Array<Record<string, string | undefined>> = [];
    const removedDirectories: string[] = [];
    const env = {
      Path: "C:\\Windows\\System32",
      LOCALENS_RUNTIME_CUSTOMER_PASSWORD: `customer-${randomUUID()}`,
      LOCALENS_RUNTIME_GUIDE_PASSWORD: `guide-${randomUUID()}`,
      LOCALENS_RUNTIME_ADMIN_PASSWORD: `admin-${randomUUID()}`,
      LOCALENS_RUNTIME_UNUSED_PASSWORD: `unused-${randomUUID()}`,
      NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES: "1",
    };

    await runRuntimeAuthE2E({
      cwd: process.cwd(),
      env,
      requireLocalCli: () => "C:/repo/node_modules/.bin/supabase.cmd",
      versionProbe: () => ({ status: 0, stdout: "2.115.0\n", stderr: "" }),
      prepareDocker: () => undefined,
      status: (statusEnv: Record<string, string | undefined>) => {
        statusEnvironments.push(statusEnv);
        return { status: 0, stdout: LOCAL_STATUS, stderr: "" };
      },
      createOutputDirectory: () => "C:/temp/localens-runtime-auth-owned",
      removeOutputDirectory: (directory: string) => removedDirectories.push(directory),
      startServer: async (serverEnv: Record<string, string | undefined>) => {
        serverEnvironments.push(serverEnv);
        return { stop: stopServer };
      },
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
    for (const controlEnv of [calls[0]!.env, calls[1]!.env, statusEnvironments[0]!]) {
      expect(Object.keys(controlEnv).filter((name) => /^LOCALENS_RUNTIME_.*_PASSWORD$/.test(name))).toEqual([]);
    }
    const seedEnv = calls[2]!.env;
    const playwrightEnv = calls[3]!.env;
    expect(serverEnvironments).toEqual([{
      NEXT_PUBLIC_LOCALLENS_RUNTIME: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: expect.stringMatching(/^publishable-/),
      NEXT_TELEMETRY_DISABLED: "1",
    }]);
    expect(serverEnvironments[0]!.LOCALENS_DB_URL).toBeUndefined();
    expect(Object.keys(serverEnvironments[0]!).filter((name) => /^LOCALENS_RUNTIME_.*_PASSWORD$/.test(name))).toEqual([]);
    expect(seedEnv.LOCALENS_DB_URL).toBe("postgresql://postgres:postgres@127.0.0.1:54322/postgres");
    expect(playwrightEnv).toMatchObject({
      NEXT_PUBLIC_LOCALLENS_RUNTIME: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: expect.stringMatching(/^publishable-/),
      LOCALENS_RUNTIME_CUSTOMER_PASSWORD: env.LOCALENS_RUNTIME_CUSTOMER_PASSWORD,
      LOCALENS_RUNTIME_GUIDE_PASSWORD: env.LOCALENS_RUNTIME_GUIDE_PASSWORD,
      LOCALENS_RUNTIME_ADMIN_PASSWORD: env.LOCALENS_RUNTIME_ADMIN_PASSWORD,
      LOCALENS_RUNTIME_PLAYWRIGHT_OUTPUT_DIR: "C:/temp/localens-runtime-auth-owned",
    });
    expect(seedEnv.LOCALENS_RUNTIME_UNUSED_PASSWORD).toBeUndefined();
    expect(playwrightEnv.LOCALENS_RUNTIME_UNUSED_PASSWORD).toBeUndefined();
    expect(seedEnv.LOCALENS_RUNTIME_PLAYWRIGHT_OUTPUT_DIR).toBeUndefined();
    expect(playwrightEnv.NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES).toBeUndefined();
    expect(stopServer).toHaveBeenCalledOnce();
    expect(removedDirectories).toEqual(["C:/temp/localens-runtime-auth-owned"]);
    const output = logs.join("\n");
    for (const secret of [
      ...Object.values(env).filter((value) => value.includes("-")),
      parseLocalRuntimeStatus(LOCAL_STATUS).publishableKey,
    ]) {
      expect(output).not.toContain(secret);
    }
  });

  it("stops local Supabase only when the explicit stop flag is supplied", async () => {
    const calls: Array<{ name: string; env: Record<string, string | undefined> }> = [];
    await runRuntimeAuthE2E({
      cwd: process.cwd(),
      env: {
        LOCALENS_RUNTIME_STOP_DB: "1",
        LOCALENS_RUNTIME_CUSTOMER_PASSWORD: `customer-${randomUUID()}`,
        LOCALENS_RUNTIME_UNUSED_PASSWORD: `unused-${randomUUID()}`,
      },
      requireLocalCli: () => "C:/repo/node_modules/.bin/supabase.cmd",
      versionProbe: () => ({ status: 0, stdout: "2.115.0\n", stderr: "" }),
      prepareDocker: () => undefined,
      status: () => ({ status: 0, stdout: LOCAL_STATUS, stderr: "" }),
      createOutputDirectory: () => "C:/temp/localens-runtime-auth-owned",
      removeOutputDirectory: vi.fn(),
      startServer: async () => ({ stop: async () => undefined }),
      runStep: async (spec: { name: string; env: Record<string, string | undefined> }) => {
        calls.push({ name: spec.name, env: spec.env });
        return { status: 0 };
      },
      logger: vi.fn(),
    });

    expect(calls.map(({ name }) => name)).toEqual([
      "db:start",
      "db:reset",
      "db:seed:runtime-auth",
      "test:e2e:runtime-auth:playwright",
      "db:stop",
    ]);
    expect(Object.keys(calls.at(-1)!.env).filter((name) => /^LOCALENS_RUNTIME_.*_PASSWORD$/.test(name))).toEqual([]);
  });

  it("cleans its owned Playwright output directory after a failed browser step", async () => {
    const removedDirectories: string[] = [];

    await expect(runRuntimeAuthE2E({
      cwd: process.cwd(),
      env: {},
      requireLocalCli: () => "C:/repo/node_modules/.bin/supabase.cmd",
      versionProbe: () => ({ status: 0, stdout: "2.115.0\n", stderr: "" }),
      prepareDocker: () => undefined,
      status: () => ({ status: 0, stdout: LOCAL_STATUS, stderr: "" }),
      createOutputDirectory: () => "C:/temp/localens-runtime-auth-owned",
      removeOutputDirectory: (directory: string) => removedDirectories.push(directory),
      startServer: async () => ({ stop: async () => undefined }),
      runStep: async (spec: { name: string }) => ({
        status: spec.name === "test:e2e:runtime-auth:playwright" ? 1 : 0,
      }),
      logger: vi.fn(),
    })).rejects.toThrow(/RUNTIME_AUTH_STEP_FAILED/);

    expect(removedDirectories).toEqual(["C:/temp/localens-runtime-auth-owned"]);
  });

  it("redacts child startup errors even when the thrown dependency error contains a password", async () => {
    const password = `secret-${randomUUID()}`;
    let capturedError: unknown;
    try {
      await runRuntimeAuthE2E({
        cwd: process.cwd(),
        env: { LOCALENS_RUNTIME_CUSTOMER_PASSWORD: password },
        requireLocalCli: () => "C:/repo/node_modules/.bin/supabase.cmd",
        versionProbe: () => ({ status: 0, stdout: "2.115.0\n", stderr: "" }),
        prepareDocker: () => undefined,
        runStep: async () => {
          throw new Error(`dependency leaked ${password}`);
        },
        logger: vi.fn(),
      });
    } catch (error) {
      capturedError = error;
    }

    expect(String(capturedError)).toMatch(/RUNTIME_AUTH_STEP_FAILED/);
    expect(String(capturedError)).not.toContain(password);
  });

  it("preserves a stable cleanup marker when runtime-server startup cleanup cannot be confirmed", async () => {
    const cleanupSecret = `cleanup-${randomUUID()}`;
    let capturedError: unknown;

    try {
      await runRuntimeAuthE2E({
        cwd: process.cwd(),
        env: {},
        requireLocalCli: () => "C:/repo/node_modules/.bin/supabase.cmd",
        versionProbe: () => ({ status: 0, stdout: "2.115.0\n", stderr: "" }),
        prepareDocker: () => undefined,
        status: () => ({ status: 0, stdout: LOCAL_STATUS, stderr: "" }),
        createOutputDirectory: () => "C:/temp/localens-runtime-auth-owned",
        removeOutputDirectory: vi.fn(),
        startServer: async () => {
          throw Object.assign(new Error("startup-secret"), {
            serverCleanupError: new Error(cleanupSecret),
          });
        },
        runStep: async () => ({ status: 0 }),
        logger: vi.fn(),
      });
    } catch (error) {
      capturedError = error;
    }

    expect(capturedError).toMatchObject({
      code: "RUNTIME_AUTH_SERVER_FAILED",
      serverCleanupError: { code: "RUNTIME_AUTH_SERVER_CLEANUP_FAILED" },
    });
    expect(String(capturedError)).not.toMatch(/startup-secret|cleanup-/);
    expect(String((capturedError as { serverCleanupError?: unknown }).serverCleanupError)).not.toContain(cleanupSecret);
  });
});
