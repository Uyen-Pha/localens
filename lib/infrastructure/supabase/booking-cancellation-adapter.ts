import type { SupabaseClient } from "@supabase/supabase-js";

import {
  PortalError,
  parseBookingCancellation,
  parseCancelBookingResult,
  validateCancelBookingInput,
  type BookingCancellation,
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

export interface SupabaseBookingCancellationPort {
  cancelBooking(input: CancelBookingInput): Promise<CancelBookingResult>;
  listOwnCancellations(): Promise<BookingCancellation[]>;
  listAdminCancellations(): Promise<BookingCancellation[]>;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function portalFailure(code: PortalErrorCode): PortalError {
  const messages: Record<PortalErrorCode, string> = {
    INVALID_INPUT: "The cancellation request is invalid.",
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
    cancelledAt: row.cancelled_at,
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

async function requireSession(client: BookingCancellationClient): Promise<void> {
  const response = await client.auth.getSession();
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
): SupabaseBookingCancellationPort {
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
          cancelledAt: row.cancelled_at,
        },
        bookingStatus: row.booking_status,
        state: row.state,
      });
      if (!parsedResult.ok) throw portalFailure("INVALID_STORAGE");
      return parsedResult.value;
    },
    listOwnCancellations: () => listProjection("customer_booking_cancellations_v"),
    listAdminCancellations: () => listProjection("admin_booking_cancellations_v"),
  };
}
