import {
  itineraryRequestSchema,
  placeCandidateSchema,
  type ItineraryRequest,
  type OpeningInterval,
  type PlaceCandidate,
  type Result,
} from "@/lib/domain/itinerary/contracts";
import {
  foodMenuItemSchema,
  foodVendorSchema,
  type FoodMenuItemCandidate,
  type FoodSelection,
  type FoodVendorCandidate,
} from "@/lib/domain/food/contracts";
import { formatHcmMinute, normalizeToHcmMinute, MINUTES_PER_DAY } from "@/lib/domain/itinerary/local-time";
import { getOpeningIntervals } from "@/lib/domain/itinerary/opening-hours";
import { multiplyVnd } from "@/lib/domain/itinerary/money";

export const FOOD_SELECTION_ERROR_CODES = Object.freeze([
  "NO_SELLABLE_VENDOR",
  "NO_SELLABLE_MENU_ITEM",
  "UNKNOWN_PRICE",
  "SUPPORT_UNKNOWN",
  "VENDOR_CLOSED",
  "FOOD_OVER_BUDGET",
] as const);

export type FoodSelectionErrorCode = (typeof FOOD_SELECTION_ERROR_CODES)[number];

export interface FoodSelectionError {
  readonly code: FoodSelectionErrorCode;
  readonly messageKey: string;
  readonly retryable: false;
}

export type FoodActivityInterval = Pick<
  OpeningInterval,
  "startEpochMinute" | "endEpochMinute"
>;

const FOOD_ACTIVITY = "Taste and discuss the selected dish";
const MAX_SAFE_BUDGET = Number.MAX_SAFE_INTEGER;

function foodError(code: FoodSelectionErrorCode): FoodSelectionError {
  return {
    code,
    messageKey: `itinerary.food_filter.${code.toLowerCase()}`,
    retryable: false,
  };
}

