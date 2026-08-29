import {
  createFoodSelectionSchema,
  foodMenuItemSchema,
  type FoodMenuItemCandidate,
  type FoodSelection,
} from "@/lib/domain/food/contracts";
import type {
  ItineraryItem,
  Result,
} from "@/lib/domain/itinerary/contracts";
import { multiplyVnd, sumVnd } from "@/lib/domain/itinerary/money";

const MAX_PARTY_SIZE = 20;
const costSelectionSchema = createFoodSelectionSchema({
  allowIncludedInQuote: true,
});

export const COST_ERROR_CODE_VALUES = Object.freeze([
  "INVALID_FOOD_ITEM",
  "INVALID_FOOD_SELECTION",
  "FOOD_ITEM_MISMATCH",
  "FOOD_ITEM_UNAVAILABLE",
  "FOOD_ITEM_NOT_SELLABLE",
  "INVALID_PARTY_SIZE",
  "FOOD_PAYMENT_MODE_UNSUPPORTED",
  "INVALID_ITINERARY_COST",
  "COST_OVERFLOW",
] as const);

export type CostErrorCode = (typeof COST_ERROR_CODE_VALUES)[number];

export interface CostError {
  readonly code: CostErrorCode;
  readonly messageKey: string;
  readonly retryable: false;
}

export interface FoodSelectionCost {
  readonly minVnd: number;
  readonly maxVnd: number;
  readonly payAtVendorMinVnd: number;
  readonly payAtVendorMaxVnd: number;
  readonly customerPayableVnd: number;
}

export interface ItineraryCostBreakdown {
  readonly admissionCostVnd: number;
  readonly foodCostMinVnd: number;
  readonly foodCostMaxVnd: number;
  readonly travelCostVnd: number;
  readonly guideCostVnd: number;
  readonly payAtVendorMinVnd: number;
  readonly payAtVendorMaxVnd: number;
  readonly customerPayableVnd: number;
  readonly groupCostMinVnd: number;
  readonly groupCostMaxVnd: number;
  readonly groupCostVnd: number;
}

type CostItem = Pick<ItineraryItem, "placeCostVnd" | "foodSelection">;

function error(
  code: CostErrorCode,
  messageKey: string,
): { ok: false; error: CostError } {
  return { ok: false, error: { code, messageKey, retryable: false } };
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isValidPartySize(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= MAX_PARTY_SIZE
  );
}

function sumOrOverflow(values: readonly number[]): Result<number, CostError> {
  const total = sumVnd(values);
  if (total.ok) return total;
  return error("COST_OVERFLOW", "itinerary.food_cost.overflow");
}

function multiplyOrOverflow(a: number, b: number): Result<number, CostError> {
  const total = multiplyVnd(a, b);
  if (total.ok) return total;
  return error("COST_OVERFLOW", "itinerary.food_cost.overflow");
}

function validateSnapshotSelection(
  selection: unknown,
): Result<FoodSelection, CostError> {
  const parsed = costSelectionSchema.safeParse(selection);
  if (!parsed.success) {
    return error(
      "INVALID_FOOD_SELECTION",
      "itinerary.food_cost.selection_invalid",
    );
  }
  return { ok: true, value: parsed.data };
}

/**
 * Calculate the cost of the catalog price snapshot stored in one food
 * selection. Quantity is already the number of serving units for the whole
 * group; partySize is validated as request context and is intentionally not a
 * multiplier.
 */
export function calculateFoodSelectionCost(
  selection: FoodSelection,
  menuItem: FoodMenuItemCandidate,
  partySize: number,
): Result<FoodSelectionCost, CostError> {
  if (!isValidPartySize(partySize)) {
    return error("INVALID_PARTY_SIZE", "itinerary.food_cost.party_size_invalid");
  }

  const parsedItem = foodMenuItemSchema.safeParse(menuItem);
  if (!parsedItem.success) {
    return error("INVALID_FOOD_ITEM", "itinerary.food_cost.menu_item_invalid");
  }

  const parsedSelection = validateSnapshotSelection(selection);
  if (!parsedSelection.ok) return parsedSelection;

  const selected = parsedSelection.value;
  const item = parsedItem.data;

  if (selected.vendorId !== item.vendorId || selected.menuItemId !== item.id) {
    return error("FOOD_ITEM_MISMATCH", "itinerary.food_cost.menu_item_mismatch");
  }
  if (item.available !== true) {
    return error("FOOD_ITEM_UNAVAILABLE", "itinerary.food_cost.menu_item_unavailable");
  }
  if (item.status !== "sellable") {
    return error("FOOD_ITEM_NOT_SELLABLE", "itinerary.food_cost.menu_item_not_sellable");
  }
  if (
    selected.priceVndMin !== item.priceVndMin ||
    selected.priceVndMax !== item.priceVndMax
  ) {
    return error("FOOD_ITEM_MISMATCH", "itinerary.food_cost.price_snapshot_mismatch");
  }
  if (selected.paymentMode !== "pay_at_vendor") {
    return error(
      "FOOD_PAYMENT_MODE_UNSUPPORTED",
      "itinerary.food_cost.payment_mode_unsupported",
    );
  }

  const min = multiplyOrOverflow(item.priceVndMin, selected.quantity);
  if (!min.ok) return min;
  const max = multiplyOrOverflow(item.priceVndMax, selected.quantity);
  if (!max.ok) return max;

  return {
    ok: true,
    value: {
      minVnd: min.value,
      maxVnd: max.value,
      payAtVendorMinVnd: min.value,
      payAtVendorMaxVnd: max.value,
      customerPayableVnd: 0,
    },
  };
}

