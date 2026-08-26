/**
 * Small Web Platform-only boundary shared by LocalLens Edge Functions.
 *
 * This module deliberately does not create a Supabase client or call an RPC.
 * Public RPCs and Edge-only internal operations need separate adapters and
 * credentials; that boundary is intentionally left for a later migration.
 */

export const DEFAULT_EDGE_BODY_LIMIT = 64 * 1024;
const DEFAULT_ALLOWED_METHODS = ["POST", "OPTIONS"] as const;
const ALLOWED_CORS_HEADERS = "authorization, content-type, x-correlation-id";
const ALLOWED_CORS_HEADER_NAMES = new Set(ALLOWED_CORS_HEADERS.split(",").map((header) => header.trim()));
const CORRELATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/;
const AUTHORIZATION_PATTERN = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/i;
const SENSITIVE_KEY_PATTERN = /(?:authorization|access[-_]?token|refresh[-_]?token|id[-_]?token|token|secret|password|signature|cookie|credential|api[-_]?key|private[-_]?key|payload|body|email|phone|address|name|jwt)/i;
const SENSITIVE_VALUE_PATTERN = /^(?:Bearer\s+\S+|t=\d+(?:,[^,\s=]+=[^,\s]*)+|[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})$/i;
const MAX_LOG_STRING_LENGTH = 240;
const MAX_LOG_KEY_LENGTH = 120;
const MAX_LOG_DEPTH = 3;
const MAX_LOG_OBJECT_ENTRIES = 40;
const MAX_LOG_ARRAY_ENTRIES = 20;
export const MAX_LOG_ENTRIES = 128;
export const MAX_LOG_BYTES = 8 * 1024;
let fallbackCorrelationCounter = 0;

export interface GatewayPolicy {
  allowedOrigins: readonly string[];
  allowedMethods?: readonly string[];
  maxBodyBytes?: number;
}

export interface GatewayContext {
  correlationId: string;
  origin: string | null;
  corsHeaders: Headers;
}

export interface GatewayErrorInput {
  code: string;
  messageKey: string;
  fieldErrors?: Record<string, string>;
  retryable: boolean;
  status?: number;
}

export interface GatewayErrorEnvelope {
  code: string;
  messageKey: string;
  fieldErrors?: Record<string, string>;
  retryable: boolean;
  correlationId: string;
}

export type GatewayGuardResult =
  | ({ ok: true } & GatewayContext)
  | { ok: false; correlationId: string; response: Response };

export type JsonBodyResult<T> =
  | { ok: true; value: T }
  | { ok: false; response: Response };

export type BearerTokenResult =
  | { ok: true; token: string }
  | { ok: false; code: "MISSING_AUTHORIZATION" | "INVALID_AUTHORIZATION" };

export type AuthBoundaryResult =
  | { ok: true; token: string }
  | { ok: false; response: Response };

function isCorrelationId(value: string): boolean {
  return CORRELATION_ID_PATTERN.test(value);
}

function fallbackCorrelationId(): string {
  fallbackCorrelationCounter = (fallbackCorrelationCounter + 1) >>> 0;
  const time = Date.now().toString(16).padStart(12, "0").slice(-12);
  const counter = fallbackCorrelationCounter.toString(16).padStart(8, "0");
  return `00000000-0000-4000-8000-${time.slice(-8)}${counter.slice(-4)}`;
}

/** Generate an internal correlation ID; caller-provided headers are ignored. */
export function createCorrelationId(factory?: () => string): string {
  try {
    const candidate = factory?.();
    if (candidate !== undefined && isCorrelationId(candidate)) return candidate;
  } catch {
    // Observability metadata must never fail the request.
  }

  try {
    const candidate = globalThis.crypto?.randomUUID?.();
    if (candidate !== undefined && isCorrelationId(candidate)) return candidate;
  } catch {
    // Fall back to process-local entropy in runtimes without Web Crypto.
  }

  return fallbackCorrelationId();
}

