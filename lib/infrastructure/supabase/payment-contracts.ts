import type {
  BookingStatus,
  CheckoutCurrency,
  CustomerPaymentStatus,
  DataAdapterError,
  FinalizeStripeEventInput,
  PaymentStatus,
  Result,
} from "@/lib/domain/data/contracts";

type UnknownRecord = Record<string, unknown>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PROVIDER_BODY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{5,254}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const UNSIGNED_INTEGER_PATTERN = /^(?:0|[1-9]\d*)$/;
const TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;
const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);
const PAYMENT_STATUSES = new Set<PaymentStatus>(["pending", "paid", "failed", "review"]);
const BOOKING_STATUSES = new Set<BookingStatus>([
  "pending_payment", "payment_processing", "confirmed", "payment_failed",
  "payment_review", "expired", "cancelled", "completed",
]);
const CURRENCIES = new Set<CheckoutCurrency>(["vnd", "usd"]);

function invalid(
  code: DataAdapterError["code"],
  messageKey: string,
  fieldPath?: string,
): Result<never, DataAdapterError> {
  return { ok: false, error: fieldPath === undefined ? { code, messageKey } : { code, messageKey, fieldPath } };
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactFields(value: unknown, fields: readonly string[], path: string): Result<UnknownRecord, DataAdapterError> {
  if (!isRecord(value)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  const unknown = Object.keys(value).find((field) => !fields.includes(field));
  if (unknown !== undefined) return invalid("UNKNOWN_FIELD", "data.adapter.unknown_field", `${path}.${unknown}`);
  const missing = fields.find((field) => !Object.prototype.hasOwnProperty.call(value, field));
  if (missing !== undefined) return invalid("MISSING_FIELD", "data.adapter.missing_field", `${path}.${missing}`);
  return { ok: true, value };
}

function safeUuid(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string" || value !== value.toLowerCase() || !UUID_PATTERN.test(value)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value };
}

function safeProviderId(value: unknown, path: string, prefix: "evt_" | "cs_" | "pi_" | "acct_" | "we_"): Result<string, DataAdapterError> {
  if (
    typeof value !== "string" ||
    !value.startsWith(prefix) ||
    !PROVIDER_BODY_PATTERN.test(value.slice(prefix.length)) ||
    value.length - prefix.length < 6 ||
    value.length - prefix.length > 255 ||
    !/^[A-Za-z0-9_-]+$/.test(value.slice(prefix.length)) ||
    /[\u0000-\u001F\u007F-\u009F]/.test(value)
  ) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value };
}

function safeHash(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value };
}

function safeMoney(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string" || !UNSIGNED_INTEGER_PATTERN.test(value)) {
    return invalid("INVALID_DB_INTEGER", "data.integer.invalid", path);
  }
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    return invalid("INVALID_DB_INTEGER", "data.integer.invalid", path);
  }
  if (parsed < BigInt(1)) return invalid("INVALID_DB_INTEGER", "data.integer.invalid", path);
  if (parsed > MAX_SAFE_INTEGER) return invalid("UNSAFE_DB_INTEGER", "data.integer.unsafe", path);
  return { ok: true, value: parsed.toString(10) };
}

function safeTimestamp(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string") return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  const match = value.match(TIMESTAMP_PATTERN);
  if (!match) return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offset = match[8];
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  }
  if (offset !== "Z" && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4, 6)) > 59)) {
    return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  }
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day || date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second ||
    !Number.isFinite(Date.parse(value))
  ) return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  return { ok: true, value };
}

