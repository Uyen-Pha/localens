import type { ExperienceType, ItineraryRequest } from "@/lib/domain/itinerary/contracts";
import type { RefinementSignals } from "@/lib/application/planner/refinement-signals";
import { PERSONALIZATION_AREA_SLUG_PATTERN } from "@/lib/application/planner/personalization-areas";

/** The persisted plan pointer is metadata only; the database remains authoritative. */
export interface RuntimePlanPointer {
  readonly version: 1;
  readonly ownerUserId: string;
  readonly planId: string;
  readonly savedAt: number;
}

export const RUNTIME_PLAN_POINTER_KEY = "localens.runtime.plan-pointer.v1";
export const RUNTIME_PLAN_POINTER_TTL_MS = 24 * 60 * 60 * 1000;

/** Pending mutations follow the current browser handoff lifetime, not localStorage. */
export const RUNTIME_PENDING_OPERATION_KEY = "localens.runtime.pending-operation.v1";
export const RUNTIME_PENDING_OPERATION_TTL_MS = 30 * 60 * 1000;

/** Permit a small clock skew, but never trust an implausibly future-dated record. */
export const RUNTIME_SESSION_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

type RuntimePendingSignals = RefinementSignals;

export type RuntimePendingOperation =
  | Readonly<{
    version: 1;
    ownerUserId: string;
    operationId: string;
    savedAt: number;
    kind: "recommend";
    request: ItineraryRequest;
  }>
  | Readonly<{
    version: 1;
    ownerUserId: string;
    operationId: string;
    savedAt: number;
    kind: "refine";
    planId: string;
    baseRevision: number;
    scope: "partial" | "full";
    lockedItemIds: readonly string[];
    signals: RuntimePendingSignals;
  }>;

type StorageReader = Pick<Storage, "getItem" | "removeItem">;
type StorageWriter = Pick<Storage, "setItem" | "removeItem">;
type UnknownRecord = Record<string, unknown>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/;
const MAX_REVISION = 2_147_483_647;
const LOCALENS_AREA_IDS = new Set([
  "demo-hcmc-district-1",
  "demo-hcmc-district-3",
  "demo-hcmc-district-5",
  "demo-hcmc-thu-duc",
]);
const REFINEMENT_PREFERRED_EXPERIENCE_TYPES = [
  "history",
  "traditional_craft",
  "traditional_market",
] as const satisfies readonly ExperienceType[];
const REQUEST_FIELDS = [
  "startAt",
  "durationMinutes",
  "areas",
  "budget",
  "partySize",
  "guideLanguage",
  "priorityWeights",
  "pace",
  "dietaryRequirements",
  "mobilityRequirements",
  "lockedStopIds",
] as const;
const POINTER_FIELDS = ["version", "ownerUserId", "planId", "savedAt"] as const;
const RECOMMEND_OPERATION_FIELDS = ["version", "ownerUserId", "operationId", "savedAt", "kind", "request"] as const;
const REFINE_OPERATION_FIELDS = [
  "version",
  "ownerUserId",
  "operationId",
  "savedAt",
  "kind",
  "planId",
  "baseRevision",
  "scope",
  "lockedItemIds",
  "signals",
] as const;
const BUDGET_FIELDS = ["currency", "amountMinor"] as const;
const PRIORITY_FIELDS = ["street_food", "history", "traditional_craft", "traditional_market"] as const;
const SIGNAL_FIELDS = ["pace", "food", "preferTypes", "avoidTypes"] as const;
const DIETARY_REQUIREMENT_IDS = new Set(["halal", "vegetarian"]);
const MOBILITY_REQUIREMENT_IDS = new Set(["step-free"]);
const OFFSET_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/;

function readDataSnapshot(value: unknown): UnknownRecord | null {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;

    const keys = Reflect.ownKeys(value);
    const snapshot = Object.create(null) as UnknownRecord;
    for (const key of keys) {
      if (typeof key !== "string") return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) return null;
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function hasExactSnapshotFields(value: UnknownRecord, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length) return false;
  const expectedKeys = new Set(expected);
  return keys.every((key) => typeof key === "string" && expectedKeys.has(key));
}

function readExactDataFields(value: unknown, expected: readonly string[]): UnknownRecord | null {
  const snapshot = readDataSnapshot(value);
  return snapshot !== null && hasExactSnapshotFields(snapshot, expected) ? snapshot : null;
}

