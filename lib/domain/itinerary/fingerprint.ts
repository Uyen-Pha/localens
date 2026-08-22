import type {
  EngineInput,
  ExperienceType,
  ItineraryResult,
} from "@/lib/domain/itinerary/contracts";

const EXPERIENCE_TYPES: readonly ExperienceType[] = [
  "street_food",
  "history",
  "traditional_craft",
  "traditional_market",
];

const REQUEST_KEYS = [
  "normalizedStartAt",
  "durationMinutes",
  "areas",
  "budget",
  "budgetVnd",
  "partySize",
  "guideLanguage",
  "priorityWeights",
  "pace",
  "dietaryRequirements",
  "mobilityRequirements",
  "lockedStopIds",
] as const;
const BUDGET_KEYS = ["currency", "amountMinor"] as const;
const SNAPSHOT_KEYS = ["catalog", "travel", "fx"] as const;
const ITEM_KEYS = [
  "placeId",
  "startAt",
  "endAt",
  "visitDurationMinutes",
  "travelMinutesBefore",
  "transitionBufferMinutesBefore",
  "travelCostVndBefore",
  "placeCostVnd",
  "score",
] as const;
const TOTAL_KEYS = [
  "durationMinutes",
  "visitMinutes",
  "travelMinutes",
  "transitionBufferMinutes",
  "groupCostVnd",
  "score",
] as const;
const TOP_LEVEL_KEYS = ["version", "request", "snapshotIds", "rankingSource", "items", "totals"] as const;
const MAX_DECIMAL_DIGITS = 256;
const ID_PATTERN = /^[^\u0000-\u001f\u007f]+$/;
const HCM_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):00\+07:00$/;

type ProjectionObject = { [key: string]: unknown };
type CanonicalObject = { [key: string]: CanonicalValue };
type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | CanonicalObject;

function fail(path: string, reason: string): never {
  throw new TypeError(`Invalid itinerary fingerprint material at ${path}: ${reason}`);
}

function isPlainObject(value: unknown): value is ProjectionObject {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function readProperty(value: unknown, key: string): unknown {
  if (!isPlainObject(value)) return undefined;
  return (value as Record<string, unknown>)[key];
}

function requireObject(value: unknown, path: string): ProjectionObject {
  if (!isPlainObject(value)) fail(path, "must be a plain object");
  return value;
}

function requireDenseArray(value: unknown, path: string, maximum?: number): readonly unknown[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
  if (maximum !== undefined && value.length > maximum) fail(path, "has an invalid length");
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      fail(path, "must be a dense array");
    }
  }
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") fail(path, "must be a string");
  return value;
}

function requireId(value: unknown, path: string): string {
  const normalized = requireString(value, path).trim();
  if (normalized.length === 0 || normalized.length > 160 || !ID_PATTERN.test(normalized)) {
    fail(path, "must be a non-empty identifier");
  }
  return normalized;
}

function requireEnum<T extends string>(value: unknown, path: string, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    fail(path, "has an invalid enum value");
  }
  return value as T;
}

function requireSafeNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    fail(path, "must be a finite safe number");
  }
  return value;
}

function requireSafeInteger(value: unknown, path: string, minimum: number, maximum?: number): number {
  const number = requireSafeNumber(value, path);
  if (!Number.isInteger(number) || number < minimum || (maximum !== undefined && number > maximum)) {
    fail(path, "must be a safe integer in range");
  }
  return number;
}

function compareLexicographically(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function assertKeys(value: ProjectionObject, expected: readonly string[], path: string): void {
  const actual = Object.keys(value).sort(compareLexicographically);
  const sortedExpected = [...expected].sort(compareLexicographically);
  if (actual.length !== sortedExpected.length || actual.some((key, index) => key !== sortedExpected[index])) {
    fail(path, "contains an unexpected or missing field");
  }
}

function requireCanonicalHcmTimestamp(value: unknown, path: string): string {
  const timestamp = requireString(value, path);
  const match = timestamp.match(HCM_TIMESTAMP_PATTERN);
  if (match === null) fail(path, "must be a canonical HCMC timestamp");
  const year = Number(timestamp.slice(0, 4));
  const month = Number(timestamp.slice(5, 7));
  const day = Number(timestamp.slice(8, 10));
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    fail(path, "must be a real calendar date");
  }
  return timestamp;
}

function decimalString(value: unknown, path: string): string {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) fail(path, "must be a non-negative safe integer");
    return String(value);
  }
  if (typeof value === "bigint") {
    if (value < BigInt(0)) fail(path, "must be non-negative");
    const normalized = value.toString(10);
    if (normalized.length > MAX_DECIMAL_DIGITS) fail(path, "has too many decimal digits");
    return normalized;
  }
  if (typeof value !== "string") fail(path, "must be a decimal integer");
  if (value.length === 0 || value.length > MAX_DECIMAL_DIGITS || !/^\d+$/.test(value)) {
    fail(path, "must be a non-negative decimal integer");
  }
  return BigInt(value).toString(10);
}

