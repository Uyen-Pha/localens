/**
 * Contract-only HTTP handler for personalized itinerary recommendations.
 *
 * This is intentionally not a Supabase function entrypoint. The adapter is
 * the only place allowed to bind guest capability, Turnstile, snapshots, and
 * database access. The handler delegates scheduling and all totals/time/hour
 * constraints to the existing authoritative domain engine, and returns an
 * persisted advisory proposal; it never creates a booking, quote, or payment.
 */

import { z } from "zod";

import {
  errorResponse,
  guardRequest,
  jsonResponse,
  readJsonBody,
  requireBearerToken,
  type GatewayPolicy,
} from "@/supabase/functions/_shared/gateway";
import {
  itineraryRequestSchema,
  itineraryResultSchema,
  parseEngineInput,
  type EngineInput,
  type ItineraryRequest,
  type ItineraryResult,
} from "@/lib/domain/itinerary/contracts";
import type { DomainErrorCode } from "@/lib/domain/itinerary/errors";
import {
  recommendItinerary,
  type Recommendation,
} from "@/lib/application/itinerary/recommend";
import {
  serializeItineraryWireResponse,
  type ItineraryWireResponse,
} from "@/supabase/functions/_shared/itinerary-wire-response";
import {
  computePlannerOperationDigest,
  parseOperationDecision,
  parseOperationRejectedCode,
  parsePlannerOperationId,
  type OperationDecision,
  type OperationRejectedCode,
} from "@/supabase/functions/_shared/planner-operation";
import type { Ranker } from "@/lib/application/itinerary/ranking-port";

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/;
const TOKEN_MAX_LENGTH = 4096;
const UUID_CASE_INSENSITIVE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidSchema = z.string().uuid().refine((value) => value === value.toLowerCase(), {
  message: "UUID must be lowercase",
});
const operationIdSchema = z.string().refine((value) => parsePlannerOperationId(value) !== null, {
  message: "operationId must be a lowercase UUID",
});

const capabilityTokenSchema = z
  .string()
  .trim()
  .min(1)
  .max(TOKEN_MAX_LENGTH)
  .refine((value) => !CONTROL_CHARACTER_PATTERN.test(value), {
    message: "token cannot contain control characters",
  });

/** Exact HTTP body for the public recommend-itinerary operation. */
export const recommendItineraryBodySchema = z
  .object({
    operationId: operationIdSchema,
    input: itineraryRequestSchema,
    turnstileToken: capabilityTokenSchema.optional(),
    guestToken: capabilityTokenSchema.optional(),
  })
  .strict();

export type RecommendItineraryBody = z.infer<typeof recommendItineraryBodySchema>;

export interface RecommendationAdapterContext {
  /** Internal request correlation for RPC/audit wiring; not caller-controlled. */
  correlationId: string;
  /** A server-verified principal, or null for an anonymous public request. */
  principal: VerifiedAccessPrincipal | null;
  /** An opaque guest capability; the adapter must hash/verify it server-side. */
  guestToken: string | null;
  /** An opaque Turnstile token; the adapter must verify action and hostname. */
  turnstileToken: string | null;
  /** Server-only operation scope; never copied to a provider or wire response. */
  operation?: PlannerOperationContext;
}

export const RECOMMENDATION_ADAPTER_ERROR_CODES = [
  "AUTH_REQUIRED",
  "AUTH_EXPIRED",
  "CHALLENGE_REQUIRED",
  "CHALLENGE_INVALID",
  "QUOTA_EXCEEDED",
  "CATALOG_UNAVAILABLE",
  "TRAVEL_DATA_UNAVAILABLE",
  "FX_UNAVAILABLE",
  "SERVICE_UNAVAILABLE",
] as const;

export type RecommendationAdapterErrorCode =
  (typeof RECOMMENDATION_ADAPTER_ERROR_CODES)[number];

export interface RecommendationAdapterFailure {
  code: RecommendationAdapterErrorCode;
}

export interface PlannerOperationContext {
  readonly operationId: string;
  readonly requestDigest: string;
  readonly kind: "recommend" | "refine";
  readonly leaseToken: string;
  readonly leaseExpiresAt: string;
  readonly planId: string;
  readonly baseRevision: number | null;
  readonly plannerReservationId: string;
  readonly geminiReservationId: string;
}

export interface PlannerOperationClaimInput {
  readonly operationId: string;
  readonly requestDigest: string;
  readonly kind: "recommend" | "refine";
  readonly targetPlanId: string | null;
  readonly baseRevision: number | null;
}

export type PlannerQuotaIdentityCheck =
  | { ok: true }
  | { ok: false; error: { code: "CHALLENGE_REQUIRED" | "CHALLENGE_INVALID" } };

export type PlannerQuotaReservation =
  | { ok: true }
  | { ok: false; kind: "rejected"; code: "QUOTA_EXCEEDED" }
  | { ok: false; kind: "unavailable" };

export type PlannerOperationExecutionFailure =
  | { kind: "quota"; code: "QUOTA_EXCEEDED" }
  | { kind: "ambiguous_provider" }
  | { kind: "ambiguous_commit" };

export type PersistedPlannerRevision =
  | {
      ok: true;
      planId: string;
      revision: number;
      rankingSource: "ai" | "deterministic";
      result: ItineraryResult;
    }
  | { ok: false; error: { code: "SERVICE_UNAVAILABLE" } };

