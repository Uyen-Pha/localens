import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CustomerHome } from "@/components/customer/customer-home";
import { getDictionary } from "@/lib/i18n/dictionaries";

describe("CustomerHome", () => {
  it("introduces local discovery, trust, and the four fixed-tour themes", () => {
    const dictionary = getDictionary("en");

    render(<CustomerHome locale="en" dictionary={dictionary} />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: dictionary.home.title,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: dictionary.home.heroPrimaryCta })).toHaveAttribute(
      "href",
      "/en/tours",
    );
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: dictionary.home.discoveryTitle,
      }),
    ).toBeInTheDocument();

    for (const tour of dictionary.home.fixedTours) {
      expect(screen.getByRole("heading", { level: 3, name: tour.title })).toBeInTheDocument();
      expect(screen.getByText(tour.description)).toBeInTheDocument();
    }

    expect(screen.getByRole("heading", { level: 2, name: dictionary.home.trustTitle })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: dictionary.home.personalizationTitle })).toBeInTheDocument();
  });

  it("keeps the homepage content localized for Vietnamese visitors", () => {
    const dictionary = getDictionary("vi");

    render(<CustomerHome locale="vi" dictionary={dictionary} />);

    expect(screen.getByRole("heading", { level: 1, name: dictionary.home.title })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: dictionary.home.heroPrimaryCta })).toHaveAttribute(
      "href",
      "/vi/tours",
    );
    expect(screen.getByRole("heading", { level: 2, name: dictionary.home.discoveryTitle })).toBeInTheDocument();
  });
});
