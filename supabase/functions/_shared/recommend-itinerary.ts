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
import type { Ranker } from "@/lib/application/itinerary/ranking-port";

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/;
const TOKEN_MAX_LENGTH = 4096;
const uuidSchema = z.string().uuid();

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
}

export const RECOMMENDATION_ADAPTER_ERROR_CODES = [
  "AUTH_REQUIRED",
  "AUTH_INVALID",
  "CHALLENGE_REQUIRED",
  "CHALLENGE_INVALID",
  "QUOTA_EXCEEDED",
  "CATALOG_UNAVAILABLE",
  "TRAVEL_DATA_UNAVAILABLE",
  "FX_UNAVAILABLE",
] as const;

export type RecommendationAdapterErrorCode =
  (typeof RECOMMENDATION_ADAPTER_ERROR_CODES)[number];

export interface RecommendationAdapterFailure {
  code: RecommendationAdapterErrorCode;
}

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
  | { ok: false; error: RecommendationAdapterFailure };

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
  AUTH_REQUIRED: { messageKey: "recommendation.auth_required", status: 401, retryable: false },
  AUTH_INVALID: { messageKey: "recommendation.auth_invalid", status: 401, retryable: false },
  CHALLENGE_REQUIRED: { messageKey: "recommendation.challenge_required", status: 400, retryable: false },
  CHALLENGE_INVALID: { messageKey: "recommendation.challenge_invalid", status: 403, retryable: false },
  QUOTA_EXCEEDED: { messageKey: "recommendation.quota_exceeded", status: 429, retryable: true },
  CATALOG_UNAVAILABLE: { messageKey: "recommendation.catalog_unavailable", status: 503, retryable: true },
  TRAVEL_DATA_UNAVAILABLE: { messageKey: "recommendation.travel_data_unavailable", status: 503, retryable: true },
  FX_UNAVAILABLE: { messageKey: "recommendation.fx_unavailable", status: 503, retryable: true },
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
      messageKey: "gateway.invalid_request",
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
      if (!hasExactKeys(value, ["ok", "error"])) return { kind: "invalid" };
      return { kind: "failure", error: value.error };
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

    let principal: VerifiedAccessPrincipal | null = null;
    if (request.headers.get("Authorization") !== null) {
      const auth = requireBearerToken(request, gateway.correlationId, gateway.corsHeaders);
      if (!auth.ok) return auth.response;
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

    let resolution: RecommendationAdapterResolution;
    try {
      if (typeof adapter?.resolveEngineInput !== "function") {
        return internalAdapterResponse(gateway.correlationId, gateway.corsHeaders);
      }
      resolution = await adapter.resolveEngineInput(parsedBody.data.input, context);
    } catch {
      return internalAdapterResponse(gateway.correlationId, gateway.corsHeaders);
    }

    const inspected = inspectResolution(resolution);
    if (inspected.kind === "invalid") {
      return internalAdapterResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
    }
    if (inspected.kind === "failure") {
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
      return internalAdapterResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_SNAPSHOT_MISMATCH");
    }

    let recommendation: Awaited<ReturnType<typeof recommendItinerary>>;
    try {
      recommendation = await recommendItinerary(engineInput.value, {
        ranker: typeof adapter.ranker === "function" ? adapter.ranker : undefined,
      });
    } catch {
      return internalAdapterResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
    }
    if (!recommendation.ok) {
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
    if (!safeResult.ok) return safeResult.response;

    let commit: RecommendationCommit;
    try {
      if (typeof adapter?.commitRecommendation !== "function") {
        return internalAdapterResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
      }
      commit = await adapter.commitRecommendation({
        input: engineInput.value,
        result: safeResult.result,
      }, context);
    } catch {
      return internalAdapterResponse(gateway.correlationId, gateway.corsHeaders);
    }
    const inspectedCommit = inspectRecommendationCommit(commit);
    if (inspectedCommit.kind === "invalid") {
      return internalAdapterResponse(gateway.correlationId, gateway.corsHeaders, "ADAPTER_INVALID");
    }
    if (inspectedCommit.kind === "failure") {
      return adapterFailureResponse(inspectedCommit.error, gateway.correlationId, gateway.corsHeaders);
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
