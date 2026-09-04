// @vitest-environment node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
  it("keeps LocalLens policies and definers independent from the restricted auth schema", () => {
    const migrations = readdirSync(join(repoRoot, "supabase", "migrations"))
      .filter((file) => file.endsWith(".sql"))
      .sort()
      .map((file) => readFileSync(join(repoRoot, "supabase", "migrations", file), "utf8"))
      .join("\n");

    expect(migrations).not.toMatch(/auth\.uid\(\)/i);
    expect(migrations).not.toMatch(/GRANT (?:USAGE ON SCHEMA auth|EXECUTE ON FUNCTION auth\.uid\(\)) TO localens_/i);
    expect(migrations).toMatch(/NULLIF\(pg_catalog\.current_setting\('request\.jwt\.claim\.sub', true\), ''\)::uuid/);
  });

  it("requires the Task 2 identity migration and deferred pgTAP artifact", () => {
    const required = [
      join(repoRoot, "supabase", "migrations", "20260823090000_extensions_enums.sql"),
      join(repoRoot, "supabase", "migrations", "20260823091000_identity_roles.sql"),
      join(repoRoot, "supabase", "tests", "database", "identity_roles_test.sql"),
    ];

    expect(required.every((path) => existsSync(path))).toBe(true);
  });

  it("requires the runtime portal identity RPC contract and generated type", () => {
    const migrationPath = join(repoRoot, "supabase", "migrations", "20260901140000_runtime_portal_identity.sql");
    const pgTapPath = join(repoRoot, "supabase", "tests", "database", "runtime_portal_identity_test.sql");
    const typesPath = join(repoRoot, "lib", "infrastructure", "supabase", "database.types.ts");

    expect(existsSync(migrationPath)).toBe(true);
    expect(existsSync(pgTapPath)).toBe(true);

    const migration = readFileSync(migrationPath, "utf8");
    const types = readFileSync(typesPath, "utf8");
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.get_portal_identity\(\)[\s\S]*RETURNS TABLE\s*\(\s*user_id uuid,\s*display_name text,\s*role public\.app_role,\s*language public\.locale\s*\)/i);
    expect(migration).toMatch(/SECURITY DEFINER[\s\S]*SET search_path\s*=\s*''/i);
    expect(migration).toMatch(/current_setting\('request\.jwt\.claim\.sub', true\)/i);
    expect(migration).toMatch(/RAISE EXCEPTION 'portal identity must have exactly one role' USING ERRCODE = '21000'/i);
    expect(migration).toMatch(/GRANT SELECT \(id, display_name, language\)\s+ON TABLE public\.profiles TO localens_identity_rpc_owner/i);
    expect(migration).toMatch(/GRANT CREATE ON SCHEMA public TO localens_identity_rpc_owner/i);
    expect(migration).toMatch(/ALTER FUNCTION public\.get_portal_identity\(\) OWNER TO localens_identity_rpc_owner[\s\S]*SET LOCAL ROLE localens_identity_rpc_owner[\s\S]*REVOKE ALL ON FUNCTION public\.get_portal_identity\(\) FROM PUBLIC, anon, authenticated[\s\S]*GRANT EXECUTE ON FUNCTION public\.get_portal_identity\(\) TO authenticated[\s\S]*RESET ROLE[\s\S]*REVOKE CREATE ON SCHEMA public FROM localens_identity_rpc_owner/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.get_portal_identity\(\) FROM PUBLIC, anon/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_portal_identity\(\) TO authenticated/i);
    expect(migration).not.toMatch(/raw_user_meta_data/i);
    expect(types).toMatch(/get_portal_identity:\s*\{\s*Args: never\s*Returns:\s*\{[\s\S]*?display_name: string[\s\S]*?language: Database\["public"\]\["Enums"\]\["locale"\][\s\S]*?role: Database\["public"\]\["Enums"\]\["app_role"\][\s\S]*?user_id: string[\s\S]*?\}\[\]\s*\}/);
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
    expect(identity).toMatch(/id uuid PRIMARY KEY REFERENCES auth\.users\(id\) ON DELETE CASCADE/i);
    expect(identity).toMatch(/user_id uuid PRIMARY KEY REFERENCES auth\.users\(id\) ON DELETE CASCADE/i);
    expect(identity).toMatch(/user_id uuid NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/i);

    expect(sql).toMatch(/CREATE TYPE public\.audit_target_type AS ENUM/i);
    for (const targetType of [
      "user", "trip_plan", "custom_request", "custom_quote", "checkout_attempt", "booking",
      "payment", "webhook_event", "guide_assignment", "content_release", "catalog_snapshot",
      "tour_version", "departure",
    ]) {
      expect(sql).toContain(`'${targetType}'`);
    }
    expect(identity).toMatch(/target_type public\.audit_target_type NOT NULL/i);
    expect(identity).toMatch(/target_id uuid NOT NULL/i);
    expect(identity).not.toMatch(/target_type text|target_id text/i);
    expect(identity).toMatch(/target_type,\s*\n\s*target_id,\s*[\s\S]*'user'(?:::public\.audit_target_type)?,\s*\n\s*target_user_id/i);

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
      const ownerDefinition = new RegExp(`CREATE ROLE ${owner} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS`, "i");
      expect(identity).toMatch(ownerDefinition);
      expect(identity).toMatch(new RegExp(`GRANT ${owner} TO postgres WITH SET TRUE, INHERIT FALSE`, "i"));
    }
    expect(identity).toMatch(/pg_roles[\s\S]*rolsuper[\s\S]*rolreplication[\s\S]*rolbypassrls[\s\S]*RAISE EXCEPTION/i);
    expect(identity).not.toMatch(/ALTER ROLE\s+localens_[a-z0-9_]+[\s\S]*?(?:NOSUPERUSER|NOREPLICATION|NOBYPASSRLS)/i);
    expect(identity).toMatch(/GRANT CREATE ON SCHEMA private TO localens_auth_trigger_owner, localens_identity_rpc_owner, localens_audit_guard_owner/i);
    expect(identity).toMatch(/GRANT CREATE ON SCHEMA public TO localens_admin_rpc_owner/i);
    expect(identity.indexOf("GRANT CREATE ON SCHEMA private")).toBeLessThan(identity.indexOf("ALTER FUNCTION"));
    expect(identity.lastIndexOf("REVOKE CREATE ON SCHEMA")).toBeGreaterThan(identity.lastIndexOf("ALTER FUNCTION"));
    expect(identity).not.toMatch(/ALTER FUNCTION [^;]+ OWNER TO (?:postgres|service_role)\s*;/i);
    expect(identity).toMatch(/REVOKE ALL ON SCHEMA public, private, auth FROM localens_auth_trigger_owner, localens_identity_rpc_owner, localens_admin_rpc_owner, localens_audit_guard_owner/i);
    expect(identity).not.toMatch(/GRANT\s+localens_[a-z0-9_]+\s+TO\s+(?:anon|authenticated|service_role)/i);
    expect(identity).not.toMatch(/GRANT (?:USAGE ON SCHEMA auth|EXECUTE ON FUNCTION auth\.uid\(\)) TO localens_/i);
    expect(identity).toMatch(/NULLIF\(pg_catalog\.current_setting\('request\.jwt\.claim\.sub', true\), ''\)::uuid/i);
    expect(identity).toMatch(/FROM private\.user_roles AS actor_roles[\s\S]*WHERE actor_roles\.user_id = actor_user_id[\s\S]*AND actor_roles\.role = 'admin'/i);

    expect(pgTap).toMatch(/INSERT INTO auth\.users[\s\S]*raw_user_meta_data/i);
    expect(pgTap).toMatch(/SELECT plan\(89\)/i);
    expect(pgTap).toMatch(/SET LOCAL ROLE authenticated/i);
    expect(pgTap).toMatch(/request\.jwt\.claim\.sub/i);
    expect(pgTap).toMatch(/UPDATE private\.audit_events/i);
    expect(pgTap).toMatch(/DELETE FROM private\.audit_events/i);
    expect(pgTap).toMatch(/TRUNCATE private\.audit_events/i);
    expect(pgTap).toMatch(/provision_role[\s\S]*self[- ]elevat/i);
    expect(pgTap).toMatch(/admin_user_summary[\s\S]*(?:admin JWT|non-admin|admin summary)/i);
    expect(pgTap).toMatch(/REVOKE INSERT ON TABLE public\.profiles, private\.user_roles FROM localens_auth_trigger_owner/i);
    expect(pgTap).toMatch(/signup rollback[\s\S]*auth row[\s\S]*profile[\s\S]*role/i);
    expect(pgTap).toMatch(/audit target rejects (?:IP|device|token|email|arbitrary)/i);
    expect(pgTap).toMatch(/audit actor FK restricts deletion/i);
    expect(pgTap).toMatch(/auth deletion cascades profile[\s\S]*auth deletion cascades guide profile[\s\S]*auth deletion cascades roles/i);
  });

  it("creates catalog owners with PostgreSQL 17-safe attributes and assignment access", () => {
    const migration = readFileSync(join(repoRoot, "supabase", "migrations", "20260823092000_catalog_snapshots.sql"), "utf8");

    for (const owner of ["localens_catalog_rpc_owner", "localens_catalog_guard_owner"]) {
      expect(migration).toMatch(new RegExp(`CREATE ROLE ${owner} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS`, "i"));
      expect(migration).toMatch(new RegExp(`GRANT ${owner} TO postgres WITH SET TRUE, INHERIT FALSE`, "i"));
    }
    expect(migration).not.toMatch(/ALTER ROLE\s+localens_catalog_[a-z0-9_]+[\s\S]*?(?:NOSUPERUSER|NOREPLICATION|NOBYPASSRLS)/i);
    expect(migration).toMatch(/GRANT CREATE ON SCHEMA private TO localens_catalog_rpc_owner, localens_catalog_guard_owner/i);
    expect(migration).toMatch(/REVOKE CREATE ON SCHEMA private FROM localens_catalog_rpc_owner, localens_catalog_guard_owner/i);
  });

  it("keeps EXTRACT as SQL syntax instead of schema-qualifying it like a function", () => {
    const migrationSql = [
      "20260823092000_catalog_snapshots.sql",
      "20260828120000_food_catalog_snapshots.sql",
    ].map((file) => readFileSync(join(repoRoot, "supabase", "migrations", file), "utf8")).join("\n");

    expect(migrationSql).not.toMatch(/pg_catalog\.extract\s*\(/i);
    expect(migrationSql).toMatch(/extract\s*\(epoch FROM/i);
  });

  it("balances temporary private-schema ownership access in travel and FX migration", () => {
    const migration = readFileSync(join(repoRoot, "supabase", "migrations", "20260823093000_travel_fx_snapshots.sql"), "utf8");
    expect(migration).toMatch(/GRANT CREATE ON SCHEMA private TO localens_catalog_rpc_owner, localens_catalog_guard_owner/i);
    expect(migration).toMatch(/REVOKE CREATE ON SCHEMA private FROM localens_catalog_rpc_owner, localens_catalog_guard_owner/i);
    expect(migration.indexOf("GRANT CREATE ON SCHEMA private")).toBeLessThan(migration.indexOf("ALTER FUNCTION"));
    expect(migration.indexOf("REVOKE CREATE ON SCHEMA private")).toBeGreaterThan(migration.lastIndexOf("ALTER FUNCTION"));
  });

  it("keeps Task 3B SQL identifiers within PostgreSQL's 63-byte limit and avoids trigger truncation collisions", () => {
    const migration = readFileSync(join(repoRoot, "supabase", "migrations", "20260828120000_food_catalog_snapshots.sql"), "utf8");
    const declarations = [
      ...migration.matchAll(/\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|POLICY|TRIGGER|(?:UNIQUE\s+)?INDEX|FUNCTION)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:public|private|auth)\.)?([a-z_][a-z0-9_]*)/gi),
      ...migration.matchAll(/\bCONSTRAINT\s+([a-z_][a-z0-9_]*)/gi),
    ].map((match) => match[1]);
    const overLimit = declarations.filter((name) => Buffer.byteLength(name, "utf8") > 63);
    expect(overLimit, "declarations must not rely on PostgreSQL identifier truncation").toEqual([]);

    const triggers = [...migration.matchAll(/\bCREATE\s+TRIGGER\s+([a-z_][a-z0-9_]*)[\s\S]*?\bON\s+((?:public|private)\.[a-z_][a-z0-9_]*)/gi)];
    const seen = new Map<string, string>();
    const collisions: string[] = [];
    for (const match of triggers) {
      const name = match[1];
      const table = match[2];
      const key = `${table}.${name.slice(0, 63)}`;
      const previous = seen.get(key);
      if (previous && previous !== name) collisions.push(`${table}: ${previous} vs ${name}`);
      seen.set(key, name);
    }
    expect(collisions, "trigger names must remain unique after PostgreSQL truncation").toEqual([]);
  });

  it("balances food snapshot owner privileges and replaces the catalog creator as its owner", () => {
    const migration = readFileSync(join(repoRoot, "supabase", "migrations", "20260828120000_food_catalog_snapshots.sql"), "utf8");
    expect(migration).toMatch(/BEGIN;[\s\S]*GRANT CREATE ON SCHEMA private TO localens_catalog_rpc_owner, localens_catalog_guard_owner/);
    expect(migration).toMatch(/GRANT CREATE ON SCHEMA public TO localens_catalog_rpc_owner/);
    expect(migration).toMatch(/SET LOCAL ROLE localens_catalog_rpc_owner;[\s\S]*CREATE OR REPLACE FUNCTION private\.create_catalog_snapshot\(\)[\s\S]*RESET ROLE/);
    expect(migration).not.toMatch(/RESET ROLE;\s*ALTER FUNCTION private\.create_catalog_snapshot/);
    expect(migration).toMatch(/GRANT SELECT ON public\.catalog_snapshot_food_items_v TO anon, authenticated;[\s\S]*REVOKE CREATE ON SCHEMA private FROM localens_catalog_rpc_owner, localens_catalog_guard_owner;[\s\S]*REVOKE CREATE ON SCHEMA public FROM localens_catalog_rpc_owner;[\s\S]*COMMIT/);
  });

  it("replaces Task 9 plan and quote artifacts as their existing PostgreSQL 17 owners", () => {
    const migration = readFileSync(join(repoRoot, "supabase", "migrations", "20260828123000_food_plan_quote_snapshots.sql"), "utf8");

    expect(migration).toMatch(/GRANT CREATE ON SCHEMA private TO localens_plan_rpc_owner, localens_request_guard_owner, localens_request_admin_rpc_owner/);
    expect(migration).toMatch(/GRANT CREATE ON SCHEMA public TO localens_request_admin_rpc_owner, localens_request_customer_rpc_owner/);
    expect(migration).toMatch(/GRANT USAGE ON SCHEMA private TO localens_request_guard_owner/);
    expect(migration).toMatch(/SET LOCAL ROLE localens_plan_rpc_owner;[\s\S]*ALTER FUNCTION private\.validate_trip_plan_revision_dto\(jsonb\)[\s\S]*CREATE OR REPLACE FUNCTION private\.persist_trip_plan_revision[\s\S]*RESET ROLE;/);
    expect(migration).toMatch(/SET LOCAL ROLE localens_request_guard_owner;[\s\S]*CREATE OR REPLACE FUNCTION private\.reject_custom_quote_mutation\(\)[\s\S]*RESET ROLE;/);
    expect(migration).toMatch(/SET LOCAL ROLE localens_request_admin_rpc_owner;[\s\S]*CREATE OR REPLACE FUNCTION private\.create_custom_quote[\s\S]*CREATE OR REPLACE FUNCTION public\.create_custom_quote[\s\S]*RESET ROLE;/);
    expect(migration).toMatch(/SET LOCAL ROLE localens_request_customer_rpc_owner;[\s\S]*CREATE OR REPLACE VIEW public\.customer_custom_quotes_v[\s\S]*RESET ROLE;/);
    expect(migration).not.toMatch(/auth\.uid\(\)/);
    expect(migration.match(/NULLIF\(pg_catalog\.current_setting\('request\.jwt\.claim\.sub', true\), ''\)::uuid/g)).toHaveLength(2);
    expect(migration).toMatch(/SET LOCAL ROLE localens_plan_rpc_owner;[\s\S]*ALTER FUNCTION private\.validate_food_plan_revision_dto\(jsonb\) OWNER TO localens_plan_rpc_owner;[\s\S]*RESET ROLE;/);
    expect(migration).toMatch(/REVOKE CREATE ON SCHEMA private FROM localens_plan_rpc_owner, localens_request_guard_owner, localens_request_admin_rpc_owner;[\s\S]*REVOKE CREATE ON SCHEMA public FROM localens_request_admin_rpc_owner, localens_request_customer_rpc_owner;[\s\S]*COMMIT;/);
    expect(migration).toMatch(/REVOKE USAGE ON SCHEMA private FROM localens_request_guard_owner;[\s\S]*COMMIT;/);
  });

  it("requires Task 3C published food projection views to expose immutable dense rows", () => {
    const migration = readFileSync(join(repoRoot, "supabase", "migrations", "20260828120000_food_catalog_snapshots.sql"), "utf8");
    const pgTap = readFileSync(join(repoRoot, "supabase", "tests", "database", "food_catalog_test.sql"), "utf8");
    const viewNames = [
      "public.catalog_snapshot_food_vendors_v",
      "public.catalog_snapshot_food_items_v",
    ];
    for (const viewName of viewNames) {
      const unqualified = viewName.slice("public.".length);
      expect(migration).toMatch(new RegExp(`CREATE OR REPLACE VIEW ${viewName.replaceAll(".", "\\.")}\\s+WITH \\(`, "i"));
      expect(migration).toMatch(new RegExp(`${unqualified}\\s+WITH \\(security_invoker = false, security_barrier = true\\)`, "i"));
      expect(migration).toMatch(new RegExp(`ALTER VIEW ${viewName.replaceAll(".", "\\.")} OWNER TO localens_catalog_rpc_owner`, "i"));
      expect(migration).toMatch(new RegExp(`REVOKE ALL ON ${viewName.replaceAll(".", "\\.")} FROM PUBLIC, anon, authenticated`, "i"));
      expect(migration).toMatch(new RegExp(`GRANT SELECT ON ${viewName.replaceAll(".", "\\.")} TO anon, authenticated`, "i"));
    }

    const projectionSql = migration.slice(migration.indexOf("CREATE OR REPLACE VIEW public.catalog_snapshot_food_vendors_v"));
    expect(projectionSql).not.toMatch(/public\.food_(?:vendors|items|vendor_|item_)/i);
    expect(projectionSql).toMatch(/JOIN public\.catalog_snapshots AS s ON s\.id = [a-z]+\.snapshot_id[\s\S]*?WHERE s\.status = 'published'::public\.snapshot_status/gi);
    for (const field of [
      "snapshot_id", "place_id", "vendor_id", "item_id", "slug", "title", "description",
      "location_note", "service_type", "capacity_note", "dietary_support", "mobility_support",
      "opening_hours", "opening_exceptions", "serving_unit", "price_vnd_min", "price_vnd_max",
      "portion_description", "allergens", "available", "verified_at", "status",
    ]) {
      expect(projectionSql).toMatch(new RegExp(`\\b${field}\\b`, "i"));
    }
    expect(projectionSql).toMatch(/price_vnd_min::text/i);
    expect(projectionSql).toMatch(/price_vnd_max::text/i);
    expect(projectionSql).toMatch(/COALESCE\([\s\S]*'\[\]'::jsonb/i);
    expect(projectionSql).toMatch(/COALESCE\([\s\S]*'\{\}'::jsonb/i);
    expect(pgTap).toMatch(/Task 3C[\s\S]*catalog_snapshot_food_vendors_v/i);
    expect(pgTap).toMatch(/catalog_snapshot_food_items_v[\s\S]*decimal/i);
  });

  it("correlates vendor opening hours before closing the JSON aggregate", () => {
    const migration = readFileSync(join(repoRoot, "supabase", "migrations", "20260828120000_food_catalog_snapshots.sql"), "utf8");
    const vendorProjection = migration.slice(
      migration.indexOf("CREATE OR REPLACE VIEW public.catalog_snapshot_food_vendors_v"),
      migration.indexOf("CREATE OR REPLACE VIEW public.catalog_snapshot_food_items_v"),
    );

    expect(vendorProjection).toMatch(/SELECT jsonb_agg\(jsonb_build_object\([\s\S]*?ORDER BY h\.weekday, h\.opens_at, h\.closes_at, h\.opening_id\)[\s\S]*?FROM public\.catalog_snapshot_food_vendor_opening_hours AS h[\s\S]*?WHERE h\.snapshot_id = v\.snapshot_id[\s\S]*?AND h\.vendor_id = v\.vendor_id[\s\S]*?\), '\[\]'::jsonb\) AS opening_hours/i);
  });

  it("guards a published vendor when its food item loses availability, status, owner, or row", () => {
    const migration = readFileSync(join(repoRoot, "supabase", "migrations", "20260828120000_food_catalog_snapshots.sql"), "utf8");
    const pgTap = readFileSync(join(repoRoot, "supabase", "tests", "database", "food_catalog_test.sql"), "utf8");
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION private\.assert_published_food_item_vendor_row\(\)[\s\S]*?OLD\.food_vendor_id[\s\S]*?NEW\.food_vendor_id[\s\S]*?private\.assert_published_food_vendor_complete\(old_vendor_id\)[\s\S]*?private\.assert_published_food_vendor_complete\(new_vendor_id\)/i);
    expect(migration).toMatch(/CREATE TRIGGER food_items_vendor_completeness\s+AFTER INSERT OR UPDATE OR DELETE ON public\.food_items/i);
    expect(migration).toMatch(/food_item_translations_published_completeness AFTER INSERT OR UPDATE OR DELETE/i);
    expect(migration).toMatch(/food_item_supports_published_completeness AFTER INSERT OR UPDATE OR DELETE/i);
    expect(pgTap).toMatch(/UPDATE public\.food_items SET available = false/i);
    expect(pgTap).toMatch(/UPDATE public\.food_items SET status = 'draft'/i);
    expect(pgTap).toMatch(/UPDATE public\.food_items SET food_vendor_id =/i);
    expect(pgTap).toMatch(/DELETE FROM public\.food_items/i);
    const plan = pgTap.match(/^SELECT\s+plan\((\d+)\);$/im);
    const executableAssertions = pgTap.match(/^SELECT\s+(?:extensions\.)?(?:ok|is|isnt|like|unlike|pass|throws_ok|lives_ok|has_table_privilege|has_function_privilege)\s*\(/gm) ?? [];
    expect(plan, "food pgTAP must declare an executable assertion plan").not.toBeNull();
    expect(Number(plan?.[1]), "food pgTAP plan must match executable assertion count").toBe(executableAssertions.length);
  });

  it("keeps draft food prices explicitly unknown and requires known prices for publication", () => {
    const migration = readFileSync(join(repoRoot, "supabase", "migrations", "20260828120000_food_catalog_snapshots.sql"), "utf8");
    const pgTap = readFileSync(join(repoRoot, "supabase", "tests", "database", "food_catalog_test.sql"), "utf8");
    expect(migration).not.toMatch(/CREATE TABLE public\.food_items[\s\S]*?price_vnd_min bigint NOT NULL DEFAULT 0/i);
    expect(migration).toMatch(/CONSTRAINT food_items_price_pair_check CHECK \([\s\S]*?price_vnd_min IS NULL[\s\S]*?price_vnd_max IS NULL[\s\S]*?price_vnd_min IS NOT NULL[\s\S]*?price_vnd_max IS NOT NULL/i);
    expect(migration).toMatch(/item_row\.price_vnd_min IS NULL[\s\S]*?item_row\.price_vnd_max IS NULL/i);
    expect(pgTap).toMatch(/draft price omission stores NULL/i);
    expect(pgTap).toMatch(/draft item with unknown prices cannot publish/i);
    expect(pgTap).toMatch(/'23514', 'published food item serving or price evidence is incomplete', 'draft item with unknown prices cannot publish'/i);
    expect(pgTap).toMatch(/'unknown-price-dish'[\s\S]*?https:\/\/example\.invalid\/unknown-price-item[\s\S]*?Synthetic fixture/i);
    expect(pgTap).toMatch(/food_item_translations[\s\S]*?00000000-0000-0000-0000-000000000406[\s\S]*?'en'[\s\S]*?00000000-0000-0000-0000-000000000406[\s\S]*?'vi'/i);
    expect(pgTap).toMatch(/food_item_supports[\s\S]*?00000000-0000-0000-0000-000000000406[\s\S]*?'dietary'[\s\S]*?00000000-0000-0000-0000-000000000406[\s\S]*?'allergen'/i);
    expect(pgTap).toMatch(/explicit zero prices publish with complete evidence/i);
    expect(pgTap).toMatch(/'zero-price-dish',\s*'draft',\s*'portion',\s*0,\s*0,\s*'Complimentary portion',\s*false,/i);
    expect(pgTap).toMatch(/'23503'::character\(5\), NULL::text, 'food item delete is blocked by restrictive child foreign keys'::text/i);
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

  it("requires the authenticated AI runtime migration and rollback-only pgTAP contract", () => {
    const migrationPath = join(
      repoRoot,
      "supabase",
      "migrations",
      "20260904120000_authenticated_ai_runtime.sql",
    );
    const pgTapPath = join(
      repoRoot,
      "supabase",
      "tests",
      "database",
      "authenticated_ai_runtime_test.sql",
    );

    expect(existsSync(migrationPath)).toBe(true);
    expect(existsSync(pgTapPath)).toBe(true);

    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toMatch(/CREATE OR REPLACE VIEW public\.current_itinerary_snapshot_v\s+WITH \(security_invoker = false, security_barrier = true\)/i);
    expect(migration).toMatch(/CREATE OR REPLACE VIEW public\.catalog_snapshot_areas_v\s+WITH \(security_invoker = false, security_barrier = true\)/i);
    expect(migration).toMatch(/CREATE OR REPLACE VIEW public\.catalog_snapshot_place_display_v\s+WITH \(security_invoker = false, security_barrier = true\)/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.create_authenticated_trip_plan\([\s\S]*?pg_advisory_xact_lock[\s\S]*?private\.persist_trip_plan_revision/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.reserve_ai_quota\([\s\S]*?private\.reserve_quota/i);
    expect(migration).not.toMatch(/GEMINI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|AIza[0-9A-Za-z_-]{20,}/i);

    const pgTap = readFileSync(pgTapPath, "utf8");
    expect(pgTap).toMatch(/SELECT plan\(49\)/);
    expect(pgTap).toMatch(/sixth Gemini reservation is rejected/i);
    expect(pgTap).toMatch(/failed validation rolls back the empty plan row/i);
  });

  it("keeps the local config API schemas explicit and free of remote credentials", () => {
    const config = readFileSync(join(repoRoot, "supabase", "config.toml"), "utf8");
    expect(config).toMatch(/schemas\s*=\s*\[\s*["']public["']\s*,\s*["']graphql_public["']\s*\]/);
    expect(config).not.toMatch(/schemas\s*=\s*["']public,graphql_public["']/);
    expect(config).not.toMatch(/service_role|anon_key|project_ref|project_id|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|remote/i);
  });

  it("ships authenticated recommend and refine Edge Function entrypoints with pinned imports", () => {
    const functions = ["recommend-itinerary", "refine-itinerary"];
    const expectedImports = {
      "@/": "../../../",
      "@supabase/supabase-js": "npm:@supabase/supabase-js@2.112.3",
      zod: "npm:zod@4.4.3",
    };

    for (const functionName of functions) {
      const directory = join(repoRoot, "supabase", "functions", functionName);
      const indexPath = join(directory, "index.ts");
      const denoPath = join(directory, "deno.json");
      expect(existsSync(indexPath)).toBe(true);
      expect(existsSync(denoPath)).toBe(true);

      const source = readFileSync(indexPath, "utf8");
      expect(source).toMatch(/Deno\.serve\s*\(/);
      expect(source).toMatch(/parseItineraryEdgeEnv\s*\(\s*Deno\.env\.toObject\(\)\s*\)/);
      expect(source).toMatch(new RegExp(`createSupabase${functionName === "recommend-itinerary" ? "Recommend" : "Refine"}Adapter\\s*\\([^;]*request`));
      expect(source).toMatch(/function unavailableResponse\(\)[\s\S]*errorResponse\s*\(/);
      expect(source).toMatch(/catch\s*\{\s*return unavailableResponse\(\);\s*\}/);
      expect(source).not.toMatch(/error\.message|String\s*\(\s*error\s*\)|console\.(?:log|error)/);

      const deno = JSON.parse(readFileSync(denoPath, "utf8")) as {
        imports?: Record<string, string>;
        unstable?: unknown;
      };
      expect(deno.imports).toMatchObject(expectedImports);
      expect(deno.imports).toMatchObject({
        "@/supabase/functions/_shared/edge-env": "../../../supabase/functions/_shared/edge-env.ts",
        "@/supabase/functions/_shared/gateway": "../../../supabase/functions/_shared/gateway.ts",
        "@/supabase/functions/_shared/itinerary-wire-response": "../../../supabase/functions/_shared/itinerary-wire-response.ts",
        "@/supabase/functions/_shared/supabase-itinerary-adapter": "../../../supabase/functions/_shared/supabase-itinerary-adapter.ts",
        "@/lib/domain/itinerary/contracts": "../../../lib/domain/itinerary/contracts.ts",
      });
      expect(Object.entries(deno.imports ?? {})
        .filter(([specifier]) => specifier.startsWith("@/") && specifier !== "@/")
        .every(([, target]) => target.endsWith(".ts"))).toBe(true);
      expect(deno.unstable).toBeUndefined();
    }

    const recommend = readFileSync(
      join(repoRoot, "supabase", "functions", "recommend-itinerary", "index.ts"),
      "utf8",
    );
    expect(recommend).toMatch(/createRecommendItineraryHandler\([\s\S]*requireAuthenticated:\s*true/);

    const config = readFileSync(join(repoRoot, "supabase", "config.toml"), "utf8");
    expect(config).toMatch(/\[functions\.recommend-itinerary\]\s*verify_jwt\s*=\s*true/);
    expect(config).toMatch(/\[functions\.refine-itinerary\]\s*verify_jwt\s*=\s*true/);
  });
});