function normalizedOrigin(value: string): string | null {
  if (value.length > 2048 || CONTROL_CHARACTER_PATTERN.test(value)) return null;
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function allowedOrigin(request: Request, policy: GatewayPolicy): string | null {
  const requestOrigin = request.headers.get("Origin");
  if (requestOrigin === null) return null;
  const normalizedRequestOrigin = normalizedOrigin(requestOrigin);
  if (normalizedRequestOrigin === null) return "";
  const allowlist = policy.allowedOrigins
    .map(normalizedOrigin)
    .filter((value): value is string => value !== null);
  return allowlist.includes(normalizedRequestOrigin) ? normalizedRequestOrigin : "";
}

function corsHeaders(origin: string | null): Headers {
  const headers = new Headers();
  if (origin !== null) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Headers", ALLOWED_CORS_HEADERS);
    headers.set("Vary", "Origin, Access-Control-Request-Method, Access-Control-Request-Headers");
  }
  return headers;
}

function policyMethods(policy: GatewayPolicy): string[] {
  const methods = policy.allowedMethods ?? DEFAULT_ALLOWED_METHODS;
  return [...new Set(methods.map((method) => method.toUpperCase()))];
}

function requestContentTypeIsJson(request: Request): boolean {
  const value = request.headers.get("Content-Type");
  if (value === null) return false;
  return value.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

function requestedCorsHeadersAllowed(value: string | null): boolean {
  if (value === null) return true;
  const requestedHeaders = value.split(",").map((header) => header.trim().toLowerCase());
  return requestedHeaders.length > 0
    && requestedHeaders.every((header) => header.length > 0 && !CONTROL_CHARACTER_PATTERN.test(header)
      && ALLOWED_CORS_HEADER_NAMES.has(header));
}

function declaredBodySize(request: Request): number | null {
  const value = request.headers.get("Content-Length");
  if (value === null) return null;
  if (!/^[0-9]+$/.test(value)) return Number.POSITIVE_INFINITY;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function validBodyLimit(value: number | undefined): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0
    ? value
    : DEFAULT_EDGE_BODY_LIMIT;
}

function methodError(correlationId: string, methods: readonly string[], status: number): Response {
  const response = errorResponse(
    {
      code: "METHOD_NOT_ALLOWED",
      messageKey: "gateway.method_not_allowed",
      retryable: false,
      status,
    },
    correlationId,
  );
  response.headers.set("Allow", methods.join(", "));
  return response;
}

/**
 * Validate CORS, method, preflight and request headers before application code.
 * A successful result carries only normalized, non-secret request metadata.
 */
export function guardRequest(
  request: Request,
  policy: GatewayPolicy,
  correlationIdFactory?: () => string,
): GatewayGuardResult {
  const correlationId = createCorrelationId(correlationIdFactory);
  const origin = allowedOrigin(request, policy);
  if (origin === "") {
    return {
      ok: false,
      correlationId,
      response: errorResponse(
        {
          code: "CORS_ORIGIN_NOT_ALLOWED",
          messageKey: "gateway.cors_origin_not_allowed",
          retryable: false,
          status: 403,
        },
        correlationId,
      ),
    };
  }

  const methods = policyMethods(policy);
  const method = request.method.toUpperCase();
  const headers = corsHeaders(origin);
  headers.set("Access-Control-Allow-Methods", methods.join(", "));

  if (method === "OPTIONS") {
    const requestedMethod = request.headers.get("Access-Control-Request-Method")?.toUpperCase();
    if (requestedMethod !== undefined && requestedMethod !== null && !methods.includes(requestedMethod)) {
      return { ok: false, correlationId, response: methodError(correlationId, methods, 405) };
    }
    if (!requestedCorsHeadersAllowed(request.headers.get("Access-Control-Request-Headers"))) {
      return {
        ok: false,
        correlationId,
        response: errorResponse(
          {
            code: "CORS_HEADERS_NOT_ALLOWED",
            messageKey: "gateway.cors_headers_not_allowed",
            retryable: false,
            status: 403,
          },
          correlationId,
          headers,
        ),
      };
    }
    return {
      ok: false,
      correlationId,
      response: new Response(null, { status: 204, headers }),
    };
  }

  if (!methods.includes(method)) {
    const response = methodError(correlationId, methods, 405);
    for (const [key, value] of headers) response.headers.set(key, value);
    return { ok: false, correlationId, response };
  }

  const maxBodyBytes = validBodyLimit(policy.maxBodyBytes);
  const size = declaredBodySize(request);
  if (size !== null && size > maxBodyBytes) {
    const response = errorResponse(
      {
        code: "BODY_TOO_LARGE",
        messageKey: "gateway.body_too_large",
        retryable: false,
        status: 413,
      },
      correlationId,
      headers,
    );
    return { ok: false, correlationId, response };
  }

  if (!requestContentTypeIsJson(request)) {
    const response = errorResponse(
      {
        code: "UNSUPPORTED_MEDIA_TYPE",
        messageKey: "gateway.content_type_invalid",
        retryable: false,
        status: 415,
      },
      correlationId,
      headers,
    );
    return { ok: false, correlationId, response };
  }

  return { ok: true, correlationId, origin, corsHeaders: headers };
}

/** Read and parse JSON while enforcing the actual UTF-8 byte size. */
export async function readJsonBody<T = unknown>(
  request: Request,
  options: { maxBodyBytes?: number; correlationId: string; corsHeaders?: HeadersInit },
): Promise<JsonBodyResult<T>> {
  const maxBodyBytes = validBodyLimit(options.maxBodyBytes);
  const size = declaredBodySize(request);
  const headers = new Headers(options.corsHeaders);
  if (size !== null && size > maxBodyBytes) {
    return {
      ok: false,
      response: errorResponse(
        { code: "BODY_TOO_LARGE", messageKey: "gateway.body_too_large", retryable: false, status: 413 },
        options.correlationId,
        headers,
      ),
    };
  }

  const body = request.body;
  if (body === null) {
    return {
      ok: false,
      response: errorResponse(
        { code: "INVALID_BODY", messageKey: "gateway.body_invalid", retryable: false, status: 400 },
        options.correlationId,
        headers,
      ),
    };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      const chunk = result.value;
      if (chunk === undefined) continue;
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBodyBytes) {
        try {
          await reader.cancel("body too large");
        } catch {
          // The request is already rejected; cancellation is best effort.
        }
        return {
          ok: false,
          response: errorResponse(
            { code: "BODY_TOO_LARGE", messageKey: "gateway.body_too_large", retryable: false, status: 413 },
            options.correlationId,
            headers,
          ),
        };
      }
      chunks.push(chunk);
    }
  } catch {
    return {
      ok: false,
      response: errorResponse(
        { code: "INVALID_BODY", messageKey: "gateway.body_invalid", retryable: false, status: 400 },
        options.correlationId,
        headers,
      ),
    };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return {
      ok: false,
      response: errorResponse(
        { code: "INVALID_BODY", messageKey: "gateway.body_invalid", retryable: false, status: 400 },
        options.correlationId,
        headers,
      ),
    };
  }
  if (text.trim().length === 0) {
    return {
      ok: false,
      response: errorResponse(
        { code: "INVALID_BODY", messageKey: "gateway.body_invalid", retryable: false, status: 400 },
        options.correlationId,
        headers,
      ),
    };
  }

  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return {
      ok: false,
      response: errorResponse(
        { code: "INVALID_BODY", messageKey: "gateway.body_invalid", retryable: false, status: 400 },
        options.correlationId,
        headers,
      ),
    };
  }
}

