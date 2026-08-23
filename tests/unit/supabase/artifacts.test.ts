// @vitest-environment node

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const checker = join(repoRoot, "scripts", "check-supabase-artifacts.mjs");

function fixtureRoot(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "localens-supabase-artifacts-"));
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = join(root, relativePath);
    const directory = absolutePath.slice(0, absolutePath.lastIndexOf("\\"));
    mkdirSync(directory, { recursive: true });
    writeFileSync(absolutePath, contents, "utf8");
  }
  return root;
}

function runChecker(root: string, ...args: string[]): { status: number; output: string } {
  try {
    const output = execFileSync(process.execPath, [checker, "--root", root, ...args], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, output };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: failure.status ?? 1,
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
    };
  }
}

describe("static Supabase artifact gate", () => {
  it("passes an empty migration directory because seed data is optional", () => {
    const root = fixtureRoot({});
    try {
      expect(runChecker(root)).toMatchObject({ status: 0 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects unordered and duplicate valid UTC migration timestamps", () => {
    const sql = "BEGIN;\nCOMMIT;\n";
    const root = fixtureRoot({
      "supabase/migrations/20260823091000_second.sql": sql,
      "supabase/migrations/20260823090000_first.sql": sql,
      "supabase/migrations/20260823090000_duplicate.sql": sql,
    });
    try {
      const result = runChecker(root);
      expect(result.status).not.toBe(0);
      expect(result.output).toMatch(/ordered|duplicate/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires transaction markers and RLS for every created public table", () => {
    const root = fixtureRoot({
      "supabase/migrations/20260823090000_missing.sql":
        "CREATE TABLE public.places (id uuid PRIMARY KEY);\n",
    });
    try {
      const result = runChecker(root);
      expect(result.status).not.toBe(0);
      expect(result.output).toMatch(/BEGIN|COMMIT|transaction|RLS/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("ignores transaction words and template-looking text in comments and dollar bodies", () => {
    const root = fixtureRoot({
      "supabase/migrations/20260823090000_function.sql": `BEGIN;
-- BEGIN COMMIT {{ignored}}
CREATE TABLE public.places (id uuid PRIMARY KEY);
ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.noop() RETURNS void
LANGUAGE plpgsql
AS $body$
BEGIN
  -- COMMIT {{also ignored}}
  RAISE NOTICE '{{body token ignored}}';
END;
$body$;
COMMIT;
`,
    });
    try {
      expect(runChecker(root)).toMatchObject({ status: 0 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects unresolved templates and raw secret assignments", () => {
    const root = fixtureRoot({
      "supabase/migrations/20260823090000_secret.sql": `BEGIN;
CREATE TABLE public.places (id uuid PRIMARY KEY);
ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;
SELECT '${"sk_live_12345678901234567890"}', '{{SUPABASE_SERVICE_ROLE_KEY}}';
COMMIT;
`,
    });
    try {
      const result = runChecker(root);
      expect(result.status).not.toBe(0);
      expect(result.output).toMatch(/secret|template|token|unresolved/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps the local config API schemas explicit and free of remote credentials", () => {
    const config = readFileSync(join(repoRoot, "supabase", "config.toml"), "utf8");
    expect(config).toMatch(/schemas\s*=\s*["']public,graphql_public["']/);
    expect(config).not.toMatch(/service_role|anon_key|project_ref|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY/i);
  });
});
