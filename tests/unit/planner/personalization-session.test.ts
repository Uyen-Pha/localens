import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearPersonalizationRequest,
  PERSONALIZATION_SESSION_TTL_MS,
  readPersonalizationState,
  readPersonalizationRequest,
  savePersonalizationRequest,
  type PersonalizationRequest,
} from "@/lib/application/planner/personalization-session";

const request: PersonalizationRequest = {
  startAt: "2026-09-05T10:30:00+07:00",
  durationMinutes: 240,
  areas: ["demo-hcmc-district-1", "demo-hcmc-district-5"],
  budget: { currency: "VND", amountMinor: 1_500_000 },
  partySize: 3,
  guideLanguage: "vi",
  priorityWeights: {
    street_food: 5,
    history: 3,
    traditional_craft: 1,
    traditional_market: 4,
  },
  pace: "active",
  dietaryRequirements: ["vegetarian"],
  mobilityRequirements: ["step-free"],
  lockedStopIds: [],
  specialNeeds: "Prefer a quiet route.",
};

afterEach(() => {
  clearPersonalizationRequest();
});

describe("personalization session contract", () => {
  it("distinguishes a genuinely missing handoff from an invalid payload", () => {
    expect(readPersonalizationState()).toEqual({ status: "missing" });

    window.sessionStorage.setItem("localens.personalization.v1", JSON.stringify({
      startAt: request.startAt,
      durationMinutes: "240",
    }));

    expect(readPersonalizationState()).toEqual({ status: "invalid" });
  });

  it("round-trips a validated request within the current browser tab", () => {
    expect(savePersonalizationRequest(request)).toBe(true);

    expect(readPersonalizationRequest()).toEqual(request);
  });

  it("fails closed when session data is not a valid request", () => {
    window.sessionStorage.setItem("localens.personalization.v1", JSON.stringify({
      startAt: request.startAt,
      durationMinutes: "240",
    }));

    expect(readPersonalizationRequest()).toBeNull();
  });

  it("fails closed for an impossible calendar date", () => {
    window.sessionStorage.setItem("localens.personalization.v1", JSON.stringify({
      ...request,
      startAt: "2026-02-30T10:30:00+07:00",
    }));

    expect(readPersonalizationRequest()).toBeNull();
  });

  it("expires a saved request after the short handoff TTL", () => {
    window.sessionStorage.setItem("localens.personalization.v1", JSON.stringify({
      version: 1,
      savedAt: Date.now() - PERSONALIZATION_SESSION_TTL_MS - 1,
      request,
    }));

    expect(readPersonalizationState()).toEqual({ status: "expired" });
    expect(readPersonalizationRequest()).toBeNull();
    expect(window.sessionStorage.getItem("localens.personalization.v1")).toBeNull();
  });

  it("reads a current versioned envelope and preserves its request payload", () => {
    window.sessionStorage.setItem("localens.personalization.v1", JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      request,
    }));

    expect(readPersonalizationRequest()).toEqual(request);
  });

  it("reports storage errors instead of treating them as a missing handoff", () => {
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });

    try {
      expect(readPersonalizationState()).toEqual({ status: "storage-error" });
    } finally {
      getItemSpy.mockRestore();
    }
  });

  it("removes a stale request without touching unrelated session data", () => {
    window.sessionStorage.setItem("other-key", "keep");
    savePersonalizationRequest(request);

    clearPersonalizationRequest();

    expect(readPersonalizationRequest()).toBeNull();
    expect(window.sessionStorage.getItem("other-key")).toBe("keep");
  });
});