export function parseBearerToken(value: string | null | undefined): BearerTokenResult {
  if (value === null || value === undefined || value.length === 0) {
    return { ok: false, code: "MISSING_AUTHORIZATION" };
  }
  if (CONTROL_CHARACTER_PATTERN.test(value)) return { ok: false, code: "INVALID_AUTHORIZATION" };
  const match = value.match(AUTHORIZATION_PATTERN);
  if (match === null || match[1] === undefined || match[1].length > 4096) {
    return { ok: false, code: "INVALID_AUTHORIZATION" };
  }
  return { ok: true, token: match[1] };
}

/** Convert auth parsing failures into the same public error envelope. */
export function requireBearerToken(
  request: Request,
  correlationId: string,
  corsHeaders?: HeadersInit,
): AuthBoundaryResult {
  const parsed = parseBearerToken(request.headers.get("Authorization"));
  if (parsed.ok) return parsed;
  const response = errorResponse(
    {
      code: parsed.code,
      messageKey: parsed.code === "MISSING_AUTHORIZATION"
        ? "gateway.authorization_required"
        : "gateway.authorization_invalid",
      retryable: false,
      status: 401,
    },
    correlationId,
    corsHeaders,
  );
  response.headers.set("WWW-Authenticate", "Bearer");
  return { ok: false, response };
}

