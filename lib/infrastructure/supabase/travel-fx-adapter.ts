import {
  FxSnapshotSchema,
  TravelSnapshotSchema,
  isCanonicalUtc,
  type FxSnapshot,
  type Result,
  type TravelSnapshot,
} from "@/lib/domain/itinerary/contracts";
import type { DataAdapterError } from "@/lib/domain/data/contracts";

/** The explicit row returned by public.travel_snapshot_edges_v. */
export interface TravelSnapshotProjectionRow {
  snapshot_id: string;
  catalog_snapshot_id: string;
  from_place_id: string;
  to_place_id: string;
  mode: "walk" | "taxi" | "public_transport";
  minutes: number;
  group_cost_vnd: string;
  verified_at: string;
}

/** The explicit row returned by public.latest_fx_snapshot_v. */
export interface FxSnapshotProjectionRow {
  id: string;
  vnd_per_usd: string;
  source: string;
  observed_at: string;
  environment: "demo" | "production";
  is_demo: boolean;
}

const TRAVEL_FIELDS = [
  "snapshot_id",
  "catalog_snapshot_id",
  "from_place_id",
  "to_place_id",
  "mode",
  "minutes",
  "group_cost_vnd",
  "verified_at",
] as const;

const FX_FIELDS = [
  "id",
  "vnd_per_usd",
  "source",
  "observed_at",
  "environment",
  "is_demo",
] as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UNSIGNED_DECIMAL = /^(?:0|[1-9]\d*)$/;
// numeric(20,8): at most twelve integer digits and eight fractional digits.
const FX_DECIMAL = /^(?:0|[1-9]\d{0,11})\.\d{8}$/;
const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);
const MAX_TRAVEL_COST = BigInt(Math.floor(Number.MAX_SAFE_INTEGER / 8));

