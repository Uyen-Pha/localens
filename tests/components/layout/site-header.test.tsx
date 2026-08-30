import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    experiences: "Experiences",
    privateJourneys: "Private journeys",
    ourCity: "Our city",
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
  afterEach(() => {
    cleanup();
  });

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
    expect(screen.getByRole("link", { name: "Experiences" })).toHaveAttribute(
      "href",
      "/en/tours",
    );
    expect(
      screen.getByRole("link", { name: "Private journeys" }),
    ).toHaveAttribute(
      "href",
      "/en/planner",
    );
    expect(screen.getByRole("link", { name: "Our city" })).toHaveAttribute(
      "href",
      "/en#experiences",
    );
    expect(screen.queryByRole("link", { name: "Journal" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
    expect(screen.getByText("Sign in")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("navigation", { name: "Language" })).toBeInTheDocument();
    expect(screen.getByText("English")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Tiếng Việt" })).toHaveAttribute(
      "href",
      "/vi",
    );

    for (const link of screen.getAllByRole("link")) {
      expect(link).not.toHaveAttribute("tabindex", "-1");
    }
  });

  it("keeps the opaque path and query contract on the locale switch link", () => {
    const search = "?plan=opaque%2F%2B&filter=a+b&filter=%E2%9C%93";

    render(
      <SiteHeader
        locale="en"
        labels={labels}
        pathname="/en/planner/"
        search={search}
      />,
    );

    expect(screen.getByRole("link", { name: "Tiếng Việt" })).toHaveAttribute(
      "href",
      `/vi/planner${search}`,
    );
  });

  it("preserves an opaque hash alongside the exact query string", () => {
    const search = "?plan=opaque%2F%2B&filter=a+b&filter=%E2%9C%93";
    const hash = "#experiences%2F%2B?tab=local%20life";

    expect(getEquivalentLocalePath("/en/", "vi", search, hash)).toBe(
      `/vi/${search}${hash}`,
    );

    render(
      <SiteHeader
        locale="en"
        labels={labels}
        pathname="/en/"
        search={search}
        hash={hash}
      />,
    );

    expect(screen.getByRole("link", { name: "Tiếng Việt" })).toHaveAttribute(
      "href",
      `/vi${search}${hash}`,
    );
  });

  it("renders the Vietnamese navigation with equivalent destinations", () => {
    render(
      <SiteHeader
        locale="vi"
        labels={{
          ...labels,
          navigation: {
            primary: "Điều hướng chính",
            experiences: "Trải nghiệm",
            privateJourneys: "Hành trình riêng",
            ourCity: "Thành phố của chúng ta",
            signIn: "Đăng nhập",
          },
          language: {
            label: "Ngôn ngữ",
            options: labels.language.options,
          },
        }}
        pathname="/vi/"
      />,
    );

    expect(screen.getByRole("link", { name: "Trải nghiệm" })).toHaveAttribute(
      "href",
      "/vi/tours",
    );
    expect(
      screen.getByRole("link", { name: "Hành trình riêng" }),
    ).toHaveAttribute("href", "/vi/planner");
    expect(
      screen.getByRole("link", { name: "Thành phố của chúng ta" }),
    ).toHaveAttribute("href", "/vi#experiences");
    expect(screen.getByText("Tiếng Việt")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "English" })).toHaveAttribute(
      "href",
      "/en",
    );
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