function readDensePlainArray(value: unknown, maximum: number): unknown[] | null {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
    const iterator = Reflect.get(value, Symbol.iterator);
    if (iterator !== Array.prototype[Symbol.iterator]) return null;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (
      lengthDescriptor === undefined
      || !("value" in lengthDescriptor)
      || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0
      || lengthDescriptor.value > maximum
    ) return null;
    const length = lengthDescriptor.value;
    const keys = Reflect.ownKeys(value);
    const expectedKeys = new Set<string>([
      "length",
      ...Array.from({ length }, (_, index) => String(index)),
    ]);
    if (
      keys.length !== expectedKeys.size
      || keys.some((key) => typeof key !== "string" || !expectedKeys.has(key))
    ) return null;

    const items: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) return null;
      items.push(descriptor.value);
    }
    return items;
  } catch {
    return null;
  }
}

function isSafeTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function canonicalUuid(value: unknown): string | null {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}

function boundedIdentifier(value: unknown): string | null {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > 160
    || value !== value.trim()
    || CONTROL_CHARACTER_PATTERN.test(value)
  ) return null;
  return UUID_PATTERN.test(value) ? value.toLowerCase() : value;
}

function normalizedIdentifierSet(
  value: unknown,
  maximum: number,
  allowed?: ReadonlySet<string>,
): string[] | null {
  const items = readDensePlainArray(value, maximum);
  if (items === null) return null;
  const normalized: string[] = [];
  for (const item of items) {
    const identifier = boundedIdentifier(item);
    if (identifier === null || (allowed !== undefined && !allowed.has(identifier))) return null;
    if (normalized.includes(identifier)) return null;
    normalized.push(identifier);
  }
  return normalized;
}

function normalizedAreaIdentifierSet(value: unknown): string[] | null {
  const normalized = normalizedIdentifierSet(value, 12);
  if (normalized === null) return null;
  return normalized.every((identifier) =>
    LOCALENS_AREA_IDS.has(identifier) || PERSONALIZATION_AREA_SLUG_PATTERN.test(identifier),
  )
    ? normalized
    : null;
}

function normalizedUuidArray(value: unknown, maximum: number): string[] | null {
  const items = readDensePlainArray(value, maximum);
  if (items === null) return null;
  const normalized: string[] = [];
  for (const item of items) {
    const identifier = canonicalUuid(item);
    if (identifier === null || normalized.includes(identifier)) return null;
    normalized.push(identifier);
  }
  return normalized;
}

function isEnum<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isValidOffsetTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = OFFSET_TIMESTAMP_PATTERN.exec(value);
  if (match === null) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (
    month < 1
    || month > 12
    || day < 1
    || day > daysInMonth(year, month)
    || hour > 23
    || minute > 59
    || second > 59
  ) return false;

  if (match[8] !== "Z" && (Number(match[10]) > 23 || Number(match[11]) > 59)) return false;
  return Number.isFinite(Date.parse(value));
}

function normalizePriorityWeights(value: unknown): ItineraryRequest["priorityWeights"] | null {
  const snapshot = readExactDataFields(value, PRIORITY_FIELDS);
  if (snapshot === null) return null;
  const weights = PRIORITY_FIELDS.map((key) => snapshot[key]);
  if (
    !weights.every((weight) => typeof weight === "number" && Number.isSafeInteger(weight) && weight >= 0 && weight <= 5)
    || !weights.some((weight) => weight !== 0)
  ) return null;

  return {
    street_food: weights[0] as 0 | 1 | 2 | 3 | 4 | 5,
    history: weights[1] as 0 | 1 | 2 | 3 | 4 | 5,
    traditional_craft: weights[2] as 0 | 1 | 2 | 3 | 4 | 5,
    traditional_market: weights[3] as 0 | 1 | 2 | 3 | 4 | 5,
  };
}

