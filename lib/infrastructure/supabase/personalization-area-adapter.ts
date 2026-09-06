import type { SupabaseClient } from "@supabase/supabase-js";

import {
  normalizeCatalogAreaOptions,
  type PersonalizationAreaPort,
} from "@/lib/application/planner/personalization-areas";
import { isLocale, type Locale } from "@/lib/i18n/config";
import type { Database } from "@/lib/infrastructure/supabase/database.types";

type PersonalizationAreaSupabaseClient = Pick<SupabaseClient<Database>, "from">;
type UnknownRecord = Record<string, unknown>;

export type PersonalizationAreaErrorCode = "INVALID_REQUEST" | "INVALID_RESPONSE" | "SERVICE_UNAVAILABLE";

const ERROR_MESSAGES: Readonly<Record<PersonalizationAreaErrorCode, string>> = {
  INVALID_REQUEST: "The personalization area request is invalid.",
  INVALID_RESPONSE: "The personalization area service returned an invalid response.",
  SERVICE_UNAVAILABLE: "The personalization area service is unavailable.",
};

/** Stable browser-safe failure with no catalog, database, or provider detail. */
export class PersonalizationAreaError extends Error {
  readonly code: PersonalizationAreaErrorCode;

  constructor(code: PersonalizationAreaErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "PersonalizationAreaError";
    this.code = code;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDenseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === value.length && keys.every((key, index) => key === String(index));
}

function exactRecord(value: unknown, fields: readonly string[]): UnknownRecord | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  return keys.length === fields.length && keys.every((key) => fields.includes(key)) ? value : null;
}

function uuid(value: unknown): string | null {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}

async function readRows(
  operation: PromiseLike<{ data: unknown; error: unknown }>,
): Promise<unknown[] | null> {
  try {
    const response = await operation;
    return response.error === null && isDenseArray(response.data) ? response.data : null;
  } catch {
    return null;
  }
}

function fail(code: PersonalizationAreaErrorCode): never {
  throw new PersonalizationAreaError(code);
}

/** Read public, published catalog areas without requiring a customer session. */
export function createSupabasePersonalizationAreaAdapter(
  client: PersonalizationAreaSupabaseClient,
): PersonalizationAreaPort {
  return {
    async listAreas(locale: Locale) {
      if (!isLocale(locale)) fail("INVALID_REQUEST");

      const currentRows = await readRows(
        client.from("current_itinerary_snapshot_v").select("catalog_snapshot_id"),
      );
      if (currentRows === null || currentRows.length !== 1) fail("SERVICE_UNAVAILABLE");
      const current = exactRecord(currentRows[0], ["catalog_snapshot_id"]);
      const snapshotId = uuid(current?.catalog_snapshot_id);
      if (snapshotId === null) fail("INVALID_RESPONSE");

      const areaRows = await readRows(
        client.from("catalog_snapshot_areas_v")
          .select("snapshot_id,area_id,slug")
          .eq("snapshot_id", snapshotId),
      );
      if (areaRows === null || areaRows.length < 1) fail("SERVICE_UNAVAILABLE");

      const options = normalizeCatalogAreaOptions({
        snapshotId,
        areas: areaRows,
        locale,
      });
      if (options === null) fail("INVALID_RESPONSE");
      return options;
    },
  };
}
