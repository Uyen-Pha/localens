import { LOCALE_VALUES } from "@/lib/domain/data/contracts";
import type {
  BookingStatus,
  CheckoutCurrency,
  CustomerBooking,
  DataAdapterError,
  LiveDepartureAvailability,
  Locale,
  PaymentStatus,
  PublishedTour,
  Result,
} from "@/lib/domain/data/contracts";

export interface FixedTourBeginBookingInput {
  departureId: string;
  partySize: number;
  locale: Locale;
  idempotencyKey: string;
}

export interface FixedTourBeginBookingResult {
  bookingId: string;
  holdExpiresAt: string;
  state: "created" | "resumed";
}

export interface CompleteSimulatedPaymentInput {
  bookingId: string;
  idempotencyKey: string;
}

export interface CompleteSimulatedPaymentResult {
  bookingId: string;
  bookingStatus: BookingStatus;
  paymentStatus: Extract<PaymentStatus, "paid"> | null;
  simulatedAt: string;
  state: "completed" | "expired" | "replayed";
}

export interface FixedTourPaymentStatus {
  bookingId: string;
  bookingStatus: BookingStatus;
  paymentStatus: Extract<PaymentStatus, "paid"> | null;
  amountMinor: string;
  currency: CheckoutCurrency;
  simulatedAt: string;
}

export type FixedTourCancellationStatus = "pending" | "approved" | "rejected";
export type FixedTourCancellationDecision = Exclude<FixedTourCancellationStatus, "pending">;

export interface FixedTourCancellationRequestInput {
  bookingId: string;
  reason: string;
  idempotencyKey: string;
}

export interface FixedTourCancellationRequestResult {
  requestId: string;
  bookingId: string;
  status: "pending";
  reason: string;
  requestedAt: string;
  state: "created" | "replayed";
}

export interface FixedTourCancellationRequest {
  requestId: string;
  bookingId: string;
  status: FixedTourCancellationStatus;
  reason: string;
  requestedAt: string;
  decisionNote: string | null;
  decidedAt: string | null;
}

export interface FixedTourCancellationQueueItem extends FixedTourCancellationRequest {
  bookingStatus: BookingStatus;
  customerDisplayName: string;
  titleEn: string;
  titleVi: string;
}

export interface FixedTourCancellationDecisionInput {
  requestId: string;
  decision: FixedTourCancellationDecision;
  note: string | null;
  idempotencyKey: string;
}

export interface FixedTourCancellationDecisionResult {
  requestId: string;
  bookingId: string;
  requestStatus: FixedTourCancellationDecision;
  bookingStatus: BookingStatus;
  decisionNote: string | null;
  decidedAt: string;
  state: FixedTourCancellationDecision | "replayed";
}

export interface FixedTourRuntimePort {
  listPublishedTours(locale: Locale): Promise<PublishedTour[]>;
  listAvailability(): Promise<LiveDepartureAvailability[]>;
  beginBooking(input: FixedTourBeginBookingInput): Promise<FixedTourBeginBookingResult>;
  listOwnBookings(): Promise<CustomerBooking[]>;
  listOwnPaymentStatuses(): Promise<FixedTourPaymentStatus[]>;
  completeSimulatedPayment(input: CompleteSimulatedPaymentInput): Promise<CompleteSimulatedPaymentResult>;
  listOwnCancellationRequests(): Promise<FixedTourCancellationRequest[]>;
  requestCancellation(input: FixedTourCancellationRequestInput): Promise<FixedTourCancellationRequestResult>;
  listCancellationQueue(): Promise<FixedTourCancellationQueueItem[]>;
  decideCancellation(input: FixedTourCancellationDecisionInput): Promise<FixedTourCancellationDecisionResult>;
}

export type FixedTourRuntimeErrorCode =
  | "INVALID_INPUT"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "SOLD_OUT"
  | "NOT_FOUND"
  | "SERVICE_UNAVAILABLE"
  | "INVALID_RESPONSE";