export interface VerifiedAccessPrincipal {
  userId: string;
}

export type AccessTokenVerification =
  | { ok: true; principal: VerifiedAccessPrincipal }
  | { ok: false; error: RecommendationAdapterFailure };

export type RecommendationAdapterResolution =
  | { ok: true; input: unknown }
  | { ok: false; error: RecommendationAdapterFailure };

export type RecommendationCommit =
  | { ok: true; planId: string; revision: 1 }
  | { ok: false; error: RecommendationAdapterFailure }
  | { ok: false; decision: OperationDecision };

/**
 * Injectable server-side boundary. `input` is deliberately unknown at this
 * boundary: the handler parses and compares it before allowing the engine to
 * use any catalog/travel/FX snapshot or place ID.
 */
export interface RecommendItineraryAdapter {
  /** Parse-only Bearer output must be cryptographically verified here first. */
  verifyAccessToken: (
    parsedAccessToken: string,
    correlationId: string,
  ) => Promise<AccessTokenVerification>;
  resolveEngineInput: (
    input: ItineraryRequest,
    context: RecommendationAdapterContext,
  ) => Promise<RecommendationAdapterResolution>;
  validateQuotaIdentity?: (
    context: RecommendationAdapterContext,
  ) => Promise<PlannerQuotaIdentityCheck>;
  claimOperation: (
    input: PlannerOperationClaimInput,
    context: RecommendationAdapterContext,
  ) => Promise<unknown>;
  reservePlannerQuota: (
    reservationId: string,
    context: RecommendationAdapterContext,
  ) => Promise<PlannerQuotaReservation>;
  rejectOperation: (
    input: { operationId: string; requestDigest: string; leaseToken: string },
    errorCode: OperationRejectedCode,
    context: RecommendationAdapterContext,
  ) => Promise<unknown>;
  readCommittedRevision: (
    input: { planId: string; revision: number },
    context: RecommendationAdapterContext,
  ) => Promise<PersistedPlannerRevision>;
  readOperationFailure?: () => PlannerOperationExecutionFailure | null;
  commitRecommendation: (
    input: {
      input: EngineInput;
      result: ItineraryResult;
    },
    context: RecommendationAdapterContext,
  ) => Promise<RecommendationCommit>;
  ranker?: Ranker;
}

export interface RecommendItineraryHandlerOptions {
  policy: GatewayPolicy;
  correlationIdFactory?: () => string;
  requireAuthenticated?: boolean;
}

export interface RecommendItineraryResponse {
  advisoryOnly: true;
  degraded: boolean;
  messageKey?: Recommendation["messageKey"];
  planId: string;
  proposal: ItineraryWireResponse;
  rationales: Record<string, string>;
  revision: 1;
}

const ADAPTER_ERROR_DEFINITIONS: Record<
  RecommendationAdapterErrorCode,
  { messageKey: string; status: number; retryable: boolean }
> = {
  AUTH_REQUIRED: { messageKey: "planner.auth_required", status: 401, retryable: false },
  AUTH_EXPIRED: { messageKey: "planner.auth_expired", status: 401, retryable: false },
  CHALLENGE_REQUIRED: { messageKey: "recommendation.challenge_required", status: 400, retryable: false },
  CHALLENGE_INVALID: { messageKey: "recommendation.challenge_invalid", status: 403, retryable: false },
  QUOTA_EXCEEDED: { messageKey: "recommendation.quota_exceeded", status: 429, retryable: true },
  CATALOG_UNAVAILABLE: { messageKey: "recommendation.catalog_unavailable", status: 503, retryable: true },
  TRAVEL_DATA_UNAVAILABLE: { messageKey: "recommendation.travel_data_unavailable", status: 503, retryable: true },
  FX_UNAVAILABLE: { messageKey: "recommendation.fx_unavailable", status: 503, retryable: true },
  SERVICE_UNAVAILABLE: { messageKey: "planner.service_unavailable", status: 503, retryable: true },
};

const DOMAIN_ERROR_DEFINITIONS: Record<
  DomainErrorCode,
  { messageKey: string; status: number; retryable: boolean }
> = {
  INVALID_ITINERARY_INPUT: { messageKey: "itinerary.input.invalid", status: 400, retryable: false },
  USD_DISABLED: { messageKey: "itinerary.usd_disabled", status: 422, retryable: false },
  NO_FEASIBLE_ITINERARY: { messageKey: "itinerary.no_feasible", status: 422, retryable: false },
  ITINERARY_SEARCH_LIMIT: { messageKey: "itinerary.search_limit", status: 503, retryable: true },
  INVALID_ITINERARY_RESULT: { messageKey: "itinerary.result.invalid", status: 500, retryable: false },
};

const OPERATION_REJECTED_DEFINITIONS: Record<
  OperationRejectedCode,
  { messageKey: string; status: number; retryable: boolean }
