// @vitest-environment node

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const matrixPath = join(repoRoot, "docs", "security", "data-access-matrix.json");
const markdownPath = join(repoRoot, "docs", "security", "data-access-matrix.md");

function copyTree(source: string, target: string): void {
  if (statSync(source).isDirectory()) {
    mkdirSync(target, { recursive: true });
    for (const entry of readdirSync(source)) copyTree(join(source, entry), join(target, entry));
  } else {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(source));
  }
}

function checkerFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "localens-task13-checker-"));
  copyTree(join(repoRoot, "supabase"), join(root, "supabase"));
  copyTree(join(repoRoot, "docs", "security"), join(root, "docs", "security"));
  copyTree(join(repoRoot, "scripts", "check-supabase-artifacts.mjs"), join(root, "scripts", "check-supabase-artifacts.mjs"));
  copyTree(join(repoRoot, "scripts", "generate-data-access-matrix.mjs"), join(root, "scripts", "generate-data-access-matrix.mjs"));
  return root;
}

function checkerFailure(root: string): string {
  try {
    execFileSync(process.execPath, [join(root, "scripts", "check-supabase-artifacts.mjs"), "--root", root], { encoding: "utf8", stdio: "pipe" });
    return "";
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return `${failure.stdout ?? ""}${failure.stderr ?? ""}`;
  }
}