const FIXED_TOUR_ERROR_MESSAGES: Record<FixedTourRuntimeErrorCode, string> = {
  INVALID_INPUT: "The fixed-tour request is invalid.",
  UNAUTHENTICATED: "A signed-in customer session is required.",
  FORBIDDEN: "The fixed-tour operation is not permitted.",
  CONFLICT: "The fixed-tour operation conflicts with its authoritative state.",
  IDEMPOTENCY_CONFLICT: "The booking attempt conflicts with an earlier request.",
  SOLD_OUT: "The selected departure is sold out.",
  NOT_FOUND: "The requested fixed-tour resource is unavailable.",
  SERVICE_UNAVAILABLE: "The fixed-tour service is unavailable.",
  INVALID_RESPONSE: "The fixed-tour service returned an invalid response.",
};

/** Stable browser-safe failure with no database, URL, or credential detail. */
export class FixedTourRuntimeError extends Error {
  readonly code: FixedTourRuntimeErrorCode;

  constructor(code: FixedTourRuntimeErrorCode) {
    super(FIXED_TOUR_ERROR_MESSAGES[code]);
    this.name = "FixedTourRuntimeError";
    this.code = code;
  }
}

const BEGIN_BOOKING_INPUT_FIELDS = [
  "departureId",
  "partySize",
  "locale",
  "idempotencyKey",
] as const;
const BEGIN_BOOKING_RESULT_FIELDS = [
  "bookingId",
  "holdExpiresAt",
  "state",
] as const;
const COMPLETE_PAYMENT_INPUT_FIELDS = ["bookingId", "idempotencyKey"] as const;
const COMPLETE_PAYMENT_RESULT_FIELDS = [
  "bookingId",
  "bookingStatus",
  "paymentStatus",
  "simulatedAt",
  "state",
] as const;
const PAYMENT_STATUS_FIELDS = [
  "bookingId",
  "bookingStatus",
  "paymentStatus",
  "amountMinor",
  "currency",
  "simulatedAt",
] as const;
const CANCELLATION_REQUEST_INPUT_FIELDS = ["bookingId", "reason", "idempotencyKey"] as const;
const CANCELLATION_REQUEST_RESULT_FIELDS = [
  "requestId", "bookingId", "status", "reason", "requestedAt", "state",
] as const;
const CANCELLATION_REQUEST_FIELDS = [
  "requestId", "bookingId", "status", "reason", "requestedAt", "decisionNote", "decidedAt",
] as const;
const CANCELLATION_QUEUE_FIELDS = [
  ...CANCELLATION_REQUEST_FIELDS,
  "bookingStatus", "customerDisplayName", "titleEn", "titleVi",
] as const;
const CANCELLATION_DECISION_INPUT_FIELDS = ["requestId", "decision", "note", "idempotencyKey"] as const;
const CANCELLATION_DECISION_RESULT_FIELDS = [
  "requestId", "bookingId", "requestStatus", "bookingStatus", "decisionNote", "decidedAt", "state",
] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;
const TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;
const BOOKING_STATUSES = new Set<BookingStatus>([
  "pending_payment",
  "payment_processing",
  "confirmed",
  "payment_failed",
  "payment_review",
  "expired",
  "cancelled",
  "completed",
]);
const PAYMENT_STATES = new Set(["completed", "expired", "replayed"] as const);
const CURRENCIES = new Set<CheckoutCurrency>(["vnd", "usd"]);
const CANCELLATION_STATUSES = new Set<FixedTourCancellationStatus>(["pending", "approved", "rejected"]);
const CANCELLATION_DECISIONS = new Set<FixedTourCancellationDecision>(["approved", "rejected"]);
const TEXT_CONTROL_PATTERN = /[\u0000-\u001F\u007F-\u009F]/;
const MAX_SAFE_MONEY = BigInt(Number.MAX_SAFE_INTEGER);

type UnknownRecord = Record<string, unknown>;
type FixedTourContractResult<T> = Result<T, DataAdapterError>;

function invalid(
  code: DataAdapterError["code"],
  messageKey: string,
  fieldPath: string,
): FixedTourContractResult<never> {
  return { ok: false, error: { code, messageKey, fieldPath } };
}

