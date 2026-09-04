import { describe, expect, it } from "vitest";

import {
  type RuntimePlannerPort,
  type RuntimePlannerProposal,
} from "@/lib/application/planner/runtime-planner";
import {
  toItineraryRequest,
  type PersonalizationRequest,
} from "@/lib/application/planner/personalization-session";
import type { Result } from "@/lib/domain/itinerary/contracts";

const personalizationWithSpecialNeeds: PersonalizationRequest = {
  startAt: "2026-09-05T10:30:00+07:00",
  durationMinutes: 240,
  areas: ["district-1"],
  budget: { currency: "VND", amountMinor: 1_500_000 },
  partySize: 2,
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
  specialNeeds: "Private medical information must stay out of the runtime request.",
};

describe("runtime planner port", () => {
  it("does not permit specialNeeds in a runtime recommendation", () => {
    const request = toItineraryRequest(personalizationWithSpecialNeeds);

    expect(request).not.toHaveProperty("specialNeeds");
  });

  it("requires owner-scoped reads to return the same typed result as mutations", async () => {
    const proposal = {} as RuntimePlannerProposal;
    const success: Result<RuntimePlannerProposal, never> = { ok: true, value: proposal };
    const port: RuntimePlannerPort = {
      getSession: async () => ({ userId: "customer-session-id", role: "customer" }),
      recommend: async () => success,
      refine: async () => success,
      getPlan: async () => success,
    };

    await expect(port.getPlan("plan-id", "vi")).resolves.toEqual(success);
  });
});
