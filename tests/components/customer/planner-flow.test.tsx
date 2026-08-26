import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PlannerFlow } from "@/components/customer/planner-flow";
import {
  createDemoPlannerAdapter,
  type PlannerAdapter,
} from "@/lib/application/planner/demo-planner";
import { getDictionary } from "@/lib/i18n/dictionaries";
import {
  clearPersonalizationRequest,
  savePersonalizationRequest,
} from "@/lib/application/planner/personalization-session";

afterEach(() => {
  cleanup();
  clearPersonalizationRequest();
});

describe("PlannerFlow", () => {
  it("renders a bilingual-safe proposal with activities, totals, warnings, and no booking action", () => {
    const copy = getDictionary("en").planner;

    render(<PlannerFlow locale="en" copy={copy} />);

    expect(screen.getByRole("heading", { name: copy.heading })).toBeInTheDocument();
    expect(screen.getByText(copy.simulatedDisclosure)).toBeInTheDocument();
    expect(screen.getAllByTestId("planner-activity")).toHaveLength(3);
    expect(screen.getByText(copy.totalDurationLabel)).toBeInTheDocument();
    expect(screen.getByText(copy.totalCostLabel)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: copy.warningsHeading })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: copy.revisionHistoryHeading })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /book|đặt/i })).not.toBeInTheDocument();
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
        street_food: 5,
        history: 3,
        traditional_craft: 0,
        traditional_market: 0,
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