function exactFields(
  value: unknown,
  fields: readonly string[],
  path: string,
): FixedTourContractResult<UnknownRecord> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", path);
  }

  const record = value as UnknownRecord;
  const unknown = Object.keys(record).find((field) => !fields.includes(field));
  if (unknown !== undefined) {
    return invalid("UNKNOWN_FIELD", "fixedTour.contract.unknown_field", `${path}.${unknown}`);
  }

  const missing = fields.find((field) => !Object.prototype.hasOwnProperty.call(record, field));
  if (missing !== undefined) {
    return invalid("MISSING_FIELD", "fixedTour.contract.missing_field", `${path}.${missing}`);
  }

  return { ok: true, value: record };
}

function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = value.match(TIMESTAMP_PATTERN);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offset = match[8];
  if (year < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  if (offset !== "Z" && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4, 6)) > 59)) return false;

  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return (
    calendar.getUTCFullYear() === year &&
    calendar.getUTCMonth() === month - 1 &&
    calendar.getUTCDate() === day &&
    Number.isFinite(Date.parse(value))
  );
}

function isBookingStatus(value: unknown): value is BookingStatus {
  return typeof value === "string" && BOOKING_STATUSES.has(value as BookingStatus);
}

function isPaidOrNull(value: unknown): value is "paid" | null {
  return value === "paid" || value === null;
}

function isSafeMoney(value: unknown): value is string {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/.test(value)) return false;
  try {
    const amount = BigInt(value);
    return amount > BigInt(0) && amount <= MAX_SAFE_MONEY;
  } catch {
    return false;
  }
}

function isSafeText(value: unknown, maximum = 1_000): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= maximum &&
    value === value.trim() && !TEXT_CONTROL_PATTERN.test(value);
}

function isSafeNullableText(value: unknown, maximum = 1_000): value is string | null {
  return value === null || isSafeText(value, maximum);
}

function isIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && IDEMPOTENCY_KEY_PATTERN.test(value);
}

function isCancellationStatus(value: unknown): value is FixedTourCancellationStatus {
  return typeof value === "string" && CANCELLATION_STATUSES.has(value as FixedTourCancellationStatus);
}

function hasConsistentDecisionFacts(
  status: FixedTourCancellationStatus,
  decisionNote: unknown,
  decidedAt: unknown,
): boolean {
  if (!isSafeNullableText(decisionNote)) return false;
  if (status === "pending") return decisionNote === null && decidedAt === null;
  return decidedAt !== null && isCanonicalTimestamp(decidedAt);
}

export function parseFixedTourBeginBookingInput(
  value: unknown,
): FixedTourContractResult<FixedTourBeginBookingInput> {
  const fields = exactFields(value, BEGIN_BOOKING_INPUT_FIELDS, "input");
  if (!fields.ok) return fields;

  if (!isCanonicalUuid(fields.value.departureId)) {
    return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "input.departureId");
  }
  if (
    typeof fields.value.partySize !== "number" ||
    !Number.isSafeInteger(fields.value.partySize) ||
    fields.value.partySize < 1 ||
    fields.value.partySize > 100
  ) {
    return invalid("INVALID_DB_INTEGER", "data.integer.invalid", "input.partySize");
  }
  if (
    typeof fields.value.locale !== "string" ||
    !(LOCALE_VALUES as readonly string[]).includes(fields.value.locale)
  ) {
    return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "input.locale");
  }
  if (
    typeof fields.value.idempotencyKey !== "string" ||
    !IDEMPOTENCY_KEY_PATTERN.test(fields.value.idempotencyKey)
  ) {
    return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "input.idempotencyKey");
  }

  return {
    ok: true,
    value: {
      departureId: fields.value.departureId,
      partySize: fields.value.partySize,
      locale: fields.value.locale as Locale,
      idempotencyKey: fields.value.idempotencyKey,
    },
  };
}

