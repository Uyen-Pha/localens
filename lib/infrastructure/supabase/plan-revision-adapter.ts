import {
  EngineInputSchema,
  ItineraryResultSchema,
  type EngineInput,
  type ItineraryResult,
} from "@/lib/domain/itinerary/contracts";
import type {
  DataAdapterError,
  PlanRevisionInsert,
  PlanRevisionItem,
  Result,
} from "@/lib/domain/data/contracts";

// PostgreSQL accepts every canonical lowercase 8-4-4-4-12 UUID shape.  The
// persistence boundary must not impose RFC version/variant bits that the
// database does not enforce (deterministic fixtures intentionally use 0000).
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;
const UNSIGNED_DECIMAL_PATTERN = /^(?:0|[1-9]\d*)$/;
const FX_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

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

function zodError(value: unknown, path: string): Result<never, DataAdapterError> {
  const parsed = value;
  if (typeof parsed !== "object" || parsed === null) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
}

function parseStrict<T>(
  value: unknown,
  schema: { safeParse: (input: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; code: string; input?: unknown }> } } },
  path: string,
): Result<T, DataAdapterError> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issue = parsed.error.issues[0];
  const fieldPath = issue?.path.length
    ? `${path}.${issue.path.map((part) => String(part)).join(".")}`
    : path;
  if (issue?.code === "unrecognized_keys") return invalid("UNKNOWN_FIELD", "data.adapter.unknown_field", fieldPath);
  if (issue?.code === "invalid_type" && issue?.input === undefined && issue.path.length > 0) {
    return invalid("MISSING_FIELD", "data.adapter.missing_field", fieldPath);
  }
  return zodError(value, fieldPath);
}

function safeUuid(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string" || value !== value.toLowerCase() || !UUID_PATTERN.test(value)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value };
}

function safeUnsignedDecimal(value: unknown, path: string): Result<string, DataAdapterError> {
  let normalized: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
      return invalid("INVALID_DB_INTEGER", "data.integer.invalid", path);
    }
    if (!Number.isSafeInteger(value)) return invalid("UNSAFE_DB_INTEGER", "data.integer.unsafe", path);
    normalized = String(value);
  } else if (typeof value === "bigint") {
    if (value < BigInt(0)) return invalid("INVALID_DB_INTEGER", "data.integer.invalid", path);
    normalized = value.toString(10);
  } else if (typeof value === "string" && UNSIGNED_DECIMAL_PATTERN.test(value)) {
    try {
      normalized = BigInt(value).toString(10);
    } catch {
      return invalid("INVALID_DB_DECIMAL", "data.decimal.invalid", path);
    }
  } else {
    return invalid("INVALID_DB_DECIMAL", "data.decimal.invalid", path);
  }
  try {
    if (BigInt(normalized) > MAX_SAFE) return invalid("UNSAFE_DB_INTEGER", "data.integer.unsafe", path);
  } catch {
    return invalid("INVALID_DB_DECIMAL", "data.decimal.invalid", path);
  }
  return { ok: true, value: normalized };
}

function safeFxDecimal(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string" || !FX_PATTERN.test(value)) {
    return invalid("INVALID_DB_DECIMAL", "data.decimal.invalid", path);
  }
  const [integerPart, fractionPart = ""] = value.split(".");
  if (!/[1-9]/.test(`${integerPart}${fractionPart}`)) {
    return invalid("INVALID_DB_DECIMAL", "data.decimal.invalid", path);
  }
  return { ok: true, value: `${integerPart}.${fractionPart.padEnd(8, "0")}` };
}

