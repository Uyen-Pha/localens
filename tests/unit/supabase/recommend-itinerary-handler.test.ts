// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { itineraryFixture } from "@/tests/fixtures/itinerary/catalog.v1";
import { recommendItinerary } from "@/lib/application/itinerary/recommend";
import type { ItineraryResult } from "@/lib/domain/itinerary/contracts";
import type { RankRequest } from "@/lib/application/itinerary/ranking-port";
import { computePlannerOperationDigest } from "@/supabase/functions/_shared/planner-operation";
import {
  createRecommendItineraryHandler,
  requestsSemanticallyEqual,
  type RecommendItineraryAdapter,
} from "@/supabase/functions/_shared/recommend-itinerary";

const correlationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const operationId = "10000000-0000-4000-8000-000000000001";
const persistedPlanId = "11111111-1111-4111-8111-111111111111";
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
    operationId,
    input: itineraryFixture.request,
    turnstileToken: "turnstile-token-123456",
    ...overrides,
  };
}

function operationDecision(overrides: Record<string, unknown> = {}) {
  return {
    state: "claimed",
    leaseToken: "20000000-0000-4000-8000-000000000001",
    leaseExpiresAt: "2099-09-05T00:00:00.000Z",
    planId: persistedPlanId,
    plannerReservationId: "20000000-0000-4000-8000-000000000002",
    geminiReservationId: "20000000-0000-4000-8000-000000000003",
    ...overrides,
  };
}

function adapter(overrides: Partial<RecommendItineraryAdapter> = {}): RecommendItineraryAdapter {
  return {
    verifyAccessToken: vi.fn(async () => ({
      ok: true as const,
      principal: { userId: "user-1" },
    })),
    claimOperation: vi.fn(async () => operationDecision()),
    reservePlannerQuota: vi.fn(async () => ({ ok: true as const })),
    rejectOperation: vi.fn(async (_input, errorCode) => ({ state: "rejected", errorCode })),
    readCommittedRevision: vi.fn(async () => ({ ok: false as const, error: { code: "SERVICE_UNAVAILABLE" as const } })),
    readOperationFailure: vi.fn(() => null),
    resolveEngineInput: vi.fn(async () => ({ ok: true as const, input: itineraryFixture })),
    commitRecommendation: vi.fn(async () => ({
      ok: true as const,
      planId: persistedPlanId,
      revision: 1 as const,
    })),
    ...overrides,
  };
}

type RecommendLifecycleOperation = {
  ownerId: string;
  operationId: string;
  requestDigest: string;
  kind: "recommend";
  planId: string;
  baseRevision: null;
  leaseExpiresAt: string;
  leaseToken: string;
  plannerReservationId: string;
  geminiReservationId: string;
  state: "claimed" | "completed" | "rejected" | "interrupted";
  expired: boolean;
  plannerReserved: boolean;
  geminiReserved: boolean;
  errorCode?: "QUOTA_EXCEEDED";
  result?: ItineraryResult;
};

type RecommendLifecycleReservation = {
  operationKey: string;
  kind: "planner" | "gemini";
  reserved: boolean;
};

type RecommendLifecycleContextOperation = NonNullable<
  Parameters<RecommendItineraryAdapter["commitRecommendation"]>[1]["operation"]
>;

function lifecycleUuid(seed: number): string {
  return `30000000-0000-4000-8000-${seed.toString(16).padStart(12, "0")}`;
}

class RecommendLifecycleFake {
  readonly operations = new Map<string, RecommendLifecycleOperation>();
  readonly reservations = new Map<string, RecommendLifecycleReservation>();
  readonly revisions = new Map<string, { ownerId: string; result: ItineraryResult }>();
  plannerQuotaReservations = 0;
  geminiQuotaReservations = 0;
  providerCalls = 0;
  planMutations = 0;
  private nextSerial = 1;

  private key(ownerId: string, operationId: string): string {
    return `${ownerId}:${operationId}`;
  }

  private revisionKey(planId: string, revision: number): string {
    return `${planId}:${revision}`;
  }

