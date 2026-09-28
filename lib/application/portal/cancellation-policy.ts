import type {
  BookingStatus,
  CustomerBooking,
  PaymentStatus,
} from "@/lib/domain/data/contracts";

export const CONFIRMED_CANCELLATION_LEAD_TIME_MS = 48 * 60 * 60 * 1000;

export interface CancellationBookingSnapshot {
  status: BookingStatus;
  sourceKind: CustomerBooking["sourceKind"];
  paymentStatus: PaymentStatus | null | undefined;
  /** The fixed-tour hold deadline or the personalized quote deadline. */
  paymentDeadlineAt: string | null | undefined;
  /** The fixed departure start or the personalized itinerary start. */
  tripStartAt: string | null | undefined;
}

export type CancellationEligibilityReason =
  | "eligible"
  | "payment_not_cancellable"
  | "payment_deadline_expired"
  | "payment_deadline_unavailable"
  | "confirmed_too_late"
  | "trip_start_unavailable"
  | "status_not_cancellable";

export type CancellationEligibility =
  | { eligible: true; reason: "eligible" }
  | { eligible: false; reason: Exclude<CancellationEligibilityReason, "eligible"> };

function isFiniteTimestamp(value: string | null | undefined): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function evaluateCancellationEligibility(
  booking: CancellationBookingSnapshot,
  now = Date.now(),
): CancellationEligibility {
  if (booking.status === "pending_payment") {
    if (booking.paymentStatus === undefined || booking.paymentStatus === "pending" || booking.paymentStatus === "review" || booking.paymentStatus === "paid") {
      return { eligible: false, reason: "payment_not_cancellable" };
    }
    if (!isFiniteTimestamp(booking.paymentDeadlineAt)) {
      return { eligible: false, reason: "payment_deadline_unavailable" };
    }
    if (Date.parse(booking.paymentDeadlineAt) <= now) {
      return { eligible: false, reason: "payment_deadline_expired" };
    }
    return { eligible: true, reason: "eligible" };
  }

  if (booking.status === "confirmed") {
    if (booking.paymentStatus !== "paid") {
      return { eligible: false, reason: "payment_not_cancellable" };
    }
    if (!isFiniteTimestamp(booking.tripStartAt)) {
      return { eligible: false, reason: "trip_start_unavailable" };
    }
    if (Date.parse(booking.tripStartAt) - now < CONFIRMED_CANCELLATION_LEAD_TIME_MS) {
      return { eligible: false, reason: "confirmed_too_late" };
    }
    return { eligible: true, reason: "eligible" };
  }

  return { eligible: false, reason: "status_not_cancellable" };
}
