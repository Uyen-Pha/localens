import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PersonalizationForm } from "@/components/customer/personalization-form";
import { getDictionary } from "@/lib/i18n/dictionaries";

afterEach(cleanup);

describe("PersonalizationForm", () => {
  it("exposes every planning preference in a labeled, grouped form", () => {
    const dictionary = getDictionary("en");

    render(<PersonalizationForm copy={dictionary.home.personalizationForm} />);

    expect(screen.getByRole("form", { name: dictionary.home.personalizationForm.formLabel })).toBeInTheDocument();
    expect(screen.getByLabelText(dictionary.home.personalizationForm.durationLabel)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: dictionary.home.personalizationForm.areasLabel })).toBeInTheDocument();
    expect(screen.getByLabelText(dictionary.home.personalizationForm.budgetLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(dictionary.home.personalizationForm.startDateLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(dictionary.home.personalizationForm.startTimeLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(dictionary.home.personalizationForm.languageLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(dictionary.home.personalizationForm.partySizeLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(dictionary.home.personalizationForm.paceLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(dictionary.home.personalizationForm.dietLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(dictionary.home.personalizationForm.mobilityLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(dictionary.home.personalizationForm.specialNeedsLabel)).toBeInTheDocument();

    const priorityGroup = screen.getByRole("group", {
      name: dictionary.home.personalizationForm.prioritiesLegend,
    });
    expect(priorityGroup).toBeInTheDocument();
    for (const priority of dictionary.home.personalizationForm.priorities) {
      expect(screen.getByLabelText(priority)).toBeInTheDocument();
    }
  });

  it("explains that submit is only a local preview until the planning API is connected", () => {
    const dictionary = getDictionary("en");

    render(<PersonalizationForm copy={dictionary.home.personalizationForm} />);

    fireEvent.submit(screen.getByRole("form", { name: dictionary.home.personalizationForm.formLabel }));

    expect(screen.getByRole("status")).toHaveTextContent(
      dictionary.home.personalizationForm.previewMessage,
    );
    expect(screen.queryByText(dictionary.home.personalizationForm.confirmationMessage)).not.toBeInTheDocument();
  });
});
