/**
 * Contract-only HTTP handler for personalized itinerary refinement.
 *
 * The adapter owns plan lookup, guest capability verification, snapshot
 * selection, and the transactional compare-and-swap commit. This handler
 * keeps the HTTP boundary strict and delegates scheduling/constraint
 * authority to the existing itinerary engine. It is not a deployed function
 * and it never changes booking, quote, or payment state.
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
  itineraryItemSchema,
  itineraryResultSchema,
  parseEngineInput,
  type FoodSelectionInput,
  type ItineraryRequest,
  type ItineraryResult,
} from "@/lib/domain/itinerary/contracts";
import type { DomainErrorCode } from "@/lib/domain/itinerary/errors";
import { fingerprintRevisionBinding } from "@/lib/domain/itinerary/fingerprint";
import {
  recommendItinerary,
  type Recommendation,
} from "@/lib/application/itinerary/recommend";
import {
  serializeItineraryWireResponse,
  type ItineraryWireResponse,
} from "@/supabase/functions/_shared/itinerary-wire-response";
import type {
  RankRequest,
  RankResponse,
  Ranker,
} from "@/lib/application/itinerary/ranking-port";
import type {
  AccessTokenVerification,
  PersistedPlannerRevision,
  PlannerOperationClaimInput,
  PlannerOperationContext,
  PlannerOperationExecutionFailure,
  PlannerQuotaIdentityCheck,
  PlannerQuotaReservation,
  VerifiedAccessPrincipal,
} from "@/supabase/functions/_shared/recommend-itinerary";
import {
  computePlannerOperationDigest,
  parseOperationDecision,
  parseOperationRejectedCode,
  parsePlannerOperationId,
  type OperationDecision,
  type OperationRejectedCode,
} from "@/supabase/functions/_shared/planner-operation";
import {
  foodMenuItemSchema,
  foodSelectionSchema,
  foodVendorSchema,
  type FoodSelection,
} from "@/lib/domain/food/contracts";
import { calculateFoodSelectionCost, calculateItineraryCostBreakdown } from "@/lib/domain/itinerary/food-cost";
import { multiplyVnd, sumVnd } from "@/lib/domain/itinerary/money";
import {
  parseCanonicalRefinementSignals,
  type RefinementSignals,
} from "@/supabase/functions/_shared/refinement-signals";

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/;
const TOKEN_MAX_LENGTH = 4096;
const MAX_FEEDBACK_LENGTH = 2000;
const POSITIVE_REVISION_MAX = 2_147_483_647;

const uuidSchema = z.string().uuid().refine((value) => value === value.toLowerCase(), {
  message: "UUID must be lowercase",
});
const operationIdSchema = z.string().refine((value) => parsePlannerOperationId(value) !== null, {
  message: "operationId must be a lowercase UUID",
});
const tokenSchema = z
  .string()
  .trim()
  .min(1)
  .max(TOKEN_MAX_LENGTH)
  .refine((value) => !CONTROL_CHARACTER_PATTERN.test(value), {
    message: "token cannot contain control characters",
  });
const feedbackSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_FEEDBACK_LENGTH)
  .refine((value) => !CONTROL_CHARACTER_PATTERN.test(value), {
    message: "feedback cannot contain control characters",
  });
const internalSnapshotIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((value) => !CONTROL_CHARACTER_PATTERN.test(value));
const fingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);
const canonicalHcmTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00$/);
const canonicalLockedItemSchema = z
  .object({
    itemId: uuidSchema,
    placeId: internalSnapshotIdSchema,
    position: z.number().int().min(1).max(8),
    startAt: canonicalHcmTimestampSchema,
    endAt: canonicalHcmTimestampSchema,
    visitDurationMinutes: z.number().int().min(15).max(480),
  })
  .strict();
const previousRevisionSchema = z
  .object({
    planId: uuidSchema,
    revision: z.number().int().min(1).max(POSITIVE_REVISION_MAX),
    fingerprint: fingerprintSchema,
    catalogSnapshotId: internalSnapshotIdSchema,
    travelSnapshotId: internalSnapshotIdSchema,
    fxSnapshotId: internalSnapshotIdSchema.nullable(),
    authoritativeInput: z.unknown(),
    authoritativeResult: itineraryResultSchema,
    items: z.array(z.object({
      itemId: uuidSchema,
      position: z.number().int().min(1).max(8),
      ...itineraryItemSchema.shape,
    }).strict()).max(8),
    lockedItems: z.array(canonicalLockedItemSchema).max(8),
  })
  .strict();

export interface NormalizedRefinementDelta {
  feedback: string;
  scope: "partial" | "full";
}

export interface CanonicalLockedItem {
  itemId: string;
  placeId: string;
  position: number;
  startAt: string;
  endAt: string;
  visitDurationMinutes: number;
}

export interface PreviousRevisionContext {
  planId: string;
  revision: number;
  fingerprint: string;
  catalogSnapshotId: string;
  travelSnapshotId: string;
  fxSnapshotId: string | null;
  authoritativeInput: unknown;
  authoritativeResult: ItineraryResult;
  items: Array<CanonicalPreviousItem>;
  lockedItems: CanonicalLockedItem[];
}

export type CanonicalPreviousItem = {
  itemId: string;
  position: number;
} & ItineraryResult["items"][number];

export interface RefinementRankRequest extends RankRequest {
  signals: RefinementSignals;
  scope: "partial" | "full";
  lockedPlaceIds: string[];
}

export type RefinementRanker = (
  request: RefinementRankRequest,
  signal: AbortSignal,
) => Promise<RankResponse>;

export const refineItineraryBodySchema = z
  .object({
    operationId: operationIdSchema,
    planId: uuidSchema,
    baseRevision: z.number().int().min(1).max(POSITIVE_REVISION_MAX),
    delta: z
      .object({
        feedback: feedbackSchema,
        scope: z.enum(["partial", "full"]),
      })
      .strict(),
    // Duplicate IDs are invalid request shape and must be rejected before claim.
    lockedItemIds: z.array(uuidSchema).max(8).refine(
      (ids) => new Set(ids).size === ids.length,
      { message: "lockedItemIds must contain unique IDs" },
    ),
    guestToken: tokenSchema.optional(),
  })
  .strict();

export type RefineItineraryBody = z.infer<typeof refineItineraryBodySchema>;
export type RefineItineraryInput = Pick<RefineItineraryBody, "planId" | "baseRevision" | "delta" | "lockedItemIds">;

export interface VerifiedGuestCapability {
  planId: string;
}

export type GuestCapabilityVerification =
  | { ok: true; capability: VerifiedGuestCapability }
  | { ok: false; error: RefineItineraryAdapterFailure };

export interface RefineItineraryAdapterContext {
  correlationId: string;
  principal: VerifiedAccessPrincipal | null;
  guestCapability: VerifiedGuestCapability | null;
  /** Server-only operation scope; never copied to a provider or wire response. */
  operation?: PlannerOperationContext;
}