function requireStringArray(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
  sort: boolean,
): string[] {
  const array = requireDenseArray(value, path, maximum);
  if (array.length < minimum) fail(path, "has an invalid length");
  const normalized = array.map((item, index) => requireId(item, `${path}[${index}]`));
  if (new Set(normalized).size !== normalized.length) fail(path, "contains duplicate identifiers");
  return sort ? normalized.sort(compareLexicographically) : normalized;
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Invalid itinerary fingerprint material: number is not finite");
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new TypeError("Invalid itinerary fingerprint material: number is not serializable");
    return encoded;
  }
  if (typeof value === "undefined" || typeof value === "symbol" || typeof value === "function" || typeof value === "bigint") {
    throw new TypeError("Invalid itinerary fingerprint material: unsupported value");
  }
  if (Array.isArray(value)) {
    const dense = requireDenseArray(value, "canonical");
    return `[${dense.map(canonicalJson).join(",")}]`;
  }
  if (!isPlainObject(value)) throw new TypeError("Invalid itinerary fingerprint material: object must be plain");

  const keys = Object.keys(value).sort(compareLexicographically);
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function projectItem(item: unknown): ProjectionObject {
  return {
    placeId: readProperty(item, "placeId"),
    startAt: readProperty(item, "startAt"),
    endAt: readProperty(item, "endAt"),
    visitDurationMinutes: readProperty(item, "visitDurationMinutes"),
    travelMinutesBefore: readProperty(item, "travelMinutesBefore"),
    transitionBufferMinutesBefore: readProperty(item, "transitionBufferMinutesBefore"),
    travelCostVndBefore: readProperty(item, "travelCostVndBefore"),
    placeCostVnd: readProperty(item, "placeCostVnd"),
    score: readProperty(item, "score"),
  };
}

function projectItems(items: unknown): unknown {
  return Array.isArray(items)
    ? requireDenseArray(items, "items", 8).map(projectItem)
    : items;
}

function projectTotals(totals: unknown): ProjectionObject {
  return {
    durationMinutes: readProperty(totals, "durationMinutes"),
    visitMinutes: readProperty(totals, "visitMinutes"),
    travelMinutes: readProperty(totals, "travelMinutes"),
    transitionBufferMinutes: readProperty(totals, "transitionBufferMinutes"),
    groupCostVnd: readProperty(totals, "groupCostVnd"),
    score: readProperty(totals, "score"),
  };
}

function projectPriorityWeights(priorityWeights: unknown): ProjectionObject {
  return Object.fromEntries(
    EXPERIENCE_TYPES.map((experienceType) => [experienceType, readProperty(priorityWeights, experienceType)]),
  );
}

function projectItinerary(input: EngineInput, result: ItineraryResult): ProjectionObject {
  const request = readProperty(input, "request");
  const budget = readProperty(request, "budget");
  const priorityWeights = readProperty(request, "priorityWeights");
  const snapshotIds = readProperty(result, "snapshotIds");
  return {
    version: 1,
    request: {
      normalizedStartAt: readProperty(result, "normalizedStartAt"),
      durationMinutes: readProperty(request, "durationMinutes"),
      areas: readProperty(request, "areas"),
      budget: {
        currency: readProperty(budget, "currency"),
        amountMinor: readProperty(budget, "amountMinor"),
      },
      budgetVnd: readProperty(result, "budgetVnd"),
      partySize: readProperty(request, "partySize"),
      guideLanguage: readProperty(request, "guideLanguage"),
      priorityWeights: projectPriorityWeights(priorityWeights),
      pace: readProperty(request, "pace"),
      dietaryRequirements: readProperty(request, "dietaryRequirements"),
      mobilityRequirements: readProperty(request, "mobilityRequirements"),
      lockedStopIds: readProperty(request, "lockedStopIds"),
    },
    snapshotIds: {
      catalog: readProperty(snapshotIds, "catalog"),
      travel: readProperty(snapshotIds, "travel"),
      fx: readProperty(snapshotIds, "fx"),
    },
    rankingSource: readProperty(result, "rankingSource"),
    items: projectItems(readProperty(result, "items")),
    totals: projectTotals(readProperty(result, "totals")),
  };
}

