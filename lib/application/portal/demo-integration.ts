import type { CustomerCustomRequest, Locale } from "@/lib/domain/data/contracts";
import type { CustomerBookingView } from "@/lib/application/portal/contracts";
import type { CustomRequestDraft } from "@/lib/application/planner/custom-request-demo";

/**
 * Browser-demo ingress only. Production composition must not expose this
 * boundary; real booking and request writes remain backend/RLS work.
 */
export interface DemoFixedBookingInput {
  bookingId: string;
  departureId: string;
  tourSlug: string;
  date: string;
  startsAt: string;
  meetingPoint: string;
  partySize: number;
  locale: Locale;
  unitPriceMinor: number;
  totalMinor: number;
  holdExpiresAt: string;
  createdAt: string;
  status: "held" | "paid";
  paymentStatus: "unpaid" | "succeeded";
}

export interface DemoPersonalizedRequestInput {
  requestId: string;
  locale: Locale;
  /** The exact customer-confirmed planner handoff, including its local tamper fingerprint. */
  confirmedDraft: CustomRequestDraft;
  createdAt: string;
}

export interface DemoPersonalizedQuoteAcceptanceInput {
  bookingId: string;
}

export interface DemoPersonalizedCheckoutInput {
  bookingId: string;
}

export interface DemoPersonalizedRequestSubmission {
  request: CustomerCustomRequest;
}

/**
 * The narrow demo-only handoff used by the customer screens. Methods accept
 * already-authoritative local results and only synchronize their state into
 * the portal fixture; they do not calculate prices or itinerary data. Request
 * submission is intentionally independent from quotes and bookings; the
 * admin-only quote port issues those operational facts later.
 */
export interface DemoPortalIntegration {
  syncFixedBooking(input: DemoFixedBookingInput): Promise<CustomerBookingView>;
  submitPersonalizedRequest(
    input: DemoPersonalizedRequestInput,
  ): Promise<DemoPersonalizedRequestSubmission>;
  acceptPersonalizedQuote(
    input: DemoPersonalizedQuoteAcceptanceInput,
  ): Promise<CustomerBookingView>;
  completePersonalizedCheckout(
    input: DemoPersonalizedCheckoutInput,
  ): Promise<CustomerBookingView>;
}
