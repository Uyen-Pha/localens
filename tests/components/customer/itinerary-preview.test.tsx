import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  ItineraryPreview,
  type ItineraryPreviewError,
} from "@/components/customer/itinerary-preview";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { ItineraryPreviewDto } from "@/lib/application/api/read-only-api";

afterEach(() => document.body.replaceChildren());

const preview: ItineraryPreviewDto = {
  environment: "demo",
  city: "Ho Chi Minh City",
  normalizedStartAt: "2026-09-05T09:00:00+07:00",
  budgetVnd: 2_000_000,
  rankingSource: "deterministic",
  items: [
    {
      placeId: "demo-hcmc-ben-thanh-market",
      placeTitle: "Ben Thanh Market",
      startAt: "2026-09-05T09:00:00+07:00",
      endAt: "2026-09-05T10:00:00+07:00",
      visitDurationMinutes: 60,
      travelMinutesBefore: 0,
      transitionBufferMinutesBefore: 0,
      travelCostVndBefore: 0,
      placeCostVnd: 80_000,
      foodSelection: null,
      foodCostMinVnd: 0,
      foodCostMaxVnd: 0,
      payAtVendorMinVnd: 0,
      payAtVendorMaxVnd: 0,
      customerPayableVnd: 80_000,
      score: 4.5,
    },
    {
      placeId: "demo-hcmc-street-food",
      placeTitle: "Street food",
      startAt: "2026-09-05T10:20:00+07:00",
      endAt: "2026-09-05T11:20:00+07:00",
      visitDurationMinutes: 60,
      travelMinutesBefore: 10,
      transitionBufferMinutesBefore: 10,
      travelCostVndBefore: 25_000,
      placeCostVnd: 150_000,
      foodSelection: null,
      foodCostMinVnd: 0,
      foodCostMaxVnd: 0,
      payAtVendorMinVnd: 0,
      payAtVendorMaxVnd: 0,
      customerPayableVnd: 175_000,
      score: 4.2,
    },
  ],
  totals: {
    durationMinutes: 140,
    visitMinutes: 120,
    travelMinutes: 10,
    transitionBufferMinutes: 10,
    admissionCostVnd: 230_000,
    foodCostMinVnd: 0,
    foodCostMaxVnd: 0,
    travelCostVnd: 25_000,
    guideCostVnd: 0,
    payAtVendorMinVnd: 0,
    payAtVendorMaxVnd: 0,
    customerPayableVnd: 255_000,
    groupCostMinVnd: 255_000,
    groupCostMaxVnd: 255_000,
    groupCostVnd: 255_000,
    score: 8.7,
  },
  snapshotIds: {
    catalog: "demo-hcmc-catalog-v1",
    travel: "demo-hcmc-travel-v1",
    fx: "demo-hcmc-fx-v1",
  },
};

