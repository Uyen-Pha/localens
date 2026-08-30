import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CustomerHome } from "@/components/customer/customer-home";
import ToursPage, { generateMetadata } from "@/app/[locale]/tours/page";
import { createReadOnlyApi } from "@/lib/application/api/read-only-api";
import { getDemoDepartureForTourSlug } from "@/lib/application/booking/mock-booking";
import { getDictionary } from "@/lib/i18n/dictionaries";

afterEach(cleanup);

describe("localized fixed tours page", () => {
  it("keeps the browser title and Open Graph title aligned", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "en" }) });

    expect(metadata.title).toBe(metadata.openGraph?.title);
  });

  it("renders the localized internal demo catalog and its exact tour facts", async () => {
    const dictionary = getDictionary("en");
    const catalogResult = createReadOnlyApi().listTours("en");
    if (!catalogResult.ok) throw new Error("expected demo catalog");

    render(await ToursPage({ params: Promise.resolve({ locale: "en" }) }));

    const heading = screen.getByRole("heading", { level: 1, name: dictionary.home.tourCatalog.catalogHeading });
    expect(heading).toBeInTheDocument();
    expect(heading.closest(".section-heading")).toHaveClass("section-heading--tours");
    expect(screen.getByRole("note")).toHaveTextContent(dictionary.home.tourCatalog.disclosure);
    expect(screen.getByRole("group", { name: dictionary.home.tourCatalog.filtersLegend })).toHaveClass(
      "tour-catalog-filters--editorial",
    );
    expect(document.querySelector(".demo-tour-grid")).toHaveClass("demo-tour-grid--editorial");
    for (const tour of catalogResult.value.tours) {
      const cardHeading = screen.getByRole("heading", { level: 2, name: tour.title });
      expect(cardHeading).toBeInTheDocument();
      expect(cardHeading.closest(".demo-tour-card")).toHaveClass("demo-tour-card--editorial");
      expect(screen.getByText(tour.summary)).toBeInTheDocument();
      expect(screen.getByText(tour.meetingPoint)).toBeInTheDocument();
      expect(screen.getByText(tour.sourceUrl)).toBeInTheDocument();
      expect(screen.getAllByText(tour.attribution).length).toBeGreaterThan(0);
      expect(screen.getAllByText(tour.verifiedAt).length).toBeGreaterThan(0);
    }
    for (const tour of catalogResult.value.tours) {
      const departure = getDemoDepartureForTourSlug(tour.slug);
      if (departure === undefined) throw new Error(`missing demo departure for ${tour.slug}`);
      expect(screen.getByRole("link", { name: `${dictionary.home.tourCatalog.bookLabel} ${tour.title}` })).toHaveAttribute(
        "href",
        `/en/booking?departure=${departure.departureId}&partySize=1`,
      );
    }
  });

  it("keeps every filter and card label localized in English and Vietnamese", async () => {
    for (const locale of ["en", "vi"] as const) {
      const dictionary = getDictionary(locale);
      const copy = dictionary.home.tourCatalog;
      const catalogResult = createReadOnlyApi().listTours(locale);
      if (!catalogResult.ok) throw new Error(`expected ${locale} demo catalog`);

      render(await ToursPage({ params: Promise.resolve({ locale }) }));

      const filters = screen.getByRole("group", { name: copy.filtersLegend });
      expect(within(filters).getByText(copy.filtersLegend)).toBeInTheDocument();
      expect(screen.getByLabelText(copy.keywordLabel)).toBeInTheDocument();
      expect(screen.getByLabelText(copy.areaLabel)).toBeInTheDocument();
      expect(screen.getByLabelText(copy.experienceLabel)).toBeInTheDocument();
      expect(within(filters).getByRole("option", { name: copy.allAreasLabel })).toBeInTheDocument();
      expect(within(filters).getByRole("option", { name: copy.allExperienceTypesLabel })).toBeInTheDocument();
      for (const option of [...copy.areaOptions, ...copy.experienceTypeOptions]) {
        expect(within(filters).getByRole("option", { name: option.label })).toBeInTheDocument();
      }
      expect(within(filters).getByRole("button", { name: copy.clearFiltersLabel })).toBeInTheDocument();

      const firstTour = catalogResult.value.tours[0];
      if (!firstTour) throw new Error(`expected ${locale} tour card`);
      const firstCardHeading = screen.getByRole("heading", { level: 2, name: firstTour.title });
      const firstCard = firstCardHeading.closest<HTMLElement>(".demo-tour-card");
      if (!firstCard) throw new Error(`expected ${locale} tour card container`);

      for (const label of [
        copy.detailsLabel,
        copy.durationLabel,
        copy.priceLabel,
        copy.meetingPointLabel,
        copy.experienceTypesLabel,
        copy.areasLabel,
        copy.stopsLabel,
        copy.inclusionsLabel,
        copy.exclusionsLabel,
        copy.cancellationPolicyLabel,
        copy.sourceLabel,
        copy.attributionLabel,
        copy.verifiedLabel,
        copy.licenseLabel,
      ]) {
        expect(firstCard).toHaveTextContent(label);
      }
      expect(within(firstCard).getByRole("link", { name: `${copy.bookLabel} ${firstTour.title}` })).toBeInTheDocument();

      cleanup();
    }
  });

  it("keeps the fixed-tour grid and cards on the editorial class contract", () => {
    const dictionary = getDictionary("en");

    render(<CustomerHome locale="en" dictionary={dictionary} />);

    const grid = document.querySelector(".tour-grid");
    expect(grid).not.toBeNull();
    expect(grid).toHaveClass("tour-grid--editorial");
    for (const tour of dictionary.home.fixedTours) {
      const card = document.getElementById(tour.id);
      expect(card).not.toBeNull();
      expect(card).toHaveClass("tour-card--editorial");
    }
  });
});
