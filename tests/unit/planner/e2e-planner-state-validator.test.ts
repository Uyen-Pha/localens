import { afterEach, describe, expect, it } from "vitest";

import {
  E2E_PLANNER_STATE_SESSION_KEY,
  readE2EPlannerState,
  isStrictPlannerState,
} from "@/lib/application/planner/e2e-planner-state-validator";
import type { DemoPlannerState } from "@/lib/application/planner/demo-planner";
import { createFoodFixturePlannerState } from "../../e2e/food-fixture";

afterEach(() => {
  window.sessionStorage.removeItem(E2E_PLANNER_STATE_SESSION_KEY);
  delete process.env.NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES;
});

function validFoodState(scenario: "approved" | "mixed" = "approved"): DemoPlannerState {
  return createFoodFixturePlannerState("en", scenario);
}

function clonedState(scenario: "approved" | "mixed" = "approved"): DemoPlannerState {
  return structuredClone(validFoodState(scenario));
}

describe("E2E planner state validator", () => {
  it("accepts a production-shaped food snapshot with preview DTO fields", () => {
    expect(isStrictPlannerState(validFoodState(), "en")).toBe(true);
  });

  it.each([
    ["a non-party-sized portion quantity", (state: DemoPlannerState) => {
      const item = state.current.items[0]!;
      if (item.foodSelection === null) throw new Error("food selection missing");
      (item.foodSelection as { quantity: number }).quantity = 2;
    }],
    ["a shared set quantity other than one", (state: DemoPlannerState) => {
      const item = state.current.items[0]!;
      if (item.foodSelection === null) throw new Error("food selection missing");
      (item.foodSelection as { servingUnit: "shared_set"; quantity: number }).servingUnit = "shared_set";
      (item.foodSelection as { quantity: number }).quantity = 2;
    }],
  ])("fails closed for %s", (_label, mutate) => {
    const state = clonedState();
    mutate(state);
    expect(isStrictPlannerState(state, "en")).toBe(false);
  });

  it.each([
    ["an invalid calendar date", (state: DemoPlannerState) => { (state.current.items[0] as { startAt: string }).startAt = "2026-02-30 09:00"; }],
    ["reversed item times", (state: DemoPlannerState) => {
      const item = state.current.items[0] as { startAt: string; endAt: string };
      item.startAt = "2026-09-05 10:00";
      item.endAt = "2026-09-05 09:00";
    }],
    ["duplicate item IDs", (state: DemoPlannerState) => {
      const mixed = state.current.items as Array<DemoPlannerState["current"]["items"][number]>;
      mixed[1] = { ...mixed[1]!, id: mixed[0]!.id };
    }],
    ["duplicate place IDs", (state: DemoPlannerState) => {
      const mixed = state.current.items as Array<DemoPlannerState["current"]["items"][number]>;
      mixed[1] = { ...mixed[1]!, placeId: mixed[0]!.placeId };
    }],
    ["a duration above the requested limit", (state: DemoPlannerState) => {
      const preferences = state.preferences!;
      (state.current.totals as { durationMinutes: number }).durationMinutes = preferences.durationMinutes + 1;
    }],
    ["a group cost above the normalized budget", (state: DemoPlannerState) => {
      (state.current as { budgetVnd: number }).budgetVnd = 1;
    }],
  ])("fails closed for %s", (_label, mutate) => {
    const state = clonedState(_label === "duplicate item IDs" || _label === "duplicate place IDs" ? "mixed" : "approved");
    mutate(state);
    expect(isStrictPlannerState(state, "en")).toBe(false);
  });

  it("rejects an oversized raw session payload before JSON parsing", () => {
    process.env.NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES = "1";
    window.sessionStorage.setItem(E2E_PLANNER_STATE_SESSION_KEY, "x".repeat(256_001));

    expect(readE2EPlannerState("en")).toBeNull();
  });
});
