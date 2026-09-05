/**
 * Pure operation-boundary helpers shared by the future authenticated planner
 * handlers.  This file deliberately has no Supabase, Node, or provider
 * dependency so it can be loaded before any side effecting operation begins.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UUID_CASE_INSENSITIVE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/;
const OPERATION_ID_MAX_REVISION = 2_147_483_647;

const RECOMMEND_KEYS = [
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
const BUDGET_KEYS = ["currency", "amountMinor"] as const;
const PRIORITY_KEYS = ["street_food", "history", "traditional_craft", "traditional_market"] as const;
const REFINE_KEYS = ["planId", "baseRevision", "scope", "lockedItemIds", "signals"] as const;
const SIGNAL_KEYS = ["pace", "food", "preferTypes", "avoidTypes"] as const;
export const OPERATION_REJECTED_CODES = [
  "QUOTA_EXCEEDED",
  "CATALOG_UNAVAILABLE",
  "TRAVEL_DATA_UNAVAILABLE",
  "FX_UNAVAILABLE",
  "STALE_REVISION",
  "INVALID_ITINERARY_INPUT",
  "USD_DISABLED",
  "NO_FEASIBLE_ITINERARY",
  "ITINERARY_SEARCH_LIMIT",
  "INVALID_ITINERARY_RESULT",
  "PLAN_NOT_FOUND",
  "PLAN_UNAVAILABLE",
  "SNAPSHOT_MISMATCH",
  "LOCKED_ITEM_INVALID",
] as const;

export type OperationRejectedCode = (typeof OPERATION_REJECTED_CODES)[number];
export type PlannerOperationKind = "recommend" | "refine";

export interface PlannerOperationInput {
  readonly kind: PlannerOperationKind;
  readonly payload: unknown;
}

export interface OperationDecisionClaimed {
  readonly state: "claimed";
  readonly leaseToken: string;
  readonly leaseExpiresAt: string;
  readonly planId: string;
  readonly plannerReservationId: string;
  readonly geminiReservationId: string;
}

export interface OperationDecisionInProgress {
  readonly state: "in_progress";
}

export interface OperationDecisionCompleted {
  readonly state: "completed";
  readonly planId: string;
  readonly revision: number;
}

export interface OperationDecisionRejected {
  readonly state: "rejected";
  readonly errorCode: OperationRejectedCode;
}

export interface OperationDecisionInterrupted {
  readonly state: "interrupted";
}

export interface OperationDecisionConflict {
  readonly state: "conflict";
}

export interface OperationDecisionMissing {
  readonly state: "missing";
}

export type OperationDecision =
  | OperationDecisionClaimed
  | OperationDecisionInProgress
  | OperationDecisionCompleted
  | OperationDecisionRejected
  | OperationDecisionInterrupted
  | OperationDecisionConflict
  | OperationDecisionMissing;

export interface PlannerRefinementSignals {
  readonly pace: "keep" | "slower" | "faster";
  readonly food: "keep" | "more" | "remove";
  readonly preferTypes: readonly ("history" | "traditional_craft" | "traditional_market")[];
  readonly avoidTypes: readonly [];
}

type JsonRecord = Record<string, unknown>;
type MutableCanonicalObject = { [key: string]: CanonicalValue };
type CanonicalObject = { readonly [key: string]: CanonicalValue };
type CanonicalValue = null | boolean | number | string | readonly CanonicalValue[] | CanonicalObject;

function fail(path: string, reason: string): never {
  throw new TypeError(`Invalid planner operation ${path}: ${reason}`);
}

function isPlainObject(value: unknown): value is JsonRecord {
  try {
    if (value === null || typeof value !== "object") return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function dataProperty(value: JsonRecord, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
}

function hasExactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  try {
    const keys = Reflect.ownKeys(value);
    if (keys.length !== expected.length) return false;
    const expectedKeys = new Set(expected);
    return keys.every((key) => {
      if (typeof key !== "string" || !expectedKeys.has(key)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
    });
  } catch {
    return false;
  }
}

function requireObject(value: unknown, path: string, expected: readonly string[]): JsonRecord {
  if (!isPlainObject(value) || !hasExactKeys(value, expected)) fail(path, "must be a plain object with the exact fields");
  return value;
}

function requireDenseArray(value: unknown, path: string, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum) fail(path, "must be a bounded dense array");
  try {
    const ownKeys = Reflect.ownKeys(value);
    const expectedKeys = new Set<string>(["length", ...Array.from({ length: value.length }, (_, index) => String(index))]);
    if (
      ownKeys.length !== expectedKeys.size ||
      ownKeys.some((key) => typeof key !== "string" || !expectedKeys.has(key))
    ) fail(path, "must not contain custom or symbol properties");
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) fail(path, "must be dense");
    }
  } catch {
    fail(path, "must be a readable array");
  }
  return value;
}

function requireString(value: unknown, path: string, maximum = 200): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    value !== value.trim() ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) fail(path, "must be a bounded trimmed string");
  return value;
}

function normalizeIdentifier(value: unknown, path: string): string {
  const identifier = requireString(value, path, 160);
  return UUID_CASE_INSENSITIVE_PATTERN.test(identifier) ? identifier.toLowerCase() : identifier;
}

function requireUuid(value: unknown, path: string): string {
  const uuid = requireString(value, path, 36);
  if (!UUID_CASE_INSENSITIVE_PATTERN.test(uuid)) fail(path, "must be a UUID");
  return uuid.toLowerCase();
}

function requireEnum<T extends string>(value: unknown, path: string, values: readonly T[]): T {
  if (typeof value !== "string") fail(path, "has an invalid enum value");
  for (const candidate of values) {
    if (candidate === value) return candidate;
  }
  fail(path, "has an invalid enum value");
}

function requireSafeInteger(value: unknown, path: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(path, "must be a finite safe integer in range");
  }
  return value;
}

function compareLexicographically(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function normalizeSetArray(value: unknown, path: string, minimum: number, maximum: number): string[] {
  const array = requireDenseArray(value, path, maximum);
  const normalized = array.map((item, index) => normalizeIdentifier(item, `${path}[${index}]`));
  const unique = [...new Set(normalized)].sort(compareLexicographically);
  if (unique.length < minimum) fail(path, "has too few unique values");
  return unique;
}

function normalizeUuidSetArray(value: unknown, path: string, minimum: number, maximum: number): string[] {
  const array = requireDenseArray(value, path, maximum);
  const normalized = array.map((item, index) => requireUuid(item, `${path}[${index}]`));
  const unique = [...new Set(normalized)].sort(compareLexicographically);
  if (unique.length < minimum) fail(path, "has too few unique values");
  return unique;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

const OFFSET_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):(\d{2}))$/;

function normalizeTimestamp(value: unknown, path: string): string {
  const timestamp = requireString(value, path, 40);
  const match = OFFSET_TIMESTAMP_PATTERN.exec(timestamp);
  if (match === null) fail(path, "must have an explicit valid offset");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fraction = match[7] ?? "";
  if (
    fraction.length > 3 ||
    month < 1 || month > 12 ||
    day < 1 || day > daysInMonth(year, month) ||
    hour > 23 || minute > 59 || second > 59
  ) fail(path, "must be a real instant with at most millisecond precision");

  const offsetSign = match[8] === "Z" ? 1 : match[9] === "+" ? 1 : -1;
  const offsetHours = match[8] === "Z" ? 0 : Number(match[10]);
  const offsetMinutes = match[8] === "Z" ? 0 : Number(match[11]);
  if (offsetHours > 23 || offsetMinutes > 59) fail(path, "has an invalid offset");

  const milliseconds = Number(fraction.padEnd(3, "0"));
  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, milliseconds);
  const epoch = local.getTime() - offsetSign * (offsetHours * 60 + offsetMinutes) * 60_000;
  if (!Number.isFinite(epoch)) fail(path, "is outside the supported timestamp range");

  const canonical = new Date(epoch).toISOString();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(canonical)) {
    fail(path, "cannot be represented as a four-digit UTC timestamp");
  }
  return canonical;
}

function normalizeRecommendPayload(value: unknown): CanonicalObject {
  const payload = requireObject(value, "payload", RECOMMEND_KEYS);
  const budget = requireObject(dataProperty(payload, "budget"), "payload.budget", BUDGET_KEYS);
  const priorityWeights = requireObject(dataProperty(payload, "priorityWeights"), "payload.priorityWeights", PRIORITY_KEYS);
  const normalizedPriorityWeights: MutableCanonicalObject = {};
  let hasPositiveWeight = false;
  for (const key of PRIORITY_KEYS) {
    const weight = requireSafeInteger(dataProperty(priorityWeights, key), `payload.priorityWeights.${key}`, 0, 5);
    normalizedPriorityWeights[key] = weight;
    hasPositiveWeight ||= weight > 0;
  }
  if (!hasPositiveWeight) fail("payload.priorityWeights", "must contain a positive weight");

  return {
    startAt: normalizeTimestamp(dataProperty(payload, "startAt"), "payload.startAt"),
    durationMinutes: requireSafeInteger(dataProperty(payload, "durationMinutes"), "payload.durationMinutes", 60, 720),
    areas: normalizeSetArray(dataProperty(payload, "areas"), "payload.areas", 1, 12),
    budget: {
      currency: requireEnum(dataProperty(budget, "currency"), "payload.budget.currency", ["VND", "USD"] as const),
      amountMinor: requireSafeInteger(dataProperty(budget, "amountMinor"), "payload.budget.amountMinor", 0, Number.MAX_SAFE_INTEGER),
    },
    partySize: requireSafeInteger(dataProperty(payload, "partySize"), "payload.partySize", 1, 20),
    guideLanguage: requireEnum(dataProperty(payload, "guideLanguage"), "payload.guideLanguage", ["en", "vi"] as const),
    priorityWeights: normalizedPriorityWeights,
    pace: requireEnum(dataProperty(payload, "pace"), "payload.pace", ["relaxed", "balanced", "active"] as const),
    dietaryRequirements: normalizeSetArray(dataProperty(payload, "dietaryRequirements"), "payload.dietaryRequirements", 0, 12),
    mobilityRequirements: normalizeSetArray(dataProperty(payload, "mobilityRequirements"), "payload.mobilityRequirements", 0, 12),
    lockedStopIds: normalizeSetArray(dataProperty(payload, "lockedStopIds"), "payload.lockedStopIds", 0, 8),
  };
}

function normalizeSignals(value: unknown): CanonicalObject {
  const signals = requireObject(value, "payload.signals", SIGNAL_KEYS);
  const preferTypes = requireDenseArray(dataProperty(signals, "preferTypes"), "payload.signals.preferTypes", 1);
  const normalizedPreferTypes = preferTypes.map((item, index) => requireEnum(
    item,
    `payload.signals.preferTypes[${index}]`,
    ["history", "traditional_craft", "traditional_market"] as const,
  ));
  const avoidTypes = requireDenseArray(dataProperty(signals, "avoidTypes"), "payload.signals.avoidTypes", 0);
  if (normalizedPreferTypes.length > 1 || avoidTypes.length !== 0) {
    fail("payload.signals", "must use the frozen zero-or-one preferred type contract");
  }
  return {
    pace: requireEnum(dataProperty(signals, "pace"), "payload.signals.pace", ["keep", "slower", "faster"] as const),
    food: requireEnum(dataProperty(signals, "food"), "payload.signals.food", ["keep", "more", "remove"] as const),
    preferTypes: normalizedPreferTypes,
    avoidTypes: [],
  };
}

function normalizeRefinePayload(value: unknown): CanonicalObject {
  const payload = requireObject(value, "payload", REFINE_KEYS);
  return {
    planId: requireUuid(dataProperty(payload, "planId"), "payload.planId"),
    baseRevision: requireSafeInteger(dataProperty(payload, "baseRevision"), "payload.baseRevision", 1, OPERATION_ID_MAX_REVISION),
    scope: requireEnum(dataProperty(payload, "scope"), "payload.scope", ["partial", "full"] as const),
    lockedItemIds: normalizeUuidSetArray(dataProperty(payload, "lockedItemIds"), "payload.lockedItemIds", 0, 8),
    signals: normalizeSignals(dataProperty(payload, "signals")),
  };
}

function canonicalJson(value: CanonicalValue): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Invalid planner operation number");
    const encoded = JSON.stringify(Object.is(value, -0) ? 0 : value);
    if (encoded === undefined) throw new TypeError("Invalid planner operation number");
    return encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (!isCanonicalObject(value)) throw new TypeError("Invalid planner operation object");
  const keys = Object.keys(value).sort(compareLexicographically);
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`).join(",")}}`;
}

function isCanonicalObject(value: CanonicalValue): value is CanonicalObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveOperationInput(first: unknown, second: unknown, argumentCount: number): PlannerOperationInput {
  if (argumentCount === 1) {
    const input = requireObject(first, "operation", ["kind", "payload"]);
    return {
      kind: requireEnum(dataProperty(input, "kind"), "operation.kind", ["recommend", "refine"] as const),
      payload: dataProperty(input, "payload"),
    };
  }
  if (argumentCount === 2) {
    return {
      kind: requireEnum(first, "operation.kind", ["recommend", "refine"] as const),
      payload: second,
    };
  }
  fail("operation", "requires a kind and payload");
}

export function parsePlannerOperationId(value: unknown): string | null {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}

export function canonicalizePlannerOperation(input: PlannerOperationInput): string;
export function canonicalizePlannerOperation(kind: PlannerOperationKind, payload: unknown): string;
export function canonicalizePlannerOperation(first: unknown, second?: unknown): string {
  const input = resolveOperationInput(first, second, arguments.length);
  const payload = input.kind === "recommend"
    ? normalizeRecommendPayload(input.payload)
    : normalizeRefinePayload(input.payload);
  return canonicalJson({ v: 1, kind: input.kind, payload });
}

export function canonicalizePlannerOperationPayload(kind: PlannerOperationKind, payload: unknown): string {
  return canonicalizePlannerOperation(kind, payload);
}

export async function computePlannerOperationDigest(input: PlannerOperationInput): Promise<string>;
export async function computePlannerOperationDigest(kind: PlannerOperationKind, payload: unknown): Promise<string>;
export async function computePlannerOperationDigest(first: unknown, second?: unknown): Promise<string> {
  const canonical = arguments.length === 1
    ? canonicalizePlannerOperation(first as PlannerOperationInput)
    : canonicalizePlannerOperation(first as PlannerOperationKind, second);
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) throw new Error("Web Crypto subtle.digest is unavailable");
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  const bytes = new Uint8Array(digest);
  if (bytes.length !== 32) throw new Error("SHA-256 digest must contain exactly 32 bytes");
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const digestPlannerOperation = computePlannerOperationDigest;

export function parseOperationRejectedCode(value: unknown): OperationRejectedCode | null {
  if (typeof value !== "string") return null;
  for (const code of OPERATION_REJECTED_CODES) {
    if (code === value) return code;
  }
  return null;
}

export function parseOperationDecision(value: unknown): OperationDecision | null {
  try {
    if (!isPlainObject(value) || !hasExactKeys(value, ["state"])) {
      if (!isPlainObject(value)) return null;
      const state = dataProperty(value, "state");
      if (state === "claimed") {
        if (!hasExactKeys(value, ["state", "leaseToken", "leaseExpiresAt", "planId", "plannerReservationId", "geminiReservationId"])) return null;
        const leaseToken = requireUuid(dataProperty(value, "leaseToken"), "decision.leaseToken");
        const leaseExpiresAt = normalizeTimestamp(dataProperty(value, "leaseExpiresAt"), "decision.leaseExpiresAt");
        const planId = requireUuid(dataProperty(value, "planId"), "decision.planId");
        const plannerReservationId = requireUuid(dataProperty(value, "plannerReservationId"), "decision.plannerReservationId");
        const geminiReservationId = requireUuid(dataProperty(value, "geminiReservationId"), "decision.geminiReservationId");
        if (plannerReservationId === geminiReservationId) return null;
        return { state, leaseToken, leaseExpiresAt, planId, plannerReservationId, geminiReservationId };
      }
      if (state === "completed") {
        if (!hasExactKeys(value, ["state", "planId", "revision"])) return null;
        return {
          state,
          planId: requireUuid(dataProperty(value, "planId"), "decision.planId"),
          revision: requireSafeInteger(dataProperty(value, "revision"), "decision.revision", 1, OPERATION_ID_MAX_REVISION),
        };
      }
      if (state === "rejected") {
        if (!hasExactKeys(value, ["state", "errorCode"])) return null;
        const errorCode = parseOperationRejectedCode(dataProperty(value, "errorCode"));
        return errorCode === null ? null : { state, errorCode };
      }
      return null;
    }

    const state = dataProperty(value, "state");
    if (state === "in_progress") return { state: "in_progress" };
    if (state === "interrupted") return { state: "interrupted" };
    if (state === "conflict") return { state: "conflict" };
    if (state === "missing") return { state: "missing" };
    return null;
  } catch {
    return null;
  }
}

export const parsePlannerOperationDecision = parseOperationDecision;
export const parsePlannerOperationRejectedCode = parseOperationRejectedCode;
