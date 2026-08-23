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

export type Role = "customer" | "guide" | "admin";
export type Locale = "en" | "vi";
export type PlaceStatus = "draft" | "published" | "archived";
export type TourStatus = "draft" | "published" | "archived";
export type TourVersionStatus = "draft" | "published" | "retired";
export type DepartureStatus = "scheduled" | "sold_out" | "cancelled" | "completed";
export type SnapshotStatus = "building" | "published" | "retired";
export type RequestStatus =
  | "draft"
  | "pending_review"
  | "changes_requested"
  | "approved"
  | "rejected";
export type QuoteStatus = "active" | "checkout_pending" | "accepted" | "expired" | "revoked";
export type HoldStatus = "active" | "consumed" | "released" | "expired";
export type BookingStatus =
  | "pending_payment"
  | "payment_processing"
  | "confirmed"
  | "payment_failed"
  | "payment_review"
  | "expired"
  | "cancelled"
  | "completed";
export type PaymentStatus = "pending" | "paid" | "failed" | "review";
export type WebhookEventStatus = "received" | "processed" | "ignored" | "failed" | "conflict";
export type AssignmentStatus = "assigned" | "accepted" | "completed" | "closed";
export type ContentStatus = "draft" | "publishing" | "published" | "failed";
export type RankingSource = "ai" | "deterministic";
export type Currency = "VND" | "USD";
export type CheckoutCurrency = "vnd" | "usd";
export type AuditEventType =
  | "role_provisioned"
  | "role_revoked"
  | "plan_claimed"
  | "request_submitted"
  | "request_changes_requested"
  | "request_approved"
  | "request_rejected"
  | "quote_created"
  | "quote_checkout_started"
  | "quote_accepted"
  | "quote_reactivated"
  | "quote_expired"
  | "quote_revoked"
  | "checkout_started"
  | "checkout_session_recorded"
  | "checkout_compensated"
  | "booking_status_changed"
  | "webhook_processed"
  | "webhook_ignored"
  | "webhook_failed"
  | "webhook_conflict"
  | "payment_reconciled"
  | "guide_assigned"
  | "guide_reassigned"
  | "guide_accepted"
  | "guide_completed"
  | "content_publish_started"
  | "content_published"
  | "content_publish_failed";

export type DataContractErrorCode = "INVALID_DB_INTEGER" | "UNSAFE_DB_INTEGER";
export interface DataContractError {
  code: DataContractErrorCode;
  messageKey: string;
}

export type DataAdapterErrorCode =
  | "INVALID_SHAPE"
  | "UNKNOWN_FIELD"
  | "MISSING_FIELD"
  | "INVALID_DB_INTEGER"
  | "UNSAFE_DB_INTEGER"
  | "INVALID_DB_DECIMAL"
  | "INVALID_TIMESTAMP"
  | "SNAPSHOT_MISMATCH";
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
