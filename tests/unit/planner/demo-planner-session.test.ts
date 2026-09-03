import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createDemoPlannerAdapter,
  type DemoPlannerState,
} from "@/lib/application/planner/demo-planner";
import {
  DEMO_PLANNER_SESSION_KEY,
  PERSONALIZATION_SESSION_TTL_MS,
  clearPersonalizationRequest,
  readPersonalizationState,
  savePersonalizationRequest,
  type PersonalizationRequest,
} from "@/lib/application/planner/personalization-session";
import {
  claimDemoPlannerSessionForReturn,
  prepareDemoPlannerReturn,
  readDemoPlannerSession,
  saveDemoPlannerSession,
} from "@/lib/application/planner/demo-planner-session";
import { totalsFor } from "@/lib/application/planner/e2e-planner-state-validator";

const NOW = Date.now() + 10_000;
const personalization: PersonalizationRequest = {
  startAt: "2026-09-05T10:30:00+07:00",
  durationMinutes: 240,
  areas: ["demo-hcmc-district-1"],
  budget: { currency: "VND" as const, amountMinor: 1_500_000 },
  partySize: 2,
  guideLanguage: "en" as const,
  priorityWeights: { street_food: 0, history: 3, traditional_craft: 0, traditional_market: 1 },
  pace: "active" as const,
  dietaryRequirements: [],
  mobilityRequirements: [],
  lockedStopIds: [],
  specialNeeds: "",
};

function state(): DemoPlannerState {
  return createDemoPlannerAdapter().createInitial("en");
}

function sessionFor(
  plannerState: unknown,
  overrides: Partial<Record<string, unknown>> = {},
): string {
  const createdAt = NOW - 1_000;
  return JSON.stringify({
    version: 1,
    handoffId: "handoff-test",
    ownerScope: "anonymous",
    createdAt,
    originalExpiresAt: createdAt + PERSONALIZATION_SESSION_TTL_MS,
    locale: "en",
    state: plannerState,
    operations: [],
    ...overrides,
  });
}

afterEach(() => {
  window.sessionStorage.removeItem(DEMO_PLANNER_SESSION_KEY);
  clearPersonalizationRequest();
  vi.restoreAllMocks();
});

