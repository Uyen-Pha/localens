import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DemoBookingEntry } from "@/components/customer/demo-booking-entry";
import { DemoCustomRequestEntry } from "@/components/customer/demo-custom-request-entry";
import { getDemoPortalComposition, useDemoPortalComposition } from "@/components/portals/portal-session";
import { portalCopy } from "@/components/portals/portal-copy";
import { createPortalComposition } from "@/lib/application/portal/composition";
import { createDemoPlannerAdapter } from "@/lib/application/planner/demo-planner";
import { saveCustomRequestDraft } from "@/lib/application/planner/custom-request-demo";
import { savePersonalizationRequest, type PersonalizationRequest } from "@/lib/application/planner/personalization-session";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { createMemorySessionStorage } from "@/lib/infrastructure/demo/portal-repository";

const departureId = "demo-departure-markets-and-street-food-2026-09-05";
const request: PersonalizationRequest = {
  startAt: "2026-09-05T10:30:00+07:00",
  durationMinutes: 240,
  areas: ["demo-hcmc-district-1"],
  budget: { currency: "VND", amountMinor: 10_000_000 },
  partySize: 2,
  guideLanguage: "en",
  priorityWeights: { street_food: 0, history: 3, traditional_craft: 0, traditional_market: 1 },
  pace: "active",
  dietaryRequirements: [],
  mobilityRequirements: [],
  lockedStopIds: [],
  specialNeeds: "",
};

beforeEach(async () => {
  const composition = createPortalComposition({
    mode: "demo",
    storage: createMemorySessionStorage(),
    now: () => "2026-08-31T12:00:00.000Z",
  });
  useDemoPortalComposition(composition);
  await composition.initialized;
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/en/booking");
});

describe("default customer route entry", () => {
  it("uses the browser singleton composition after demo sign-in", async () => {
    const composition = getDemoPortalComposition();
    await composition.initialized;
    await composition.session.selectDemoIdentity("demo-user-customer");
    window.history.replaceState({}, "", `/en/booking?departure=${departureId}&partySize=2`);

    render(<DemoBookingEntry locale="en" copy={getDictionary("en").booking} />);
    expect(
      await screen.findByRole("heading", { name: "Markets and Street Food" }, { timeout: 5_000 }),
    ).toBeInTheDocument();
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

  it("wires the default custom-request route to the same signed-in demo composition", async () => {
    const composition = getDemoPortalComposition();
    await composition.initialized;
    await composition.session.selectDemoIdentity("demo-user-customer");
    savePersonalizationRequest(request);
    const state = createDemoPlannerAdapter().createInitial("en", request);
    saveCustomRequestDraft({
      planId: state.planId,
      revision: state.current.revision,
      preferences: request,
      revisionSnapshot: state.current,
    });

    render(<DemoCustomRequestEntry locale="en" copy={getDictionary("en").customRequest} />);
    fireEvent.click(await screen.findByRole("button", { name: getDictionary("en").customRequest.submitRequestLabel }));
    expect(await screen.findByRole("status")).toHaveTextContent(getDictionary("en").customRequest.adminReviewPendingMessage);

    await composition.session.selectDemoIdentity("demo-user-admin");
    await expect(composition.admin.personalizedRequests.listPersonalizedRequests()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ planId: state.planId, status: "pending_review" })]),
    );
  });

  it("keeps the singleton route state across customer leave, admin approval, and paid re-entry", async () => {
    const composition = getDemoPortalComposition();
    const copy = getDictionary("en").customRequest;
    await composition.session.selectDemoIdentity("demo-user-customer");
    savePersonalizationRequest(request);
    const state = createDemoPlannerAdapter().createInitial("en", request);
    saveCustomRequestDraft({
      planId: state.planId,
      revision: state.current.revision,
      preferences: request,
      revisionSnapshot: state.current,
    });

    const requestEntry = render(<DemoCustomRequestEntry locale="en" copy={copy} />);
    fireEvent.click(await screen.findByRole("button", { name: copy.submitRequestLabel }));
    expect(await screen.findByRole("status")).toHaveTextContent(copy.adminReviewPendingMessage);
    requestEntry.unmount();

    await composition.session.selectDemoIdentity("demo-user-admin");
    const pending = (await composition.admin.personalizedRequests.listPersonalizedRequests())
      .find((entry) => entry.planId === state.planId && entry.status === "pending_review");
    if (pending === undefined) throw new Error("Expected the submitted personalized request.");
    expect((await composition.admin.bookings.listAdminBookings()).some((booking) => booking.id === `demo-booking-${pending.id}`)).toBe(false);
    await composition.admin.personalizedRequests.reviewPersonalizedRequest({
      requestId: pending.id,
      decision: "approved",
      note: null,
    });
    await composition.demoQuotes.issueDemoQuote({
      requestId: pending.id,
      amountVndMinor: Number(pending.requestedTotalVndMinor),
    });

    await composition.session.selectDemoIdentity("demo-user-customer");
    const quoteEntry = render(<DemoCustomRequestEntry locale="en" copy={copy} />);
    expect(await screen.findByRole("heading", { name: copy.quoteHeading })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: copy.acceptQuoteLabel }));
    fireEvent.click(await screen.findByRole("button", { name: copy.openStripeMockLabel }));
    expect(await screen.findByRole("heading", { name: copy.stripeMockHeading })).toBeInTheDocument();
    quoteEntry.unmount();

    render(<DemoCustomRequestEntry locale="en" copy={copy} />);
    expect(await screen.findByRole("heading", { name: copy.stripeMockHeading })).toBeInTheDocument();

    await composition.session.selectDemoIdentity("demo-user-admin");
    await expect(composition.admin.bookings.listAdminBookings()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `demo-booking-${pending.id}`,
          status: "confirmed",
          paymentStatus: "paid",
        }),
      ]),
    );
  });
});