  claim(ownerId: string, input: Parameters<RecommendItineraryAdapter["claimOperation"]>[0]) {
    const key = this.key(ownerId, input.operationId);
    const existing = this.operations.get(key);
    if (existing === undefined) {
      const serial = this.nextSerial;
      this.nextSerial += 1;
      const operation: RecommendLifecycleOperation = {
        ownerId,
        operationId: input.operationId,
        requestDigest: input.requestDigest,
        kind: "recommend",
        planId: lifecycleUuid(100 + serial),
        baseRevision: null,
        leaseExpiresAt: "2099-09-05T00:00:00.000Z",
        leaseToken: lifecycleUuid(200 + serial),
        plannerReservationId: lifecycleUuid(300 + serial),
        geminiReservationId: lifecycleUuid(400 + serial),
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
      return { state: "completed" as const, planId: existing.planId, revision: 1 };
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
    operation: NonNullable<Parameters<RecommendItineraryAdapter["commitRecommendation"]>[1]["operation"]>,
    result: ItineraryResult,
  ) {
    const current = this.operations.get(this.key(ownerId, operation.operationId));
    if (
      current === undefined
      || current.requestDigest !== operation.requestDigest
      || current.kind !== operation.kind
      || current.planId !== operation.planId
      || current.plannerReservationId !== operation.plannerReservationId
      || current.geminiReservationId !== operation.geminiReservationId
    ) {
      return { ok: false as const, decision: { state: "conflict" as const } };
    }
    if (current.state === "completed" && current.result !== undefined) {
      return { ok: true as const, planId: current.planId, revision: 1 as const };
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
    this.revisions.set(this.revisionKey(current.planId, 1), { ownerId, result });
    return { ok: true as const, planId: current.planId, revision: 1 as const };
  }

  reject(ownerId: string, input: { operationId: string; requestDigest: string }, errorCode: "QUOTA_EXCEEDED") {
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
    if (revision?.ownerId !== ownerId || input.revision !== 1) {
      return { ok: false as const, error: { code: "SERVICE_UNAVAILABLE" as const } };
    }
    return {
      ok: true as const,
      planId: input.planId,
      revision: 1,
      rankingSource: revision.result.rankingSource,
      result: revision.result,
    };
  }

  expire(ownerId: string, operationId: string): void {
    const operation = this.operations.get(this.key(ownerId, operationId));
    if (operation !== undefined) operation.expired = true;
  }

  stateFor(ownerId: string, operationId: string): RecommendLifecycleOperation | undefined {
    return this.operations.get(this.key(ownerId, operationId));
  }

  operationFor(ownerId: string, operationId: string): RecommendLifecycleOperation | undefined {
    const operation = this.stateFor(ownerId, operationId);
    return operation === undefined ? undefined : structuredClone(operation);
  }
}

function lifecycleEndpoint(
  model: RecommendLifecycleFake,
  ownerId: string,
  options: { loseCommitResponse?: boolean; abortAfterClaim?: boolean } = {},
) {
  let activeOperation: RecommendLifecycleContextOperation | null = null;
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
            kind: "recommend",
            leaseToken: decision.leaseToken,
            leaseExpiresAt: decision.leaseExpiresAt,
            planId: decision.planId,
            baseRevision: null,
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
    resolveEngineInput: vi.fn(async () => ({ ok: true as const, input: itineraryFixture })),
    ranker: vi.fn(async (rankRequest: RankRequest) => {
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
    readCommittedRevision: vi.fn(async (input) => model.read(ownerId, input)),
    readOperationFailure: vi.fn(() => operationFailure),
    commitRecommendation: vi.fn(async (commit, context) => {
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
    handler: createRecommendItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
      requireAuthenticated: true,
    }),
  };
}

describe("recommend-itinerary Edge handler contract", () => {
  it("requires an operation UUID before any adapter side effect", async () => {
    const service = adapter();
    const body = validBody();
    delete (body as Record<string, unknown>).operationId;
    const handler = createRecommendItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(body));

    expect(response.status).toBe(400);
    expect(service.resolveEngineInput).not.toHaveBeenCalled();
    expect(service.commitRecommendation).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_REQUEST",
      messageKey: "planner.invalid_request",
      correlationId,
    });
  });

  it("claims before quota and recommendation work, binding stable server reservations to the operation", async () => {
    const calls: string[] = [];
    const claimOperation = vi.fn(async (input: Record<string, unknown>) => {
      calls.push("claim");
      expect(input).toMatchObject({
        operationId,
        kind: "recommend",
        targetPlanId: null,
        baseRevision: null,
        requestDigest: await computePlannerOperationDigest("recommend", itineraryFixture.request),
      });
      return operationDecision();
    });
    const reservePlannerQuota = vi.fn(async (reservationId: string) => {
      calls.push("planner-quota");
      expect(reservationId).toBe("20000000-0000-4000-8000-000000000002");
      return { ok: true as const };
    });
    const service = adapter({
      claimOperation,
      reservePlannerQuota,
      validateQuotaIdentity: vi.fn(async () => {
        calls.push("quota-identity");
        return { ok: true as const };
      }),
      rejectOperation: vi.fn(async () => ({ state: "rejected", errorCode: "QUOTA_EXCEEDED" })),
      readCommittedRevision: vi.fn(),
      readOperationFailure: vi.fn(() => null),
      resolveEngineInput: vi.fn(async (...args) => {
        calls.push("resolve");
        expect(args[1]).toMatchObject({
          operation: expect.objectContaining({
            operationId,
            plannerReservationId: "20000000-0000-4000-8000-000000000002",
            geminiReservationId: "20000000-0000-4000-8000-000000000003",
          }),
        });
        return { ok: true as const, input: itineraryFixture };
      }),
      commitRecommendation: vi.fn(async (...args) => {
        calls.push("commit");
        expect(args[1]).toMatchObject({
          operation: expect.objectContaining({ operationId, leaseToken: "20000000-0000-4000-8000-000000000001" }),
        });
        return { ok: true as const, planId: persistedPlanId, revision: 1 as const };
      }),
    } as unknown as Partial<RecommendItineraryAdapter>);
    const handler = createRecommendItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody()));

    expect(response.status).toBe(200);
    expect(calls).toEqual(["quota-identity", "claim", "planner-quota", "resolve", "commit"]);
    expect(claimOperation).toHaveBeenCalledTimes(1);
    expect(reservePlannerQuota).toHaveBeenCalledTimes(1);
  });