describe("demo planner session contract", () => {
  it("rejects a structured state with missing planner facts", () => {
    const plannerState = state();
    const invalidState = {
      ...plannerState,
      current: { ...plannerState.current, totals: undefined },
    };
    window.sessionStorage.setItem(DEMO_PLANNER_SESSION_KEY, sessionFor(invalidState));

    expect(readDemoPlannerSession(NOW)).toEqual({ status: "invalid" });
  });

  it("accepts and persists a valid empty proposal state", () => {
    const plannerState = state();
    const emptyState: DemoPlannerState = {
      ...plannerState,
      current: { ...plannerState.current, items: [], totals: totalsFor([]) },
    };

    expect(saveDemoPlannerSession(emptyState, {
      type: "refine",
      feedback: "No feasible route.",
      lockedItemIds: [],
      resultRevision: emptyState.current.revision,
    }, "anonymous", NOW)).toBe(true);
    expect(readDemoPlannerSession(NOW).status).toBe("ok");
  });

  it("uses the original expiry as a fixed TTL and rejects future-dated envelopes", () => {
    const plannerState = state();
    const createdAt = NOW - PERSONALIZATION_SESSION_TTL_MS - 1_000;
    window.sessionStorage.setItem(DEMO_PLANNER_SESSION_KEY, sessionFor(plannerState, {
      createdAt,
      originalExpiresAt: createdAt + PERSONALIZATION_SESSION_TTL_MS,
    }));
    expect(readDemoPlannerSession(NOW)).toEqual({ status: "expired" });

    window.sessionStorage.setItem(DEMO_PLANNER_SESSION_KEY, sessionFor(plannerState, {
      createdAt: NOW + 1,
      originalExpiresAt: NOW + 1 + PERSONALIZATION_SESSION_TTL_MS,
    }));
    expect(readDemoPlannerSession(NOW)).toEqual({ status: "invalid" });
  });

  it("does not slide the expiry when another operation is saved", () => {
    const plannerState = state();
    expect(saveDemoPlannerSession(plannerState, {
      type: "lock",
      itemId: plannerState.current.items[0].id,
      locked: true,
      resultRevision: plannerState.current.revision,
    }, "anonymous", NOW)).toBe(true);

    const almostExpired = NOW + PERSONALIZATION_SESSION_TTL_MS - 1;
    expect(saveDemoPlannerSession(plannerState, {
      type: "lock",
      itemId: plannerState.current.items[0].id,
      locked: false,
      resultRevision: plannerState.current.revision,
    }, "anonymous", almostExpired)).toBe(true);
    expect(readDemoPlannerSession(NOW + PERSONALIZATION_SESSION_TTL_MS)).toEqual({ status: "expired" });
  });

  it("does not hydrate a session owned by another browser identity", () => {
    const plannerState = state();
    expect(saveDemoPlannerSession(plannerState, {
      type: "lock",
      itemId: plannerState.current.items[0].id,
      locked: true,
      resultRevision: plannerState.current.revision,
    }, "customer:one", NOW)).toBe(true);

    expect(readDemoPlannerSession(NOW, "customer:two")).toEqual({ status: "owner-mismatch" });
    expect(readDemoPlannerSession(NOW, "customer:one").status).toBe("ok");
  });

  it("reuses the personalization handoff identity when the planner session starts", () => {
    const plannerState = createDemoPlannerAdapter().createInitial("en", personalization);
    expect(savePersonalizationRequest(personalization)).toBe(true);
    const handoff = readPersonalizationState();
    if (handoff.status !== "ok") throw new Error("expected a personalization handoff");

    expect(saveDemoPlannerSession(plannerState, {
      type: "lock",
      itemId: plannerState.current.items[0].id,
      locked: true,
      resultRevision: plannerState.current.revision,
    }, "anonymous", NOW)).toBe(true);
    const saved = readDemoPlannerSession(NOW);
    expect(saved.status).toBe("ok");
    if (saved.status !== "ok") throw new Error("expected a saved planner handoff");
    expect(saved.session.handoffId).toBe(handoff.handoffId);
    expect(saved.session.originalExpiresAt).toBe(handoff.originalExpiresAt);
  });

  it("claims an anonymous session only once for the exact post-sign-in path", () => {
    const plannerState = state();
    expect(saveDemoPlannerSession(plannerState, {
      type: "lock",
      itemId: plannerState.current.items[0].id,
      locked: true,
      resultRevision: plannerState.current.revision,
    }, "anonymous", NOW)).toBe(true);
    const saved = readDemoPlannerSession(NOW);
    if (saved.status !== "ok") throw new Error("expected a saved planner handoff");

    expect(prepareDemoPlannerReturn("/en/planner/", saved.session.handoffId, saved.session.originalExpiresAt)).toBe(true);
    const claimed = claimDemoPlannerSessionForReturn("/en/planner/", "customer:one", NOW + 1);
    expect(claimed.status).toBe("ok");
    if (claimed.status !== "ok") throw new Error("expected a claimed planner handoff");
    expect(claimed.session.ownerScope).toBe("customer:one");
    expect(claimDemoPlannerSessionForReturn("/en/planner/", "customer:two", NOW + 2)).toEqual({ status: "missing" });

    expect(prepareDemoPlannerReturn("/en/planner/", claimed.session.handoffId, claimed.session.originalExpiresAt)).toBe(true);
    expect(claimDemoPlannerSessionForReturn("/en/planner/other", "customer:two", NOW + 3)).toEqual({ status: "invalid" });
    expect(readDemoPlannerSession(NOW + 3, "customer:one").status).toBe("ok");
  });

  it("fails closed when storage rejects the write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    const plannerState = state();

    expect(saveDemoPlannerSession(plannerState, {
      type: "lock",
      itemId: plannerState.current.items[0].id,
      locked: true,
      resultRevision: plannerState.current.revision,
    }, "anonymous", NOW)).toBe(false);
  });
});