> = {
  QUOTA_EXCEEDED: { messageKey: "recommendation.quota_exceeded", status: 429, retryable: true },
  CATALOG_UNAVAILABLE: { messageKey: "recommendation.catalog_unavailable", status: 503, retryable: true },
  TRAVEL_DATA_UNAVAILABLE: { messageKey: "recommendation.travel_data_unavailable", status: 503, retryable: true },
  FX_UNAVAILABLE: { messageKey: "recommendation.fx_unavailable", status: 503, retryable: true },
  STALE_REVISION: { messageKey: "refinement.stale_revision", status: 409, retryable: true },
  INVALID_ITINERARY_INPUT: { messageKey: "itinerary.input.invalid", status: 400, retryable: false },
  USD_DISABLED: { messageKey: "itinerary.usd_disabled", status: 422, retryable: false },
  NO_FEASIBLE_ITINERARY: { messageKey: "itinerary.no_feasible", status: 422, retryable: false },
  ITINERARY_SEARCH_LIMIT: { messageKey: "itinerary.search_limit", status: 503, retryable: true },
  INVALID_ITINERARY_RESULT: { messageKey: "itinerary.result.invalid", status: 500, retryable: false },
  PLAN_NOT_FOUND: { messageKey: "refinement.plan_not_found", status: 404, retryable: false },
  PLAN_UNAVAILABLE: { messageKey: "refinement.plan_unavailable", status: 503, retryable: true },
  SNAPSHOT_MISMATCH: { messageKey: "refinement.snapshot_mismatch", status: 409, retryable: false },
  LOCKED_ITEM_INVALID: { messageKey: "refinement.locked_item_invalid", status: 422, retryable: false },
};

type JsonRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonRecord {
  try {
    if (typeof value !== "object" || value === null) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function hasExactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  try {
    const keys = Reflect.ownKeys(value);
    if (keys.length !== expected.length) return false;
    const expectedSet = new Set(expected);
    return keys.every((key) => {
      if (typeof key !== "string" || !expectedSet.has(key)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
    });
  } catch {
    return false;
  }
}

function stableFieldErrors(error: z.ZodError): Record<string, string> | undefined {
  const fields = new Set<string>();
  for (const issue of error.issues) {
    const path = issue.path.map((part) => String(part)).join(".");
    if (path.length > 0 && path.length <= 160 && !CONTROL_CHARACTER_PATTERN.test(path)) fields.add(path);
  }
  if (fields.size === 0) return undefined;
  return Object.fromEntries([...fields].map((field) => [field, "gateway.invalid_request"]));
}

function invalidRequestResponse(
  correlationId: string,
  corsHeaders: HeadersInit,
  fieldErrors?: Record<string, string>,
): Response {
  return errorResponse(
    {
      code: "INVALID_REQUEST",
      messageKey: "planner.invalid_request",
      ...(fieldErrors ? { fieldErrors } : {}),
      retryable: false,
      status: 400,
    },
    correlationId,
    corsHeaders,
  );
}

function internalAdapterResponse(
  correlationId: string,
  corsHeaders: HeadersInit,
  code: "ADAPTER_UNAVAILABLE" | "ADAPTER_INVALID" | "ADAPTER_SNAPSHOT_MISMATCH" = "ADAPTER_UNAVAILABLE",
): Response {
  const messageKey = code === "ADAPTER_SNAPSHOT_MISMATCH"
    ? "recommendation.adapter_snapshot_mismatch"
    : code === "ADAPTER_INVALID"
      ? "recommendation.adapter_invalid"
      : "recommendation.adapter_unavailable";
  return errorResponse(
    { code, messageKey, retryable: code === "ADAPTER_UNAVAILABLE", status: code === "ADAPTER_UNAVAILABLE" ? 503 : 500 },
    correlationId,
    corsHeaders,
  );
}

function serviceUnavailableResponse(
  correlationId: string,
  corsHeaders: HeadersInit,
): Response {
  return errorResponse(
    {
      code: "SERVICE_UNAVAILABLE",
      messageKey: "planner.service_unavailable",
      retryable: true,
      status: 503,
    },
    correlationId,
    corsHeaders,
  );
}

function adapterFailureResponse(
  failure: unknown,
  correlationId: string,
  corsHeaders: HeadersInit,
): Response {
  if (!isPlainObject(failure) || !hasExactKeys(failure, ["code"])) {
    return internalAdapterResponse(correlationId, corsHeaders);
  }
  const code = failure.code;
  if (typeof code !== "string" || !Object.prototype.hasOwnProperty.call(ADAPTER_ERROR_DEFINITIONS, code)) {
    return internalAdapterResponse(correlationId, corsHeaders);
  }
  const definition = ADAPTER_ERROR_DEFINITIONS[code as RecommendationAdapterErrorCode];
  return errorResponse(
    { code, messageKey: definition.messageKey, retryable: definition.retryable, status: definition.status },
    correlationId,
    corsHeaders,
  );
}

type InspectedAccessVerification =
  | { kind: "invalid" }
  | { kind: "failure"; error: unknown }
  | { kind: "success"; principal: VerifiedAccessPrincipal };

function inspectAccessVerification(value: unknown): InspectedAccessVerification {
  try {
    if (!isPlainObject(value) || typeof value.ok !== "boolean") return { kind: "invalid" };
    if (value.ok === false) {
      if (!hasExactKeys(value, ["ok", "error"])) return { kind: "invalid" };
      return { kind: "failure", error: value.error };
    }
    if (!hasExactKeys(value, ["ok", "principal"]) || !isPlainObject(value.principal)) {
      return { kind: "invalid" };
    }
    if (!hasExactKeys(value.principal, ["userId"])) return { kind: "invalid" };
    const userId = value.principal.userId;
    if (
      typeof userId !== "string" ||
      userId.length === 0 ||
      userId.length > 160 ||
      CONTROL_CHARACTER_PATTERN.test(userId)
    ) {
      return { kind: "invalid" };
    }
    return { kind: "success", principal: { userId } };
  } catch {
    return { kind: "invalid" };
  }
}

type InspectedResolution =
  | { kind: "invalid" }
  | { kind: "failure"; error: unknown }
  | { kind: "success"; input: unknown };

/** Read an injected adapter result without invoking hostile getters twice. */
function inspectResolution(value: unknown): InspectedResolution {
  try {
    if (!isPlainObject(value) || typeof value.ok !== "boolean") return { kind: "invalid" };
    if (value.ok === false) {
      if (!hasExactKeys(value, ["ok", "error"])) return { kind: "invalid" };
      return { kind: "failure", error: value.error };
    }
    if (!hasExactKeys(value, ["ok", "input"])) return { kind: "invalid" };
    return { kind: "success", input: value.input };
  } catch {
    return { kind: "invalid" };
  }
}

type InspectedRecommendationCommit =
  | { kind: "invalid" }
  | { kind: "failure"; error: unknown }
  | { kind: "success"; planId: string; revision: 1 };

function inspectRecommendationCommit(value: unknown): InspectedRecommendationCommit {
  try {
    if (!isPlainObject(value) || typeof value.ok !== "boolean") return { kind: "invalid" };
    if (value.ok === false) {
      if (hasExactKeys(value, ["ok", "error"])) return { kind: "failure", error: value.error };
      if (hasExactKeys(value, ["ok", "decision"])) {
        const decision = parsedOperationDecision(value.decision);
        return decision === null ? { kind: "invalid" } : { kind: "failure", error: { decision } };
      }
      return { kind: "invalid" };
    }
    if (
      !hasExactKeys(value, ["ok", "planId", "revision"]) ||
      typeof value.planId !== "string" ||
      !uuidSchema.safeParse(value.planId).success ||
      value.revision !== 1
    ) {
      return { kind: "invalid" };
    }
    return { kind: "success", planId: value.planId, revision: 1 };
  } catch {
    return { kind: "invalid" };
  }
}

function semanticallyEqual(
  left: unknown,
  right: unknown,
  seen: WeakMap<object, object>,
): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) return false;

  const previous = seen.get(left);
  if (previous !== undefined) return previous === right;
  seen.set(left, right);

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    const leftKeys = Reflect.ownKeys(left);
    const rightKeys = Reflect.ownKeys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    const expectedKeys = new Set(["length", ...Array.from({ length: left.length }, (_, index) => String(index))]);
    if (
      leftKeys.some((key) => typeof key !== "string" || !expectedKeys.has(key)) ||
      rightKeys.some((key) => typeof key !== "string" || !expectedKeys.has(key))
    ) return false;
    for (let index = 0; index < left.length; index += 1) {
      const leftDescriptor = Object.getOwnPropertyDescriptor(left, String(index));
      const rightDescriptor = Object.getOwnPropertyDescriptor(right, String(index));
      if (
        leftDescriptor === undefined || rightDescriptor === undefined ||
        !leftDescriptor.enumerable || !rightDescriptor.enumerable ||
        !("value" in leftDescriptor) || !("value" in rightDescriptor) ||
        !semanticallyEqual(leftDescriptor.value, rightDescriptor.value, seen)
      ) return false;
    }
    return true;
  }

  if (!isPlainObject(left) || !isPlainObject(right)) return false;
  const leftKeys = Reflect.ownKeys(left);
  const rightKeys = Reflect.ownKeys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  const leftNames = leftKeys.filter((key): key is string => typeof key === "string").sort();
  const rightNames = rightKeys.filter((key): key is string => typeof key === "string").sort();
  if (
    leftNames.length !== leftKeys.length || rightNames.length !== rightKeys.length ||
    leftNames.some((key, index) => key !== rightNames[index])
  ) return false;
  for (const key of leftNames) {
    const leftDescriptor = Object.getOwnPropertyDescriptor(left, key);
    const rightDescriptor = Object.getOwnPropertyDescriptor(right, key);
    if (
      leftDescriptor === undefined || rightDescriptor === undefined ||
      !leftDescriptor.enumerable || !rightDescriptor.enumerable ||
      !("value" in leftDescriptor) || !("value" in rightDescriptor) ||
      !semanticallyEqual(leftDescriptor.value, rightDescriptor.value, seen)
    ) return false;
  }
  return true;
}

/** Compare request values independent of object key order; array order is significant. */
export function requestsSemanticallyEqual(left: unknown, right: unknown): boolean {
  try {
    return semanticallyEqual(left, right, new WeakMap<object, object>());
  } catch {
    return false;
  }
}

function domainFailureResponse(
  error: JsonRecord,
  correlationId: string,
  corsHeaders: HeadersInit,
): Response {
  const code = error.code;
  if (typeof code !== "string" || !Object.prototype.hasOwnProperty.call(DOMAIN_ERROR_DEFINITIONS, code)) {
    return internalAdapterResponse(correlationId, corsHeaders, "ADAPTER_INVALID");
  }
  const definition = DOMAIN_ERROR_DEFINITIONS[code as DomainErrorCode];
  const issueKeys = Array.isArray(error.issueKeys)
    ? error.issueKeys.filter((value): value is string =>
      typeof value === "string" && value.length > 0 && value.length <= 160 && !CONTROL_CHARACTER_PATTERN.test(value))
    : [];
  const fieldErrors = issueKeys.length > 0
    ? Object.fromEntries(issueKeys.map((key) => [key, definition.messageKey]))
    : undefined;
  return errorResponse(
    {
      code,
      messageKey: definition.messageKey,
      ...(fieldErrors ? { fieldErrors } : {}),
      retryable: definition.retryable,
      status: definition.status,
    },
    correlationId,
    corsHeaders,
  );
}

