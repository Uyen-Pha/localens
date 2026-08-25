import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BookingFlow, type BookingCopy } from "@/components/customer/booking-flow";

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
  it("rejects an unknown departure from the URL without showing a price or payment action", async () => {
    window.history.replaceState({}, "", "/en/booking?departure=outside-db&partySize=2");
    render(<BookingFlow locale="en" copy={copy} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(copy.invalidDepartureMessage);
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
    expect(screen.getByText(copy.paymentBanner)).toHaveAttribute("role", "note");
    expect(screen.getByText((_content, element) => element?.textContent === "VND 960,000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: copy.payLabel })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: copy.payLabel }));
    expect(screen.getByRole("status")).toHaveTextContent(copy.payingLabel);
    expect(await screen.findByRole("heading", { name: copy.successHeading })).toBeInTheDocument();
    expect(screen.getByText(/demo-booking-/)).toBeInTheDocument();
    expect(screen.getByText(copy.paidStatus)).toBeInTheDocument();
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
});
