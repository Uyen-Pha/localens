import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ToursPage, { generateMetadata } from "@/app/[locale]/tours/page";
import { createReadOnlyApi } from "@/lib/application/api/read-only-api";
import { getDemoDepartureForTourSlug } from "@/lib/application/booking/mock-booking";
import { getDictionary } from "@/lib/i18n/dictionaries";

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

    expect(screen.getByRole("heading", { level: 1, name: dictionary.home.tourCatalog.catalogHeading })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(dictionary.home.tourCatalog.disclosure);
    for (const tour of catalogResult.value.tours) {
      expect(screen.getByRole("heading", { level: 2, name: tour.title })).toBeInTheDocument();
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
});
