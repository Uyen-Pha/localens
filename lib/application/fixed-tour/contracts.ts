import { LOCALE_VALUES } from "@/lib/domain/data/contracts";
import type {
  CustomerBooking,
  DataAdapterError,
  LiveDepartureAvailability,
  Locale,
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

export interface FixedTourRuntimePort {
  listPublishedTours(locale: Locale): Promise<PublishedTour[]>;
  listAvailability(): Promise<LiveDepartureAvailability[]>;
  beginBooking(input: FixedTourBeginBookingInput): Promise<FixedTourBeginBookingResult>;
  listOwnBookings(): Promise<CustomerBooking[]>;
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
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;
const TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;

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
