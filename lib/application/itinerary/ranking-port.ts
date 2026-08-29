import type {
  ExperienceType,
  Pace,
  PlaceCandidate,
  PriorityWeights,
  Result,
} from "@/lib/domain/itinerary/contracts";
import {
  foodSelectionSchema,
  type FoodSelection,
} from "@/lib/domain/food/contracts";
import { domainError } from "@/lib/domain/itinerary/errors";

export interface PublicRankCandidate {
  id: string;
  areaId: string;
  types: ExperienceType[];
  visitDurationMinutes: number;
}

export interface RankRequest {
  readonly candidates: readonly PublicRankCandidate[];
  readonly priorityWeights: PriorityWeights;
  readonly pace: Pace;
  readonly allowedVendorIds: readonly string[];
  readonly allowedMenuItemIds: readonly string[];
}

export interface RankFoodSelection {
  readonly placeId: string;
  readonly selection: FoodSelection;
}

export interface RankResponse {
  readonly orderedIds: readonly string[];
  readonly rationales: Readonly<Record<string, string>>;
  readonly foodSelections: readonly RankFoodSelection[];
}

export type Ranker = (
  request: RankRequest,
  signal: AbortSignal,
) => Promise<RankResponse>;

export interface ValidatedRankResponse {
  orderedIds: string[];
  rationales: Record<string, string>;
  foodSelections: RankFoodSelection[];
}

const invalidRankResponse = <T>(): Result<T> => ({
  ok: false,
  error: domainError(
    "INVALID_ITINERARY_INPUT",
    "itinerary.ai.invalid",
    ["rankResponse"],
  ),
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length) return false;
  const expectedSet = new Set(expected);
  return keys.every((key) => {
    if (typeof key !== "string" || !expectedSet.has(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
  });
}

function isDenseStringArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  if (Object.getPrototypeOf(value) !== Array.prototype) return false;
  const ownKeys = Reflect.ownKeys(value);
  const allowedKeys = new Set<string>(["length"]);
  for (let index = 0; index < value.length; index += 1) {
    allowedKeys.add(String(index));
  }
  if (
    ownKeys.some((key) => typeof key !== "string" || !allowedKeys.has(key)) ||
    ownKeys.length !== value.length + 1
  ) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) return false;
    if (typeof value[index] !== "string") return false;
  }
  return true;
}

function isDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  if (Object.getPrototypeOf(value) !== Array.prototype) return false;
  const ownKeys = Reflect.ownKeys(value);
  const allowedKeys = new Set<string>(["length"]);
  for (let index = 0; index < value.length; index += 1) {
    allowedKeys.add(String(index));
  }
  if (
    ownKeys.some((key) => typeof key !== "string" || !allowedKeys.has(key)) ||
    ownKeys.length !== value.length + 1
  ) return false;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) return false;
  }
  return true;
}

function isCodePointSafe(value: string): boolean {
  return Array.from(value).length <= 240;
}

/**
 * Project trusted internal candidates into the deliberately small provider DTO.
 * No names, support records, contact data, account identifiers, or pricing are
 * exposed to an AI adapter.
 */
export function toPublicRankRequest(
  candidates: readonly PlaceCandidate[],
  priorityWeights: PriorityWeights,
  pace: Pace,
  allowedVendorIds: readonly string[] = [],
  allowedMenuItemIds: readonly string[] = [],
): RankRequest {
  return {
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      areaId: candidate.areaId,
      types: [...candidate.types],
      visitDurationMinutes: candidate.visitDurationMinutes,
    })),
    priorityWeights: { ...priorityWeights },
    pace,
    allowedVendorIds: Object.freeze([...allowedVendorIds]),
    allowedMenuItemIds: Object.freeze([...allowedMenuItemIds]),
  };
}

export interface RankFoodValidationOptions {
  readonly allowedVendorIds: readonly string[];
  readonly allowedMenuItemIds: readonly string[];
  readonly canonicalSelectionsByPlace: ReadonlyMap<
    string,
    readonly FoodSelection[]
  >;
  readonly lockedFoodlessPlaceIds?: readonly string[];
}

function cloneFoodSelection(selection: FoodSelection): FoodSelection {
  return {
    vendorId: selection.vendorId,
    menuItemId: selection.menuItemId,
    quantity: selection.quantity,
    priceVndMin: selection.priceVndMin,
    priceVndMax: selection.priceVndMax,
    paymentMode: selection.paymentMode,
    activity: selection.activity,
  };
}

function sameFoodSelection(left: FoodSelection, right: FoodSelection): boolean {
  return left.vendorId === right.vendorId
    && left.menuItemId === right.menuItemId
    && left.quantity === right.quantity
    && left.priceVndMin === right.priceVndMin
    && left.priceVndMax === right.priceVndMax
    && left.paymentMode === right.paymentMode
    && left.activity === right.activity;
}

