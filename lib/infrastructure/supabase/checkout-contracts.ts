import type {
  BookingStatus,
  CheckoutCurrency,
  CheckoutSource,
  CustomerBooking,
  DataAdapterError,
  DepartureStatus,
  LiveDepartureAvailability,
  Locale,
  RecordCheckoutSessionInput,
  Result,
  StartCheckoutInput,
  StartCheckoutResult,
  StripeCheckoutSessionInput,
} from "@/lib/domain/data/contracts";

type UnknownRecord = Record<string, unknown>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UNSIGNED_INTEGER_PATTERN = /^(?:0|[1-9]\d*)$/;
const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;
const TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;
const PROVIDER_SESSION_PATTERN = /^cs_[A-Za-z0-9_-]{6,255}$/;
const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);
const BOOKING_STATUSES = new Set<BookingStatus>([
  "pending_payment", "payment_processing", "confirmed", "payment_failed",
  "payment_review", "expired", "cancelled", "completed",
]);
const DEPARTURE_STATUSES = new Set<DepartureStatus>([
  "scheduled", "sold_out", "cancelled", "completed",
]);
const LOCALES = new Set<Locale>(["en", "vi"]);
const CURRENCIES = new Set<CheckoutCurrency>(["vnd", "usd"]);
const URL_HOSTS = new Set(["locallens.vn", "www.locallens.vn", "locallens.example", "localhost", "127.0.0.1"]);

/** Cross-runtime checkout hash payload. Keep field order and delimiters stable. */
export function canonicalCheckoutRequestPayload(
  ownerUserId: string,
  source: CheckoutSource,
  partySize: number,
  locale: Locale,
): string {
  const sourceId = source.kind === "departure" ? source.departureId : source.quoteId;
  return `localens-checkout-v1|${ownerUserId}|${source.kind}|${sourceId}|${partySize}|${locale}`;
}

/** Web Crypto-compatible SHA-256 for the Edge/browser boundary. */
export async function canonicalCheckoutRequestHash(
  ownerUserId: string,
  source: CheckoutSource,
  partySize: number,
  locale: Locale,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalCheckoutRequestPayload(ownerUserId, source, partySize, locale));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function invalid(
  code: DataAdapterError["code"],
  messageKey: string,
  fieldPath?: string,
): Result<never, DataAdapterError> {
  return {
    ok: false,
    error: fieldPath === undefined ? { code, messageKey } : { code, messageKey, fieldPath },
  };
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactFields(value: unknown, fields: readonly string[], path: string): Result<UnknownRecord, DataAdapterError> {
  if (!isRecord(value)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  const actual = Object.keys(value);
  const unknown = actual.find((field) => !fields.includes(field));
  if (unknown !== undefined) return invalid("UNKNOWN_FIELD", "data.adapter.unknown_field", `${path}.${unknown}`);
  const missing = fields.find((field) => !Object.prototype.hasOwnProperty.call(value, field));
  if (missing !== undefined) return invalid("MISSING_FIELD", "data.adapter.missing_field", `${path}.${missing}`);
  return { ok: true, value };
}

function safeUuid(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value };
}

function safeUnsignedMoney(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string" || !UNSIGNED_INTEGER_PATTERN.test(value)) {
    return invalid("INVALID_DB_INTEGER", "data.integer.invalid", path);
  }
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    return invalid("INVALID_DB_INTEGER", "data.integer.invalid", path);
  }
  if (parsed > MAX_SAFE_INTEGER) return invalid("UNSAFE_DB_INTEGER", "data.integer.unsafe", path);
  return { ok: true, value: parsed.toString(10) };
}

function safePositiveDecimal(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string" || !DECIMAL_PATTERN.test(value)) {
    return invalid("INVALID_DB_DECIMAL", "data.decimal.invalid", path);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return invalid("INVALID_DB_DECIMAL", "data.decimal.invalid", path);
  }
  return { ok: true, value };
}

