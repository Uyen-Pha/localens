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
  });

  it("enumerates the live final object surface and exact RPC signatures", () => {
    const matrix = JSON.parse(readFileSync(matrixPath, "utf8")) as {
      tables: Array<{ name: string; policies: string[]; forceRls: boolean }>;
      views: Array<{ name: string; owner: string; securityInvoker: boolean; securityBarrier: boolean }>;
      rpcs: Array<{ name: string; signature: string; owner: string; readerRoles: string[] }>;
      internalFunctions: string[];
    };
    expect(matrix.tables).toHaveLength(79);
    expect(matrix.views).toHaveLength(14);
    expect(matrix.rpcs).toHaveLength(17);
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
  });

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
  });

  it("checks dynamic owner policy command, roles, and predicates", () => {
    for (const mutation of [
      (policy: { roles: string[] }) => { policy.roles[0] = "anon"; },
      (policy: { command: string }) => { policy.command = "SELECT"; },
      (policy: { using: string }) => { policy.using = "true"; },
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
  });
});