function calculateSnapshotSelectionCost(
  selection: FoodSelection,
): Result<FoodSelectionCost, CostError> {
  const parsedSelection = validateSnapshotSelection(selection);
  if (!parsedSelection.ok) return parsedSelection;

  const selected = parsedSelection.value;
  if (selected.paymentMode !== "pay_at_vendor") {
    return error(
      "FOOD_PAYMENT_MODE_UNSUPPORTED",
      "itinerary.food_cost.payment_mode_unsupported",
    );
  }

  const min = multiplyOrOverflow(selected.priceVndMin, selected.quantity);
  if (!min.ok) return min;
  const max = multiplyOrOverflow(selected.priceVndMax, selected.quantity);
  if (!max.ok) return max;

  return {
    ok: true,
    value: {
      minVnd: min.value,
      maxVnd: max.value,
      payAtVendorMinVnd: min.value,
      payAtVendorMaxVnd: max.value,
      customerPayableVnd: 0,
    },
  };
}

/**
 * Recompute all monetary components from itinerary item inputs. The item food
 * fields are deliberately ignored: the immutable FoodSelection price bounds
 * and quantity are the source of truth for this calculation.
 */
export function calculateItineraryCostBreakdown(
  items: readonly CostItem[],
  travelCostVnd: number,
  guideCostVnd: number,
): Result<ItineraryCostBreakdown, CostError> {
  if (!Array.isArray(items)) {
    return error("INVALID_ITINERARY_COST", "itinerary.food_cost.items_invalid");
  }
  if (!isSafeNonNegativeInteger(travelCostVnd) || !isSafeNonNegativeInteger(guideCostVnd)) {
    return error("INVALID_ITINERARY_COST", "itinerary.food_cost.cost_invalid");
  }

  const admissionCosts: number[] = [];
  const foodMinCosts: number[] = [];
  const foodMaxCosts: number[] = [];
  const payAtVendorMinCosts: number[] = [];
  const payAtVendorMaxCosts: number[] = [];
  const customerPayableFoodCosts: number[] = [];

  for (const itineraryItem of items) {
    if (
      typeof itineraryItem !== "object" ||
      itineraryItem === null ||
      !isSafeNonNegativeInteger(itineraryItem.placeCostVnd)
    ) {
      return error("INVALID_ITINERARY_COST", "itinerary.food_cost.item_invalid");
    }
    admissionCosts.push(itineraryItem.placeCostVnd);

    if (itineraryItem.foodSelection === null) {
      foodMinCosts.push(0);
      foodMaxCosts.push(0);
      payAtVendorMinCosts.push(0);
      payAtVendorMaxCosts.push(0);
      customerPayableFoodCosts.push(0);
      continue;
    }

    const foodCost = calculateSnapshotSelectionCost(itineraryItem.foodSelection);
    if (!foodCost.ok) return foodCost;
    foodMinCosts.push(foodCost.value.minVnd);
    foodMaxCosts.push(foodCost.value.maxVnd);
    payAtVendorMinCosts.push(foodCost.value.payAtVendorMinVnd);
    payAtVendorMaxCosts.push(foodCost.value.payAtVendorMaxVnd);
    customerPayableFoodCosts.push(foodCost.value.customerPayableVnd);
  }

  const admission = sumOrOverflow(admissionCosts);
  if (!admission.ok) return admission;
  const foodMin = sumOrOverflow(foodMinCosts);
  if (!foodMin.ok) return foodMin;
  const foodMax = sumOrOverflow(foodMaxCosts);
  if (!foodMax.ok) return foodMax;
  const payAtVendorMin = sumOrOverflow(payAtVendorMinCosts);
  if (!payAtVendorMin.ok) return payAtVendorMin;
  const payAtVendorMax = sumOrOverflow(payAtVendorMaxCosts);
  if (!payAtVendorMax.ok) return payAtVendorMax;
  const customerPayableFood = sumOrOverflow(customerPayableFoodCosts);
  if (!customerPayableFood.ok) return customerPayableFood;

  const customerPayable = sumOrOverflow([
    admission.value,
    travelCostVnd,
    guideCostVnd,
    customerPayableFood.value,
  ]);
  if (!customerPayable.ok) return customerPayable;

  const groupMin = sumOrOverflow([
    admission.value,
    foodMin.value,
    travelCostVnd,
    guideCostVnd,
  ]);
  if (!groupMin.ok) return groupMin;
  const groupMax = sumOrOverflow([
    admission.value,
    foodMax.value,
    travelCostVnd,
    guideCostVnd,
  ]);
  if (!groupMax.ok) return groupMax;

  return {
    ok: true,
    value: {
      admissionCostVnd: admission.value,
      foodCostMinVnd: foodMin.value,
      foodCostMaxVnd: foodMax.value,
      travelCostVnd,
      guideCostVnd,
      payAtVendorMinVnd: payAtVendorMin.value,
      payAtVendorMaxVnd: payAtVendorMax.value,
      customerPayableVnd: customerPayable.value,
      groupCostMinVnd: groupMin.value,
      groupCostMaxVnd: groupMax.value,
      groupCostVnd: groupMax.value,
    },
  };
}