export type RefineItineraryAdapterErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_EXPIRED"
  | "CHALLENGE_REQUIRED"
  | "CHALLENGE_INVALID"
  | "QUOTA_EXCEEDED"
  | "PLAN_NOT_FOUND"
  | "PLAN_UNAVAILABLE"
  | "SNAPSHOT_MISMATCH"
  | "LOCKED_ITEM_INVALID"
  | "STALE_REVISION"
  | "SERVICE_UNAVAILABLE";

export interface RefineItineraryAdapterFailure {
  code: RefineItineraryAdapterErrorCode;
}

export type RefinePreparation =
  | {
      ok: true;
      planId: string;
      currentRevision: number;
      normalizedDelta: NormalizedRefinementDelta;
      previousRevision: PreviousRevisionContext;
      ranker?: RefinementRanker;
    }
  | { ok: false; error: RefineItineraryAdapterFailure };

export type RefineCommit =
  | { ok: true; revision: number }
  | { ok: false; error: RefineItineraryAdapterFailure }
  | { ok: false; decision: OperationDecision };

export interface RefineItineraryAdapter {
  verifyAccessToken: (
    parsedAccessToken: string,
    correlationId: string,
  ) => Promise<AccessTokenVerification>;
  verifyGuestCapability: (
    planId: string,
    parsedGuestToken: string,
    correlationId: string,
  ) => Promise<GuestCapabilityVerification>;
  prepareRefinement: (
    input: RefineItineraryInput,
    context: RefineItineraryAdapterContext,
  ) => Promise<RefinePreparation>;
  validateQuotaIdentity?: (
    context: RefineItineraryAdapterContext,
  ) => Promise<PlannerQuotaIdentityCheck>;
  claimOperation: (
    input: PlannerOperationClaimInput,
    context: RefineItineraryAdapterContext,
  ) => Promise<unknown>;
  reservePlannerQuota: (
    reservationId: string,
    context: RefineItineraryAdapterContext,
  ) => Promise<PlannerQuotaReservation>;
  rejectOperation: (
    input: { operationId: string; requestDigest: string; leaseToken: string },
    errorCode: OperationRejectedCode,
    context: RefineItineraryAdapterContext,
  ) => Promise<unknown>;
  readCommittedRevision: (
    input: { planId: string; revision: number },
    context: RefineItineraryAdapterContext,
  ) => Promise<PersistedPlannerRevision>;
  readOperationFailure?: () => PlannerOperationExecutionFailure | null;
  commitRefinement: (
    input: {
      planId: string;
      baseRevision: number;
      lockedItemIds: string[];
      normalizedDelta: NormalizedRefinementDelta;
      previousRevision: PreviousRevisionContext;
      scope: "partial" | "full";
      result: ItineraryResult;
    },
    context: RefineItineraryAdapterContext,
  ) => Promise<RefineCommit>;
}

export interface RefineItineraryHandlerOptions {
  policy: GatewayPolicy;
  correlationIdFactory?: () => string;
  requireAuthenticated?: boolean;
}

export interface RefineItineraryResponse {
  advisoryOnly: true;
  baseRevision: number;
  degraded: boolean;
  planId: string;
  proposal: ItineraryWireResponse;
  regeneration: "partial" | "full";
  revision: number;
  messageKey?: Recommendation["messageKey"];
  rationales: Record<string, string>;
}

const ERROR_DEFINITIONS: Record<
  RefineItineraryAdapterErrorCode,
  { messageKey: string; status: number; retryable: boolean }
