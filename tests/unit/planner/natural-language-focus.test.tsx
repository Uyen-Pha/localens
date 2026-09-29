import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NaturalLanguagePersonalizationForm } from "@/components/customer/natural-language-personalization-form";
import { getDictionary } from "@/lib/i18n/dictionaries";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it.each(["en", "vi"] as const)("%s reveals the whole description on focus without changing its value", async locale => {
  render(<NaturalLanguagePersonalizationForm
    locale={locale}
    copy={getDictionary(locale).home.personalizationForm}
    composition={{ mode: "demo", initialized: Promise.resolve() }}
  />);
  await screen.findByText(locale === "en" ? "The planner is ready." : "Bộ lập lịch đã sẵn sàng.");
  const field = screen.getByRole("textbox", { name: locale === "en" ? "Describe your trip" : "Mô tả nhu cầu chuyến đi" });
  // jsdom has no viewport scrolling; the browser bounds test verifies the result.
  const scrollIntoView = vi.fn();
  Object.defineProperty(field, "scrollIntoView", { value: scrollIntoView, configurable: true });
  vi.spyOn(field, "getBoundingClientRect").mockReturnValue(new DOMRect(65, window.innerHeight - 145, 260, 182.5));
  fireEvent.change(field, { target: { value: "Keep my trip description" } });
  fireEvent.focus(field);
  expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: "center", inline: "nearest", behavior: "instant" });
  expect(field).toHaveValue("Keep my trip description");
  fireEvent.change(field, { target: { value: "Updated trip description" } });
  expect(field).toHaveValue("Updated trip description");
});

it.each([
  { name: "fully visible desktop field", x: 100, y: 100, scroll: false },
  { name: "focus ring exactly within the viewport", x: 4, y: 4, scroll: false },
  { name: "top focus ring clipped", x: 100, y: 3, scroll: true },
  { name: "left focus ring clipped", x: 3, y: 100, scroll: true },
  { name: "bottom focus ring clipped", x: 100, y: window.innerHeight - 182 - 3, scroll: true },
  { name: "right focus ring clipped", x: window.innerWidth - 260 - 3, y: 100, scroll: true },
])("focus scroll guard: $name", async ({ x, y, scroll }) => {
  render(<NaturalLanguagePersonalizationForm locale="en" copy={getDictionary("en").home.personalizationForm}
    composition={{ mode: "demo", initialized: Promise.resolve() }} />);
  await screen.findByText("The planner is ready.");
  const field = screen.getByRole("textbox", { name: "Describe your trip" });
  field.style.outlineStyle = "solid";
  field.style.outlineWidth = "3px";
  field.style.outlineOffset = "1px";
  vi.spyOn(field, "getBoundingClientRect").mockReturnValue(new DOMRect(x, y, 260, 182));
  const scrollIntoView = vi.fn();
  Object.defineProperty(field, "scrollIntoView", { value: scrollIntoView, configurable: true });
  fireEvent.focus(field);
  if (scroll) expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: "center", inline: "nearest", behavior: "instant" });
  else expect(scrollIntoView).not.toHaveBeenCalled();
});