function safeText(value: unknown, path: string, min: number, max: number): Result<string, DataAdapterError> {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length < min ||
    value.length > max ||
    /[\u0000-\u001F\u007F-\u009F]/.test(value)
  ) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value };
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
  if (year < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  }
  if (offset !== "Z" && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4, 6)) > 59)) {
    return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  }
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second ||
    !Number.isFinite(Date.parse(value))
  ) {
    return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  }
  return { ok: true, value };
}

function safePartySize(value: unknown, path: string): Result<number, DataAdapterError> {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 100) {
    return invalid("INVALID_DB_INTEGER", "data.integer.invalid", path);
  }
  return { ok: true, value };
}

function safeUrl(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string" || value.length > 2048 || /[\u0000-\u001F\u007F-\u009F]/.test(value)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  if ((parsed.protocol !== "https:" && !(parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"))) ||
      parsed.username || parsed.password || parsed.hash || !URL_HOSTS.has(parsed.hostname.toLowerCase())) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  for (const key of parsed.searchParams.keys()) {
    if (/^(?:utm_|fbclid|gclid|token|session|email|phone|name|user|customer)/i.test(key)) {
      return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
    }
  }
  return { ok: true, value };
}

function parseStartSource(value: unknown, path: string): Result<StartCheckoutInput["source"], DataAdapterError> {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  if (value.kind === "departure") {
    const fields = exactFields(value, ["kind", "departureId"], path);
    if (!fields.ok) return fields;
    const departureId = safeUuid(fields.value.departureId, `${path}.departureId`);
    return departureId.ok ? { ok: true, value: { kind: "departure", departureId: departureId.value } } : departureId;
  }
  if (value.kind === "quote") {
    const fields = exactFields(value, ["kind", "quoteId"], path);
    if (!fields.ok) return fields;
    const quoteId = safeUuid(fields.value.quoteId, `${path}.quoteId`);
    return quoteId.ok ? { ok: true, value: { kind: "quote", quoteId: quoteId.value } } : quoteId;
  }
  return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}.kind`);
}

export function toStartCheckoutInput(input: unknown): Result<StartCheckoutInput, DataAdapterError> {
  const fields = exactFields(input, ["source", "partySize", "locale", "idempotencyKey"], "input");
  if (!fields.ok) return fields;
  const source = parseStartSource(fields.value.source, "input.source");
  const partySize = safePartySize(fields.value.partySize, "input.partySize");
  const locale = fields.value.locale;
  const idempotencyKey = fields.value.idempotencyKey;
  if (!source.ok) return source;
  if (!partySize.ok) return partySize;
  if (typeof locale !== "string" || !LOCALES.has(locale as Locale)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "input.locale");
  }
  if (typeof idempotencyKey !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "input.idempotencyKey");
  }
  return { ok: true, value: { source: source.value, partySize: partySize.value, locale: locale as Locale, idempotencyKey } };
}

function parseStartResult(value: unknown): Result<StartCheckoutResult, DataAdapterError> {
  const fields = exactFields(value, ["bookingId", "attemptId", "providerIdempotencyKey", "amountMinor", "currency", "holdExpiresAt", "state"], "result");
  if (!fields.ok) return fields;
  const bookingId = safeUuid(fields.value.bookingId, "result.bookingId");
  const attemptId = safeUuid(fields.value.attemptId, "result.attemptId");
  const amountMinor = safeUnsignedMoney(fields.value.amountMinor, "result.amountMinor");
  const holdExpiresAt = safeTimestamp(fields.value.holdExpiresAt, "result.holdExpiresAt");
  if (!bookingId.ok) return bookingId;
  if (!attemptId.ok) return attemptId;
  if (!amountMinor.ok) return amountMinor;
  if (!holdExpiresAt.ok) return holdExpiresAt;
  if (typeof fields.value.providerIdempotencyKey !== "string" ||
      fields.value.providerIdempotencyKey !== `localens:stripe-checkout:v1:${attemptId.value}`) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "result.providerIdempotencyKey");
  }
  if (!CURRENCIES.has(fields.value.currency as CheckoutCurrency)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "result.currency");
  }
  if (fields.value.state !== "created" && fields.value.state !== "resumed") {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "result.state");
  }
  return {
    ok: true,
    value: {
      bookingId: bookingId.value,
      attemptId: attemptId.value,
      providerIdempotencyKey: fields.value.providerIdempotencyKey,
      amountMinor: amountMinor.value,
      currency: fields.value.currency as CheckoutCurrency,
      holdExpiresAt: holdExpiresAt.value,
      state: fields.value.state,
    },
  };
}

export function toStripeCheckoutSession(
  result: StartCheckoutResult,
  urls: { successUrl: string; cancelUrl: string },
  now: Date,
): Result<StripeCheckoutSessionInput, DataAdapterError> {
  const parsedResult = parseStartResult(result);
  if (!parsedResult.ok) return parsedResult;
  const urlFields = exactFields(urls, ["successUrl", "cancelUrl"], "urls");
  if (!urlFields.ok) return urlFields;
  const successUrl = safeUrl(urlFields.value.successUrl, "urls.successUrl");
  const cancelUrl = safeUrl(urlFields.value.cancelUrl, "urls.cancelUrl");
  if (!successUrl.ok) return successUrl;
  if (!cancelUrl.ok) return cancelUrl;
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", "now");
  }
  const holdExpiresAt = Date.parse(parsedResult.value.holdExpiresAt);
  const expiresAt = Math.floor(now.getTime() / 1000) + 30 * 60;
  if (!Number.isFinite(holdExpiresAt) || holdExpiresAt <= now.getTime() + 30 * 60 * 1000) {
    return invalid("INVALID_TIMESTAMP", "data.checkout.hold_too_short", "result.holdExpiresAt");
  }
  let amount: number;
  try {
    amount = Number(BigInt(parsedResult.value.amountMinor));
  } catch {
    return invalid("INVALID_DB_INTEGER", "data.integer.invalid", "result.amountMinor");
  }
  if (!Number.isSafeInteger(amount) || amount < 1) {
    return invalid("UNSAFE_DB_INTEGER", "data.integer.unsafe", "result.amountMinor");
  }
  return {
    ok: true,
    value: {
      mode: "payment",
      payment_method_types: ["card"],
      expires_at: expiresAt,
      client_reference_id: parsedResult.value.bookingId,
      metadata: { booking_id: parsedResult.value.bookingId, attempt_id: parsedResult.value.attemptId },
      line_items: [{
        price_data: {
          currency: parsedResult.value.currency,
          unit_amount: amount,
          product_data: { name: "LocalLens tour booking" },
        },
        quantity: 1,
      }],
      success_url: successUrl.value,
      cancel_url: cancelUrl.value,
    },
  };
}

export function toRecordCheckoutSession(input: unknown): Result<RecordCheckoutSessionInput, DataAdapterError> {
  const fields = exactFields(input, ["bookingId", "attemptId", "providerSessionId", "providerExpiresAt"], "input");
  if (!fields.ok) return fields;
  const bookingId = safeUuid(fields.value.bookingId, "input.bookingId");
  const attemptId = safeUuid(fields.value.attemptId, "input.attemptId");
  const providerExpiresAt = safeTimestamp(fields.value.providerExpiresAt, "input.providerExpiresAt");
  const providerSessionId = fields.value.providerSessionId;
  if (!bookingId.ok) return bookingId;
  if (!attemptId.ok) return attemptId;
  if (!providerExpiresAt.ok) return providerExpiresAt;
  if (typeof providerSessionId !== "string" || !PROVIDER_SESSION_PATTERN.test(providerSessionId)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "input.providerSessionId");
  }
  return { ok: true, value: { bookingId: bookingId.value, attemptId: attemptId.value, providerSessionId, providerExpiresAt: providerExpiresAt.value } };
}

const BOOKING_FIELDS = [
  "id", "status", "source_kind", "source_id", "tour_version_id", "quote_id", "title_en", "title_vi",
  "cancellation_policy", "catalog_snapshot_id", "travel_snapshot_id", "fx_snapshot_id", "fx_vnd_per_usd",
  "per_person_vnd_minor", "total_vnd_minor", "checkout_currency", "checkout_amount_minor", "party_size",
  "language", "meeting_point", "hold_expires_at", "created_at",
] as const;

export function mapCustomerBooking(row: unknown): Result<CustomerBooking, DataAdapterError> {
  const fields = exactFields(row, BOOKING_FIELDS, "row");
  if (!fields.ok) return fields;
  const id = safeUuid(fields.value.id, "row.id");
  const sourceId = safeUuid(fields.value.source_id, "row.source_id");
  const catalogSnapshotId = safeUuid(fields.value.catalog_snapshot_id, "row.catalog_snapshot_id");
  const travelSnapshotId = safeUuid(fields.value.travel_snapshot_id, "row.travel_snapshot_id");
  const titleEn = safeText(fields.value.title_en, "row.title_en", 1, 240);
  const titleVi = safeText(fields.value.title_vi, "row.title_vi", 1, 240);
  const cancellationPolicy = safeText(fields.value.cancellation_policy, "row.cancellation_policy", 1, 4000);
  const meetingPoint = safeText(fields.value.meeting_point, "row.meeting_point", 1, 500);
  const totalVndMinor = safeUnsignedMoney(fields.value.total_vnd_minor, "row.total_vnd_minor");
  const checkoutAmountMinor = safeUnsignedMoney(fields.value.checkout_amount_minor, "row.checkout_amount_minor");
  const holdExpiresAt = safeTimestamp(fields.value.hold_expires_at, "row.hold_expires_at");
  const createdAt = safeTimestamp(fields.value.created_at, "row.created_at");
  if (!id.ok) return id;
  if (!sourceId.ok) return sourceId;
  if (!catalogSnapshotId.ok) return catalogSnapshotId;
  if (!travelSnapshotId.ok) return travelSnapshotId;
  if (!titleEn.ok) return titleEn;
  if (!titleVi.ok) return titleVi;
  if (!cancellationPolicy.ok) return cancellationPolicy;
  if (!meetingPoint.ok) return meetingPoint;
  if (!totalVndMinor.ok) return totalVndMinor;
  if (!checkoutAmountMinor.ok) return checkoutAmountMinor;
  if (!holdExpiresAt.ok) return holdExpiresAt;
  if (!createdAt.ok) return createdAt;
  if (typeof fields.value.status !== "string" || !BOOKING_STATUSES.has(fields.value.status as BookingStatus)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "row.status");
  }
  if (fields.value.source_kind !== "departure" && fields.value.source_kind !== "quote") {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "row.source_kind");
  }
  if (!CURRENCIES.has(fields.value.checkout_currency as CheckoutCurrency)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "row.checkout_currency");
  }
  if (typeof fields.value.language !== "string" || !LOCALES.has(fields.value.language as Locale)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "row.language");
  }
  const partySize = safePartySize(fields.value.party_size, "row.party_size");
  if (!partySize.ok) return partySize;
  let tourVersionId: string | null = null;
  if (fields.value.tour_version_id !== null) {
    const parsed = safeUuid(fields.value.tour_version_id, "row.tour_version_id");
    if (!parsed.ok) return parsed;
    tourVersionId = parsed.value;
  }
  let quoteId: string | null = null;
  if (fields.value.quote_id !== null) {
    const parsed = safeUuid(fields.value.quote_id, "row.quote_id");
    if (!parsed.ok) return parsed;
    quoteId = parsed.value;
  }
  if ((fields.value.source_kind === "departure" && (tourVersionId === null || quoteId !== null)) ||
      (fields.value.source_kind === "quote" && (quoteId !== sourceId.value || tourVersionId !== null))) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "row.source_kind");
  }
  let perPersonVndMinor: string | null = null;
  if (fields.value.per_person_vnd_minor !== null) {
    const parsed = safeUnsignedMoney(fields.value.per_person_vnd_minor, "row.per_person_vnd_minor");
    if (!parsed.ok) return parsed;
    perPersonVndMinor = parsed.value;
  }
  if (fields.value.source_kind === "departure" && perPersonVndMinor === null) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "row.per_person_vnd_minor");
  }
  let fxSnapshotId: string | null = null;
  if (fields.value.fx_snapshot_id !== null) {
    const parsed = safeUuid(fields.value.fx_snapshot_id, "row.fx_snapshot_id");
    if (!parsed.ok) return parsed;
    fxSnapshotId = parsed.value;
  }
  let fxVndPerUsd: string | null = null;
  if (fields.value.fx_vnd_per_usd !== null) {
    const parsed = safePositiveDecimal(fields.value.fx_vnd_per_usd, "row.fx_vnd_per_usd");
    if (!parsed.ok) return parsed;
    fxVndPerUsd = parsed.value;
  }
  if ((fields.value.checkout_currency === "vnd" && (fxSnapshotId !== null || fxVndPerUsd !== null)) ||
      (fields.value.checkout_currency === "usd" && (fxSnapshotId === null || fxVndPerUsd === null))) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "row.checkout_currency");
  }
  return {
    ok: true,
    value: {
      id: id.value,
      status: fields.value.status as BookingStatus,
      sourceKind: fields.value.source_kind as "departure" | "quote",
      sourceId: sourceId.value,
      tourVersionId,
      quoteId,
      titleEn: titleEn.value,
      titleVi: titleVi.value,
      cancellationPolicy: cancellationPolicy.value,
      catalogSnapshotId: catalogSnapshotId.value,
      travelSnapshotId: travelSnapshotId.value,
      fxSnapshotId,
      fxVndPerUsd,
      perPersonVndMinor,
      totalVndMinor: totalVndMinor.value,
      checkoutCurrency: fields.value.checkout_currency as CheckoutCurrency,
      checkoutAmountMinor: checkoutAmountMinor.value,
      partySize: partySize.value,
      language: fields.value.language as Locale,
      meetingPoint: meetingPoint.value,
      holdExpiresAt: holdExpiresAt.value,
      createdAt: createdAt.value,
    },
  };
}

const AVAILABILITY_FIELDS = ["id", "tour_version_id", "start_at", "end_at", "status", "remaining_capacity"] as const;

export function mapLiveDepartureAvailability(row: unknown): Result<LiveDepartureAvailability, DataAdapterError> {
  const fields = exactFields(row, AVAILABILITY_FIELDS, "row");
  if (!fields.ok) return fields;
  const id = safeUuid(fields.value.id, "row.id");
  const tourVersionId = safeUuid(fields.value.tour_version_id, "row.tour_version_id");
  const startAt = safeTimestamp(fields.value.start_at, "row.start_at");
  const endAt = safeTimestamp(fields.value.end_at, "row.end_at");
  if (!id.ok) return id;
  if (!tourVersionId.ok) return tourVersionId;
  if (!startAt.ok) return startAt;
  if (!endAt.ok) return endAt;
  if (typeof fields.value.status !== "string" || !DEPARTURE_STATUSES.has(fields.value.status as DepartureStatus)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "row.status");
  }
  if (typeof fields.value.remaining_capacity !== "number" || !Number.isSafeInteger(fields.value.remaining_capacity) || fields.value.remaining_capacity < 0) {
    return invalid("INVALID_DB_INTEGER", "data.integer.invalid", "row.remaining_capacity");
  }
  if (Date.parse(endAt.value) <= Date.parse(startAt.value)) {
    return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", "row.end_at");
  }
  return {
    ok: true,
    value: {
      id: id.value,
      tourVersionId: tourVersionId.value,
      startAt: startAt.value,
      endAt: endAt.value,
      status: fields.value.status as DepartureStatus,
      remainingCapacity: fields.value.remaining_capacity,
    },
  };
}
