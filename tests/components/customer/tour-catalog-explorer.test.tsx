import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  TourCatalogExplorer,
  type TourCatalogError,
} from "@/components/customer/tour-catalog-explorer";
import { createReadOnlyApi } from "@/lib/application/api/read-only-api";
import { getDictionary } from "@/lib/i18n/dictionaries";

afterEach(cleanup);

describe("TourCatalogExplorer", () => {
  it("uses the read-only API filter contract for keyword and area filtering", async () => {
    const dictionary = getDictionary("en");
    const catalogResult = createReadOnlyApi().listTours("en");
    if (!catalogResult.ok) throw new Error("expected demo catalog");

    render(
      <TourCatalogExplorer
        locale="en"
        copy={dictionary.home.tourCatalog}
        areaOptions={dictionary.home.tourCatalog.areaOptions}
        initialCatalog={catalogResult.value}
      />,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Markets and Street Food" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: dictionary.home.tourCatalog.filtersLegend })).toHaveClass(
      "tour-catalog-filters--editorial",
    );
    expect(screen.getByRole("heading", { level: 2, name: "Markets and Street Food" }).closest(".demo-tour-card")).toHaveClass(
      "demo-tour-card--editorial",
    );
    expect(screen.getByRole("button", { name: dictionary.home.tourCatalog.clearFiltersLabel })).toHaveClass(
      "button--quiet",
    );
    expect(screen.getByRole("link", { name: `${dictionary.home.tourCatalog.bookLabel} Markets and Street Food` })).toHaveAttribute(
      "href",
      "/en/booking?departure=demo-departure-markets-and-street-food-2026-09-05&partySize=1",
    );
    fireEvent.change(screen.getByLabelText(dictionary.home.tourCatalog.keywordLabel), {
      target: { value: "CHO LON" },
    });
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Cho Lon Craft Traditions" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { level: 2, name: "Markets and Street Food" })).not.toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(dictionary.home.tourCatalog.areaLabel), {
      target: { value: "demo-hcmc-district-5" },
    });
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Cho Lon Craft Traditions" })).toBeInTheDocument();
    });
  });

  it("filters the read-only catalog by experience type", async () => {
    const dictionary = getDictionary("en");
    const copy = dictionary.home.tourCatalog;
    const catalogResult = createReadOnlyApi().listTours("en");
    if (!catalogResult.ok) throw new Error("expected demo catalog");

    render(
      <TourCatalogExplorer
        locale="en"
        copy={copy}
        areaOptions={copy.areaOptions}
        initialCatalog={catalogResult.value}
      />,
    );

    const experienceSelect = screen.getByLabelText(copy.experienceLabel);
    fireEvent.change(experienceSelect, { target: { value: "traditional_craft" } });
    await waitFor(() => {
      expect(experienceSelect).toHaveValue("traditional_craft");
      expect(screen.getByRole("heading", { level: 2, name: "Cho Lon Craft Traditions" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { level: 2, name: "Markets and Street Food" })).not.toBeInTheDocument();
    });
  });

  it("keeps native filters, details, and booking actions focusable and behaviorally wired", async () => {
    const dictionary = getDictionary("en");
    const copy = dictionary.home.tourCatalog;
    const catalogResult = createReadOnlyApi().listTours("en");
    if (!catalogResult.ok) throw new Error("expected demo catalog");

    render(
      <TourCatalogExplorer
        locale="en"
        copy={copy}
        areaOptions={copy.areaOptions}
        initialCatalog={catalogResult.value}
      />,
    );

    const keywordInput = screen.getByLabelText(copy.keywordLabel);
    const areaSelect = screen.getByLabelText(copy.areaLabel);
    const experienceSelect = screen.getByLabelText(copy.experienceLabel);
    const clearButton = screen.getByRole("button", { name: copy.clearFiltersLabel });
    const summary = screen.getAllByText(copy.detailsLabel)[0];
    const bookingLink = screen.getByRole("link", { name: `${copy.bookLabel} Markets and Street Food` });

    expect(keywordInput.tagName).toBe("INPUT");
    expect(keywordInput).toHaveAttribute("type", "search");
    expect(keywordInput).not.toBeDisabled();
    expect(areaSelect.tagName).toBe("SELECT");
    expect(areaSelect).not.toBeDisabled();
    expect(experienceSelect.tagName).toBe("SELECT");
    expect(experienceSelect).not.toBeDisabled();
    expect(clearButton.tagName).toBe("BUTTON");
    expect(clearButton).toHaveAttribute("type", "button");
    expect(clearButton).not.toBeDisabled();
    expect(summary.tagName).toBe("SUMMARY");
    expect(summary.parentElement?.tagName).toBe("DETAILS");
    expect(summary.parentElement).not.toHaveAttribute("open");
    expect(bookingLink.tagName).toBe("A");
    expect(bookingLink).toHaveAttribute(
      "href",
      "/en/booking?departure=demo-departure-markets-and-street-food-2026-09-05&partySize=1",
    );

    const focusOrder = [keywordInput, areaSelect, experienceSelect, clearButton, summary, bookingLink];
    for (let index = 0; index < focusOrder.length - 1; index += 1) {
      const current = focusOrder[index];
      const next = focusOrder[index + 1];
      expect(current.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    }
    for (const control of focusOrder) {
      control.focus();
      expect(control).toHaveFocus();
      expect(control).toHaveProperty("tabIndex", 0);
    }

    fireEvent.change(keywordInput, { target: { value: "CHO LON" } });
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "Cho Lon Craft Traditions" })).toBeInTheDocument());
    clearButton.focus();
    fireEvent.click(clearButton);
    await waitFor(() => {
      expect(keywordInput).toHaveValue("");
      expect(screen.getByRole("heading", { level: 2, name: "Markets and Street Food" })).toBeInTheDocument();
    });

    const refreshedSummary = screen.getAllByText(copy.detailsLabel)[0];
    refreshedSummary.focus();
    fireEvent.click(refreshedSummary);
    expect(refreshedSummary.parentElement).toHaveAttribute("open");

    const refreshedBookingLink = screen.getByRole("link", { name: `${copy.bookLabel} Markets and Street Food` });
    refreshedBookingLink.addEventListener("click", (event) => event.preventDefault(), { once: true });
    refreshedBookingLink.focus();
    fireEvent.click(refreshedBookingLink);
    expect(refreshedBookingLink).toHaveFocus();
  });

  it("renders localized empty and API error states", async () => {
    const dictionary = getDictionary("vi");
    const catalogResult = createReadOnlyApi().listTours("vi");
    if (!catalogResult.ok) throw new Error("expected demo catalog");
    const error: TourCatalogError = {
      retryable: true,
      correlationId: "11111111-1111-4111-8111-111111111111",
    };

    render(
      <TourCatalogExplorer
        locale="vi"
        copy={dictionary.home.tourCatalog}
        areaOptions={dictionary.home.tourCatalog.areaOptions}
        initialCatalog={catalogResult.value}
      />,
    );
    fireEvent.change(screen.getByLabelText(dictionary.home.tourCatalog.areaLabel), {
      target: { value: "demo-hcmc-thu-duc" },
    });
    expect(screen.getByRole("status")).toHaveTextContent(dictionary.home.tourCatalog.noResults);

    cleanup();
    render(
      <TourCatalogExplorer
        locale="vi"
        copy={dictionary.home.tourCatalog}
        areaOptions={dictionary.home.tourCatalog.areaOptions}
        initialCatalog={null}
        initialError={error}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(dictionary.home.tourCatalog.errorMessage);
    expect(screen.getByRole("alert")).toHaveTextContent(error.correlationId);
    expect(screen.getByRole("button", { name: dictionary.home.tourCatalog.retryLabel })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: dictionary.home.tourCatalog.retryLabel }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Chợ địa phương và ẩm thực đường phố" })).toBeInTheDocument();
    });
  });
});
