import { afterEach, describe, expect, it } from "vitest";

import {
  clearPersonalizationRequest,
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
};

afterEach(() => {
  clearPersonalizationRequest();
});

describe("personalization session contract", () => {
  it("round-trips a validated request within the current browser tab", () => {
    savePersonalizationRequest(request);

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

  it("removes a stale request without touching unrelated session data", () => {
    window.sessionStorage.setItem("other-key", "keep");
    savePersonalizationRequest(request);

    clearPersonalizationRequest();

    expect(readPersonalizationRequest()).toBeNull();
    expect(window.sessionStorage.getItem("other-key")).toBe("keep");
  });
});
