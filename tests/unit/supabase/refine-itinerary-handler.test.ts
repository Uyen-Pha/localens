// @vitest-environment node

import { beforeAll, describe, expect, it, vi } from "vitest";

import { itineraryFixture } from "@/tests/fixtures/itinerary/catalog.v1";
import { fingerprintRevisionBinding } from "@/lib/domain/itinerary/fingerprint";
import type { ItineraryResult } from "@/lib/domain/itinerary/contracts";
import {
  computePlannerOperationDigest,
  type OperationRejectedCode,
} from "@/supabase/functions/_shared/planner-operation";
import {
  createRefineItineraryHandler,
  type RefinementRankRequest,
  type RefineItineraryAdapter,
} from "@/supabase/functions/_shared/refine-itinerary";

const correlationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const operationId = "10000000-0000-4000-8000-000000000011";
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
    foodSelection: null,
    foodCostMinVnd: 0,
    foodCostMaxVnd: 0,
    payAtVendorMinVnd: 0,
    payAtVendorMaxVnd: 0,
    customerPayableVnd: 360_000,
    score: 5_001,
  }],
  totals: {
    durationMinutes: 105,
    visitMinutes: 45,
    travelMinutes: 0,
    transitionBufferMinutes: 0,
    admissionCostVnd: 360_000,
    foodCostMinVnd: 0,
    foodCostMaxVnd: 0,
    travelCostVnd: 0,
    guideCostVnd: 0,
    payAtVendorMinVnd: 0,
    payAtVendorMaxVnd: 0,
    customerPayableVnd: 360_000,
    groupCostMinVnd: 360_000,
    groupCostMaxVnd: 360_000,
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
  previousRevision.fingerprint = await fingerprintRevisionBinding(
    planId,
    3,
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
    operationId,
    planId,
    baseRevision: 3,
    delta: { feedback: "history", scope: "partial" },
    lockedItemIds: [itemId],
    ...overrides,
  };
}

function operationDecision(overrides: Record<string, unknown> = {}) {
  return {
    state: "claimed",
    leaseToken: "20000000-0000-4000-8000-000000000011",
    leaseExpiresAt: "2099-09-05T00:00:00.000Z",
    planId,
    plannerReservationId: "20000000-0000-4000-8000-000000000012",
    geminiReservationId: "20000000-0000-4000-8000-000000000013",
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
    claimOperation: vi.fn(async () => operationDecision()),
    validateQuotaIdentity: vi.fn(async () => ({ ok: true as const })),
    reservePlannerQuota: vi.fn(async () => ({ ok: true as const })),
    rejectOperation: vi.fn(async (_input, errorCode) => ({ state: "rejected", errorCode })),
    readCommittedRevision: vi.fn(async () => ({ ok: false as const, error: { code: "SERVICE_UNAVAILABLE" as const } })),
    readOperationFailure: vi.fn(() => null),
    prepareRefinement: vi.fn(async () => ({
      ok: true as const,
      planId,
      currentRevision: 3,
      normalizedDelta: { feedback: "history", scope: "partial" as const },
      previousRevision,
    })),
    commitRefinement: vi.fn(async () => ({
      ok: true as const,
      revision: 4,
    })),
    ...overrides,
  };
}

type RefineLifecycleOperation = {
  ownerId: string;
  operationId: string;
  requestDigest: string;
  kind: "refine";
  planId: string;
  baseRevision: number;
  leaseExpiresAt: string;
  leaseToken: string;
  plannerReservationId: string;
  geminiReservationId: string;
  state: "claimed" | "completed" | "rejected" | "interrupted";
  expired: boolean;
  plannerReserved: boolean;
  geminiReserved: boolean;
  errorCode?: OperationRejectedCode;
  result?: ItineraryResult;
};

type RefineLifecycleReservation = {
  operationKey: string;
  kind: "planner" | "gemini";
  reserved: boolean;
};

type RefineLifecycleContextOperation = NonNullable<
  Parameters<RefineItineraryAdapter["commitRefinement"]>[1]["operation"]
>;

function lifecycleUuid(seed: number): string {
  return `30000000-0000-4000-8000-${seed.toString(16).padStart(12, "0")}`;
}

class RefineLifecycleFake {
  readonly operations = new Map<string, RefineLifecycleOperation>();
  readonly reservations = new Map<string, RefineLifecycleReservation>();
  readonly revisions = new Map<string, { ownerId: string; result: ItineraryResult }>();
  plannerQuotaReservations = 0;
  geminiQuotaReservations = 0;
  providerCalls = 0;
  planMutations = 0;
  private nextSerial = 1;

  constructor(private readonly planOwner = "user-1") {}

  private key(ownerId: string, operationId: string): string {
    return `${ownerId}:${operationId}`;
  }

  private revisionKey(planId: string, revision: number): string {
    return `${planId}:${revision}`;
  }

  canReadPlan(ownerId: string, targetPlanId: string): boolean {
    return ownerId === this.planOwner && targetPlanId === planId;
  }

  claim(ownerId: string, input: Parameters<RefineItineraryAdapter["claimOperation"]>[0]) {
    const key = this.key(ownerId, input.operationId);
    const existing = this.operations.get(key);
    if (existing === undefined) {
      const serial = this.nextSerial;
      this.nextSerial += 1;
      const operation: RefineLifecycleOperation = {
        ownerId,
        operationId: input.operationId,
        requestDigest: input.requestDigest,
        kind: "refine",
        planId: input.targetPlanId!,
        baseRevision: input.baseRevision!,
        leaseExpiresAt: "2099-09-05T00:00:00.000Z",
        leaseToken: lifecycleUuid(500 + serial),
        plannerReservationId: lifecycleUuid(600 + serial),
        geminiReservationId: lifecycleUuid(700 + serial),
        state: "claimed",
        expired: false,
        plannerReserved: false,
        geminiReserved: false,
      };
      this.operations.set(key, operation);
      this.reservations.set(operation.plannerReservationId, {
        operationKey: key,
        kind: "planner",
        reserved: false,
      });
      this.reservations.set(operation.geminiReservationId, {
        operationKey: key,
        kind: "gemini",
        reserved: false,
      });
      return {
        state: "claimed" as const,
        leaseToken: operation.leaseToken,
        leaseExpiresAt: operation.leaseExpiresAt,
        planId: operation.planId,
        plannerReservationId: operation.plannerReservationId,
        geminiReservationId: operation.geminiReservationId,
      };
    }
    if (existing.requestDigest !== input.requestDigest || existing.kind !== input.kind) {
      return { state: "conflict" as const };
    }
    if (existing.state === "completed" && existing.result !== undefined) {
      return { state: "completed" as const, planId: existing.planId, revision: 4 };
    }
    if (existing.state === "rejected" && existing.errorCode !== undefined) {
      return { state: "rejected" as const, errorCode: existing.errorCode };
    }
    if (existing.state === "interrupted" || existing.expired) {
      existing.state = "interrupted";
      return { state: "interrupted" as const };
    }
    return { state: "in_progress" as const };
  }

