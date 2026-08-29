// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  chooseFoodSelection,
  diagnoseFoodVendors,
  filterFoodVendors,
} from "@/lib/domain/itinerary/food-filter";
import { normalizeToHcmMinute } from "@/lib/domain/itinerary/local-time";
import type { FoodVendorCandidate } from "@/lib/domain/food/contracts";
import { itineraryFixture } from "@/tests/fixtures/itinerary/catalog.v1";

const clone = <T>(value: T): T => structuredClone(value);
const localMinute = (value: string): number => {
  const result = normalizeToHcmMinute(`${value}+07:00`);
  if (!result.ok) throw new Error(`invalid local time: ${value}`);
  return result.value;
};

const request = clone(itineraryFixture.request);
const interval = {
  startEpochMinute: localMinute("2026-09-05T10:00:00"),
  endEpochMinute: localMinute("2026-09-05T10:45:00"),
};

const vendor = (overrides: Partial<FoodVendorCandidate> = {}): FoodVendorCandidate => ({
  id: "vendor-market-01",
  placeId: "place-market",
  slug: "vendor-market-01",
  title: { en: "Market stall", vi: "Sạp chợ" },
  description: { en: "A market stall", vi: "Một sạp chợ" },
  locationNote: "Aisle A",
  serviceType: "stall",
  capacityNote: "Small group",
  dietarySupport: { halal: "supported" },
  mobilitySupport: { "step-free": "supported" },
  openingHours: [{ weekday: 6, opensAt: "09:00", closesAt: "17:00" }],
  openingExceptions: [],
  status: "sellable",
  menuItems: [
    {
      id: "menu-market-01",
      vendorId: "vendor-market-01",
      slug: "market-noodles",
      title: { en: "Market noodles", vi: "Mì chợ" },
      description: { en: "A bowl", vi: "Một tô" },
      servingUnit: "bowl",
      priceVndMin: 40_000,
      priceVndMax: 50_000,
      portionDescription: "One bowl",
      dietarySupport: { halal: "supported" },
      allergens: [],
      available: true,
      status: "sellable",
      verifiedAt: "2026-08-28",
    },
  ],
  ...overrides,
});

const place = () => {
  const result = clone(itineraryFixture.catalog.places[3]);
  result.priceVndPerPerson = 0;
  result.dietarySupport = { halal: "supported" };
  result.mobilitySupport = { "step-free": "supported" };
  result.openingHours = [{ weekday: 6, opensAt: "08:00", closesAt: "18:00" }];
  result.foodVendors = [vendor()];
  return result;
};

describe("food vendor filtering", () => {
  it("finds an exact vendor/menu selection at a free-admission market", () => {
    const candidate = place();

    expect(filterFoodVendors(candidate, request, "2026-09-05", interval)).toEqual([
      candidate.foodVendors[0],
    ]);
    expect(chooseFoodSelection(candidate.foodVendors[0], request, 100_000)).toEqual({
      ok: true,
      value: {
        vendorId: "vendor-market-01",
        menuItemId: "menu-market-01",
        quantity: 2,
        priceVndMin: 40_000,
        priceVndMax: 50_000,
        paymentMode: "pay_at_vendor",
        activity: "Taste and discuss the selected dish",
      },
    });
  });

  it("excludes a menu item with unknown required dietary support", () => {
    const candidate = place();
    candidate.foodVendors[0].menuItems[0].dietarySupport = { halal: "unknown" };

    expect(filterFoodVendors(candidate, request, "2026-09-05", interval)).toEqual([]);
    expect(diagnoseFoodVendors(candidate, request, "2026-09-05", interval)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "SUPPORT_UNKNOWN" }),
    });
  });

  it("excludes an unavailable menu item", () => {
    const candidate = place();
    candidate.foodVendors[0].menuItems[0].available = false;

    expect(filterFoodVendors(candidate, request, "2026-09-05", interval)).toEqual([]);
    expect(diagnoseFoodVendors(candidate, request, "2026-09-05", interval)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "NO_SELLABLE_MENU_ITEM" }),
    });
  });

  it("reports an unknown price instead of treating a malformed price as free", () => {
    const candidate = place();
    (candidate.foodVendors[0].menuItems[0] as unknown as { priceVndMax: unknown }).priceVndMax = null;

    expect(chooseFoodSelection(candidate.foodVendors[0], request, 100_000)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "UNKNOWN_PRICE" }),
    });
    expect(diagnoseFoodVendors(candidate, request, "2026-09-05", interval)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "UNKNOWN_PRICE" }),
    });
  });

  it("rejects a vendor closed during an otherwise-open market visit", () => {
    const candidate = place();
    candidate.foodVendors[0].openingHours = [
      { weekday: 6, opensAt: "11:00", closesAt: "17:00" },
    ];

    expect(filterFoodVendors(candidate, request, "2026-09-05", interval)).toEqual([]);
    expect(diagnoseFoodVendors(candidate, request, "2026-09-05", interval)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "VENDOR_CLOSED" }),
    });
  });

  it("uses exception and overnight vendor windows when checking the full interval", () => {
    const candidate = place();
    candidate.openingHours = [
      { weekday: 6, opensAt: "23:00", closesAt: "02:00" },
    ];
    candidate.openingExceptions = [];
    candidate.foodVendors[0].openingHours = [
      { weekday: 6, opensAt: "23:00", closesAt: "02:00" },
    ];
    candidate.foodVendors[0].openingExceptions = [
      {
        localDate: "2026-09-05",
        closed: false,
        windows: [{ opensAt: "23:30", closesAt: "01:30" }],
      },
    ];
    const overnightInterval = {
      startEpochMinute: localMinute("2026-09-05T23:45:00"),
      endEpochMinute: localMinute("2026-09-06T00:45:00"),
    };

    expect(filterFoodVendors(candidate, request, "2026-09-05", overnightInterval)).toEqual([
      candidate.foodVendors[0],
    ]);
  });

  it("returns a structured failure for an interval outside the supported HCMC epoch range", () => {
    const candidate = place();
    const outside = {
      startEpochMinute: Number.MAX_SAFE_INTEGER - 1,
      endEpochMinute: Number.MAX_SAFE_INTEGER,
    };

    expect(() => diagnoseFoodVendors(candidate, request, "2026-09-05", outside)).not.toThrow();
    expect(diagnoseFoodVendors(candidate, request, "2026-09-05", outside)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "NO_SELLABLE_VENDOR" }),
    });
  });

  it("rejects a ranged price when only its lower bound fits the budget", () => {
    const candidate = place();
    candidate.foodVendors[0].menuItems[0].priceVndMin = 100_000;
    candidate.foodVendors[0].menuItems[0].priceVndMax = 200_000;

    expect(chooseFoodSelection(candidate.foodVendors[0], request, 150_000)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "FOOD_OVER_BUDGET" }),
    });
  });

  it("selects deterministically by item ID and uses whole-group quantity", () => {
    const candidate = place();
    const first = candidate.foodVendors[0].menuItems[0];
    candidate.foodVendors[0].menuItems = [
      { ...first, id: "menu-z", slug: "z" },
      { ...first, id: "menu-a", slug: "a", servingUnit: "shared_set" },
    ];

    const result = chooseFoodSelection(candidate.foodVendors[0], request, 100_000);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.menuItemId).toBe("menu-a");
      expect(result.value.quantity).toBe(1);
    }
  });
});