export function jsonResponse<T>(
  body: T,
  options: { status?: number; correlationId?: string; corsHeaders?: HeadersInit } = {},
): Response {
  const headers = new Headers(options.corsHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  if (options.correlationId !== undefined) headers.set("X-Correlation-Id", options.correlationId);
  return new Response(JSON.stringify(body), { status: options.status ?? 200, headers });
}

export function errorResponse(
  error: GatewayErrorInput,
  correlationId: string,
  corsHeaders?: HeadersInit,
): Response {
  const envelope: GatewayErrorEnvelope = {
    code: error.code,
    messageKey: error.messageKey,
    ...(error.fieldErrors !== undefined ? { fieldErrors: error.fieldErrors } : {}),
    retryable: error.retryable,
    correlationId,
  };
  return jsonResponse(envelope, {
    status: error.status ?? 500,
    correlationId,
    corsHeaders,
  });
}

interface LogBudget {
  entries: number;
  bytes: number;
  truncated: boolean;
}

function encodedByteLength(value: string): number {
  try {
    return new TextEncoder().encode(value).byteLength;
  } catch {
    return value.length;
  }
}

function serializedByteLength(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? 0 : encodedByteLength(serialized);
  } catch {
    return encodedByteLength("[UNSUPPORTED]");
  }
}

function reserveLogBudget(budget: LogBudget, bytes: number, entries: number): boolean {
  if (budget.entries + entries > MAX_LOG_ENTRIES || budget.bytes + bytes > MAX_LOG_BYTES) {
    budget.truncated = true;
    return false;
  }
  budget.entries += entries;
  budget.bytes += bytes;
  return true;
}

function redactedLogScalar(value: unknown, budget: LogBudget): unknown {
  if (!reserveLogBudget(budget, serializedByteLength(value), 0)) return undefined;
  return value;
}

function redactLogValue(key: string, value: unknown, depth: number, budget: LogBudget): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return redactedLogScalar("[REDACTED]", budget);
  if (depth > MAX_LOG_DEPTH) return redactedLogScalar("[TRUNCATED]", budget);

  if (typeof value === "string") {
    if (SENSITIVE_VALUE_PATTERN.test(value)) return redactedLogScalar("[REDACTED]", budget);
    const bounded = value.length > MAX_LOG_STRING_LENGTH
      ? `${value.slice(0, MAX_LOG_STRING_LENGTH)}…[TRUNCATED]`
      : value;
    return redactedLogScalar(bounded, budget);
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return redactedLogScalar(value, budget);
  }
  if (Array.isArray(value)) {
    if (!reserveLogBudget(budget, 2, 0)) return undefined;
    const result: unknown[] = [];
    for (const item of value.slice(0, MAX_LOG_ARRAY_ENTRIES)) {
      const safeItem = redactLogValue("item", item, depth + 1, budget);
      if (safeItem === undefined || !reserveLogBudget(budget, 1, 1)) break;
      result.push(safeItem);
    }
    return result;
  }
  if (typeof value === "object") {
    if (!reserveLogBudget(budget, 2, 0)) return undefined;
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>).slice(0, MAX_LOG_OBJECT_ENTRIES)) {
      const safeValue = redactLogValue(childKey, childValue, depth + 1, budget);
      if (safeValue === undefined) break;
      const boundedKey = childKey.length > MAX_LOG_KEY_LENGTH
        ? `${childKey.slice(0, MAX_LOG_KEY_LENGTH)}…[TRUNCATED]`
        : childKey;
      const propertyBytes = serializedByteLength(boundedKey) + 2;
      if (!reserveLogBudget(budget, propertyBytes, 1)) break;
      result[boundedKey] = safeValue;
    }
    return result;
  }
  return redactedLogScalar("[UNSUPPORTED]", budget);
}

/** Log bounded, redacted metadata; arbitrary opaque secrets under unknown keys cannot be detected. */
export function safeLog(
  sink: (entry: Record<string, unknown>) => void,
  fields: Record<string, unknown>,
): void {
  try {
    const budget: LogBudget = { entries: 0, bytes: 0, truncated: false };
    const safe = redactLogValue("root", fields, 0, budget);
    if (typeof safe === "object" && safe !== null && !Array.isArray(safe)) {
      const markerBytes = serializedByteLength("__logTruncated") + serializedByteLength(true) + 2;
      if (budget.truncated && reserveLogBudget(budget, markerBytes, 1)) {
        (safe as Record<string, unknown>).__logTruncated = true;
      }
      sink(safe as Record<string, unknown>);
    }
  } catch {
    // Logging is best effort and must never alter an Edge response.
  }
}
