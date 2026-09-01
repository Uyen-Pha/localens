// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), ...path.split("/")), "utf8");
}

describe("fixed-tour runtime import boundary", () => {
  it("keeps demo composition free of Supabase fixed-tour runtime code", () => {
    const demoComposition = source("lib/application/portal/composition.ts");
    expect(demoComposition).not.toMatch(/fixed-tour-runtime-adapter|application\/fixed-tour\/composition/);
    expect(demoComposition).not.toMatch(/supabase-shell/);
  });

  it("keeps the Supabase fixed-tour graph free of demo repositories and fixtures", () => {
    const runtimeGraph = [
      source("lib/application/fixed-tour/composition.ts"),
      source("lib/infrastructure/supabase/fixed-tour-runtime-adapter.ts"),
      source("lib/application/portal/supabase-shell.ts"),
    ].join("\n");
    expect(runtimeGraph).not.toMatch(/infrastructure\/demo|portal-repository|data\/sources|data\/approvals|demo-fixture/i);
  });

  it("keeps browser runtime mode selection behind dynamic imports", () => {
    const loader = source("components/portals/portal-session.ts");
    expect(loader).toContain('await import("@/lib/application/portal/supabase-shell")');
    expect(loader).toContain('await import("@/lib/application/portal/composition")');
    expect(loader).not.toMatch(/^import (?!type\b).*supabase-shell/m);
  });
});
