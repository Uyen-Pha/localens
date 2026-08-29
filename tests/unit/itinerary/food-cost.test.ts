// @vitest-environment node

import { describe, expect, it } from "vitest";

import type {
  FoodMenuItemCandidate,
  FoodSelection,
} from "@/lib/domain/food/contracts";
import type { ItineraryItem } from "@/lib/domain/itinerary/contracts";
import {
  calculateFoodSelectionCost,
  calculateItineraryCostBreakdown,
} from "@/lib/domain/itinerary/food-cost";

const menuItem: FoodMenuItemCandidate = {
  id: "menu-banh-xeo",
  vendorId: "vendor-binh-tay-stall-01",
  slug: "banh-xeo",
  title: { en: "Banh xeo", vi: "Bánh xèo" },
  description: { en: "Crisp savoury crepe", vi: "Bánh giòn nhân mặn" },
  servingUnit: "portion",
  priceVndMin: 40_000,
  priceVndMax: 50_000,
  portionDescription: "One serving",
  dietarySupport: { vegetarian: "unsupported" },
  allergens: ["peanut"],
  available: true,
  status: "sellable",
  verifiedAt: "2026-08-28",
};

const selection = (overrides: Partial<FoodSelection> = {}): FoodSelection => ({
  vendorId: menuItem.vendorId,
  menuItemId: menuItem.id,
  quantity: 1,
  priceVndMin: menuItem.priceVndMin,
  priceVndMax: menuItem.priceVndMax,
  paymentMode: "pay_at_vendor",
  activity: "Taste and discuss the selected dish",
  ...overrides,
});

const item = (
  overrides: Partial<Pick<ItineraryItem, "placeCostVnd" | "foodSelection">> = {},
) => ({
  placeCostVnd: 100_000,
  foodSelection: null,
  ...overrides,
});

describe("food selection cost", () => {
  it("calculates an exact price as a pay-at-vendor group estimate", () => {
    expect(calculateFoodSelectionCost(selection({ priceVndMin: 40_000, priceVndMax: 40_000 }), {
      ...menuItem,
      priceVndMin: 40_000,
      priceVndMax: 40_000,
    }, 2)).toEqual({
      ok: true,
      value: {
        minVnd: 40_000,
        maxVnd: 40_000,
        payAtVendorMinVnd: 40_000,
        payAtVendorMaxVnd: 40_000,
        customerPayableVnd: 0,
      },
    });
  });

  it("multiplies a ranged price by whole-group quantity, not party size", () => {
    expect(calculateFoodSelectionCost(selection({ quantity: 3 }), menuItem, 8)).toEqual({
      ok: true,
      value: {
        minVnd: 120_000,
        maxVnd: 150_000,
        payAtVendorMinVnd: 120_000,
        payAtVendorMaxVnd: 150_000,
        customerPayableVnd: 0,
      },
    });
  });

  it("allows zero quantity and whole shared-set quantities", () => {
    expect(calculateFoodSelectionCost(selection({ quantity: 0 }), menuItem, 2)).toEqual({
      ok: true,
      value: {
        minVnd: 0,
        maxVnd: 0,
        payAtVendorMinVnd: 0,
        payAtVendorMaxVnd: 0,
        customerPayableVnd: 0,
      },
    });

    const sharedSet = {
      ...menuItem,
      id: "menu-shared-set",
      servingUnit: "shared_set" as const,
    };
    expect(calculateFoodSelectionCost(selection({
      menuItemId: sharedSet.id,
      quantity: 2,
    }), sharedSet, 4).ok).toBe(true);
    expect(calculateFoodSelectionCost(selection({
      menuItemId: sharedSet.id,
      quantity: 1.5,
    } as FoodSelection), sharedSet, 4).ok).toBe(false);
  });

  it("rejects mismatched IDs or snapshot prices", () => {
    expect(calculateFoodSelectionCost(selection({ vendorId: "vendor-other" }), menuItem, 2).ok).toBe(false);
    expect(calculateFoodSelectionCost(selection({ menuItemId: "menu-other" }), menuItem, 2).ok).toBe(false);
    expect(calculateFoodSelectionCost(selection({ priceVndMin: 45_000 }), menuItem, 2).ok).toBe(false);
  });

  it("rejects unavailable or non-sellable menu items and invalid party sizes", () => {
    expect(calculateFoodSelectionCost(selection(), { ...menuItem, available: false }, 2).ok).toBe(false);
    expect(calculateFoodSelectionCost(selection(), { ...menuItem, status: "research_only" }, 2).ok).toBe(false);
    for (const partySize of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN]) {
      expect(calculateFoodSelectionCost(selection(), menuItem, partySize).ok).toBe(false);
    }
  });

  it("rejects included-quote food under the MVP payment policy", () => {
    expect(calculateFoodSelectionCost(selection({
      paymentMode: "included_in_quote" as FoodSelection["paymentMode"],
    }), menuItem, 2).ok).toBe(false);
  });

  it("returns an error instead of overflowing safe integer VND", () => {
    const expensiveItem = {
      ...menuItem,
      priceVndMin: Number.MAX_SAFE_INTEGER,
      priceVndMax: Number.MAX_SAFE_INTEGER,
    };
    expect(calculateFoodSelectionCost(selection({
      priceVndMin: Number.MAX_SAFE_INTEGER,
      priceVndMax: Number.MAX_SAFE_INTEGER,
      quantity: 2,
    }), expensiveItem, 2).ok).toBe(false);
  });
});

