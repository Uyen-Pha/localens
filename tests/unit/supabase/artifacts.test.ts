// @vitest-environment node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  it("requires the Task 2 identity migration and deferred pgTAP artifact", () => {
    const required = [
      join(repoRoot, "supabase", "migrations", "20260823090000_extensions_enums.sql"),
      join(repoRoot, "supabase", "migrations", "20260823091000_identity_roles.sql"),
      join(repoRoot, "supabase", "tests", "database", "identity_roles_test.sql"),
    ];

    expect(required.every((path) => existsSync(path))).toBe(true);
  });

  it("enforces the identity SQL security contract instead of accepting marker-only migrations", () => {
    const extensionsPath = join(repoRoot, "supabase", "migrations", "20260823090000_extensions_enums.sql");
    const identityPath = join(repoRoot, "supabase", "migrations", "20260823091000_identity_roles.sql");
    if (!existsSync(extensionsPath) || !existsSync(identityPath)) return;

    const extensions = readFileSync(extensionsPath, "utf8");
    const identity = readFileSync(identityPath, "utf8");
    const sql = `${extensions}\n${identity}`;
    expect(runChecker(repoRoot)).toMatchObject({ status: 0 });
    const auditEventTypes = [
      "role_provisioned", "role_revoked", "plan_claimed", "request_submitted",
      "request_changes_requested", "request_approved", "request_rejected", "quote_created",
      "quote_checkout_started", "quote_accepted", "quote_reactivated", "quote_expired", "quote_revoked",
      "checkout_started", "checkout_session_recorded", "checkout_compensated", "booking_status_changed",
      "webhook_processed", "webhook_ignored", "webhook_failed", "webhook_conflict", "payment_reconciled",
      "guide_assigned", "guide_reassigned", "guide_accepted", "guide_completed", "content_publish_started",
      "content_published", "content_publish_failed",
    ];

    expect(sql).toMatch(/CREATE SCHEMA IF NOT EXISTS private/i);
    expect(sql).toMatch(/REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated/i);
    for (const value of auditEventTypes) expect(sql).toContain(`'${value}'`);

    expect(identity).toMatch(/CREATE TABLE private\.user_roles[\s\S]*UNIQUE\s*\(user_id,\s*role\)/i);
    expect(identity).toMatch(/ON CONFLICT\s*\(user_id,\s*role\)\s+DO NOTHING/i);
    expect(identity).toMatch(/CREATE OR REPLACE FUNCTION private\.handle_new_auth_user\(\)[\s\S]*SECURITY DEFINER[\s\S]*SET search_path\s*=\s*''/i);
    expect(identity).toMatch(/CREATE OR REPLACE FUNCTION private\.provision_role\([\s\S]*SECURITY DEFINER[\s\S]*SET search_path\s*=\s*''/i);
    expect(identity).toMatch(/CREATE OR REPLACE FUNCTION public\.admin_user_summary\(\)[\s\S]*SECURITY DEFINER[\s\S]*SET search_path\s*=\s*''/i);
    expect(identity).not.toMatch(/raw_user_meta_data/i);
    expect(identity).toMatch(/ALTER TABLE public\.profiles ENABLE ROW LEVEL SECURITY[\s\S]*ALTER TABLE public\.profiles FORCE ROW LEVEL SECURITY/i);
    expect(identity).toMatch(/ALTER TABLE public\.guide_profiles ENABLE ROW LEVEL SECURITY[\s\S]*ALTER TABLE public\.guide_profiles FORCE ROW LEVEL SECURITY/i);
    expect(identity).toMatch(/ALTER TABLE private\.user_roles ENABLE ROW LEVEL SECURITY[\s\S]*ALTER TABLE private\.user_roles FORCE ROW LEVEL SECURITY/i);
    expect(identity).toMatch(/ALTER TABLE private\.audit_events ENABLE ROW LEVEL SECURITY[\s\S]*ALTER TABLE private\.audit_events FORCE ROW LEVEL SECURITY/i);
    expect(identity).toMatch(/NOLOGIN[\s\S]*NOBYPASSRLS/i);
    expect(identity).toMatch(/ALTER FUNCTION private\.handle_new_auth_user\(\) OWNER TO localens_[a-z_]+/i);
    expect(identity).toMatch(/ALTER FUNCTION private\.provision_role\(uuid, public\.app_role\) OWNER TO localens_[a-z_]+/i);
    expect(identity).toMatch(/ALTER FUNCTION public\.admin_user_summary\(\) OWNER TO localens_[a-z_]+/i);
    expect(identity).toMatch(/REVOKE ALL ON FUNCTION private\.handle_new_auth_user\(\) FROM PUBLIC, anon, authenticated/i);
    expect(identity).toMatch(/REVOKE ALL ON FUNCTION private\.provision_role\(uuid, public\.app_role\) FROM PUBLIC, anon, authenticated/i);
    expect(identity).toMatch(/REVOKE ALL ON FUNCTION public\.admin_user_summary\(\) FROM PUBLIC, anon/i);
    expect(identity).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_user_summary\(\) TO authenticated/i);
    expect(identity).not.toMatch(/GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE|REFERENCES|TRIGGER|USAGE)\s+ON\s+SCHEMA\s+private\s+TO\s+(?:PUBLIC|anon|authenticated)\s*;/i);
    expect(identity).not.toMatch(/GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE|REFERENCES|TRIGGER|USAGE)\s+ON\s+(?:TABLE|SEQUENCE|FUNCTION)\s+private\.[^;]+\s+TO\s+(?:PUBLIC|anon|authenticated)\s*;/i);
    expect(identity).not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+(?!public\.admin_user_summary\(\))[^;]+\s+TO\s+(?:PUBLIC|anon|authenticated)\s*;/i);
  });

  it("requires executable FORCE-RLS owner paths, exhaustive audit domains, and truncate protection", () => {
    const extensionsPath = join(repoRoot, "supabase", "migrations", "20260823090000_extensions_enums.sql");
    const identityPath = join(repoRoot, "supabase", "migrations", "20260823091000_identity_roles.sql");
    const pgTapPath = join(repoRoot, "supabase", "tests", "database", "identity_roles_test.sql");
    if (!existsSync(extensionsPath) || !existsSync(identityPath) || !existsSync(pgTapPath)) return;

    const extensions = readFileSync(extensionsPath, "utf8");
    const identity = readFileSync(identityPath, "utf8");
    const pgTap = readFileSync(pgTapPath, "utf8");
    const sql = `${extensions}\n${identity}`;
    const ownerRoles = [
      "localens_auth_trigger_owner",
      "localens_identity_rpc_owner",
      "localens_admin_rpc_owner",
      "localens_audit_guard_owner",
    ];

    expect(identity).toMatch(/GRANT SELECT, INSERT ON TABLE public\.profiles TO localens_auth_trigger_owner/i);
    expect(identity).toMatch(/GRANT SELECT, INSERT ON TABLE private\.user_roles TO localens_auth_trigger_owner/i);
    expect(identity).toMatch(/GRANT SELECT ON TABLE public\.profiles, public\.guide_profiles TO authenticated/i);
    expect(identity).toMatch(/CREATE POLICY profiles_auth_trigger_select ON public\.profiles[\s\S]*FOR SELECT TO localens_auth_trigger_owner/i);
    expect(identity).toMatch(/CREATE POLICY user_roles_auth_trigger_select ON private\.user_roles[\s\S]*FOR SELECT TO localens_auth_trigger_owner/i);
    expect(identity).toMatch(/actor_user_id uuid REFERENCES auth\.users\(id\) ON DELETE RESTRICT/i);

    expect(sql).toMatch(/CREATE TYPE public\.audit_metadata_key AS ENUM/i);
    for (const key of ["role", "source", "status", "state", "decision", "provider", "currency", "count", "revision", "attempt_no", "amount_minor", "replayed", "is_demo"]) {
      expect(sql).toContain(`'${key}'`);
    }
    expect(identity).toMatch(/metadata_key public\.audit_metadata_key/i);
    expect(identity).toMatch(/metadata_key\s*=\s*'role'[\s\S]*metadata_text\s+IN\s*\('customer',\s*'guide',\s*'admin'\)/i);
    expect(identity).toMatch(/metadata_key\s+IN\s*\('count'(?:::public\.audit_metadata_key)?,\s*'revision'(?:::public\.audit_metadata_key)?,\s*'attempt_no'(?:::public\.audit_metadata_key)?,\s*'amount_minor'(?:::public\.audit_metadata_key)?\)[\s\S]*metadata_number[\s\S]*(?:9007199254740991|trunc)/i);
    expect(identity).toMatch(/metadata_key\s+IN\s*\('replayed'(?:::public\.audit_metadata_key)?,\s*'is_demo'(?:::public\.audit_metadata_key)?\)[\s\S]*metadata_boolean/i);
    expect(identity).toMatch(/CREATE TRIGGER audit_events_append_only_truncate[\s\S]*BEFORE TRUNCATE ON private\.audit_events/i);
    expect(identity).toMatch(/REVOKE TRUNCATE ON TABLE private\.audit_events FROM PUBLIC, anon, authenticated/i);

    for (const owner of ownerRoles) {
      const ownerDefinition = new RegExp(`ALTER ROLE ${owner} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS`, "i");
      expect(identity).toMatch(ownerDefinition);
    }
    expect(identity).not.toMatch(/ALTER FUNCTION [^;]+ OWNER TO (?:postgres|service_role)\s*;/i);
    expect(identity).toMatch(/REVOKE ALL ON SCHEMA public, private, auth FROM localens_auth_trigger_owner, localens_identity_rpc_owner, localens_admin_rpc_owner, localens_audit_guard_owner/i);
    expect(identity).toMatch(/pg_auth_members[\s\S]*REVOKE/i);
    expect(identity).toMatch(/GRANT EXECUTE ON FUNCTION auth\.uid\(\) TO localens_identity_rpc_owner, localens_admin_rpc_owner/i);

    expect(pgTap).toMatch(/INSERT INTO auth\.users[\s\S]*raw_user_meta_data/i);
    expect(pgTap).toMatch(/SET LOCAL ROLE authenticated/i);
    expect(pgTap).toMatch(/request\.jwt\.claim\.sub/i);
    expect(pgTap).toMatch(/UPDATE private\.audit_events/i);
    expect(pgTap).toMatch(/DELETE FROM private\.audit_events/i);
    expect(pgTap).toMatch(/TRUNCATE private\.audit_events/i);
    expect(pgTap).toMatch(/provision_role[\s\S]*self[- ]elevat/i);
    expect(pgTap).toMatch(/admin_user_summary[\s\S]*(?:admin JWT|non-admin|admin summary)/i);
  });

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
