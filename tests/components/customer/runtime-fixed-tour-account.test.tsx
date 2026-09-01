import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RuntimeFixedTourAccount } from "@/components/customer/runtime-fixed-tour-account";
import type { FixedTourRuntimePort } from "@/lib/application/fixed-tour/contracts";
import type { CustomerBooking } from "@/lib/domain/data/contracts";

const booking: CustomerBooking = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "pending_payment",
  sourceKind: "departure",
  sourceId: "22222222-2222-4222-8222-222222222222",
  tourVersionId: "33333333-3333-4333-8333-333333333333",
  quoteId: null,
  titleEn: "Runtime Saigon walk",
  titleVi: "Dạo Sài Gòn runtime",
  cancellationPolicy: "Hold only",
  catalogSnapshotId: "44444444-4444-4444-8444-444444444444",
  travelSnapshotId: "55555555-5555-4555-8555-555555555555",
  fxSnapshotId: null,
  fxVndPerUsd: null,
  perPersonVndMinor: "450000",
  totalVndMinor: "900000",
  checkoutCurrency: "vnd",
  checkoutAmountMinor: "900000",
  partySize: 2,
  language: "vi",
  meetingPoint: "Cổng Bến Thành",
  holdExpiresAt: "2099-09-05T02:35:00.000Z",
  createdAt: "2099-09-05T02:00:00.000Z",
};

function port(read: () => Promise<CustomerBooking[]>): FixedTourRuntimePort {
  return {
    listPublishedTours: async () => [],
    listAvailability: async () => [],
    beginBooking: async () => { throw new Error("not used"); },
    listOwnBookings: read,
  };
}

afterEach(cleanup);

describe("runtime fixed-tour account", () => {
  it.each([
    ["en", booking.titleEn],
    ["vi", booking.titleVi],
  ] as const)("reloads PostgreSQL-backed bookings with %s content", async (locale, title) => {
    const read = vi.fn(async () => [booking]);
    const fixedTour = port(read);
    const first = render(<RuntimeFixedTourAccount locale={locale} fixedTour={fixedTour} />);
    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/pending payment|chờ thanh toán/i);
    expect(screen.queryByRole("button", { name: /pay|simulate|cancel|review|thanh toán|mô phỏng|hủy|đánh giá/i })).not.toBeInTheDocument();
    first.unmount();
    render(<RuntimeFixedTourAccount locale={locale} fixedTour={fixedTour} />);
    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(2);
  });
});
