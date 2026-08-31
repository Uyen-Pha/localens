import { describe, expect, it } from "vitest";

import {
  createDemoPlannerAdapter,
  type DemoPlannerState,
} from "@/lib/application/planner/demo-planner";
import type { ItineraryPreviewFoodSelectionDto } from "@/lib/application/api/read-only-api";
import type { PersonalizationRequest } from "@/lib/application/planner/personalization-session";

const personalizedRequest: PersonalizationRequest = {
  startAt: "2026-09-05T10:30:00+07:00",
  durationMinutes: 240,
  areas: ["demo-hcmc-district-1"],
  budget: { currency: "USD", amountMinor: 25_00 },
  partySize: 4,
  guideLanguage: "vi",
  priorityWeights: {
    street_food: 0,
    history: 0,
    traditional_craft: 2,
    traditional_market: 1,
  },
  pace: "active",
  dietaryRequirements: ["vegetarian"],
  mobilityRequirements: ["step-free"],
  lockedStopIds: [],
  specialNeeds: "Prefer a quiet route.",
};

const foodSelection: ItineraryPreviewFoodSelectionDto = {
  venueTitle: "Ben Thanh Market",
  vendorTitle: "Aunt Ba's stall",
  locationNote: "Aisle 4",
  menuTitle: "Banh mi",
  servingUnit: "portion",
  quantity: 2,
  priceVndMin: 45_000,
  priceVndMax: 60_000,
  activity: "Taste and discuss the selected dish",
  dietaryAllergenCaveat: "Vegetarian: supported",
  accessibilityVendorWarning: "Step-free access: not verified",
  paymentMode: "pay_at_vendor",
};

function stateWithFoodSelection(): DemoPlannerState {
  const base = createDemoPlannerAdapter().createInitial();
  const item = {
    ...base.current.items[0]!,
    placeCostVnd: 0,
    travelCostVndBefore: 0,
    foodSelection,
    foodCostMinVnd: 90_000,
    foodCostMaxVnd: 120_000,
    payAtVendorMinVnd: 90_000,
    payAtVendorMaxVnd: 120_000,
    customerPayableVnd: 0,
  };
  return {
    ...base,
    current: {
      ...base.current,
      items: [item],
    },
  };
}

