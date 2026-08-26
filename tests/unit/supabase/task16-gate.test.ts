import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

// @ts-expect-error Task16 executable JavaScript boundaries are covered by focused runtime tests.
import { DB_GATE_STEPS, assertNoRemoteMode, runDbGate } from "@/scripts/run-db-gate.mjs";
// @ts-expect-error Task16 executable JavaScript boundaries are covered by focused runtime tests.
import { checkGeneratedDatabaseTypes, writeGeneratedDatabaseTypes } from "@/scripts/write-generated-db-types.mjs";
// @ts-expect-error Task16 executable JavaScript boundaries are covered by focused runtime tests.
import { REQUIRED_CONCURRENCY_SCENARIOS, runConcurrencyCheck } from "@/scripts/test-db-concurrency.mjs";
import { resolve as resolvePath } from "node:path";

describe("Task16 database gate", () => {
  it("runs the local gate in order and always stops after success", async () => {
    const calls: string[] = [];
    const result = await runDbGate({
      cliPath: "C:/repo/node_modules/.bin/supabase.cmd",
      runner: async (spec: { name: string }) => {
        calls.push(spec.name);
        return { status: 0, stdout: "", stderr: "" };
      },
    });

    expect(result.ok).toBe(true);
    expect(calls).toEqual([...DB_GATE_STEPS, "db:stop"]);
  });

  it("preserves the first step failure and still runs local stop cleanup", async () => {
    const calls: string[] = [];
    const firstFailure = new Error("pgTAP failed");

    await expect(
      runDbGate({
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
    try {
      await expect(
        writeGeneratedDatabaseTypes({
          rootDir,
          cliPath: "fake-supabase",
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
    const calls: Array<{ args: string[] }> = [];
    try {
      await writeGeneratedDatabaseTypes({
        rootDir,
        cliPath: "fake-supabase",
        runner: async (spec: { args: string[] }) => {
          calls.push(spec);
          return { status: 0, stdout: "export type Database = {};\n", stderr: "" };
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
    try {
      await expect(
        checkGeneratedDatabaseTypes({
          rootDir,
          cliPath: "fake-supabase",
          runner: async () => ({ status: 0, stdout: "export type Database = {};\n", stderr: "" }),
        }),
      ).rejects.toMatchObject({ code: "GENERATED_TYPES_MISSING" });

      expect(() => statSync(path.join(rootDir, "lib/infrastructure/supabase/database.types.ts"))).toThrow();
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});

describe("Task16 concurrency preflight", () => {
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