describe("itinerary cost breakdown", () => {
  it("recomputes zero-food and pay-at-vendor totals with a backward-compatible max total", () => {
    const result = calculateItineraryCostBreakdown([
      item(),
      item({
        placeCostVnd: 0,
        foodSelection: selection({ quantity: 2 }),
      }),
    ], 20_000, 30_000);

    expect(result).toEqual({
      ok: true,
      value: {
        admissionCostVnd: 100_000,
        foodCostMinVnd: 80_000,
        foodCostMaxVnd: 100_000,
        travelCostVnd: 20_000,
        guideCostVnd: 30_000,
        payAtVendorMinVnd: 80_000,
        payAtVendorMaxVnd: 100_000,
        customerPayableVnd: 150_000,
        groupCostMinVnd: 230_000,
        groupCostMaxVnd: 250_000,
        groupCostVnd: 250_000,
      },
    });
  });

  it("makes the upper ranged estimate authoritative for a hard budget check", () => {
    const result = calculateItineraryCostBreakdown([
      item({ foodSelection: selection({ quantity: 2 }) }),
    ], 0, 0);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.groupCostMinVnd).toBe(180_000);
    expect(result.value.groupCostMaxVnd).toBe(200_000);
    expect(result.value.groupCostMinVnd).toBeLessThanOrEqual(190_000);
    expect(result.value.groupCostMaxVnd).toBeGreaterThan(190_000);
  });

  it("returns an error for total overflow instead of wrapping or rounding", () => {
    expect(calculateItineraryCostBreakdown([
      item({ placeCostVnd: Number.MAX_SAFE_INTEGER }),
      item({ placeCostVnd: 1 }),
    ], 0, 0).ok).toBe(false);
  });

  it("preserves admission totals exactly when every item has no food selection", () => {
    expect(calculateItineraryCostBreakdown([
      item({ placeCostVnd: 60_000 }),
      item({ placeCostVnd: 40_000 }),
    ], 25_000, 0)).toEqual({
      ok: true,
      value: {
        admissionCostVnd: 100_000,
        foodCostMinVnd: 0,
        foodCostMaxVnd: 0,
        travelCostVnd: 25_000,
        guideCostVnd: 0,
        payAtVendorMinVnd: 0,
        payAtVendorMaxVnd: 0,
        customerPayableVnd: 125_000,
        groupCostMinVnd: 125_000,
        groupCostMaxVnd: 125_000,
        groupCostVnd: 125_000,
      },
    });
  });
});
