import type { ReactElement, ReactNode } from "react";

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/font/local", () => ({
  default: (options: { variable?: string }) => ({
    className: "mock-font-class",
    variable: options.variable ?? "mock-font-variable",
    style: {},
  }),
}));

import LocaleLayout from "@/app/[locale]/layout";
import { ThesisDemoBadge } from "@/components/customer/thesis-demo-badge";

afterEach(() => {
  cleanup();
});

describe("ThesisDemoBadge", () => {
  it.each([
    ["en" as const, "Thesis demo"],
    ["vi" as const, "Bản demo đồ án"],
  ])("renders a text-only semantic note in %s", (locale, label) => {
    const { container } = render(<ThesisDemoBadge locale={locale} />);

    expect(screen.getByRole("note")).toHaveTextContent(label);
    expect(container.querySelector("img, svg, picture, canvas")).toBeNull();
  });

  it("places the localized badge inside the global site header", async () => {
    const layout = await LocaleLayout({
      children: <p>Localized content</p>,
      params: Promise.resolve({ locale: "vi" }),
    });
    const root = layout as ReactElement<{ children: ReactNode }>;
    const body = root.props.children as ReactElement<{ children: ReactNode }>;
    const { container } = render(<>{body.props.children}</>);
    const header = within(container).getByRole("banner");

    expect(within(header).getByRole("note")).toHaveTextContent("Bản demo đồ án");
  });
});