function validateFoodSelections(
  value: unknown,
  orderedIds: readonly string[],
  options: RankFoodValidationOptions | undefined,
): RankFoodSelection[] | null {
  if (!isDenseArray(value)) return null;
  if (options === undefined) {
    return value.length === 0 ? [] : null;
  }

  const lockedFoodlessPlaceIds = options.lockedFoodlessPlaceIds ?? [];
  if (
    !isDenseStringArray(options.allowedVendorIds) ||
    !isDenseStringArray(options.allowedMenuItemIds) ||
    !isDenseStringArray(lockedFoodlessPlaceIds)
  ) return null;

  const allowedVendors = new Set<string>();
  const allowedMenuItems = new Set<string>();
  for (let index = 0; index < options.allowedVendorIds.length; index += 1) {
    const id = options.allowedVendorIds[index];
    if (typeof id !== "string" || allowedVendors.has(id)) return null;
    allowedVendors.add(id);
  }
  for (let index = 0; index < options.allowedMenuItemIds.length; index += 1) {
    const id = options.allowedMenuItemIds[index];
    if (typeof id !== "string" || allowedMenuItems.has(id)) return null;
    allowedMenuItems.add(id);
  }

  const foodPlaceIds = new Set(options.canonicalSelectionsByPlace.keys());
  const orderedSet = new Set(orderedIds);
  const seenPlaces = new Set<string>();
  const validated: RankFoodSelection[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index];
    if (!isPlainObject(raw) || !hasExactKeys(raw, ["placeId", "selection"])) return null;
    const placeId = raw.placeId;
    if (typeof placeId !== "string" || !orderedSet.has(placeId) || seenPlaces.has(placeId)) return null;
    if (!foodPlaceIds.has(placeId)) return null;
    if (lockedFoodlessPlaceIds.includes(placeId)) return null;
    seenPlaces.add(placeId);

    const rawSelection = raw.selection;
    if (!isPlainObject(rawSelection) || !hasExactKeys(rawSelection, [
      "vendorId",
      "menuItemId",
      "quantity",
      "priceVndMin",
      "priceVndMax",
      "paymentMode",
      "activity",
    ])) return null;
    const parsed = foodSelectionSchema.safeParse(rawSelection);
    if (!parsed.success) return null;
    const selection = parsed.data;
    if (!allowedVendors.has(selection.vendorId) || !allowedMenuItems.has(selection.menuItemId)) return null;

    const canonical = options.canonicalSelectionsByPlace.get(placeId);
    if (canonical === undefined) return null;
    const match = canonical.find((candidate) => sameFoodSelection(candidate, selection));
    if (match === undefined) return null;
    const cloned = cloneFoodSelection(match);
    validated.push({ placeId, selection: cloned });
  }

  for (let index = 0; index < orderedIds.length; index += 1) {
    const placeId = orderedIds[index];
    if (!foodPlaceIds.has(placeId)) continue;
    const canonical = options.canonicalSelectionsByPlace.get(placeId);
    if (!seenPlaces.has(placeId) && lockedFoodlessPlaceIds.includes(placeId)) continue;
    if (canonical === undefined || canonical.length === 0 || !seenPlaces.has(placeId)) return null;
  }

  return validated;
}

/**
 * Validate and clone a provider response against the currently filtered IDs.
 * This boundary is intentionally defensive: sparse arrays, proxies/getters,
 * inherited keys, symbols, duplicate/unknown IDs, and rationale mismatches all
 * invalidate the complete response.
 */
export function validateRankResponse(
  value: unknown,
  filteredIds: readonly string[],
  foodOptions?: RankFoodValidationOptions,
): Result<ValidatedRankResponse> {
  try {
    if (!isDenseStringArray(filteredIds)) return invalidRankResponse();
    const filteredSet = new Set<string>();
    for (let index = 0; index < filteredIds.length; index += 1) {
      const id = filteredIds[index];
      if (typeof id !== "string" || filteredSet.has(id)) return invalidRankResponse();
      filteredSet.add(id);
    }
    if (!isPlainObject(value) || !hasExactKeys(value, ["orderedIds", "rationales", "foodSelections"])) {
      return invalidRankResponse();
    }

    const orderedIdsValue = value.orderedIds;
    if (!isDenseStringArray(orderedIdsValue) || orderedIdsValue.length === 0) {
      return invalidRankResponse();
    }

    const seen = new Set<string>();
    for (let index = 0; index < orderedIdsValue.length; index += 1) {
      const id = orderedIdsValue[index];
      if (!filteredSet.has(id) || seen.has(id)) return invalidRankResponse();
      seen.add(id);
    }

    const rationalesValue = value.rationales;
    if (
      !isPlainObject(rationalesValue) ||
      !hasExactKeys(rationalesValue, orderedIdsValue)
    ) {
      return invalidRankResponse();
    }

    const rationales: Record<string, string> = {};
    for (let index = 0; index < orderedIdsValue.length; index += 1) {
      const id = orderedIdsValue[index];
      if (!Object.prototype.hasOwnProperty.call(rationalesValue, id)) {
        return invalidRankResponse();
      }
      const rationale = rationalesValue[id];
      if (typeof rationale !== "string" || !isCodePointSafe(rationale)) {
        return invalidRankResponse();
      }
      Object.defineProperty(rationales, id, {
        value: rationale,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }

    const foodSelections = validateFoodSelections(
      value.foodSelections,
      [...orderedIdsValue],
      foodOptions,
    );
    if (foodSelections === null) return invalidRankResponse();

    return {
      ok: true,
      value: {
        orderedIds: [...orderedIdsValue],
        rationales,
        foodSelections,
      },
    };
  } catch {
    return invalidRankResponse();
  }
}
