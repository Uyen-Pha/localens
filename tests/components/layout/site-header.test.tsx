import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteHeader } from "@/components/layout/site-header";

const labels = {
  brand: "LocalLens",
  navigation: {
    primary: "Primary navigation",
    explore: "Explore",
    fixedTours: "Fixed tours",
    planTrip: "Plan my trip",
    signIn: "Sign in",
  },
  language: {
    label: "Language",
    options: {
      en: "English",
      vi: "Tiếng Việt",
    },
  },
};

describe("SiteHeader", () => {
  it("renders an accessible primary navigation with a path-preserving language link", () => {
    render(
      <SiteHeader
        locale="en"
        labels={labels}
        pathname="/en/explore/"
      />,
    );

    expect(
      screen.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explore" })).toHaveAttribute(
      "href",
      "/en/explore",
    );
    expect(screen.getByRole("link", { name: "Fixed tours" })).toHaveAttribute(
      "href",
      "/en/tours",
    );
    expect(screen.getByRole("link", { name: "Plan my trip" })).toHaveAttribute(
      "href",
      "/en/plan",
    );
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/en/sign-in",
    );
    expect(screen.getByRole("link", { name: "Tiếng Việt" })).toHaveAttribute(
      "href",
      "/vi/explore",
    );

    for (const link of screen.getAllByRole("link")) {
      expect(link).not.toHaveAttribute("tabindex", "-1");
    }
  });
});
