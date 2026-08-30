import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

vi.mock("next/font/local", () => ({
  default: (options: { variable?: string }) => {
    const name = options.variable === "--font-display" ? "mock-display" : "mock-body";
    return {
    className: `${name}-font-class`,
    variable: `${name}-font-variable`,
    style: {},
    };
  },
}));

import { SiteHeader } from "@/components/layout/site-header";
import { getEquivalentLocalePath } from "@/components/i18n/locale-switcher";
import LocaleLayout from "@/app/[locale]/layout";

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
  it("preserves the exact opaque search string when switching locale", () => {
    const search = "?plan=opaque%2F%2B&filter=a+b&filter=%E2%9C%93";

    expect(getEquivalentLocalePath("/en/planner/", "vi", search)).toBe(
      `/vi/planner/${search}`,
    );
  });

  it("renders an accessible primary navigation with a path-preserving language link", () => {
    render(
      <SiteHeader
        locale="en"
        labels={labels}
        pathname="/en/"
      />,
    );

    expect(
      screen.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explore" })).toHaveAttribute(
      "href",
      "/en/tours",
    );
    expect(screen.getByRole("link", { name: "Fixed tours" })).toHaveAttribute(
      "href",
      "/en/tours",
    );
    expect(screen.getByRole("link", { name: "Plan my trip" })).toHaveAttribute(
      "href",
      "/en#personalize",
    );
    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
    expect(screen.getByText("Sign in")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("link", { name: "Tiếng Việt" })).toHaveAttribute(
      "href",
      "/vi",
    );

    for (const link of screen.getAllByRole("link")) {
      expect(link).not.toHaveAttribute("tabindex", "-1");
    }
  });

  it("keeps the localized document shell and stable editorial font variables", async () => {
    const layout = await LocaleLayout({
      children: <p>Localized content</p>,
      params: Promise.resolve({ locale: "vi" }),
    });
    const root = layout as ReactElement<{
      lang: string;
      className?: string;
      children: ReactNode;
    }>;
    const body = root.props.children as ReactElement<{ children: ReactNode }>;
    const { container } = render(<>{body.props.children}</>);
    const view = within(container);

    expect(root.props.lang).toBe("vi");
    expect(root.props.className ?? "").toContain("mock-display-font-variable");
    expect(root.props.className ?? "").toContain("mock-body-font-variable");
    expect(view.getByRole("link", { name: "Bỏ qua đến nội dung chính" })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(view.getByRole("navigation", { name: "Điều hướng chính" })).toBeInTheDocument();
    expect(view.getByRole("main")).toContainElement(view.getByText("Localized content"));
    expect(view.getByRole("contentinfo")).toBeInTheDocument();
  });
});
