import type { SupabaseClient } from "@supabase/supabase-js";

import {
  FixedTourRuntimeError,
  parseFixedTourBeginBookingInput,
  parseFixedTourBeginBookingResult,
  type FixedTourRuntimeErrorCode,
  type FixedTourRuntimePort,
} from "@/lib/application/fixed-tour/contracts";
import type {
  CustomerBooking,
  DataAdapterError,
  LiveDepartureAvailability,
  Locale,
  PublishedTour,
  Result,
} from "@/lib/domain/data/contracts";
import { mapPublishedTour } from "@/lib/domain/data/public-tours";
import {
  mapCustomerBooking,
  mapLiveDepartureAvailability,
} from "@/lib/infrastructure/supabase/checkout-contracts";
import type { Database } from "@/lib/infrastructure/supabase/database.types";

type FixedTourSupabaseClient = Pick<SupabaseClient<Database>, "auth" | "from" | "rpc">;
type UnknownRecord = Record<string, unknown>;

const PUBLISHED_TOUR_COLUMNS = [
  "tour_id",
  "tour_version_id",
  "slug",
  "locale",
  "title",
  "summary",
  "meeting_point",
  "duration_minutes",
  "price_vnd_minor",
  "inclusions",
  "exclusions",
  "cancellation_policy",
  "source_url",
  "verified_at",
  "attribution",
  "license",
  "stops",
].join(",");

const CUSTOMER_BOOKING_COLUMNS = [
  "id",
  "status",
  "source_kind",
  "source_id",
  "tour_version_id",
  "quote_id",
  "title_en",
  "title_vi",
  "cancellation_policy",
  "catalog_snapshot_id",
  "travel_snapshot_id",
  "fx_snapshot_id",
  "fx_vnd_per_usd",
  "per_person_vnd_minor",
  "total_vnd_minor",
  "checkout_currency",
  "checkout_amount_minor",
  "party_size",
  "language",
  "meeting_point",
  "hold_expires_at",
  "created_at",
].join(",");

const HOLD_RESULT_FIELDS = ["booking_id", "hold_expires_at", "state"] as const;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(code: FixedTourRuntimeErrorCode): never {
  throw new FixedTourRuntimeError(code);
}

function errorCode(error: unknown): string {
  return isRecord(error) && typeof error.code === "string" ? error.code : "";
}

function errorMessage(error: unknown): string {
  return isRecord(error) && typeof error.message === "string" ? error.message.toLowerCase() : "";
}

function mapServiceError(error: unknown): FixedTourRuntimeError {
  const code = errorCode(error);
  const message = errorMessage(error);

  if (code === "22023") return new FixedTourRuntimeError("INVALID_INPUT");
  if (code === "42501") return new FixedTourRuntimeError("FORBIDDEN");
  if (code === "PGRST301" || code === "PGRST302") {
    return new FixedTourRuntimeError("UNAUTHENTICATED");
  }
  if (code === "P0001") {
    if (message.includes("idempotency_conflict")) {
      return new FixedTourRuntimeError("IDEMPOTENCY_CONFLICT");
    }
    if (message.includes("departure sold out")) {
      return new FixedTourRuntimeError("SOLD_OUT");
    }
    if (
      message.includes("departure unavailable") ||
      message.includes("tour unavailable") ||
      message.includes("tour translation unavailable") ||
      message.includes("travel snapshot unavailable")
    ) {
      return new FixedTourRuntimeError("NOT_FOUND");
    }
  }

  return new FixedTourRuntimeError("SERVICE_UNAVAILABLE");
}

function rows(value: unknown): unknown[] {
  if (!Array.isArray(value)) fail("INVALID_RESPONSE");
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) fail("INVALID_RESPONSE");
  }
  if (Object.keys(value).some((key) => !/^(?:0|[1-9]\d*)$/.test(key))) {
    fail("INVALID_RESPONSE");
  }
  return value;
}

function mappedRows<T>(
  value: unknown,
  mapper: (row: unknown) => Result<T, DataAdapterError>,
): T[] {
  const result: T[] = [];
  for (const row of rows(value)) {
    const mapped = mapper(row);
    if (!mapped.ok) fail("INVALID_RESPONSE");
    result.push(mapped.value);
  }
  return result;
}

function exactHoldRow(value: unknown): UnknownRecord {
  if (!isRecord(value)) fail("INVALID_RESPONSE");
  const keys = Object.keys(value);
  if (
    keys.length !== HOLD_RESULT_FIELDS.length ||
    HOLD_RESULT_FIELDS.some((field) => !Object.prototype.hasOwnProperty.call(value, field)) ||
    keys.some((field) => !(HOLD_RESULT_FIELDS as readonly string[]).includes(field))
  ) {
    fail("INVALID_RESPONSE");
  }
  return value;
}

async function requireSession(client: FixedTourSupabaseClient): Promise<void> {
  let response: Awaited<ReturnType<FixedTourSupabaseClient["auth"]["getSession"]>>;
  try {
    response = await client.auth.getSession();
  } catch {
    fail("SERVICE_UNAVAILABLE");
  }
  if (response.error !== null || response.data.session === null) fail("UNAUTHENTICATED");
}

async function responseData<T>(operation: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  try {
    const response = await operation;
    if (response.error !== null) throw mapServiceError(response.error);
    return response.data;
  } catch (error) {
    if (error instanceof FixedTourRuntimeError) throw error;
    throw mapServiceError(error);
  }
}

export function createSupabaseFixedTourRuntimeAdapter(
  client: FixedTourSupabaseClient,
): FixedTourRuntimePort {
  return {
    async listPublishedTours(locale: Locale): Promise<PublishedTour[]> {
      if (locale !== "en" && locale !== "vi") fail("INVALID_INPUT");
      const data = await responseData(
        client
          .from("published_tours_v")
          .select(PUBLISHED_TOUR_COLUMNS)
          .eq("locale", locale)
          .order("slug", { ascending: true })
          .order("tour_version_id", { ascending: true }),
      );
      return mappedRows(data, mapPublishedTour);
    },

    async listAvailability(): Promise<LiveDepartureAvailability[]> {
      const data = await responseData(client.rpc("get_live_departure_availability"));
      return mappedRows(data, mapLiveDepartureAvailability);
    },

    async beginBooking(input) {
      const parsed = parseFixedTourBeginBookingInput(input);
      if (!parsed.ok) fail("INVALID_INPUT");
      await requireSession(client);
      const data = await responseData(client.rpc("begin_fixed_tour_booking", {
        departure_id: parsed.value.departureId,
        party_size: parsed.value.partySize,
        booking_locale: parsed.value.locale,
        idempotency_key: parsed.value.idempotencyKey,
      }));
      const resultRows = rows(data);
      if (resultRows.length !== 1) fail("INVALID_RESPONSE");
      const row = exactHoldRow(resultRows[0]);
      const result = parseFixedTourBeginBookingResult({
        bookingId: row.booking_id,
        holdExpiresAt: row.hold_expires_at,
        state: row.state,
      });
      if (!result.ok) fail("INVALID_RESPONSE");
      return result.value;
    },

    async listOwnBookings(): Promise<CustomerBooking[]> {
      await requireSession(client);
      const data = await responseData(
        client
          .from("customer_bookings_v")
          .select(CUSTOMER_BOOKING_COLUMNS)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false }),
      );
      return mappedRows(data, mapCustomerBooking);
    },
  };
}
