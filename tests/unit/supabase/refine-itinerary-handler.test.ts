// @vitest-environment node

import { beforeAll, describe, expect, it, vi } from "vitest";

import { itineraryFixture } from "@/tests/fixtures/itinerary/catalog.v1";
import { fingerprintItinerary } from "@/lib/domain/itinerary/fingerprint";
import type { ItineraryResult } from "@/lib/domain/itinerary/contracts";
import {
  createRefineItineraryHandler,
  type RefinementRankRequest,
  type RefineItineraryAdapter,
} from "@/supabase/functions/_shared/refine-itinerary";

const correlationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const planId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const lockedPlaceId = "place-banh-mi";
const previousResult: ItineraryResult = {
  normalizedStartAt: "2026-09-05T08:00:00+07:00",
  budgetVnd: 2_000_000,
  rankingSource: "deterministic",
  items: [{
    placeId: lockedPlaceId,
    startAt: "2026-09-05T09:00:00+07:00",
    endAt: "2026-09-05T09:45:00+07:00",
    visitDurationMinutes: 45,
    travelMinutesBefore: 0,
    transitionBufferMinutesBefore: 0,
    travelCostVndBefore: 0,
    placeCostVnd: 360_000,
    score: 5_001,
  }],
  totals: {
    durationMinutes: 105,
    visitMinutes: 45,
    travelMinutes: 0,
    transitionBufferMinutes: 0,
    groupCostVnd: 360_000,
    score: 5_001,
  },
  snapshotIds: {
    catalog: itineraryFixture.catalog.id,
    travel: itineraryFixture.travel.id,
    fx: null,
  },
};
const previousLockedItem = {
  itemId,
  placeId: lockedPlaceId,
  position: 1,
  startAt: "2026-09-05T09:00:00+07:00",
  endAt: "2026-09-05T09:45:00+07:00",
  visitDurationMinutes: 45,
};
const previousRevision = {
  planId,
  revision: 3,
  fingerprint: "fingerprint-v1",
  catalogSnapshotId: itineraryFixture.catalog.id,
  travelSnapshotId: itineraryFixture.travel.id,
  fxSnapshotId: null,
  authoritativeInput: itineraryFixture,
  authoritativeResult: previousResult,
  items: [{ ...previousResult.items[0], itemId, position: 1 }],
  lockedItems: [previousLockedItem],
};
const policy = {
  allowedOrigins: ["http://localhost:3000"],
  allowedMethods: ["POST", "OPTIONS"] as const,
};

