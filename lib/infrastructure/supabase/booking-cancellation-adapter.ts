import type { SupabaseClient } from "@supabase/supabase-js";

import {
  PortalError,
  parseAdminBookingManagementProjection,
  parseBookingCancellation,
  parseCancelBookingResult,
  validateCancelBookingInput,
  type BookingCancellation,
  type AdminBookingManagementProjection,
  type CancelBookingInput,
  type CancelBookingResult,
  type PortalErrorCode,
} from "@/lib/application/portal/contracts";
import type { Database } from "@/lib/infrastructure/supabase/database.types";

type BookingCancellationClient = Pick<SupabaseClient<Database>, "auth" | "from" | "rpc">;
type UnknownRecord = Record<string, unknown>;

const CANCELLATION_COLUMNS = [
  "id", "booking_id", "customer_user_id", "source_kind", "reason_code",
  "other_reason", "idempotency_key", "cancelled_at",
].join(",");
const CANCELLATION_FIELDS = [
  "id", "booking_id", "customer_user_id", "source_kind", "reason_code",
  "other_reason", "idempotency_key", "cancelled_at",
] as const;
const CANCELLATION_RESULT_FIELDS = [
  ...CANCELLATION_FIELDS,
  "booking_status",
  "state",
] as const;
const ADMIN_BOOKING_COLUMNS = [
  "booking_id", "customer_user_id", "source_kind", "title_en", "title_vi", "booking_status", "created_at",
  "cancellation_id", "cancellation_reason_code", "cancellation_other_reason", "cancellation_idempotency_key", "cancelled_at",
].join(",");
const ADMIN_BOOKING_FIELDS = [
  "booking_id", "customer_user_id", "source_kind", "title_en", "title_vi", "booking_status", "created_at",
  "cancellation_id", "cancellation_reason_code", "cancellation_other_reason", "cancellation_idempotency_key", "cancelled_at",
] as const;
const ADMIN_CANCELLATION_REQUIRED_FIELDS = [
  "cancellation_id", "cancellation_idempotency_key", "cancelled_at",
] as const;
const POSTGRES_UTC_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(?:Z|\+00:00)$/;

export interface SupabaseBookingCancellationPort {
  cancelBooking(input: CancelBookingInput): Promise<CancelBookingResult>;
  listOwnCancellations(): Promise<BookingCancellation[]>;
  listAdminCancellations(): Promise<BookingCancellation[]>;
}

export interface SupabaseAdminBookingManagementPort {
  listAdminBookings(): Promise<AdminBookingManagementProjection[]>;
}

export type SupabaseBookingCancellationHistoryAdapter =
  SupabaseBookingCancellationPort & SupabaseAdminBookingManagementPort;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function portalFailure(code: PortalErrorCode): PortalError {
  const messages: Record<PortalErrorCode, string> = {
    INVALID_INPUT: "The cancellation details are invalid.",
    UNAUTHENTICATED: "A signed-in session is required.",
    FORBIDDEN: "The cancellation operation is not permitted.",
    NOT_FOUND: "The booking is unavailable.",
    CONFLICT: "The booking can no longer be cancelled.",
    INVALID_STORAGE: "The cancellation service returned invalid data.",
    STORAGE_UNAVAILABLE: "The cancellation service is unavailable.",
    PRODUCTION_CONFIGURATION: "The cancellation service is not configured.",
  };
  return new PortalError(code, messages[code]);
}

function databaseError(error: unknown): PortalError {
  const code = isRecord(error) && typeof error.code === "string" ? error.code : "";
  const message = isRecord(error) && typeof error.message === "string"
    ? error.message.toLowerCase()
    : "";
  if (code === "22023") return portalFailure("INVALID_INPUT");
  if (code === "42501") return portalFailure("FORBIDDEN");
  if (code === "PGRST301" || code === "PGRST302") return portalFailure("UNAUTHENTICATED");
  if (code === "P0001") {
    if (message.includes("unavailable") || message.includes("conflict") || message.includes("payment")) {
      return portalFailure("CONFLICT");
    }
    if (message.includes("not found")) return portalFailure("NOT_FOUND");
  }
  return portalFailure("STORAGE_UNAVAILABLE");
}

function exactRow(value: unknown, fields: readonly string[]): UnknownRecord {
  if (!isRecord(value)) throw portalFailure("INVALID_STORAGE");
  const keys = Object.keys(value);
  if (keys.length !== fields.length || fields.some((field) => !Object.hasOwn(value, field))) {
    throw portalFailure("INVALID_STORAGE");
  }
  return value;
}

function normalizePostgresTimestamp(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const match = POSTGRES_UTC_TIMESTAMP.exec(value);
  if (!match) return value;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (
    daysInMonth === undefined || day < 1 || day > daysInMonth
    || hour > 23 || minute > 59 || second > 59
  ) return value;

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value;
}

function cancellationFromRow(value: unknown): BookingCancellation {
  const row = exactRow(value, CANCELLATION_FIELDS);
  const parsed = parseBookingCancellation({
    id: row.id,
    bookingId: row.booking_id,
    customerUserId: row.customer_user_id,
    sourceKind: row.source_kind,
    reasonCode: row.reason_code,
    otherReason: row.other_reason,
    idempotencyKey: row.idempotency_key,
    cancelledAt: normalizePostgresTimestamp(row.cancelled_at),
  });
  if (!parsed.ok) throw portalFailure("INVALID_STORAGE");
  return parsed.value;
}