function safeRecommendationResult(
  value: Recommendation,
  correlationId: string,
  corsHeaders: HeadersInit,
): { ok: true; result: ItineraryResult } | { ok: false; response: Response } {
  const parsed = itineraryResultSchema.safeParse(value.result);
  if (!parsed.success) {
    return { ok: false, response: internalAdapterResponse(correlationId, corsHeaders, "ADAPTER_INVALID") };
  }
  return { ok: true, result: parsed.data };
}

function unwrapOperationRpc(value: unknown): unknown {
  if (isPlainObject(value) && Object.prototype.hasOwnProperty.call(value, "data")
    && Object.prototype.hasOwnProperty.call(value, "error")) {
    if (value.error !== null) return null;
    value = value.data;
  }
  if (Array.isArray(value) && value.length === 1) return value[0];
  if (isPlainObject(value) && value.ok === true && Object.prototype.hasOwnProperty.call(value, "decision")) {
    return value.decision;
  }
  return value;
}

function parsedOperationDecision(value: unknown): OperationDecision | null {
  return parseOperationDecision(unwrapOperationRpc(value));
}

function operationClaimFailure(value: unknown): unknown | null {
  if (!isPlainObject(value) || value.ok !== false || !hasExactKeys(value, ["ok", "error"])) return null;
  return value.error;
}

function operationResponse(
  code: string,
  messageKey: string,
  status: number,
  retryable: boolean,
  correlationId: string,
  corsHeaders: HeadersInit,
  operationState?: "rejected" | "in_progress" | "interrupted",
): Response {
  return jsonResponse(
    {
      code,
      messageKey,
      retryable,
      ...(operationState === undefined ? {} : { operationState }),
      correlationId,
    },
    { status, correlationId, corsHeaders },
  );
}

function operationDecisionResponse(
  decision: OperationDecision,
  correlationId: string,
  corsHeaders: HeadersInit,
): Response | null {
  if (decision.state === "in_progress") {
    return operationResponse(
      "OPERATION_IN_PROGRESS",
      "planner.operation_in_progress",
      409,
      true,
      correlationId,
      corsHeaders,
      "in_progress",
    );
  }
  if (decision.state === "interrupted") {
    return operationResponse(
      "OPERATION_INTERRUPTED",
      "planner.operation_interrupted",
      409,
      false,
      correlationId,
      corsHeaders,
      "interrupted",
    );
  }
  if (decision.state === "conflict") {
    return operationResponse(
      "OPERATION_CONFLICT",
      "planner.operation_conflict",
      409,
      false,
      correlationId,
      corsHeaders,
    );
  }
  if (decision.state !== "rejected") return null;
  const definition = OPERATION_REJECTED_DEFINITIONS[decision.errorCode];
  return operationResponse(
    decision.errorCode,
    definition.messageKey,
    definition.status,
    definition.retryable,
    correlationId,
    corsHeaders,
    "rejected",
  );
}

function plannerOperationContext(
  decision: Extract<OperationDecision, { state: "claimed" }>,
  input: PlannerOperationClaimInput,
): PlannerOperationContext {
  return {
    operationId: input.operationId,
    requestDigest: input.requestDigest,
    kind: input.kind,
    leaseToken: decision.leaseToken,
    leaseExpiresAt: decision.leaseExpiresAt,
    planId: decision.planId,
    baseRevision: input.baseRevision,
    plannerReservationId: decision.plannerReservationId,
    geminiReservationId: decision.geminiReservationId,
  };
}

function hasUppercaseUuid(value: string): boolean {
  return UUID_CASE_INSENSITIVE_PATTERN.test(value) && value !== value.toLowerCase();
}

function hasUppercaseRequestUuid(input: ItineraryRequest): boolean {
  return [
    input.areas,
    input.dietaryRequirements,
    input.mobilityRequirements,
    input.lockedStopIds,
  ].some((values) => values.some((value) => hasUppercaseUuid(value)));
}

