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

  it("sorts valid migration timestamps deterministically and rejects invalid names", () => {
    const sql = "BEGIN;\nCREATE TABLE public.a (id uuid PRIMARY KEY);\nALTER TABLE public.a ENABLE ROW LEVEL SECURITY;\nCOMMIT;\n";
    const root = fixtureRoot({
      "supabase/migrations/20260823091000_later.sql": sql,
      "supabase/migrations/20260823090000_earlier.sql": sql.replaceAll("public.a", "public.b"),
      "supabase/migrations/not-a-timestamp.sql": sql,
      "supabase/migrations/20260230090000_invalid-date.sql": sql,
    });
    try {
      const result = runChecker(root);
      expect(result.status).not.toBe(0);
      expect(result.output).toMatch(/timestamp|valid UTC/i);
      expect(result.output.indexOf("not-a-timestamp")).toBeLessThan(result.output.indexOf("invalid-date"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires standalone first BEGIN and last COMMIT wrapper statements", () => {
    const base = "CREATE TABLE public.places (id uuid PRIMARY KEY);\nALTER TABLE public.places ENABLE ROW LEVEL SECURITY;\n";
    const fixtures = [
      `SELECT 'BEGIN';\n${base}SELECT 'COMMIT';\n`,
      `BEGIN;\n${base}COMMIT;\nSELECT 1;\n`,
      `SELECT 1;\nBEGIN;\n${base}COMMIT;\n`,
      `BEGIN;\n${base}COMMIT;\nBEGIN;\n`,
    ];
    for (const [index, sql] of fixtures.entries()) {
      const root = fixtureRoot({ [`supabase/migrations/2026082309${String(index).padStart(4, "0")}_wrapper.sql`]: sql });
      try {
        const result = runChecker(root);
        expect(result.status).not.toBe(0);
        expect(result.output).toMatch(/wrapper|BEGIN|COMMIT/i);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
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

  it("does not let near-match schemas or table names bypass the RLS declaration", () => {
    const root = fixtureRoot({
      "supabase/migrations/20260823090000_rls-near-match.sql": `BEGIN;
CREATE TABLE public.places_shadow (id uuid PRIMARY KEY);
ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;
CREATE TABLE publicity.places (id uuid PRIMARY KEY);
COMMIT;
`,
    });
    try {
      const result = runChecker(root);
      expect(result.status).not.toBe(0);
      expect(result.output).toMatch(/places_shadow.*(?:RLS|ROW LEVEL SECURITY)|(?:RLS|ROW LEVEL SECURITY).*places_shadow/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not let SQL-looking text inside a quoted identifier spoof RLS", () => {
    const root = fixtureRoot({
      "supabase/migrations/20260823090000_quoted-spoof.sql": `BEGIN;
CREATE TABLE public.actual (
  "ALTER TABLE public.actual ENABLE ROW LEVEL SECURITY" text
);
COMMIT;
`,
    });
    try {
      const result = runChecker(root);
      expect(result.status).not.toBe(0);
      expect(result.output).toMatch(/actual.*ROW LEVEL SECURITY|ROW LEVEL SECURITY.*actual/i);
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
  RAISE NOTICE 'body token is deliberately absent';
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

  it("lexes escaped strings, nested comments, quoted identifiers, and body tokens safely", () => {
    const root = fixtureRoot({
      "supabase/migrations/20260823090000_lexer.sql": `BEGIN;
/* outer fake BEGIN /* nested fake COMMIT {{ignored}} */ still comment */
CREATE TABLE "public"."places" ("id" uuid PRIMARY KEY);
ALTER TABLE "public"."places" ENABLE ROW LEVEL SECURITY;
SELECT E'fake \\'BEGIN\\' and ''COMMIT''';
CREATE FUNCTION public.noop() RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE NOTICE 'inside body';
END;
$fn$;
COMMIT;
`,
    });
    try {
      expect(runChecker(root)).toMatchObject({ status: 0 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("inspects string and dollar-body secrets/templates but ignores comments", () => {
    const base = "CREATE TABLE public.places (id uuid PRIMARY KEY);\nALTER TABLE public.places ENABLE ROW LEVEL SECURITY;\n";
    const sources = [
      `BEGIN;\n-- sk_live_12345678901234567890 {{COMMENT_TOKEN}}\n${base}COMMIT;\n`,
      `BEGIN;\n${base}SELECT E'sk_live_12345678901234567890';\nCOMMIT;\n`,
      `BEGIN;\n${base}CREATE FUNCTION public.noop() RETURNS void LANGUAGE plpgsql AS $fn$ BEGIN RAISE NOTICE '{{BODY_TOKEN}}'; END; $fn$;\nCOMMIT;\n`,
      `BEGIN;\n${base}SELECT SUPABASE_SERVICE_ROLE_KEY = 'secret';\nCOMMIT;\n`,
    ];
    const commentRoot = fixtureRoot({ "supabase/migrations/20260823090000_comment.sql": sources[0] });
    try {
      expect(runChecker(commentRoot)).toMatchObject({ status: 0 });
    } finally {
      rmSync(commentRoot, { recursive: true, force: true });
    }
    for (const [index, source] of sources.slice(1).entries()) {
      const root = fixtureRoot({ [`supabase/migrations/2026082309000${index + 1}_secret.sql`]: source });
      try {
        const result = runChecker(root);
        expect(result.status).not.toBe(0);
        expect(result.output).toMatch(/secret|template/i);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it("rejects unterminated strings, comments, identifiers, and dollar bodies", () => {
    const snippets = ["BEGIN; SELECT 'unterminated; COMMIT;", "BEGIN; /* unterminated\nCOMMIT;", "BEGIN; SELECT \"unterminated; COMMIT;", "BEGIN; SELECT $fn$ body; COMMIT;"];
    for (const [index, snippet] of snippets.entries()) {
      const root = fixtureRoot({ [`supabase/migrations/2026082309000${index}_unterminated.sql`]: snippet });
      try {
        const result = runChecker(root);
        expect(result.status).not.toBe(0);
        expect(result.output).toMatch(/unterminated|BEGIN|COMMIT/i);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it("rejects malformed nested dollar-body constructs instead of masking them", () => {
    const snippets = [
      "BEGIN; CREATE FUNCTION public.bad() RETURNS void LANGUAGE plpgsql AS $fn$ /* unterminated sk_live_12345678901234567890 $fn$; COMMIT;",
      "BEGIN; CREATE FUNCTION public.bad() RETURNS void LANGUAGE plpgsql AS $fn$ SELECT E'unterminated sk_live_12345678901234567890 $fn$; COMMIT;",
    ];
    for (const [index, snippet] of snippets.entries()) {
      const root = fixtureRoot({ [`supabase/migrations/2026082309000${index}_nested-bad.sql`]: snippet });
      try {
        const result = runChecker(root);
        expect(result.status).not.toBe(0);
        expect(result.output).toMatch(/unterminated|secret|lexer/i);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
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
    expect(config).toMatch(/schemas\s*=\s*\[\s*["']public["']\s*,\s*["']graphql_public["']\s*\]/);
    expect(config).not.toMatch(/schemas\s*=\s*["']public,graphql_public["']/);
    expect(config).not.toMatch(/service_role|anon_key|project_ref|project_id|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|remote/i);
  });
});