function cancellationRows(value: unknown): BookingCancellation[] {
  if (!Array.isArray(value)) throw portalFailure("INVALID_STORAGE");
  const mapped: BookingCancellation[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) throw portalFailure("INVALID_STORAGE");
    mapped.push(cancellationFromRow(value[index]));
  }
  return mapped;
}

function adminBookingFromRow(value: unknown): AdminBookingManagementProjection {
  const row = exactRow(value, ADMIN_BOOKING_FIELDS);
  const requiredCancellationValues = ADMIN_CANCELLATION_REQUIRED_FIELDS.map((field) => row[field]);
  const hasNoCancellation = requiredCancellationValues.every((field) => field === null)
    && row.cancellation_reason_code === null
    && row.cancellation_other_reason === null;
  const hasCompleteCancellation = requiredCancellationValues.every((field) => field !== null);
  if (!hasNoCancellation && !hasCompleteCancellation) throw portalFailure("INVALID_STORAGE");

  const parsed = parseAdminBookingManagementProjection({
    bookingId: row.booking_id,
    customerUserId: row.customer_user_id,
    sourceKind: row.source_kind,
    titleEn: row.title_en,
    titleVi: row.title_vi,
    bookingStatus: row.booking_status,
    createdAt: normalizePostgresTimestamp(row.created_at),
    cancellation: hasNoCancellation
      ? null
      : {
        id: row.cancellation_id,
        bookingId: row.booking_id,
        customerUserId: row.customer_user_id,
        sourceKind: row.source_kind,
        reasonCode: row.cancellation_reason_code,
        otherReason: row.cancellation_other_reason,
        idempotencyKey: row.cancellation_idempotency_key,
        cancelledAt: normalizePostgresTimestamp(row.cancelled_at),
      },
  });
  if (!parsed.ok) throw portalFailure("INVALID_STORAGE");
  return parsed.value;
}

function adminBookingRows(value: unknown): AdminBookingManagementProjection[] {
  if (!Array.isArray(value)) throw portalFailure("INVALID_STORAGE");
  const mapped: AdminBookingManagementProjection[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) throw portalFailure("INVALID_STORAGE");
    mapped.push(adminBookingFromRow(value[index]));
  }
  return mapped;
}

async function requireSession(client: BookingCancellationClient): Promise<void> {
  let response: Awaited<ReturnType<BookingCancellationClient["auth"]["getSession"]>>;
  try {
    response = await client.auth.getSession();
  } catch {
    throw portalFailure("STORAGE_UNAVAILABLE");
  }
  if (response.error) throw databaseError(response.error);
  if (!response.data.session) throw portalFailure("UNAUTHENTICATED");
}

async function responseData<T>(request: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  let response: { data: T | null; error: unknown };
  try {
    response = await request;
  } catch {
    throw portalFailure("STORAGE_UNAVAILABLE");
  }
  if (response.error) throw databaseError(response.error);
  if (response.data === null) throw portalFailure("INVALID_STORAGE");
  return response.data;
}

export function createSupabaseBookingCancellationAdapter(
  client: BookingCancellationClient,
): SupabaseBookingCancellationHistoryAdapter {
  async function listProjection(view: "customer_booking_cancellations_v" | "admin_booking_cancellations_v") {
    await requireSession(client);
    const data = await responseData(
      client.from(view).select(CANCELLATION_COLUMNS).order("cancelled_at", { ascending: false }),
    );
    return cancellationRows(data);
  }

  return {
    async cancelBooking(input) {
      const parsedInput = validateCancelBookingInput(input);
      if (!parsedInput.ok) throw portalFailure("INVALID_INPUT");
      await requireSession(client);
      const optionalReason = parsedInput.value.reasonCode === null
        ? {}
        : {
          reason_code: parsedInput.value.reasonCode,
          ...(parsedInput.value.otherReason === null
            ? {}
            : { other_reason: parsedInput.value.otherReason }),
        };
      const data = await responseData(client.rpc("cancel_booking", {
        booking_id: parsedInput.value.bookingId,
        idempotency_key: parsedInput.value.idempotencyKey,
        ...optionalReason,
      }));
      if (!Array.isArray(data) || data.length !== 1 || !Object.hasOwn(data, 0)) {
        throw portalFailure("INVALID_STORAGE");
      }
      const row = exactRow(data[0], CANCELLATION_RESULT_FIELDS);
      const parsedResult = parseCancelBookingResult({
        cancellation: {
          id: row.id,
          bookingId: row.booking_id,
          customerUserId: row.customer_user_id,
          sourceKind: row.source_kind,
          reasonCode: row.reason_code,
          otherReason: row.other_reason,
          idempotencyKey: row.idempotency_key,
          cancelledAt: normalizePostgresTimestamp(row.cancelled_at),
        },
        bookingStatus: row.booking_status,
        state: row.state,
      });
      if (!parsedResult.ok) throw portalFailure("INVALID_STORAGE");
      return parsedResult.value;
    },
    listOwnCancellations: () => listProjection("customer_booking_cancellations_v"),
    listAdminCancellations: () => listProjection("admin_booking_cancellations_v"),
    async listAdminBookings() {
      await requireSession(client);
      const data = await responseData(
        client
          .from("admin_booking_management_v")
          .select(ADMIN_BOOKING_COLUMNS)
          .order("created_at", { ascending: false })
          .order("booking_id", { ascending: false }),
      );
      return adminBookingRows(data);
    },
  };
}