function persistedRecommendationResponse(
  persisted: unknown,
  expectedPlanId: string,
  expectedRevision: number,
  correlationId: string,
  corsHeaders: HeadersInit,
): Response {
  try {
    if (!isPlainObject(persisted) || typeof persisted.ok !== "boolean") {
      return internalAdapterResponse(correlationId, corsHeaders, "ADAPTER_INVALID");
    }
    if (persisted.ok === false) {
      if (
        !hasExactKeys(persisted, ["ok", "error"])
        || !isPlainObject(persisted.error)
        || !hasExactKeys(persisted.error, ["code"])
        || persisted.error.code !== "SERVICE_UNAVAILABLE"
      ) {
        return internalAdapterResponse(correlationId, corsHeaders, "ADAPTER_INVALID");
      }
      return serviceUnavailableResponse(correlationId, corsHeaders);
    }
    if (
      !hasExactKeys(persisted, ["ok", "planId", "revision", "rankingSource", "result"])
      || typeof persisted.planId !== "string"
      || !uuidSchema.safeParse(persisted.planId).success
      || typeof persisted.revision !== "number"
      || !Number.isSafeInteger(persisted.revision)
      || (persisted.rankingSource !== "ai" && persisted.rankingSource !== "deterministic")
      || persisted.planId !== expectedPlanId
      || persisted.revision !== expectedRevision
      || expectedRevision !== 1
    ) {
      return internalAdapterResponse(correlationId, corsHeaders, "ADAPTER_INVALID");
    }
    const parsed = itineraryResultSchema.safeParse(persisted.result);
    if (!parsed.success || parsed.data.rankingSource !== persisted.rankingSource) {
      return internalAdapterResponse(correlationId, corsHeaders, "ADAPTER_INVALID");
    }
    return jsonResponse(
      {
        advisoryOnly: true,
        degraded: persisted.rankingSource === "deterministic",
        planId: persisted.planId,
        proposal: serializeItineraryWireResponse(parsed.data),
        rationales: {},
        revision: 1,
      } satisfies RecommendItineraryResponse,
      { correlationId, corsHeaders },
    );
  } catch {
    return internalAdapterResponse(correlationId, corsHeaders, "ADAPTER_INVALID");
  }
}

function operationRejectionCode(value: unknown): OperationRejectedCode | null {
  return parseOperationRejectedCode(value);
}

function operationCodeFromFailure(value: unknown): OperationRejectedCode | null {
  if (!isPlainObject(value) || typeof value.code !== "string") return null;
  if (value.code === "ADAPTER_SNAPSHOT_MISMATCH") return "SNAPSHOT_MISMATCH";
  return operationRejectionCode(value.code);
}

function normalizePlannerQuotaResult(value: unknown): PlannerQuotaReservation | null {
  if (!isPlainObject(value) || typeof value.ok !== "boolean") return null;
  if (value.ok === true && hasExactKeys(value, ["ok"])) return { ok: true };
  if (value.ok === false && hasExactKeys(value, ["ok", "kind"]) && value.kind === "unavailable") {
    return { ok: false, kind: "unavailable" };
  }
  if (value.ok === false && hasExactKeys(value, ["ok", "kind", "code"])) {
    if (value.kind === "rejected" && value.code === "QUOTA_EXCEEDED") {
      return { ok: false, kind: "rejected", code: "QUOTA_EXCEEDED" };
    }
    if (value.kind === "unavailable") return { ok: false, kind: "unavailable" };
  }
  return null;
}

async function rejectClaimedOperation(
  adapter: RecommendItineraryAdapter,
  operation: PlannerOperationContext,
  context: RecommendationAdapterContext,
  code: OperationRejectedCode,
  correlationId: string,
  corsHeaders: HeadersInit,
): Promise<Response> {
  let rawDecision: unknown;
  try {
    rawDecision = await adapter.rejectOperation(
      {
        operationId: operation.operationId,
        requestDigest: operation.requestDigest,
        leaseToken: operation.leaseToken,
      },
      code,
      context,
    );
  } catch {
    return serviceUnavailableResponse(correlationId, corsHeaders);
  }
  const decision = parsedOperationDecision(rawDecision);
  if (decision === null) return internalAdapterResponse(correlationId, corsHeaders, "ADAPTER_INVALID");
  if (decision.state === "rejected" && decision.errorCode !== code) {
    return internalAdapterResponse(correlationId, corsHeaders, "ADAPTER_INVALID");
  }
  if (decision.state === "completed") {
    let persisted: PersistedPlannerRevision;
    try {
      persisted = await adapter.readCommittedRevision(
        { planId: decision.planId, revision: decision.revision },
        context,
      );
    } catch {
      return serviceUnavailableResponse(correlationId, corsHeaders);
    }
    return persistedRecommendationResponse(
      persisted,
      decision.planId,
      decision.revision,
      correlationId,
      corsHeaders,
    );
  }
  return operationDecisionResponse(decision, correlationId, corsHeaders)
    ?? internalAdapterResponse(correlationId, corsHeaders, "ADAPTER_INVALID");
}