  it("replays the exact completed revision without resolver, quota, provider, or commit work", async () => {
    const generated = await recommendItinerary(itineraryFixture);
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;
    const completed = {
      state: "completed",
      planId: persistedPlanId,
      revision: 1,
    };
    const resolveEngineInput = vi.fn();
    const commitRecommendation = vi.fn();
    const claimOperation = vi.fn(async () => completed);
    const readCommittedRevision = vi.fn(async () => ({
      ok: true as const,
      planId: persistedPlanId,
      revision: 1,
      rankingSource: "deterministic" as const,
      result: generated.value.result,
    }));
    const service = adapter({
      claimOperation,
      validateQuotaIdentity: vi.fn(async () => ({ ok: true as const })),
      reservePlannerQuota: vi.fn(),
      rejectOperation: vi.fn(),
      readCommittedRevision,
      readOperationFailure: vi.fn(() => null),
      resolveEngineInput,
      commitRecommendation,
    } as unknown as Partial<RecommendItineraryAdapter>);
    const handler = createRecommendItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ planId: persistedPlanId, revision: 1, advisoryOnly: true });
    expect(claimOperation).toHaveBeenCalledTimes(1);
    expect(readCommittedRevision).toHaveBeenCalledWith(
      { planId: persistedPlanId, revision: 1 },
      expect.objectContaining({ principal: null }),
    );
    expect(resolveEngineInput).not.toHaveBeenCalled();
    expect(commitRecommendation).not.toHaveBeenCalled();
  });

  it("maps non-claimed operation decisions before quota, provider, or persistence work", async () => {
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
        decision: { state: "rejected", errorCode: "NO_FEASIBLE_ITINERARY" },
        status: 422,
        code: "NO_FEASIBLE_ITINERARY",
        operationState: "rejected",
        retryable: false,
      },
    ] as const;

    for (const testCase of cases) {
      const service = adapter({
        claimOperation: vi.fn(async () => testCase.decision),
        reservePlannerQuota: vi.fn(),
        resolveEngineInput: vi.fn(),
        commitRecommendation: vi.fn(),
        ranker: vi.fn(),
      });
      const handler = createRecommendItineraryHandler(service, {
        policy,
        correlationIdFactory: () => correlationId,
      });

      const response = await handler(request(validBody()));
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
      expect(service.resolveEngineInput).not.toHaveBeenCalled();
      expect(service.commitRecommendation).not.toHaveBeenCalled();
      expect(service.ranker).not.toHaveBeenCalled();
    }
  });

  it("returns a same-key digest conflict before any recommendation side effect", async () => {
    const changedInput = {
      ...itineraryFixture.request,
      pace: itineraryFixture.request.pace === "active" ? "balanced" : "active",
    };
    const claimOperation = vi.fn(async (claim: Parameters<RecommendItineraryAdapter["claimOperation"]>[0]) => {
      expect(claim).toMatchObject({
        operationId,
        kind: "recommend",
        requestDigest: await computePlannerOperationDigest("recommend", changedInput),
      });
      return { state: "conflict" };
    });
    const service = adapter({
      claimOperation,
      reservePlannerQuota: vi.fn(),
      resolveEngineInput: vi.fn(),
      commitRecommendation: vi.fn(),
      ranker: vi.fn(),
    });
    const handler = createRecommendItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody({ input: changedInput })));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      code: "OPERATION_CONFLICT",
      messageKey: "planner.operation_conflict",
      retryable: false,
      correlationId,
    });
    expect(body).not.toHaveProperty("operationState");
    expect(service.reservePlannerQuota).not.toHaveBeenCalled();
    expect(service.resolveEngineInput).not.toHaveBeenCalled();
    expect(service.commitRecommendation).not.toHaveBeenCalled();
    expect(service.ranker).not.toHaveBeenCalled();
  });

  it("persists quota refusal and replays the rejection without a second reservation", async () => {
    const claimOperation = vi.fn()
      .mockResolvedValueOnce(operationDecision())
      .mockResolvedValueOnce({ state: "rejected", errorCode: "QUOTA_EXCEEDED" });
    const reservePlannerQuota = vi.fn(async () => ({
      ok: false as const,
      kind: "rejected" as const,
      code: "QUOTA_EXCEEDED" as const,
    }));
    const rejectOperation = vi.fn(async () => ({ state: "rejected", errorCode: "QUOTA_EXCEEDED" }));
    const service = adapter({
      claimOperation,
      reservePlannerQuota,
      rejectOperation,
      resolveEngineInput: vi.fn(),
      commitRecommendation: vi.fn(),
      ranker: vi.fn(),
    });
    const handler = createRecommendItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const first = await handler(request(validBody()));
    const second = await handler(request(validBody()));
    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(first.status).toBe(429);
    expect(second.status).toBe(429);
    expect(firstBody).toMatchObject({
      code: "QUOTA_EXCEEDED",
      messageKey: "recommendation.quota_exceeded",
      retryable: true,
      operationState: "rejected",
      correlationId,
    });
    expect(secondBody).toEqual(firstBody);
    expect(claimOperation).toHaveBeenCalledTimes(2);
    expect(reservePlannerQuota).toHaveBeenCalledTimes(1);
    expect(rejectOperation).toHaveBeenCalledTimes(1);
    expect(service.resolveEngineInput).not.toHaveBeenCalled();
    expect(service.commitRecommendation).not.toHaveBeenCalled();
    expect(service.ranker).not.toHaveBeenCalled();
  });

  it("maps the production code-less quota transport failure to the frozen service tuple", async () => {
    const service = adapter({
      reservePlannerQuota: vi.fn(async () => ({ ok: false as const, kind: "unavailable" as const })),
    });
    const handler = createRecommendItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody()));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      code: "SERVICE_UNAVAILABLE",
      messageKey: "planner.service_unavailable",
      retryable: true,
      correlationId,
    });
    expect(body).not.toHaveProperty("operationState");
    expect(service.resolveEngineInput).not.toHaveBeenCalled();
    expect(service.commitRecommendation).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "requires a challenge",
      validate: async () => ({ ok: false as const, error: { code: "CHALLENGE_REQUIRED" as const } }),
      status: 400,
      code: "CHALLENGE_REQUIRED",
      messageKey: "recommendation.challenge_required",
    },
    {
      label: "rejects an invalid challenge",
      validate: async () => ({ ok: false as const, error: { code: "CHALLENGE_INVALID" as const } }),
      status: 403,
      code: "CHALLENGE_INVALID",
      messageKey: "recommendation.challenge_invalid",
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
      validateQuotaIdentity: vi.fn(testCase.validate) as RecommendItineraryAdapter["validateQuotaIdentity"],
      ranker: vi.fn(),
    });
    const handler = createRecommendItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody()));
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
    expect(service.resolveEngineInput).not.toHaveBeenCalled();
    expect(service.ranker).not.toHaveBeenCalled();
    expect(service.commitRecommendation).not.toHaveBeenCalled();
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
      claimOperation: vi.fn(async () => ({ state: "completed" as const, planId: persistedPlanId, revision: 1 })),
      readCommittedRevision: vi.fn(read) as RecommendItineraryAdapter["readCommittedRevision"],
    });
    const handler = createRecommendItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody()));
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
      commitRecommendation: vi.fn(async () => { throw new Error("commit response lost"); }),
    });
    const handler = createRecommendItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody()));
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
      label: "a locked-stop UUID",
      body: {
        input: {
          ...itineraryFixture.request,
          lockedStopIds: ["abcdefab-cdef-4abc-8def-abcdefabcdef".toUpperCase()],
        },
      },
    },
  ])("rejects uppercase UUIDs in $label before claim or side effects", async ({ body }) => {
    const service = adapter();
    const handler = createRecommendItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody(body)));
    const responseBody = await response.json();

    expect(response.status).toBe(400);
    expect(responseBody).toMatchObject({
      code: "INVALID_REQUEST",
      messageKey: "planner.invalid_request",
      retryable: false,
      correlationId,
    });
    expect(responseBody).not.toHaveProperty("operationState");
    expect(service.claimOperation).not.toHaveBeenCalled();
    expect(service.reservePlannerQuota).not.toHaveBeenCalled();
    expect(service.resolveEngineInput).not.toHaveBeenCalled();
    expect(service.commitRecommendation).not.toHaveBeenCalled();
  });

  it("reconciles response loss through fresh owner-scoped requests", async () => {
    const model = new RecommendLifecycleFake();
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
    expect(first.adapter.resolveEngineInput).toHaveBeenCalledTimes(1);
    expect(first.adapter.commitRecommendation).toHaveBeenCalledTimes(1);
    expect(first.adapter.ranker).toHaveBeenCalledTimes(1);

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
      planId: firstState?.planId,
      revision: 1,
      advisoryOnly: true,
    });
    expect(retry.adapter.claimOperation).toHaveBeenCalledTimes(1);
    expect(retry.adapter.readCommittedRevision).toHaveBeenCalledTimes(1);
    expect(retry.adapter.reservePlannerQuota).not.toHaveBeenCalled();
    expect(retry.adapter.resolveEngineInput).not.toHaveBeenCalled();
    expect(retry.adapter.ranker).not.toHaveBeenCalled();
    expect(retry.adapter.commitRecommendation).not.toHaveBeenCalled();
    expect(model.plannerQuotaReservations).toBe(countsAfterLost.planner);
    expect(model.geminiQuotaReservations).toBe(countsAfterLost.gemini);
    expect(model.providerCalls).toBe(countsAfterLost.provider);
    expect(model.planMutations).toBe(countsAfterLost.mutations);

    const otherOwner = lifecycleEndpoint(model, "user-2");
    const otherResponse = await otherOwner.handler(request(validBody(), authHeaders));
    const otherBody = await otherResponse.json();
    const otherState = model.stateFor("user-2", operationId);
    expect(otherResponse.status).toBe(200);
    expect(otherBody).toMatchObject({ advisoryOnly: true, revision: 1 });
    expect(otherBody.planId).not.toBe(replayBody.planId);
    expect(otherState?.planId).toBe(otherBody.planId);
    expect(otherState?.plannerReservationId).not.toBe(firstState?.plannerReservationId);
    expect(otherState?.geminiReservationId).not.toBe(firstState?.geminiReservationId);
    expect(model.plannerQuotaReservations).toBe(2);
    expect(model.geminiQuotaReservations).toBe(2);
    expect(model.providerCalls).toBe(2);
    expect(model.planMutations).toBe(2);

    const oldOperationId = "10000000-0000-4000-8000-000000000002";
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
    const staleCommit = await stalled.adapter.commitRecommendation(
      { input: itineraryFixture, result: replayBody.proposal as ItineraryResult },
      {
        correlationId,
        principal: { userId: "user-1" },
        guestToken: null,
        turnstileToken: null,
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
    expect(model.planMutations).toBe(2);
  });

  it("compares request objects semantically while preserving array order", () => {
    const reordered = {
      lockedStopIds: itineraryFixture.request.lockedStopIds,
      mobilityRequirements: itineraryFixture.request.mobilityRequirements,
      dietaryRequirements: itineraryFixture.request.dietaryRequirements,
      pace: itineraryFixture.request.pace,
      priorityWeights: {
        traditional_market: itineraryFixture.request.priorityWeights.traditional_market,
        traditional_craft: itineraryFixture.request.priorityWeights.traditional_craft,
        history: itineraryFixture.request.priorityWeights.history,
        street_food: itineraryFixture.request.priorityWeights.street_food,
      },
      guideLanguage: itineraryFixture.request.guideLanguage,
      partySize: itineraryFixture.request.partySize,
      budget: itineraryFixture.request.budget,
      areas: itineraryFixture.request.areas,
      durationMinutes: itineraryFixture.request.durationMinutes,
      startAt: itineraryFixture.request.startAt,
    };

    expect(requestsSemanticallyEqual(itineraryFixture.request, reordered)).toBe(true);
    expect(requestsSemanticallyEqual(
      { ...reordered, areas: [...itineraryFixture.request.areas].reverse() },
      itineraryFixture.request,
    )).toBe(false);
  });

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
      planId: persistedPlanId,
      revision: 1,
      proposal: {
        rankingSource: "deterministic",
        budgetVnd: "2000000",
      },
    });
    expect(Number(body.proposal.totals.groupCostVnd)).toBeLessThanOrEqual(Number(body.proposal.budgetVnd));
    expect(body).not.toHaveProperty("bookingId");
    expect(service.verifyAccessToken).not.toHaveBeenCalled();
    expect(service.resolveEngineInput).toHaveBeenCalledWith(
      itineraryFixture.request,
      expect.objectContaining({
        correlationId,
        principal: null,
        guestToken: null,
        turnstileToken: "turnstile-token-123456",
        operation: expect.objectContaining({ operationId }),
      }),
    );
    expect(service.commitRecommendation).toHaveBeenCalledTimes(1);
  });

  it("serializes every validated VND money field as a canonical decimal string on the wire", async () => {
    const handler = createRecommendItineraryHandler(adapter(), {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const body = await (await handler(request(validBody()))).json();

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

  it("requires a verified customer before resolving an authoritative snapshot", async () => {
    const service = adapter();
    const handler = createRecommendItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
      requireAuthenticated: true,
    });

    const response = await handler(request(validBody()));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "AUTH_REQUIRED",
      messageKey: "planner.auth_required",
      retryable: false,
      correlationId,
    });
    expect(service.resolveEngineInput).not.toHaveBeenCalled();
    expect(service.commitRecommendation).not.toHaveBeenCalled();
  });

  it("persists a validated authenticated proposal and returns only its public plan binding", async () => {
    const service = adapter();
    const handler = createRecommendItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
      requireAuthenticated: true,
    });

    const response = await handler(request(validBody({ turnstileToken: undefined }), {
      Authorization: "Bearer user-token-123",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ planId: persistedPlanId, revision: 1 });
    expect(Object.keys(body).sort()).toEqual([
      "advisoryOnly",
      "degraded",
      "messageKey",
      "planId",
      "proposal",
      "rationales",
      "revision",
    ]);
    expect(service.resolveEngineInput).toHaveBeenCalledWith(
      itineraryFixture.request,
      expect.objectContaining({
        correlationId,
        principal: { userId: "user-1" },
        guestToken: null,
        turnstileToken: null,
        operation: expect.objectContaining({ operationId }),
      }),
    );
    expect(service.commitRecommendation).toHaveBeenCalledWith(
      {
        input: itineraryFixture,
        result: expect.objectContaining({ rankingSource: "deterministic" }),
      },
      expect.objectContaining({
        correlationId,
        principal: { userId: "user-1" },
        guestToken: null,
        turnstileToken: null,
        operation: expect.objectContaining({ operationId }),
      }),
    );
  });

  it("rejects a persistence result that does not bind a new plan to revision one", async () => {
    const service = adapter({
      commitRecommendation: vi.fn(async () => ({
        ok: true as const,
        planId: persistedPlanId,
        revision: 2,
      })) as unknown as RecommendItineraryAdapter["commitRecommendation"],
    });
    const handler = createRecommendItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
      requireAuthenticated: true,
    });

    const response = await handler(request(validBody(), {
      Authorization: "Bearer user-token-123",
    }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      code: "ADAPTER_INVALID",
      retryable: false,
      correlationId,
    });
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
      expect.objectContaining({
        correlationId,
        principal: { userId: "user-1" },
        guestToken: "guest-token-123456",
        turnstileToken: "turnstile-token-123456",
        operation: expect.objectContaining({ operationId }),
      }),
    );
    expect(service.verifyAccessToken).toHaveBeenCalledWith("user-token-123", correlationId);

    const invalidAuth = await handler(request(validBody(), { Authorization: "Basic secret" }));
    expect(invalidAuth.status).toBe(401);
    expect(service.resolveEngineInput).toHaveBeenCalledTimes(1);
    await expect(invalidAuth.json()).resolves.toMatchObject({
      code: "AUTH_EXPIRED",
      messageKey: "planner.auth_expired",
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
      messageKey: "planner.invalid_request",
      retryable: false,
      correlationId,
      fieldErrors: {
        turnstileToken: "gateway.invalid_request",
      },
    });
  });

  it("rejects a service snapshot whose request differs from the customer request", async () => {
    const rejectOperation = vi.fn(async () => ({
      state: "rejected" as const,
      errorCode: "SNAPSHOT_MISMATCH" as const,
    }));
    const mismatched = {
      ...itineraryFixture,
      request: { ...itineraryFixture.request, areas: ["district-forged"] },
    };
    const handler = createRecommendItineraryHandler(adapter({
      resolveEngineInput: vi.fn(async () => ({ ok: true as const, input: mismatched })),
      rejectOperation,
    }), {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody()));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "SNAPSHOT_MISMATCH",
      messageKey: "refinement.snapshot_mismatch",
      retryable: false,
      operationState: "rejected",
      correlationId,
    });
    expect(rejectOperation).toHaveBeenCalledWith(
      expect.objectContaining({ operationId }),
      "SNAPSHOT_MISMATCH",
      expect.objectContaining({ operation: expect.objectContaining({ operationId }) }),
    );
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

  it("verifies a Bearer token before resolver use and fails closed for invalid credentials", async () => {
    const service = adapter({
      verifyAccessToken: vi.fn(async () => ({
        ok: false as const,
        error: { code: "AUTH_EXPIRED" as const },
      })),
    });
    const handler = createRecommendItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody(), { Authorization: "Bearer invalid-jwt" }));

    expect(response.status).toBe(401);
    expect(service.verifyAccessToken).toHaveBeenCalledWith("invalid-jwt", correlationId);
    expect(service.resolveEngineInput).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body).toMatchObject({
      code: "AUTH_EXPIRED",
      messageKey: "planner.auth_expired",
      retryable: false,
      correlationId,
    });
    expect(JSON.stringify(body)).not.toContain("invalid-jwt");
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
            commitRecommendation: vi.fn(async () => ({
              ok: false as const,
              error: { code: "SERVICE_UNAVAILABLE" as const },
            })),
          }
        : {
            ranker: vi.fn(async () => {
              throw new Error("provider response lost");
            }),
          }),
    });
    const handler = createRecommendItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody()));
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
    const service = adapter({ claimOperation: vi.fn(claim) as RecommendItineraryAdapter["claimOperation"] });
    const handler = createRecommendItineraryHandler(service, {
      policy,
      correlationIdFactory: () => correlationId,
    });

    const response = await handler(request(validBody()));
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
        foodSelections: [],
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
