import type { ItineraryItem, ItineraryResult, ItineraryTotals } from "@/lib/domain/itinerary/contracts";

type WireMoney = string;

type WireFoodSelection = Omit<NonNullable<ItineraryItem["foodSelection"]>, "priceVndMin" | "priceVndMax"> & {
  priceVndMin: WireMoney;
  priceVndMax: WireMoney;
};

type WireItem = Omit<ItineraryItem,
  | "travelCostVndBefore"
  | "placeCostVnd"
  | "foodSelection"
  | "foodCostMinVnd"
  | "foodCostMaxVnd"
  | "payAtVendorMinVnd"
  | "payAtVendorMaxVnd"
  | "customerPayableVnd"> & {
  travelCostVndBefore: WireMoney;
  placeCostVnd: WireMoney;
  foodSelection: WireFoodSelection | null;
  foodCostMinVnd: WireMoney;
  foodCostMaxVnd: WireMoney;
  payAtVendorMinVnd: WireMoney;
  payAtVendorMaxVnd: WireMoney;
  customerPayableVnd: WireMoney;
};

type WireTotals = Omit<ItineraryTotals,
  | "admissionCostVnd"
  | "foodCostMinVnd"
  | "foodCostMaxVnd"
  | "travelCostVnd"
  | "guideCostVnd"
  | "payAtVendorMinVnd"
  | "payAtVendorMaxVnd"
  | "customerPayableVnd"
  | "groupCostMinVnd"
  | "groupCostMaxVnd"
  | "groupCostVnd"> & {
  admissionCostVnd: WireMoney;
  foodCostMinVnd: WireMoney;
  foodCostMaxVnd: WireMoney;
  travelCostVnd: WireMoney;
  guideCostVnd: WireMoney;
  payAtVendorMinVnd: WireMoney;
  payAtVendorMaxVnd: WireMoney;
  customerPayableVnd: WireMoney;
  groupCostMinVnd: WireMoney;
  groupCostMaxVnd: WireMoney;
  groupCostVnd: WireMoney;
};

export type ItineraryWireResponse = Omit<ItineraryResult, "budgetVnd" | "items" | "totals"> & {
  budgetVnd: WireMoney;
  items: readonly WireItem[];
  totals: WireTotals;
};

/**
 * Cross the HTTP boundary only after the caller has validated the authoritative
 * engine result. Number-valued money remains inside the domain and persistence
 * layers; this DTO prevents JSON number precision loss in browser consumers.
 */
export function serializeItineraryWireResponse(result: ItineraryResult): ItineraryWireResponse {
  return {
    ...result,
    budgetVnd: String(result.budgetVnd),
    items: result.items.map((item) => ({
      ...item,
      travelCostVndBefore: String(item.travelCostVndBefore),
      placeCostVnd: String(item.placeCostVnd),
      foodSelection: item.foodSelection === null
        ? null
        : {
            ...item.foodSelection,
            priceVndMin: String(item.foodSelection.priceVndMin),
            priceVndMax: String(item.foodSelection.priceVndMax),
          },
      foodCostMinVnd: String(item.foodCostMinVnd),
      foodCostMaxVnd: String(item.foodCostMaxVnd),
      payAtVendorMinVnd: String(item.payAtVendorMinVnd),
      payAtVendorMaxVnd: String(item.payAtVendorMaxVnd),
      customerPayableVnd: String(item.customerPayableVnd),
    })),
    totals: {
      ...result.totals,
      admissionCostVnd: String(result.totals.admissionCostVnd),
      foodCostMinVnd: String(result.totals.foodCostMinVnd),
      foodCostMaxVnd: String(result.totals.foodCostMaxVnd),
      travelCostVnd: String(result.totals.travelCostVnd),
      guideCostVnd: String(result.totals.guideCostVnd),
      payAtVendorMinVnd: String(result.totals.payAtVendorMinVnd),
      payAtVendorMaxVnd: String(result.totals.payAtVendorMaxVnd),
      customerPayableVnd: String(result.totals.customerPayableVnd),
      groupCostMinVnd: String(result.totals.groupCostMinVnd),
      groupCostMaxVnd: String(result.totals.groupCostMaxVnd),
      groupCostVnd: String(result.totals.groupCostVnd),
    },
  };
}
