import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CustomRequestFlow } from "@/components/customer/custom-request-flow";
import { createPortalComposition } from "@/lib/application/portal/composition";
import { createDemoPlannerAdapter } from "@/lib/application/planner/demo-planner";
import {
  clearCustomRequestDraft,
  saveCustomRequestDraft,
} from "@/lib/application/planner/custom-request-demo";
import {
  clearPersonalizationRequest,
  savePersonalizationRequest,
  type PersonalizationRequest,
} from "@/lib/application/planner/personalization-session";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { createMemorySessionStorage } from "@/lib/infrastructure/demo/portal-repository";

const request: PersonalizationRequest = {
  startAt: "2026-09-05T10:30:00+07:00",
  durationMinutes: 240,
  areas: ["demo-hcmc-district-1"],
  budget: { currency: "VND", amountMinor: 1_500_000 },
  partySize: 3,
  guideLanguage: "en",
  priorityWeights: { street_food: 0, history: 3, traditional_craft: 0, traditional_market: 1 },
  pace: "active",
  dietaryRequirements: [],
  mobilityRequirements: [],
  lockedStopIds: [],
  specialNeeds: "",
};

function saveDraft() {
  savePersonalizationRequest(request);
  const state = createDemoPlannerAdapter().createInitial("en", request);
  saveCustomRequestDraft({
    planId: state.planId,
    revision: state.current.revision,
    preferences: request,
    revisionSnapshot: state.current,
  });
}

afterEach(() => {
  cleanup();
  clearCustomRequestDraft();
  clearPersonalizationRequest();
});