export function parseFixedTourBeginBookingResult(
  value: unknown,
): FixedTourContractResult<FixedTourBeginBookingResult> {
  const fields = exactFields(value, BEGIN_BOOKING_RESULT_FIELDS, "result");
  if (!fields.ok) return fields;

  if (!isCanonicalUuid(fields.value.bookingId)) {
    return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "result.bookingId");
  }
  if (!isCanonicalTimestamp(fields.value.holdExpiresAt)) {
    return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", "result.holdExpiresAt");
  }
  if (fields.value.state !== "created" && fields.value.state !== "resumed") {
    return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "result.state");
  }

  return {
    ok: true,
    value: {
      bookingId: fields.value.bookingId,
      holdExpiresAt: fields.value.holdExpiresAt,
      state: fields.value.state,
    },
  };
}

export function parseCompleteSimulatedPaymentInput(
  value: unknown,
): FixedTourContractResult<CompleteSimulatedPaymentInput> {
  const fields = exactFields(value, COMPLETE_PAYMENT_INPUT_FIELDS, "input");
  if (!fields.ok) return fields;
  if (!isCanonicalUuid(fields.value.bookingId)) {
    return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "input.bookingId");
  }
  if (
    typeof fields.value.idempotencyKey !== "string" ||
    !IDEMPOTENCY_KEY_PATTERN.test(fields.value.idempotencyKey)
  ) {
    return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "input.idempotencyKey");
  }
  return {
    ok: true,
    value: {
      bookingId: fields.value.bookingId,
      idempotencyKey: fields.value.idempotencyKey,
    },
  };
}

export function parseCompleteSimulatedPaymentResult(
  value: unknown,
): FixedTourContractResult<CompleteSimulatedPaymentResult> {
  const fields = exactFields(value, COMPLETE_PAYMENT_RESULT_FIELDS, "result");
  if (!fields.ok) return fields;
  if (!isCanonicalUuid(fields.value.bookingId)) {
    return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "result.bookingId");
  }
  if (!isBookingStatus(fields.value.bookingStatus)) {
    return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "result.bookingStatus");
  }
  if (!isPaidOrNull(fields.value.paymentStatus)) {
    return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "result.paymentStatus");
  }
  if (!isCanonicalTimestamp(fields.value.simulatedAt)) {
    return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", "result.simulatedAt");
  }
  if (
    typeof fields.value.state !== "string" ||
    !PAYMENT_STATES.has(fields.value.state as CompleteSimulatedPaymentResult["state"])
  ) {
    return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "result.state");
  }
  const completedFacts = fields.value.bookingStatus === "confirmed" && fields.value.paymentStatus === "paid";
  const expiredFacts = fields.value.bookingStatus === "expired" && fields.value.paymentStatus === null;
  if (
    (fields.value.state === "completed" && !completedFacts) ||
    (fields.value.state === "expired" && !expiredFacts) ||
    (fields.value.state === "replayed" && !completedFacts && !expiredFacts)
  ) {
    return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "result.state");
  }
  return {
    ok: true,
    value: {
      bookingId: fields.value.bookingId,
      bookingStatus: fields.value.bookingStatus,
      paymentStatus: fields.value.paymentStatus,
      simulatedAt: fields.value.simulatedAt,
      state: fields.value.state as CompleteSimulatedPaymentResult["state"],
    },
  };
}

