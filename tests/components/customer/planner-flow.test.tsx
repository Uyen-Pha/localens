import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PlannerFlow } from "@/components/customer/planner-flow";
import {
  createDemoPlannerAdapter,
  type PlannerAdapter,
} from "@/lib/application/planner/demo-planner";
import { getDictionary } from "@/lib/i18n/dictionaries";

afterEach(cleanup);

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
  });

  it("requires refinement feedback before creating a revision", () => {
    const copy = getDictionary("en").planner;

    render(<PlannerFlow locale="en" copy={copy} />);
    fireEvent.click(screen.getByRole("button", { name: copy.refineLabel }));

    expect(screen.getByRole("alert")).toHaveTextContent(copy.feedbackRequiredMessage);
    expect(screen.queryByText(/Revision 2/)).not.toBeInTheDocument();
  });
});
