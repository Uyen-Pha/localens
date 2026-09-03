import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CUSTOM_REQUEST_SESSION_TTL_MS,
  clearCustomRequestDraft,
  customRequestDraftFromPlanner,
  readCustomRequestDraftState,
  saveCustomRequestDraft,
  type CustomRequestDraftInput,
} from "@/lib/application/planner/custom-request-demo";
import { createDemoPlannerAdapter } from "@/lib/application/planner/demo-planner";
import type { DemoPlannerItem } from "@/lib/application/planner/demo-planner";
import type { PersonalizationRequest } from "@/lib/application/planner/personalization-session";
import {
  clearPersonalizationRequest,
  readPersonalizationState,
  savePersonalizationRequest,
} from "@/lib/application/planner/personalization-session";
import { createFoodFixturePlannerState } from "../../e2e/food-fixture";

type MutableStoredEnvelope = {
  version: number;
  savedAt: number;
  draft: {
    planId: string;
    revision: number;
    integrityFingerprint: string;
    revisionSnapshot: {
      revision: number;
      items: DemoPlannerItem[];
      totals: { durationMinutes: number; costVnd: number };
      warnings: string[];
      feedback: string;
    };
  };
};

const request: PersonalizationRequest = {
  startAt: "2026-09-05T10:30:00+07:00",
  durationMinutes: 240,
  areas: ["demo-hcmc-district-1", "demo-hcmc-district-5"],
  budget: { currency: "VND", amountMinor: 1_500_000 },
  partySize: 3,
  guideLanguage: "en",
  priorityWeights: { street_food: 0, history: 3, traditional_craft: 3, traditional_market: 3 },
  pace: "active",
  dietaryRequirements: ["vegetarian"],
  mobilityRequirements: ["step-free"],
  lockedStopIds: [],
  specialNeeds: "",
};

function draft(): CustomRequestDraftInput {
  const state = createDemoPlannerAdapter().createInitial("en", request);
  return {
    planId: state.planId,
    revision: state.current.revision,
    preferences: request,
    revisionSnapshot: state.current,
  };
}

afterEach(() => {
  clearCustomRequestDraft();
  clearPersonalizationRequest();
});

