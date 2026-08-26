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
  itineraryResultSchema,
  parseEngineInput,
  type ItineraryRequest,
  type ItineraryResult,
} from "@/lib/domain/itinerary/contracts";
import type { DomainErrorCode } from "@/lib/domain/itinerary/errors";
import {
  recommendItinerary,
  type Recommendation,
} from "@/lib/application/itinerary/recommend";
import type { Ranker } from "@/lib/application/itinerary/ranking-port";
import type {
  AccessTokenVerification,
  VerifiedAccessPrincipal,
} from "@/supabase/functions/_shared/recommend-itinerary";

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/;
const TOKEN_MAX_LENGTH = 4096;
const MAX_FEEDBACK_LENGTH = 2000;
const POSITIVE_REVISION_MAX = 2_147_483_647;

const uuidSchema = z.string().uuid();
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

export const refineItineraryBodySchema = z
  .object({
    planId: uuidSchema,
    baseRevision: z.number().int().min(1).max(POSITIVE_REVISION_MAX),
    delta: z
      .object({
        feedback: feedbackSchema,
        scope: z.enum(["partial", "full"]),
      })
      .strict(),
    lockedItemIds: z.array(uuidSchema).max(8).superRefine((values, context) => {
      if (new Set(values).size !== values.length) {
        context.addIssue({ code: "custom", message: "locked item IDs must be unique" });
      }
    }),
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
}

export type RefineItineraryAdapterErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_INVALID"
  | "CHALLENGE_REQUIRED"
  | "CHALLENGE_INVALID"
  | "QUOTA_EXCEEDED"
  | "PLAN_NOT_FOUND"
  | "PLAN_UNAVAILABLE"
  | "SNAPSHOT_MISMATCH"
  | "STALE_REVISION";

export interface RefineItineraryAdapterFailure {
  code: RefineItineraryAdapterErrorCode;
}

export type RefinePreparation =
  | {
      ok: true;
      planId: string;
      currentRevision: number;
      input: unknown;
      ranker?: Ranker;
    }
  | { ok: false; error: RefineItineraryAdapterFailure };

export type RefineCommit =
  | { ok: true; revision: number }
  | { ok: false; error: RefineItineraryAdapterFailure };

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
  commitRefinement: (
    input: {
      planId: string;
      baseRevision: number;
      lockedItemIds: string[];
      scope: "partial" | "full";
      result: ItineraryResult;
    },
    context: RefineItineraryAdapterContext,
  ) => Promise<RefineCommit>;
}

export interface RefineItineraryHandlerOptions {
  policy: GatewayPolicy;
  correlationIdFactory?: () => string;
}

export interface RefineItineraryResponse {
  advisoryOnly: true;
  baseRevision: number;
  degraded: boolean;
  planId: string;
  proposal: ItineraryResult;
  regeneration: "partial" | "full";
  revision: number;
  messageKey?: Recommendation["messageKey"];
  rationales: Record<string, string>;
}

const ERROR_DEFINITIONS: Record<
  RefineItineraryAdapterErrorCode,
  { messageKey: string; status: number; retryable: boolean }