> = {
  AUTH_REQUIRED: { messageKey: "planner.auth_required", status: 401, retryable: false },
  AUTH_EXPIRED: { messageKey: "planner.auth_expired", status: 401, retryable: false },
  CHALLENGE_REQUIRED: { messageKey: "refinement.challenge_required", status: 400, retryable: false },
  CHALLENGE_INVALID: { messageKey: "refinement.challenge_invalid", status: 403, retryable: false },
  QUOTA_EXCEEDED: { messageKey: "refinement.quota_exceeded", status: 429, retryable: true },
  PLAN_NOT_FOUND: { messageKey: "refinement.plan_not_found", status: 404, retryable: false },
  PLAN_UNAVAILABLE: { messageKey: "refinement.plan_unavailable", status: 503, retryable: true },
  SNAPSHOT_MISMATCH: { messageKey: "refinement.snapshot_mismatch", status: 409, retryable: false },
  LOCKED_ITEM_INVALID: { messageKey: "refinement.locked_item_invalid", status: 422, retryable: false },
  STALE_REVISION: { messageKey: "refinement.stale_revision", status: 409, retryable: true },
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
  QUOTA_EXCEEDED: { messageKey: "refinement.quota_exceeded", status: 429, retryable: true },
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

function fieldErrors(error: z.ZodError): Record<string, string> | undefined {
  const fields = new Set<string>();
  for (const issue of error.issues) {
    const path = issue.path.map((part) => String(part)).join(".");
    if (path.length > 0 && path.length <= 160 && !CONTROL_CHARACTER_PATTERN.test(path)) fields.add(path);
  }
  return fields.size > 0
    ? Object.fromEntries([...fields].map((path) => [path, "gateway.invalid_request"]))
    : undefined;
}

function invalidRequestResponse(
  correlationId: string,
  corsHeaders: HeadersInit,
  errors?: Record<string, string>,
): Response {
  return errorResponse(
    {
      code: "INVALID_REQUEST",
      messageKey: "planner.invalid_request",
      ...(errors ? { fieldErrors: errors } : {}),
      retryable: false,
      status: 400,
    },
    correlationId,
    corsHeaders,
  );
}

function internalResponse(
  correlationId: string,
  corsHeaders: HeadersInit,
  code: "ADAPTER_UNAVAILABLE" | "ADAPTER_INVALID" = "ADAPTER_UNAVAILABLE",
): Response {
  return errorResponse(
    {
      code,
      messageKey: code === "ADAPTER_INVALID" ? "refinement.adapter_invalid" : "refinement.adapter_unavailable",
      retryable: code === "ADAPTER_UNAVAILABLE",
      status: code === "ADAPTER_UNAVAILABLE" ? 503 : 500,
    },
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
  if (!isPlainObject(failure) || !hasExactKeys(failure, ["code"])) return internalResponse(correlationId, corsHeaders);
  const code = failure.code;
  if (typeof code !== "string" || !Object.prototype.hasOwnProperty.call(ERROR_DEFINITIONS, code)) {
    return internalResponse(correlationId, corsHeaders);
  }
  const definition = ERROR_DEFINITIONS[code as RefineItineraryAdapterErrorCode];
  return errorResponse(
    { code, messageKey: definition.messageKey, retryable: definition.retryable, status: definition.status },
    correlationId,
    corsHeaders,
  );
}

function inspectAccessVerification(value: unknown):
  | { kind: "invalid" }
  | { kind: "failure"; error: unknown }
  | { kind: "success"; principal: VerifiedAccessPrincipal } {
  try {
    if (!isPlainObject(value) || typeof value.ok !== "boolean") return { kind: "invalid" };
    if (value.ok === false) {
      if (!hasExactKeys(value, ["ok", "error"])) return { kind: "invalid" };
      return { kind: "failure", error: value.error };
    }
    if (!hasExactKeys(value, ["ok", "principal"]) || !isPlainObject(value.principal)) return { kind: "invalid" };
    if (!hasExactKeys(value.principal, ["userId"])) return { kind: "invalid" };
    const userId = value.principal.userId;
    if (typeof userId !== "string" || userId.length === 0 || userId.length > 160 || CONTROL_CHARACTER_PATTERN.test(userId)) {
      return { kind: "invalid" };
    }
    return { kind: "success", principal: { userId } };
  } catch {
    return { kind: "invalid" };
  }
}

function inspectGuestVerification(value: unknown):
  | { kind: "invalid" }
  | { kind: "failure"; error: unknown }
  | { kind: "success"; capability: VerifiedGuestCapability } {
  try {
    if (!isPlainObject(value) || typeof value.ok !== "boolean") return { kind: "invalid" };
    if (value.ok === false) {
      if (!hasExactKeys(value, ["ok", "error"])) return { kind: "invalid" };
      return { kind: "failure", error: value.error };
    }
    if (!hasExactKeys(value, ["ok", "capability"]) || !isPlainObject(value.capability)) return { kind: "invalid" };
    if (!hasExactKeys(value.capability, ["planId"]) || typeof value.capability.planId !== "string" || !uuidSchema.safeParse(value.capability.planId).success) return { kind: "invalid" };
    return { kind: "success", capability: { planId: value.capability.planId } };
  } catch {
    return { kind: "invalid" };
  }
}

function inspectPreparation(value: unknown, expectedInput: RefineItineraryInput):
  | { kind: "invalid" }
  | { kind: "failure"; error: unknown }
  | {
      kind: "success";
      planId: string;
      currentRevision: number;
      normalizedDelta: NormalizedRefinementDelta;
      previousRevision: PreviousRevisionContext;
      ranker?: RefinementRanker;
    } {
  try {
    if (!isPlainObject(value) || typeof value.ok !== "boolean") return { kind: "invalid" };
    if (value.ok === false) {
      if (!hasExactKeys(value, ["ok", "error"])) return { kind: "invalid" };
      return { kind: "failure", error: value.error };
    }
    const keys = Reflect.ownKeys(value);
    const allowed = new Set([
      "ok",
      "planId",
      "currentRevision",
      "normalizedDelta",
      "previousRevision",
      "ranker",
    ]);
    if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) return { kind: "invalid" };
    if (!hasExactKeys(value, keys.includes("ranker")
      ? ["ok", "planId", "currentRevision", "normalizedDelta", "previousRevision", "ranker"]
      : ["ok", "planId", "currentRevision", "normalizedDelta", "previousRevision"])) {
      return { kind: "invalid" };
    }
    if (
      typeof value.planId !== "string" ||
      typeof value.currentRevision !== "number" ||
      !Number.isSafeInteger(value.currentRevision) ||
      value.currentRevision < 1 ||
      value.currentRevision > POSITIVE_REVISION_MAX ||
      ("ranker" in value && typeof value.ranker !== "function")
    ) return { kind: "invalid" };
    const normalizedDelta = z
      .object({ feedback: feedbackSchema, scope: z.enum(["partial", "full"]) })
      .strict()
      .safeParse(value.normalizedDelta);
    const previousRevision = previousRevisionSchema.safeParse(value.previousRevision);
    if (!normalizedDelta.success || !previousRevision.success) return { kind: "invalid" };
    const lockedItems = previousRevision.data.lockedItems;
    if (normalizedDelta.data.feedback !== expectedInput.delta.feedback
      || normalizedDelta.data.scope !== expectedInput.delta.scope) {
      return { kind: "invalid" };
    }
    const requestedLockedItemIds = expectedInput.lockedItemIds;
    if (!Array.isArray(requestedLockedItemIds)
      || new Set(requestedLockedItemIds).size !== requestedLockedItemIds.length
      || requestedLockedItemIds.length !== lockedItems.length
      || requestedLockedItemIds.some((id, index) => id !== lockedItems[index]?.itemId)
      || new Set(lockedItems.map((item) => item.itemId)).size !== lockedItems.length
      || lockedItems.some((item, index) => index > 0 && item.position <= lockedItems[index - 1].position)) {
      return { kind: "failure", error: { code: "LOCKED_ITEM_INVALID" } };
    }
    return {
      kind: "success",
      planId: value.planId,
      currentRevision: value.currentRevision,
      normalizedDelta: normalizedDelta.data,
      previousRevision: {
        ...previousRevision.data,
        lockedItems: previousRevision.data.lockedItems.map((item) => ({ ...item })),
      },
      ...(typeof value.ranker === "function" ? { ranker: value.ranker as RefinementRanker } : {}),
    };
  } catch {
    return { kind: "invalid" };
  }
}

function inspectCommit(value: unknown):
  | { kind: "invalid" }
  | { kind: "failure"; error: unknown }
  | { kind: "success"; revision: number } {
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
    if (!hasExactKeys(value, ["ok", "revision"]) || typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 1 || value.revision > POSITIVE_REVISION_MAX) {
      return { kind: "invalid" };
    }
    return { kind: "success", revision: value.revision };
  } catch {
    return { kind: "invalid" };
  }
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

function persistedRefinementResponse(
  persisted: unknown,
  input: RefineItineraryInput,
  expectedRevision: number,
  correlationId: string,
  corsHeaders: HeadersInit,
): Response {
  try {
    if (!isPlainObject(persisted) || typeof persisted.ok !== "boolean") {
      return internalResponse(correlationId, corsHeaders, "ADAPTER_INVALID");
    }
    if (persisted.ok === false) {
      if (
        !hasExactKeys(persisted, ["ok", "error"])
        || !isPlainObject(persisted.error)
        || !hasExactKeys(persisted.error, ["code"])
        || persisted.error.code !== "SERVICE_UNAVAILABLE"
      ) {
        return internalResponse(correlationId, corsHeaders, "ADAPTER_INVALID");
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
      || persisted.planId !== input.planId
      || persisted.revision !== expectedRevision
    ) {
      return internalResponse(correlationId, corsHeaders, "ADAPTER_INVALID");
    }
    const parsed = itineraryResultSchema.safeParse(persisted.result);
    if (!parsed.success || parsed.data.rankingSource !== persisted.rankingSource) {
      return internalResponse(correlationId, corsHeaders, "ADAPTER_INVALID");
    }
    return jsonResponse(
      {
        advisoryOnly: true,
        baseRevision: input.baseRevision,
        degraded: persisted.rankingSource === "deterministic",
        planId: persisted.planId,
        proposal: serializeItineraryWireResponse(parsed.data),
        regeneration: input.delta.scope,
        revision: persisted.revision,
        rationales: {},
      } satisfies RefineItineraryResponse,
      { correlationId, corsHeaders },
    );
  } catch {
    return internalResponse(correlationId, corsHeaders, "ADAPTER_INVALID");
  }
}

function operationCodeFromFailure(value: unknown): OperationRejectedCode | null {
  if (!isPlainObject(value) || typeof value.code !== "string") return null;
  return parseOperationRejectedCode(value.code);
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
  adapter: RefineItineraryAdapter,
  operation: PlannerOperationContext,
  context: RefineItineraryAdapterContext,
  replayInput: RefineItineraryInput,
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
  if (decision === null) return internalResponse(correlationId, corsHeaders, "ADAPTER_INVALID");
  if (decision.state === "rejected" && decision.errorCode !== code) {
    return internalResponse(correlationId, corsHeaders, "ADAPTER_INVALID");
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
    return persistedRefinementResponse(
      persisted,
      replayInput,
      decision.revision,
      correlationId,
      corsHeaders,
    );
  }
  return operationDecisionResponse(decision, correlationId, corsHeaders)
    ?? internalResponse(correlationId, corsHeaders, "ADAPTER_INVALID");
}

function domainFailureResponse(error: JsonRecord, correlationId: string, corsHeaders: HeadersInit): Response {
  const code = error.code;
  if (typeof code !== "string" || !Object.prototype.hasOwnProperty.call(DOMAIN_ERROR_DEFINITIONS, code)) return internalResponse(correlationId, corsHeaders, "ADAPTER_INVALID");
  const definition = DOMAIN_ERROR_DEFINITIONS[code as DomainErrorCode];
  const issueKeys = Array.isArray(error.issueKeys)
    ? error.issueKeys.filter((value): value is string => typeof value === "string" && value.length > 0 && value.length <= 160 && !CONTROL_CHARACTER_PATTERN.test(value))
    : [];
  return errorResponse(
    {
      code,
      messageKey: definition.messageKey,
      ...(issueKeys.length > 0 ? { fieldErrors: Object.fromEntries(issueKeys.map((key) => [key, definition.messageKey])) } : {}),
      retryable: definition.retryable,
      status: definition.status,
    },
    correlationId,
    corsHeaders,
  );
}

/**
 * Locked stops are an invariant of the previous authoritative revision. The
 * ranker may suggest candidates, but it cannot move, replace, or retime a
 * locked stop. Full regeneration has the same preservation rule whenever the
 * caller supplied locks; a full regeneration without locks is unrestricted.
 */
function sameFoodSelection(
  left: FoodSelection | null,
  right: FoodSelection | null,
): boolean {
  if (left === null || right === null) return left === right;
  return left.vendorId === right.vendorId
    && left.menuItemId === right.menuItemId
    && left.quantity === right.quantity
    && left.priceVndMin === right.priceVndMin
    && left.priceVndMax === right.priceVndMax
    && left.paymentMode === right.paymentMode
    && left.activity === right.activity;
}

function preservesLockedStops(
  result: ItineraryResult,
  previousRevision: PreviousRevisionContext,
): boolean {
  if (previousRevision.lockedItems.length === 0) return true;
  let previousResultIndex = -1;
  for (const lockedItem of previousRevision.lockedItems) {
    const matches = result.items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.placeId === lockedItem.placeId);
    if (matches.length !== 1) return false;
    const [{ item, index }] = matches;
    const previousItem = previousRevision.items.find((candidate) => candidate.itemId === lockedItem.itemId);
    if (index <= previousResultIndex
      || item.startAt !== lockedItem.startAt
      || item.endAt !== lockedItem.endAt
      || item.visitDurationMinutes !== lockedItem.visitDurationMinutes
      || (previousItem === undefined
        || !sameFoodSelection(item.foodSelection, previousItem.foodSelection))) {
      return false;
    }
    previousResultIndex = index;
  }
  return true;
}

type ParsedEngineInput = Extract<ReturnType<typeof parseEngineInput>, { ok: true }>["value"];

function expectedFxSnapshotId(input: ParsedEngineInput): string | null {
  return input.request.budget.currency === "USD" ? input.fx?.id ?? null : null;
}

function sameSnapshotBinding(
  input: ParsedEngineInput,
  snapshotIds: PreviousRevisionContext,
): boolean {
  return input.catalog.id === snapshotIds.catalogSnapshotId
    && input.travel.id === snapshotIds.travelSnapshotId
    && expectedFxSnapshotId(input) === snapshotIds.fxSnapshotId;
}

function sameResultItem(left: ItineraryResult["items"][number], right: CanonicalPreviousItem): boolean {
  return left.placeId === right.placeId
    && left.startAt === right.startAt
    && left.endAt === right.endAt
    && left.visitDurationMinutes === right.visitDurationMinutes
    && left.travelMinutesBefore === right.travelMinutesBefore
    && left.transitionBufferMinutesBefore === right.transitionBufferMinutesBefore
    && left.travelCostVndBefore === right.travelCostVndBefore
    && left.placeCostVnd === right.placeCostVnd
    && left.score === right.score
    && sameFoodSelection(left.foodSelection, right.foodSelection)
    && left.foodCostMinVnd === right.foodCostMinVnd
    && left.foodCostMaxVnd === right.foodCostMaxVnd
    && left.payAtVendorMinVnd === right.payAtVendorMinVnd
    && left.payAtVendorMaxVnd === right.payAtVendorMaxVnd
    && left.customerPayableVnd === right.customerPayableVnd;
}

type PreviousMaterialCheck =
  | { kind: "ok"; input: ParsedEngineInput }
  | { kind: "locked" }
  | { kind: "snapshot" }
  | { kind: "invalid" };

function supports(
  support: Readonly<Record<string, string>>,
  requirements: readonly string[],
): boolean {
  return requirements.every((requirement) => support[requirement] === "supported");
}

function previousFoodMaterialIsAuthoritative(
  input: ParsedEngineInput,
  result: ItineraryResult,
): boolean {
  for (const item of result.items) {
    const place = input.catalog.places.find((candidate) => candidate.id === item.placeId);
    if (place === undefined) return false;
    const admission = multiplyVnd(place.priceVndPerPerson, input.request.partySize);
    if (!admission.ok) return false;
    if (item.foodSelection === null) {
      if (item.foodCostMinVnd !== 0 || item.foodCostMaxVnd !== 0
        || item.payAtVendorMinVnd !== 0 || item.payAtVendorMaxVnd !== 0) return false;
      const customerPayable = sumVnd([admission.value, item.travelCostVndBefore]);
      if (!customerPayable.ok || item.customerPayableVnd !== customerPayable.value) return false;
      continue;
    }
    const vendor = place.foodVendors.find((candidate) => candidate.id === item.foodSelection?.vendorId);
    if (vendor === undefined || vendor.placeId !== place.id || vendor.status !== "sellable"
      || !supports(vendor.dietarySupport, input.request.dietaryRequirements)
      || !supports(vendor.mobilitySupport, input.request.mobilityRequirements)) return false;
    const menuItem = vendor.menuItems.find((candidate) => candidate.id === item.foodSelection?.menuItemId);
    if (menuItem === undefined || menuItem.vendorId !== vendor.id || menuItem.status !== "sellable" || menuItem.available !== true
      || !supports(menuItem.dietarySupport, input.request.dietaryRequirements)) return false;
    if (item.foodSelection.activity !== "Taste and discuss the selected dish") return false;
    if (item.foodSelection.priceVndMin !== menuItem.priceVndMin || item.foodSelection.priceVndMax !== menuItem.priceVndMax) return false;
    const expectedQuantity = menuItem.servingUnit === "shared_set" ? 1 : input.request.partySize;
    if (item.foodSelection.quantity !== expectedQuantity || item.foodSelection.paymentMode !== "pay_at_vendor") return false;
    if (!foodVendorSchema.safeParse(vendor).success || !foodMenuItemSchema.safeParse(menuItem).success) return false;
    const cost = calculateFoodSelectionCost(item.foodSelection, menuItem, input.request.partySize);
    if (!cost.ok
      || item.foodCostMinVnd !== cost.value.minVnd
      || item.foodCostMaxVnd !== cost.value.maxVnd
      || item.payAtVendorMinVnd !== cost.value.payAtVendorMinVnd
      || item.payAtVendorMaxVnd !== cost.value.payAtVendorMaxVnd) return false;
    const customerPayable = sumVnd([admission.value, item.travelCostVndBefore, cost.value.customerPayableVnd]);
    if (!customerPayable.ok || item.customerPayableVnd !== customerPayable.value) return false;
  }
  const travelCost = sumVnd(result.items.map((item) => item.travelCostVndBefore));
  if (!travelCost.ok) return false;
  const expected = calculateItineraryCostBreakdown(result.items, travelCost.value, 0);
  if (!expected.ok) return false;
  return result.totals.admissionCostVnd === expected.value.admissionCostVnd
    && result.totals.foodCostMinVnd === expected.value.foodCostMinVnd
    && result.totals.foodCostMaxVnd === expected.value.foodCostMaxVnd
    && result.totals.travelCostVnd === expected.value.travelCostVnd
    && result.totals.guideCostVnd === expected.value.guideCostVnd
    && result.totals.payAtVendorMinVnd === expected.value.payAtVendorMinVnd
    && result.totals.payAtVendorMaxVnd === expected.value.payAtVendorMaxVnd
    && result.totals.customerPayableVnd === expected.value.customerPayableVnd
    && result.totals.groupCostMinVnd === expected.value.groupCostMinVnd
    && result.totals.groupCostMaxVnd === expected.value.groupCostMaxVnd
    && result.totals.groupCostVnd === expected.value.groupCostVnd;
}

async function validatePreviousMaterial(
  previousRevision: PreviousRevisionContext,
  input: RefineItineraryInput,
): Promise<PreviousMaterialCheck> {
  if (previousRevision.planId !== input.planId || previousRevision.revision !== input.baseRevision) {
    return { kind: "snapshot" };
  }
  const priorInput = parseEngineInput(previousRevision.authoritativeInput);
  if (!priorInput.ok) return { kind: "invalid" };
  if (!sameSnapshotBinding(priorInput.value, previousRevision)) return { kind: "snapshot" };
  const priorResult = previousRevision.authoritativeResult;
  if (priorResult.snapshotIds.catalog !== previousRevision.catalogSnapshotId
    || priorResult.snapshotIds.travel !== previousRevision.travelSnapshotId
    || priorResult.snapshotIds.fx !== previousRevision.fxSnapshotId
    || previousRevision.items.length !== priorResult.items.length) {
    return { kind: "snapshot" };
  }
  for (const [index, item] of previousRevision.items.entries()) {
    if (item.position !== index + 1 || !sameResultItem(priorResult.items[index], item)) return { kind: "snapshot" };
  }
  const priorItemsById = new Map(previousRevision.items.map((item) => [item.itemId, item]));
  for (const lockedItem of previousRevision.lockedItems) {
    const priorItem = priorItemsById.get(lockedItem.itemId);
    if (priorItem === undefined
      || priorItem.position !== lockedItem.position
      || priorItem.placeId !== lockedItem.placeId
      || priorItem.startAt !== lockedItem.startAt
      || priorItem.endAt !== lockedItem.endAt
      || priorItem.visitDurationMinutes !== lockedItem.visitDurationMinutes) {
      return { kind: "locked" };
    }
    if (!priorInput.value.catalog.places.some((place) => place.id === lockedItem.placeId)) return { kind: "locked" };
  }
  if (!previousFoodMaterialIsAuthoritative(priorInput.value, priorResult)) return { kind: "snapshot" };
  let fingerprint: string;
  try {
    fingerprint = await fingerprintRevisionBinding(
      previousRevision.planId,
      previousRevision.revision,
      priorInput.value,
      priorResult,
      async (bytes) => new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer)),
    );
  } catch {
    return { kind: "invalid" };
  }
  if (fingerprint !== previousRevision.fingerprint) return { kind: "snapshot" };
  return { kind: "ok", input: priorInput.value };
}