function failure<T>(code: FoodSelectionErrorCode): Result<T, FoodSelectionError> {
  return { ok: false, error: foodError(code) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSafeBudget(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function supportSatisfies(
  support: unknown,
  requirements: readonly string[],
): boolean {
  if (!isRecord(support)) return false;
  return requirements.every((key) => support[key] === "supported");
}

function isValidRequest(request: unknown): request is ItineraryRequest {
  return itineraryRequestSchema.safeParse(request).success;
}

function compareById(left: { id: string }, right: { id: string }): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function hasKnownPrice(item: unknown): item is FoodMenuItemCandidate {
  if (!isRecord(item)) return false;
  return (
    typeof item.priceVndMin === "number" &&
    Number.isSafeInteger(item.priceVndMin) &&
    item.priceVndMin >= 0 &&
    typeof item.priceVndMax === "number" &&
    Number.isSafeInteger(item.priceVndMax) &&
    item.priceVndMax >= item.priceVndMin &&
    item.priceVndMax >= 0
  );
}

function isPotentiallySellableItem(item: unknown): boolean {
  return (
    isRecord(item) &&
    item.status === "sellable" &&
    item.available === true
  );
}

function quantityFor(
  item: FoodMenuItemCandidate,
  partySize: number,
): number {
  return item.servingUnit === "shared_set" ? 1 : partySize;
}

function itemSupportsRequest(
  item: FoodMenuItemCandidate,
  request: ItineraryRequest,
): boolean {
  return supportSatisfies(item.dietarySupport, request.dietaryRequirements);
}

function vendorSupportsRequest(
  vendor: FoodVendorCandidate,
  request: ItineraryRequest,
): boolean {
  return (
    supportSatisfies(vendor.dietarySupport, request.dietaryRequirements) &&
    supportSatisfies(vendor.mobilitySupport, request.mobilityRequirements)
  );
}

/** Select one concrete, priced menu item using stable ID order. */
export function chooseFoodSelection(
  vendor: FoodVendorCandidate,
  request: ItineraryRequest,
  remainingBudgetVnd: number,
): Result<FoodSelection, FoodSelectionError> {
  if (!isValidRequest(request) || !isSafeBudget(remainingBudgetVnd)) {
    return failure("NO_SELLABLE_VENDOR");
  }

  const rawVendor = vendor as unknown;
  if (!isRecord(rawVendor) || rawVendor.status !== "sellable") {
    return failure("NO_SELLABLE_VENDOR");
  }
  const rawItems = Array.isArray(rawVendor.menuItems) ? rawVendor.menuItems : [];
  const parsedVendor = foodVendorSchema.safeParse(vendor);
  if (!parsedVendor.success) {
    if (
      rawItems.some(
        (item) => isPotentiallySellableItem(item) && !hasKnownPrice(item),
      )
    ) {
      return failure("UNKNOWN_PRICE");
    }
    return failure("NO_SELLABLE_VENDOR");
  }
  const selectedVendor = parsedVendor.data;
  if (!vendorSupportsRequest(selectedVendor, request)) {
    return failure("SUPPORT_UNKNOWN");
  }

  const validItems: FoodMenuItemCandidate[] = [];
  let unknownPrice = false;
  let unsupportedItem = false;

  for (const rawItem of rawItems) {
    if (isPotentiallySellableItem(rawItem) && !hasKnownPrice(rawItem)) {
      unknownPrice = true;
    }
    const parsedItem = foodMenuItemSchema.safeParse(rawItem);
    if (!parsedItem.success) continue;
    const item = parsedItem.data;
    if (item.status !== "sellable" || item.available !== true) continue;
    if (!itemSupportsRequest(item, request)) {
      unsupportedItem = true;
      continue;
    }
    validItems.push(item);
  }

  if (validItems.length === 0) {
    if (unknownPrice) return failure("UNKNOWN_PRICE");
    if (unsupportedItem) return failure("SUPPORT_UNKNOWN");
    return failure("NO_SELLABLE_MENU_ITEM");
  }

  validItems.sort(compareById);
  let overBudget = false;
  for (const item of validItems) {
    const quantity = quantityFor(item, request.partySize);
    const maxCost = multiplyVnd(item.priceVndMax, quantity);
    if (!maxCost.ok || maxCost.value > remainingBudgetVnd) {
      overBudget = true;
      continue;
    }
    return {
      ok: true,
      value: {
        vendorId: item.vendorId,
        menuItemId: item.id,
        quantity,
        priceVndMin: item.priceVndMin,
        priceVndMax: item.priceVndMax,
        paymentMode: "pay_at_vendor",
        activity: FOOD_ACTIVITY,
      },
    };
  }

  return overBudget
    ? failure("FOOD_OVER_BUDGET")
    : failure("NO_SELLABLE_MENU_ITEM");
}

function validInterval(interval: unknown): interval is FoodActivityInterval {
  if (!isRecord(interval)) return false;
  return (
    typeof interval.startEpochMinute === "number" &&
    Number.isSafeInteger(interval.startEpochMinute) &&
    typeof interval.endEpochMinute === "number" &&
    Number.isSafeInteger(interval.endEpochMinute) &&
    interval.startEpochMinute < interval.endEpochMinute
  );
}

function dateAtOrAfter(
  localDate: string,
  intervalEndEpochMinute: number,
): string | null {
  const start = normalizeToHcmMinute(`${localDate}T00:00:00+07:00`);
  if (!start.ok) return null;
  const endDate = formatHcmMinute(intervalEndEpochMinute).slice(0, 10);
  for (let dateStart = start.value; dateStart <= intervalEndEpochMinute; dateStart += MINUTES_PER_DAY) {
    const date = formatHcmMinute(dateStart).slice(0, 10);
    if (date === endDate) return date;
  }
  return null;
}

function vendorCoversInterval(
  place: PlaceCandidate,
  vendor: FoodVendorCandidate,
  visitDate: string,
  preferredInterval: FoodActivityInterval,
): boolean {
  const vendorPlace: PlaceCandidate = {
    ...place,
    openingHours: vendor.openingHours,
    openingExceptions: vendor.openingExceptions,
    foodVendors: place.foodVendors,
  };
  const parsed = placeCandidateSchema.safeParse(vendorPlace);
  if (!parsed.success) return false;
  const lastDate = dateAtOrAfter(visitDate, preferredInterval.endEpochMinute);
  if (lastDate === null) return false;

  const intervals: OpeningInterval[] = [];
  const firstStart = normalizeToHcmMinute(`${visitDate}T00:00:00+07:00`);
  if (!firstStart.ok) return false;
  for (let dateStart = firstStart.value; dateStart <= preferredInterval.endEpochMinute; dateStart += MINUTES_PER_DAY) {
    const date = formatHcmMinute(dateStart).slice(0, 10);
    const daily = getOpeningIntervals(parsed.data, date);
    if (!daily.ok) return false;
    intervals.push(...daily.value);
    if (date === lastDate) break;
  }
  intervals.sort((left, right) => left.startEpochMinute - right.startEpochMinute);

  let coveredUntil = preferredInterval.startEpochMinute;
  for (const opening of intervals) {
    if (opening.endEpochMinute <= coveredUntil) continue;
    if (opening.startEpochMinute > coveredUntil) return false;
    coveredUntil = Math.max(coveredUntil, opening.endEpochMinute);
    if (coveredUntil >= preferredInterval.endEpochMinute) return true;
  }
  return coveredUntil >= preferredInterval.endEpochMinute;
}

/**
 * Diagnostic companion for the required array-returning filter API. Parent,
 * vendors, and menu items are parsed as one strict catalog object graph, so a
 * child cannot silently come from another snapshot or parent relationship.
 */
export function diagnoseFoodVendors(
  place: PlaceCandidate,
  request: ItineraryRequest,
  visitDate: string,
  preferredInterval: FoodActivityInterval,
): Result<FoodVendorCandidate[], FoodSelectionError> {
  if (!isValidRequest(request) || typeof visitDate !== "string" || !validInterval(preferredInterval)) {
    return failure("NO_SELLABLE_VENDOR");
  }

  if (!placeCandidateSchema.safeParse(place).success) {
    const rawVendors = isRecord(place) && Array.isArray(place.foodVendors)
      ? place.foodVendors
      : [];
    if (rawVendors.some((vendor) => {
      if (!isRecord(vendor) || vendor.status !== "sellable") return false;
      const items = Array.isArray(vendor.menuItems) ? vendor.menuItems : [];
      return items.some(
        (item) => isPotentiallySellableItem(item) && !hasKnownPrice(item),
      );
    })) {
      return failure("UNKNOWN_PRICE");
    }
    return failure("NO_SELLABLE_VENDOR");
  }

  const sortedVendors = [...place.foodVendors].sort(compareById);
  if (sortedVendors.length === 0) return failure("NO_SELLABLE_VENDOR");

  const reasons: FoodSelectionErrorCode[] = [];
  const eligibleVendors: FoodVendorCandidate[] = [];
  for (const vendor of sortedVendors) {
    if (vendor.placeId !== place.id) {
      reasons.push("NO_SELLABLE_VENDOR");
      continue;
    }
    const selection = chooseFoodSelection(vendor, request, MAX_SAFE_BUDGET);
    if (!selection.ok) {
      reasons.push(selection.error.code);
      continue;
    }
    if (!vendorCoversInterval(place, vendor, visitDate, preferredInterval)) {
      reasons.push("VENDOR_CLOSED");
      continue;
    }
    eligibleVendors.push(vendor);
  }

  if (eligibleVendors.length > 0) {
    return { ok: true, value: eligibleVendors };
  }

  const reasonOrder: readonly FoodSelectionErrorCode[] = [
    "VENDOR_CLOSED",
    "FOOD_OVER_BUDGET",
    "SUPPORT_UNKNOWN",
    "UNKNOWN_PRICE",
    "NO_SELLABLE_MENU_ITEM",
    "NO_SELLABLE_VENDOR",
  ];
  const reason = reasonOrder.find((candidate) => reasons.includes(candidate));
  return failure(reason ?? "NO_SELLABLE_VENDOR");
}

/** Required API: return only vendors with a concrete feasible menu choice. */
export function filterFoodVendors(
  place: PlaceCandidate,
  request: ItineraryRequest,
  visitDate: string,
  preferredInterval: FoodActivityInterval,
): FoodVendorCandidate[] {
  const result = diagnoseFoodVendors(place, request, visitDate, preferredInterval);
  return result.ok ? result.value : [];
}