describe("Task 13 RLS/RPC access matrix", () => {
  it("passes the final SQL/object/policy/signature/grant drift gate", () => {
    expect(() => execFileSync(process.execPath, [join(repoRoot, "scripts", "check-supabase-artifacts.mjs"), "--root", repoRoot], { encoding: "utf8" })).not.toThrow();
  });

  it("serializes review locks with the existing food writer namespace and order", () => {
    const migration = readFileSync(join(repoRoot, "supabase", "migrations", "20260831100000_food_catalog_review.sql"), "utf8");
    expect(migration).not.toContain("localens:food-review:");
    expect(migration).toMatch(/localens:food-vendor:/);
    expect(migration).toMatch(/localens:food-item:/);
    const vendorLock = migration.indexOf("localens:food-vendor:");
    const itemLock = migration.indexOf("localens:food-item:");
    expect(vendorLock).toBeGreaterThanOrEqual(0);
    expect(itemLock).toBeGreaterThan(vendorLock);
  });

  it("builds review functions and view as their named owners without auth-schema grants", () => {
    const migration = readFileSync(join(repoRoot, "supabase", "migrations", "20260831100000_food_catalog_review.sql"), "utf8");
    expect(migration).toMatch(/GRANT CREATE ON SCHEMA private TO localens_admin_rpc_owner, localens_catalog_guard_owner/);
    expect(migration).toMatch(/GRANT CREATE ON SCHEMA public TO localens_admin_rpc_owner/);
    expect(migration).toMatch(/SET LOCAL ROLE localens_admin_rpc_owner;[\s\S]*CREATE OR REPLACE FUNCTION private\.assert_catalog_review_admin\(\)[\s\S]*RESET ROLE;/);
    expect(migration).toMatch(/SET LOCAL ROLE localens_catalog_guard_owner;[\s\S]*CREATE OR REPLACE FUNCTION private\.assert_food_catalog_review_complete[\s\S]*RESET ROLE;/);
    expect(migration).toMatch(/SET LOCAL ROLE localens_admin_rpc_owner;[\s\S]*CREATE OR REPLACE VIEW public\.admin_food_catalog_review_v[\s\S]*CREATE OR REPLACE FUNCTION public\.review_food_catalog_item[\s\S]*RESET ROLE;/);
    expect(migration).not.toMatch(/auth\.uid\(\)/);
    expect(migration.match(/NULLIF\(pg_catalog\.current_setting\('request\.jwt\.claim\.sub', true\), ''\)::uuid/g)).toHaveLength(2);
    expect(migration).toMatch(/REVOKE CREATE ON SCHEMA private FROM localens_admin_rpc_owner, localens_catalog_guard_owner;[\s\S]*REVOKE CREATE ON SCHEMA public FROM localens_admin_rpc_owner;[\s\S]*COMMIT;/);
  });

  it("rejects a stale or archived vendor before any review write and enforces one return row", () => {
    const migration = readFileSync(join(repoRoot, "supabase", "migrations", "20260831100000_food_catalog_review.sql"), "utf8");
    const start = migration.indexOf("CREATE OR REPLACE FUNCTION public.review_food_catalog_item");
    const end = migration.indexOf("ALTER FUNCTION public.review_food_catalog_item", start);
    const reviewRpc = migration.slice(start, end);
    const vendorGuard = reviewRpc.indexOf("IF vendor_row.status NOT IN");
    const firstWrite = Math.min(
      reviewRpc.indexOf("UPDATE public.food_items"),
      reviewRpc.indexOf("INSERT INTO private.audit_events"),
    );

    expect(vendorGuard).toBeGreaterThanOrEqual(0);
    expect(firstWrite).toBeGreaterThan(vendorGuard);
    expect(reviewRpc).toMatch(/vendor_row\.status NOT IN \('draft'::public\.place_status, 'published'::public\.place_status\)/i);
    expect(reviewRpc).toMatch(/GET DIAGNOSTICS returned_rows = ROW_COUNT[\s\S]*?returned_rows <> 1/i);
  });

  it("covers the archived-vendor no-audit rejection in the rollback-only database fixture", () => {
    const pgTap = readFileSync(join(repoRoot, "supabase", "tests", "database", "food_catalog_test.sql"), "utf8");
    expect(pgTap).toMatch(/archived-review-stall/i);
    expect(pgTap).toMatch(/food catalog review vendor is not reviewable/i);
    expect(pgTap).toMatch(/archived vendor rejection writes no audit/i);
  });

  it("keeps review updates narrow and revalidates exception windows and each allergen", () => {
    const migration = readFileSync(join(repoRoot, "supabase", "migrations", "20260831100000_food_catalog_review.sql"), "utf8");
    expect(migration).toMatch(/GRANT UPDATE \(status\) ON TABLE public\.food_vendors TO localens_admin_rpc_owner;/i);
    expect(migration).toMatch(/GRANT UPDATE \(status\) ON TABLE public\.food_items TO localens_admin_rpc_owner;/i);
    expect(migration).not.toMatch(/GRANT UPDATE ON TABLE public\.food_vendors, public\.food_items/i);
    expect(migration).toMatch(/closed\s+IS\s+FALSE[\s\S]*?food_vendor_opening_exception_windows/i);
    expect(migration).toMatch(/unnest\(item_row\.allergens\)/i);
    expect(migration).toMatch(/support\.requirement\s*=\s*listed\.allergen_name/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.review_food_catalog_item\([\s\S]*?RETURNS SETOF public\.admin_food_catalog_review_v/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.get_admin_food_catalog_review_queue\([\s\S]*?WHERE queue\.item ->> 'status' = 'draft'/i);
  });

  it("accepts CRLF generated Markdown without masking content drift", () => {
    const crlfRoot = checkerFixture();
    const crlfMarkdownPath = join(crlfRoot, "docs", "security", "data-access-matrix.md");
    const markdown = readFileSync(crlfMarkdownPath, "utf8").replace(/\r\n?/g, "\n");
    writeFileSync(crlfMarkdownPath, markdown.replaceAll("\n", "\r\n"), "utf8");
    try {
      expect(checkerFailure(crlfRoot)).toBe("");
    } finally {
      rmSync(crlfRoot, { recursive: true, force: true });
    }

    const driftRoot = checkerFixture();
    const driftMarkdownPath = join(driftRoot, "docs", "security", "data-access-matrix.md");
    writeFileSync(driftMarkdownPath, `${markdown}Unexpected drift\n`, "utf8");
    try {
      expect(checkerFailure(driftRoot)).toMatch(/generated Markdown drift/);
    } finally {
      rmSync(driftRoot, { recursive: true, force: true });
    }
  }, 15_000);

  it("enumerates the live final object surface and exact RPC signatures", () => {
    const matrix = JSON.parse(readFileSync(matrixPath, "utf8")) as {
      tables: Array<{ name: string; policies: string[]; forceRls: boolean }>;
      views: Array<{ name: string; owner: string; securityInvoker: boolean; securityBarrier: boolean }>;
      rpcs: Array<{ name: string; signature: string; owner: string; readerRoles: string[] }>;
      internalFunctions: string[];
    };
    expect(matrix.tables).toHaveLength(81);
    expect(matrix.views).toHaveLength(18);
    expect(matrix.rpcs).toHaveLength(24);
    expect(matrix.rpcs).toContainEqual(expect.objectContaining({
      name: "public.begin_fixed_tour_booking",
      signature: "public.begin_fixed_tour_booking(uuid,integer,public.locale,text)",
      owner: "localens_checkout_rpc_owner",
      readerRoles: ["authenticated"],
    }));
    expect(matrix.rpcs).toContainEqual(expect.objectContaining({
      name: "public.complete_simulated_fixed_tour_payment",
      signature: "public.complete_simulated_fixed_tour_payment(uuid,text)",
      owner: "localens_simulated_payment_rpc_owner",
      readerRoles: ["authenticated"],
    }));
    expect(matrix.rpcs).toContainEqual(expect.objectContaining({
      name: "public.request_fixed_tour_cancellation",
      signature: "public.request_fixed_tour_cancellation(uuid,text,text)",
      owner: "localens_cancellation_customer_rpc_owner",
      readerRoles: ["authenticated"],
    }));
    expect(matrix.rpcs).toContainEqual(expect.objectContaining({
      name: "public.decide_fixed_tour_cancellation",
      signature: "public.decide_fixed_tour_cancellation(uuid,text,text,text)",
      owner: "localens_cancellation_admin_rpc_owner",
      readerRoles: ["authenticated"],
    }));
    expect(matrix.rpcs).toContainEqual(expect.objectContaining({
      name: "public.get_portal_identity",
      signature: "public.get_portal_identity()",
      readerRoles: ["authenticated"],
    }));
    expect(matrix.internalFunctions.every((signature) => signature.includes("("))).toBe(true);
    expect(matrix.rpcs.every((rpc) => rpc.signature.startsWith(`${rpc.name}(`))).toBe(true);
    expect(matrix.views.every((view) => view.owner.startsWith("localens_") && view.securityBarrier)).toBe(true);
    expect(matrix.views.filter((view) => [
      "public.catalog_snapshot_food_vendors_v",
      "public.catalog_snapshot_food_items_v",
    ].includes(view.name))).toHaveLength(2);
    expect(matrix.tables.every((table) => table.policies.length > 0)).toBe(true);
    expect(matrix.tables.every((table) => table.forceRls === true)).toBe(true);
  });

  it("does not expose an unused unbounded direct audit view", () => {
    const migration = readFileSync(join(repoRoot, "supabase", "migrations", "20260831100000_food_catalog_review.sql"), "utf8");
    const matrix = JSON.parse(readFileSync(matrixPath, "utf8")) as { views: Array<{ name: string }> };
    expect(migration).not.toContain("admin_food_catalog_audit_v");
    expect(matrix.views.some((view) => view.name === "public.admin_food_catalog_audit_v")).toBe(false);
  });

  it("records the invoker-view exception and all Edge boundary controls", () => {
    const matrix = JSON.parse(readFileSync(matrixPath, "utf8")) as {
      migrationOwner: string;
      roleProfiles: Record<string, { rolcanlogin: boolean; rolbypassrls: boolean }>;
      views: Array<{ name: string; securityInvoker: boolean; baseGrantException?: string[] }>;
      edgeBoundaryChecklist: Record<string, string>;
    };
    const publishedTours = matrix.views.find((view) => view.name === "public.published_tours_v");
    expect(matrix.migrationOwner).toBe("postgres");
    expect(matrix.roleProfiles.localens_tour_rpc_owner).toMatchObject({ rolcanlogin: false, rolbypassrls: false });
    expect(publishedTours).toMatchObject({ securityInvoker: true });
    expect(publishedTours?.baseGrantException).toContain("public.catalog_snapshots:(id,status)");
    expect(Object.keys(matrix.edgeBoundaryChecklist)).toEqual(expect.arrayContaining([
      "corsAllowlist", "requestBodyLimit", "turnstile", "secrets", "correlationRedaction", "staticBundle", "credentialBoundary",
    ]));
    expect(readFileSync(markdownPath, "utf8")).toContain("# LocalLens data-access matrix");
    expect(readFileSync(markdownPath, "utf8")).toContain("Migration owner for default privileges: postgres");
  });

  it("fails closed when generated policies or later definer hardening drift", () => {
    const root = checkerFixture();
    const matrixFixturePath = join(root, "docs", "security", "data-access-matrix.json");
    const matrix = JSON.parse(readFileSync(matrixFixturePath, "utf8"));
    const areas = matrix.tables.find((table: { name: string }) => table.name === "public.areas");
    areas.policies = areas.policies.filter((policy: string) => policy !== "catalog_owner_all");
    writeFileSync(matrixFixturePath, `${JSON.stringify(matrix, null, 2)}\n`);
    try {
      expect(checkerFailure(root)).toMatch(/public\.areas policy drift/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }

    const grantsRoot = checkerFixture();
    const grantManifestPath = join(grantsRoot, "docs", "security", "grants-manifest.json");
    const grantManifest = JSON.parse(readFileSync(grantManifestPath, "utf8"));
    grantManifest.grants.pop();
    writeFileSync(grantManifestPath, `${JSON.stringify(grantManifest, null, 2)}\n`);
    try {
      expect(checkerFailure(grantsRoot)).toMatch(/grant manifest drift/);
    } finally {
      rmSync(grantsRoot, { recursive: true, force: true });
    }

    const guardRoot = checkerFixture();
    const guardPath = join(guardRoot, "supabase", "migrations", "20260824100000_guard_lock_privileges.sql");
    const originalGuard = readFileSync(guardPath, "utf8");
    writeFileSync(guardPath, originalGuard.replace("SET statement_timeout = '5s'", "SET statement_timeout = '10s'"));
    try {
      expect(checkerFailure(guardRoot)).toMatch(/later SECURITY DEFINER replacement/);
    } finally {
      rmSync(guardRoot, { recursive: true, force: true });
    }
  }, 15_000);

  it("checks every published-tour reader role and final FORCE RLS coverage", () => {
    const grantRoot = checkerFixture();
    const task13Path = join(grantRoot, "supabase", "migrations", "20260823110000_rls_rpc_security.sql");
    const task13 = readFileSync(task13Path, "utf8");
    writeFileSync(task13Path, task13.replace("GRANT SELECT (id, slug, status) ON TABLE public.tours TO anon, authenticated;", "GRANT SELECT (id, slug, status) ON TABLE public.tours TO anon;"));
    try {
      expect(checkerFailure(grantRoot)).toMatch(/published_tours_v base column exception public\.tours.*authenticated/);
    } finally {
      rmSync(grantRoot, { recursive: true, force: true });
    }

    const forceRoot = checkerFixture();
    const forcePath = join(forceRoot, "supabase", "migrations", "20260823110000_rls_rpc_security.sql");
    const forceSql = readFileSync(forcePath, "utf8");
    writeFileSync(forcePath, forceSql.replace("ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY", "ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY"));
    try {
      expect(checkerFailure(forceRoot)).toMatch(/final public\/private FORCE RLS coverage is missing/);
    } finally {
      rmSync(forceRoot, { recursive: true, force: true });
    }
  }, 15_000);

  it("hardens each SECURITY DEFINER while acting as its named owner", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase", "migrations", "20260823110000_rls_rpc_security.sql"),
      "utf8",
    );
    expect(sql).toMatch(/JOIN pg_catalog\.pg_roles AS owner_role ON owner_role\.oid = p\.proowner/);
    expect(sql).toMatch(/owner_role\.rolname AS owner_name/);
    expect(sql).toMatch(/pg_catalog\.has_schema_privilege\(owner_role\.oid, n\.oid, 'USAGE'\) AS had_schema_usage/);
    expect(sql).toMatch(/IF NOT function_record\.had_schema_usage THEN[\s\S]*GRANT USAGE ON SCHEMA %I TO %I/);
    expect(sql).toMatch(/SET LOCAL ROLE %I[\s\S]*function_record\.owner_name/);
    expect(sql).toMatch(/ALTER FUNCTION %s SET statement_timeout[\s\S]*RESET ROLE;[\s\S]*REVOKE USAGE ON SCHEMA %I FROM %I/);
    expect(sql).toMatch(/EXCEPTION WHEN OTHERS[\s\S]*RESET ROLE;[\s\S]*REVOKE USAGE ON SCHEMA %I FROM %I[\s\S]*RAISE/);
    expect(sql).not.toMatch(/REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public, private, auth/);
    expect(sql).toMatch(/function_acl_reset[\s\S]*SET LOCAL ROLE %I[\s\S]*REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role/);
  });

  it("checks dynamic owner policy command, roles, and predicates", () => {
    for (const mutation of [
      (policy: { roles: string[] }) => { policy.roles[0] = "anon"; },
      (policy: { command: string }) => { policy.command = "SELECT"; },
      (policy: { using: string }) => { policy.using = "false"; },
    ]) {
      const root = checkerFixture();
      const manifestPath = join(root, "docs", "security", "policies-manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      mutation(manifest.policies[0]);
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      try {
        expect(checkerFailure(root)).toMatch(/policy manifest drift/);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  }, 15_000);
});