function lockedFoodSelections(
  previousRevision: PreviousRevisionContext,
): FoodSelectionInput {
  const selections = Object.create(null) as Record<string, FoodSelection | null>;
  const parsedInput = parseEngineInput(previousRevision.authoritativeInput);
  if (!parsedInput.ok) return selections;
  const foodPlaceIds = new Set(
    parsedInput.value.request.priorityWeights.street_food > 0
      ? parsedInput.value.catalog.places
          .filter((place) => place.types.some((type) => type === "street_food" || type === "traditional_market"))
          .map((place) => place.id)
      : [],
  );
  const itemsById = new Map(previousRevision.items.map((item) => [item.itemId, item]));
  for (const lockedItem of previousRevision.lockedItems) {
    if (!foodPlaceIds.has(lockedItem.placeId)) continue;
    const item = itemsById.get(lockedItem.itemId);
    if (item?.foodSelection === null) {
      Object.defineProperty(selections, lockedItem.placeId, {
        value: null,
        enumerable: true,
        configurable: true,
        writable: true,
      });
      continue;
    }
    if (item?.foodSelection === undefined) continue;
    const parsed = foodSelectionSchema.safeParse(item.foodSelection);
    if (!parsed.success) continue;
    Object.defineProperty(selections, lockedItem.placeId, {
      value: {
        vendorId: parsed.data.vendorId,
        menuItemId: parsed.data.menuItemId,
        quantity: parsed.data.quantity,
        priceVndMin: parsed.data.priceVndMin,
        priceVndMax: parsed.data.priceVndMax,
        paymentMode: parsed.data.paymentMode,
        activity: parsed.data.activity,
      },
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return selections;
}

export function createRefineItineraryHandler(
  adapter: RefineItineraryAdapter,
  options: RefineItineraryHandlerOptions,
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

    const parsedBody = refineItineraryBodySchema.safeParse(body.value);
    if (!parsedBody.success) return invalidRequestResponse(gateway.correlationId, gateway.corsHeaders, fieldErrors(parsedBody.error));
    const input: RefineItineraryInput = {
      planId: parsedBody.data.planId,
      baseRevision: parsedBody.data.baseRevision,
      delta: parsedBody.data.delta,
      lockedItemIds: [...parsedBody.data.lockedItemIds],
    };
    const refinementSignals = parseCanonicalRefinementSignals(input.delta.feedback);
    if (refinementSignals === null) {
      return invalidRequestResponse(gateway.correlationId, gateway.corsHeaders, {
        "delta.feedback": "gateway.invalid_request",
      });
    }

    let principal: VerifiedAccessPrincipal | null = null;
    let guestCapability: VerifiedGuestCapability | null = null;
    const authHeader = request.headers.get("Authorization");
    try {
      if (authHeader !== null) {
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
        if (typeof adapter?.verifyAccessToken !== "function") return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
        const verified = inspectAccessVerification(await adapter.verifyAccessToken(auth.token, gateway.correlationId));
        if (verified.kind === "invalid") return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
        if (verified.kind === "failure") return adapterFailureResponse(verified.error, gateway.correlationId, gateway.corsHeaders);
        principal = verified.principal;
      }
      if (options.requireAuthenticated === true && principal === null) {
        return adapterFailureResponse({ code: "AUTH_REQUIRED" }, gateway.correlationId, gateway.corsHeaders);
      }
      if (options.requireAuthenticated !== true && parsedBody.data.guestToken !== undefined) {
        if (typeof adapter?.verifyGuestCapability !== "function") return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
        const verified = inspectGuestVerification(await adapter.verifyGuestCapability(input.planId, parsedBody.data.guestToken, gateway.correlationId));
        if (verified.kind === "invalid") return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
        if (verified.kind === "failure") return adapterFailureResponse(verified.error, gateway.correlationId, gateway.corsHeaders);
        if (verified.capability.planId !== input.planId) return adapterFailureResponse({ code: "AUTH_EXPIRED" }, gateway.correlationId, gateway.corsHeaders);
        guestCapability = verified.capability;
      }
    } catch {
      return internalResponse(gateway.correlationId, gateway.corsHeaders);
    }
    if (principal === null && guestCapability === null) {
      return errorResponse(
        { code: "AUTH_REQUIRED", messageKey: "planner.auth_required", retryable: false, status: 401 },
        gateway.correlationId,
        gateway.corsHeaders,
      );
    }

    const context: RefineItineraryAdapterContext = {
      correlationId: gateway.correlationId,
      principal,
        guestCapability,
      };
    if (adapter.validateQuotaIdentity !== undefined) {
      let identityCheck: PlannerQuotaIdentityCheck;
      try {
        identityCheck = await adapter.validateQuotaIdentity(context);
      } catch {
        return serviceUnavailableResponse(gateway.correlationId, gateway.corsHeaders);
      }
      if (!isPlainObject(identityCheck) || typeof identityCheck.ok !== "boolean") {
        return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
      }
      if (identityCheck.ok === false) {
        return adapterFailureResponse(identityCheck.error, gateway.correlationId, gateway.corsHeaders);
      }
    }
    let requestDigest: string;
    try {
      requestDigest = await computePlannerOperationDigest("refine", {
        planId: input.planId,
        baseRevision: input.baseRevision,
        scope: input.delta.scope,
        lockedItemIds: input.lockedItemIds,
        signals: refinementSignals,
      });
    } catch {
      return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
    }
    const operationInput: PlannerOperationClaimInput = {
      operationId: parsedBody.data.operationId,
      requestDigest,
      kind: "refine",
      targetPlanId: input.planId,
      baseRevision: input.baseRevision,
    };

    let rawDecision: unknown;
    try {
      if (typeof adapter?.claimOperation !== "function") return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
      rawDecision = await adapter.claimOperation(operationInput, context);
    } catch {
      return serviceUnavailableResponse(gateway.correlationId, gateway.corsHeaders);
    }
    const decision = parsedOperationDecision(rawDecision);
    if (decision === null) {
      const failure = operationClaimFailure(rawDecision);
      return failure === null
        ? internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID")
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
      return persistedRefinementResponse(
        persisted,
        input,
        decision.revision,
        gateway.correlationId,
        gateway.corsHeaders,
      );
    }
    if (decision.state !== "claimed") {
      return operationDecisionResponse(decision, gateway.correlationId, gateway.corsHeaders)
        ?? internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
    }
    const operation = plannerOperationContext(decision, operationInput);
    if (operation.planId !== input.planId || operation.baseRevision !== input.baseRevision) {
      return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
    }
    const operationContext: RefineItineraryAdapterContext = { ...context, operation };
    let plannerQuota: PlannerQuotaReservation | null;
    try {
      plannerQuota = normalizePlannerQuotaResult(
        await adapter.reservePlannerQuota(operation.plannerReservationId, operationContext),
      );
    } catch {
      return serviceUnavailableResponse(gateway.correlationId, gateway.corsHeaders);
    }
    if (plannerQuota === null) return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
    if (plannerQuota.ok === false) {
      if (plannerQuota.kind === "rejected") {
        return rejectClaimedOperation(
          adapter,
          operation,
          operationContext,
          input,
          plannerQuota.code,
          gateway.correlationId,
          gateway.corsHeaders,
        );
      }
      return serviceUnavailableResponse(gateway.correlationId, gateway.corsHeaders);
    }

    let preparation: RefinePreparation;
    try {
      if (typeof adapter?.prepareRefinement !== "function") return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
      preparation = await adapter.prepareRefinement(input, operationContext);
    } catch {
      return internalResponse(gateway.correlationId, gateway.corsHeaders);
    }
    const inspectedPreparation = inspectPreparation(preparation, input);
    if (inspectedPreparation.kind === "invalid") return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
    if (inspectedPreparation.kind === "failure") {
      const rejectionCode = operationCodeFromFailure(inspectedPreparation.error);
      if (rejectionCode !== null) {
        return rejectClaimedOperation(
          adapter,
          operation,
          operationContext,
          input,
          rejectionCode,
          gateway.correlationId,
          gateway.corsHeaders,
        );
      }
      return adapterFailureResponse(inspectedPreparation.error, gateway.correlationId, gateway.corsHeaders);
    }
    if (inspectedPreparation.planId !== input.planId) {
      return rejectClaimedOperation(
        adapter,
        operation,
        operationContext,
        input,
        "SNAPSHOT_MISMATCH",
        gateway.correlationId,
        gateway.corsHeaders,
      );
    }
    if (inspectedPreparation.currentRevision !== input.baseRevision) {
      return rejectClaimedOperation(
        adapter,
        operation,
        operationContext,
        input,
        "STALE_REVISION",
        gateway.correlationId,
        gateway.corsHeaders,
      );
    }

    const previousMaterial = await validatePreviousMaterial(inspectedPreparation.previousRevision, input);
    if (previousMaterial.kind === "invalid") return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
    if (previousMaterial.kind === "locked") {
      return rejectClaimedOperation(
        adapter,
        operation,
        operationContext,
        input,
        "LOCKED_ITEM_INVALID",
        gateway.correlationId,
        gateway.corsHeaders,
      );
    }
    if (previousMaterial.kind === "snapshot") {
      return rejectClaimedOperation(
        adapter,
        operation,
        operationContext,
        input,
        "SNAPSHOT_MISMATCH",
        gateway.correlationId,
        gateway.corsHeaders,
      );
    }
    const lockedPlaceIds = inspectedPreparation.previousRevision.lockedItems.map((item) => item.placeId);
    const engineInput = {
      ok: true as const,
      value: {
        ...previousMaterial.input,
        request: {
          ...previousMaterial.input.request,
          lockedStopIds: [...lockedPlaceIds],
        },
      },
    };
    const priorLockedFoodSelections = lockedFoodSelections(inspectedPreparation.previousRevision);
    let recommendation: Awaited<ReturnType<typeof recommendItinerary>>;
    try {
      const ranker: Ranker | undefined = inspectedPreparation.ranker
        ? (request, signal) => inspectedPreparation.ranker!({
            ...request,
            signals: refinementSignals,
            scope: inspectedPreparation.normalizedDelta.scope,
            lockedPlaceIds: [...lockedPlaceIds],
          }, signal)
        : undefined;
      recommendation = await recommendItinerary(engineInput.value, {
        ranker,
        lockedFoodSelections: priorLockedFoodSelections,
      });
    } catch {
      return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
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
          input,
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
          input,
          rejectionCode,
          gateway.correlationId,
          gateway.corsHeaders,
        );
      }
      return domainFailureResponse(recommendation.error as unknown as JsonRecord, gateway.correlationId, gateway.corsHeaders);
    }
    const result = itineraryResultSchema.safeParse(recommendation.value.result);
    if (!result.success) {
      return rejectClaimedOperation(
        adapter,
        operation,
        operationContext,
        input,
        "INVALID_ITINERARY_RESULT",
        gateway.correlationId,
        gateway.corsHeaders,
      );
    }
    if (result.data.snapshotIds.catalog !== inspectedPreparation.previousRevision.catalogSnapshotId
      || result.data.snapshotIds.travel !== inspectedPreparation.previousRevision.travelSnapshotId
      || result.data.snapshotIds.fx !== inspectedPreparation.previousRevision.fxSnapshotId
      || result.data.snapshotIds.catalog !== engineInput.value.catalog.id
      || result.data.snapshotIds.travel !== engineInput.value.travel.id
      || result.data.snapshotIds.fx !== expectedFxSnapshotId(engineInput.value)) {
      return rejectClaimedOperation(
        adapter,
        operation,
        operationContext,
        input,
        "SNAPSHOT_MISMATCH",
        gateway.correlationId,
        gateway.corsHeaders,
      );
    }
    if (!preservesLockedStops(result.data, inspectedPreparation.previousRevision)) {
      return rejectClaimedOperation(
        adapter,
        operation,
        operationContext,
        input,
        "LOCKED_ITEM_INVALID",
        gateway.correlationId,
        gateway.corsHeaders,
      );
    }

    let commit: RefineCommit;
    try {
      if (typeof adapter?.commitRefinement !== "function") return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
      commit = await adapter.commitRefinement({
        planId: input.planId,
        baseRevision: input.baseRevision,
        lockedItemIds: [...input.lockedItemIds],
        normalizedDelta: { ...inspectedPreparation.normalizedDelta },
        previousRevision: {
          ...inspectedPreparation.previousRevision,
          lockedItems: inspectedPreparation.previousRevision.lockedItems.map((item) => ({ ...item })),
        },
        scope: inspectedPreparation.normalizedDelta.scope,
        result: result.data,
      }, operationContext);
    } catch {
      return serviceUnavailableResponse(gateway.correlationId, gateway.corsHeaders);
    }
    const inspectedCommit = inspectCommit(commit);
    if (inspectedCommit.kind === "invalid") return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
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
            ?? internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
        }
        return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
      }
      const rejectionCode = operationCodeFromFailure(inspectedCommit.error);
      if (rejectionCode !== null) {
        return rejectClaimedOperation(
          adapter,
          operation,
          operationContext,
          input,
          rejectionCode,
          gateway.correlationId,
          gateway.corsHeaders,
        );
      }
      return adapterFailureResponse(inspectedCommit.error, gateway.correlationId, gateway.corsHeaders);
    }
    if (inspectedCommit.revision !== input.baseRevision + 1) return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");

    const responseBody: RefineItineraryResponse = {
      advisoryOnly: true,
      baseRevision: input.baseRevision,
      degraded: recommendation.value.degraded,
      planId: input.planId,
      proposal: serializeItineraryWireResponse(result.data),
      regeneration: input.delta.scope,
      revision: inspectedCommit.revision,
      ...(recommendation.value.messageKey ? { messageKey: recommendation.value.messageKey } : {}),
      rationales: { ...recommendation.value.rationales },
    };
    return jsonResponse(responseBody, { correlationId: gateway.correlationId, corsHeaders: gateway.corsHeaders });
  };
}

export type RefineAuthoritativeRequest = ItineraryRequest;