  reserve(ownerId: string, reservationId: string, kind: "planner" | "gemini") {
    const reservation = this.reservations.get(reservationId);
    const operation = reservation === undefined
      ? undefined
      : this.operations.get(reservation.operationKey);
    if (
      reservation === undefined
      || operation === undefined
      || reservation.kind !== kind
      || operation.ownerId !== ownerId
      || operation.state !== "claimed"
      || operation.expired
    ) {
      return { ok: false as const, kind: "unavailable" as const };
    }
    if (!reservation.reserved) {
      reservation.reserved = true;
      if (kind === "planner") {
        operation.plannerReserved = true;
        this.plannerQuotaReservations += 1;
      } else {
        operation.geminiReserved = true;
        this.geminiQuotaReservations += 1;
      }
    }
    return { ok: true as const };
  }

  complete(
    ownerId: string,
    operation: NonNullable<Parameters<RefineItineraryAdapter["commitRefinement"]>[1]["operation"]>,
    result: ItineraryResult,
  ) {
    const current = this.operations.get(this.key(ownerId, operation.operationId));
    if (
      current === undefined
      || current.requestDigest !== operation.requestDigest
      || current.kind !== operation.kind
      || current.planId !== operation.planId
      || current.baseRevision !== operation.baseRevision
      || current.plannerReservationId !== operation.plannerReservationId
      || current.geminiReservationId !== operation.geminiReservationId
    ) {
      return { ok: false as const, decision: { state: "conflict" as const } };
    }
    if (current.state === "completed" && current.result !== undefined) {
      return { ok: true as const, revision: 4 };
    }
    if (current.state === "rejected" && current.errorCode !== undefined) {
      return { ok: false as const, decision: { state: "rejected" as const, errorCode: current.errorCode } };
    }
    if (current.state === "interrupted") {
      return { ok: false as const, decision: { state: "interrupted" as const } };
    }
    if (current.expired) {
      current.state = "interrupted";
      return { ok: false as const, decision: { state: "interrupted" as const } };
    }
    if (current.leaseToken !== operation.leaseToken) {
      return { ok: false as const, decision: { state: "conflict" as const } };
    }
    current.state = "completed";
    current.result = result;
    this.planMutations += 1;
    this.revisions.set(this.revisionKey(current.planId, 4), { ownerId, result });
    return { ok: true as const, revision: 4 };
  }

  reject(ownerId: string, input: { operationId: string; requestDigest: string }, errorCode: OperationRejectedCode) {
    const operation = this.operations.get(this.key(ownerId, input.operationId));
    if (operation === undefined || operation.requestDigest !== input.requestDigest || operation.state !== "claimed") {
      return { state: "conflict" as const };
    }
    operation.state = "rejected";
    operation.errorCode = errorCode;
    return { state: "rejected" as const, errorCode };
  }

  read(ownerId: string, input: { planId: string; revision: number }) {
    const revision = this.revisions.get(this.revisionKey(input.planId, input.revision));
    if (revision?.ownerId !== ownerId || input.revision !== 4) {
      return { ok: false as const, error: { code: "SERVICE_UNAVAILABLE" as const } };
    }
    return {
      ok: true as const,
      planId: input.planId,
      revision: 4,
      rankingSource: revision.result.rankingSource,
      result: revision.result,
    };
  }

  expire(ownerId: string, operationId: string): void {
    const operation = this.operations.get(this.key(ownerId, operationId));
    if (operation !== undefined) operation.expired = true;
  }

  stateFor(ownerId: string, operationId: string): RefineLifecycleOperation | undefined {
    return this.operations.get(this.key(ownerId, operationId));
  }

  operationFor(ownerId: string, operationId: string): RefineLifecycleOperation | undefined {
    const operation = this.stateFor(ownerId, operationId);
    return operation === undefined ? undefined : structuredClone(operation);
  }
}

function lifecycleEndpoint(
  model: RefineLifecycleFake,
  ownerId: string,
  options: { loseCommitResponse?: boolean; abortAfterClaim?: boolean } = {},
) {
  let activeOperation: RefineLifecycleContextOperation | null = null;
  let operationFailure: { kind: "ambiguous_provider" } | null = null;
  let responseDropped = false;
  const service = adapter({
    verifyAccessToken: vi.fn(async () => ({ ok: true as const, principal: { userId: ownerId } })),
    claimOperation: vi.fn(async (input) => {
      const decision = model.claim(ownerId, input);
      activeOperation = decision.state === "claimed"
        ? {
            operationId: input.operationId,
            requestDigest: input.requestDigest,
            kind: "refine",
            leaseToken: decision.leaseToken,
            leaseExpiresAt: decision.leaseExpiresAt,
            planId: decision.planId,
            baseRevision: input.baseRevision,
            plannerReservationId: decision.plannerReservationId,
            geminiReservationId: decision.geminiReservationId,
          }
        : null;
      operationFailure = null;
      return decision;
    }),
    validateQuotaIdentity: vi.fn(async () => ({ ok: true as const })),
    reservePlannerQuota: vi.fn(async (reservationId: string) => options.abortAfterClaim
      ? { ok: false as const, kind: "unavailable" as const }
      : model.reserve(ownerId, reservationId, "planner")),
    prepareRefinement: vi.fn(async (input) => {
      if (!model.canReadPlan(ownerId, input.planId)) {
        return { ok: false as const, error: { code: "PLAN_NOT_FOUND" as const } };
      }
      return {
        ok: true as const,
        planId,
        currentRevision: 3,
        normalizedDelta: { feedback: "history", scope: "partial" as const },
        previousRevision,
        ranker: vi.fn(async (rankRequest: RefinementRankRequest) => {
          if (activeOperation === null) throw new Error("missing active operation");
          const reservation = model.reserve(ownerId, activeOperation.geminiReservationId, "gemini");
          if (!reservation.ok) {
            operationFailure = { kind: "ambiguous_provider" };
            throw new Error("provider unavailable");
          }
          model.providerCalls += 1;
          return {
            orderedIds: rankRequest.candidates.map((candidate) => candidate.id),
            rationales: {},
            foodSelections: [],
          };
        }),
      };
    }),
    readCommittedRevision: vi.fn(async (input) => model.read(ownerId, input)),
    readOperationFailure: vi.fn(() => operationFailure),
    rejectOperation: vi.fn(async (input, errorCode) => {
      activeOperation = null;
      return model.reject(ownerId, input, errorCode);
    }),
    commitRefinement: vi.fn(async (commit, context) => {
      if (context.operation === undefined || activeOperation === null) {
        return { ok: false as const, error: { code: "SERVICE_UNAVAILABLE" as const } };
      }
      const committed = model.complete(ownerId, context.operation, commit.result);
      if (committed.ok && options.loseCommitResponse && !responseDropped) {
        responseDropped = true;
        return { ok: false as const, error: { code: "SERVICE_UNAVAILABLE" as const } };
      }
      return committed;
    }),
  });
  return {
    adapter: service,
    handler: createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
      requireAuthenticated: true,
    }),
  };
}

