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
const AUTHORIZATION_PATTERN = /^Bearer ([^\s]+)$/i;
const SENSITIVE_KEY_PATTERN = /(?:authorization|token|secret|password|signature|cookie|credential|api[-_]?key|payload|body|email|phone|address|name)/i;
const MAX_LOG_STRING_LENGTH = 240;
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

  let bytes: ArrayBuffer;
  try {
    bytes = await request.arrayBuffer();
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
  if (bytes.byteLength > maxBodyBytes) {
    return {
      ok: false,
      response: errorResponse(
        { code: "BODY_TOO_LARGE", messageKey: "gateway.body_too_large", retryable: false, status: 413 },
        options.correlationId,
        headers,
      ),
    };
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

function redactLogValue(key: string, value: unknown, depth: number): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return "[REDACTED]";
  if (depth > 3) return "[TRUNCATED]";
  if (typeof value === "string") {
    return value.length > MAX_LOG_STRING_LENGTH
      ? `${value.slice(0, MAX_LOG_STRING_LENGTH)}…[TRUNCATED]`
      : value;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redactLogValue("item", item, depth + 1));
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      result[childKey] = redactLogValue(childKey, childValue, depth + 1);
    }
    return result;
  }
  return "[UNSUPPORTED]";
}

/** Log only bounded, redacted metadata; never log request bodies or secrets. */
export function safeLog(
  sink: (entry: Record<string, unknown>) => void,
  fields: Record<string, unknown>,
): void {
  try {
    const safe = redactLogValue("root", fields, 0);
    if (typeof safe === "object" && safe !== null && !Array.isArray(safe)) {
      sink(safe as Record<string, unknown>);
    }
  } catch {
    // Logging is best effort and must never alter an Edge response.
  }
}