function safeEnum<T extends string>(value: unknown, values: ReadonlySet<T>, path: string): Result<T, DataAdapterError> {
  if (typeof value !== "string" || !values.has(value as T)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  return { ok: true, value: value as T };
}

const COMMON_FIELDS = [
  "eventId", "payloadHash", "sessionId", "bookingId", "attemptId", "amountMinor", "currency",
  "livemode", "mode", "accountId", "endpointId",
] as const;

export function toFinalizeStripeEventInput(input: unknown): Result<FinalizeStripeEventInput, DataAdapterError> {
  const fields = exactFields(input, [...COMMON_FIELDS, "eventType", "sessionStatus", "providerPaymentStatus", "paymentIntentId"], "input");
  if (!fields.ok) return fields;
  const eventId = safeProviderId(fields.value.eventId, "input.eventId", "evt_");
  const payloadHash = safeHash(fields.value.payloadHash, "input.payloadHash");
  const sessionId = safeProviderId(fields.value.sessionId, "input.sessionId", "cs_");
  const bookingId = safeUuid(fields.value.bookingId, "input.bookingId");
  const attemptId = safeUuid(fields.value.attemptId, "input.attemptId");
  const amountMinor = safeMoney(fields.value.amountMinor, "input.amountMinor");
  const currency = safeEnum(fields.value.currency, new Set<CheckoutCurrency>(["vnd", "usd"]), "input.currency");
  const accountId = safeProviderId(fields.value.accountId, "input.accountId", "acct_");
  const endpointId = safeProviderId(fields.value.endpointId, "input.endpointId", "we_");
  if (!eventId.ok) return eventId;
  if (!payloadHash.ok) return payloadHash;
  if (!sessionId.ok) return sessionId;
  if (!bookingId.ok) return bookingId;
  if (!attemptId.ok) return attemptId;
  if (!amountMinor.ok) return amountMinor;
  if (!currency.ok) return currency;
  if (!accountId.ok) return accountId;
  if (!endpointId.ok) return endpointId;
  if (fields.value.livemode !== false) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "input.livemode");
  if (fields.value.mode !== "payment") return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "input.mode");
  const eventType = fields.value.eventType;
  if (eventType === "checkout.session.completed") {
    if (fields.value.sessionStatus !== "complete") return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "input.sessionStatus");
    if (fields.value.providerPaymentStatus !== "paid") return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "input.providerPaymentStatus");
    const paymentIntentId = safeProviderId(fields.value.paymentIntentId, "input.paymentIntentId", "pi_");
    if (!paymentIntentId.ok) return paymentIntentId;
    return { ok: true, value: {
      eventId: eventId.value, payloadHash: payloadHash.value, sessionId: sessionId.value,
      bookingId: bookingId.value, attemptId: attemptId.value, amountMinor: amountMinor.value,
      currency: currency.value, livemode: false, mode: "payment", accountId: accountId.value,
      endpointId: endpointId.value, eventType, sessionStatus: "complete",
      providerPaymentStatus: "paid", paymentIntentId: paymentIntentId.value,
    } };
  }
  if (eventType === "checkout.session.expired") {
    if (fields.value.sessionStatus !== "expired") return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "input.sessionStatus");
    if (fields.value.providerPaymentStatus !== "unpaid") return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "input.providerPaymentStatus");
    let paymentIntentId: string | null = null;
    if (fields.value.paymentIntentId !== null) {
      const parsed = safeProviderId(fields.value.paymentIntentId, "input.paymentIntentId", "pi_");
      if (!parsed.ok) return parsed;
      paymentIntentId = parsed.value;
    }
    return { ok: true, value: {
      eventId: eventId.value, payloadHash: payloadHash.value, sessionId: sessionId.value,
      bookingId: bookingId.value, attemptId: attemptId.value, amountMinor: amountMinor.value,
      currency: currency.value, livemode: false, mode: "payment", accountId: accountId.value,
      endpointId: endpointId.value, eventType, sessionStatus: "expired",
      providerPaymentStatus: "unpaid", paymentIntentId,
    } };
  }
  return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "input.eventType");
}

const CUSTOMER_PAYMENT_FIELDS = [
  "booking_id", "booking_status", "payment_status", "amount_minor", "currency", "updated_at",
] as const;

export function mapCustomerPaymentStatus(row: unknown): Result<CustomerPaymentStatus, DataAdapterError> {
  const fields = exactFields(row, CUSTOMER_PAYMENT_FIELDS, "row");
  if (!fields.ok) return fields;
  const bookingId = safeUuid(fields.value.booking_id, "row.booking_id");
  const bookingStatus = safeEnum(fields.value.booking_status, BOOKING_STATUSES, "row.booking_status");
  const paymentStatus = fields.value.payment_status === null
    ? { ok: true, value: null } as const
    : safeEnum(fields.value.payment_status, PAYMENT_STATUSES, "row.payment_status");
  const amountMinor = safeMoney(fields.value.amount_minor, "row.amount_minor");
  const currency = safeEnum(fields.value.currency, CURRENCIES, "row.currency");
  const updatedAt = safeTimestamp(fields.value.updated_at, "row.updated_at");
  if (!bookingId.ok) return bookingId;
  if (!bookingStatus.ok) return bookingStatus;
  if (!paymentStatus.ok) return paymentStatus;
  if (!amountMinor.ok) return amountMinor;
  if (!currency.ok) return currency;
  if (!updatedAt.ok) return updatedAt;
  return { ok: true, value: {
    bookingId: bookingId.value,
    bookingStatus: bookingStatus.value,
    paymentStatus: paymentStatus.value,
    amountMinor: amountMinor.value,
    currency: currency.value,
    updatedAt: updatedAt.value,
  } };
}
