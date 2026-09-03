import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlannerFlow } from "@/components/customer/planner-flow";
import {
  createDemoPlannerAdapter,
  E2E_PLANNER_STATE_SESSION_KEY,
  type DemoPlannerState,
  type PlannerAdapter,
} from "@/lib/application/planner/demo-planner";
import type { ItineraryPreviewFoodSelectionDto } from "@/lib/application/api/read-only-api";
import { getDictionary } from "@/lib/i18n/dictionaries";
import {
  clearPersonalizationRequest,
  savePersonalizationRequest,
  readPersonalizationState,
} from "@/lib/application/planner/personalization-session";
import { clearCustomRequestDraft, readCustomRequestDraftState } from "@/lib/application/planner/custom-request-demo";
import { createFoodFixturePlannerState } from "../../e2e/food-fixture";

const originalRuntimeMode = process.env.NEXT_PUBLIC_LOCALLENS_RUNTIME;

beforeEach(() => {
  process.env.NEXT_PUBLIC_LOCALLENS_RUNTIME = "demo";
});

afterEach(() => {
  cleanup();
  clearPersonalizationRequest();
  clearCustomRequestDraft();
  window.sessionStorage.removeItem(E2E_PLANNER_STATE_SESSION_KEY);
  window.sessionStorage.removeItem("localens.demo.planner.v1");
  window.sessionStorage.removeItem("unrelated-planner-data");
  delete process.env.NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES;
  if (originalRuntimeMode === undefined) delete process.env.NEXT_PUBLIC_LOCALLENS_RUNTIME;
  else process.env.NEXT_PUBLIC_LOCALLENS_RUNTIME = originalRuntimeMode;
});

