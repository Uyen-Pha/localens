// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_EDGE_BODY_LIMIT,
  type GatewayPolicy,
  createCorrelationId,
  errorResponse,
  guardRequest,
  jsonResponse,
  parseBearerToken,
  requireBearerToken,
  readJsonBody,
  safeLog,
} from "@/supabase/functions/_shared/gateway";

const policy: GatewayPolicy = {
  allowedOrigins: ["https://locallens.example", "http://localhost:3000"],
  allowedMethods: ["POST", "OPTIONS"],
};

describe("Edge gateway contract", () => {
  it("creates a canonical correlation ID without trusting caller input", () => {
    expect(createCorrelationId(() => "11111111-1111-4111-8111-111111111111"))
      .toBe("11111111-1111-4111-8111-111111111111");
  });

  it("keeps fallback correlation IDs unique when crypto is unavailable", () => {
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    vi.stubGlobal("crypto", { randomUUID: () => { throw new Error("crypto unavailable"); } });

    try {
      const first = createCorrelationId();
      const second = createCorrelationId();

      expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(second).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(second).not.toBe(first);
    } finally {
      dateNow.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("accepts an allowlisted JSON POST and emits CORS headers", () => {
    const result = guardRequest(
      new Request("https://functions.example/recommend", {
        method: "POST",
        headers: {
          Origin: "https://locallens.example",
          "Content-Type": "application/json; charset=utf-8",
        },
        body: "{}",
      }),
      policy,
      () => "22222222-2222-4222-8222-222222222222",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.correlationId).toBe("22222222-2222-4222-8222-222222222222");
      expect(result.corsHeaders.get("Access-Control-Allow-Origin")).toBe("https://locallens.example");
    }
  });

  it("rejects a disallowed origin before application code runs", () => {
    const result = guardRequest(
      new Request("https://functions.example/recommend", {
        method: "POST",
        headers: {
          Origin: "https://evil.example",
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
      policy,
      () => "33333333-3333-4333-8333-333333333333",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect(result.response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }
  });

  it("handles an allowlisted preflight without exposing credentials", () => {
    const result = guardRequest(
      new Request("https://functions.example/recommend", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:3000",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "authorization, content-type",
        },
      }),
      policy,
      () => "44444444-4444-4444-8444-444444444444",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(204);
      expect(result.response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
      expect(result.response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
      expect(result.response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    }
  });

  it("rejects preflight headers outside the explicit allowlist", () => {
    const result = guardRequest(
      new Request("https://functions.example/recommend", {
        method: "OPTIONS",
        headers: {
          Origin: "https://locallens.example",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "authorization, x-admin-secret",
        },
      }),
      policy,
      () => "44444444-4444-4444-8444-444444444444",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect(result.response.headers.get("Access-Control-Allow-Origin")).toBe("https://locallens.example");
      expect(result.response.headers.get("Access-Control-Allow-Headers")).toBe(
        "authorization, content-type, x-correlation-id",
      );
    }
  });

  it("rejects unsupported methods and non-JSON request bodies", () => {
    const methodResult = guardRequest(
      new Request("https://functions.example/recommend", { method: "GET" }),
      policy,
      () => "55555555-5555-4555-8555-555555555555",
    );
    expect(methodResult.ok).toBe(false);
    if (!methodResult.ok) expect(methodResult.response.status).toBe(405);

    const contentTypeResult = guardRequest(
      new Request("https://functions.example/recommend", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "{}",
      }),
      policy,
      () => "66666666-6666-4666-8666-666666666666",
    );
    expect(contentTypeResult.ok).toBe(false);
    if (!contentTypeResult.ok) expect(contentTypeResult.response.status).toBe(415);
  });

  it("enforces the body limit using both Content-Length and actual bytes", async () => {
    const contentLengthResult = guardRequest(
      new Request("https://functions.example/recommend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(DEFAULT_EDGE_BODY_LIMIT + 1),
        },
      }),
      { ...policy, maxBodyBytes: DEFAULT_EDGE_BODY_LIMIT },
      () => "77777777-7777-4777-8777-777777777777",
    );
    expect(contentLengthResult.ok).toBe(false);
    if (!contentLengthResult.ok) expect(contentLengthResult.response.status).toBe(413);

    const bodyResult = await readJsonBody(
      new Request("https://functions.example/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: "x".repeat(40) }),
      }),
      { maxBodyBytes: 20, correlationId: "88888888-8888-4888-8888-888888888888" },
    );
    expect(bodyResult.ok).toBe(false);
    if (!bodyResult.ok) expect(bodyResult.response.status).toBe(413);

    const parsed = await readJsonBody<{ value: string }>(
      new Request("https://functions.example/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: "ok" }),
      }),
      { maxBodyBytes: 100, correlationId: "88888888-8888-4888-8888-888888888888" },
    );
    expect(parsed).toEqual({ ok: true, value: { value: "ok" } });
  });

  it("parses only a single non-empty Bearer token", () => {
    expect(parseBearerToken("Bearer token-value")).toEqual({ ok: true, token: "token-value" });
    expect(parseBearerToken("bearer token-value")).toEqual({ ok: true, token: "token-value" });
    expect(parseBearerToken("Basic token-value").ok).toBe(false);
    expect(parseBearerToken("Bearer token one").ok).toBe(false);
    expect(parseBearerToken("Bearer").ok).toBe(false);
  });

  it("keeps authentication failures inside the public envelope", async () => {
    const missing = requireBearerToken(
      new Request("https://functions.example/recommend"),
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.response.status).toBe(401);
      expect(missing.response.headers.get("WWW-Authenticate")).toBe("Bearer");
      await expect(missing.response.json()).resolves.toMatchObject({
        code: "MISSING_AUTHORIZATION",
        retryable: false,
        correlationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      });
    }

    const valid = requireBearerToken(
      new Request("https://functions.example/recommend", {
        headers: { Authorization: "Bearer user-jwt" },
      }),
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(valid).toEqual({ ok: true, token: "user-jwt" });
  });

  it("returns the stable error envelope and does not leak internal detail", async () => {
    const response = errorResponse(
      {
        code: "INVALID_REQUEST",
        messageKey: "gateway.invalid_request",
        fieldErrors: { input: "gateway.invalid_request" },
        retryable: false,
        status: 400,
      },
      "99999999-9999-4999-8999-999999999999",
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Type")).toMatch(/^application\/json/);
    await expect(response.json()).resolves.toEqual({
      code: "INVALID_REQUEST",
      messageKey: "gateway.invalid_request",
      fieldErrors: { input: "gateway.invalid_request" },
      retryable: false,
      correlationId: "99999999-9999-4999-8999-999999999999",
    });

    const success = jsonResponse({ ok: true }, { status: 200, correlationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    expect(success.headers.get("Cache-Control")).toBe("no-store");
  });

  it("redacts secrets, credentials, PII and oversized values before logging", () => {
    const sink = vi.fn();
    safeLog(sink, {
      event: "gateway.request",
      correlationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      authorization: "Bearer secret",
      stripeSignature: "t=123,v1=secret",
      email: "guest@example.com",
      nested: { token: "raw-token", safe: "ok" },
      longValue: "x".repeat(500),
    });

    expect(sink).toHaveBeenCalledTimes(1);
    const serialized = JSON.stringify(sink.mock.calls[0]?.[0]);
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("guest@example.com");
    expect(serialized).not.toContain("raw-token");
    expect(serialized).toContain("[REDACTED]");
  });
});
