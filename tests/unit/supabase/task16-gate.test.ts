import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

// @ts-expect-error Task16 executable JavaScript boundaries are covered by focused runtime tests.
import { DB_GATE_STEPS, assertNoRemoteMode, runDbGate } from "@/scripts/run-db-gate.mjs";
// @ts-expect-error Task16 executable JavaScript boundaries are covered by focused runtime tests.
import { checkGeneratedDatabaseTypes, writeGeneratedDatabaseTypes } from "@/scripts/write-generated-db-types.mjs";
// @ts-expect-error Task16 executable JavaScript boundaries are covered by focused runtime tests.
import { CONCURRENCY_SCENARIO_IDS, REQUIRED_CONCURRENCY_SCENARIOS, beginFixedTourBookingForConcurrency, runConcurrencyCheck, runConcurrencyGate } from "@/scripts/test-db-concurrency.mjs";
// @ts-expect-error Task16 executable JavaScript boundaries are covered by focused runtime tests.
import { requireLocalSupabaseCli, runLocalSupabase } from "@/scripts/supabase-local.mjs";
// @ts-expect-error Task16 executable JavaScript boundaries are covered by focused runtime tests.
import { exitCodeForError } from "@/scripts/run-db-gate.mjs";
import { resolve as resolvePath } from "node:path";