describe("demo planner adapter", () => {
  it("starts with a typed proposal containing activities, totals, and warnings", () => {
    const state = createDemoPlannerAdapter().createInitial();

    expect(state.planId).toBe("demo-plan-hcmc-cultural-day");
    expect(state.current.revision).toBe(1);
    expect(state.current.items).toHaveLength(3);
    expect(state.current.items.every((item) => item.activity.length > 0)).toBe(true);
    expect(state.current.totals).toEqual({
      durationMinutes: 240,
      costVnd: 255_000,
      admissionCostVnd: 200_000,
      foodCostMinVnd: 0,
      foodCostMaxVnd: 0,
      travelCostVnd: 55_000,
      guideCostVnd: 0,
      payAtVendorMinVnd: 0,
      payAtVendorMaxVnd: 0,
      customerPayableVnd: 255_000,
      groupCostMinVnd: 255_000,
      groupCostMaxVnd: 255_000,
    });
    expect(state.current.warnings).toContain(
      "Demo proposal only: operating hours and availability still require company confirmation.",
    );
    expect(state.history).toHaveLength(0);
  });

  it("localizes fixture titles, activities, and warnings for Vietnamese visitors", () => {
    const state = createDemoPlannerAdapter().createInitial("vi");

    expect(state.locale).toBe("vi");
    expect(state.current.items[0]?.title).toBe("Chợ Bến Thành");
    expect(state.current.items[0]?.activity).toContain("Khám phá");
    expect(state.current.warnings[0]).toContain("Chỉ là đề xuất demo");
    expect(state.current.items.map((item) => item.title)).not.toContain("War Remnants Museum");
  });

  it("seeds the local proposal with submitted preferences and requested start time", () => {
    const state = createDemoPlannerAdapter().createInitial("vi", personalizedRequest);

    expect(state.preferences).toEqual(personalizedRequest);
    expect(state.current.items[0]).toMatchObject({
      startAt: "2026-09-05 10:30",
      endAt: "2026-09-05 11:30",
    });
  });

  it("uses the internal demo engine to keep a request within its areas, time, and budget", () => {
    const request: PersonalizationRequest = {
      ...personalizedRequest,
      startAt: "2026-09-05T09:00:00+07:00",
      durationMinutes: 180,
      areas: ["demo-hcmc-district-1"],
      budget: { currency: "VND", amountMinor: 500_000 },
      priorityWeights: {
        street_food: 0,
        history: 0,
        traditional_craft: 0,
        traditional_market: 1,
      },
    };
    const state = createDemoPlannerAdapter().createInitial("en", request);

    expect(state.current.items.length).toBeGreaterThan(0);
    expect(state.current.items.every((item) => item.placeId !== "demo-hcmc-war-remnants")).toBe(true);
    expect(state.current.totals.durationMinutes).toBeLessThanOrEqual(request.durationMinutes);
    expect(state.current.totals.costVnd).toBeLessThanOrEqual(request.budget.amountMinor);
  });

  it("returns no proposal with a clear warning when the internal demo engine finds no feasible route", () => {
    const request: PersonalizationRequest = {
      ...personalizedRequest,
      durationMinutes: 60,
      budget: { currency: "VND", amountMinor: 1_000 },
      areas: ["demo-hcmc-district-1"],
    };
    const state = createDemoPlannerAdapter().createInitial("en", request);

    expect(state.current.items).toHaveLength(0);
    expect(state.current.warnings.join(" ")).toMatch(/no feasible|no proposal/i);
  });

  it("creates a new revision while preserving a locked stop", () => {
    const adapter = createDemoPlannerAdapter();
    const initial = adapter.createInitial();
    const lockedItem = initial.current.items[1]!;

    const result = adapter.refine(initial, {
      baseRevision: 1,
      feedback: "Keep the museum story, add more street food.",
      lockedItemIds: [lockedItem.id],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.current.revision).toBe(2);
    expect(result.state.history).toHaveLength(1);
    expect(result.state.current.feedback).toBe("Keep the museum story, add more street food.");
    expect(result.state.current.items.find((item) => item.id === lockedItem.id)).toMatchObject({
      title: lockedItem.title,
      activity: lockedItem.activity,
      locked: true,
    });
    expect(result.state.current.items.some((item) => item.activity !== initial.current.items.find((candidate) => candidate.id === item.id)?.activity)).toBe(true);
  });

  it("preserves a locked food snapshot when removal is requested", () => {
    const adapter = createDemoPlannerAdapter();
    const initial = stateWithFoodSelection();
    const foodItem = initial.current.items[0]!;

    const result = adapter.refine(initial, {
      baseRevision: initial.current.revision,
      feedback: "Remove the food stop.",
      lockedItemIds: [foodItem.id],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.current.items[0]).toMatchObject({
      foodSelection,
      foodCostMinVnd: 90_000,
      foodCostMaxVnd: 120_000,
      payAtVendorMinVnd: 90_000,
      payAtVendorMaxVnd: 120_000,
    });
  });

  it("removes an explicitly requested unlocked food selection and clears its vendor costs", () => {
    const adapter = createDemoPlannerAdapter();
    const initial = stateWithFoodSelection();

    const result = adapter.refine(initial, {
      baseRevision: initial.current.revision,
      feedback: "Remove the food stop.",
      lockedItemIds: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.current.items[0]).toMatchObject({
      foodSelection: null,
      foodCostMinVnd: 0,
      foodCostMaxVnd: 0,
      payAtVendorMinVnd: 0,
      payAtVendorMaxVnd: 0,
    });
    expect(result.state.current.totals.foodCostMinVnd).toBe(0);
    expect(result.state.current.totals.foodCostMaxVnd).toBe(0);
    expect(result.state.current.totals.payAtVendorMinVnd).toBe(0);
    expect(result.state.current.totals.payAtVendorMaxVnd).toBe(0);
  });

  it("rejects a stale base revision without changing the current state", () => {
    const adapter = createDemoPlannerAdapter();
    const initial = adapter.createInitial();
    const result = adapter.refine(initial, {
      baseRevision: 7,
      feedback: "Change the pace.",
      lockedItemIds: [],
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "STALE_REVISION",
        expectedRevision: 1,
      },
    });
    expect(initial.current.revision).toBe(1);
    expect(initial.history).toHaveLength(0);
  });

  it("rejects empty feedback with a typed invalid-feedback error", () => {
    const adapter = createDemoPlannerAdapter();
    const initial = adapter.createInitial();

    expect(adapter.refine(initial, {
      baseRevision: initial.current.revision,
      feedback: "  ",
      lockedItemIds: [],
    })).toEqual({
      ok: false,
      error: { code: "INVALID_FEEDBACK" },
    });
  });

  it("gets the latest demo state without resetting an existing revision history", () => {
    const adapter = createDemoPlannerAdapter();
    const initial = adapter.createInitial();
    const revised = adapter.refine(initial, {
      baseRevision: 1,
      feedback: "Change the pace.",
      lockedItemIds: [initial.current.items[0]!.id],
    });
    if (!revised.ok) throw new Error("expected a revision");

    const latest = adapter.getLatest(revised.state, revised.state.planId, "en");

    expect(latest.current.revision).toBe(2);
    expect(latest.history).toHaveLength(1);
    expect(latest.current.items[0]?.locked).toBe(true);
    expect(latest.planId).toBe(revised.state.planId);
    expect(latest.preferences).toBeNull();
  });

  it("does not mutate a supplied state when producing a revision", () => {
    const adapter = createDemoPlannerAdapter();
    const initial = adapter.createInitial();
    const snapshot: DemoPlannerState = structuredClone(initial);

    adapter.refine(initial, {
      baseRevision: initial.current.revision,
      feedback: "Make the route gentler.",
      lockedItemIds: [],
    });

    expect(initial).toEqual(snapshot);
  });
});