describe("ItineraryPreview", () => {
  it("renders localized timeline details, costs, totals, and proposal disclosures", () => {
    const copy = getDictionary("en").home.personalizationForm.preview;

    render(<ItineraryPreview locale="en" copy={copy} preview={preview} />);

    expect(screen.getByRole("region", { name: copy.heading })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Ben Thanh Market" })).toBeInTheDocument();
    expect(screen.getByText(/2026-09-05 · 09:00/)).toBeInTheDocument();
    expect(screen.getByText(/80,000/)).toBeInTheDocument();
    expect(screen.getByText(copy.totalsHeading)).toBeInTheDocument();
    expect(screen.getByText(copy.deterministicDisclosure)).toBeInTheDocument();
    expect(screen.getByText(copy.proposalOnly)).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(copy.warningMessage);
    expect(screen.getAllByText(copy.foodNotSelectedLabel)).toHaveLength(3);
    expect(screen.getAllByText(copy.venueAdmissionLabel)).toHaveLength(3);
    expect(screen.getByText(copy.foodEstimateLabel)).toBeInTheDocument();
    expect(screen.getByText(copy.travelCostTotalLabel)).toBeInTheDocument();
    expect(screen.getByText(copy.guideCostLabel)).toBeInTheDocument();
    expect(screen.getByText(copy.localLensPayableLabel)).toBeInTheDocument();
    expect(screen.getByText(copy.payAtVendorLabel)).toBeInTheDocument();
  });

  it("renders exact vendor facts and warns when the upper food estimate exceeds budget", () => {
    const copy = getDictionary("en").home.personalizationForm.preview;
    const selectedPreview: ItineraryPreviewDto = {
      ...preview,
      budgetVnd: 100_000,
      items: [{
        ...preview.items[0]!,
        placeTitle: "Ben Thanh Market",
        placeCostVnd: 0,
        foodSelection: {
          venueTitle: "Ben Thanh Market",
          vendorTitle: "Bún bò Cô Ba",
          locationNote: "Aisle 4, west gate",
          menuTitle: "Bún bò Huế",
          servingUnit: "bowl",
          quantity: 2,
          priceVndMin: 45_000,
          priceVndMax: 60_000,
          activity: "Taste and discuss the selected dish.",
          dietaryAllergenCaveat: "Peanuts: confirm with vendor.",
          accessibilityVendorWarning: "Step-free access not confirmed.",
          paymentMode: "pay_at_vendor",
        },
        foodCostMinVnd: 90_000,
        foodCostMaxVnd: 120_000,
        payAtVendorMinVnd: 90_000,
        payAtVendorMaxVnd: 120_000,
        customerPayableVnd: 0,
      }],
      totals: {
        ...preview.totals,
        admissionCostVnd: 0,
        foodCostMinVnd: 90_000,
        foodCostMaxVnd: 120_000,
        travelCostVnd: 25_000,
        guideCostVnd: 0,
        payAtVendorMinVnd: 90_000,
        payAtVendorMaxVnd: 120_000,
        customerPayableVnd: 25_000,
        groupCostMinVnd: 115_000,
        groupCostMaxVnd: 145_000,
        groupCostVnd: 145_000,
      },
    };

    render(<ItineraryPreview locale="en" copy={copy} preview={selectedPreview} />);

    expect(screen.getByText("Bún bò Cô Ba")).toBeInTheDocument();
    expect(screen.getByText("Bún bò Huế")).toBeInTheDocument();
    expect(screen.getByText("Aisle 4, west gate")).toBeInTheDocument();
    expect(screen.getByText(/2 bowls?/i)).toBeInTheDocument();
    expect(screen.getByText("₫45,000–₫60,000")).toBeInTheDocument();
    expect(screen.getByText("Peanuts: confirm with vendor.")).toBeInTheDocument();
    expect(screen.getByText("Step-free access not confirmed.")).toBeInTheDocument();
    expect(screen.getByText(copy.payAtVendorValue)).toBeInTheDocument();
    expect(screen.getByRole("note", { name: copy.budgetWarningLabel })).toHaveTextContent(copy.budgetWarningMessage);

    const totals = screen.getByText(copy.totalsHeading).parentElement;
    expect(totals).not.toBeNull();
    if (totals) {
      expect(screen.getByText(copy.totalCostLabel).nextElementSibling).toHaveTextContent("₫145,000");
      expect(screen.getByText(copy.localLensPayableLabel).nextElementSibling).toHaveTextContent("₫25,000");
    }
  });

  it("distinguishes unavailable food cost from an explicit no-food stop", () => {
    const copy = getDictionary("vi").home.personalizationForm.preview;
    const unavailable: ItineraryPreviewDto = {
      ...preview,
      items: [{ ...preview.items[0]!, foodSelection: null, foodCostMinVnd: 1, foodCostMaxVnd: 2 }],
      totals: { ...preview.totals, foodCostMinVnd: 1, foodCostMaxVnd: 2 },
    };

    render(<ItineraryPreview locale="vi" copy={copy} preview={unavailable} />);

    expect(screen.getAllByText(copy.foodCostUnavailableLabel)).toHaveLength(2);
    expect(screen.queryByText(copy.foodNotSelectedLabel)).not.toBeInTheDocument();
  });

  it("renders a localized retryable API error with correlation context", () => {
    const copy = getDictionary("vi").home.personalizationForm.preview;
    const error: ItineraryPreviewError = {
      message: "demo error",
      retryable: true,
      correlationId: "11111111-1111-4111-8111-111111111111",
    };

    render(<ItineraryPreview locale="vi" copy={copy} error={error} />);

    expect(screen.getByRole("alert")).toHaveTextContent(copy.errorMessage);
    expect(screen.getByRole("alert")).toHaveTextContent(copy.retryableMessage);
    expect(screen.getByRole("alert")).toHaveTextContent(error.correlationId);
  });
});