function normalizeItineraryRequest(value: unknown): ItineraryRequest | null {
  const snapshot = readExactDataFields(value, REQUEST_FIELDS);
  if (snapshot === null) return null;

  const budget = readExactDataFields(snapshot.budget, BUDGET_FIELDS);
  if (budget === null) return null;
  const currency = budget.currency;
  const amountMinor = budget.amountMinor;
  if (!isEnum(currency, ["VND", "USD"] as const) || typeof amountMinor !== "number" || !Number.isSafeInteger(amountMinor) || amountMinor < 0) return null;

  const areas = normalizedAreaIdentifierSet(snapshot.areas);
  const dietaryRequirements = normalizedIdentifierSet(
    snapshot.dietaryRequirements,
    12,
    DIETARY_REQUIREMENT_IDS,
  );
  const mobilityRequirements = normalizedIdentifierSet(
    snapshot.mobilityRequirements,
    12,
    MOBILITY_REQUIREMENT_IDS,
  );
  const lockedStopIds = normalizedUuidArray(snapshot.lockedStopIds, 8);
  const durationMinutes = snapshot.durationMinutes;
  const partySize = snapshot.partySize;
  const guideLanguage = snapshot.guideLanguage;
  const pace = snapshot.pace;
  const startAt = snapshot.startAt;
  const priorityWeights = normalizePriorityWeights(snapshot.priorityWeights);

  if (
    !isValidOffsetTimestamp(startAt)
    || areas === null
    || areas.length < 1
    || dietaryRequirements === null
    || mobilityRequirements === null
    || lockedStopIds === null
    || typeof durationMinutes !== "number"
    || !Number.isSafeInteger(durationMinutes)
    || durationMinutes < 60
    || durationMinutes > 720
    || typeof partySize !== "number"
    || !Number.isSafeInteger(partySize)
    || partySize < 1
    || partySize > 20
    || !isEnum(guideLanguage, ["en", "vi"] as const)
    || priorityWeights === null
    || !isEnum(pace, ["relaxed", "balanced", "active"] as const)
  ) return null;

  return {
    startAt,
    durationMinutes,
    areas,
    budget: { currency, amountMinor },
    partySize,
    guideLanguage,
    priorityWeights,
    pace,
    dietaryRequirements,
    mobilityRequirements,
    lockedStopIds,
  };
}

function normalizePointer(value: unknown): RuntimePlanPointer | null {
  const snapshot = readExactDataFields(value, POINTER_FIELDS);
  if (snapshot === null) return null;
  const ownerUserId = canonicalUuid(snapshot.ownerUserId);
  const planId = canonicalUuid(snapshot.planId);
  const savedAt = snapshot.savedAt;
  if (snapshot.version !== 1 || ownerUserId === null || planId === null || !isSafeTimestamp(savedAt)) return null;
  return { version: 1, ownerUserId, planId, savedAt };
}

function normalizeSignals(value: unknown): RuntimePendingSignals | null {
  const snapshot = readExactDataFields(value, SIGNAL_FIELDS);
  if (snapshot === null) return null;
  const preferTypesValue = snapshot.preferTypes;
  const avoidTypes = snapshot.avoidTypes;
  const pace = snapshot.pace;
  const food = snapshot.food;
  const normalizedPreferTypes = readDensePlainArray(preferTypesValue, 1);
  const normalizedAvoidTypes = readDensePlainArray(avoidTypes, 0);
  if (normalizedPreferTypes === null || normalizedAvoidTypes === null) return null;
  if (!isEnum(pace, ["keep", "slower", "faster"] as const)) return null;
  if (!isEnum(food, ["keep", "more", "remove"] as const)) return null;

  const preferTypes: Array<(typeof REFINEMENT_PREFERRED_EXPERIENCE_TYPES)[number]> = [];
  for (const item of normalizedPreferTypes) {
    if (!isEnum(item, REFINEMENT_PREFERRED_EXPERIENCE_TYPES) || preferTypes.includes(item)) return null;
    preferTypes.push(item);
  }
  return {
    pace,
    food,
    preferTypes,
    avoidTypes: [],
  };
}

function normalizePendingOperation(value: unknown): RuntimePendingOperation | null {
  const snapshot = readDataSnapshot(value);
  if (snapshot === null) return null;
  const kind = snapshot.kind;
  const fields = kind === "recommend" ? RECOMMEND_OPERATION_FIELDS : kind === "refine" ? REFINE_OPERATION_FIELDS : null;
  if (fields === null || !hasExactSnapshotFields(snapshot, fields)) return null;

  const ownerUserId = canonicalUuid(snapshot.ownerUserId);
  const operationId = canonicalUuid(snapshot.operationId);
  const savedAt = snapshot.savedAt;
  if (snapshot.version !== 1 || ownerUserId === null || operationId === null || !isSafeTimestamp(savedAt)) return null;

  if (kind === "recommend") {
    const request = normalizeItineraryRequest(snapshot.request);
    return request === null ? null : { version: 1, ownerUserId, operationId, savedAt, kind, request };
  }
  if (kind !== "refine") return null;

  const planId = canonicalUuid(snapshot.planId);
  const baseRevision = snapshot.baseRevision;
  const signals = normalizeSignals(snapshot.signals);
  const lockedItemIds = normalizedUuidArray(snapshot.lockedItemIds, 8);
  const scope = snapshot.scope;
  if (
    planId === null
    || typeof baseRevision !== "number"
    || !Number.isSafeInteger(baseRevision)
    || baseRevision < 1
    || baseRevision > MAX_REVISION
    || !isEnum(scope, ["partial", "full"] as const)
    || lockedItemIds === null
    || signals === null
  ) return null;

  return {
    version: 1,
    ownerUserId,
    operationId,
    savedAt,
    kind,
    planId,
    baseRevision,
    scope,
    lockedItemIds,
    signals,
  };
}

