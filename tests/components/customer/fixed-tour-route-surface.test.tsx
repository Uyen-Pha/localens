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
    }, { timeout: 5_000 })).toBeInTheDocument();
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
        listPublishedTours: vi.fn(async () => [{
          id: "44444444-4444-4444-8444-444444444444",
          versionId: "33333333-3333-4333-8333-333333333333",
          slug: "query-tour", locale: "en", title: "Query tour", summary: "Test route query",
          meetingPoint: "Market", durationMinutes: 180, priceVndMinor: "450000",
          inclusions: ["Guide"], exclusions: [], cancellationPolicy: "Cancellation policy",
          sourceUrl: "https://example.test/tour", verifiedAt: "2099-01-01T00:00:00Z",
          attribution: "Synthetic test", license: "Test only", stops: [],
        }]),
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

  it.each([
    { name: "missing tour", tours: [] },
    { name: "different version", tours: [{
      id: "44444444-4444-4444-8444-444444444444", versionId: "99999999-9999-4999-8999-999999999999",
      slug: "other-tour", locale: "en", title: "Other tour", summary: "Unrelated tour",
      meetingPoint: "Market", durationMinutes: 180, priceVndMinor: "450000",
      inclusions: ["Guide"], exclusions: [], cancellationPolicy: "Cancellation policy",
      sourceUrl: "https://example.test/tour", verifiedAt: "2099-01-01T00:00:00Z",
      attribution: "Synthetic test", license: "Test only", stops: [],
    }] },
  ])(
    "blocks booking when the departure has no matching published tour ($name)", async ({ tours }) => {
      const departureId = "11111111-1111-4111-8111-111111111111";
      const beginBooking = vi.fn();
      const listPublishedTours = vi.fn(async () => tours);
      const listAvailability = vi.fn(async () => [{
        id: departureId, tourVersionId: "33333333-3333-4333-8333-333333333333",
        startAt: "2099-09-05T02:00:00.000Z", endAt: "2099-09-05T05:00:00.000Z",
        status: "scheduled", remainingCapacity: 8,
      }]);
      mocks.loadPortalSurfaceComposition.mockResolvedValue({
        mode: "supabase", initialized: Promise.resolve(),
        session: { getSession: async () => ({ role: "customer" }) },
        fixedTour: { listPublishedTours, listAvailability, beginBooking },
      });
      render(<FixedTourRouteSurface locale="en" route="booking"
        routeLocation={{ pathname: "/en/booking/", search: `?departure=${departureId}&partySize=2` }}
        navigate={() => undefined} />);

      expect(await screen.findByRole("alert")).toHaveTextContent(/no longer available/i);
      expect(screen.queryByRole("button", { name: /book tour/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("spinbutton", { name: "Party size" })).not.toBeInTheDocument();
      expect(listPublishedTours).toHaveBeenCalledWith("en");
      expect(listAvailability).toHaveBeenCalledTimes(1);
      expect(beginBooking).not.toHaveBeenCalled();
    },
  );
});