/** Build a public recommendation handler around a server-only adapter. */
export function createRecommendItineraryHandler(
  adapter: RecommendItineraryAdapter,
  options: RecommendItineraryHandlerOptions,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const gateway = guardRequest(request, options.policy, options.correlationIdFactory);
    if (!gateway.ok) return gateway.response;

    const body = await readJsonBody<unknown>(request, {
      correlationId: gateway.correlationId,
      corsHeaders: gateway.corsHeaders,
      maxBodyBytes: options.policy.maxBodyBytes,
    });
    if (!body.ok) return body.response;

    const parsedBody = recommendItineraryBodySchema.safeParse(body.value);
    if (!parsedBody.success) {
      return invalidRequestResponse(
        gateway.correlationId,
        gateway.corsHeaders,
        stableFieldErrors(parsedBody.error),
      );
    }
    if (hasUppercaseRequestUuid(parsedBody.data.input)) {
      return invalidRequestResponse(gateway.correlationId, gateway.corsHeaders);
    }

    let principal: VerifiedAccessPrincipal | null = null;
    if (request.headers.get("Authorization") !== null) {
      const auth = requireBearerToken(request, gateway.correlationId, gateway.corsHeaders);
      if (!auth.ok) {
        return errorResponse(
          {
            code: "AUTH_EXPIRED",
            messageKey: "planner.auth_expired",
            retryable: false,
            status: 401,
          },
          gateway.correlationId,
          gateway.corsHeaders,
        );
      }
      let verification: AccessTokenVerification;
      try {
        if (typeof adapter?.verifyAccessToken !== "function") {
          return internalAdapterResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
        }
        verification = await adapter.verifyAccessToken(auth.token, gateway.correlationId);
      } catch {
        return internalAdapterResponse(gateway.correlationId, gateway.corsHeaders);
      }
      const inspectedVerification = inspectAccessVerification(verification);
      if (inspectedVerification.kind === "invalid") {
        return internalAdapterResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
      }
      if (inspectedVerification.kind === "failure") {
        return adapterFailureResponse(inspectedVerification.error, gateway.correlationId, gateway.corsHeaders);
      }
      principal = inspectedVerification.principal;
    }
    if (options.requireAuthenticated === true && principal === null) {
      return adapterFailureResponse(
        { code: "AUTH_REQUIRED" },
        gateway.correlationId,
        gateway.corsHeaders,
      );
    }

    const context: RecommendationAdapterContext = {
      correlationId: gateway.correlationId,
      principal,
      guestToken: parsedBody.data.guestToken ?? null,
      turnstileToken: parsedBody.data.turnstileToken ?? null,
    };

    if (adapter.validateQuotaIdentity !== undefined) {
      let identityCheck: PlannerQuotaIdentityCheck;
      try {
        identityCheck = await adapter.validateQuotaIdentity(context);
      } catch {
        return serviceUnavailableResponse(gateway.correlationId, gateway.corsHeaders);
      }
      if (!isPlainObject(identityCheck) || typeof identityCheck.ok !== "boolean") {
        return internalAdapterResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
      }
      if (identityCheck.ok === false) {
        return adapterFailureResponse(identityCheck.error, gateway.correlationId, gateway.corsHeaders);
      }
    }

    let requestDigest: string;
    try {
      requestDigest = await computePlannerOperationDigest("recommend", parsedBody.data.input);
    } catch {
      return internalAdapterResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
    }
    const operationInput: PlannerOperationClaimInput = {
      operationId: parsedBody.data.operationId,
      requestDigest,
      kind: "recommend",
      targetPlanId: null,
      baseRevision: null,
    };

    let rawDecision: unknown;
    try {
      if (typeof adapter?.claimOperation !== "function") {
        return internalAdapterResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
      }
      rawDecision = await adapter.claimOperation(operationInput, context);
    } catch {
      return serviceUnavailableResponse(gateway.correlationId, gateway.corsHeaders);
    }
    const decision = parsedOperationDecision(rawDecision);
    if (decision === null) {
      const failure = operationClaimFailure(rawDecision);
      return failure === null
        ? internalAdapterResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID")
        : adapterFailureResponse(failure, gateway.correlationId, gateway.corsHeaders);
    }
    if (decision.state === "completed") {
      let persisted: PersistedPlannerRevision;
      try {
        persisted = await adapter.readCommittedRevision(
          { planId: decision.planId, revision: decision.revision },
          context,
        );
      } catch {
        return serviceUnavailableResponse(gateway.correlationId, gateway.corsHeaders);
      }
      return persistedRecommendationResponse(
        persisted,
        decision.planId,
        decision.revision,
        gateway.correlationId,
        gateway.corsHeaders,
      );
    }
    if (decision.state !== "claimed") {
      return operationDecisionResponse(decision, gateway.correlationId, gateway.corsHeaders)
        ?? internalAdapterResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
    }

    const operation = plannerOperationContext(decision, operationInput);
    const operationContext: RecommendationAdapterContext = { ...context, operation };

    let plannerQuota: PlannerQuotaReservation | null;
    try {
      plannerQuota = normalizePlannerQuotaResult(
        await adapter.reservePlannerQuota(operation.plannerReservationId, operationContext),
      );
    } catch {
      return serviceUnavailableResponse(gateway.correlationId, gateway.corsHeaders);
    }
    if (plannerQuota === null) return internalAdapterResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
    if (plannerQuota.ok === false) {
      if (plannerQuota.kind === "rejected") {
        return rejectClaimedOperation(
          adapter,
          operation,
          operationContext,
          plannerQuota.code,
          gateway.correlationId,
          gateway.corsHeaders,
        );
      }
      return serviceUnavailableResponse(gateway.correlationId, gateway.corsHeaders);
    }

    let resolution: RecommendationAdapterResolution;
    try {
      if (typeof adapter?.resolveEngineInput !== "function") {
        return internalAdapterResponse(gateway.correlationId, gateway.corsHeaders);
      }
      resolution = await adapter.resolveEngineInput(parsedBody.data.input, operationContext);
    } catch {
      return internalAdapterResponse(gateway.correlationId, gateway.corsHeaders);
    }

    const inspected = inspectResolution(resolution);
    if (inspected.kind === "invalid") {
      return internalAdapterResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
    }
    if (inspected.kind === "failure") {
      const rejectionCode = operationCodeFromFailure(inspected.error);
      if (rejectionCode !== null) {
        return rejectClaimedOperation(
          adapter,
          operation,
          operationContext,
          rejectionCode,
          gateway.correlationId,
          gateway.corsHeaders,
        );
      }
      return adapterFailureResponse(inspected.error, gateway.correlationId, gateway.corsHeaders);
    }

    let engineInput: ReturnType<typeof parseEngineInput>;
    try {
      engineInput = parseEngineInput(inspected.input);
    } catch {
      return internalAdapterResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
    }
    if (!engineInput.ok) {
      return internalAdapterResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
    }
    if (!requestsSemanticallyEqual(engineInput.value.request, parsedBody.data.input)) {
      return rejectClaimedOperation(
        adapter,
        operation,
        operationContext,
        "SNAPSHOT_MISMATCH",
        gateway.correlationId,
        gateway.corsHeaders,
      );
    }

    let recommendation: Awaited<ReturnType<typeof recommendItinerary>>;
    try {
      recommendation = await recommendItinerary(engineInput.value, {
        ranker: typeof adapter.ranker === "function" ? adapter.ranker : undefined,
      });
    } catch {
      return internalAdapterResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
    }
    if (adapter.readOperationFailure !== undefined) {
      let executionFailure: PlannerOperationExecutionFailure | null;
      try {
        executionFailure = adapter.readOperationFailure();
      } catch {
        return serviceUnavailableResponse(gateway.correlationId, gateway.corsHeaders);
      }
      if (executionFailure?.kind === "quota") {
        return rejectClaimedOperation(
          adapter,
          operation,
          operationContext,
          executionFailure.code,
          gateway.correlationId,
          gateway.corsHeaders,
        );
      }
      if (executionFailure?.kind === "ambiguous_provider") {
        return serviceUnavailableResponse(gateway.correlationId, gateway.corsHeaders);
      }
    }
    if (!recommendation.ok) {
      const rejectionCode = operationCodeFromFailure(recommendation.error);
      if (rejectionCode !== null) {
        return rejectClaimedOperation(
          adapter,
          operation,
          operationContext,
          rejectionCode,
          gateway.correlationId,
          gateway.corsHeaders,
        );
      }
      return domainFailureResponse(
        recommendation.error as unknown as JsonRecord,
        gateway.correlationId,
        gateway.corsHeaders,
      );
    }
    const safeResult = safeRecommendationResult(
      recommendation.value,
      gateway.correlationId,
      gateway.corsHeaders,
    );
    if (!safeResult.ok) {
      return rejectClaimedOperation(
        adapter,
        operation,
        operationContext,
        "INVALID_ITINERARY_RESULT",
        gateway.correlationId,
        gateway.corsHeaders,
      );
    }

    let commit: RecommendationCommit;
    try {
      if (typeof adapter?.commitRecommendation !== "function") {
        return internalAdapterResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
      }
      commit = await adapter.commitRecommendation({
        input: engineInput.value,
        result: safeResult.result,
      }, operationContext);
    } catch {
      return serviceUnavailableResponse(gateway.correlationId, gateway.corsHeaders);
    }
    const inspectedCommit = inspectRecommendationCommit(commit);
    if (inspectedCommit.kind === "invalid") {
      return internalAdapterResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
    }
    if (inspectedCommit.kind === "failure") {
      if (adapter.readOperationFailure !== undefined) {
        let executionFailure: PlannerOperationExecutionFailure | null;
        try {
          executionFailure = adapter.readOperationFailure();
        } catch {
          return serviceUnavailableResponse(gateway.correlationId, gateway.corsHeaders);
        }
        if (executionFailure?.kind === "ambiguous_commit") {
          return serviceUnavailableResponse(gateway.correlationId, gateway.corsHeaders);
        }
      }
      if (isPlainObject(inspectedCommit.error) && hasExactKeys(inspectedCommit.error, ["decision"])) {
        const commitDecision = parsedOperationDecision(inspectedCommit.error.decision);
        if (commitDecision !== null) {
          return operationDecisionResponse(commitDecision, gateway.correlationId, gateway.corsHeaders)
            ?? internalAdapterResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
        }
        return internalAdapterResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
      }
      const rejectionCode = operationCodeFromFailure(inspectedCommit.error);
      if (rejectionCode !== null) {
        return rejectClaimedOperation(
          adapter,
          operation,
          operationContext,
          rejectionCode,
          gateway.correlationId,
          gateway.corsHeaders,
        );
      }
      return adapterFailureResponse(inspectedCommit.error, gateway.correlationId, gateway.corsHeaders);
    }
    if (inspectedCommit.planId !== operation.planId) {
      return internalAdapterResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
    }

    const responseBody: RecommendItineraryResponse = {
      advisoryOnly: true,
      degraded: recommendation.value.degraded,
      ...(recommendation.value.messageKey ? { messageKey: recommendation.value.messageKey } : {}),
      planId: inspectedCommit.planId,
      proposal: serializeItineraryWireResponse(safeResult.result),
      rationales: { ...recommendation.value.rationales },
      revision: inspectedCommit.revision,
    };
    return jsonResponse(responseBody, {
      correlationId: gateway.correlationId,
      corsHeaders: gateway.corsHeaders,
    });
  };
}

/** Keep the exact engine input shape visible to adapter implementers. */
export type AuthoritativeRecommendationInput = EngineInput;
export type AuthoritativeRecommendationResult = ItineraryResult;
