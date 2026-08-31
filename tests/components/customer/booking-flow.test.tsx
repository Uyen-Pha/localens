import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BookingFlow, type BookingCopy } from "@/components/customer/booking-flow";
import { createLocalBooking, createTestPayment } from "@/lib/application/booking/mock-booking";
import { createPortalComposition } from "@/lib/application/portal/composition";
import { createMemorySessionStorage } from "@/lib/infrastructure/demo/portal-repository";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.replaceState({}, "", "/en/booking");
});

beforeEach(() => {
  window.localStorage.clear();
});

const copy: BookingCopy = {
  heading: "Book a fixed tour",
  intro: "Review the internal demo departure before continuing.",
  demoDisclosure: "Local demo only. This is not a production booking.",
  loadingLabel: "Loading departure…",
  invalidDepartureTitle: "Departure unavailable",
  invalidPartySizeTitle: "Party size unavailable",
  invalidDepartureMessage: "This link does not identify an allowlisted demo departure.",
  invalidPartySizeMessage: "Enter a party size from 1 to 20.",
  backToToursLabel: "Back to fixed tours",
  partySizeLabel: "People in your party",
  partySizeHint: "Demo availability is checked from internal departure facts.",
  availabilityLabel: "Seats available",
  dateLabel: "Date",
  startLabel: "Starts",
  timezoneLabel: "Timezone",
  meetingPointLabel: "Meeting point",
  sourceLabel: "Source",
  sourceValue: "Internal LocalLens demo departure",
  unitPriceLabel: "Price per person",
  totalLabel: "Estimated total",
  inclusionsLabel: "Includes",
  inclusionsValue: "Local guide and tasting stops",
  continueLabel: "Continue to Test Checkout",
  paymentHeading: "Test checkout",
  paymentIntro: "Review the hold and simulated payment windows.",
  paymentBanner: "Demo/Test payment — no real charge.",
  holdLabel: "Demo hold",
  testSessionLabel: "Stripe Test session concept",
  holdDurationLabel: "35-minute demo hold",
  testSessionDurationLabel: "30-minute Stripe Test session concept",
  paymentStatusLabel: "Payment status",
  unpaidStatus: "Not paid",
  payLabel: "Pay with Stripe Test simulation",
  payingLabel: "Waiting for simulated webhook…",
  successHeading: "Demo payment succeeded",
  successMessage: "Your demo booking is recorded locally.",
  successReferenceLabel: "Demo booking reference",
  successStatusLabel: "Status",
  paidStatus: "Paid in test mode",
  nextStepsLabel: "Next steps",
  nextStepsValue: "This is a local prototype; a guide has not been assigned.",
  cancelLabel: "Cancel demo checkout",
  cancelledMessage: "Demo checkout cancelled. No charge was made.",
  retryFlowMessage: "The expired demo hold was cleared. Review the tour and create a new hold.",
  retryLabel: "Try again",
  errorLabel: "Something went wrong",
  soldOutMessage: "This demo departure does not have enough seats.",
  holdExpiredMessage: "The demo hold expired. Start again from the tour page.",
  sessionExpiredMessage: "The Stripe Test session concept expired. Start again.",
  genericErrorMessage: "The demo booking could not continue.",
  tourTitles: {
    "demo-markets-and-street-food": "Markets and Street Food",
  },
};

const validDeparture = "demo-departure-markets-and-street-food-2026-09-05";

