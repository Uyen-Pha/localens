import { cleanup, render, screen } from "@testing-library/react";
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
});
