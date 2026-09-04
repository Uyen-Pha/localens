import { cleanup, render, screen } from "@testing-library/react";
import { existsSync, statSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SupabasePortalShell } from "@/lib/application/portal/supabase-shell";

const moduleLoads = vi.hoisted(() => ({
  demo: 0,
  supabase: 0,
}));

vi.mock("@/components/portals/demo-portal-surface", () => {
  moduleLoads.demo += 1;
  return {
    DemoPortalSurface: () => <p>Demo surface module selected</p>,
  };
});

vi.mock("@/components/portals/supabase-portal-surface", () => {
  moduleLoads.supabase += 1;
  return {
    SupabasePortalSurface: () => <p>Supabase surface module selected</p>,
  };
});

import { PortalSurface } from "@/components/portals/portal-surface";

const shell: SupabasePortalShell = {
  mode: "supabase",
  initialized: Promise.resolve(),
  planner: {
    getSession: async () => null,
    recommend: async () => ({ ok: false, error: { code: "SERVICE_UNAVAILABLE", messageKey: "planner.service_unavailable", retryable: true, correlationId: "00000000-0000-4000-8000-000000000000" } }),
    refine: async () => ({ ok: false, error: { code: "SERVICE_UNAVAILABLE", messageKey: "planner.service_unavailable", retryable: true, correlationId: "00000000-0000-4000-8000-000000000000" } }),
    getPlan: async () => ({ ok: false, error: { code: "SERVICE_UNAVAILABLE", messageKey: "planner.service_unavailable", retryable: true, correlationId: "00000000-0000-4000-8000-000000000000" } }),
  },
  fixedTour: {
    listPublishedTours: async () => [],
    listAvailability: async () => [],
    beginBooking: async () => {
      throw new Error("not used by the import-boundary test");
    },
    listOwnBookings: async () => [],
    listOwnPaymentStatuses: async () => [],
    completeSimulatedPayment: async () => { throw new Error("not used"); },
  },
  guideAssignments: {
    listAdminQueue: async () => [],
    listEligibleGuides: async () => [],
    assignGuide: async () => { throw new Error("not used"); },
    listOwnAssignments: async () => [],
  },
  session: {
    getSession: async () => null,
    signInWithPassword: async () => {
      throw new Error("not used by the import-boundary test");
    },
    signOut: async () => undefined,
  },
  bookingCancellations: {
    cancelBooking: async () => { throw new Error("not used"); },
    listOwnCancellations: async () => [],
    listAdminCancellations: async () => [],
    listAdminBookings: async () => [],
  },
};

afterEach(() => {
  cleanup();
});

const workspaceRoot = process.cwd();
const LOCAL_MODULE_SUFFIXES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"] as const;

function localModulePath(fromFile: string, moduleSpecifier: string): string | null {
  const base = moduleSpecifier.startsWith("@/")
    ? resolve(workspaceRoot, moduleSpecifier.slice(2))
    : moduleSpecifier.startsWith(".")
      ? resolve(dirname(fromFile), moduleSpecifier)
      : null;
  if (base === null) return null;

  return LOCAL_MODULE_SUFFIXES
    .map((suffix) => `${base}${suffix}`)
    .find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
}

async function localStaticDependencyClosure(entry: string, visited = new Set<string>()): Promise<Set<string>> {
  const file = resolve(entry);
  if (visited.has(file)) return visited;
  visited.add(file);

  const source = await readFile(file, "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false);
  for (const statement of sourceFile.statements) {
    const moduleSpecifier = ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)
      ? statement.moduleSpecifier
      : undefined;
    if (moduleSpecifier === undefined || !ts.isStringLiteral(moduleSpecifier)) continue;

    const dependency = localModulePath(file, moduleSpecifier.text);
    if (dependency !== null) await localStaticDependencyClosure(dependency, visited);
  }
  return visited;
}

function matchingModules(files: Iterable<string>, matches: (file: string) => boolean): string[] {
  return [...files].filter(matches);
}

function forbiddenPlannerDependencies(files: Iterable<string>): string[] {
  return matchingModules(files, (file) => {
    const path = relative(workspaceRoot, file).replaceAll("\\", "/");
    return path === "lib/application/planner/demo-planner.ts"
      || path === "lib/application/planner/demo-planner-session.ts"
      || path === "lib/application/planner/custom-request-demo.ts"
      || path === "lib/application/booking/mock-booking.ts"
      || path.startsWith("lib/application/demo/")
      || path.startsWith("lib/infrastructure/demo/")
      || path === "lib/application/portal/composition.ts"
      || path === "lib/application/portal/demo-integration.ts"
      || path === "components/portals/portal-session.ts";
  });
}

describe("portal surface import boundary", () => {
  it("loads the Supabase surface without evaluating the demo surface module", async () => {
    render(<PortalSurface locale="en" composition={shell} navigate={() => undefined} />);

    expect(await screen.findByText("Supabase surface module selected")).toBeInTheDocument();
    expect(moduleLoads.supabase).toBe(1);
    expect(moduleLoads.demo).toBe(0);
  });

  it.each([
    "components/customer/supabase-planner-flow.tsx",
    "lib/infrastructure/supabase/planner-runtime-adapter.ts",
  ])("keeps the local static dependency closure of %s free of demo planner and storage composition", async (path) => {
    const closure = await localStaticDependencyClosure(path);

    expect(forbiddenPlannerDependencies(closure)).toEqual([]);
  });

  it("detects a banned planner module reached through a local re-export", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "locallens-import-boundary-"));
    const relayDirectory = join(fixtureRoot, "relay");
    const entry = join(fixtureRoot, "entry.ts");
    const relay = join(relayDirectory, "index.ts");
    const banned = join(relayDirectory, "demo-planner.ts");

    try {
      await mkdir(relayDirectory, { recursive: true });
      await writeFile(entry, 'export * from "./relay";\n', "utf8");
      await writeFile(relay, 'export { value } from "./demo-planner";\n', "utf8");
      await writeFile(banned, "export const value = 1;\n", "utf8");

      const closure = await localStaticDependencyClosure(entry);

      expect(matchingModules(closure, (file) => basename(file) === "demo-planner.ts")).toEqual([banned]);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});
