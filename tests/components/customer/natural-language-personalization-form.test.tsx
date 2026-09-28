import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NaturalLanguagePersonalizationForm } from "@/components/customer/natural-language-personalization-form";
import { getDictionary } from "@/lib/i18n/dictionaries";

const mocks = vi.hoisted(() => ({
  loadPortalSurfaceComposition: vi.fn(async () => ({
    mode: "demo" as const,
    initialized: Promise.resolve(),
  })),
}));

vi.mock("@/components/portals/portal-session", () => ({
  loadPortalSurfaceComposition: mocks.loadPortalSurfaceComposition,
}));

afterEach(() => {
  cleanup();
  mocks.loadPortalSurfaceComposition.mockClear();
});

describe("NaturalLanguagePersonalizationForm", () => {
  it("shows the natural-language entry and manual-form option by default", async () => {
    const copy = getDictionary("vi").home.personalizationForm;

    render(
      <NaturalLanguagePersonalizationForm
        locale="vi"
        copy={copy}
        onSwitchToManual={() => undefined}
      />,
    );

    expect(await screen.findByRole("textbox", { name: "Mô tả nhu cầu chuyến đi" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Phân tích nhu cầu" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Tự nhập chi tiết" })).toBeVisible();
  });
});
