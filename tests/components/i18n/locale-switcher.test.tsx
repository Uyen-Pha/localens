import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LocaleSwitcher } from "@/components/i18n/locale-switcher";

const labels = {
  label: "Language",
  options: {
    en: "English",
    vi: "Tiếng Việt",
  },
};

describe("LocaleSwitcher", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
    vi.restoreAllMocks();
  });

  it("hydrates a stable locale link before preserving the browser hash", async () => {
    window.history.replaceState({}, "", "/en/");
    const serverMarkup = renderToString(
      <LocaleSwitcher locale="en" labels={labels} pathname="/en/" />,
    );
    const container = document.createElement("div");
    container.innerHTML = serverMarkup;
    document.body.append(container);
    expect(within(container).getByRole("link", { name: "Tiếng Việt" })).toHaveAttribute(
      "href",
      "/vi",
    );

    window.history.replaceState({}, "", "/en/#personalize");
    const consoleErrors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(" "));
    });
    let root: Root | undefined;

    try {
      await act(async () => {
        root = hydrateRoot(
          container,
          <LocaleSwitcher locale="en" labels={labels} pathname="/en/" />,
        );
      });

      expect(consoleErrors.join("\n")).not.toMatch(/hydration|hydrated/i);
      expect(
        within(container).getByRole("link", { name: "Tiếng Việt" }),
      ).toHaveAttribute("href", "/vi#personalize");
    } finally {
      await act(async () => {
        root?.unmount();
      });
      container.remove();
    }
  });
});