function validateUuidList(values: readonly string[], path: string): Result<string[], DataAdapterError> {
  const result: string[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const parsed = safeUuid(values[index], `${path}[${index}]`);
    if (!parsed.ok) return parsed;
    if (result.includes(parsed.value)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
    result.push(parsed.value);
  }
  return { ok: true, value: result };
}

function validateSnapshotAndPlaces(input: EngineInput, result: ItineraryResult): Result<true, DataAdapterError> {
  const catalogId = safeUuid(input.catalog.id, "catalog.id");
  const travelId = safeUuid(input.travel.id, "travel.id");
  if (!catalogId.ok) return catalogId;
  if (!travelId.ok) return travelId;
  if (input.fx !== undefined) {
    if (input.request.budget.currency === "VND") {
      return invalid("SNAPSHOT_MISMATCH", "data.snapshot.mismatch", "input.fx");
    }
    const fxId = safeUuid(input.fx.id, "fx.id");
    if (!fxId.ok) return fxId;
  }
  const resultCatalogId = safeUuid(result.snapshotIds.catalog, "result.snapshotIds.catalog");
  const resultTravelId = safeUuid(result.snapshotIds.travel, "result.snapshotIds.travel");
  if (!resultCatalogId.ok) return resultCatalogId;
  if (!resultTravelId.ok) return resultTravelId;
  if (result.snapshotIds.fx !== null) {
    const resultFxId = safeUuid(result.snapshotIds.fx, "result.snapshotIds.fx");
    if (!resultFxId.ok) return resultFxId;
  }
  if (catalogId.value !== resultCatalogId.value || travelId.value !== resultTravelId.value) {
    return invalid("SNAPSHOT_MISMATCH", "data.snapshot.mismatch", "result.snapshotIds");
  }
  const expectedFxId = input.request.budget.currency === "USD" ? (input.fx?.id ?? null) : null;
  if (expectedFxId !== result.snapshotIds.fx) {
    return invalid("SNAPSHOT_MISMATCH", "data.snapshot.mismatch", "result.snapshotIds.fx");
  }
  for (let index = 0; index < input.catalog.places.length; index += 1) {
    const candidate = input.catalog.places[index];
    const placeId = safeUuid(candidate.id, `catalog.places[${index}].id`);
    const areaId = safeUuid(candidate.areaId, `catalog.places[${index}].areaId`);
    if (!placeId.ok) return placeId;
    if (!areaId.ok) return areaId;
  }
  for (let index = 0; index < input.travel.edges.length; index += 1) {
    const edge = input.travel.edges[index];
    const from = safeUuid(edge.fromPlaceId, `travel.edges[${index}].fromPlaceId`);
    const to = safeUuid(edge.toPlaceId, `travel.edges[${index}].toPlaceId`);
    if (!from.ok) return from;
    if (!to.ok) return to;
  }
  const catalogPlaceIds = new Set(input.catalog.places.map((candidate) => candidate.id));
  const resultPlaceIds = new Set<string>();
  for (let index = 0; index < result.items.length; index += 1) {
    const placeId = safeUuid(result.items[index]?.placeId, `result.items[${index}].placeId`);
    if (!placeId.ok) return placeId;
    if (!catalogPlaceIds.has(placeId.value) || resultPlaceIds.has(placeId.value)) {
      return invalid("SNAPSHOT_MISMATCH", "data.snapshot.mismatch", `result.items[${index}].placeId`);
    }
    resultPlaceIds.add(placeId.value);
  }
  return { ok: true, value: true };
}

function projectItem(item: ItineraryResult["items"][number], index: number): Result<PlanRevisionItem, DataAdapterError> {
  const placeId = safeUuid(item.placeId, `result.items[${index}].placeId`);
  const travelCost = safeUnsignedDecimal(item.travelCostVndBefore, `result.items[${index}].travelCostVndBefore`);
  const placeCost = safeUnsignedDecimal(item.placeCostVnd, `result.items[${index}].placeCostVnd`);
  if (!placeId.ok) return placeId;
  if (!travelCost.ok) return travelCost;
  if (!placeCost.ok) return placeCost;
  return {
    ok: true,
    value: {
      placeId: placeId.value,
      startAt: item.startAt,
      endAt: item.endAt,
      visitDurationMinutes: item.visitDurationMinutes,
      travelMinutesBefore: item.travelMinutesBefore,
      transitionBufferMinutesBefore: item.transitionBufferMinutesBefore,
      travelCostVndBefore: travelCost.value,
      placeCostVnd: placeCost.value,
      score: item.score,
    },
  };
}

/** Build the only DTO accepted by the immutable plan-revision RPC. */
export function toPlanRevisionInsert(
  input: EngineInput,
  result: ItineraryResult,
  fingerprint: string,
  revision: number,
): Result<PlanRevisionInsert, DataAdapterError> {
  const parsedInput = parseStrict(input, EngineInputSchema, "input");
  if (!parsedInput.ok) return parsedInput;
  const parsedResult = parseStrict(result, ItineraryResultSchema, "result");
  if (!parsedResult.ok) return parsedResult;
  if (!FINGERPRINT_PATTERN.test(fingerprint)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "fingerprint");
  }
  if (!Number.isSafeInteger(revision) || revision < 1) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "revision");
  }

  const source = parsedInput.value;
  const itinerary = parsedResult.value;
  const snapshots = validateSnapshotAndPlaces(source, itinerary);
  if (!snapshots.ok) return snapshots;
  const lockedPlaceIds = validateUuidList(source.request.lockedStopIds, "input.request.lockedStopIds");
  if (!lockedPlaceIds.ok) return lockedPlaceIds;
  const catalogPlaceIds = new Set(source.catalog.places.map((candidate) => candidate.id));
  if (lockedPlaceIds.value.some((placeId) => !catalogPlaceIds.has(placeId))) {
    return invalid("SNAPSHOT_MISMATCH", "data.snapshot.mismatch", "input.request.lockedStopIds");
  }
  if (source.request.budget.currency === "USD" && source.fx === undefined) {
    return invalid("SNAPSHOT_MISMATCH", "data.snapshot.mismatch", "input.fx");
  }
  const budgetVnd = safeUnsignedDecimal(itinerary.budgetVnd, "result.budgetVnd");
  const totalCostVnd = safeUnsignedDecimal(itinerary.totals.groupCostVnd, "result.totals.groupCostVnd");
  if (!budgetVnd.ok) return budgetVnd;
  if (!totalCostVnd.ok) return totalCostVnd;

  const items: PlanRevisionItem[] = [];
  for (let index = 0; index < itinerary.items.length; index += 1) {
    const item = projectItem(itinerary.items[index]!, index);
    if (!item.ok) return item;
    items.push(item.value);
  }

  let fxVndPerUsd: string | null = null;
  if (source.request.budget.currency === "USD") {
    if (source.fx === undefined) {
      return invalid("SNAPSHOT_MISMATCH", "data.snapshot.mismatch", "input.fx");
    }
    const fx = safeFxDecimal(source.fx.vndPerUsd, "input.fx.vndPerUsd");
    if (!fx.ok) return fx;
    fxVndPerUsd = fx.value;
  }

  return {
    ok: true,
    value: {
      revisionNo: revision,
      request: source.request,
      result: itinerary,
      fingerprint,
      rankingSource: itinerary.rankingSource,
      catalogSnapshotId: source.catalog.id,
      travelSnapshotId: source.travel.id,
      fxSnapshotId: source.request.budget.currency === "USD" ? source.fx?.id ?? null : null,
      fxVndPerUsd,
      currency: source.request.budget.currency,
      budgetVnd: budgetVnd.value,
      totalCostVnd: totalCostVnd.value,
      totalDurationMinutes: itinerary.totals.durationMinutes,
      lockedPlaceIds: lockedPlaceIds.value,
      items,
    },
  };
}
