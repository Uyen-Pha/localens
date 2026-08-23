import type {
  CatalogSnapshot,
  EngineInput,
  FxSnapshot,
  ItineraryItem,
  ItineraryRequest,
  ItineraryResult,
  TravelEdge,
  TravelSnapshot,
} from "@/lib/domain/itinerary/contracts";

export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ROLE_VALUES = Object.freeze(["customer", "guide", "admin"] as const);
export const LOCALE_VALUES = Object.freeze(["en", "vi"] as const);
export const PLACE_STATUS_VALUES = Object.freeze(["draft", "published", "archived"] as const);
export const TOUR_STATUS_VALUES = Object.freeze(["draft", "published", "archived"] as const);
export const TOUR_VERSION_STATUS_VALUES = Object.freeze(["draft", "published", "retired"] as const);
export const DEPARTURE_STATUS_VALUES = Object.freeze(["scheduled", "sold_out", "cancelled", "completed"] as const);
export const SNAPSHOT_STATUS_VALUES = Object.freeze(["building", "published", "retired"] as const);
export const REQUEST_STATUS_VALUES = Object.freeze(["draft", "pending_review", "changes_requested", "approved", "rejected"] as const);
export const QUOTE_STATUS_VALUES = Object.freeze(["active", "checkout_pending", "accepted", "expired", "revoked"] as const);
export const HOLD_STATUS_VALUES = Object.freeze(["active", "consumed", "released", "expired"] as const);
export const BOOKING_STATUS_VALUES = Object.freeze(["pending_payment", "payment_processing", "confirmed", "payment_failed", "payment_review", "expired", "cancelled", "completed"] as const);
export const PAYMENT_STATUS_VALUES = Object.freeze(["pending", "paid", "failed", "review"] as const);
export const WEBHOOK_EVENT_STATUS_VALUES = Object.freeze(["received", "processed", "ignored", "failed", "conflict"] as const);
export const ASSIGNMENT_STATUS_VALUES = Object.freeze(["assigned", "accepted", "completed", "closed"] as const);
export const CONTENT_STATUS_VALUES = Object.freeze(["draft", "publishing", "published", "failed"] as const);
export const RANKING_SOURCE_VALUES = Object.freeze(["ai", "deterministic"] as const);
export const CURRENCY_VALUES = Object.freeze(["VND", "USD"] as const);
export const CHECKOUT_CURRENCY_VALUES = Object.freeze(["vnd", "usd"] as const);
export const DATA_CONTRACT_ERROR_CODE_VALUES = Object.freeze(["INVALID_DB_INTEGER", "UNSAFE_DB_INTEGER"] as const);
export const DATA_ADAPTER_ERROR_CODE_VALUES = Object.freeze([
  "INVALID_SHAPE", "UNKNOWN_FIELD", "MISSING_FIELD", "INVALID_DB_INTEGER",
  "UNSAFE_DB_INTEGER", "INVALID_DB_DECIMAL", "INVALID_TIMESTAMP", "SNAPSHOT_MISMATCH",
] as const);
export const AUDIT_EVENT_TYPE_VALUES = Object.freeze([
  "role_provisioned", "role_revoked", "plan_claimed", "request_submitted",
  "request_changes_requested", "request_approved", "request_rejected", "quote_created",
  "quote_checkout_started", "quote_accepted", "quote_reactivated", "quote_expired", "quote_revoked",
  "checkout_started", "checkout_session_recorded", "checkout_compensated", "booking_status_changed",
  "webhook_processed", "webhook_ignored", "webhook_failed", "webhook_conflict", "payment_reconciled",
  "guide_assigned", "guide_reassigned", "guide_accepted", "guide_completed", "content_publish_started",
  "content_published", "content_publish_failed",
] as const);

