import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CustomerHome } from "@/components/customer/customer-home";
import { getDictionary } from "@/lib/i18n/dictionaries";

afterEach(cleanup);

describe("CustomerHome", () => {
  it("renders the green hero with personalization as the primary route", () => {
    const dictionary = getDictionary("en");

    render(<CustomerHome locale="en" dictionary={dictionary} />);

    expect(dictionary.home.title).toBe("Your Saigon, planned around you");
    expect(dictionary.home.discoveryTitle).toBe("Four ways into the city");
    expect(document.querySelector(".customer-home")).toHaveClass("customer-home--landing", "customer-home--green");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: dictionary.home.title,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: dictionary.home.heroPrimaryCta })).toHaveAttribute(
      "href",
      "/en/planner",
    );
    expect(screen.getByRole("link", { name: dictionary.home.heroSecondaryCta })).toHaveAttribute(
      "href",
      "/en/tours",
    );
    expect(screen.getByRole("img", { name: dictionary.home.heroImageAlt })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: dictionary.home.heroInsetAlt })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: dictionary.home.heroImageAlt })).toHaveAttribute(
      "src",
      expect.stringContaining("saigon-map.png"),
    );
    expect(document.querySelector(".customer-hero__route-card")).not.toBeNull();
    expect(screen.getByRole("complementary", { name: dictionary.home.heroRoute.ariaLabel })).toHaveTextContent(
      dictionary.home.heroRoute.modeValue,
    );
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: dictionary.home.discoveryTitle,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(dictionary.home.demoDisclosure);

    const experiences = screen.getByRole("region", { name: dictionary.home.discoveryTitle });
    expect(within(experiences).getAllByRole("heading", { level: 3 })).toHaveLength(4);
    expect(experiences.querySelectorAll("img")).toHaveLength(4);
    for (const category of dictionary.home.experienceCategories) {
      expect(within(experiences).getByRole("heading", { level: 3, name: category.title })).toBeInTheDocument();
      expect(within(experiences).getByRole("heading", { level: 3, name: category.title }).closest("article")?.querySelector("img")).toHaveAttribute(
        "alt",
        "",
      );
    }

    expect(dictionary.home.trustTitle).toBe("How it works");
    expect(screen.getByRole("heading", { level: 2, name: dictionary.home.trustTitle })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: dictionary.home.personalizationTitle })).toBeInTheDocument();
  });

  it("keeps the homepage content localized for Vietnamese visitors", () => {
    const dictionary = getDictionary("vi");

    render(<CustomerHome locale="vi" dictionary={dictionary} />);

    expect(dictionary.home.title).toBe("Sài Gòn của bạn, được thiết kế quanh bạn");
    expect(dictionary.home.discoveryTitle).toBe("Bốn cách bước vào thành phố");
    expect(screen.getByRole("heading", { level: 1, name: dictionary.home.title })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: dictionary.home.heroPrimaryCta })).toHaveAttribute(
      "href",
      "/vi/planner",
    );
    expect(screen.getByRole("link", { name: dictionary.home.heroSecondaryCta })).toHaveAttribute(
      "href",
      "/vi/tours",
    );
    expect(screen.getByRole("heading", { level: 2, name: dictionary.home.discoveryTitle })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(dictionary.home.demoDisclosure);
    expect(screen.getByRole("img", { name: dictionary.home.heroImageAlt })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: dictionary.home.heroRoute.ariaLabel })).toHaveTextContent(
      dictionary.home.heroRoute.modeValue,
    );
  });

  it("keeps editorial home selectors scoped away from non-home routes", async () => {
    const css = await readFile(resolve(process.cwd(), "app/styles/editorial-home.css"), "utf8");
    const homeSelectors = [
      "customer-home",
      "customer-hero",
      "customer-section",
      "section-heading",
      "button",
      "button--primary",
      "button--secondary",
      "experience-grid",
      "experience-intro",
      "experience-card",
      "editorial-rule",
      "tour-grid",
      "tour-card",
      "trust-grid",
      "trust-card",
      "personalization-form",
      "form-timezone",
      "form-preview",
      "form-validation",
    ];

    expect(css).toContain(".customer-home--landing");
    for (const selector of homeSelectors) {
      expect(css).not.toMatch(new RegExp(`^\\s*\\.${selector}(?=\\s|[{: ,])`, "m"));
    }
  });

  it("keeps the SAI/GON mark inside the tablet gutter", async () => {
    const css = await readFile(resolve(process.cwd(), "app/styles/editorial-home.css"), "utf8");

    expect(css).not.toContain("left: -1.5rem");
    expect(css).toMatch(
      /@media \(max-width: 1100px\) \{[\s\S]*?\.customer-home--landing \.customer-hero__mark \{[\s\S]*?left: 0;/,
    );
  });
});
