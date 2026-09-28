import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import BookingPage from "@/app/[locale]/booking/page";

const originalRuntimeMode = process.env.NEXT_PUBLIC_LOCALLENS_RUNTIME;

beforeEach(() => {
  // The actual route and booking UI run against the local demo composition.
  process.env.NEXT_PUBLIC_LOCALLENS_RUNTIME = "demo";
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
  if (originalRuntimeMode === undefined) delete process.env.NEXT_PUBLIC_LOCALLENS_RUNTIME;
  else process.env.NEXT_PUBLIC_LOCALLENS_RUNTIME = originalRuntimeMode;
});

describe("actual booking page departure selection", () => {
  it.each(["not-a-departure", "ffffffff-ffff-4fff-8fff-ffffffffffff", ""])(
    "shows unavailable for the explicit unknown departure %j without substituting the first tour",
    async (departure) => {
      window.history.replaceState({}, "", `/en/booking/?departure=${departure}`);
      render(await BookingPage({ params: Promise.resolve({ locale: "en" }) }));

      expect(await screen.findByText("This departure is no longer available. Return to the catalog and refresh.")).toHaveAttribute("role", "alert");
      expect(screen.queryByRole("heading", { name: "Saigon Heritage" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Book tour" })).not.toBeInTheDocument();
      for (const link of screen.getAllByRole("link", { name: "All tours" })) {
        expect(link).toHaveAttribute("href", "/en/tours");
      }
    },
  );

  it("preserves first-tour browsing when the departure parameter is absent", async () => {
    window.history.replaceState({}, "", "/en/booking/");
    render(await BookingPage({ params: Promise.resolve({ locale: "en" }) }));

    expect(await screen.findByRole("heading", { name: "Saigon Heritage" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Travelers 1" })).toBeInTheDocument();
  });

  it("honors a valid explicit departure for another tour and preserves party size", async () => {
    window.history.replaceState({}, "", "/en/booking/?departure=d1700000-0000-4000-8000-000000000424&partySize=2");
    render(await BookingPage({ params: Promise.resolve({ locale: "en" }) }));

    expect(await screen.findByRole("heading", { name: "Dạo Chợ Lớn: Chợ Bình Tây và bữa cơm địa phương" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Saigon Heritage" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Travelers 2" })).toBeInTheDocument();
  });
});