export function parseFixedTourPaymentStatus(
  value: unknown,
): FixedTourContractResult<FixedTourPaymentStatus> {
  const fields = exactFields(value, PAYMENT_STATUS_FIELDS, "row");
  if (!fields.ok) return fields;
  if (!isCanonicalUuid(fields.value.bookingId)) {
    return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "row.bookingId");
  }
  if (!isBookingStatus(fields.value.bookingStatus)) {
    return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "row.bookingStatus");
  }
  if (!isPaidOrNull(fields.value.paymentStatus)) {
    return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "row.paymentStatus");
  }
  if (
    !(
      (fields.value.bookingStatus === "confirmed" && fields.value.paymentStatus === "paid") ||
      (fields.value.bookingStatus === "expired" && fields.value.paymentStatus === null)
    )
  ) {
    return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "row.paymentStatus");
  }
  if (!isSafeMoney(fields.value.amountMinor)) {
    return invalid("INVALID_DB_DECIMAL", "data.money.invalid", "row.amountMinor");
  }
  if (typeof fields.value.currency !== "string" || !CURRENCIES.has(fields.value.currency as CheckoutCurrency)) {
    return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "row.currency");
  }
  if (!isCanonicalTimestamp(fields.value.simulatedAt)) {
    return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", "row.simulatedAt");
  }
  return {
    ok: true,
    value: {
      bookingId: fields.value.bookingId,
      bookingStatus: fields.value.bookingStatus,
      paymentStatus: fields.value.paymentStatus,
      amountMinor: fields.value.amountMinor,
      currency: fields.value.currency as CheckoutCurrency,
      simulatedAt: fields.value.simulatedAt,
    },
  };
}

export function parseFixedTourCancellationRequestInput(
  value: unknown,
): FixedTourContractResult<FixedTourCancellationRequestInput> {
  const fields = exactFields(value, CANCELLATION_REQUEST_INPUT_FIELDS, "input");
  if (!fields.ok) return fields;
  if (!isCanonicalUuid(fields.value.bookingId)) return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "input.bookingId");
  if (!isSafeText(fields.value.reason)) return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "input.reason");
  if (!isIdempotencyKey(fields.value.idempotencyKey)) return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "input.idempotencyKey");
  return { ok: true, value: {
    bookingId: fields.value.bookingId,
    reason: fields.value.reason,
    idempotencyKey: fields.value.idempotencyKey,
  } };
}

export function parseFixedTourCancellationRequestResult(
  value: unknown,
): FixedTourContractResult<FixedTourCancellationRequestResult> {
  const fields = exactFields(value, CANCELLATION_REQUEST_RESULT_FIELDS, "result");
  if (!fields.ok) return fields;
  if (!isCanonicalUuid(fields.value.requestId)) return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "result.requestId");
  if (!isCanonicalUuid(fields.value.bookingId)) return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "result.bookingId");
  if (fields.value.status !== "pending") return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "result.status");
  if (!isSafeText(fields.value.reason)) return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "result.reason");
  if (!isCanonicalTimestamp(fields.value.requestedAt)) return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", "result.requestedAt");
  if (fields.value.state !== "created" && fields.value.state !== "replayed") {
    return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "result.state");
  }
  return { ok: true, value: {
    requestId: fields.value.requestId,
    bookingId: fields.value.bookingId,
    status: fields.value.status,
    reason: fields.value.reason,
    requestedAt: fields.value.requestedAt,
    state: fields.value.state,
  } };
}

export function parseFixedTourCancellationRequest(
  value: unknown,
): FixedTourContractResult<FixedTourCancellationRequest> {
  const fields = exactFields(value, CANCELLATION_REQUEST_FIELDS, "row");
  if (!fields.ok) return fields;
  if (!isCanonicalUuid(fields.value.requestId)) return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "row.requestId");
  if (!isCanonicalUuid(fields.value.bookingId)) return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "row.bookingId");
  if (!isCancellationStatus(fields.value.status)) return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "row.status");
  if (!isSafeText(fields.value.reason)) return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "row.reason");
  if (!isCanonicalTimestamp(fields.value.requestedAt)) return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", "row.requestedAt");
  if (!hasConsistentDecisionFacts(fields.value.status, fields.value.decisionNote, fields.value.decidedAt)) {
    return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "row.decidedAt");
  }
  return { ok: true, value: {
    requestId: fields.value.requestId,
    bookingId: fields.value.bookingId,
    status: fields.value.status,
    reason: fields.value.reason,
    requestedAt: fields.value.requestedAt,
    decisionNote: fields.value.decisionNote as string | null,
    decidedAt: fields.value.decidedAt as string | null,
  } };
}