export type Role = (typeof ROLE_VALUES)[number];
export type Locale = (typeof LOCALE_VALUES)[number];
export type PlaceStatus = (typeof PLACE_STATUS_VALUES)[number];
export type TourStatus = (typeof TOUR_STATUS_VALUES)[number];
export type TourVersionStatus = (typeof TOUR_VERSION_STATUS_VALUES)[number];
export type DepartureStatus = (typeof DEPARTURE_STATUS_VALUES)[number];
export type SnapshotStatus = (typeof SNAPSHOT_STATUS_VALUES)[number];
export type RequestStatus = (typeof REQUEST_STATUS_VALUES)[number];
export type QuoteStatus = (typeof QUOTE_STATUS_VALUES)[number];
export type HoldStatus = (typeof HOLD_STATUS_VALUES)[number];
export type BookingStatus = (typeof BOOKING_STATUS_VALUES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUS_VALUES)[number];
export type WebhookEventStatus = (typeof WEBHOOK_EVENT_STATUS_VALUES)[number];
export type AssignmentStatus = (typeof ASSIGNMENT_STATUS_VALUES)[number];
export type ContentStatus = (typeof CONTENT_STATUS_VALUES)[number];
export type RankingSource = (typeof RANKING_SOURCE_VALUES)[number];
export type Currency = (typeof CURRENCY_VALUES)[number];
export type CheckoutCurrency = (typeof CHECKOUT_CURRENCY_VALUES)[number];
export type DataContractErrorCode = (typeof DATA_CONTRACT_ERROR_CODE_VALUES)[number];
export type DataAdapterErrorCode = (typeof DATA_ADAPTER_ERROR_CODE_VALUES)[number];
export type AuditEventType = (typeof AUDIT_EVENT_TYPE_VALUES)[number];

export const DATA_CONTRACT_LITERALS = Object.freeze({
  role: ROLE_VALUES,
  locale: LOCALE_VALUES,
  placeStatus: PLACE_STATUS_VALUES,
  tourStatus: TOUR_STATUS_VALUES,
  tourVersionStatus: TOUR_VERSION_STATUS_VALUES,
  departureStatus: DEPARTURE_STATUS_VALUES,
  snapshotStatus: SNAPSHOT_STATUS_VALUES,
  requestStatus: REQUEST_STATUS_VALUES,
  quoteStatus: QUOTE_STATUS_VALUES,
  holdStatus: HOLD_STATUS_VALUES,
  bookingStatus: BOOKING_STATUS_VALUES,
  paymentStatus: PAYMENT_STATUS_VALUES,
  webhookEventStatus: WEBHOOK_EVENT_STATUS_VALUES,
  assignmentStatus: ASSIGNMENT_STATUS_VALUES,
  contentStatus: CONTENT_STATUS_VALUES,
  rankingSource: RANKING_SOURCE_VALUES,
  currency: CURRENCY_VALUES,
  checkoutCurrency: CHECKOUT_CURRENCY_VALUES,
  dataContractErrorCode: DATA_CONTRACT_ERROR_CODE_VALUES,
  dataAdapterErrorCode: DATA_ADAPTER_ERROR_CODE_VALUES,
  auditEventType: AUDIT_EVENT_TYPE_VALUES,
});

export interface DataContractError {
  code: DataContractErrorCode;
  messageKey: string;
}

export interface DataAdapterError {
  code: DataAdapterErrorCode;
  messageKey: string;
  fieldPath?: string;
}

const MAX_SAFE_DB_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);
const CANONICAL_UNSIGNED_INTEGER = /^(?:0|[1-9]\d*)$/;

function invalidInteger(): { ok: false; error: DataContractError } {
  return {
    ok: false,
    error: { code: "INVALID_DB_INTEGER", messageKey: "data.integer.invalid" },
  };
}

function unsafeInteger(): { ok: false; error: DataContractError } {
  return {
    ok: false,
    error: { code: "UNSAFE_DB_INTEGER", messageKey: "data.integer.unsafe" },
  };
}