describe("refine-itinerary Edge handler contract", () => {
  it("requires an operation UUID before any guest or adapter side effect", async () => {
    const service = adapter();
    const body = validBody({ guestToken: "guest-token-123456" });
    delete (body as Record<string, unknown>).operationId;
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(body));

    expect(response.status).toBe(400);
    expect(service.verifyGuestCapability).not.toHaveBeenCalled();
    expect(service.prepareRefinement).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_REQUEST",
      messageKey: "planner.invalid_request",
      correlationId,
    });
  });

  it.each([
    ["an all-keep request", "keep everything"],
    ["unsupported raw prose", "Please make this slower"],
  ])("rejects %s before operation claim, quota, preparation, or provider work", async (_label, feedback) => {
    const service = adapter();
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({
      delta: { feedback, scope: "partial" },
      guestToken: "guest-token-123456",
    })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_REQUEST",
      messageKey: "planner.invalid_request",
      retryable: false,
      correlationId,
    });
    expect(service.claimOperation).not.toHaveBeenCalled();
    expect(service.reservePlannerQuota).not.toHaveBeenCalled();
    expect(service.prepareRefinement).not.toHaveBeenCalled();
    expect(service.commitRefinement).not.toHaveBeenCalled();
  });

  it("claims before stale/prepare work and binds the canonical refine digest", async () => {
    const calls: string[] = [];
    const claimOperation = vi.fn(async (input: Record<string, unknown>) => {
      calls.push("claim");
      expect(input).toMatchObject({
        operationId,
        kind: "refine",
        targetPlanId: planId,
        baseRevision: 3,
        requestDigest: await computePlannerOperationDigest("refine", {
          planId,
          baseRevision: 3,
          scope: "partial",
          lockedItemIds: [itemId],
          signals: { pace: "keep", food: "keep", preferTypes: ["history"], avoidTypes: [] },
        }),
      });
      return operationDecision();
    });
    const reservePlannerQuota = vi.fn(async (reservationId: string) => {
      calls.push("planner-quota");
      expect(reservationId).toBe("20000000-0000-4000-8000-000000000012");
      return { ok: true as const };
    });
    const service = adapter({
      claimOperation,
      validateQuotaIdentity: vi.fn(async () => {
        calls.push("quota-identity");
        return { ok: true as const };
      }),
      reservePlannerQuota,
      rejectOperation: vi.fn(async () => ({ state: "rejected", errorCode: "QUOTA_EXCEEDED" })),
      readCommittedRevision: vi.fn(),
      readOperationFailure: vi.fn(() => null),
      prepareRefinement: vi.fn(async (...args) => {
        calls.push("prepare");
        expect(args[1]).toMatchObject({
          operation: expect.objectContaining({
            operationId,
            plannerReservationId: "20000000-0000-4000-8000-000000000012",
            geminiReservationId: "20000000-0000-4000-8000-000000000013",
          }),
        });
        return {
          ok: true as const,
          planId,
          currentRevision: 3,
          normalizedDelta: { feedback: "history", scope: "partial" as const },
          previousRevision,
        };
      }),
      commitRefinement: vi.fn(async (...args) => {
        calls.push("commit");
        expect(args[1]).toMatchObject({
          operation: expect.objectContaining({ operationId, leaseToken: "20000000-0000-4000-8000-000000000011" }),
        });
        return { ok: true as const, revision: 4 };
      }),
    } as unknown as Partial<RefineItineraryAdapter>);
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({ guestToken: "guest-token-123456" })));

    expect(response.status).toBe(200);
    expect(calls).toEqual(["quota-identity", "claim", "planner-quota", "prepare", "commit"]);
    expect(claimOperation).toHaveBeenCalledTimes(1);
    expect(reservePlannerQuota).toHaveBeenCalledTimes(1);
  });

  it("replays a completed refine revision without applying the delta again", async () => {
    const prepareRefinement = vi.fn();
    const commitRefinement = vi.fn();
    const claimOperation = vi.fn(async () => ({ state: "completed", planId, revision: 4 }));
    const readCommittedRevision = vi.fn(async () => ({
      ok: true as const,
      planId,
      revision: 4,
      rankingSource: "deterministic" as const,
      result: previousResult,
    }));
    const service = adapter({
      claimOperation,
      validateQuotaIdentity: vi.fn(async () => ({ ok: true as const })),
      reservePlannerQuota: vi.fn(),
      rejectOperation: vi.fn(),
      readCommittedRevision,
      readOperationFailure: vi.fn(() => null),
      prepareRefinement,
      commitRefinement,
    } as unknown as Partial<RefineItineraryAdapter>);
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({ guestToken: "guest-token-123456" })));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ planId, baseRevision: 3, revision: 4, regeneration: "partial" });
    expect(claimOperation).toHaveBeenCalledTimes(1);
    expect(readCommittedRevision).toHaveBeenCalledWith(
      { planId, revision: 4 },
      expect.objectContaining({ principal: null }),
    );
    expect(prepareRefinement).not.toHaveBeenCalled();
    expect(commitRefinement).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "requires a challenge",
      validate: async () => ({ ok: false as const, error: { code: "CHALLENGE_REQUIRED" as const } }),
      status: 400,
      code: "CHALLENGE_REQUIRED",
      messageKey: "refinement.challenge_required",
    },
    {
      label: "rejects an invalid challenge",
      validate: async () => ({ ok: false as const, error: { code: "CHALLENGE_INVALID" as const } }),
      status: 403,
      code: "CHALLENGE_INVALID",
      messageKey: "refinement.challenge_invalid",
    },
    {
      label: "loses the identity response",
      validate: async () => { throw new Error("identity response lost"); },
      status: 503,
      code: "SERVICE_UNAVAILABLE",
      messageKey: "planner.service_unavailable",
    },
  ])("handles quota identity that $label before claiming", async (testCase) => {
    const service = adapter({
      validateQuotaIdentity: vi.fn(testCase.validate) as RefineItineraryAdapter["validateQuotaIdentity"],
    });
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({ guestToken: "guest-token-123456" })));
    const body = await response.json();

    expect(response.status).toBe(testCase.status);
    expect(body).toEqual({
      code: testCase.code,
      messageKey: testCase.messageKey,
      retryable: testCase.status === 503,
      correlationId,
    });
    expect(body).not.toHaveProperty("operationState");
    expect(service.claimOperation).not.toHaveBeenCalled();
    expect(service.reservePlannerQuota).not.toHaveBeenCalled();
    expect(service.prepareRefinement).not.toHaveBeenCalled();
    expect(service.commitRefinement).not.toHaveBeenCalled();
  });

  it("reconciles refine response loss through fresh owner-scoped requests", async () => {
    const model = new RefineLifecycleFake();
    const authHeaders = { Authorization: "Bearer owner-token" };
    const first = lifecycleEndpoint(model, "user-1", { loseCommitResponse: true });
    const lost = await first.handler(request(validBody(), authHeaders));
    const lostBody = await lost.json();
    expect(lost.status).toBe(503);
    expect(lostBody).toEqual({
      code: "SERVICE_UNAVAILABLE",
      messageKey: "planner.service_unavailable",
      retryable: true,
      correlationId,
    });

    expect(lostBody).not.toHaveProperty("operationState");
    expect(first.adapter.claimOperation).toHaveBeenCalledTimes(1);
    expect(first.adapter.reservePlannerQuota).toHaveBeenCalledTimes(1);
    expect(first.adapter.prepareRefinement).toHaveBeenCalledTimes(1);
    expect(first.adapter.commitRefinement).toHaveBeenCalledTimes(1);

    const firstState = model.stateFor("user-1", operationId);
    expect(firstState).toMatchObject({ state: "completed", plannerReserved: true, geminiReserved: true });
    expect(firstState?.plannerReservationId).not.toBe(firstState?.geminiReservationId);
    expect(model.plannerQuotaReservations).toBe(1);
    expect(model.geminiQuotaReservations).toBe(1);
    expect(model.providerCalls).toBe(1);
    expect(model.planMutations).toBe(1);

    const countsAfterLost = {
      planner: model.plannerQuotaReservations,
      gemini: model.geminiQuotaReservations,
      provider: model.providerCalls,
      mutations: model.planMutations,
    };
    const retry = lifecycleEndpoint(model, "user-1");
    const replay = await retry.handler(request(validBody(), authHeaders));
    const replayBody = await replay.json();

    expect(replay.status).toBe(200);
    expect(replayBody).toMatchObject({
      planId,
      baseRevision: 3,
      revision: 4,
      regeneration: "partial",
      advisoryOnly: true,
    });
    expect(retry.adapter.claimOperation).toHaveBeenCalledTimes(1);
    expect(retry.adapter.readCommittedRevision).toHaveBeenCalledTimes(1);
    expect(retry.adapter.reservePlannerQuota).not.toHaveBeenCalled();
    expect(retry.adapter.prepareRefinement).not.toHaveBeenCalled();
    expect(retry.adapter.commitRefinement).not.toHaveBeenCalled();
    expect(model.plannerQuotaReservations).toBe(countsAfterLost.planner);
    expect(model.geminiQuotaReservations).toBe(countsAfterLost.gemini);
    expect(model.providerCalls).toBe(countsAfterLost.provider);
    expect(model.planMutations).toBe(countsAfterLost.mutations);

    const otherOwner = lifecycleEndpoint(model, "user-2");
    const otherResponse = await otherOwner.handler(request(validBody(), authHeaders));
    const otherBody = await otherResponse.json();
    const otherState = model.stateFor("user-2", operationId);
    expect(otherResponse.status).toBe(404);
    expect(otherBody).toMatchObject({
      code: "PLAN_NOT_FOUND",
      messageKey: "refinement.plan_not_found",
      operationState: "rejected",
    });
    expect(otherState?.state).toBe("rejected");
    expect(otherState?.result).toBeUndefined();
    expect(model.plannerQuotaReservations).toBe(2);
    expect(model.geminiQuotaReservations).toBe(1);
    expect(model.providerCalls).toBe(1);
    expect(model.planMutations).toBe(1);

    const oldOperationId = "10000000-0000-4000-8000-000000000012";
    const stalled = lifecycleEndpoint(model, "user-1", { abortAfterClaim: true });
    const stalledResponse = await stalled.handler(request(validBody({ operationId: oldOperationId }), authHeaders));
    expect(stalledResponse.status).toBe(503);
    const issued = model.operationFor("user-1", oldOperationId);
    expect(issued?.state).toBe("claimed");
    expect(issued?.leaseToken).toMatch(/^[0-9a-f-]{36}$/);

    model.expire("user-1", oldOperationId);
    const reclaimed = lifecycleEndpoint(model, "user-1");
    const reclaimedResponse = await reclaimed.handler(request(validBody({ operationId: oldOperationId }), authHeaders));
    const reclaimedBody = await reclaimedResponse.json();
    expect(reclaimedResponse.status).toBe(409);
    expect(reclaimedBody).toMatchObject({
      code: "OPERATION_INTERRUPTED",
      operationState: "interrupted",
    });

    const issuedOperation = issued!;
    const staleCommit = await stalled.adapter.commitRefinement(
      {
        planId,
        baseRevision: 3,
        lockedItemIds: [itemId],
        normalizedDelta: { feedback: "history", scope: "partial" },
        previousRevision,
        scope: "partial",
        result: previousResult,
      },
      {
        correlationId,
        principal: { userId: "user-1" },
        guestCapability: null,
        operation: {
          operationId: issuedOperation.operationId,
          requestDigest: issuedOperation.requestDigest,
          kind: issuedOperation.kind,
          leaseToken: issuedOperation.leaseToken,
          leaseExpiresAt: issuedOperation.leaseExpiresAt,
          planId: issuedOperation.planId,
          baseRevision: issuedOperation.baseRevision,
          plannerReservationId: issuedOperation.plannerReservationId,
          geminiReservationId: issuedOperation.geminiReservationId,
        },
      },
    );
    expect(staleCommit).toEqual({ ok: false, decision: { state: "interrupted" } });
    expect(model.planMutations).toBe(1);
  });

  it.each([
    {
      label: "an expired lease",
      decision: { state: "interrupted" as const },
      status: 409,
      code: "OPERATION_INTERRUPTED",
      messageKey: "planner.operation_interrupted",
      retryable: false,
      operationState: "interrupted",
    },
    {
      label: "an old lease token",
      decision: { state: "conflict" as const },
      status: 409,
      code: "OPERATION_CONFLICT",
      messageKey: "planner.operation_conflict",
      retryable: false,
      operationState: undefined,
    },
    {
      label: "a persisted rejection",
      decision: { state: "rejected" as const, errorCode: "STALE_REVISION" as const },
      status: 409,
      code: "STALE_REVISION",
      messageKey: "refinement.stale_revision",
      retryable: true,
      operationState: "rejected",
    },
  ] as const)("maps complete_runtime_refinement $label without losing the terminal decision", async (testCase) => {
    const service = adapter({
      commitRefinement: vi.fn(async () => ({ ok: false as const, decision: testCase.decision })),
    });
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({ guestToken: "guest-token-123456" })));
    const body = await response.json();

    expect(response.status).toBe(testCase.status);
    expect(body).toMatchObject({
      code: testCase.code,
      messageKey: testCase.messageKey,
      retryable: testCase.retryable,
      correlationId,
    });
    if (testCase.operationState === undefined) {
      expect(body).not.toHaveProperty("operationState");
    } else {
      expect(body.operationState).toBe(testCase.operationState);
    }
    expect(body).not.toHaveProperty("revision");
  });

  it.each([
    { kind: "ambiguous_provider" as const, commit: false },
    { kind: "ambiguous_commit" as const, commit: true },
  ])("maps $kind to the frozen unresolved-service tuple", async ({ kind, commit }) => {
    const readOperationFailure = commit
      ? vi.fn()
        .mockReturnValueOnce(null)
        .mockReturnValueOnce({ kind })
      : vi.fn(() => ({ kind }));
    const service = adapter({
      readOperationFailure,
      ...(commit
        ? {
            commitRefinement: vi.fn(async () => ({
              ok: false as const,
              error: { code: "SERVICE_UNAVAILABLE" as const },
            })),
          }
        : {
            prepareRefinement: vi.fn(async () => ({
              ok: true as const,
              planId,
              currentRevision: 3,
              normalizedDelta: { feedback: "history", scope: "partial" as const },
              previousRevision,
              ranker: vi.fn(async () => {
                throw new Error("provider response lost");
              }),
            })),
          }),
    });
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({ guestToken: "guest-token-123456" })));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      code: "SERVICE_UNAVAILABLE",
      messageKey: "planner.service_unavailable",
      retryable: true,
      correlationId,
    });
    expect(body).not.toHaveProperty("operationState");
  });

  it.each([
    { label: "throws", claim: async () => { throw new Error("PLAN_NOT_FOUND"); } },
    { label: "returns an unresolved failure", claim: async () => ({ ok: false, error: { code: "SERVICE_UNAVAILABLE" } }) },
  ])("maps a claim RPC $label to SERVICE_UNAVAILABLE without an operation state", async ({ claim }) => {
    const service = adapter({ claimOperation: vi.fn(claim) as RefineItineraryAdapter["claimOperation"] });
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({ guestToken: "guest-token-123456" })));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      code: "SERVICE_UNAVAILABLE",
      messageKey: "planner.service_unavailable",
      retryable: true,
      correlationId,
    });
    expect(body).not.toHaveProperty("operationState");
    expect(service.reservePlannerQuota).not.toHaveBeenCalled();
  });

  it("maps non-claimed refine decisions before quota, preparation, or commit work", async () => {
    const cases = [
      {
        decision: { state: "in_progress" },
        status: 409,
        code: "OPERATION_IN_PROGRESS",
        operationState: "in_progress",
        retryable: true,
      },
      {
        decision: { state: "conflict" },
        status: 409,
        code: "OPERATION_CONFLICT",
        operationState: undefined,
        retryable: false,
      },
      {
        decision: { state: "interrupted" },
        status: 409,
        code: "OPERATION_INTERRUPTED",
        operationState: "interrupted",
        retryable: false,
      },
      {
        decision: { state: "rejected", errorCode: "STALE_REVISION" },
        status: 409,
        code: "STALE_REVISION",
        operationState: "rejected",
        retryable: true,
      },
    ] as const;

    for (const testCase of cases) {
      const service = adapter({
        claimOperation: vi.fn(async () => testCase.decision),
        reservePlannerQuota: vi.fn(),
        prepareRefinement: vi.fn(),
        commitRefinement: vi.fn(),
      });
      const handler = createRefineItineraryHandler(service, {
        policy,
        correlationIdFactory: () => correlationId,
      });

      const response = await handler(request(validBody({ guestToken: "guest-token-123456" })));
      const body = await response.json();

      expect(response.status).toBe(testCase.status);
      expect(body).toMatchObject({
        code: testCase.code,
        retryable: testCase.retryable,
        correlationId,
      });
      if (testCase.operationState === undefined) {
        expect(body).not.toHaveProperty("operationState");
      } else {
        expect(body.operationState).toBe(testCase.operationState);
      }
      expect(service.reservePlannerQuota).not.toHaveBeenCalled();
      expect(service.prepareRefinement).not.toHaveBeenCalled();
      expect(service.commitRefinement).not.toHaveBeenCalled();
    }
  });

  it("persists refine quota refusal and replays the rejection without a second reservation", async () => {
    const claimOperation = vi.fn()
      .mockResolvedValueOnce(operationDecision())
      .mockResolvedValueOnce({ state: "rejected", errorCode: "QUOTA_EXCEEDED" });
    const reservePlannerQuota = vi.fn(async () => ({
      ok: false as const,
      kind: "rejected" as const,
      code: "QUOTA_EXCEEDED" as const,
    }));
    const rejectOperation = vi.fn(async () => ({ state: "rejected", errorCode: "QUOTA_EXCEEDED" }));
    const prepareRefinement = vi.fn();
    const commitRefinement = vi.fn();
    const service = adapter({
      claimOperation,
      reservePlannerQuota,
      rejectOperation,
      prepareRefinement,
      commitRefinement,
    });
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const first = await handler(request(validBody({ guestToken: "guest-token-123456" })));
    const second = await handler(request(validBody({ guestToken: "guest-token-123456" })));
    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(first.status).toBe(429);
    expect(second.status).toBe(429);
    expect(firstBody).toMatchObject({
      code: "QUOTA_EXCEEDED",
      messageKey: "refinement.quota_exceeded",
      retryable: true,
      operationState: "rejected",
      correlationId,
    });
    expect(secondBody).toEqual(firstBody);
    expect(claimOperation).toHaveBeenCalledTimes(2);
    expect(reservePlannerQuota).toHaveBeenCalledTimes(1);
    expect(rejectOperation).toHaveBeenCalledTimes(1);
    expect(prepareRefinement).not.toHaveBeenCalled();
    expect(commitRefinement).not.toHaveBeenCalled();
  });

  it("maps the production code-less quota transport failure to the frozen service tuple", async () => {
    const service = adapter({
      reservePlannerQuota: vi.fn(async () => ({ ok: false as const, kind: "unavailable" as const })),
    });
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({ guestToken: "guest-token-123456" })));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      code: "SERVICE_UNAVAILABLE",
      messageKey: "planner.service_unavailable",
      retryable: true,
      correlationId,
    });
    expect(body).not.toHaveProperty("operationState");
    expect(service.prepareRefinement).not.toHaveBeenCalled();
    expect(service.commitRefinement).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "returns a failed read",
      read: async () => ({ ok: false as const, error: { code: "SERVICE_UNAVAILABLE" as const } }),
    },
    {
      label: "throws during read",
      read: async () => { throw new Error("read response lost"); },
    },
  ])("maps a completed replay that $label to SERVICE_UNAVAILABLE", async ({ read }) => {
    const service = adapter({
      claimOperation: vi.fn(async () => ({ state: "completed" as const, planId, revision: 4 })),
      readCommittedRevision: vi.fn(read) as RefineItineraryAdapter["readCommittedRevision"],
    });
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({ guestToken: "guest-token-123456" })));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      code: "SERVICE_UNAVAILABLE",
      messageKey: "planner.service_unavailable",
      retryable: true,
      correlationId,
    });
    expect(body).not.toHaveProperty("operationState");
  });

  it("maps a completion throw to SERVICE_UNAVAILABLE without an operation state", async () => {
    const service = adapter({
      commitRefinement: vi.fn(async () => { throw new Error("commit response lost"); }),
    });
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({ guestToken: "guest-token-123456" })));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      code: "SERVICE_UNAVAILABLE",
      messageKey: "planner.service_unavailable",
      retryable: true,
      correlationId,
    });
    expect(body).not.toHaveProperty("operationState");
  });

  it.each([
    {
      label: "the operation UUID",
      body: { operationId: "ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF" },
    },
    {
      label: "the plan UUID",
      body: { planId: "ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF" },
    },
    {
      label: "a locked-item UUID",
      body: { lockedItemIds: ["ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF"] },
    },
  ])("rejects uppercase UUIDs in $label before claim or side effects", async ({ body }) => {
    const service = adapter();
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({ ...body, guestToken: "guest-token-123456" })));
    const responseBody = await response.json();

    expect(response.status).toBe(400);
    expect(responseBody).toMatchObject({
      code: "INVALID_REQUEST",
      messageKey: "planner.invalid_request",
      retryable: false,
      correlationId,
    });
    expect(responseBody).not.toHaveProperty("operationState");
    expect(service.verifyGuestCapability).not.toHaveBeenCalled();
    expect(service.claimOperation).not.toHaveBeenCalled();
    expect(service.reservePlannerQuota).not.toHaveBeenCalled();
    expect(service.prepareRefinement).not.toHaveBeenCalled();
    expect(service.commitRefinement).not.toHaveBeenCalled();
  });

  it("does not let a guest token satisfy an authenticated runtime handler", async () => {
    const service = adapter();
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
      requireAuthenticated: true,
    });

    const response = await handler(request(validBody({ guestToken: "guest-token-123456" })));

    expect(response.status).toBe(401);
    expect(service.verifyGuestCapability).not.toHaveBeenCalled();
    expect(service.prepareRefinement).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      code: "AUTH_REQUIRED",
      messageKey: "planner.auth_required",
      correlationId,
    });
  });

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
        delta: { feedback: "history", scope: "partial" },
        lockedItemIds: [itemId],
      },
      expect.objectContaining({
        correlationId,
        principal: null,
        guestCapability: { planId },
        operation: expect.objectContaining({ operationId }),
      }),
    );
    expect(service.commitRefinement).toHaveBeenCalledWith(
      {
        planId,
        baseRevision: 3,
        lockedItemIds: [itemId],
        scope: "partial",
        normalizedDelta: { feedback: "history", scope: "partial" },
        previousRevision,
        result: expect.objectContaining({ rankingSource: "deterministic" }),
      },
      expect.objectContaining({
        correlationId,
        principal: null,
        guestCapability: { planId },
        operation: expect.objectContaining({ operationId }),
      }),
    );
  });

  it("serializes every validated VND money field as a canonical decimal string on the wire", async () => {
    const handler = createRefineItineraryHandler(adapter(), {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const body = await (await handler(request(validBody({ guestToken: "guest-token-123456" })))).json();

    expect(body.proposal.budgetVnd).toMatch(/^(?:0|[1-9]\d*)$/);
    for (const field of [
      "travelCostVndBefore",
      "placeCostVnd",
      "foodCostMinVnd",
      "foodCostMaxVnd",
      "payAtVendorMinVnd",
      "payAtVendorMaxVnd",
      "customerPayableVnd",
    ]) expect(body.proposal.items[0][field]).toMatch(/^(?:0|[1-9]\d*)$/);
    for (const field of [
      "admissionCostVnd",
      "foodCostMinVnd",
      "foodCostMaxVnd",
      "travelCostVnd",
      "guideCostVnd",
      "payAtVendorMinVnd",
      "payAtVendorMaxVnd",
      "customerPayableVnd",
      "groupCostMinVnd",
      "groupCostMaxVnd",
      "groupCostVnd",
    ]) expect(body.proposal.totals[field]).toMatch(/^(?:0|[1-9]\d*)$/);
    expect(body.proposal.items[0].score).toBeTypeOf("number");
    expect(body.proposal.totals.durationMinutes).toBeTypeOf("number");
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

  it("preserves the exact prior locked food selection during refinement", async () => {
    const authoritativeInput = structuredClone(itineraryFixture);
    const place = authoritativeInput.catalog.places.find((candidate) => candidate.id === lockedPlaceId);
    if (!place) throw new Error("food fixture place missing");
    const vendor = place.foodVendors[0];
    if (!vendor) throw new Error("food fixture vendor missing");
    vendor.menuItems.push({
      ...vendor.menuItems[0],
      id: "menu-a-cheaper",
      slug: "a-cheaper",
      priceVndMin: 10_000,
      priceVndMax: 12_000,
    });
    const lockedSelection = {
      vendorId: "vendor-banh-mi-legacy",
      menuItemId: "menu-banh-mi-legacy",
      quantity: 2,
      priceVndMin: 30_000,
      priceVndMax: 40_000,
      paymentMode: "pay_at_vendor" as const,
      activity: "Taste and discuss the selected dish",
    };
    const authoritativeResult: ItineraryResult = structuredClone(previousResult);
    authoritativeResult.items[0].foodSelection = lockedSelection;
    authoritativeResult.items[0].foodCostMinVnd = 60_000;
    authoritativeResult.items[0].foodCostMaxVnd = 80_000;
    authoritativeResult.items[0].payAtVendorMinVnd = 60_000;
    authoritativeResult.items[0].payAtVendorMaxVnd = 80_000;
    authoritativeResult.items[0].customerPayableVnd = 360_000;
    authoritativeResult.totals.foodCostMinVnd = 60_000;
    authoritativeResult.totals.foodCostMaxVnd = 80_000;
    authoritativeResult.totals.payAtVendorMinVnd = 60_000;
    authoritativeResult.totals.payAtVendorMaxVnd = 80_000;
    authoritativeResult.totals.groupCostMinVnd = 420_000;
    authoritativeResult.totals.groupCostMaxVnd = 440_000;
    authoritativeResult.totals.groupCostVnd = 440_000;
    const lockedRevision = {
      ...previousRevision,
      authoritativeInput,
      authoritativeResult,
      items: [{ ...authoritativeResult.items[0], itemId, position: 1 }],
    };
    lockedRevision.fingerprint = await fingerprintRevisionBinding(
      planId,
      3,
      authoritativeInput,
      authoritativeResult,
      async (bytes) => new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer)),
    );
    const service = adapter({
      prepareRefinement: vi.fn(async () => ({
        ok: true as const,
        planId,
        currentRevision: 3,
        normalizedDelta: { feedback: "history", scope: "partial" as const },
        previousRevision: lockedRevision,
        ranker: vi.fn(async () => ({
          orderedIds: [lockedPlaceId],
          rationales: { [lockedPlaceId]: "conflict" },
          foodSelections: [{
            placeId: lockedPlaceId,
            selection: { ...lockedSelection, menuItemId: "unknown-menu", priceVndMin: 1, priceVndMax: 1 },
          }],
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
    expect(body.degraded).toBe(true);
    expect(body.proposal.items[0].foodSelection).toEqual({
      ...lockedSelection,
      priceVndMin: "30000",
      priceVndMax: "40000",
    });
  });

  it("preserves an explicit null food selection for a locked food place", async () => {
    const service = adapter();
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({ guestToken: "guest-token-123456" })));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.proposal.items[0].placeId).toBe(lockedPlaceId);
    expect(body.proposal.items[0].foodSelection).toBeNull();
    expect(body.proposal.items[0].foodCostMinVnd).toBe("0");
    expect(body.proposal.items[0].foodCostMaxVnd).toBe("0");
  });

  it("falls back and preserves null when a provider proposes food for a locked foodless place", async () => {
    const service = adapter({
      prepareRefinement: vi.fn(async () => ({
        ok: true as const,
        planId,
        currentRevision: 3,
        normalizedDelta: { feedback: "history", scope: "partial" as const },
        previousRevision,
        ranker: vi.fn(async () => ({
          orderedIds: [lockedPlaceId],
          rationales: { [lockedPlaceId]: "must not add food" },
          foodSelections: [{
            placeId: lockedPlaceId,
            selection: {
              vendorId: "vendor-banh-mi-legacy",
              menuItemId: "menu-banh-mi-legacy",
              quantity: 2,
              priceVndMin: 30_000,
              priceVndMax: 40_000,
              paymentMode: "pay_at_vendor" as const,
              activity: "Taste and discuss the selected dish",
            },
          }],
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
    expect(body.degraded).toBe(true);
    expect(body.proposal.rankingSource).toBe("deterministic");
    expect(body.proposal.items[0].foodSelection).toBeNull();
  });

  it("accepts a canonical food selection for an unlocked refinement item", async () => {
    const ranker = vi.fn(async () => ({
      orderedIds: [lockedPlaceId],
      rationales: { [lockedPlaceId]: "canonical unlocked selection" },
      foodSelections: [{
        placeId: lockedPlaceId,
        selection: {
          vendorId: "vendor-banh-mi-legacy",
          menuItemId: "menu-banh-mi-legacy",
          quantity: 2,
          priceVndMin: 30_000,
          priceVndMax: 40_000,
          paymentMode: "pay_at_vendor" as const,
          activity: "Taste and discuss the selected dish",
        },
      }],
    }));
    const service = adapter({
      prepareRefinement: vi.fn(async () => ({
        ok: true as const,
        planId,
        currentRevision: 3,
        normalizedDelta: { feedback: "history", scope: "partial" as const },
        previousRevision: { ...previousRevision, lockedItems: [] },
        ranker,
      })),
    });
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({
      guestToken: "guest-token-123456",
      lockedItemIds: [],
    })));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.degraded).toBe(false);
    expect(body.proposal.items[0].foodSelection).toEqual({
      vendorId: "vendor-banh-mi-legacy",
      menuItemId: "menu-banh-mi-legacy",
      quantity: 2,
      priceVndMin: "30000",
      priceVndMax: "40000",
      paymentMode: "pay_at_vendor",
      activity: "Taste and discuss the selected dish",
    });
  });

  it("passes a minimal sorted allowlist payload with normalized refinement context", async () => {
    let received: {
      signals: RefinementRankRequest["signals"];
      scope: "partial" | "full";
      lockedPlaceIds: string[];
      rankRequest: RefinementRankRequest;
    } | undefined;
    const service = adapter({
      prepareRefinement: vi.fn(async () => ({
        ok: true as const,
        planId,
        currentRevision: 3,
        normalizedDelta: { feedback: "slower; remove food", scope: "partial" as const },
        previousRevision,
        ranker: vi.fn(async (rankRequest: RefinementRankRequest) => {
          received = {
            signals: rankRequest.signals,
            scope: rankRequest.scope,
            lockedPlaceIds: [...rankRequest.lockedPlaceIds],
            rankRequest,
          };
          return {
            orderedIds: rankRequest.candidates.map((candidate) => candidate.id),
            rationales: Object.fromEntries(rankRequest.candidates.map((candidate) => [candidate.id, "matched"])),
            foodSelections: [],
          };
        }),
      })),
    });
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({
      delta: { feedback: "slower; remove food", scope: "partial" },
      guestToken: "guest-token-123456",
    })));

    expect(response.status).toBe(200);
    expect(received).toEqual({
      signals: { pace: "slower", food: "remove", preferTypes: [], avoidTypes: [] },
      scope: "partial",
      lockedPlaceIds: [lockedPlaceId],
      rankRequest: expect.objectContaining({
        allowedVendorIds: ["vendor-banh-mi-legacy"],
        allowedMenuItemIds: ["menu-banh-mi-legacy"],
      }),
    });
    expect(Object.keys(received?.rankRequest ?? {}).sort()).toEqual([
      "allowedMenuItemIds",
      "allowedVendorIds",
      "candidates",
      "lockedPlaceIds",
      "pace",
      "priorityWeights",
      "scope",
      "signals",
    ]);
    expect(received?.rankRequest).not.toHaveProperty("feedback");
    expect(JSON.stringify(received)).not.toContain("slower; remove food");
    for (const candidate of received?.rankRequest.candidates ?? []) {
      expect(Object.keys(candidate).sort()).toEqual([
        "areaId",
        "id",
        "types",
        "visitDurationMinutes",
      ]);
    }
    expect(JSON.stringify(received?.rankRequest)).not.toMatch(/dietary|mobility|special|contact|account|catalog|description|evidence/i);
  });

  it.each([
    "foodSelection",
    "foodCostMinVnd",
    "foodCostMaxVnd",
    "payAtVendorMinVnd",
    "payAtVendorMaxVnd",
    "customerPayableVnd",
    "placeCostVnd",
    "travelCostVndBefore",
  ] as const)("rejects a prior locked item tampered in %s", async (field) => {
    const tamperedRevision = structuredClone(previousRevision);
    const item = tamperedRevision.items[0] as unknown as Record<string, unknown>;
    item[field] = field === "foodSelection" ? {
      vendorId: "vendor-banh-mi-legacy",
      menuItemId: "menu-banh-mi-legacy",
      quantity: 2,
      priceVndMin: 30_000,
      priceVndMax: 40_000,
      paymentMode: "pay_at_vendor",
      activity: "Taste and discuss the selected dish",
    } : 1;
    const service = adapter({
      prepareRefinement: vi.fn(async () => ({
        ok: true as const,
        planId,
        currentRevision: 3,
        normalizedDelta: { feedback: "history", scope: "partial" as const },
        previousRevision: tamperedRevision,
      })),
    });
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({ guestToken: "guest-token-123456" })));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "SNAPSHOT_MISMATCH",
      correlationId,
    });
    expect(service.commitRefinement).not.toHaveBeenCalled();
  });

  it("allows unrestricted full regeneration only when no locks are supplied", async () => {
    let receivedScope: "partial" | "full" | undefined;
    const service = adapter({
      prepareRefinement: vi.fn(async () => ({
        ok: true as const,
        planId,
        currentRevision: 3,
        normalizedDelta: { feedback: "market", scope: "full" as const },
        previousRevision: { ...previousRevision, lockedItems: [] },
        ranker: vi.fn(async (rankRequest: RefinementRankRequest) => {
          receivedScope = rankRequest.scope;
          return {
            orderedIds: rankRequest.candidates.map((candidate) => candidate.id),
            rationales: Object.fromEntries(rankRequest.candidates.map((candidate) => [candidate.id, "matched"])),
            foodSelections: [],
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
      delta: { feedback: "market", scope: "full" },
      lockedItemIds: [],
    })));

    expect(response.status).toBe(200);
    expect(receivedScope).toBe("full");
    expect(service.commitRefinement).toHaveBeenCalledWith(
      expect.objectContaining({
        normalizedDelta: { feedback: "market", scope: "full" },
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
      messageKey: "planner.auth_required",
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
      messageKey: "planner.invalid_request",
      retryable: false,
      correlationId,
      fieldErrors: { baseRevision: "gateway.invalid_request" },
    });
  });

  it("rejects duplicate locked item IDs as invalid input before claim without a terminal operation state", async () => {
    const service = adapter();
    const handler = createRefineItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({
      guestToken: "guest-token-123456",
      lockedItemIds: [itemId, itemId],
    })));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({
      code: "INVALID_REQUEST",
      messageKey: "planner.invalid_request",
      retryable: false,
      correlationId,
    });
    expect(body).not.toHaveProperty("operationState");
    expect(service.claimOperation).not.toHaveBeenCalled();
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
        normalizedDelta: { feedback: "history", scope: "partial" as const },
        previousRevision,
        ranker: vi.fn(async () => ({
          orderedIds: ["forged-place-id"],
          rationales: { "forged-place-id": "malicious" },
          foodSelections: [],
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
        normalizedDelta: { feedback: "history", scope: "partial" as const },
        previousRevision: { ...previousRevision, authoritativeInput: { forged: true } },
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
        normalizedDelta: { feedback: "history", scope: "partial" as const },
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
      foodSelections: [],
    }));
    const service = adapter({
      prepareRefinement: vi.fn(async () => ({
        ok: true as const,
        planId,
        currentRevision: 3,
        normalizedDelta: { feedback: "history", scope: "partial" as const },
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
        normalizedDelta: { feedback: "history", scope: "partial" as const },
        previousRevision: {
          ...previousRevision,
          authoritativeInput: {
            ...itineraryFixture,
            catalog: { ...itineraryFixture.catalog, id: "catalog-forged" },
          },
        },
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

  it.each([
    ["place price", (input: typeof itineraryFixture) => { input.catalog.places[0].priceVndPerPerson += 1; }],
    ["opening hours", (input: typeof itineraryFixture) => { input.catalog.places[0].openingHours[0].opensAt = "10:00"; }],
    ["travel edge", (input: typeof itineraryFixture) => { input.travel.edges[0].minutes += 1; }],
    ["request budget", (input: typeof itineraryFixture) => { input.request.budget.amountMinor = 1; }],
    ["request areas", (input: typeof itineraryFixture) => { input.request.areas = ["district-5"]; }],
  ])("rejects an authoritative input altered by adapter (%s) before engine use", async (_label, alter) => {
    const alteredInput = structuredClone(itineraryFixture);
    alter(alteredInput);
    const ranker = vi.fn();
    const service = adapter({
      prepareRefinement: vi.fn(async () => ({
        ok: true as const,
        planId,
        currentRevision: 3,
        normalizedDelta: { feedback: "history", scope: "partial" as const },
        previousRevision: { ...previousRevision, authoritativeInput: alteredInput },
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
        normalizedDelta: { feedback: "history", scope: "partial" as const },
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
    forgedPreviousRevision.fingerprint = await fingerprintRevisionBinding(
      planId,
      3,
      itineraryFixture,
      forgedResult,
      async (bytes) => new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer)),
    );
    const service = adapter({
      prepareRefinement: vi.fn(async () => ({
        ok: true as const,
        planId,
        currentRevision: 3,
        normalizedDelta: { feedback: "history", scope: "partial" as const },
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
    const service = adapter({
      prepareRefinement: vi.fn(async () => ({
        ok: true as const,
        planId,
        currentRevision: 3,
        normalizedDelta: { feedback: "history", scope: "partial" as const },
        previousRevision: {
          ...previousRevision,
          lockedItems: [{ ...previousLockedItem, placeId: "place-not-in-result" }],
        },
        ranker: vi.fn(async () => ({
          orderedIds: ["place-market"],
          rationales: { "place-market": "omit locked stop" },
          foodSelections: [],
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