> = {
  AUTH_REQUIRED: { messageKey: "refinement.auth_required", status: 401, retryable: false },
  AUTH_INVALID: { messageKey: "refinement.auth_invalid", status: 401, retryable: false },
  CHALLENGE_REQUIRED: { messageKey: "refinement.challenge_required", status: 400, retryable: false },
  CHALLENGE_INVALID: { messageKey: "refinement.challenge_invalid", status: 403, retryable: false },
  QUOTA_EXCEEDED: { messageKey: "refinement.quota_exceeded", status: 429, retryable: true },
  PLAN_NOT_FOUND: { messageKey: "refinement.plan_not_found", status: 404, retryable: false },
  PLAN_UNAVAILABLE: { messageKey: "refinement.plan_unavailable", status: 503, retryable: true },
  SNAPSHOT_MISMATCH: { messageKey: "refinement.snapshot_mismatch", status: 409, retryable: false },
  STALE_REVISION: { messageKey: "refinement.stale_revision", status: 409, retryable: true },
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
      messageKey: "gateway.invalid_request",
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

function inspectPreparation(value: unknown):
  | { kind: "invalid" }
  | { kind: "failure"; error: unknown }
  | { kind: "success"; planId: string; currentRevision: number; input: unknown; ranker?: Ranker } {
  try {
    if (!isPlainObject(value) || typeof value.ok !== "boolean") return { kind: "invalid" };
    if (value.ok === false) {
      if (!hasExactKeys(value, ["ok", "error"])) return { kind: "invalid" };
      return { kind: "failure", error: value.error };
    }
    const keys = Reflect.ownKeys(value);
    const allowed = new Set(["ok", "planId", "currentRevision", "input", "ranker"]);
    if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) return { kind: "invalid" };
    if (!hasExactKeys(value, keys.includes("ranker") ? ["ok", "planId", "currentRevision", "input", "ranker"] : ["ok", "planId", "currentRevision", "input"])) {
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
    return {
      kind: "success",
      planId: value.planId,
      currentRevision: value.currentRevision,
      input: value.input,
      ...(typeof value.ranker === "function" ? { ranker: value.ranker as Ranker } : {}),
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
      if (!hasExactKeys(value, ["ok", "error"])) return { kind: "invalid" };
      return { kind: "failure", error: value.error };
    }
    if (!hasExactKeys(value, ["ok", "revision"]) || typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 1 || value.revision > POSITIVE_REVISION_MAX) {
      return { kind: "invalid" };
    }
    return { kind: "success", revision: value.revision };
  } catch {
    return { kind: "invalid" };
  }
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

    let principal: VerifiedAccessPrincipal | null = null;
    let guestCapability: VerifiedGuestCapability | null = null;
    const authHeader = request.headers.get("Authorization");
    try {
      if (authHeader !== null) {
        const auth = requireBearerToken(request, gateway.correlationId, gateway.corsHeaders);
        if (!auth.ok) return auth.response;
        if (typeof adapter?.verifyAccessToken !== "function") return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
        const verified = inspectAccessVerification(await adapter.verifyAccessToken(auth.token, gateway.correlationId));
        if (verified.kind === "invalid") return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
        if (verified.kind === "failure") return adapterFailureResponse(verified.error, gateway.correlationId, gateway.corsHeaders);
        principal = verified.principal;
      }
      if (parsedBody.data.guestToken !== undefined) {
        if (typeof adapter?.verifyGuestCapability !== "function") return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
        const verified = inspectGuestVerification(await adapter.verifyGuestCapability(input.planId, parsedBody.data.guestToken, gateway.correlationId));
        if (verified.kind === "invalid") return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
        if (verified.kind === "failure") return adapterFailureResponse(verified.error, gateway.correlationId, gateway.corsHeaders);
        if (verified.capability.planId !== input.planId) return adapterFailureResponse({ code: "AUTH_INVALID" }, gateway.correlationId, gateway.corsHeaders);
        guestCapability = verified.capability;
      }
    } catch {
      return internalResponse(gateway.correlationId, gateway.corsHeaders);
    }
    if (principal === null && guestCapability === null) {
      return errorResponse(
        { code: "AUTH_REQUIRED", messageKey: "refinement.auth_required", retryable: false, status: 401 },
        gateway.correlationId,
        gateway.corsHeaders,
      );
    }

    const context: RefineItineraryAdapterContext = {
      correlationId: gateway.correlationId,
      principal,
      guestCapability,
    };
    let preparation: RefinePreparation;
    try {
      if (typeof adapter?.prepareRefinement !== "function") return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
      preparation = await adapter.prepareRefinement(input, context);
    } catch {
      return internalResponse(gateway.correlationId, gateway.corsHeaders);
    }
    const inspectedPreparation = inspectPreparation(preparation);
    if (inspectedPreparation.kind === "invalid") return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
    if (inspectedPreparation.kind === "failure") return adapterFailureResponse(inspectedPreparation.error, gateway.correlationId, gateway.corsHeaders);
    if (inspectedPreparation.planId !== input.planId) return adapterFailureResponse({ code: "SNAPSHOT_MISMATCH" }, gateway.correlationId, gateway.corsHeaders);
    if (inspectedPreparation.currentRevision !== input.baseRevision) return adapterFailureResponse({ code: "STALE_REVISION" }, gateway.correlationId, gateway.corsHeaders);

    let engineInput: ReturnType<typeof parseEngineInput>;
    try {
      engineInput = parseEngineInput(inspectedPreparation.input);
    } catch {
      return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
    }
    if (!engineInput.ok) return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
    let recommendation: Awaited<ReturnType<typeof recommendItinerary>>;
    try {
      recommendation = await recommendItinerary(engineInput.value, { ranker: inspectedPreparation.ranker });
    } catch {
      return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
    }
    if (!recommendation.ok) return domainFailureResponse(recommendation.error as unknown as JsonRecord, gateway.correlationId, gateway.corsHeaders);
    const result = itineraryResultSchema.safeParse(recommendation.value.result);
    if (!result.success) return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");

    let commit: RefineCommit;
    try {
      if (typeof adapter?.commitRefinement !== "function") return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
      commit = await adapter.commitRefinement({
        planId: input.planId,
        baseRevision: input.baseRevision,
        lockedItemIds: [...input.lockedItemIds],
        scope: input.delta.scope,
        result: result.data,
      }, context);
    } catch {
      return internalResponse(gateway.correlationId, gateway.corsHeaders);
    }
    const inspectedCommit = inspectCommit(commit);
    if (inspectedCommit.kind === "invalid") return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
    if (inspectedCommit.kind === "failure") return adapterFailureResponse(inspectedCommit.error, gateway.correlationId, gateway.corsHeaders);
    if (inspectedCommit.revision !== input.baseRevision + 1) return internalResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");

    const responseBody: RefineItineraryResponse = {
      advisoryOnly: true,
      baseRevision: input.baseRevision,
      degraded: recommendation.value.degraded,
      planId: input.planId,
      proposal: result.data,
      regeneration: input.delta.scope,
      revision: inspectedCommit.revision,
      ...(recommendation.value.messageKey ? { messageKey: recommendation.value.messageKey } : {}),
      rationales: { ...recommendation.value.rationales },
    };
    return jsonResponse(responseBody, { correlationId: gateway.correlationId, corsHeaders: gateway.corsHeaders });
  };
}

export type RefineAuthoritativeRequest = ItineraryRequest;