beforeAll(async () => {
  previousRevision.fingerprint = await fingerprintItinerary(
    itineraryFixture,
    previousResult,
    async (bytes) => new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer)),
  );
});

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
      normalizedDelta: { feedback: "More history, please", scope: "partial" as const },
      previousRevision,
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
        normalizedDelta: { feedback: "More history, please", scope: "partial" },
        previousRevision,
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

  it("passes normalized feedback, scope, and authoritative locked place mapping to the ranker", async () => {
    let received: { feedback: string; scope: "partial" | "full"; lockedPlaceIds: string[] } | undefined;
    const service = adapter({
      prepareRefinement: vi.fn(async () => ({
        ok: true as const,
        planId,
        currentRevision: 3,
        input: itineraryFixture,
        normalizedDelta: { feedback: "More history, please", scope: "partial" as const },
        previousRevision,
        ranker: vi.fn(async (rankRequest: RefinementRankRequest) => {
          received = {
            feedback: rankRequest.feedback,
            scope: rankRequest.scope,
            lockedPlaceIds: [...rankRequest.lockedPlaceIds],
          };
          return {
            orderedIds: rankRequest.candidates.map((candidate) => candidate.id),
            rationales: Object.fromEntries(rankRequest.candidates.map((candidate) => [candidate.id, "matched"])),
          };
        }),
      })),
    });
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({ guestToken: "guest-token-123456" })));

    expect(response.status).toBe(200);
    expect(received).toEqual({
      feedback: "More history, please",
      scope: "partial",
      lockedPlaceIds: [lockedPlaceId],
    });
  });

  it("allows unrestricted full regeneration only when no locks are supplied", async () => {
    const fullInput = {
      ...itineraryFixture,
      request: { ...itineraryFixture.request, lockedStopIds: [] },
    };
    let receivedScope: "partial" | "full" | undefined;
    const service = adapter({
      prepareRefinement: vi.fn(async () => ({
        ok: true as const,
        planId,
        currentRevision: 3,
        input: fullInput,
        normalizedDelta: { feedback: "Try a market route", scope: "full" as const },
        previousRevision: { ...previousRevision, lockedItems: [] },
        ranker: vi.fn(async (rankRequest: RefinementRankRequest) => {
          receivedScope = rankRequest.scope;
          return {
            orderedIds: rankRequest.candidates.map((candidate) => candidate.id),
            rationales: Object.fromEntries(rankRequest.candidates.map((candidate) => [candidate.id, "matched"])),
          };
        }),
      })),
    });
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({
      guestToken: "guest-token-123456",
      delta: { feedback: "Try a market route", scope: "full" },
      lockedItemIds: [],
    })));

    expect(response.status).toBe(200);
    expect(receivedScope).toBe("full");
    expect(service.commitRefinement).toHaveBeenCalledWith(
      expect.objectContaining({
        normalizedDelta: { feedback: "Try a market route", scope: "full" },
        previousRevision: expect.objectContaining({ lockedItems: [] }),
      }),
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

  it("maps duplicate locked item IDs to a safe 422 domain error", async () => {
    const service = adapter();
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({
      guestToken: "guest-token-123456",
      lockedItemIds: [itemId, itemId],
    })));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "LOCKED_ITEM_INVALID",
      messageKey: "refinement.locked_item_invalid",
      retryable: false,
      correlationId,
    });
    expect(service.prepareRefinement).not.toHaveBeenCalled();
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
        normalizedDelta: { feedback: "More history, please", scope: "partial" as const },
        previousRevision,
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
        normalizedDelta: { feedback: "More history, please", scope: "partial" as const },
        previousRevision,
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

  it("rejects a canonical locked item that is not owned by the submitted request", async () => {
    const service = adapter({
      prepareRefinement: vi.fn(async () => ({
        ok: true as const,
        planId,
        currentRevision: 3,
        input: itineraryFixture,
        normalizedDelta: { feedback: "More history, please", scope: "partial" as const },
        previousRevision: {
          ...previousRevision,
          lockedItems: [{ ...previousLockedItem, itemId: "33333333-3333-4333-8333-333333333333" }],
        },
      })),
    });
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({ guestToken: "guest-token-123456" })));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "LOCKED_ITEM_INVALID",
      messageKey: "refinement.locked_item_invalid",
      retryable: false,
      correlationId,
    });
    expect(service.commitRefinement).not.toHaveBeenCalled();
  });

  it.each([
    ["forged prior plan", { planId: "33333333-3333-4333-8333-333333333333" }, "SNAPSHOT_MISMATCH"],
    ["forged prior revision", { revision: 2 }, "SNAPSHOT_MISMATCH"],
    ["forged fingerprint", { fingerprint: "0".repeat(64) }, "SNAPSHOT_MISMATCH"],
    ["forged snapshot binding", { catalogSnapshotId: "catalog-forged" }, "SNAPSHOT_MISMATCH"],
  ])("rejects %s before ranker or commit", async (_label, priorPatch, errorCode) => {
    const ranker = vi.fn(async (rankRequest: RefinementRankRequest) => ({
      orderedIds: rankRequest.candidates.map((candidate) => candidate.id),
      rationales: Object.fromEntries(rankRequest.candidates.map((candidate) => [candidate.id, "should not run"])),
    }));
    const service = adapter({
      prepareRefinement: vi.fn(async () => ({
        ok: true as const,
        planId,
        currentRevision: 3,
        input: itineraryFixture,
        normalizedDelta: { feedback: "More history, please", scope: "partial" as const },
        previousRevision: { ...previousRevision, ...priorPatch },
        ranker,
      })),
    });
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({ guestToken: "guest-token-123456" })));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: errorCode, correlationId });
    expect(ranker).not.toHaveBeenCalled();
    expect(service.commitRefinement).not.toHaveBeenCalled();
  });

  it("rejects an engine snapshot that is not bound to the canonical prior revision", async () => {
    const ranker = vi.fn();
    const service = adapter({
      prepareRefinement: vi.fn(async () => ({
        ok: true as const,
        planId,
        currentRevision: 3,
        input: {
          ...itineraryFixture,
          catalog: { ...itineraryFixture.catalog, id: "catalog-forged" },
        },
        normalizedDelta: { feedback: "More history, please", scope: "partial" as const },
        previousRevision,
        ranker,
      })),
    });
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({ guestToken: "guest-token-123456" })));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "SNAPSHOT_MISMATCH", correlationId });
    expect(ranker).not.toHaveBeenCalled();
    expect(service.commitRefinement).not.toHaveBeenCalled();
  });

  it("rejects a proposal that changes a locked stop instead of committing it", async () => {
    const service = adapter({
      prepareRefinement: vi.fn(async () => ({
        ok: true as const,
        planId,
        currentRevision: 3,
        input: itineraryFixture,
        normalizedDelta: { feedback: "More history, please", scope: "partial" as const },
        previousRevision: {
          ...previousRevision,
          lockedItems: [{ ...previousLockedItem, placeId: "place-market" }],
        },
      })),
    });
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({ guestToken: "guest-token-123456" })));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ code: "LOCKED_ITEM_INVALID", correlationId });
    expect(service.commitRefinement).not.toHaveBeenCalled();
  });

  it("rejects a locked mapping whose place is absent from the authoritative catalog", async () => {
    const forgedPlaceId = "place-forged-not-in-catalog";
    const forgedResult: ItineraryResult = {
      ...previousResult,
      items: [{ ...previousResult.items[0], placeId: forgedPlaceId }],
    };
    const forgedPreviousRevision = {
      ...previousRevision,
      authoritativeResult: forgedResult,
      items: [{ ...previousRevision.items[0], placeId: forgedPlaceId }],
      lockedItems: [{ ...previousLockedItem, placeId: forgedPlaceId }],
      fingerprint: "",
    };
    forgedPreviousRevision.fingerprint = await fingerprintItinerary(
      itineraryFixture,
      forgedResult,
      async (bytes) => new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer)),
    );
    const service = adapter({
      prepareRefinement: vi.fn(async () => ({
        ok: true as const,
        planId,
        currentRevision: 3,
        input: itineraryFixture,
        normalizedDelta: { feedback: "More history, please", scope: "partial" as const },
        previousRevision: forgedPreviousRevision,
      })),
    });
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({ guestToken: "guest-token-123456" })));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ code: "LOCKED_ITEM_INVALID", correlationId });
    expect(service.commitRefinement).not.toHaveBeenCalled();
  });

  it("rejects a proposal that omits a locked stop instead of committing it", async () => {
    const inputWithoutLockedPlace = {
      ...itineraryFixture,
      request: { ...itineraryFixture.request, lockedStopIds: [] },
    };
    const service = adapter({
      prepareRefinement: vi.fn(async () => ({
        ok: true as const,
        planId,
        currentRevision: 3,
        input: inputWithoutLockedPlace,
        normalizedDelta: { feedback: "More history, please", scope: "partial" as const },
        previousRevision: {
          ...previousRevision,
          lockedItems: [{ ...previousLockedItem, placeId: "place-not-in-result" }],
        },
        ranker: vi.fn(async () => ({
          orderedIds: ["place-market"],
          rationales: { "place-market": "omit locked stop" },
        })),
      })),
    });
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({ guestToken: "guest-token-123456" })));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ code: "LOCKED_ITEM_INVALID", correlationId });
    expect(service.commitRefinement).not.toHaveBeenCalled();
  });
});