function parseJson<T>(raw: string, normalize: (value: unknown) => T | null): T | null {
  try {
    return normalize(JSON.parse(raw));
  } catch {
    return null;
  }
}

function removeExact(storage: Pick<Storage, "removeItem">, key: string): boolean {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function isCurrent(savedAt: number, now: number, ttl: number): boolean {
  if (!isSafeTimestamp(now)) return false;
  if (savedAt > now && savedAt - now > RUNTIME_SESSION_MAX_FUTURE_SKEW_MS) return false;
  return now < savedAt || now - savedAt < ttl;
}

function getStored(storage: Pick<Storage, "getItem">, key: string): { ok: true; raw: string | null } | { ok: false } {
  try {
    const raw = storage.getItem(key);
    return { ok: true, raw };
  } catch {
    return { ok: false };
  }
}

export function saveRuntimePlanPointer(storage: StorageWriter, pointer: RuntimePlanPointer): boolean {
  const normalized = normalizePointer(pointer);
  if (normalized === null) return false;
  try {
    storage.setItem(RUNTIME_PLAN_POINTER_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function readRuntimePlanPointer(
  storage: StorageReader,
  ownerUserId: string,
  now: number,
): RuntimePlanPointer | null {
  const expectedOwner = canonicalUuid(ownerUserId);
  if (expectedOwner === null || !isSafeTimestamp(now)) return null;

  const result = getStored(storage, RUNTIME_PLAN_POINTER_KEY);
  if (!result.ok || result.raw === null || typeof result.raw !== "string") return null;
  const pointer = parseJson(result.raw, normalizePointer);
  if (pointer === null || !isCurrent(pointer.savedAt, now, RUNTIME_PLAN_POINTER_TTL_MS) || pointer.ownerUserId !== expectedOwner) {
    removeExact(storage, RUNTIME_PLAN_POINTER_KEY);
    return null;
  }
  return pointer;
}

export function removeRuntimePlanPointer(storage: Pick<Storage, "removeItem">): boolean {
  return removeExact(storage, RUNTIME_PLAN_POINTER_KEY);
}

export function saveRuntimePendingOperation(storage: StorageWriter, operation: RuntimePendingOperation): boolean {
  const normalized = normalizePendingOperation(operation);
  if (normalized === null) return false;
  try {
    storage.setItem(RUNTIME_PENDING_OPERATION_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function readRuntimePendingOperation(
  storage: StorageReader,
  ownerUserId: string,
  now: number,
): RuntimePendingOperation | null {
  const expectedOwner = canonicalUuid(ownerUserId);
  if (expectedOwner === null || !isSafeTimestamp(now)) return null;

  const result = getStored(storage, RUNTIME_PENDING_OPERATION_KEY);
  if (!result.ok || result.raw === null || typeof result.raw !== "string") return null;
  const operation = parseJson(result.raw, normalizePendingOperation);
  if (
    operation === null
    || !isCurrent(operation.savedAt, now, RUNTIME_PENDING_OPERATION_TTL_MS)
    || operation.ownerUserId !== expectedOwner
  ) {
    removeExact(storage, RUNTIME_PENDING_OPERATION_KEY);
    return null;
  }
  return operation;
}

export function removeRuntimePendingOperation(storage: Pick<Storage, "removeItem">): boolean {
  return removeExact(storage, RUNTIME_PENDING_OPERATION_KEY);
}

export function invalidateRuntimePendingOperation(storage: StorageWriter): boolean {
  let overwritten = false;
  try {
    storage.setItem(RUNTIME_PENDING_OPERATION_KEY, JSON.stringify({ version: 1, status: "terminal" }));
    overwritten = true;
  } catch {
    // Removal below can still invalidate the record when overwriting is blocked.
  }
  return removeExact(storage, RUNTIME_PENDING_OPERATION_KEY) || overwritten;
}