describe("Task16 database gate", () => {
  it("runs the local gate in order and always stops after success", async () => {
    const calls: string[] = [];
    const commands: Array<{
      command: string;
      args: string[];
      databaseUrl?: string;
      lowercaseDatabaseUrl?: string;
      concurrencyFlag?: string;
      lowercaseConcurrencyFlag?: string;
    }> = [];
    const result = await runDbGate({
      cwd: "C:/repo",
      platform: "win32",
      comSpec: "C:/Windows/System32/cmd.exe",
      cliPath: "C:/repo/node_modules/.bin/supabase.cmd",
      env: {
        LOCALENS_DB_URL: "postgresql://remote-uppercase.invalid:5432/postgres",
        localens_db_url: "postgresql://remote-lowercase.invalid:5432/postgres",
        LOCALENS_DB_CONCURRENCY: "0",
        localens_db_concurrency: "leaked",
      },
      runner: async (spec: { name: string; command: string; args: string[]; env: Record<string, string> }) => {
        calls.push(spec.name);
        commands.push({
          command: spec.command,
          args: spec.args,
          databaseUrl: spec.env.LOCALENS_DB_URL,
          lowercaseDatabaseUrl: spec.env.localens_db_url,
          concurrencyFlag: spec.env.LOCALENS_DB_CONCURRENCY,
          lowercaseConcurrencyFlag: spec.env.localens_db_concurrency,
        });
        return { status: 0, stdout: "", stderr: "" };
      },
    });

    expect(result.ok).toBe(true);
    expect(calls).toEqual([...DB_GATE_STEPS, "db:stop"]);
    expect(commands).toEqual(calls.map((name) => ({
      command: "C:/Windows/System32/cmd.exe",
      args: ["/d", "/s", "/c", `corepack.cmd pnpm run ${name}`],
      databaseUrl: name === "db:concurrency"
        ? "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
        : undefined,
      lowercaseDatabaseUrl: undefined,
      concurrencyFlag: name === "db:concurrency" ? "1" : undefined,
      lowercaseConcurrencyFlag: undefined,
    })));
  });

  it("preserves the first step failure and still runs local stop cleanup", async () => {
    const calls: string[] = [];
    const firstFailure = new Error("pgTAP failed");

    await expect(
      runDbGate({
        cwd: "C:/repo",
        cliPath: "C:/repo/node_modules/.bin/supabase.cmd",
        runner: async (spec: { name: string }) => {
          calls.push(spec.name);
          if (spec.name === "db:test") throw firstFailure;
          return { status: 0, stdout: "", stderr: "" };
        },
      }),
    ).rejects.toBe(firstFailure);

    expect(calls).toEqual(["db:start", "db:reset", "db:lint", "db:test", "db:stop"]);
  });

  it("rejects remote and linked Supabase modes before running anything", () => {
    expect(() => assertNoRemoteMode(["link", "--project-ref", "abc"])).toThrow(/REMOTE_MODE_REJECTED/);
    expect(() => assertNoRemoteMode(["db", "reset", "--remote"])).toThrow(/REMOTE_MODE_REJECTED/);
    expect(() => assertNoRemoteMode(["db", "reset", "--local"])).not.toThrow();
  });

  it("rejects an explicit CLI path outside the project-local bin directory", () => {
    expect(() =>
      requireLocalSupabaseCli({
        cwd: "C:/repo",
        cliPath: "C:/outside/supabase.cmd",
        platform: "win32",
      }),
    ).toThrow(/SUPABASE_CLI_PATH_REJECTED/);
  });

  it("runs the verified Windows Supabase JS entrypoint through project Node", () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "localens-task16-windows-"));
    const cliPath = path.join(rootDir, "node_modules", ".bin", "supabase.cmd");
    const jsEntrypoint = path.join(rootDir, "node_modules", "supabase", "dist", "supabase.js");
    const calls: Array<{ command: string; args: string[] }> = [];
    mkdirSync(path.dirname(cliPath), { recursive: true });
    mkdirSync(path.dirname(jsEntrypoint), { recursive: true });
    writeFileSync(cliPath, "@echo off\r\n", "utf8");
    writeFileSync(jsEntrypoint, "", "utf8");

    try {
      expect(() =>
        runLocalSupabase(["--version"], {
          cwd: rootDir,
          platform: "win32",
          cliPath,
          capture: true,
          spawn: (command: string, args: string[]) => {
            calls.push({ command, args });
            return { status: 0, stdout: "2.115.0\n", stderr: "" };
          },
        }),
      ).not.toThrow();

      expect(calls).toEqual([{ command: process.execPath, args: [jsEntrypoint, "--version"] }]);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("preserves the failed Supabase step status for the process exit code", () => {
    expect(exitCodeForError({ status: 17 })).toBe(17);
    expect(exitCodeForError(new Error("no status"))).toBe(2);
  });

  it("fails closed when the project-local Supabase CLI is missing", async () => {
    const calls: string[] = [];

    await expect(
      runDbGate({
        cwd: "C:/repo-without-node-modules",
        runner: async (spec: { name: string }) => {
          calls.push(spec.name);
          return { status: 0, stdout: "", stderr: "" };
        },
      }),
    ).rejects.toMatchObject({ code: "SUPABASE_CLI_NOT_FOUND" });

    expect(calls).toEqual([]);
  });

  it("keeps the Windows entrypoint fail-closed from a non-ASCII working directory", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "localens-Đồ án-"));
    try {
      const result = spawnSync(
        process.execPath,
        [path.join(process.cwd(), "scripts", "supabase-local.mjs"), "start"],
        { cwd, encoding: "utf8", windowsHide: true },
      );

      expect(result.status).toBe(2);
      expect(`${result.stdout ?? ""}${result.stderr ?? ""}`).toContain("SUPABASE_CLI_NOT_FOUND");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("keeps the generated-types checker entrypoint fail-closed from a non-ASCII working directory", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "localens-Đồ án-"));
    try {
      const result = spawnSync(
        process.execPath,
        [resolvePath(process.cwd(), "scripts", "check-generated-db-types.mjs")],
        { cwd, encoding: "utf8", windowsHide: true },
      );

      expect(result.status).toBe(2);
      expect(`${result.stdout ?? ""}${result.stderr ?? ""}`).toContain("SUPABASE_CLI_NOT_FOUND");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("Task16 generated database types", () => {
  it("does not create a generated file when the CLI returns no output", async () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "localens-task16-"));
    const cliPath = path.join(rootDir, "node_modules", ".bin", "supabase.cmd");
    try {
      await expect(
        writeGeneratedDatabaseTypes({
          rootDir,
          cliPath,
          runner: async () => ({ status: 0, stdout: "\n  ", stderr: "" }),
        }),
      ).rejects.toMatchObject({ code: "GENERATED_TYPES_EMPTY" });

      expect(() => statSync(path.join(rootDir, "lib/infrastructure/supabase/database.types.ts"))).toThrow();
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("uses local-only type generation and atomically writes non-empty output", async () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "localens-task16-"));
    const cliPath = path.join(rootDir, "node_modules", ".bin", "supabase.cmd");
    const calls: Array<{ args: string[] }> = [];
    try {
      await writeGeneratedDatabaseTypes({
        rootDir,
        cliPath,
        runner: async (spec: { args: string[] }) => {
          calls.push(spec);
          return { status: 0, stdout: "export type Database = {};\n\n", stderr: "" };
        },
      });

      expect(calls[0]?.args).toEqual(["gen", "types", "--lang", "typescript", "--local"]);
      expect(readFileSync(path.join(rootDir, "lib/infrastructure/supabase/database.types.ts"), "utf8")).toBe(
        "export type Database = {};\n",
      );
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("fails type drift checking without creating the missing target", async () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "localens-task16-"));
    const cliPath = path.join(rootDir, "node_modules", ".bin", "supabase.cmd");
    try {
      await expect(
        checkGeneratedDatabaseTypes({
          rootDir,
          cliPath,
          runner: async () => ({ status: 0, stdout: "export type Database = {};\n", stderr: "" }),
        }),
      ).rejects.toMatchObject({ code: "GENERATED_TYPES_MISSING" });

      expect(() => statSync(path.join(rootDir, "lib/infrastructure/supabase/database.types.ts"))).toThrow();
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("detects drift in an existing generated file without replacing it", async () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "localens-task16-"));
    const cliPath = path.join(rootDir, "node_modules", ".bin", "supabase.cmd");
    const filePath = path.join(rootDir, "lib/infrastructure/supabase/database.types.ts");
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, "export type Database = { previous: true };\n", "utf8");
    try {
      await expect(
        checkGeneratedDatabaseTypes({
          rootDir,
          cliPath,
          runner: async () => ({ status: 0, stdout: "export type Database = { current: true };\n", stderr: "" }),
        }),
      ).rejects.toMatchObject({ code: "GENERATED_TYPES_DRIFT" });
      expect(readFileSync(filePath, "utf8")).toBe("export type Database = { previous: true };\n");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("preserves the previous generated file across failed and empty generation", async () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "localens-task16-"));
    const cliPath = path.join(rootDir, "node_modules", ".bin", "supabase.cmd");
    const filePath = path.join(rootDir, "lib/infrastructure/supabase/database.types.ts");
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, "export type Database = { previous: true };\n", "utf8");
    try {
      await expect(
        writeGeneratedDatabaseTypes({
          rootDir,
          cliPath,
          runner: async () => ({ status: 9, stdout: "", stderr: "failed" }),
        }),
      ).rejects.toMatchObject({ code: "SUPABASE_COMMAND_FAILED" });
      expect(readFileSync(filePath, "utf8")).toBe("export type Database = { previous: true };\n");

      await expect(
        writeGeneratedDatabaseTypes({
          rootDir,
          cliPath,
          runner: async () => ({ status: 0, stdout: "\n", stderr: "" }),
        }),
      ).rejects.toMatchObject({ code: "GENERATED_TYPES_EMPTY" });
      expect(readFileSync(filePath, "utf8")).toBe("export type Database = { previous: true };\n");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});

