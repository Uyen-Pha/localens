import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CUSTOM_REQUEST_SESSION_TTL_MS,
  clearCustomRequestDraft,
  readCustomRequestDraftState,
  saveCustomRequestDraft,
  type CustomRequestDraft,
} from "@/lib/application/planner/custom-request-demo";
import { createDemoPlannerAdapter } from "@/lib/application/planner/demo-planner";
import type { PersonalizationRequest } from "@/lib/application/planner/personalization-session";

const request: PersonalizationRequest = {
  startAt: "2026-09-05T10:30:00+07:00",
  durationMinutes: 240,
  areas: ["demo-hcmc-district-1"],
  budget: { currency: "VND", amountMinor: 1_500_000 },
  partySize: 3,
  guideLanguage: "en",
  priorityWeights: { street_food: 5, history: 3, traditional_craft: 0, traditional_market: 0 },
  pace: "active",
  dietaryRequirements: ["vegetarian"],
  mobilityRequirements: ["step-free"],
  lockedStopIds: [],
  specialNeeds: "",
};

function draft(): CustomRequestDraft {
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
});

describe("custom request local handoff", () => {
  it("round-trips the selected revision in the current browser tab", () => {
    expect(saveCustomRequestDraft(draft())).toBe(true);
    expect(readCustomRequestDraftState().status).toBe("ok");
  });

  it("fails closed for expired or malformed selected revisions", () => {
    const selected = draft();
    window.sessionStorage.setItem("localens.custom-request.v1", JSON.stringify({
      version: 1,
      savedAt: Date.now() - CUSTOM_REQUEST_SESSION_TTL_MS - 1,
      draft: selected,
    }));
    expect(readCustomRequestDraftState().status).toBe("expired");

    window.sessionStorage.setItem("localens.custom-request.v1", "not-json");
    expect(readCustomRequestDraftState().status).toBe("invalid");
  });

  it("rejects an empty or tampered revision snapshot before a quote can be derived", () => {
    const selected = draft();
    window.sessionStorage.setItem("localens.custom-request.v1", JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      draft: {
        ...selected,
        revisionSnapshot: {
          ...selected.revisionSnapshot,
          totals: { ...selected.revisionSnapshot.totals, costVnd: 1 },
        },
      },
    }));
    expect(readCustomRequestDraftState().status).toBe("invalid");

    window.sessionStorage.setItem("localens.custom-request.v1", JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      draft: {
        ...selected,
        revisionSnapshot: { ...selected.revisionSnapshot, items: [], totals: { durationMinutes: 0, costVnd: 0 } },
      },
    }));
    expect(readCustomRequestDraftState().status).toBe("invalid");
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
