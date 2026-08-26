/**
 * Contract-only HTTP handler for personalized itinerary recommendations.
 *
 * This is intentionally not a Supabase function entrypoint. The adapter is
 * the only place allowed to bind guest capability, Turnstile, snapshots, and
 * database access. The handler delegates scheduling and all totals/time/hour
 * constraints to the existing authoritative domain engine, and returns an
 * advisory proposal only; it never creates a plan, booking, quote, or payment.
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
import type { Ranker } from "@/lib/application/itinerary/ranking-port";

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/;
const TOKEN_MAX_LENGTH = 4096;

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
    turnstileToken: capabilityTokenSchema,
    guestToken: capabilityTokenSchema.optional(),
  })
  .strict();

export type RecommendItineraryBody = z.infer<typeof recommendItineraryBodySchema>;

export interface RecommendationAdapterContext {
  /** Internal request correlation for RPC/audit wiring; not caller-controlled. */
  correlationId: string;
  /** A validated Bearer token, or null for an anonymous public request. */
  accessToken: string | null;
  /** An opaque guest capability; the adapter must hash/verify it server-side. */
  guestToken: string | null;
  /** An opaque Turnstile token; the adapter must verify action and hostname. */
  turnstileToken: string;
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

export type RecommendationAdapterResolution =
  | { ok: true; input: unknown }
  | { ok: false; error: RecommendationAdapterFailure };

/**
 * Injectable server-side boundary. `input` is deliberately unknown at this
 * boundary: the handler parses and compares it before allowing the engine to
 * use any catalog/travel/FX snapshot or place ID.
 */
export interface RecommendItineraryAdapter {
  resolveEngineInput: (
    input: ItineraryRequest,
    context: RecommendationAdapterContext,
  ) => Promise<RecommendationAdapterResolution>;
  ranker?: Ranker;
}

export interface RecommendItineraryHandlerOptions {
  policy: GatewayPolicy;
  correlationIdFactory?: () => string;
}

export interface RecommendItineraryResponse {
  advisoryOnly: true;
  degraded: boolean;
  messageKey?: Recommendation["messageKey"];
  proposal: ItineraryResult;
  rationales: Record<string, string>;
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

function sameRequest(left: ItineraryRequest, right: ItineraryRequest): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
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

function safeRecommendationResponse(
  value: Recommendation,
  correlationId: string,
  corsHeaders: HeadersInit,
): Response {
  const parsed = itineraryResultSchema.safeParse(value.result);
  if (!parsed.success) return internalAdapterResponse(correlationId, corsHeaders, "ADAPTER_INVALID");

  const responseBody: RecommendItineraryResponse = {
    advisoryOnly: true,
    degraded: value.degraded,
    ...(value.messageKey ? { messageKey: value.messageKey } : {}),
    proposal: parsed.data,
    rationales: { ...value.rationales },
  };
  return jsonResponse(
    responseBody,
    { correlationId, corsHeaders },
  );
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

    let accessToken: string | null = null;
    if (request.headers.get("Authorization") !== null) {
      const auth = requireBearerToken(request, gateway.correlationId, gateway.corsHeaders);
      if (!auth.ok) return auth.response;
      accessToken = auth.token;
    }

    let resolution: RecommendationAdapterResolution;
    try {
      if (typeof adapter?.resolveEngineInput !== "function") {
        return internalAdapterResponse(gateway.correlationId, gateway.corsHeaders);
      }
      resolution = await adapter.resolveEngineInput(parsedBody.data.input, {
        correlationId: gateway.correlationId,
        accessToken,
        guestToken: parsedBody.data.guestToken ?? null,
        turnstileToken: parsedBody.data.turnstileToken,
      });
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
    if (!sameRequest(engineInput.value.request, parsedBody.data.input)) {
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
    return safeRecommendationResponse(recommendation.value, gateway.correlationId, gateway.corsHeaders);
  };
}

/** Keep the exact engine input shape visible to adapter implementers. */
export type AuthoritativeRecommendationInput = EngineInput;
export type AuthoritativeRecommendationResult = ItineraryResult;
