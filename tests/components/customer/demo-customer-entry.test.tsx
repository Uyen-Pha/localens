import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DemoBookingEntry } from "@/components/customer/demo-booking-entry";
import { getDemoPortalComposition } from "@/components/portals/portal-session";
import { portalCopy } from "@/components/portals/portal-copy";
import { getDictionary } from "@/lib/i18n/dictionaries";

const departureId = "demo-departure-markets-and-street-food-2026-09-05";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.replaceState({}, "", "/en/booking");
});

describe("default customer route entry", () => {
  it("uses the browser singleton composition after demo sign-in", async () => {
    const composition = getDemoPortalComposition();
    await composition.initialized;
    await composition.session.selectDemoIdentity("demo-user-customer");
    window.history.replaceState({}, "", `/en/booking?departure=${departureId}&partySize=2`);

    render(<DemoBookingEntry locale="en" copy={getDictionary("en").booking} />);
    expect(await screen.findByRole("heading", { name: "Markets and Street Food" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: getDictionary("en").booking.continueLabel }));
    expect(await screen.findByRole("heading", { name: getDictionary("en").booking.paymentHeading })).toBeInTheDocument();

    await composition.session.selectDemoIdentity("demo-user-admin");
    await expect(composition.admin.bookings.listAdminBookings()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `demo-booking-${departureId}-2`,
          status: "pending_payment",
          paymentStatus: "pending",
        }),
      ]),
    );
  });

  it("fails closed with a real sign-in link when no demo customer is selected", async () => {
    const composition = getDemoPortalComposition();
    await composition.session.signOut();

    render(<DemoBookingEntry locale="vi" copy={getDictionary("vi").booking} />);
    const link = await screen.findByRole("link", { name: portalCopy("vi").chooseIdentity });
    expect(link).toHaveAttribute("href", "/vi/sign-in");
  });
});