describe("custom request local handoff", () => {
  it("preserves the exact food-bearing planner revision through the request handoff", () => {
    const plannerState = createFoodFixturePlannerState("en");
    const selectedFood = plannerState.current.items.find((item) => item.foodSelection !== null)?.foodSelection;
    expect(selectedFood).not.toBeNull();

    const selected = customRequestDraftFromPlanner(plannerState);
    expect(selected.revisionSnapshot.items.find((item) => item.foodSelection !== null)?.foodSelection).toMatchObject({
      vendorTitle: "Aunt Ba's Banh Mi Stall",
      menuTitle: "Grilled pork banh mi",
      quantity: 3,
      priceVndMin: 45_000,
      priceVndMax: 60_000,
      paymentMode: "pay_at_vendor",
    });
    expect(saveCustomRequestDraft(selected)).toBe(true);
    expect(readCustomRequestDraftState()).toMatchObject({
      status: "ok",
      draft: { revisionSnapshot: selected.revisionSnapshot },
    });
  });

  it("binds a new draft to the current personalization handoff and derives a stable request id", () => {
    const plannerState = createDemoPlannerAdapter().createInitial("en", request);
    expect(savePersonalizationRequest(request)).toBe(true);
    const firstHandoff = readPersonalizationState();
    expect(firstHandoff.status).toBe("ok");
    expect(saveCustomRequestDraft(customRequestDraftFromPlanner(plannerState))).toBe(true);

    const first = readCustomRequestDraftState();
    expect(first.status).toBe("ok");
    if (first.status !== "ok" || firstHandoff.status !== "ok") throw new Error("expected a bound draft");
    expect(first.draft.handoffId).toBe(firstHandoff.handoffId);
    expect(first.draft.ownerScope).toBe(firstHandoff.ownerScope);
    expect(first.draft.originalExpiresAt).toBe(firstHandoff.originalExpiresAt);
    expect(first.draft.locale).toBe("en");
    expect(first.draft.requestId).toContain(first.draft.handoffId);

    expect(savePersonalizationRequest(request)).toBe(true);
    expect(saveCustomRequestDraft(customRequestDraftFromPlanner(plannerState))).toBe(true);
    const second = readCustomRequestDraftState();
    expect(second.status).toBe("ok");
    if (second.status !== "ok") throw new Error("expected a second bound draft");
    expect(second.draft.handoffId).not.toBe(first.draft.handoffId);
    expect(second.draft.requestId).not.toBe(first.draft.requestId);
  });

  it("round-trips the selected revision in the current browser tab", () => {
    expect(saveCustomRequestDraft(draft())).toBe(true);
    const state = readCustomRequestDraftState();
    expect(state.status).toBe("ok");
    if (state.status === "ok") expect(state.draft.integrityFingerprint).toMatch(/^[0-9a-f]{32}$/);
  });

  it("fails closed for expired or malformed selected revisions", () => {
    const selected = draft();
    expect(saveCustomRequestDraft(selected)).toBe(true);
    const stored = JSON.parse(window.sessionStorage.getItem("localens.custom-request.v1") ?? "{}") as MutableStoredEnvelope;
    window.sessionStorage.setItem("localens.custom-request.v1", JSON.stringify({
      version: 1,
      savedAt: stored.savedAt - CUSTOM_REQUEST_SESSION_TTL_MS - 1,
      draft: stored.draft,
    }));
    expect(readCustomRequestDraftState().status).toBe("expired");

    window.sessionStorage.setItem("localens.custom-request.v1", "not-json");
    expect(readCustomRequestDraftState().status).toBe("invalid");
  });

  it("rejects an empty or tampered revision snapshot before a quote can be derived", () => {
    const selected = draft();
    expect(saveCustomRequestDraft(selected)).toBe(true);
    const stored = JSON.parse(window.sessionStorage.getItem("localens.custom-request.v1") ?? "{}") as MutableStoredEnvelope;
    const tampered = JSON.parse(JSON.stringify(stored)) as typeof stored;
    tampered.draft.revisionSnapshot = {
      ...tampered.draft.revisionSnapshot,
      totals: { ...tampered.draft.revisionSnapshot.totals, costVnd: 1 },
    };
    window.sessionStorage.setItem("localens.custom-request.v1", JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      draft: tampered.draft,
    }));
    expect(readCustomRequestDraftState().status).toBe("invalid");

    tampered.draft.revisionSnapshot = {
      ...tampered.draft.revisionSnapshot,
      items: [],
      totals: { durationMinutes: 0, costVnd: 0 },
    };
    window.sessionStorage.setItem("localens.custom-request.v1", JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      draft: tampered.draft,
    }));
    expect(readCustomRequestDraftState().status).toBe("invalid");
  });

  it("rejects each coordinated snapshot, ordering, plan, or revision edit without a new fingerprint", () => {
    const tamperCases: ReadonlyArray<readonly [string, (draft: MutableStoredEnvelope["draft"]) => void]> = [
      ["coordinated cost edit", (draft) => {
        const items = [...draft.revisionSnapshot.items];
        const firstItem = items[0];
        if (firstItem === undefined) throw new Error("expected at least one generated stop");
        items[0] = { ...firstItem, placeCostVnd: firstItem.placeCostVnd + 10_000 };
        draft.revisionSnapshot = {
          ...draft.revisionSnapshot,
          items,
          totals: { ...draft.revisionSnapshot.totals, costVnd: draft.revisionSnapshot.totals.costVnd + 10_000 },
        };
      }],
      ["ordered place and time edit", (draft) => {
        const items = [...draft.revisionSnapshot.items];
        if (items.length < 2) throw new Error("expected at least two generated stops");
        items.reverse();
        const firstItem = items[0]!;
        items[0] = { ...firstItem, placeId: "forged-place", startAt: "2026-09-05 12:34", endAt: "2026-09-05 13:34" };
        draft.revisionSnapshot = { ...draft.revisionSnapshot, items };
      }],
      ["displayed title and activity edit", (draft) => {
        const items = [...draft.revisionSnapshot.items];
        const firstItem = items[0];
        if (firstItem === undefined) throw new Error("expected at least one generated stop");
        items[0] = { ...firstItem, title: "Forged title", activity: "Forged activity" };
        draft.revisionSnapshot = { ...draft.revisionSnapshot, items };
      }],
      ["plan ID edit", (draft) => {
        draft.planId = "forged-plan";
      }],
      ["revision edit", (draft) => {
        draft.revision = 99;
        draft.revisionSnapshot = { ...draft.revisionSnapshot, revision: 99 };
      }],
    ];

    for (const [label, tamper] of tamperCases) {
      expect(saveCustomRequestDraft(draft())).toBe(true);
      const stored = JSON.parse(window.sessionStorage.getItem("localens.custom-request.v1") ?? "{}") as MutableStoredEnvelope;
      const tampered = JSON.parse(JSON.stringify(stored)) as MutableStoredEnvelope;
      tamper(tampered.draft);
      window.sessionStorage.setItem("localens.custom-request.v1", JSON.stringify(tampered));

      expect(readCustomRequestDraftState().status, label).toBe("invalid");
    }
  });

  it("reports storage errors separately", () => {
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    try {
      expect(readCustomRequestDraftState()).toEqual({ status: "storage-error" });
    } finally {
      getItemSpy.mockRestore();
    }
  });
});