describe("BookingFlow", () => {
  it("exposes an editorial review layout around the booking facts and summary", async () => {
    window.history.replaceState({}, "", `/en/booking?departure=${validDeparture}&partySize=2`);
    render(<BookingFlow locale="en" copy={copy} />);

    const heading = await screen.findByRole("heading", { name: copy.tourTitles["demo-markets-and-street-food"] });
    const flow = heading.closest(".booking-flow");

    expect(flow).toHaveClass("booking-flow--editorial");
    expect(flow?.querySelector(".booking-flow__layout")).not.toBeNull();
    expect(flow?.querySelector(".booking-flow__review")).not.toBeNull();
    expect(flow?.querySelector(".booking-flow__summary")).not.toBeNull();
    expect(flow?.querySelector(".booking-flow__actions")).toHaveClass("booking-flow__actions--primary");
  });

  it("rejects an unknown departure from the URL without showing a price or payment action", async () => {
    window.history.replaceState({}, "", "/en/booking?departure=outside-db&partySize=2");
    render(<BookingFlow locale="en" copy={copy} />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(copy.invalidDepartureMessage);
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.queryByRole("button", { name: copy.continueLabel })).not.toBeInTheDocument();
    expect(screen.queryByText(/VND/)).not.toBeInTheDocument();
  });

  it("creates a local hold from internal facts and completes only the simulated payment action", async () => {
    window.history.replaceState({}, "", `/en/booking?departure=${validDeparture}&partySize=2`);
    render(<BookingFlow locale="en" copy={copy} />);

    expect(await screen.findByRole("heading", { name: copy.tourTitles["demo-markets-and-street-food"] })).toBeInTheDocument();
    expect(screen.getByText((_content, element) => element?.textContent === "VND 480,000")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: copy.continueLabel }));

    expect(await screen.findByRole("heading", { name: copy.paymentHeading })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: copy.paymentHeading })).toHaveFocus());
    expect(screen.getByText(copy.paymentBanner)).toHaveAttribute("role", "note");
    expect(screen.getByText((_content, element) => element?.textContent === "VND 960,000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: copy.payLabel })).toBeInTheDocument();
    expect(screen.queryByText(/pay at vendor/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: copy.payLabel }));
    expect(screen.getByRole("status")).toHaveTextContent(copy.payingLabel);
    await waitFor(() => expect(screen.getByRole("status")).toHaveFocus());
    expect(await screen.findByRole("heading", { name: copy.successHeading }, { timeout: 2_000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: copy.successHeading })).toHaveFocus());
    expect(screen.getByText(/demo-booking-/)).toBeInTheDocument();
    expect(screen.getByText(copy.paidStatus)).toBeInTheDocument();
  });

  it("shows a resumed paid demo booking as success instead of offering payment again", async () => {
    const held = createLocalBooking({ departureId: validDeparture, partySize: 1 });
    createTestPayment({ bookingId: held.bookingId });
    window.history.replaceState({}, "", `/en/booking?departure=${validDeparture}&partySize=1`);
    render(<BookingFlow locale="en" copy={copy} />);

    await screen.findByRole("heading", { name: copy.tourTitles["demo-markets-and-street-food"] });
    fireEvent.click(screen.getByRole("button", { name: copy.continueLabel }));

    expect(await screen.findByRole("heading", { name: copy.successHeading })).toBeInTheDocument();
    expect(screen.getByText(copy.paymentBanner)).toBeInTheDocument();
    expect(screen.getByText(held.bookingId)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: copy.payLabel })).not.toBeInTheDocument();
  });

  it("marks an invalid party size and focuses the field before creating a hold", async () => {
    window.history.replaceState({}, "", `/en/booking?departure=${validDeparture}&partySize=2`);
    render(<BookingFlow locale="en" copy={copy} />);

    await screen.findByRole("heading", { name: copy.tourTitles["demo-markets-and-street-food"] });
    const partySize = screen.getByRole("spinbutton", { name: copy.partySizeLabel });
    fireEvent.change(partySize, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: copy.continueLabel }));

    await waitFor(() => expect(partySize).toHaveFocus());
    expect(screen.getByRole("alert")).toHaveTextContent(copy.invalidPartySizeMessage);
    expect(partySize).toHaveAttribute("aria-invalid", "true");
  });

  it("uses a distinct title and focused alert for an invalid party-size query", async () => {
    window.history.replaceState({}, "", `/en/booking?departure=${validDeparture}&partySize=0`);
    render(<BookingFlow locale="en" copy={copy} />);

    expect(await screen.findByRole("heading", { name: copy.invalidPartySizeTitle })).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(copy.invalidPartySizeMessage);
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it("returns to the booking step after an expired Test session instead of retrying stale state forever", async () => {
    window.history.replaceState({}, "", `/en/booking?departure=${validDeparture}&partySize=1`);
    render(<BookingFlow locale="en" copy={copy} />);

    await screen.findByRole("heading", { name: copy.tourTitles["demo-markets-and-street-food"] });
    fireEvent.click(screen.getByRole("button", { name: copy.continueLabel }));
    await screen.findByRole("heading", { name: copy.paymentHeading });
    const bookingKey = Object.keys(window.localStorage).find((key) => key.startsWith("locallens.demo.booking.v1:"));
    if (bookingKey === undefined) throw new Error("expected local demo booking");
    const createdAt = new Date(Date.now() - 31 * 60_000);
    const stored = JSON.parse(window.localStorage.getItem(bookingKey) ?? "{}") as Record<string, unknown>;
    window.localStorage.setItem(bookingKey, JSON.stringify({
      ...stored,
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
      holdExpiresAt: new Date(createdAt.getTime() + 35 * 60_000).toISOString(),
      testSessionExpiresAt: new Date(createdAt.getTime() + 30 * 60_000).toISOString(),
    }));

    fireEvent.click(screen.getByRole("button", { name: copy.payLabel }));
    expect(await screen.findByRole("alert", {}, { timeout: 2_000 })).toHaveTextContent(copy.sessionExpiredMessage);
    fireEvent.click(screen.getByRole("button", { name: copy.retryLabel }));

    expect(await screen.findByRole("heading", { name: copy.heading })).toBeInTheDocument();
    expect(screen.getByText(copy.retryFlowMessage)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: copy.continueLabel })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: copy.payLabel })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: copy.continueLabel }));
    expect(await screen.findByRole("heading", { name: copy.paymentHeading })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: copy.payLabel }));
    expect(await screen.findByRole("heading", { name: copy.successHeading }, { timeout: 2_000 })).toBeInTheDocument();
  });

  it("renders localized hold and Test session duration labels", async () => {
    const viCopy: BookingCopy = {
      ...copy,
      holdDurationLabel: "Giữ chỗ demo 35 phút",
      testSessionDurationLabel: "Khái niệm phiên Stripe Test 30 phút",
    };
    window.history.replaceState({}, "", `/vi/booking?departure=${validDeparture}&partySize=1`);
    render(<BookingFlow locale="vi" copy={viCopy} />);

    await screen.findByRole("heading", { name: viCopy.tourTitles["demo-markets-and-street-food"] });
    fireEvent.click(screen.getByRole("button", { name: viCopy.continueLabel }));
    await screen.findByRole("heading", { name: viCopy.paymentHeading });
    expect(screen.getByText(viCopy.holdDurationLabel)).toBeInTheDocument();
    expect(screen.getByText(viCopy.testSessionDurationLabel)).toBeInTheDocument();
  });

  it("cancels a pending local payment and cannot finish the cancelled checkout later", async () => {
    window.history.replaceState({}, "", `/en/booking?departure=${validDeparture}&partySize=1`);
    render(<BookingFlow locale="en" copy={copy} />);

    await screen.findByRole("heading", { name: copy.tourTitles["demo-markets-and-street-food"] });
    fireEvent.click(screen.getByRole("button", { name: copy.continueLabel }));
    await screen.findByRole("heading", { name: copy.paymentHeading });
    fireEvent.click(screen.getByRole("button", { name: copy.payLabel }));
    fireEvent.click(screen.getByRole("button", { name: copy.cancelLabel }));

    expect(await screen.findByText(copy.cancelledMessage)).toBeInTheDocument();
    await new Promise((resolve) => window.setTimeout(resolve, 1_100));
    expect(screen.queryByRole("heading", { name: copy.successHeading })).not.toBeInTheDocument();
  });

  it("hands the authoritative local hold to the signed-in demo customer portal", async () => {
    const portal = createPortalComposition({
      mode: "demo",
      storage: createMemorySessionStorage(),
      now: () => "2026-08-31T12:00:00.000Z",
    });
    await portal.initialized;
    await portal.session.selectDemoIdentity("demo-user-customer");
    window.history.replaceState({}, "", `/en/booking?departure=${validDeparture}&partySize=2`);
    render(<BookingFlow locale="en" copy={copy} demoPortal={portal} />);

    await screen.findByRole("heading", { name: copy.tourTitles["demo-markets-and-street-food"] });
    fireEvent.click(screen.getByRole("button", { name: copy.continueLabel }));
    await screen.findByRole("heading", { name: copy.paymentHeading });

    await portal.session.selectDemoIdentity("demo-user-admin");
    await expect(portal.admin.bookings.listAdminBookings()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `demo-booking-${validDeparture}-2`,
          status: "pending_payment",
          paymentStatus: "pending",
          totalVndMinor: "960000",
        }),
      ]),
    );
  });
});