const invalid = (
  code: DataAdapterError["code"],
  messageKey: string,
  fieldPath?: string,
): Result<never, DataAdapterError> => ({
  ok: false,
  error: fieldPath ? { code, messageKey, fieldPath } : { code, messageKey },
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactFields(
  value: unknown,
  fields: readonly string[],
  path: string,
): Result<Record<string, unknown>, DataAdapterError> {
  if (!isRecord(value)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  const actual = Object.keys(value);
  const unknown = actual.find((key) => !fields.includes(key));
  if (unknown !== undefined) {
    return invalid("UNKNOWN_FIELD", "data.adapter.unknown_field", `${path}.${unknown}`);
  }
  const missing = fields.find((key) => !Object.prototype.hasOwnProperty.call(value, key) || value[key] === undefined);
  if (missing !== undefined) {
    return invalid("MISSING_FIELD", "data.adapter.missing_field", `${path}.${missing}`);
  }
  return { ok: true, value };
}

function denseArray(value: unknown, path: string): Result<unknown[], DataAdapterError> {
  if (!Array.isArray(value)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}[${index}]`);
    }
  }
  if (Object.keys(value).some((key) => !/^\d+$/.test(key))) {
    return invalid("UNKNOWN_FIELD", "data.adapter.unknown_field", path);
  }
  return { ok: true, value };
}

function safeUuid(value: unknown, path: string): Result<string, DataAdapterError> {
  if (
    typeof value !== "string" ||
    value.length !== 36 ||
    value !== value.toLowerCase() ||
    !UUID_PATTERN.test(value)
  ) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value };
}

function safeTravelCost(value: unknown, path: string): Result<number, DataAdapterError> {
  if (typeof value !== "string" || !UNSIGNED_DECIMAL.test(value)) {
    return invalid("INVALID_DB_DECIMAL", "data.decimal.invalid", path);
  }
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    return invalid("INVALID_DB_DECIMAL", "data.decimal.invalid", path);
  }
  if (parsed > MAX_SAFE_INTEGER) return invalid("UNSAFE_DB_INTEGER", "data.integer.unsafe", path);
  if (parsed > MAX_TRAVEL_COST) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  return { ok: true, value: Number(parsed) };
}

function safeMinutes(value: unknown, path: string): Result<number, DataAdapterError> {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 240) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value };
}

function safeFxDecimal(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string" || !FX_DECIMAL.test(value)) {
    return invalid("INVALID_DB_DECIMAL", "data.decimal.invalid", path);
  }
  // Check positivity without converting the exact decimal to a JS number.
  if (!/[1-9]/.test(value.replace(".", ""))) {
    return invalid("INVALID_DB_DECIMAL", "data.decimal.invalid", path);
  }
  return { ok: true, value };
}

function safeSource(value: unknown, path: string): Result<string, DataAdapterError> {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 240 ||
    value.trim() !== value ||
    /[\u0000-\u001F\u007F]/.test(value)
  ) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value };
}

function parseTravelRow(value: unknown, rowIndex: number): Result<TravelSnapshot["edges"][number] & { snapshotId: string; catalogSnapshotId: string }, DataAdapterError> {
  const path = `rows[${rowIndex}]`;
  const fields = exactFields(value, TRAVEL_FIELDS, path);
  if (!fields.ok) return fields;
  const snapshotId = safeUuid(fields.value.snapshot_id, `${path}.snapshot_id`);
  const catalogSnapshotId = safeUuid(fields.value.catalog_snapshot_id, `${path}.catalog_snapshot_id`);
  const fromPlaceId = safeUuid(fields.value.from_place_id, `${path}.from_place_id`);
  const toPlaceId = safeUuid(fields.value.to_place_id, `${path}.to_place_id`);
  const minutes = safeMinutes(fields.value.minutes, `${path}.minutes`);
  const groupCostVnd = safeTravelCost(fields.value.group_cost_vnd, `${path}.group_cost_vnd`);
  const verifiedAt =
    typeof fields.value.verified_at === "string" && isCanonicalUtc(fields.value.verified_at)
      ? ({ ok: true, value: fields.value.verified_at } as const)
      : invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", `${path}.verified_at`);
  if (!snapshotId.ok) return snapshotId;
  if (!catalogSnapshotId.ok) return catalogSnapshotId;
  if (!fromPlaceId.ok) return fromPlaceId;
  if (!toPlaceId.ok) return toPlaceId;
  if (!minutes.ok) return minutes;
  if (!groupCostVnd.ok) return groupCostVnd;
  if (!verifiedAt.ok) return verifiedAt;
  if (fromPlaceId.value === toPlaceId.value) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}.to_place_id`);
  }
  if (!isRecord(fields.value) || !["walk", "taxi", "public_transport"].includes(String(fields.value.mode))) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}.mode`);
  }
  return {
    ok: true,
    value: {
      snapshotId: snapshotId.value,
      catalogSnapshotId: catalogSnapshotId.value,
      fromPlaceId: fromPlaceId.value,
      toPlaceId: toPlaceId.value,
      mode: fields.value.mode as "walk" | "taxi" | "public_transport",
      minutes: minutes.value,
      groupCostVnd: groupCostVnd.value,
      verifiedAt: verifiedAt.value,
    },
  };
}

/** Map only the explicit published directed-edge projection into the engine DTO. */
export function mapTravelSnapshot(rows: unknown): Result<TravelSnapshot, DataAdapterError> {
  const array = denseArray(rows, "rows");
  if (!array.ok) return array;
  if (array.value.length === 0) return invalid("MISSING_FIELD", "data.adapter.missing_field", "rows[0]");

  const mapped: Array<TravelSnapshot["edges"][number] & { snapshotId: string; catalogSnapshotId: string }> = [];
  for (let index = 0; index < array.value.length; index += 1) {
    const result = parseTravelRow(array.value[index], index);
    if (!result.ok) return result;
    mapped.push(result.value);
  }

  const snapshotId = mapped[0]?.snapshotId;
  const catalogSnapshotId = mapped[0]?.catalogSnapshotId;
  const pairs = new Set<string>();
  for (const row of mapped) {
    const pair = `${row.fromPlaceId}\u0000${row.toPlaceId}`;
    if (
      row.snapshotId !== snapshotId ||
      row.catalogSnapshotId !== catalogSnapshotId ||
      pairs.has(pair)
    ) {
      return invalid("SNAPSHOT_MISMATCH", "data.snapshot.mismatch", "rows");
    }
    pairs.add(pair);
  }

  const candidate = {
    id: snapshotId ?? "",
    edges: mapped.map((row) => ({
      fromPlaceId: row.fromPlaceId,
      toPlaceId: row.toPlaceId,
      mode: row.mode,
      minutes: row.minutes,
      groupCostVnd: row.groupCostVnd,
      verifiedAt: row.verifiedAt,
    })),
  };
  const parsed = TravelSnapshotSchema.safeParse(candidate);
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path.join(".") || "rows";
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value: parsed.data };
}

/** Map the exact latest/history FX projection without converting its decimal. */
export function mapFxSnapshot(row: unknown): Result<FxSnapshot, DataAdapterError> {
  const fields = exactFields(row, FX_FIELDS, "row");
  if (!fields.ok) return fields;
  const id = safeUuid(fields.value.id, "row.id");
  const decimal = safeFxDecimal(fields.value.vnd_per_usd, "row.vnd_per_usd");
  const source = safeSource(fields.value.source, "row.source");
  const observedAt = fields.value.observed_at;
  if (!id.ok) return id;
  if (!decimal.ok) return decimal;
  if (!source.ok) return source;
  if (fields.value.environment !== "demo" && fields.value.environment !== "production") {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "row.environment");
  }
  if (typeof fields.value.is_demo !== "boolean" || fields.value.is_demo !== (fields.value.environment === "demo")) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "row.is_demo");
  }
  if (
    typeof observedAt !== "string" ||
    !isCanonicalUtc(observedAt) ||
    Date.parse(observedAt) > Date.now()
  ) {
    return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", "row.observed_at");
  }

  const candidate = {
    id: id.value,
    vndPerUsd: decimal.value,
    observedAtUtc: observedAt,
  };
  const parsed = FxSnapshotSchema.safeParse(candidate);
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path.join(".") || "row";
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value: parsed.data };
}