/** Convert a database bigint representation only after the JavaScript safe bound is proven. */
export function parseDbSafeInteger(
  value: unknown,
): Result<number, DataContractError> {
  if (typeof value === "string") {
    if (!CANONICAL_UNSIGNED_INTEGER.test(value)) return invalidInteger();
    const maxSafeDecimal = String(Number.MAX_SAFE_INTEGER);
    if (value.length > maxSafeDecimal.length || (value.length === maxSafeDecimal.length && value > maxSafeDecimal)) {
      return unsafeInteger();
    }
    const parsed = BigInt(value);
    if (parsed > MAX_SAFE_DB_INTEGER) return unsafeInteger();
    return { ok: true, value: Number(parsed) };
  }

  if (typeof value === "bigint") {
    if (value < BigInt(0)) return invalidInteger();
    if (value > MAX_SAFE_DB_INTEGER) return unsafeInteger();
    return { ok: true, value: Number(value) };
  }

  if (typeof value === "number") {
    if (Object.is(value, -0) || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
      return invalidInteger();
    }
    if (!Number.isSafeInteger(value)) return unsafeInteger();
    return { ok: true, value };
  }

  return invalidInteger();
}

export function toDbBigint(
  value: unknown,
): Result<string, DataContractError> {
  const parsed = parseDbSafeInteger(value);
  if (!parsed.ok) return parsed;
  return { ok: true, value: String(parsed.value) };
}

// These aliases keep the shared persistence registry discoverable without reimplementing
// the engine DTO schemas. Runtime adapters in later tasks validate those schemas strictly.
export type { CatalogSnapshot, EngineInput, FxSnapshot, ItineraryItem, ItineraryRequest, ItineraryResult, TravelEdge, TravelSnapshot };

export interface PublishedTour {
  id: string;
  versionId: string;
  slug: string;
  locale: Locale;
  title: string;
  summary: string;
  meetingPoint: string;
  durationMinutes: number;
  priceVndMinor: string;
  inclusions: string[];
  exclusions: string[];
  cancellationPolicy: string;
  sourceUrl: string;
  verifiedAt: string;
  attribution: string;
  license: string;
  stops: Array<{ position: number; placeId: string; placeSlug: string; title: string }>;
}

export interface LiveDepartureAvailability {
  id: string;
  tourVersionId: string;
  startAt: string;
  endAt: string;
  status: DepartureStatus;
  remainingCapacity: number;
}

export interface PlanRevisionInsert {
  revisionNo: number;
  request: ItineraryRequest;
  result: ItineraryResult;
  fingerprint: string;
  rankingSource: RankingSource;
  catalogSnapshotId: string;
  travelSnapshotId: string;
  fxSnapshotId: string | null;
  fxVndPerUsd: string | null;
  currency: Currency;
  budgetVnd: string;
  totalCostVnd: string;
  totalDurationMinutes: number;
  lockedPlaceIds: string[];
  items: ItineraryItem[];
}

export interface CreateGuestPlanArgs {
  revision: PlanRevisionInsert;
  tokenHash: string;
  pepperVersion: number;
}

export interface GuestPlanHandle {
  planId: string;
  revisionNo: 1;
  guestToken: string;
  expiresAt: string;
}

export interface SubmitCustomRequestInput {
  planId: string;
  revisionNo: number;
}
export interface ReviewCustomRequestInput {
  requestId: string;
  decision: "changes_requested" | "approved" | "rejected";
  note: string | null;
}
export interface CreateCustomQuoteInput {
  requestId: string;
  amountVndMinor: string;
  checkoutCurrency: CheckoutCurrency;
  titleEn: string;
  titleVi: string;
  policy: string;
}
export interface CustomerCustomRequest {
  id: string;
  planId: string;
  revisionNo: number;
  status: RequestStatus;
  submittedAt: string;
  updatedAt: string;
}
export interface AdminCustomRequest extends CustomerCustomRequest {
  ownerUserId: string;
  latestDecisionAt: string | null;
}
export interface CustomerCustomQuote {
  id: string;
  requestId: string;
  status: QuoteStatus;
  title: string;
  amountVndMinor: string;
  currency: CheckoutCurrency;
  amountMinor: string;
  policy: string;
  validUntil: string;
}

export type CheckoutSource =
  | { kind: "departure"; departureId: string }
  | { kind: "quote"; quoteId: string };
