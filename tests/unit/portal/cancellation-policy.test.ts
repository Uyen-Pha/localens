import { describe, expect, it } from "vitest";

import {
  evaluateCancellationEligibility,
  type CancellationBookingSnapshot,
} from "@/lib/application/portal/cancellation-policy";

const NOW = Date.parse("2026-09-28T00:00:00.000Z");

function snapshot(overrides: Partial<CancellationBookingSnapshot> = {}): CancellationBookingSnapshot {
  return {
    status: "pending_payment",
    sourceKind: "departure",
    paymentStatus: null,
    paymentDeadlineAt: "2026-09-28T00:15:00.000Z",
    tripStartAt: "2026-09-28T01:00:00.000Z",
    ...overrides,
  };
}

describe("cancellation policy", () => {
  it("does not treat unknown payment authority as an unpaid booking", () => {
    expect(evaluateCancellationEligibility(snapshot({ paymentStatus: undefined }), NOW)).toMatchObject({
      eligible: false, reason: "payment_not_cancellable",
    });
  });

  it("blocks an unknown deadline or trip start", () => {
    expect(evaluateCancellationEligibility(snapshot({ paymentDeadlineAt: undefined }), NOW).eligible).toBe(false);
    expect(evaluateCancellationEligibility(snapshot({ status: "confirmed", paymentStatus: "paid", tripStartAt: undefined }), NOW).eligible).toBe(false);
  });
  it("allows pending fixed-tour bookings while the 15-minute hold is active", () => {
    expect(evaluateCancellationEligibility(snapshot(), NOW)).toMatchObject({ eligible: true });
  });

  it("allows pending personalized bookings until their quote-derived payment deadline", () => {
    expect(evaluateCancellationEligibility(snapshot({
      sourceKind: "quote",
      paymentDeadlineAt: "2026-09-28T01:00:00.000Z",
    }), NOW)).toMatchObject({ eligible: true });
  });

  it("does not apply the 48-hour rule to pending payment bookings", () => {
    expect(evaluateCancellationEligibility(snapshot({
      tripStartAt: "2026-09-28T00:30:00.000Z",
    }), NOW)).toMatchObject({ eligible: true });
  });

  it.each(["pending", "review", "paid"] as const)(
    "blocks a pending booking with a %s payment authority",
    (paymentStatus) => {
      expect(evaluateCancellationEligibility(snapshot({ paymentStatus }), NOW)).toMatchObject({
        eligible: false,
        reason: "payment_not_cancellable",
      });
    },
  );

  it("blocks pending payment after its authoritative deadline", () => {
    expect(evaluateCancellationEligibility(snapshot({
      paymentDeadlineAt: "2026-09-27T23:59:59.000Z",
    }), NOW)).toMatchObject({ eligible: false, reason: "payment_deadline_expired" });
  });

  it("allows a confirmed booking exactly 48 hours before either tour type starts", () => {
    for (const sourceKind of ["departure", "quote"] as const) {
      expect(evaluateCancellationEligibility(snapshot({
        status: "confirmed",
        sourceKind,
        paymentDeadlineAt: null,
        tripStartAt: "2026-09-30T00:00:00.000Z",
        paymentStatus: "paid",
      }), NOW)).toMatchObject({ eligible: true });
    }
  });

  it("blocks a confirmed booking inside the 48-hour window", () => {
    expect(evaluateCancellationEligibility(snapshot({
      status: "confirmed",
      paymentDeadlineAt: null,
      tripStartAt: "2026-09-29T23:59:59.000Z",
      paymentStatus: "paid",
    }), NOW)).toMatchObject({ eligible: false, reason: "confirmed_too_late" });
  });

  it.each([null, "pending", "failed", "review"] as const)(
    "does not expose cancellation for a confirmed booking without paid authority (%s)",
    (paymentStatus) => {
      expect(evaluateCancellationEligibility(snapshot({
        status: "confirmed",
        paymentStatus,
        paymentDeadlineAt: null,
        tripStartAt: "2026-09-30T00:00:00.000Z",
      }), NOW)).toMatchObject({ eligible: false, reason: "payment_not_cancellable" });
    },
  );

  it.each(["payment_processing", "payment_review", "expired", "cancelled", "completed"] as const)(
    "does not expose cancellation for %s bookings",
    (status) => {
      expect(evaluateCancellationEligibility(snapshot({ status }), NOW)).toMatchObject({
        eligible: false,
        reason: "status_not_cancellable",
      });
    },
  );
});