function normalizeProjection(projection: ProjectionObject): CanonicalObject {
  assertKeys(projection, TOP_LEVEL_KEYS, "root");
  if (projection.version !== 1) fail("version", "must be version 1");

  const request = requireObject(projection.request, "request");
  assertKeys(request, REQUEST_KEYS, "request");
  const budget = requireObject(request.budget, "request.budget");
  assertKeys(budget, BUDGET_KEYS, "request.budget");
  const priority = requireObject(request.priorityWeights, "request.priorityWeights");
  assertKeys(priority, EXPERIENCE_TYPES, "request.priorityWeights");
  const priorityWeights: CanonicalObject = {};
  let hasPositivePriority = false;
  for (const experienceType of EXPERIENCE_TYPES) {
    const weight = requireSafeInteger(priority[experienceType], `request.priorityWeights.${experienceType}`, 0, 5);
    priorityWeights[experienceType] = weight;
    hasPositivePriority ||= weight > 0;
  }
  if (!hasPositivePriority) fail("request.priorityWeights", "must contain a positive weight");

  const currency = requireEnum(budget.currency, "request.budget.currency", ["VND", "USD"] as const);
  const normalizedRequest: CanonicalObject = {
    normalizedStartAt: requireCanonicalHcmTimestamp(request.normalizedStartAt, "request.normalizedStartAt"),
    durationMinutes: requireSafeInteger(request.durationMinutes, "request.durationMinutes", 60, 720),
    areas: requireStringArray(request.areas, "request.areas", 1, 12, true),
    budget: {
      currency,
      amountMinor: requireSafeInteger(budget.amountMinor, "request.budget.amountMinor", 0),
    },
    budgetVnd: decimalString(request.budgetVnd, "request.budgetVnd"),
    partySize: requireSafeInteger(request.partySize, "request.partySize", 1, 20),
    guideLanguage: requireEnum(request.guideLanguage, "request.guideLanguage", ["en", "vi"] as const),
    priorityWeights,
    pace: requireEnum(request.pace, "request.pace", ["relaxed", "balanced", "active"] as const),
    dietaryRequirements: requireStringArray(request.dietaryRequirements, "request.dietaryRequirements", 0, 12, true),
    mobilityRequirements: requireStringArray(request.mobilityRequirements, "request.mobilityRequirements", 0, 12, true),
    lockedStopIds: requireStringArray(request.lockedStopIds, "request.lockedStopIds", 0, 8, false),
  };

  const snapshotIds = requireObject(projection.snapshotIds, "snapshotIds");
  assertKeys(snapshotIds, SNAPSHOT_KEYS, "snapshotIds");
  const normalizedSnapshots: CanonicalObject = {
    catalog: requireId(snapshotIds.catalog, "snapshotIds.catalog"),
    travel: requireId(snapshotIds.travel, "snapshotIds.travel"),
    fx: snapshotIds.fx === null ? null : requireId(snapshotIds.fx, "snapshotIds.fx"),
  };

  const items = requireDenseArray(projection.items, "items", 8);
  const normalizedItems = items.map((item, index) => {
    const value = requireObject(item, `items[${index}]`);
    assertKeys(value, ITEM_KEYS, `items[${index}]`);
    const transitionBuffer = requireSafeInteger(
      value.transitionBufferMinutesBefore,
      `items[${index}].transitionBufferMinutesBefore`,
      0,
      10,
    );
    if (transitionBuffer !== 0 && transitionBuffer !== 10) {
      fail(`items[${index}].transitionBufferMinutesBefore`, "must be 0 or 10");
    }
    return {
      placeId: requireId(value.placeId, `items[${index}].placeId`),
      startAt: requireCanonicalHcmTimestamp(value.startAt, `items[${index}].startAt`),
      endAt: requireCanonicalHcmTimestamp(value.endAt, `items[${index}].endAt`),
      visitDurationMinutes: requireSafeInteger(value.visitDurationMinutes, `items[${index}].visitDurationMinutes`, 15, 480),
      travelMinutesBefore: requireSafeInteger(value.travelMinutesBefore, `items[${index}].travelMinutesBefore`, 0),
      transitionBufferMinutesBefore: transitionBuffer,
      travelCostVndBefore: decimalString(value.travelCostVndBefore, `items[${index}].travelCostVndBefore`),
      placeCostVnd: decimalString(value.placeCostVnd, `items[${index}].placeCostVnd`),
      score: requireSafeNumber(value.score, `items[${index}].score`),
    } satisfies CanonicalObject;
  });

  const totals = requireObject(projection.totals, "totals");
  assertKeys(totals, TOTAL_KEYS, "totals");
  const normalizedTotals: CanonicalObject = {
    durationMinutes: requireSafeInteger(totals.durationMinutes, "totals.durationMinutes", 0),
    visitMinutes: requireSafeInteger(totals.visitMinutes, "totals.visitMinutes", 0),
    travelMinutes: requireSafeInteger(totals.travelMinutes, "totals.travelMinutes", 0),
    transitionBufferMinutes: requireSafeInteger(totals.transitionBufferMinutes, "totals.transitionBufferMinutes", 0),
    groupCostVnd: decimalString(totals.groupCostVnd, "totals.groupCostVnd"),
    score: requireSafeNumber(totals.score, "totals.score"),
  };

  return {
    version: 1,
    request: normalizedRequest,
    snapshotIds: normalizedSnapshots,
    rankingSource: requireEnum(projection.rankingSource, "rankingSource", ["ai", "deterministic"] as const),
    items: normalizedItems,
    totals: normalizedTotals,
  };
}

export function canonicalizeItinerary(
  input: EngineInput,
  result: ItineraryResult,
): string {
  return canonicalJson(normalizeProjection(projectItinerary(input, result)));
}

export async function fingerprintItinerary(
  input: EngineInput,
  result: ItineraryResult,
  sha256: (bytes: Uint8Array) => Promise<Uint8Array>,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalizeItinerary(input, result));
  const digest = await sha256(bytes);
  if (!(digest instanceof Uint8Array) || digest.length !== 32) {
    throw new TypeError("SHA-256 digest must contain exactly 32 bytes");
  }
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