describe("CustomRequestFlow", () => {
  it("requires a real sign-in in production but offers an explicit local-demo boundary", () => {
    saveDraft();
    const copy = getDictionary("en").customRequest;
    render(<CustomRequestFlow locale="en" copy={copy} />);

    expect(screen.getByRole("heading", { name: copy.signInBoundaryHeading }).closest(".custom-request-flow")).toHaveClass(
      "custom-request-flow--editorial",
    );
    expect(screen.getByText(copy.noBackendAuthDisclosure)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: copy.continueLocalDemoLabel })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: copy.submitRequestLabel })).not.toBeInTheDocument();
    expect(screen.getAllByText(copy.foodNotSelectedLabel)).toHaveLength(2);
  });

  it("walks through local request, admin-review, immutable quote acceptance, and Stripe mock", () => {
    saveDraft();
    const copy = getDictionary("en").customRequest;
    render(<CustomRequestFlow locale="en" copy={copy} />);

    fireEvent.click(screen.getByRole("button", { name: copy.continueLocalDemoLabel }));
    expect(screen.getByText(copy.venueAdmissionLabel)).toBeInTheDocument();
    expect(screen.getByText(copy.foodEstimateLabel)).toBeInTheDocument();
    expect(screen.getByText(copy.travelCostTotalLabel)).toBeInTheDocument();
    expect(screen.getByText(copy.guideCostLabel)).toBeInTheDocument();
    expect(screen.getByText(copy.localLensPayableLabel)).toBeInTheDocument();
    expect(screen.getByText(copy.payAtVendorLabel)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: copy.submitRequestLabel }));
    expect(screen.getByRole("status")).toHaveTextContent(copy.adminReviewPendingMessage);

    fireEvent.click(screen.getByRole("button", { name: copy.simulateQuoteLabel }));
    expect(screen.getByRole("heading", { name: copy.quoteHeading })).toBeInTheDocument();
    expect(screen.getAllByText(/₫240,000/).length).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByRole("button", { name: copy.acceptQuoteLabel }));
    expect(screen.getByRole("status")).toHaveTextContent(copy.quoteAcceptedMessage);
    fireEvent.click(screen.getByRole("button", { name: copy.openStripeMockLabel }));
    expect(screen.getByRole("heading", { name: copy.stripeMockHeading })).toBeInTheDocument();
    expect(screen.getByText(copy.noPaymentNetworkDisclosure)).toBeInTheDocument();
  });

  it("shows a normalized-budget warning and blocks an over-budget revision before request submission", () => {
    const state = createDemoPlannerAdapter().createInitial("en", request);
    const usdRequest = { ...request, budget: { currency: "USD" as const, amountMinor: 10_000 } };
    savePersonalizationRequest(usdRequest);
    const overBudgetRevision = {
      ...state.current,
      budgetVnd: 1,
    } as typeof state.current;
    expect(saveCustomRequestDraft({
      planId: state.planId,
      revision: overBudgetRevision.revision,
      preferences: usdRequest,
      revisionSnapshot: overBudgetRevision,
    })).toBe(true);
    const copy = getDictionary("vi").customRequest;

    render(<CustomRequestFlow locale="vi" copy={copy} />);

    expect(screen.getByRole("note", { name: copy.budgetWarningLabel })).toHaveTextContent(copy.budgetWarningMessage);
    fireEvent.click(screen.getByRole("button", { name: copy.continueLocalDemoLabel }));
    const submit = screen.getByRole("button", { name: copy.submitRequestLabel });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(screen.queryByRole("status", { name: copy.adminReviewPendingMessage })).not.toBeInTheDocument();
  });

  it("fails closed with a recovery link when the selected planner revision is missing", () => {
    savePersonalizationRequest(request);
    const copy = getDictionary("vi").customRequest;
    render(<CustomRequestFlow locale="vi" copy={copy} />);

    expect(screen.getByRole("alert")).toHaveTextContent(copy.missingPlanMessage);
    expect(screen.getByRole("link", { name: copy.backToPlannerLabel })).toHaveAttribute("href", "/vi/planner");
    expect(screen.queryByRole("button", { name: copy.continueLocalDemoLabel })).not.toBeInTheDocument();
  });

  it("submits the selected revision to the demo portal and completes checkout only after admin approval", async () => {
    saveDraft();
    const copy = getDictionary("en").customRequest;
    const portal = createPortalComposition({
      mode: "demo",
      storage: createMemorySessionStorage(),
      now: () => "2026-08-31T12:00:00.000Z",
    });
    await portal.initialized;
    await portal.session.selectDemoIdentity("demo-user-customer");
    const rendered = render(<CustomRequestFlow locale="en" copy={copy} demoPortal={portal} />);

    fireEvent.click(await screen.findByRole("button", { name: copy.submitRequestLabel }));
    expect(await screen.findByRole("status")).toHaveTextContent(copy.adminReviewPendingMessage);

    await portal.session.selectDemoIdentity("demo-user-admin");
    const pending = (await portal.admin.personalizedRequests.listPersonalizedRequests())
      .find((request) => request.planId === "demo-plan-hcmc-cultural-day" && request.status === "pending_review");
    if (pending === undefined) throw new Error("expected submitted personalized request");
    await portal.admin.personalizedRequests.reviewPersonalizedRequest({
      requestId: pending.id,
      decision: "approved",
      note: null,
    });
    await portal.demoQuotes.issueDemoQuote({
      requestId: pending.id,
      amountVndMinor: Number(pending.requestedTotalVndMinor),
    });
    await portal.session.selectDemoIdentity("demo-user-customer");

    rendered.unmount();
    render(<CustomRequestFlow locale="en" copy={copy} demoPortal={portal} />);
    expect(await screen.findByRole("heading", { name: copy.quoteHeading })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: copy.acceptQuoteLabel }));
    fireEvent.click(screen.getByRole("button", { name: copy.openStripeMockLabel }));
    expect(await screen.findByRole("heading", { name: copy.stripeMockHeading })).toBeInTheDocument();
    await portal.session.selectDemoIdentity("demo-user-admin");
    await expect(portal.admin.bookings.listAdminBookings()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceKind: "quote", status: "confirmed", paymentStatus: "paid" }),
      ]),
    );
  });
});
