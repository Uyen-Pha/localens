// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { itineraryFixture } from "@/tests/fixtures/itinerary/catalog.v1";
import {
  createRecommendItineraryHandler,
  type RecommendItineraryAdapter,
} from "@/supabase/functions/_shared/recommend-itinerary";

const correlationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const policy = {
  allowedOrigins: ["http://localhost:3000"],
  allowedMethods: ["POST", "OPTIONS"] as const,
};

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://functions.example/recommend-itinerary", {
    method: "POST",
    headers: {
      Origin: "http://localhost:3000",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    input: itineraryFixture.request,
    turnstileToken: "turnstile-token-123456",
    ...overrides,
  };
}

function adapter(overrides: Partial<RecommendItineraryAdapter> = {}): RecommendItineraryAdapter {
  return {
    resolveEngineInput: vi.fn(async () => ({ ok: true as const, input: itineraryFixture })),
    ...overrides,
  };
}

describe("recommend-itinerary Edge handler contract", () => {
  it("runs the gateway, adapter, and authoritative engine for a valid request", async () => {
    const service = adapter();
    const handler = createRecommendItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody()));

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
    expect(response.headers.get("X-Correlation-Id")).toBe(correlationId);
    const body = await response.json();
    expect(body).toMatchObject({
      advisoryOnly: true,
      degraded: true,
      proposal: {
        rankingSource: "deterministic",
        budgetVnd: 2_000_000,
      },
    });
    expect(body.proposal.totals.groupCostVnd).toBeLessThanOrEqual(body.proposal.budgetVnd);
    expect(body).not.toHaveProperty("bookingId");
    expect(service.resolveEngineInput).toHaveBeenCalledWith(
      itineraryFixture.request,
      {
        correlationId,
        accessToken: null,
        guestToken: null,
        turnstileToken: "turnstile-token-123456",
      },
    );
  });

  it("accepts an optional valid Bearer token and never forwards an invalid one", async () => {
    const service = adapter();
    const handler = createRecommendItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({ guestToken: "guest-token-123456" }), {
      Authorization: "Bearer user-token-123",
    }));

    expect(response.status).toBe(200);
    expect(service.resolveEngineInput).toHaveBeenCalledWith(
      itineraryFixture.request,
      {
        correlationId,
        accessToken: "user-token-123",
        guestToken: "guest-token-123456",
        turnstileToken: "turnstile-token-123456",
      },
    );

    const invalidAuth = await handler(request(validBody(), { Authorization: "Basic secret" }));
    expect(invalidAuth.status).toBe(401);
    expect(service.resolveEngineInput).toHaveBeenCalledTimes(1);
    await expect(invalidAuth.json()).resolves.toMatchObject({
      code: "INVALID_AUTHORIZATION",
      correlationId,
      retryable: false,
    });
  });

  it("rejects malformed endpoint input before the adapter and returns field errors", async () => {
    const service = adapter();
    const handler = createRecommendItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({
      unknown: true,
      turnstileToken: "",
    })));

    expect(response.status).toBe(400);
    expect(service.resolveEngineInput).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_REQUEST",
      messageKey: "gateway.invalid_request",
      retryable: false,
      correlationId,
      fieldErrors: {
        turnstileToken: "gateway.invalid_request",
      },
    });
  });

  it("rejects a service snapshot whose request differs from the customer request", async () => {
    const mismatched = {
      ...itineraryFixture,
      request: { ...itineraryFixture.request, areas: ["district-forged"] },
    };
    const handler = createRecommendItineraryHandler(adapter({
      resolveEngineInput: vi.fn(async () => ({ ok: true as const, input: mismatched })),
    }), {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody()));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      code: "ADAPTER_SNAPSHOT_MISMATCH",
      messageKey: "recommendation.adapter_snapshot_mismatch",
      retryable: false,
      correlationId,
    });
  });

  it("maps an adapter failure without leaking its internal detail", async () => {
    const handler = createRecommendItineraryHandler(adapter({
      resolveEngineInput: vi.fn(async () => ({ ok: false as const, error: { code: "CATALOG_UNAVAILABLE" as const } })),
    }), {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody()));

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({
      code: "CATALOG_UNAVAILABLE",
      messageKey: "recommendation.catalog_unavailable",
      retryable: true,
      correlationId,
    });
    expect(JSON.stringify(body)).not.toContain("CATALOG_UNAVAILABLE_INTERNAL");
  });

  it("fails closed when an adapter throws or returns an extra response field", async () => {
    const throwing = createRecommendItineraryHandler(adapter({
      resolveEngineInput: vi.fn(async () => {
        throw new Error("private database detail");
      }),
    }), { policy, correlationIdFactory: () => correlationId });
    const thrownResponse = await throwing(request(validBody()));
    await expect(thrownResponse.json()).resolves.toMatchObject({
      code: "ADAPTER_UNAVAILABLE",
      messageKey: "recommendation.adapter_unavailable",
      retryable: true,
      correlationId,
    });

    const extraField = createRecommendItineraryHandler(adapter({
      resolveEngineInput: vi.fn(async () => ({
        ok: true as const,
        input: itineraryFixture,
        internal: "must not cross boundary",
      })),
    }), { policy, correlationIdFactory: () => correlationId });
    const extraResponse = await extraField(request(validBody()));
    expect(extraResponse.status).toBe(500);
    const extraBody = await extraResponse.json();
    expect(extraBody.code).toBe("ADAPTER_INVALID");
    expect(JSON.stringify(extraBody)).not.toContain("must not cross boundary");
  });

  it("degrades to deterministic output when a ranker returns an ID outside the adapter catalog", async () => {
    const service = adapter({
      ranker: vi.fn(async () => ({
        orderedIds: ["forged-place-id"],
        rationales: { "forged-place-id": "malicious" },
      })),
    });
    const handler = createRecommendItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      advisoryOnly: true,
      degraded: true,
      proposal: { rankingSource: "deterministic" },
    });
    expect(JSON.stringify(body)).not.toContain("forged-place-id");
  });

  it("never turns a no-feasible itinerary into a successful proposal", async () => {
    const impossible = {
      ...itineraryFixture,
      request: { ...itineraryFixture.request, budget: { currency: "VND" as const, amountMinor: 0 } },
    };
    const handler = createRecommendItineraryHandler(adapter({
      resolveEngineInput: vi.fn(async () => ({ ok: true as const, input: impossible })),
    }), {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request({
      ...validBody(),
      input: impossible.request,
    }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "NO_FEASIBLE_ITINERARY",
      retryable: false,
      correlationId,
    });
  });
});
