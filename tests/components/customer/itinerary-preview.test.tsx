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
      score: 4.2,
    },
  ],
  totals: {
    durationMinutes: 140,
    visitMinutes: 120,
    travelMinutes: 10,
    transitionBufferMinutes: 10,
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
