import { cleanup, render, screen } from "@testing-library/react";
import { readFile } from "node:fs/promises";
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
  ])("keeps %s free of static demo planner and storage-composition imports", async (path) => {
    const source = await readFile(path, "utf8");
    const staticImports = [...source.matchAll(/^\s*import(?:\s+type)?(?:[\s\S]*?\s+from)?\s*["']([^"']+)["'];?$/gm)]
      .map((match) => match[1]);

    expect(staticImports).not.toEqual(expect.arrayContaining([
      expect.stringMatching(/demo-planner/),
      expect.stringMatching(/lib\/infrastructure\/demo/),
      expect.stringMatching(/lib\/application\/portal\/composition/),
      expect.stringMatching(/components\/portals\/portal-session/),
    ]));
  });
});
