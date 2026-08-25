import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ToursPage from "@/app/[locale]/tours/page";
import { getDictionary } from "@/lib/i18n/dictionaries";

describe("localized fixed tours page", () => {
  it("renders a static, localized destination for every fixed-tour card", async () => {
    const dictionary = getDictionary("en");

    render(await ToursPage({ params: Promise.resolve({ locale: "en" }) }));

    expect(screen.getByRole("heading", { level: 1, name: dictionary.home.discoveryTitle })).toBeInTheDocument();
    for (const tour of dictionary.home.fixedTours) {
      expect(screen.getByRole("heading", { level: 2, name: tour.title })).toBeInTheDocument();
      expect(screen.getByText(tour.description)).toBeInTheDocument();
      expect(document.getElementById(tour.id)).toBeInTheDocument();
    }
  });
});