export function parseFixedTourCancellationQueueItem(
  value: unknown,
): FixedTourContractResult<FixedTourCancellationQueueItem> {
  const fields = exactFields(value, CANCELLATION_QUEUE_FIELDS, "row");
  if (!fields.ok) return fields;
  const request = parseFixedTourCancellationRequest({
    requestId: fields.value.requestId,
    bookingId: fields.value.bookingId,
    status: fields.value.status,
    reason: fields.value.reason,
    requestedAt: fields.value.requestedAt,
    decisionNote: fields.value.decisionNote,
    decidedAt: fields.value.decidedAt,
  });
  if (!request.ok) return request;
  if (!isBookingStatus(fields.value.bookingStatus)) return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "row.bookingStatus");
  for (const field of ["customerDisplayName", "titleEn", "titleVi"] as const) {
    if (!isSafeText(fields.value[field], 500)) return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", `row.${field}`);
  }
  return { ok: true, value: {
    ...request.value,
    bookingStatus: fields.value.bookingStatus as BookingStatus,
    customerDisplayName: fields.value.customerDisplayName as string,
    titleEn: fields.value.titleEn as string,
    titleVi: fields.value.titleVi as string,
  } };
}

export function parseFixedTourCancellationDecisionInput(
  value: unknown,
): FixedTourContractResult<FixedTourCancellationDecisionInput> {
  const fields = exactFields(value, CANCELLATION_DECISION_INPUT_FIELDS, "input");
  if (!fields.ok) return fields;
  if (!isCanonicalUuid(fields.value.requestId)) return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "input.requestId");
  if (typeof fields.value.decision !== "string" || !CANCELLATION_DECISIONS.has(fields.value.decision as FixedTourCancellationDecision)) {
    return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "input.decision");
  }
  if (!isSafeNullableText(fields.value.note)) return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "input.note");
  if (!isIdempotencyKey(fields.value.idempotencyKey)) return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "input.idempotencyKey");
  return { ok: true, value: {
    requestId: fields.value.requestId,
    decision: fields.value.decision as FixedTourCancellationDecision,
    note: fields.value.note,
    idempotencyKey: fields.value.idempotencyKey,
  } };
}

export function parseFixedTourCancellationDecisionResult(
  value: unknown,
): FixedTourContractResult<FixedTourCancellationDecisionResult> {
  const fields = exactFields(value, CANCELLATION_DECISION_RESULT_FIELDS, "result");
  if (!fields.ok) return fields;
  if (!isCanonicalUuid(fields.value.requestId)) return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "result.requestId");
  if (!isCanonicalUuid(fields.value.bookingId)) return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "result.bookingId");
  if (typeof fields.value.requestStatus !== "string" || !CANCELLATION_DECISIONS.has(fields.value.requestStatus as FixedTourCancellationDecision)) {
    return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "result.requestStatus");
  }
  if (!isBookingStatus(fields.value.bookingStatus)) return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "result.bookingStatus");
  if (!isSafeNullableText(fields.value.decisionNote)) return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "result.decisionNote");
  if (!isCanonicalTimestamp(fields.value.decidedAt)) return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", "result.decidedAt");
  if (fields.value.state !== "approved" && fields.value.state !== "rejected" && fields.value.state !== "replayed") {
    return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "result.state");
  }
  const approvedFacts = fields.value.requestStatus === "approved" && fields.value.bookingStatus === "cancelled";
  const rejectedFacts = fields.value.requestStatus === "rejected";
  if (!approvedFacts && !rejectedFacts) return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "result.bookingStatus");
  if (fields.value.state !== "replayed" && fields.value.state !== fields.value.requestStatus) {
    return invalid("INVALID_SHAPE", "fixedTour.contract.invalid_shape", "result.state");
  }
  return { ok: true, value: {
    requestId: fields.value.requestId,
    bookingId: fields.value.bookingId,
    requestStatus: fields.value.requestStatus as FixedTourCancellationDecision,
    bookingStatus: fields.value.bookingStatus as BookingStatus,
    decisionNote: fields.value.decisionNote,
    decidedAt: fields.value.decidedAt,
    state: fields.value.state,
  } };
}
