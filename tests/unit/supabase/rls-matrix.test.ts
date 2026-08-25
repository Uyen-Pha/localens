// @vitest-environment node

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const matrixPath = join(repoRoot, "docs", "security", "data-access-matrix.json");
const markdownPath = join(repoRoot, "docs", "security", "data-access-matrix.md");

describe("Task 13 RLS/RPC access matrix", () => {
  it("passes the final SQL/object/policy/signature/grant drift gate", () => {
    expect(() => execFileSync(process.execPath, [join(repoRoot, "scripts", "check-supabase-artifacts.mjs"), "--root", repoRoot], { encoding: "utf8" })).not.toThrow();
  });

  it("enumerates the live final object surface and exact RPC signatures", () => {
    const matrix = JSON.parse(readFileSync(matrixPath, "utf8")) as {
      tables: Array<{ name: string; policies: string[] }>;
      views: Array<{ name: string; owner: string; securityInvoker: boolean; securityBarrier: boolean }>;
      rpcs: Array<{ name: string; signature: string; owner: string; readerRoles: string[] }>;
      internalFunctions: string[];
    };
    expect(matrix.tables).toHaveLength(61);
    expect(matrix.views).toHaveLength(12);
    expect(matrix.rpcs).toHaveLength(17);
    expect(matrix.internalFunctions.every((signature) => signature.includes("("))).toBe(true);
    expect(matrix.rpcs.every((rpc) => rpc.signature.startsWith(`${rpc.name}(`))).toBe(true);
    expect(matrix.views.every((view) => view.owner.startsWith("localens_") && view.securityBarrier)).toBe(true);
    expect(matrix.tables.every((table) => table.policies.length > 0)).toBe(true);
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
    const originalMatrix = readFileSync(matrixPath, "utf8");
    const matrix = JSON.parse(originalMatrix);
    const areas = matrix.tables.find((table: { name: string }) => table.name === "public.areas");
    areas.policies = areas.policies.filter((policy: string) => policy !== "catalog_owner_all");
    writeFileSync(matrixPath, `${JSON.stringify(matrix, null, 2)}\n`);
    try {
      expect(() => execFileSync(process.execPath, [join(repoRoot, "scripts", "check-supabase-artifacts.mjs"), "--root", repoRoot], { encoding: "utf8" })).toThrow(/public\.areas policy drift/);
    } finally {
      writeFileSync(matrixPath, originalMatrix);
    }

    const grantManifestPath = join(repoRoot, "docs", "security", "grants-manifest.json");
    const originalGrantManifest = readFileSync(grantManifestPath, "utf8");
    const grantManifest = JSON.parse(originalGrantManifest);
    grantManifest.grants.pop();
    writeFileSync(grantManifestPath, `${JSON.stringify(grantManifest, null, 2)}\n`);
    try {
      expect(() => execFileSync(process.execPath, [join(repoRoot, "scripts", "check-supabase-artifacts.mjs"), "--root", repoRoot], { encoding: "utf8" })).toThrow(/grant manifest drift/);
    } finally {
      writeFileSync(grantManifestPath, originalGrantManifest);
    }

    const guardPath = join(repoRoot, "supabase", "migrations", "20260824100000_guard_lock_privileges.sql");
    const originalGuard = readFileSync(guardPath, "utf8");
    writeFileSync(guardPath, originalGuard.replace("SET statement_timeout = '5s'", "SET statement_timeout = '10s'"));
    try {
      expect(() => execFileSync(process.execPath, [join(repoRoot, "scripts", "check-supabase-artifacts.mjs"), "--root", repoRoot], { encoding: "utf8" })).toThrow(/later SECURITY DEFINER replacement/);
    } finally {
      writeFileSync(guardPath, originalGuard);
    }
  });
});