export interface StartCheckoutInput {
  source: CheckoutSource;
  partySize: number;
  locale: Locale;
  idempotencyKey: string;
}
export interface StartCheckoutTxArgs extends StartCheckoutInput {
  canonicalRequestHash: string;
}
export interface StartCheckoutResult {
  bookingId: string;
  attemptId: string;
  providerIdempotencyKey: string;
  amountMinor: string;
  currency: CheckoutCurrency;
  holdExpiresAt: string;
  state: "created" | "resumed";
}
export interface StripeCheckoutSessionInput {
  mode: "payment";
  payment_method_types: ["card"];
  expires_at: number;
  client_reference_id: string;
  metadata: { booking_id: string; attempt_id: string };
  line_items: Array<{
    price_data: {
      currency: CheckoutCurrency;
      unit_amount: number;
      product_data: { name: string };
    };
    quantity: 1;
  }>;
  success_url: string;
  cancel_url: string;
}
export const STRIPE_CHECKOUT_MODE = "payment" as const;
export interface RecordCheckoutSessionInput {
  bookingId: string;
  attemptId: string;
  providerSessionId: string;
  providerExpiresAt: string;
}
export interface RecordCheckoutSessionResult {
  bookingId: string;
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus | null;
  quoteStatus: QuoteStatus | null;
  providerSessionId: string;
  state: "recorded" | "replayed";
}

export interface CustomerBooking {
  id: string;
  status: BookingStatus;
  sourceKind: "departure" | "quote";
  sourceId: string;
  tourVersionId: string | null;
  quoteId: string | null;
  titleEn: string;
  titleVi: string;
  cancellationPolicy: string;
  catalogSnapshotId: string;
  travelSnapshotId: string;
  fxSnapshotId: string | null;
  fxVndPerUsd: string | null;
  perPersonVndMinor: string | null;
  totalVndMinor: string;
  checkoutCurrency: CheckoutCurrency;
  checkoutAmountMinor: string;
  partySize: number;
  language: Locale;
  meetingPoint: string;
  holdExpiresAt: string;
  createdAt: string;
}

export type FinalizeStripeEventInput = {
  eventId: string;
  payloadHash: string;
  sessionId: string;
  bookingId: string;
  attemptId: string;
  amountMinor: string;
  currency: CheckoutCurrency;
  livemode: false;
  mode: "payment";
  accountId: string;
  endpointId: string;
} & (
  | {
      eventType: "checkout.session.completed";
      sessionStatus: "complete";
      providerPaymentStatus: "paid";
      paymentIntentId: string;
    }
  | {
      eventType: "checkout.session.expired";
      sessionStatus: "expired";
      providerPaymentStatus: "unpaid";
      paymentIntentId: string | null;
    }
);
export interface FinalizeStripeEventResult {
  eventStatus: WebhookEventStatus;
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus | null;
  replayed: boolean;
}
export interface CustomerPaymentStatus {
  bookingId: string;
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus | null;
  amountMinor: string;
  currency: CheckoutCurrency;
  updatedAt: string;
}

export interface GuideAssignedBooking {
  bookingId: string;
  tourVersionId: string;
  departureId: string;
  title: string;
  startAt: string;
  endAt: string;
  meetingPoint: string;
  partySize: number;
  language: Locale;
  mobilityFlags: string[];
  dietaryFlags: string[];
  assignmentStatus: AssignmentStatus;
}

export interface ImageAttribution {
  imageUrl: string;
  sourceUrl: string;
  creator: string;
  license: string;
}
export interface ContentDraftWrite {
  locale: Locale;
  slug: string;
  title: string;
  description: string;
  body: string;
  sourceUrls: string[];
  verifiedAt: string;
  imageAttributions: ImageAttribution[];
}
export interface AdminContentDraft extends ContentDraftWrite {
  id: string;
  status: ContentStatus;
  updatedAt: string;
}
export interface PublishedContent {
  releaseId: string;
  locale: Locale;
  slug: string;
  title: string;
  description: string;
  body: string;
  sourceUrls: string[];
  verifiedAt: string;
  imageAttributions: ImageAttribution[];
  publishedAt: string;
}
export interface AdminAuditEvent {
  id: string;
  eventType: AuditEventType;
  actorUserId: string | null;
  actorRole: Role | null;
  targetType: string;
  targetId: string;
  fromState: string | null;
  toState: string | null;
  correlationId: string;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
}
