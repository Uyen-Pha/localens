// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { itineraryFixture } from "@/tests/fixtures/itinerary/catalog.v1";
import {
  createRefineItineraryHandler,
  type RefineItineraryAdapter,
} from "@/supabase/functions/_shared/refine-itinerary";

const correlationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const planId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const policy = {
  allowedOrigins: ["http://localhost:3000"],
  allowedMethods: ["POST", "OPTIONS"] as const,
};

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://functions.example/refine-itinerary", {
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
    planId,
    baseRevision: 3,
    delta: { feedback: "More history, please", scope: "partial" },
    lockedItemIds: [itemId],
    ...overrides,
  };
}

function adapter(overrides: Partial<RefineItineraryAdapter> = {}): RefineItineraryAdapter {
  return {
    verifyAccessToken: vi.fn(async () => ({
      ok: true as const,
      principal: { userId: "user-1" },
    })),
    verifyGuestCapability: vi.fn(async () => ({
      ok: true as const,
      capability: { planId },
    })),
    prepareRefinement: vi.fn(async () => ({
      ok: true as const,
      planId,
      currentRevision: 3,
      input: itineraryFixture,
    })),
    commitRefinement: vi.fn(async () => ({
      ok: true as const,
      revision: 4,
    })),
    ...overrides,
  };
}

describe("refine-itinerary Edge handler contract", () => {
  it("verifies a guest capability, performs CAS commit, and returns advisory output", async () => {
    const service = adapter();
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({ guestToken: "guest-token-123456" })));
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
    expect(response.headers.get("X-Correlation-Id")).toBe(correlationId);

    const body = await response.json();
    expect(body).toMatchObject({
      advisoryOnly: true,
      planId,
      baseRevision: 3,
      revision: 4,
      regeneration: "partial",
      proposal: { rankingSource: "deterministic" },
    });
    expect(body).not.toHaveProperty("bookingId");
    expect(body).not.toHaveProperty("payment");
    expect(service.verifyGuestCapability).toHaveBeenCalledWith(planId, "guest-token-123456", correlationId);
    expect(service.prepareRefinement).toHaveBeenCalledWith(
      {
        planId,
        baseRevision: 3,
        delta: { feedback: "More history, please", scope: "partial" },
        lockedItemIds: [itemId],
      },
      {
        correlationId,
        principal: null,
        guestCapability: { planId },
      },
    );
    expect(service.commitRefinement).toHaveBeenCalledWith(
      {
        planId,
        baseRevision: 3,
        lockedItemIds: [itemId],
        scope: "partial",
        result: expect.objectContaining({ rankingSource: "deterministic" }),
      },
      {
        correlationId,
        principal: null,
        guestCapability: { planId },
      },
    );
  });

  it("verifies an owner Bearer token before plan loading and never passes the raw token", async () => {
    const service = adapter();
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody(), { Authorization: "Bearer owner-token-123" }));

    expect(response.status).toBe(200);
    expect(service.verifyAccessToken).toHaveBeenCalledWith("owner-token-123", correlationId);
    expect(service.verifyGuestCapability).not.toHaveBeenCalled();
    expect(service.prepareRefinement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ principal: { userId: "user-1" }, guestCapability: null }),
    );
    expect(service.prepareRefinement).toHaveBeenCalledWith(
      expect.not.objectContaining({ accessToken: "owner-token-123", parsedAccessToken: "owner-token-123" }),
      expect.anything(),
    );
  });

  it("requires a verified owner or guest capability before loading a plan", async () => {
    const service = adapter();
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody()));

    expect(response.status).toBe(401);
    expect(service.verifyAccessToken).not.toHaveBeenCalled();
    expect(service.verifyGuestCapability).not.toHaveBeenCalled();
    expect(service.prepareRefinement).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      code: "AUTH_REQUIRED",
      messageKey: "refinement.auth_required",
      retryable: false,
      correlationId,
    });
  });

  it("rejects a malformed or extra-field refinement body before auth and adapter calls", async () => {
    const service = adapter();
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({
      baseRevision: 0,
      extra: "nope",
    }), { Authorization: "Bearer owner-token-123" }));

    expect(response.status).toBe(400);
    expect(service.verifyAccessToken).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_REQUEST",
      messageKey: "gateway.invalid_request",
      retryable: false,
      correlationId,
      fieldErrors: { baseRevision: "gateway.invalid_request" },
    });
  });

  it("returns 409 STALE_REVISION from a prepare CAS mismatch without committing", async () => {
    const service = adapter({
      prepareRefinement: vi.fn(async () => ({
        ok: false as const,
        error: { code: "STALE_REVISION" as const },
      })),
    });
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({ guestToken: "guest-token-123456" })));

    expect(response.status).toBe(409);
    expect(service.commitRefinement).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      code: "STALE_REVISION",
      messageKey: "refinement.stale_revision",
      retryable: true,
      correlationId,
    });
  });

  it("returns 409 STALE_REVISION from commit CAS and never reports a new revision", async () => {
    const service = adapter({
      commitRefinement: vi.fn(async () => ({
        ok: false as const,
        error: { code: "STALE_REVISION" as const },
      })),
    });
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({ guestToken: "guest-token-123456" })));

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("STALE_REVISION");
    expect(body).not.toHaveProperty("revision");
  });

  it("rejects a commit response that skips the single CAS revision", async () => {
    const service = adapter({
      commitRefinement: vi.fn(async () => ({ ok: true as const, revision: 9 })),
    });
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({ guestToken: "guest-token-123456" })));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      code: "ADAPTER_INVALID",
      retryable: false,
      correlationId,
    });
  });

  it("falls back to deterministic ranking when an AI ranker returns an unknown ID", async () => {
    const service = adapter({
      prepareRefinement: vi.fn(async () => ({
        ok: true as const,
        planId,
        currentRevision: 3,
        input: itineraryFixture,
        ranker: vi.fn(async () => ({
          orderedIds: ["forged-place-id"],
          rationales: { "forged-place-id": "malicious" },
        })),
      })),
    });
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({ guestToken: "guest-token-123456" })));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.proposal.rankingSource).toBe("deterministic");
    expect(JSON.stringify(body)).not.toContain("forged-place-id");
  });

  it("rejects an adapter snapshot that cannot be parsed as an authoritative engine input", async () => {
    const handler = createRefineItineraryHandler(adapter({
      prepareRefinement: vi.fn(async () => ({
        ok: true as const,
        planId,
        currentRevision: 3,
        input: { forged: true },
      })),
    }), {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({ guestToken: "guest-token-123456" })));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      code: "ADAPTER_INVALID",
      retryable: false,
      correlationId,
    });
  });
});
