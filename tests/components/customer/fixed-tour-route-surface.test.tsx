import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FixedTourRouteSurface } from "@/components/customer/fixed-tour-route-surface";
import type { SupabasePortalShell } from "@/lib/application/portal/supabase-shell";

const mocks = vi.hoisted(() => ({
  loadPortalSurfaceComposition: vi.fn(),
}));

vi.mock("@/components/portals/portal-session", () => ({
  loadPortalSurfaceComposition: mocks.loadPortalSurfaceComposition,
}));

afterEach(() => {
  cleanup();
  mocks.loadPortalSurfaceComposition.mockReset();
  window.history.replaceState({}, "", "/");
});

describe("fixed-tour route surface", () => {
  it("retains a lazily loaded Supabase composition for the runtime surface", async () => {
    const composition = {
      mode: "supabase",
      initialized: Promise.resolve(),
      session: {
        getSession: vi.fn(async () => null),
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
      },
      fixedTour: {
        listPublishedTours: vi.fn(async () => []),
        listAvailability: vi.fn(async () => []),
        beginBooking: vi.fn(),
        listOwnBookings: vi.fn(async () => []),
        listOwnPaymentStatuses: vi.fn(async () => []),
        completeSimulatedPayment: vi.fn(),
      },
    } as unknown as SupabasePortalShell;
    mocks.loadPortalSurfaceComposition.mockResolvedValue(composition);

    render(<FixedTourRouteSurface locale="en" route="tours" navigate={() => undefined} />);

    expect(await screen.findByRole("heading", {
      name: "Fixed tours in Ho Chi Minh City",
    })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reads the static booking route query at the client boundary", async () => {
    const departureId = "11111111-1111-4111-8111-111111111111";
    const composition = {
      mode: "supabase",
      initialized: Promise.resolve(),
      session: {
        getSession: vi.fn(async () => ({
          userId: "22222222-2222-4222-8222-222222222222",
          role: "customer",
          locale: "en",
          displayName: "Runtime customer",
          email: "customer@localens.test",
        })),
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
      },
      fixedTour: {
        listPublishedTours: vi.fn(async () => []),
        listAvailability: vi.fn(async () => [{
          id: departureId,
          tourVersionId: "33333333-3333-4333-8333-333333333333",
          startAt: "2099-09-05T02:00:00.000Z",
          endAt: "2099-09-05T05:00:00.000Z",
          status: "scheduled",
          remainingCapacity: 8,
        }]),
        beginBooking: vi.fn(),
        listOwnBookings: vi.fn(async () => []),
        listOwnPaymentStatuses: vi.fn(async () => []),
        completeSimulatedPayment: vi.fn(),
      },
    } as unknown as SupabasePortalShell;
    mocks.loadPortalSurfaceComposition.mockResolvedValue(composition);

    render(
      <FixedTourRouteSurface
        locale="en"
        route="booking"
        routeLocation={{
          pathname: "/en/booking/",
          search: `?departure=${departureId}&partySize=2`,
        }}
        navigate={() => undefined}
      />,
    );

    expect(await screen.findByRole("spinbutton", { name: "Party size" })).toHaveValue(2);
  });
});