describe("Task16 generated database type normalization", () => {
  it("normalizes CLI line endings before checking generated type drift", async () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "localens-task16-"));
    const cliPath = path.join(rootDir, "node_modules", ".bin", "supabase.cmd");
    const filePath = path.join(rootDir, "lib/infrastructure/supabase/database.types.ts");
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, "export type Database = {};\n", "utf8");
    try {
      await expect(
        checkGeneratedDatabaseTypes({
          rootDir,
          cliPath,
          runner: async () => ({ status: 0, stdout: "export type Database = {};\r\n\r\n", stderr: "" }),
        }),
      ).resolves.toMatchObject({ ok: true, filePath });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});

describe("Task16 concurrency preflight", () => {
  it("uses the authenticated public fixed-tour wrapper without actor or hash authority", async () => {
    const calls: Array<{ sql: string; parameters: string[] }> = [];
    const expectedResult = { rowCount: 1, rows: [{ booking_id: "booking-a", state: "created" }] };
    const session = {
      query: async (sql: string, parameters: string[]) => {
        calls.push({ sql, parameters });
        return expectedResult;
      },
    };

    await expect(beginFixedTourBookingForConcurrency(session, {
      departureId: "departure-a",
      idempotencyKey: "race-a",
    })).resolves.toBe(expectedResult);

    expect(calls).toEqual([{
      sql: "SELECT * FROM public.begin_fixed_tour_booking($1::uuid, 1, 'en'::public.locale, $2)",
      parameters: ["departure-a", "race-a"],
    }]);
  });

  it("executes all nine required races with two independent sessions", async () => {
    const sessions: Array<{ id: number; connect: () => Promise<void>; end: () => Promise<void> }> = [];
    const calls: Array<{ scenario: string; sessionIds: number[] }> = [];
    const sessionFactory = () => {
      const session = {
        id: sessions.length + 1,
        connect: async () => undefined,
        end: async () => undefined,
      };
      sessions.push(session);
      return session;
    };
    const scenarios = Object.fromEntries(
      CONCURRENCY_SCENARIO_IDS.map((scenario: string) => [
        scenario,
        async ({ sessions: activeSessions }: { sessions: Array<{ id: number }> }) => {
          calls.push({ scenario, sessionIds: activeSessions.map((session) => session.id) });
        },
      ]),
    );

    const result = await runConcurrencyGate({
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      sessionFactory,
      scenarios,
    });

    expect(result).toEqual({ ok: true, scenarios: CONCURRENCY_SCENARIO_IDS });
    expect(CONCURRENCY_SCENARIO_IDS).toEqual([
      "cas_revision_winner",
      "guest_claim_winner",
      "quota_reservation_idempotency",
      "departure_capacity_no_oversell",
      "quote_checkout_compensation",
      "stripe_webhook_event_race",
      "simulated_payment_terminalization",
      "cancellation_approval_payment_race",
      "guide_assignment_serialization",
    ]);
    expect(sessions).toHaveLength(2);
    expect(calls).toHaveLength(9);
    for (const call of calls) expect(new Set(call.sessionIds).size).toBe(2);
  });

  it("allows an explicitly verified loopback QA port without changing the default", async () => {
    const sessions: Array<{ connect: () => Promise<void>; end: () => Promise<void> }> = [];
    const sessionFactory = () => {
      const session = { connect: async () => undefined, end: async () => undefined };
      sessions.push(session);
      return session;
    };

    await expect(runConcurrencyGate({
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
      expectedPort: "55322",
      sessionFactory,
      scenarios: Object.fromEntries(CONCURRENCY_SCENARIO_IDS.map((scenario: string) => [scenario, async () => undefined])),
    })).resolves.toEqual({ ok: true, scenarios: CONCURRENCY_SCENARIO_IDS });
    expect(sessions).toHaveLength(2);
  });

  it("rejects a remote database URL before any harness configuration", async () => {
    const result = await runConcurrencyCheck({
      env: { LOCALENS_DB_URL: "postgresql://user:pass@project.supabase.co:5432/postgres" },
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("REMOTE_MODE_REJECTED");
  });

  it("rejects a loopback URL without the explicit local Supabase port", async () => {
    const result = await runConcurrencyCheck({
      env: { LOCALENS_DB_URL: "postgresql://user:pass@127.0.0.1/postgres" },
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("REMOTE_MODE_REJECTED");
  });

  it("reports NOT_CONFIGURED and names all required two-session scenarios", async () => {
    const result = await runConcurrencyCheck({ env: {} });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("NOT_CONFIGURED");
    expect(result.message).toContain("NOT_CONFIGURED");
    for (const scenario of REQUIRED_CONCURRENCY_SCENARIOS) {
      expect(result.message).toContain(scenario);
    }
  });
});

describe("Task16 runbook", () => {
  it("documents generation after reset before the verification gate", () => {
    const runbook = readFileSync(path.join(process.cwd(), "docs/runbooks/local-supabase.md"), "utf8");
    expect(runbook).toMatch(/pnpm db:reset[\s\S]*pnpm db:types[\r\n]+[\s\S]*pnpm db:verify/);
  });


});

describe("Task 1 runtime mode package gate", () => {
  it("provides explicit demo and Supabase commands and checks the demo build", () => {
    const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts).toMatchObject({
      "dev:demo": "node scripts/run-next-mode.mjs dev demo",
      "dev:supabase": "node scripts/run-next-mode.mjs dev supabase",
      "build:demo": "node scripts/run-next-mode.mjs build demo",
      "build:supabase": "node scripts/run-next-mode.mjs build supabase",
      "db:stop": "node scripts/supabase-local.mjs stop",
      check: "pnpm lint && pnpm typecheck && pnpm test:run --no-file-parallelism --testTimeout=30000 && pnpm db:static && pnpm build:demo",
    });
  });
});
