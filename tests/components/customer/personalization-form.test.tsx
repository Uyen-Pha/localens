import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildPersonalizationRequest,
  parseBudgetAmountMinor,
  PersonalizationForm,
} from "@/components/customer/personalization-form";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { readPersonalizationRequest } from "@/lib/application/planner/personalization-session";

afterEach(cleanup);

describe("PersonalizationForm", () => {
  it("exposes every planning preference in a labeled, grouped form", () => {
    const dictionary = getDictionary("en");

    render(<PersonalizationForm copy={dictionary.home.personalizationForm} />);

    expect(screen.getByRole("form", { name: dictionary.home.personalizationForm.formLabel })).toBeInTheDocument();
    expect(screen.getByLabelText(dictionary.home.personalizationForm.durationLabel)).toHaveAttribute(
      "name",
      "durationMinutes",
    );
    expect(screen.getByLabelText(dictionary.home.personalizationForm.durationLabel)).toHaveAttribute("min", "60");
    expect(screen.getByLabelText(dictionary.home.personalizationForm.durationLabel)).toHaveAttribute("max", "720");
    expect(screen.getByRole("group", { name: dictionary.home.personalizationForm.areasLabel })).toBeInTheDocument();
    expect(screen.getByLabelText(dictionary.home.personalizationForm.budgetLabel)).toHaveAttribute(
      "name",
      "budgetAmount",
    );
    expect(screen.getByLabelText(dictionary.home.personalizationForm.budgetCurrencyLabel)).toHaveAttribute(
      "name",
      "budgetCurrency",
    );
    expect(screen.getByLabelText(dictionary.home.personalizationForm.startDateLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(dictionary.home.personalizationForm.startTimeLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(dictionary.home.personalizationForm.languageLabel)).toHaveAttribute("name", "guideLanguage");
    expect(screen.getByLabelText(dictionary.home.personalizationForm.partySizeLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(dictionary.home.personalizationForm.paceLabel)).toHaveAttribute("name", "pace");
    expect(screen.getByLabelText(dictionary.home.personalizationForm.dietLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(dictionary.home.personalizationForm.mobilityLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(dictionary.home.personalizationForm.specialNeedsLabel)).toBeInTheDocument();

    const priorityGroup = screen.getByRole("group", {
      name: dictionary.home.personalizationForm.prioritiesLegend,
    });
    expect(priorityGroup).toBeInTheDocument();
    for (const priority of dictionary.home.personalizationForm.priorities) {
      expect(screen.getByLabelText(priority.label)).toHaveAttribute(
        "name",
        `priorityWeights.${priority.key}`,
      );
      expect(screen.getByLabelText(priority.label)).toHaveAttribute("min", "0");
      expect(screen.getByLabelText(priority.label)).toHaveAttribute("max", "5");
    }
    expect(screen.getByLabelText(dictionary.home.personalizationForm.areaOptions[0].label)).toHaveAttribute("value", "demo-hcmc-district-1");
    expect(screen.getByLabelText(dictionary.home.personalizationForm.areaOptions[1].label)).toHaveAttribute("value", "demo-hcmc-district-3");
  });

  it("requires a date, time, and at least one area before showing the local preview", () => {
    const dictionary = getDictionary("en");

    render(<PersonalizationForm copy={dictionary.home.personalizationForm} />);
    const form = screen.getByRole("form", { name: dictionary.home.personalizationForm.formLabel });

    fireEvent.submit(form);

    expect(screen.getByRole("alert")).toHaveTextContent(
      dictionary.home.personalizationForm.validationMessage,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(dictionary.home.personalizationForm.startDateLabel), {
      target: { value: "2026-09-05" },
    });
    fireEvent.change(screen.getByLabelText(dictionary.home.personalizationForm.startTimeLabel), {
      target: { value: "09:00" },
    });
    fireEvent.click(screen.getByLabelText(dictionary.home.personalizationForm.areaOptions[0].label));
    fireEvent.submit(form);

    expect(screen.getByRole("status")).toHaveTextContent(
      dictionary.home.personalizationForm.previewMessage,
    );
    expect(screen.queryByText(dictionary.home.personalizationForm.confirmationMessage)).not.toBeInTheDocument();
  });

  it("maps controls to the itinerary request contract with an explicit HCMC offset", () => {
    const formData = new FormData();
    formData.set("startDate", "2026-09-05");
    formData.set("startTime", "09:00");
    formData.set("durationMinutes", "180");
    formData.append("areas", "district-1");
    formData.set("budgetAmount", "123.45");
    formData.set("budgetCurrency", "USD");
    formData.set("partySize", "2");
    formData.set("guideLanguage", "vi");
    formData.set("priorityWeights.street_food", "5");
    formData.set("priorityWeights.history", "2");
    formData.set("priorityWeights.traditional_craft", "1");
    formData.set("priorityWeights.traditional_market", "0");
    formData.set("pace", "active");

    expect(buildPersonalizationRequest(formData)).toMatchObject({
      startAt: "2026-09-05T09:00:00+07:00",
      durationMinutes: 180,
      areas: ["district-1"],
      budget: { currency: "USD", amountMinor: 12345 },
      partySize: 2,
      guideLanguage: "vi",
      priorityWeights: {
        street_food: 5,
        history: 2,
        traditional_craft: 1,
        traditional_market: 0,
      },
      pace: "active",
    });
  });

  it("renders a deterministic itinerary proposal after a valid preview submit", () => {
    const dictionary = getDictionary("en");
    const previewCopy = dictionary.home.personalizationForm.preview;

    render(<PersonalizationForm copy={dictionary.home.personalizationForm} />);
    const form = screen.getByRole("form", { name: dictionary.home.personalizationForm.formLabel });
    fireEvent.change(screen.getByLabelText(dictionary.home.personalizationForm.startDateLabel), {
      target: { value: "2026-09-05" },
    });
    fireEvent.click(screen.getByLabelText(dictionary.home.personalizationForm.areaOptions[0].label));
    fireEvent.submit(form);

    expect(screen.getByRole("region", { name: previewCopy.heading })).toBeInTheDocument();
    expect(screen.getByText(previewCopy.deterministicDisclosure)).toBeInTheDocument();
    expect(screen.getByText(previewCopy.proposalOnly)).toBeInTheDocument();
    expect(screen.getByText(previewCopy.totalsHeading)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: previewCopy.heading })).toHaveFocus();
  });

  it("reveals a separate simulated planner CTA only after the local preview exists", () => {
    const dictionary = getDictionary("en");
    const copy = dictionary.home.personalizationForm;

    render(<PersonalizationForm copy={copy} locale="en" />);
    expect(screen.queryByRole("link", { name: copy.plannerLinkLabel })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(copy.startDateLabel), {
      target: { value: "2026-09-05" },
    });
    fireEvent.click(screen.getByLabelText(copy.areaOptions[0].label));
    fireEvent.submit(screen.getByRole("form", { name: copy.formLabel }));

    expect(screen.getByRole("link", { name: copy.plannerLinkLabel }).getAttribute("href"))
      .toMatch(/^\/en\/planner\/?$/);
    expect(screen.getByText(copy.plannerLinkDisclosure)).toBeInTheDocument();
  });

  it("stores the submitted preferences for the separate planner demo after preview", () => {
    const dictionary = getDictionary("en");
    const copy = dictionary.home.personalizationForm;

    render(<PersonalizationForm copy={copy} locale="en" />);
    fireEvent.change(screen.getByLabelText(copy.startDateLabel), {
      target: { value: "2026-09-05" },
    });
    fireEvent.change(screen.getByLabelText(copy.startTimeLabel), {
      target: { value: "10:30" },
    });
    fireEvent.change(screen.getByLabelText(copy.durationLabel), {
      target: { value: "240" },
    });
    fireEvent.change(screen.getByLabelText(copy.partySizeLabel), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByLabelText(copy.areaOptions[0].label));
    fireEvent.submit(screen.getByRole("form", { name: copy.formLabel }));

    expect(readPersonalizationRequest()).toMatchObject({
      startAt: "2026-09-05T10:30:00+07:00",
      durationMinutes: 240,
      partySize: 4,
      areas: [copy.areaOptions[0].value],
    });
  });

  it("blocks a preview when party size, budget, or every priority weight is invalid", () => {
    const dictionary = getDictionary("en");

    render(<PersonalizationForm copy={dictionary.home.personalizationForm} />);
    const form = screen.getByRole("form", { name: dictionary.home.personalizationForm.formLabel });
    fireEvent.change(screen.getByLabelText(dictionary.home.personalizationForm.startDateLabel), {
      target: { value: "2026-09-05" },
    });
    fireEvent.click(screen.getByLabelText(dictionary.home.personalizationForm.areaOptions[0].label));
    fireEvent.change(screen.getByLabelText(dictionary.home.personalizationForm.partySizeLabel), {
      target: { value: "0" },
    });
    for (const priority of dictionary.home.personalizationForm.priorities) {
      fireEvent.change(screen.getByLabelText(priority.label), { target: { value: "0" } });
    }
    fireEvent.submit(form);

    expect(screen.getByRole("alert")).toHaveTextContent(
      dictionary.home.personalizationForm.validationMessage,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("uses whole VND minor units and cents for USD", () => {
    const dictionary = getDictionary("en");

    render(<PersonalizationForm copy={dictionary.home.personalizationForm} />);
    const amount = screen.getByLabelText(dictionary.home.personalizationForm.budgetLabel);
    expect(amount).toHaveAttribute("step", "1");
    fireEvent.change(screen.getByLabelText(dictionary.home.personalizationForm.budgetCurrencyLabel), {
      target: { value: "USD" },
    });
    expect(amount).toHaveAttribute("step", "0.01");
  });

  it("maps USD decimals to exact positive cents and rejects sub-cent or fractional VND", () => {
    const formData = new FormData();
    formData.set("startDate", "2026-09-05");
    formData.set("startTime", "09:00");
    formData.set("durationMinutes", "180");
    formData.set("areas", "demo-hcmc-district-1");
    formData.set("budgetCurrency", "USD");
    formData.set("budgetAmount", "1.01");

    expect(buildPersonalizationRequest(formData).budget.amountMinor).toBe(101);
    expect(parseBudgetAmountMinor("USD", "90071992547409.91")).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseBudgetAmountMinor("USD", "90071992547409.92")).toBeNull();

    for (const invalidAmount of ["1.001", "0.001"]) {
      formData.set("budgetAmount", invalidAmount);
      expect(() => buildPersonalizationRequest(formData)).toThrow(/budget/i);
    }

    formData.set("budgetCurrency", "VND");
    formData.set("budgetAmount", "1000.5");
    expect(() => buildPersonalizationRequest(formData)).toThrow(/budget/i);
  });
});