describe("PlannerFlow", () => {
  const customerSession = {
    getSession: async () => ({
      userId: "demo-user-customer",
      role: "customer" as const,
      locale: "en" as const,
      displayName: "Demo Traveler",
      email: "traveler@example.invalid",
      demo: true as const,
    }),
  };

  function injectedState(): DemoPlannerState {
    const state = createDemoPlannerAdapter().createInitial("en");
    return {
      ...state,
      current: {
        ...state.current,
        feedback: "Injected planner state",
      },
    };
  }

  it("ignores the planner fixture session when the E2E gate is off", () => {
    window.sessionStorage.setItem(E2E_PLANNER_STATE_SESSION_KEY, JSON.stringify(injectedState()));

    render(<PlannerFlow locale="en" copy={getDictionary("en").planner} />);

    expect(screen.queryByText("Injected planner state")).not.toBeInTheDocument();
  });

  it("loads a strictly validated planner fixture only when the E2E gate is on", () => {
    process.env.NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES = "1";
    window.sessionStorage.setItem(E2E_PLANNER_STATE_SESSION_KEY, JSON.stringify(injectedState()));

    render(<PlannerFlow locale="en" copy={getDictionary("en").planner} />);

    expect(screen.getByText("Injected planner state")).toBeInTheDocument();
  });

  it("fails closed when an E2E planner fixture contains an unknown field", () => {
    process.env.NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES = "1";
    const state = injectedState() as DemoPlannerState & { unexpected?: string };
    state.unexpected = "must be ignored";
    window.sessionStorage.setItem(E2E_PLANNER_STATE_SESSION_KEY, JSON.stringify(state));

    render(<PlannerFlow locale="en" copy={getDictionary("en").planner} />);

    expect(screen.queryByText("Injected planner state")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("planner-activity")).toHaveLength(3);
  });

  it("keeps editorial timeline markers and scan spacing scoped to the planner", () => {
    const stylesheet = readFileSync(
      path.resolve(process.cwd(), "app/styles/editorial-journey.css"),
      "utf8",
    );
    const timelineRule = stylesheet.match(
      /\.planner-flow--editorial \.planner-timeline \{[\s\S]*?\n\}/,
    )?.[0] ?? "";
    const itemRule = stylesheet.match(
      /\.planner-flow--editorial \.planner-timeline__item \{[\s\S]*?\n\}/,
    )?.[0] ?? "";
    const markerRule = stylesheet.match(
      /\.planner-flow--editorial \.planner-timeline__item::before \{[\s\S]*?\n\}/,
    )?.[0] ?? "";
    const spacingRule = stylesheet.match(
      /\.planner-flow--editorial \.planner-flow__checks li \+ li,[\s\S]*?\n\}/,
    )?.[0] ?? "";

    expect(timelineRule).toContain("padding: 0;");
    expect(timelineRule).toContain("list-style: none;");
    expect(itemRule).toContain("position: relative;");
    expect(markerRule).toContain('content: "";');
    expect(markerRule).toContain("position: absolute;");
    expect(spacingRule).toContain("margin-top: var(--space-2);");
  });

  it("renders a bilingual-safe proposal with activities, totals, warnings, and no booking action", () => {
    const copy = getDictionary("en").planner;

    render(<PlannerFlow locale="en" copy={copy} />);

    expect(screen.getByRole("heading", { name: copy.heading }).closest(".planner-flow")).toHaveClass(
      "planner-flow--editorial",
    );
    expect(screen.getByText(copy.simulatedDisclosure)).toBeInTheDocument();
    expect(screen.getAllByTestId("planner-activity")).toHaveLength(3);
    expect(screen.getByText(copy.totalDurationLabel)).toBeInTheDocument();
    expect(screen.getByText(copy.totalCostLabel)).toBeInTheDocument();
    expect(screen.getByText(copy.venueAdmissionLabel)).toBeInTheDocument();
    expect(screen.getByText(copy.foodEstimateLabel)).toBeInTheDocument();
    expect(screen.getByText(copy.travelCostTotalLabel)).toBeInTheDocument();
    expect(screen.getByText(copy.guideCostLabel)).toBeInTheDocument();
    expect(screen.getByText(copy.localLensPayableLabel)).toBeInTheDocument();
    expect(screen.getByText(copy.payAtVendorLabel)).toBeInTheDocument();
    expect(screen.getAllByText(copy.foodNotSelectedLabel)).toHaveLength(4);
    expect(screen.getByRole("heading", { name: copy.warningsHeading })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: copy.revisionHistoryHeading })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /book|đặt/i })).not.toBeInTheDocument();
    expect(screen.getByText(copy.defaultFixtureLabel)).toBeInTheDocument();
  });

  it("fails closed with a localized recovery CTA when the handoff is expired", () => {
    const copy = getDictionary("vi").planner;
    window.sessionStorage.setItem("localens.personalization.v1", JSON.stringify({
      version: 1,
      savedAt: Date.now() - 30 * 60 * 1000 - 1,
      request: {
        startAt: "2026-09-05T10:30:00+07:00",
        durationMinutes: 240,
        areas: ["demo-hcmc-district-1"],
        budget: { currency: "VND", amountMinor: 1_500_000 },
        partySize: 3,
        guideLanguage: "vi",
        priorityWeights: { street_food: 5, history: 3, traditional_craft: 0, traditional_market: 0 },
        pace: "active",
        dietaryRequirements: [],
        mobilityRequirements: [],
        lockedStopIds: [],
        specialNeeds: "",
      },
    }));

    render(<PlannerFlow locale="vi" copy={copy} />);

    expect(screen.getByRole("alert")).toHaveTextContent(copy.handoffExpiredLabel);
    expect(screen.getByRole("link", { name: copy.backToPersonalizationLabel })).toHaveAttribute("href", "/vi#personalize");
    expect(screen.queryByTestId("planner-activity")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: copy.preferencesHeading })).not.toBeInTheDocument();
  });

  it("fails closed with a localized recovery CTA when the handoff is invalid", () => {
    const copy = getDictionary("en").planner;
    window.sessionStorage.setItem("localens.personalization.v1", "not-json");

    render(<PlannerFlow locale="en" copy={copy} />);

    expect(screen.getByRole("alert")).toHaveTextContent(copy.handoffInvalidLabel);
    expect(screen.getByRole("link", { name: copy.backToPersonalizationLabel })).toHaveAttribute("href", "/en#personalize");
    expect(screen.queryByTestId("planner-activity")).not.toBeInTheDocument();
  });

  it("fails closed with a localized recovery CTA when browser storage cannot be read", () => {
    const copy = getDictionary("vi").planner;
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });

    try {
      render(<PlannerFlow locale="vi" copy={copy} />);

      expect(screen.getByRole("alert")).toHaveTextContent(copy.handoffStorageErrorLabel);
      expect(screen.getByRole("link", { name: copy.backToPersonalizationLabel })).toHaveAttribute("href", "/vi#personalize");
      expect(screen.queryByTestId("planner-activity")).not.toBeInTheDocument();
    } finally {
      getItemSpy.mockRestore();
    }
  });

  it("shows submitted preferences in the local proposal without adding a booking action", () => {
    const copy = getDictionary("vi").planner;
    savePersonalizationRequest({
      startAt: "2026-09-05T10:30:00+07:00",
      durationMinutes: 240,
      areas: ["demo-hcmc-district-1"],
      budget: { currency: "VND", amountMinor: 1_500_000 },
      partySize: 3,
      guideLanguage: "vi",
      priorityWeights: {
        street_food: 0,
        history: 3,
        traditional_craft: 0,
        traditional_market: 1,
      },
      pace: "active",
      dietaryRequirements: ["vegetarian"],
      mobilityRequirements: ["step-free"],
      lockedStopIds: [],
      specialNeeds: "Prefer a quiet route.",
    });

    render(<PlannerFlow locale="vi" copy={copy} />);

    const preferences = screen.getByRole("region", { name: copy.preferencesHeading });
    expect(within(preferences).getByRole("heading", { name: copy.preferencesHeading })).toBeInTheDocument();
    expect(within(preferences).getByText("2026-09-05 10:30:00")).toBeInTheDocument();
    expect(within(preferences).getByText(/1\.500\.000/)).toBeInTheDocument();
    expect(within(preferences).getByText("Quận 1 và khu trung tâm")).toBeInTheDocument();
    expect(within(preferences).getByText("3")).toBeInTheDocument();
    expect(within(preferences).getByText("Prefer a quiet route.")).toBeInTheDocument();
    expect(within(preferences).getByText("Ăn chay")).toBeInTheDocument();
    expect(within(preferences).getByText("Lối đi không bậc")).toBeInTheDocument();
    expect(within(preferences).getByText(/UTC\+07:00/)).toBeInTheDocument();
    expect(screen.getAllByText(/UTC\+07:00/).length).toBeGreaterThanOrEqual(2);
  });

  it("uses the normalized revision budget for an over-budget warning even when the request currency is USD", () => {
    const copy = getDictionary("en").planner;
    const base = createDemoPlannerAdapter().createInitial("en");
    const selectedFood: ItineraryPreviewFoodSelectionDto = {
      venueTitle: "Ben Thanh Market",
      vendorTitle: "Aunt Ba's stall",
      locationNote: "Aisle 4",
      menuTitle: "Banh mi",
      servingUnit: "portion",
      quantity: 2,
      priceVndMin: 45_000,
      priceVndMax: 60_000,
      activity: "Taste and discuss the selected dish",
      dietaryAllergenCaveat: "Vegetarian: supported",
      accessibilityVendorWarning: "Step-free access: not verified",
      paymentMode: "pay_at_vendor",
    };
    const selectedItem = {
      ...base.current.items[0]!,
      placeCostVnd: 0,
      foodSelection: selectedFood,
      foodCostMinVnd: 90_000,
      foodCostMaxVnd: 120_000,
      payAtVendorMinVnd: 90_000,
      payAtVendorMaxVnd: 120_000,
      customerPayableVnd: 25_000,
    };
    const usdRequest = {
      startAt: "2026-09-05T10:30:00+07:00",
      durationMinutes: 240,
      areas: ["demo-hcmc-district-1"],
      budget: { currency: "USD" as const, amountMinor: 1 },
      partySize: 3,
      guideLanguage: "en" as const,
      priorityWeights: { street_food: 0 as const, history: 3 as const, traditional_craft: 0 as const, traditional_market: 1 as const },
      pace: "active" as const,
      dietaryRequirements: [],
      mobilityRequirements: [],
      lockedStopIds: [],
      specialNeeds: "",
    };
    const overBudgetState = {
      ...base,
      preferences: usdRequest,
      current: {
        ...base.current,
        budgetVnd: 1,
        items: [selectedItem],
        totals: {
          ...base.current.totals,
          durationMinutes: 60,
          costVnd: 25_000,
          admissionCostVnd: 0,
          foodCostMinVnd: 90_000,
          foodCostMaxVnd: 120_000,
          travelCostVnd: 0,
          payAtVendorMinVnd: 90_000,
          payAtVendorMaxVnd: 120_000,
          customerPayableVnd: 25_000,
          groupCostMinVnd: 90_000,
          groupCostMaxVnd: 120_000,
        },
      },
    };
    const adapter: PlannerAdapter = {
      createInitial: () => overBudgetState,
      getLatest: (state) => state,
      refine: () => ({ ok: false, error: { code: "INVALID_FEEDBACK" } }),
    };

    render(<PlannerFlow locale="en" copy={copy} adapter={adapter} />);

    expect(screen.getByRole("note", { name: copy.budgetWarningLabel })).toHaveTextContent(copy.budgetWarningMessage);
    expect(screen.getByText("Aunt Ba's stall")).toBeInTheDocument();
    expect(screen.getByText(copy.totalCostLabel).nextElementSibling).toHaveTextContent("₫120,000");
    expect(screen.getByText(copy.localLensPayableLabel).nextElementSibling).toHaveTextContent("₫25,000");
  });

  it("offers an explicit quote request CTA for the selected personalized revision", async () => {
    const copy = getDictionary("en").planner;
    savePersonalizationRequest({
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
    });

    render(<PlannerFlow locale="en" copy={copy} demoSession={customerSession} />);

    const quoteLink = await screen.findByRole("link", { name: copy.requestQuoteLabel });
    expect(quoteLink).toHaveAttribute("href", "/en/custom-request");
    fireEvent.click(quoteLink);
    expect(readCustomRequestDraftState().status).toBe("ok");
    expect(readPersonalizationState().status).toBe("ok");
  });

  it("stores the exact current food-bearing revision before opening the quote request", async () => {
    const copy = getDictionary("en").planner;
    const plannerState = createFoodFixturePlannerState("en");
    if (plannerState.preferences === null) throw new Error("expected food fixture preferences");
    expect(savePersonalizationRequest(plannerState.preferences)).toBe(true);
    const adapter: PlannerAdapter = {
      createInitial: () => plannerState,
      getLatest: (state) => state,
      refine: () => ({ ok: false, error: { code: "INVALID_FEEDBACK" } }),
    };

    render(<PlannerFlow locale="en" copy={copy} adapter={adapter} demoSession={customerSession} />);
    fireEvent.click(await screen.findByRole("link", { name: copy.requestQuoteLabel }));

    const stored = readCustomRequestDraftState();
    expect(stored.status).toBe("ok");
    if (stored.status !== "ok") throw new Error("expected a stored custom-request draft");
    expect(stored.draft.revision).toBe(plannerState.current.revision);
    expect(stored.draft.revisionSnapshot).toEqual(plannerState.current);
    expect(stored.draft.revisionSnapshot.items.find((item) => item.foodSelection !== null)?.foodSelection).toMatchObject({
      vendorTitle: "Aunt Ba's Banh Mi Stall",
      menuTitle: "Grilled pork banh mi",
      quantity: 3,
    });
  });

  it("does not confirm or persist a revision for an admin session", async () => {
    const copy = getDictionary("en").planner;
    const plannerState = createFoodFixturePlannerState("en", "mixed");
    if (plannerState.preferences === null) throw new Error("expected personalized fixture");
    expect(savePersonalizationRequest(plannerState.preferences)).toBe(true);
    const adapter: PlannerAdapter = {
      createInitial: () => plannerState,
      getLatest: (state) => state,
      refine: () => ({ ok: false, error: { code: "INVALID_FEEDBACK" } }),
    };
    const adminSession = {
      getSession: async () => ({
        userId: "demo-user-admin",
        role: "admin" as const,
        locale: "en" as const,
        displayName: "Demo Administrator",
        email: "admin@example.invalid",
        demo: true as const,
      }),
    };

    render(<PlannerFlow locale="en" copy={copy} adapter={adapter} demoSession={adminSession} />);

    const ownPortal = await screen.findByRole("link", { name: /open your portal/i });
    expect(ownPortal.parentElement).toHaveTextContent(/you are signed in as an administrator/i);
    expect(screen.queryByRole("link", { name: copy.requestQuoteLabel })).not.toBeInTheDocument();
    expect(ownPortal).toHaveAttribute("href", "/en/admin");
    expect(readCustomRequestDraftState().status).toBe("missing");
  });

  it("locks and unlocks a stop with an accessible pressed state", () => {
    const copy = getDictionary("vi").planner;

    render(<PlannerFlow locale="vi" copy={copy} />);

    expect(screen.getByText(/Khám phá các dãy chợ/)).toBeInTheDocument();
    expect(screen.getByText(/Chỉ là đề xuất demo/)).toBeInTheDocument();

    const lockButton = screen.getByRole("button", {
      name: `${copy.lockLabel}: ${"Bảo tàng Chứng tích Chiến tranh"}`,
    });
    expect(lockButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(lockButton);

    const unlockButton = screen.getByRole("button", {
      name: `${copy.unlockLabel}: ${"Bảo tàng Chứng tích Chiến tranh"}`,
    });
    expect(unlockButton).toHaveAttribute("aria-pressed", "true");
  });

  it("persists the terminal lock state across a navigation remount without touching unrelated storage", () => {
    const copy = getDictionary("en").planner;
    window.sessionStorage.setItem("unrelated-planner-data", "keep");

    render(<PlannerFlow locale="en" copy={copy} />);
    fireEvent.click(screen.getByRole("button", { name: `${copy.lockLabel}: Ben Thanh Market` }));

    expect(window.sessionStorage.getItem("localens.demo.planner.v1")).not.toBeNull();
    expect(window.sessionStorage.getItem("unrelated-planner-data")).toBe("keep");

    cleanup();
    render(<PlannerFlow locale="en" copy={copy} />);

    expect(screen.getByRole("button", { name: `${copy.unlockLabel}: Ben Thanh Market` })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(window.sessionStorage.getItem("unrelated-planner-data")).toBe("keep");
  });

  it("persists revision three and its ordered refinements across a navigation remount", () => {
    const copy = getDictionary("en").planner;
    render(<PlannerFlow locale="en" copy={copy} />);

    fireEvent.change(screen.getByRole("textbox", { name: copy.feedbackLabel }), {
      target: { value: "Keep the museum focus." },
    });
    fireEvent.click(screen.getByRole("button", { name: copy.refineLabel }));
    fireEvent.change(screen.getByRole("textbox", { name: copy.feedbackLabel }), {
      target: { value: "Add a slower walking pace." },
    });
    fireEvent.click(screen.getByRole("button", { name: copy.refineLabel }));

    expect(screen.getByRole("heading", { name: "Revision 3" })).toBeInTheDocument();

    const raw = window.sessionStorage.getItem("localens.demo.planner.v1");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw ?? "{}").operations).toEqual([
      expect.objectContaining({ type: "refine", feedback: "Keep the museum focus.", resultRevision: 2 }),
      expect.objectContaining({ type: "refine", feedback: "Add a slower walking pace.", resultRevision: 3 }),
    ]);

    cleanup();
    render(<PlannerFlow locale="en" copy={copy} />);

    expect(screen.getByRole("heading", { name: "Revision 3" })).toBeInTheDocument();
    expect(screen.getByText("Keep the museum focus.")).toBeInTheDocument();
    expect(screen.getByText("Add a slower walking pace.")).toBeInTheDocument();
  });

  it("recovers from a corrupt planner session on the next successful lock", () => {
    const copy = getDictionary("en").planner;
    window.sessionStorage.setItem("localens.demo.planner.v1", "not-json");

    render(<PlannerFlow locale="en" copy={copy} />);
    fireEvent.click(screen.getByRole("button", { name: `${copy.lockLabel}: Ben Thanh Market` }));

    expect(screen.getByRole("button", { name: `${copy.unlockLabel}: Ben Thanh Market` })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(JSON.parse(window.sessionStorage.getItem("localens.demo.planner.v1") ?? "{}").state.current.items[0].locked).toBe(true);
  });

  it("recovers from an expired planner session on the next successful refinement", () => {
    const copy = getDictionary("en").planner;
    window.sessionStorage.setItem("localens.demo.planner.v1", JSON.stringify({
      version: 1,
      handoffId: "expired-handoff",
      ownerScope: "anonymous",
      createdAt: Date.now() - 31 * 60 * 1000,
      originalExpiresAt: Date.now() - 1,
      locale: "en",
      state: { ...injectedState(), current: { ...injectedState().current, feedback: "expired state" } },
      operations: [],
    }));

    render(<PlannerFlow locale="en" copy={copy} />);
    fireEvent.change(screen.getByRole("textbox", { name: copy.feedbackLabel }), {
      target: { value: "Recover this route." },
    });
    fireEvent.click(screen.getByRole("button", { name: copy.refineLabel }));

    expect(screen.getByRole("heading", { name: "Revision 2" })).toBeInTheDocument();
    expect(screen.queryByText("expired state")).not.toBeInTheDocument();
    expect(JSON.parse(window.sessionStorage.getItem("localens.demo.planner.v1") ?? "{}").state.current.feedback).toBe(
      "Recover this route.",
    );
  });

  it("recovers from an oversized planner session on the next successful lock", () => {
    const copy = getDictionary("en").planner;
    window.sessionStorage.setItem("localens.demo.planner.v1", "x".repeat(256_001));

    render(<PlannerFlow locale="en" copy={copy} />);
    fireEvent.click(screen.getByRole("button", { name: `${copy.lockLabel}: Ben Thanh Market` }));

    expect(screen.getByRole("button", { name: `${copy.unlockLabel}: Ben Thanh Market` })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(JSON.parse(window.sessionStorage.getItem("localens.demo.planner.v1") ?? "{}").state.current.items[0].locked).toBe(true);
  });

  it("refines into a new revision and records the feedback in history", () => {
    const copy = getDictionary("en").planner;

    render(<PlannerFlow locale="en" copy={copy} />);

    fireEvent.change(screen.getByRole("textbox", { name: copy.feedbackLabel }), {
      target: { value: "Please slow down and add more food." },
    });
    fireEvent.click(screen.getByRole("button", { name: copy.refineLabel }));

    expect(screen.getByRole("status")).toHaveTextContent(copy.revisionCreatedMessage);
    expect(screen.getByText(/Revision 2/)).toBeInTheDocument();
    expect(screen.getByText("Please slow down and add more food.")).toBeInTheDocument();
    expect(screen.getAllByTestId("planner-activity")).toHaveLength(3);
  });

  it("shows stale-revision recovery UX when the adapter rejects the submitted base revision", () => {
    const copy = getDictionary("en").planner;
    const staleAdapter: PlannerAdapter = {
      createInitial: () => createDemoPlannerAdapter().createInitial(),
      getLatest: (state) => ({
        ...state,
        current: {
          ...state.current,
          revision: 2,
          items: state.current.items.map((item, index) => ({ ...item, locked: index === 0 })),
        },
        history: [...state.history, state.current],
      }),
      refine: (state) => ({
        ok: false,
        error: { code: "STALE_REVISION", expectedRevision: state.current.revision + 1 },
      }),
    };

    render(<PlannerFlow locale="en" copy={copy} adapter={staleAdapter} />);
    fireEvent.change(screen.getByRole("textbox", { name: copy.feedbackLabel }), {
      target: { value: "Change one stop." },
    });
    fireEvent.click(screen.getByRole("button", { name: copy.refineLabel }));

    expect(screen.getByRole("alert")).toHaveTextContent(copy.staleRevisionMessage);
    expect(screen.getByRole("button", { name: copy.refreshLabel })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: copy.refreshLabel }));

    expect(screen.getByRole("heading", { name: "Revision 2" })).toBeInTheDocument();
    expect(screen.getByText("Revision 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `${copy.unlockLabel}: Ben Thanh Market` })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("handles a typed invalid-feedback adapter error", () => {
    const copy = getDictionary("en").planner;
    const invalidAdapter: PlannerAdapter = {
      createInitial: () => createDemoPlannerAdapter().createInitial(),
      getLatest: (state) => state,
      refine: () => ({ ok: false, error: { code: "INVALID_FEEDBACK" } }),
    };

    render(<PlannerFlow locale="en" copy={copy} adapter={invalidAdapter} />);
    fireEvent.change(screen.getByRole("textbox", { name: copy.feedbackLabel }), {
      target: { value: "Change one stop." },
    });
    fireEvent.click(screen.getByRole("button", { name: copy.refineLabel }));

    expect(screen.getByRole("alert")).toHaveTextContent(copy.feedbackRequiredMessage);
  });

  it("requires refinement feedback before creating a revision", () => {
    const copy = getDictionary("en").planner;

    render(<PlannerFlow locale="en" copy={copy} />);
    fireEvent.click(screen.getByRole("button", { name: copy.refineLabel }));

    expect(screen.getByRole("alert")).toHaveTextContent(copy.feedbackRequiredMessage);
    expect(screen.queryByText(/Revision 2/)).not.toBeInTheDocument();
  });
});
