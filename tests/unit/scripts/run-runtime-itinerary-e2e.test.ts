// @vitest-environment node

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildIsolatedSupabaseConfig,
  createRuntimeItinerarySecrets,
  parseIsolatedRuntimeStatus,
  prepareIsolatedSupabaseProject,
  runRuntimeItineraryE2E,
  runRuntimeItineraryE2EMain,
  selectRuntimeItineraryBaseEnv,
  startFakeGeminiProvider,
} from "@/scripts/run-runtime-itinerary-e2e.mjs";

const ports = {
  api: 55431,
  database: 55432,
  shadow: 55430,
  pooler: 55439,
  studio: 55433,
  mailpitHttp: 55434,
  mailpitSmtp: 55435,
  mailpitPop3: 55436,
  analytics: 55437,
  inspector: 55438,
  next: 55440,
} as const;

const temporaryPaths: string[] = [];

afterEach(() => {
  for (const target of temporaryPaths.splice(0)) {
    rmSync(target, { recursive: true, force: true });
  }
});

describe("isolated runtime itinerary runner", () => {
  it("keeps only local process environment and rejects remote container sockets", () => {
    expect(selectRuntimeItineraryBaseEnv({
      PATH: "C:/tools",
      CI: "1",
      GEMINI_API_KEY: "must-not-pass-through",
      SUPABASE_SERVICE_ROLE_KEY: "must-not-pass-through",
      DOCKER_HOST: "npipe:////./pipe/docker_engine",
    })).toEqual({
      PATH: "C:/tools",
      CI: "1",
      DOCKER_HOST: "npipe:////./pipe/docker_engine",
      NEXT_TELEMETRY_DISABLED: "1",
    });
    expect(() => selectRuntimeItineraryBaseEnv({
      DOCKER_HOST: "tcp://198.51.100.10:2375",
    })).toThrow(/local container socket/i);
  });

  it("generates bounded test-only secrets without retaining caller credentials", () => {
    const random = vi.fn((length: number) => Buffer.alloc(length, 7));
    const result = createRuntimeItinerarySecrets({
      LOCALENS_RUNTIME_CUSTOMER_PASSWORD: "customer-password",
      LOCALENS_RUNTIME_ITINERARY_OTHER_CUSTOMER_PASSWORD: "other-password",
    }, random);

    expect(result.customer).toBe("customer-password");
    expect(result.otherCustomer).toBe("other-password");
    expect(result.geminiApiKey.length).toBeGreaterThanOrEqual(32);
    expect(result.geminiControlToken.length).toBeGreaterThanOrEqual(32);
    expect(result.quotaHmacKey.length).toBeGreaterThanOrEqual(32);
    expect(result).not.toHaveProperty("serviceRoleKey");
  });

  it("requires the per-run control token before mutating fake-provider state", async () => {
    const controlToken = "c".repeat(32);
    const provider = await startFakeGeminiProvider({
      apiKey: "a".repeat(32),
      controlToken,
      containerHost: "host.docker.internal",
    });
    try {
      const denied = await fetch(provider.controlUrl);
      expect(denied.status).toBe(401);

      const allowed = await fetch(provider.controlUrl, {
        headers: { "x-localens-control-token": controlToken },
      });
      expect(allowed.status).toBe(200);
      expect(await allowed.json()).toEqual({ requests: 0, scenario: "valid" });
    } finally {
      await provider.stop();
    }
  });

  it("builds and validates a nonstandard isolated Supabase configuration", () => {
    const config = buildIsolatedSupabaseConfig(
      "project_id = \"localens\"\n[api]\nenabled = true\n[db]\nmajor_version = 17\n",
      { projectId: "localens-itinerary-test", ports },
    );

    expect(config).toContain('project_id = "localens-itinerary-test"');
    expect(config).toMatch(/\[api\][\s\S]*port = 55431/);
    expect(config).toMatch(/\[db\][\s\S]*port = 55432/);
    expect(config).toContain("shadow_port = 55430");
    expect(config).toContain('site_url = "http://127.0.0.1:55440"');
    expect(() => buildIsolatedSupabaseConfig(config, {
      projectId: "localens-itinerary-test",
      ports: { ...ports, api: 54321 },
    })).toThrow(/overlap/i);
  });

  it("copies the pgTAP suite required by the isolated database gate", () => {
    const sourceRoot = mkdtempSync(join(tmpdir(), "localens-runtime-itinerary-source-test-"));
    const projectRoot = mkdtempSync(join(tmpdir(), "localens-runtime-itinerary-test-"));
    temporaryPaths.push(sourceRoot, projectRoot);
    for (const directory of [
      join(sourceRoot, "supabase", "migrations"),
      join(sourceRoot, "supabase", "functions", "_shared"),
      join(sourceRoot, "supabase", "functions", "recommend-itinerary"),
      join(sourceRoot, "supabase", "functions", "refine-itinerary"),
      join(sourceRoot, "supabase", "tests", "database"),
      join(sourceRoot, "lib"),
    ]) {
      mkdirSync(directory, { recursive: true });
    }
    writeFileSync(
      join(sourceRoot, "supabase", "config.toml"),
      [
        'project_id = "localens"',
        "[api]",
        "enabled = true",
        "[db]",
        "major_version = 17",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(join(sourceRoot, "supabase", "tests", "database", "smoke.sql"), "select 1;\n", "utf8");

    prepareIsolatedSupabaseProject({
      cwd: sourceRoot,
      projectRoot,
      projectId: "localens-itinerary-test",
      ports,
    });

    expect(readFileSync(join(projectRoot, "supabase", "tests", "database", "smoke.sql"), "utf8"))
      .toBe("select 1;\n");
  });

  it("removes a runner-created project directory when preparation fails", () => {
    const sourceRoot = mkdtempSync(join(tmpdir(), "localens-runtime-itinerary-source-test-"));
    temporaryPaths.push(sourceRoot);
    const projectRoot = mkdtempSync(join(tmpdir(), "localens-runtime-itinerary-test-"));
    const removeProjectRoot = vi.fn((target: string) => rmSync(target, { recursive: true, force: true }));

    expect(() => prepareIsolatedSupabaseProject({
      cwd: sourceRoot,
      projectId: "localens-itinerary-test",
      ports,
      createProjectRoot: vi.fn(() => projectRoot),
      removeProjectRoot,
    })).toThrow(/source|unavailable/i);

    expect(removeProjectRoot).toHaveBeenCalledWith(projectRoot);
    expect(existsSync(projectRoot)).toBe(false);
  });

  it("accepts status only when API and database ports match the isolated map", () => {
    const output = [
      `API_URL="http://127.0.0.1:${ports.api}"`,
      `DB_URL="postgresql://postgres:postgres@127.0.0.1:${ports.database}/postgres"`,
      'PUBLISHABLE_KEY="publishable-test"',
      'ANON_KEY="anon-test"',
      'SERVICE_ROLE_KEY="service-test"',
    ].join("\n");

    expect(parseIsolatedRuntimeStatus(output, ports)).toMatchObject({
      apiUrl: `http://127.0.0.1:${ports.api}`,
      publishableKey: "publishable-test",
      serviceRoleKey: "service-test",
    });
    expect(() => parseIsolatedRuntimeStatus(
      output.replace(String(ports.api), "54321"),
      ports,
    )).toThrow(/isolated project port map/i);
  });

  it("orchestrates only owned resources and cleans them in reverse dependency order", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "localens-runtime-itinerary-test-"));
    temporaryPaths.push(projectRoot);
    mkdirSync(join(projectRoot, "supabase", "functions"), { recursive: true });
    const outputDirectory = mkdtempSync(join(tmpdir(), "localens-runtime-itinerary-playwright-test-"));
    temporaryPaths.push(outputDirectory);
    const events: string[] = [];
    const release = vi.fn(async () => { events.push("ports:release"); });
    const removeProject = vi.fn(() => { events.push("project:remove"); });
    const removeOutputDirectory = vi.fn(() => { events.push("output:remove"); });
    const runStep = vi.fn(async (spec: { name: string }) => {
      events.push(spec.name);
      return { status: 0 };
    });
    const statusOutput = [
      `API_URL="http://127.0.0.1:${ports.api}"`,
      `DB_URL="postgresql://postgres:postgres@127.0.0.1:${ports.database}/postgres"`,
      'PUBLISHABLE_KEY="publishable-test"',
      'ANON_KEY="anon-test"',
      'SERVICE_ROLE_KEY="service-test"',
    ].join("\n");

    await expect(runRuntimeItineraryE2E({
      cwd: process.cwd(),
      env: { PATH: process.env.PATH },
      random: (length: number) => Buffer.alloc(length, 5),
      prepareDocker: vi.fn(),
      requirePinnedCli: vi.fn(() => "supabase"),
      reservePorts: vi.fn(async () => ({ ports, release })),
      prepareProject: vi.fn(() => ({ root: projectRoot, projectId: "localens-itinerary-test", ports })),
      removeProject,
      status: vi.fn(async () => ({ status: 0, stdout: statusOutput })),
      seedRuntime: vi.fn(async () => { events.push("seed"); }),
      containerHost: "host.docker.internal",
      startProvider: vi.fn(async () => ({
        endpointBase: "http://host.docker.internal:55441/v1beta",
        controlUrl: "http://127.0.0.1:55441/control",
        stop: async () => { events.push("provider:stop"); },
      })),
      startFunctions: vi.fn(async () => ({ stop: async () => { events.push("functions:stop"); } })),
      startServer: vi.fn(async () => ({ stop: async () => { events.push("server:stop"); } })),
      createOutputDirectory: vi.fn(() => outputDirectory),
      removeOutputDirectory,
      runStep,
      logger: vi.fn(),
    })).resolves.toEqual({ ok: true });

    expect(events).toEqual([
      "ports:release",
      "db:start",
      "db:reset",
      "db:test",
      "seed",
      "test:e2e:runtime-itinerary:playwright",
      "server:stop",
      "functions:stop",
      "provider:stop",
      "db:stop",
      "output:remove",
      "project:remove",
    ]);
    const envFile = readFileSync(
      join(projectRoot, "supabase", "functions", ".env.runtime-itinerary"),
      "utf8",
    );
    expect(envFile).toContain("LOCALLENS_GEMINI_TEST_ENDPOINT_BASE=http://host.docker.internal:55441/v1beta");
    expect(envFile).toContain(`ALLOWED_ORIGINS=http://127.0.0.1:${ports.next}`);
    expect(envFile).not.toContain("http://127.0.0.1:3200");
    expect(envFile).not.toContain("must-not-pass-through");
  });

  it("preserves the isolated project when owned stack cleanup cannot be confirmed", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "localens-runtime-itinerary-test-"));
    temporaryPaths.push(projectRoot);
    mkdirSync(join(projectRoot, "supabase", "functions"), { recursive: true });
    const outputDirectory = mkdtempSync(join(tmpdir(), "localens-runtime-itinerary-playwright-test-"));
    temporaryPaths.push(outputDirectory);
    const removeProject = vi.fn();
    const logger = vi.fn();
    const runStep = vi.fn(async (spec: { name: string }) => {
      if (spec.name === "db:stop") throw new Error("owned stack did not stop");
      return { status: 0 };
    });
    const statusOutput = [
      `API_URL="http://127.0.0.1:${ports.api}"`,
      `DB_URL="postgresql://postgres:postgres@127.0.0.1:${ports.database}/postgres"`,
      'PUBLISHABLE_KEY="publishable-test"',
      'ANON_KEY="anon-test"',
      'SERVICE_ROLE_KEY="service-test"',
    ].join("\n");

    await expect(runRuntimeItineraryE2E({
      cwd: process.cwd(),
      env: { PATH: process.env.PATH },
      random: (length: number) => Buffer.alloc(length, 6),
      prepareDocker: vi.fn(),
      requirePinnedCli: vi.fn(() => "supabase"),
      reservePorts: vi.fn(async () => ({ ports, release: vi.fn(async () => {}) })),
      prepareProject: vi.fn(() => ({ root: projectRoot, projectId: "localens-itinerary-test", ports })),
      removeProject,
      status: vi.fn(async () => ({ status: 0, stdout: statusOutput })),
      seedRuntime: vi.fn(async () => {}),
      containerHost: "host.docker.internal",
      startProvider: vi.fn(async () => ({
        endpointBase: "http://host.docker.internal:55441/v1beta",
        controlUrl: "http://127.0.0.1:55441/control",
        stop: async () => {},
      })),
      startFunctions: vi.fn(async () => ({ stop: async () => {} })),
      startServer: vi.fn(async () => ({ stop: async () => {} })),
      createOutputDirectory: vi.fn(() => outputDirectory),
      removeOutputDirectory: vi.fn(),
      runStep,
      logger,
    })).rejects.toMatchObject({ code: "RUNTIME_ITINERARY_CLEANUP_FAILED" });

    expect(removeProject).not.toHaveBeenCalled();
    expect(logger).toHaveBeenCalledWith(expect.stringContaining(projectRoot));
  });

  it.each([
    ["Edge Functions", { cleanupFailed: true }],
    ["Next server", { serverCleanupError: { code: "RUNTIME_AUTH_SERVER_CLEANUP_FAILED" } }],
  ])("preserves the isolated project when %s startup cleanup fails", async (stage, failureDetails) => {
    const projectRoot = mkdtempSync(join(tmpdir(), "localens-runtime-itinerary-test-"));
    temporaryPaths.push(projectRoot);
    mkdirSync(join(projectRoot, "supabase", "functions"), { recursive: true });
    const outputDirectory = mkdtempSync(join(tmpdir(), "localens-runtime-itinerary-playwright-test-"));
    temporaryPaths.push(outputDirectory);
    const removeProject = vi.fn();
    const logger = vi.fn();
    const startupError = Object.assign(new Error("sensitive startup detail"), failureDetails);
    const statusOutput = [
      `API_URL="http://127.0.0.1:${ports.api}"`,
      `DB_URL="postgresql://postgres:postgres@127.0.0.1:${ports.database}/postgres"`,
      'PUBLISHABLE_KEY="publishable-test"',
      'ANON_KEY="anon-test"',
      'SERVICE_ROLE_KEY="service-test"',
    ].join("\n");

    await expect(runRuntimeItineraryE2E({
      cwd: process.cwd(),
      env: { PATH: process.env.PATH },
      random: (length: number) => Buffer.alloc(length, 8),
      prepareDocker: vi.fn(),
      requirePinnedCli: vi.fn(() => "supabase"),
      reservePorts: vi.fn(async () => ({ ports, release: vi.fn(async () => {}) })),
      prepareProject: vi.fn(() => ({ root: projectRoot, projectId: "localens-itinerary-test", ports })),
      removeProject,
      status: vi.fn(async () => ({ status: 0, stdout: statusOutput })),
      seedRuntime: vi.fn(async () => {}),
      containerHost: "host.docker.internal",
      startProvider: vi.fn(async () => ({
        endpointBase: "http://host.docker.internal:55441/v1beta",
        controlUrl: "http://127.0.0.1:55441/control",
        stop: async () => {},
      })),
      startFunctions: stage === "Edge Functions"
        ? vi.fn(async () => { throw startupError; })
        : vi.fn(async () => ({ stop: async () => {} })),
      startServer: stage === "Next server"
        ? vi.fn(async () => { throw startupError; })
        : vi.fn(async () => ({ stop: async () => {} })),
      createOutputDirectory: vi.fn(() => outputDirectory),
      removeOutputDirectory: vi.fn(),
      runStep: vi.fn(async () => ({ status: 0 })),
      logger,
    })).rejects.toMatchObject({ cleanupFailed: true });

    expect(removeProject).not.toHaveBeenCalled();
    expect(logger).toHaveBeenCalledWith(expect.stringContaining(projectRoot));
  });

  it.each([
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ] as const)("waits for cleanup and removes listeners after %s", async (signalName, exitCode) => {
    const signals = new EventEmitter();
    let finishCleanup = () => {};
    const cleanupGate = new Promise<void>((resolve) => { finishCleanup = resolve; });
    const run = vi.fn(async ({ signal }: { signal: AbortSignal }) => {
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
      await cleanupGate;
      throw Object.assign(new Error("interrupted"), {
        code: "RUNTIME_ITINERARY_ABORTED",
        status: exitCode,
      });
    });
    const main = runRuntimeItineraryE2EMain({
      run,
      signals,
      errorLogger: vi.fn(),
    });

    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
    const signal = run.mock.calls[0]?.[0]?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    signals.emit(signalName);
    await vi.waitFor(() => expect(signal?.aborted).toBe(true));
    let settled = false;
    void main.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    finishCleanup();
    await expect(main).resolves.toBe(exitCode);
    expect(signals.listenerCount("SIGINT")).toBe(0);
    expect(signals.listenerCount("SIGTERM")).toBe(0);
  });

  it("aborts an active owned step but still runs cleanup with a fresh signal context", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "localens-runtime-itinerary-test-"));
    temporaryPaths.push(projectRoot);
    mkdirSync(join(projectRoot, "supabase", "functions"), { recursive: true });
    const outputDirectory = mkdtempSync(join(tmpdir(), "localens-runtime-itinerary-playwright-test-"));
    temporaryPaths.push(outputDirectory);
    const controller = new AbortController();
    const events: string[] = [];
    const removeProject = vi.fn(() => { events.push("project:remove"); });
    const runStep = vi.fn(async (spec: { name: string; signal?: AbortSignal }) => {
      events.push(spec.name);
      if (spec.name === "test:e2e:runtime-itinerary:playwright") {
        controller.abort();
        if (!spec.signal?.aborted) throw new Error("active step did not receive the abort signal");
        throw Object.assign(new Error("step interrupted"), { code: "RUNTIME_ITINERARY_ABORTED" });
      }
      if (spec.name === "db:stop" && spec.signal?.aborted) {
        throw new Error("cleanup inherited an aborted signal");
      }
      return { status: 0 };
    });
    const statusOutput = [
      `API_URL="http://127.0.0.1:${ports.api}"`,
      `DB_URL="postgresql://postgres:postgres@127.0.0.1:${ports.database}/postgres"`,
      'PUBLISHABLE_KEY="publishable-test"',
      'ANON_KEY="anon-test"',
      'SERVICE_ROLE_KEY="service-test"',
    ].join("\n");

    await expect(runRuntimeItineraryE2E({
      cwd: process.cwd(),
      env: { PATH: process.env.PATH },
      signal: controller.signal,
      random: (length: number) => Buffer.alloc(length, 9),
      prepareDocker: vi.fn(),
      requirePinnedCli: vi.fn(() => "supabase"),
      reservePorts: vi.fn(async () => ({ ports, release: vi.fn(async () => {}) })),
      prepareProject: vi.fn(() => ({ root: projectRoot, projectId: "localens-itinerary-test", ports })),
      removeProject,
      status: vi.fn(async () => ({ status: 0, stdout: statusOutput })),
      seedRuntime: vi.fn(async () => {}),
      containerHost: "host.docker.internal",
      startProvider: vi.fn(async () => ({
        endpointBase: "http://host.docker.internal:55441/v1beta",
        controlUrl: "http://127.0.0.1:55441/control",
        stop: async () => { events.push("provider:stop"); },
      })),
      startFunctions: vi.fn(async () => ({ stop: async () => { events.push("functions:stop"); } })),
      startServer: vi.fn(async () => ({ stop: async () => { events.push("server:stop"); } })),
      createOutputDirectory: vi.fn(() => outputDirectory),
      removeOutputDirectory: vi.fn(() => { events.push("output:remove"); }),
      runStep,
      logger: vi.fn(),
    })).rejects.toMatchObject({ code: "RUNTIME_ITINERARY_ABORTED" });

    expect(events.slice(-6)).toEqual([
      "server:stop",
      "functions:stop",
      "provider:stop",
      "db:stop",
      "output:remove",
      "project:remove",
    ]);
  });
});
