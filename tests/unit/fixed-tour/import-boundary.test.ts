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

  it("keeps customer routes behind a bidirectional mode-selected boundary", () => {
    const surface = source("components/customer/fixed-tour-route-surface.tsx");
    expect(surface).toContain('import("@/components/customer/demo-tour-catalog-entry")');
    expect(surface).toContain('import("@/components/customer/demo-booking-entry")');
    expect(surface).toContain('import("@/components/customer/runtime-tour-catalog")');
    expect(surface).toContain('import("@/components/customer/runtime-fixed-tour-booking")');
    expect(surface).not.toMatch(/^import (?!type\b).*demo-tour-catalog-entry/m);
    expect(surface).not.toMatch(/^import (?!type\b).*runtime-tour-catalog/m);

    for (const route of ["tours", "booking"] as const) {
      const page = source(`app/[locale]/${route}/page.tsx`);
      expect(page).toContain("FixedTourRouteSurface");
      expect(page).not.toMatch(/createReadOnlyApi|TourCatalogExplorer|DemoBookingEntry/);
    }
  });

  it("reads booking pathname and query from the Next router under Suspense", () => {
    const surface = source("components/customer/fixed-tour-route-surface.tsx");

    expect(surface).toContain("usePathname");
    expect(surface).toContain("useSearchParams");
    expect(surface).toContain("<Suspense");
    expect(surface).not.toContain("window.location");
  });
});
