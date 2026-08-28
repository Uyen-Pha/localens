// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  foodMenuItemSchema,
  foodSelectionSchema,
  foodVendorSchema,
  createFoodSelectionSchema,
  type FoodMenuItemCandidate,
  type FoodSelection,
  type FoodVendorCandidate,
} from "@/lib/domain/food/contracts";

const openingHours = [
  { weekday: 5 as const, opensAt: "16:00", closesAt: "23:00" },
];

const menuItem: FoodMenuItemCandidate = {
  id: "menu-banh-xeo",
  vendorId: "vendor-binh-tay-stall-01",
  slug: "banh-xeo",
  title: { en: "Banh xeo", vi: "Bánh xèo" },
  description: { en: "Crisp savoury crepe", vi: "Bánh giòn nhân mặn" },
  servingUnit: "portion",
  priceVndMin: 40_000,
  priceVndMax: 50_000,
  portionDescription: "One serving for one guest",
  dietarySupport: { vegetarian: "unsupported", halal: "unknown" },
  allergens: ["peanut"],
  available: true,
  status: "sellable",
  verifiedAt: "2026-08-28",
};

const vendor: FoodVendorCandidate = {
  id: "vendor-binh-tay-stall-01",
  placeId: "place-binh-tay-market",
  slug: "binh-tay-stall-01",
  title: { en: "Binh Tay market stall 01", vi: "Sạp 01 chợ Bình Tây" },
  description: { en: "A market food stall", vi: "Một sạp đồ ăn trong chợ" },
  locationNote: "Ground floor, east aisle",
  serviceType: "stall",
  capacityNote: "Groups of up to 6",
  dietarySupport: { vegetarian: "supported", halal: "unknown" },
  mobilitySupport: { "step-free": "supported" },
  openingHours,
  openingExceptions: [],
  status: "sellable",
  menuItems: [menuItem],
};

describe("food domain contracts", () => {
  it("accepts the exact bilingual vendor and menu candidate fields", () => {
    expect(foodVendorSchema.safeParse(vendor).success).toBe(true);
    expect(foodMenuItemSchema.safeParse(menuItem).success).toBe(true);
  });

  it("rejects a menu price range whose minimum exceeds its maximum", () => {
    expect(
      foodMenuItemSchema.safeParse({ ...menuItem, priceVndMin: 60_000 }).success,
    ).toBe(false);
  });

  it("rejects a menu item linked to a different vendor", () => {
    expect(
      foodVendorSchema.safeParse({
        ...vendor,
        menuItems: [{ ...menuItem, vendorId: "vendor-other" }],
      }).success,
    ).toBe(false);
  });

  it("accepts zero and one whole serving for a group", () => {
    const base: FoodSelection = {
      vendorId: vendor.id,
      menuItemId: menuItem.id,
      quantity: 0,
      priceVndMin: 40_000,
      priceVndMax: 50_000,
      paymentMode: "pay_at_vendor",
      activity: "Taste and discuss the selected dish",
    };

    expect(foodSelectionSchema.safeParse(base).success).toBe(true);
    expect(foodSelectionSchema.safeParse({ ...base, quantity: 1 }).success).toBe(
      true,
    );
  });

  it("rejects fractional, negative, unsafe, and included-quote selections", () => {
    const base: FoodSelection = {
      vendorId: vendor.id,
      menuItemId: menuItem.id,
      quantity: 1,
      priceVndMin: 40_000,
      priceVndMax: 50_000,
      paymentMode: "pay_at_vendor",
      activity: "Taste and discuss the selected dish",
    };

    for (const quantity of [0.5, -1, Number.MAX_SAFE_INTEGER + 1]) {
      expect(foodSelectionSchema.safeParse({ ...base, quantity }).success).toBe(
        false,
      );
    }
    expect(
      foodSelectionSchema.safeParse({ ...base, paymentMode: "included_in_quote" })
        .success,
    ).toBe(false);
  });

  it("allows included-quote payment only when a future quote policy opts in", () => {
    const selection = {
      vendorId: vendor.id,
      menuItemId: menuItem.id,
      quantity: 1,
      priceVndMin: 40_000,
      priceVndMax: 40_000,
      paymentMode: "included_in_quote" as const,
      activity: "Taste and discuss the selected dish",
    };

    expect(
      createFoodSelectionSchema({ allowIncludedInQuote: true }).safeParse(selection)
        .success,
    ).toBe(true);
  });

  it("rejects unknown support statuses, empty bilingual labels, and unknown fields", () => {
    expect(
      foodVendorSchema.safeParse({
        ...vendor,
        title: { ...vendor.title, en: "   " },
      }).success,
    ).toBe(false);
    expect(
      foodVendorSchema.safeParse({
        ...vendor,
        dietarySupport: { vegetarian: "maybe" },
      }).success,
    ).toBe(false);
    expect(
      foodMenuItemSchema.safeParse({ ...menuItem, unexpected: true }).success,
    ).toBe(false);
  });

  it("rejects invalid food dates, weekly overlaps, duplicate exception dates, and exception overlaps", () => {
    expect(
      foodVendorSchema.safeParse({
        ...vendor,
        openingExceptions: [
          { localDate: "2026-02-30", closed: true, windows: [] },
        ],
      }).success,
    ).toBe(false);

    expect(
      foodVendorSchema.safeParse({
        ...vendor,
        openingHours: [
          { weekday: 5 as const, opensAt: "16:00", closesAt: "19:00" },
          { weekday: 5 as const, opensAt: "18:00", closesAt: "23:00" },
        ],
      }).success,
    ).toBe(false);

    expect(
      foodVendorSchema.safeParse({
        ...vendor,
        openingExceptions: [
          { localDate: "2026-09-05", closed: true, windows: [] },
          { localDate: "2026-09-05", closed: true, windows: [] },
        ],
      }).success,
    ).toBe(false);

    expect(
      foodVendorSchema.safeParse({
        ...vendor,
        openingExceptions: [
          {
            localDate: "2026-09-05",
            closed: false,
            windows: [
              { opensAt: "16:00", closesAt: "20:00" },
              { opensAt: "19:00", closesAt: "23:00" },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
