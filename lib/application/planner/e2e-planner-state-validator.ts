import type { Locale } from "@/lib/i18n/config";
import {
  type ItineraryPreviewFoodSelectionDto,
} from "@/lib/application/api/read-only-api";
import {
  isPersonalizationRequest,
  toItineraryRequest,
  type PersonalizationRequest,
} from "@/lib/application/planner/personalization-session";
import type {
  DemoPlannerItem,
  DemoPlannerRevision,
  DemoPlannerState,
  DemoPlannerTotals,
} from "@/lib/application/planner/demo-planner";

/** Browser-only test seam. Production and normal local demos ignore this key. */
export const E2E_PLANNER_STATE_SESSION_KEY = "localens.planner.e2e.v1";

/** Keep malformed or unexpectedly large browser payloads out of JSON.parse. */
export const MAX_E2E_PLANNER_STATE_CHARS = 256_000;

const PLANNER_STATE_KEYS = ["planId", "locale", "preferences", "current", "history"] as const;
const PLANNER_REVISION_KEYS = ["revision", "budgetVnd", "items", "totals", "warnings", "feedback"] as const;
const PLANNER_ITEM_KEYS = [
  "id",
  "placeId",
  "title",
  "startAt",
  "endAt",
  "activity",
  "visitDurationMinutes",
  "travelMinutesBefore",
  "transitionBufferMinutesBefore",
  "travelCostVndBefore",
  "placeCostVnd",
  "foodSelection",
  "foodCostMinVnd",
  "foodCostMaxVnd",
  "payAtVendorMinVnd",
  "payAtVendorMaxVnd",
  "customerPayableVnd",
  "locked",
] as const;
const PLANNER_TOTAL_KEYS = [
  "durationMinutes",
  "costVnd",
  "admissionCostVnd",
  "foodCostMinVnd",
  "foodCostMaxVnd",
  "travelCostVnd",
  "guideCostVnd",
  "payAtVendorMinVnd",
  "payAtVendorMaxVnd",
  "customerPayableVnd",
  "groupCostMinVnd",
  "groupCostMaxVnd",
] as const;
const FOOD_SELECTION_KEYS = [
  "venueTitle",
  "vendorTitle",
  "locationNote",
  "menuTitle",
  "servingUnit",
  "quantity",
  "priceVndMin",
  "priceVndMax",
  "activity",
  "dietaryAllergenCaveat",
  "accessibilityVendorWarning",
  "paymentMode",
] as const;
const PERSONALIZATION_KEYS = [
  "startAt",
  "durationMinutes",
  "areas",
  "budget",
  "partySize",
  "guideLanguage",
  "priorityWeights",
  "pace",
  "dietaryRequirements",
  "mobilityRequirements",
  "lockedStopIds",
  "specialNeeds",
] as const;
const BUDGET_KEYS = ["currency", "amountMinor"] as const;
const PRIORITY_KEYS = ["street_food", "history", "traditional_craft", "traditional_market"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    && actual.every((key) => keys.includes(key));
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isBoundedText(value: unknown, maxLength: number, allowEmpty = false): value is string {
  return typeof value === "string"
    && (allowEmpty ? value.length <= maxLength : value.length > 0 && value.length <= maxLength)
    && !/[\u0000-\u001F\u007F]/.test(value);
}

function isUniqueStringArray(value: unknown, maxLength: number, itemMaxLength: number): value is readonly string[] {
  return Array.isArray(value)
    && value.length <= maxLength
    && value.every((item) => isBoundedText(item, itemMaxLength))
    && new Set(value).size === value.length;
}

type PlannerTime = Readonly<{ absoluteMinute: number }>;

function parsePlannerTime(value: unknown): PlannerTime | null {
  if (typeof value !== "string") return null;
  const timeOnly = /^(?:([01]\d|2[0-3]):([0-5]\d))$/.exec(value);
  if (timeOnly) return { absoluteMinute: Number(timeOnly[1]) * 60 + Number(timeOnly[2]) };

  const dated = /^(\d{4}-\d{2}-\d{2}) ((?:[01]\d|2[0-3])):([0-5]\d)$/.exec(value);
  if (!dated) return null;
  const dateValue = new Date(`${dated[1]}T00:00:00Z`);
  if (!Number.isFinite(dateValue.valueOf()) || dateValue.toISOString().slice(0, 10) !== dated[1]) return null;
  return {
    absoluteMinute: dateValue.valueOf() / 60_000 + Number(dated[2]) * 60 + Number(dated[3]),
  };
}

function isStrictPersonalizationRequest(value: unknown): value is PersonalizationRequest {
  if (!isRecord(value) || !hasExactKeys(value, PERSONALIZATION_KEYS) || !isPersonalizationRequest(value)) return false;
  if (!isRecord(value.budget) || !hasExactKeys(value.budget, BUDGET_KEYS)) return false;
  if (!isRecord(value.priorityWeights) || !hasExactKeys(value.priorityWeights, PRIORITY_KEYS)) return false;
  if (!isUniqueStringArray(value.areas, 8, 80)
    || !isUniqueStringArray(value.dietaryRequirements, 8, 80)
    || !isUniqueStringArray(value.mobilityRequirements, 8, 80)
    || !isUniqueStringArray(value.lockedStopIds, 24, 120)
    || !isBoundedText(value.specialNeeds, 1_000, true)) return false;
  return Object.keys(toItineraryRequest(value)).length === PERSONALIZATION_KEYS.length - 1;
}

function isStrictFoodSelection(
  value: unknown,
  partySize: number,
): value is ItineraryPreviewFoodSelectionDto {
  if (!isRecord(value) || !hasExactKeys(value, FOOD_SELECTION_KEYS)) return false;
  if (!isBoundedText(value.venueTitle, 2_000)
    || !isBoundedText(value.vendorTitle, 2_000)
    || !isBoundedText(value.locationNote, 2_000)
    || !isBoundedText(value.menuTitle, 2_000)
    || !(["portion", "bowl", "piece", "drink", "shared_set"] as const).includes(value.servingUnit as never)
    || !isSafeNonNegativeInteger(value.quantity)
    || value.quantity <= 0
    || !isSafeNonNegativeInteger(value.priceVndMin)
    || !isSafeNonNegativeInteger(value.priceVndMax)
    || value.priceVndMin > value.priceVndMax
    || !isBoundedText(value.activity, 2_000)
    || !isBoundedText(value.dietaryAllergenCaveat, 2_000)
    || !isBoundedText(value.accessibilityVendorWarning, 2_000)
    || value.paymentMode !== "pay_at_vendor") return false;
  return value.servingUnit === "shared_set" ? value.quantity === 1 : value.quantity === partySize;
}

function safeProduct(left: number, right: number): number | null {
  const value = left * right;
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function safeSum(values: readonly number[]): number | null {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(total) || total < 0) return null;
  }
  return total;
}

function isStrictPlannerItem(value: unknown, partySize: number): value is DemoPlannerItem {
  if (!isRecord(value) || !hasExactKeys(value, PLANNER_ITEM_KEYS)) return false;
  const start = parsePlannerTime(value.startAt);
  const end = parsePlannerTime(value.endAt);
  if (!isBoundedText(value.id, 160)
    || !isBoundedText(value.placeId, 160)
    || !isBoundedText(value.title, 2_000)
    || start === null
    || end === null
    || end.absoluteMinute <= start.absoluteMinute
    || !isBoundedText(value.activity, 2_000)
    || !isSafeNonNegativeInteger(value.visitDurationMinutes)
    || value.visitDurationMinutes < 15
    || value.visitDurationMinutes > 480
    || !isSafeNonNegativeInteger(value.travelMinutesBefore)
    || (value.transitionBufferMinutesBefore !== 0 && value.transitionBufferMinutesBefore !== 10)
    || !isSafeNonNegativeInteger(value.travelCostVndBefore)
    || !isSafeNonNegativeInteger(value.placeCostVnd)
    || !isSafeNonNegativeInteger(value.foodCostMinVnd)
    || !isSafeNonNegativeInteger(value.foodCostMaxVnd)
    || value.foodCostMinVnd > value.foodCostMaxVnd
    || !isSafeNonNegativeInteger(value.payAtVendorMinVnd)
    || !isSafeNonNegativeInteger(value.payAtVendorMaxVnd)
    || value.payAtVendorMinVnd > value.payAtVendorMaxVnd
    || !isSafeNonNegativeInteger(value.customerPayableVnd)
    || typeof value.locked !== "boolean") return false;

  if (value.foodSelection === null) {
    if (value.foodCostMinVnd !== 0 || value.foodCostMaxVnd !== 0 || value.payAtVendorMinVnd !== 0 || value.payAtVendorMaxVnd !== 0) return false;
  } else {
    if (!isStrictFoodSelection(value.foodSelection, partySize)) return false;
    const minCost = safeProduct(value.foodSelection.priceVndMin, value.foodSelection.quantity);
    const maxCost = safeProduct(value.foodSelection.priceVndMax, value.foodSelection.quantity);
    if (minCost === null || maxCost === null
      || value.foodCostMinVnd !== minCost
      || value.foodCostMaxVnd !== maxCost
      || value.payAtVendorMinVnd !== minCost
      || value.payAtVendorMaxVnd !== maxCost) return false;
  }
  const customerTotal = value.placeCostVnd + value.travelCostVndBefore;
  return Number.isSafeInteger(customerTotal) && value.customerPayableVnd === customerTotal;
}

function safeTotalsFor(items: readonly DemoPlannerItem[]): DemoPlannerTotals | null {
  const durationMinutes = safeSum(items.map((item) => item.visitDurationMinutes + item.travelMinutesBefore + item.transitionBufferMinutesBefore));
  const admissionCostVnd = safeSum(items.map((item) => item.placeCostVnd));
  const foodCostMinVnd = safeSum(items.map((item) => item.foodCostMinVnd));
  const foodCostMaxVnd = safeSum(items.map((item) => item.foodCostMaxVnd));
  const travelCostVnd = safeSum(items.map((item) => item.travelCostVndBefore));
  const payAtVendorMinVnd = safeSum(items.map((item) => item.payAtVendorMinVnd));
  const payAtVendorMaxVnd = safeSum(items.map((item) => item.payAtVendorMaxVnd));
  const customerPayableVnd = safeSum(items.map((item) => item.customerPayableVnd));
  if ([durationMinutes, admissionCostVnd, foodCostMinVnd, foodCostMaxVnd, travelCostVnd, payAtVendorMinVnd, payAtVendorMaxVnd, customerPayableVnd].some((value) => value === null)) return null;
  const groupCostMinVnd = admissionCostVnd! + foodCostMinVnd! + travelCostVnd!;
  const groupCostMaxVnd = admissionCostVnd! + foodCostMaxVnd! + travelCostVnd!;
  if (!Number.isSafeInteger(groupCostMinVnd) || !Number.isSafeInteger(groupCostMaxVnd)) return null;
  return {
    durationMinutes: durationMinutes!,
    costVnd: customerPayableVnd!,
    admissionCostVnd: admissionCostVnd!,
    foodCostMinVnd: foodCostMinVnd!,
    foodCostMaxVnd: foodCostMaxVnd!,
    travelCostVnd: travelCostVnd!,
    guideCostVnd: 0,
    payAtVendorMinVnd: payAtVendorMinVnd!,
    payAtVendorMaxVnd: payAtVendorMaxVnd!,
    customerPayableVnd: customerPayableVnd!,
    groupCostMinVnd,
    groupCostMaxVnd,
  };
}

export function totalsFor(items: readonly DemoPlannerItem[]): DemoPlannerTotals {
  return {
    durationMinutes: items.reduce((total, item) => total + item.visitDurationMinutes + item.travelMinutesBefore + item.transitionBufferMinutesBefore, 0),
    costVnd: items.reduce((total, item) => total + item.customerPayableVnd, 0),
    admissionCostVnd: items.reduce((total, item) => total + item.placeCostVnd, 0),
    foodCostMinVnd: items.reduce((total, item) => total + item.foodCostMinVnd, 0),
    foodCostMaxVnd: items.reduce((total, item) => total + item.foodCostMaxVnd, 0),
    travelCostVnd: items.reduce((total, item) => total + item.travelCostVndBefore, 0),
    guideCostVnd: 0,
    payAtVendorMinVnd: items.reduce((total, item) => total + item.payAtVendorMinVnd, 0),
    payAtVendorMaxVnd: items.reduce((total, item) => total + item.payAtVendorMaxVnd, 0),
    customerPayableVnd: items.reduce((total, item) => total + item.customerPayableVnd, 0),
    groupCostMinVnd: items.reduce((total, item) => total + item.placeCostVnd + item.foodCostMinVnd + item.travelCostVndBefore, 0),
    groupCostMaxVnd: items.reduce((total, item) => total + item.placeCostVnd + item.foodCostMaxVnd + item.travelCostVndBefore, 0),
  };
}

function isStrictPlannerTotals(value: unknown, items: readonly DemoPlannerItem[]): value is DemoPlannerTotals {
  if (!isRecord(value) || !hasExactKeys(value, PLANNER_TOTAL_KEYS)) return false;
  if (!PLANNER_TOTAL_KEYS.every((key) => isSafeNonNegativeInteger(value[key]))) return false;
  const expected = safeTotalsFor(items);
  return expected !== null && PLANNER_TOTAL_KEYS.every((key) => value[key] === expected[key]);
}

function isStrictPlannerRevision(value: unknown, partySize: number, durationMinutes: number): value is DemoPlannerRevision {
  if (!isRecord(value) || !hasExactKeys(value, PLANNER_REVISION_KEYS)
    || typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 1
    || !Array.isArray(value.items) || value.items.length > 8
    || !value.items.every((item) => isStrictPlannerItem(item, partySize))
    || (value.budgetVnd !== null && !isSafeNonNegativeInteger(value.budgetVnd))
    || !Array.isArray(value.warnings) || value.warnings.length > 24 || !value.warnings.every((warning) => isBoundedText(warning, 2_000))
    || !isBoundedText(value.feedback, 2_000, true)) return false;

  const items = value.items as DemoPlannerItem[];
  if (new Set(items.map((item) => item.id)).size !== items.length || new Set(items.map((item) => item.placeId)).size !== items.length) return false;
  let previousEnd: number | null = null;
  for (const item of items) {
    const start = parsePlannerTime(item.startAt)!;
    const end = parsePlannerTime(item.endAt)!;
    if (previousEnd !== null && start.absoluteMinute < previousEnd) return false;
    previousEnd = end.absoluteMinute;
  }
  if (!isStrictPlannerTotals(value.totals, items)) return false;
  const totals = value.totals as DemoPlannerTotals;
  return totals.durationMinutes <= durationMinutes
    && (value.budgetVnd === null || totals.groupCostMaxVnd <= value.budgetVnd);
}

export function isStrictPlannerState(value: unknown, locale: Locale): value is DemoPlannerState {
  if (!isRecord(value) || !hasExactKeys(value, PLANNER_STATE_KEYS)
    || !isBoundedText(value.planId, 120)
    || value.locale !== locale
    || (value.preferences !== null && !isStrictPersonalizationRequest(value.preferences))
    || !Array.isArray(value.history) || value.history.length > 12) return false;

  const preferences = value.preferences as PersonalizationRequest | null;
  const partySize = preferences?.partySize ?? 1;
  const durationMinutes = preferences?.durationMinutes ?? 720;
  if (!isStrictPlannerRevision(value.current, partySize, durationMinutes)) return false;
  if (!(value.history as unknown[]).every((revision) => isStrictPlannerRevision(revision, partySize, durationMinutes))) return false;
  const current = value.current as DemoPlannerRevision;
  return (value.history as DemoPlannerRevision[]).every((revision) => revision.revision < current.revision);
}

/** Read a fully validated planner snapshot supplied by the E2E harness. */
export function readE2EPlannerState(locale: Locale): DemoPlannerState | null {
  if (process.env.NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES !== "1" || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(E2E_PLANNER_STATE_SESSION_KEY);
    if (raw === null || raw.length > MAX_E2E_PLANNER_STATE_CHARS) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStrictPlannerState(parsed, locale) ? parsed : null;
  } catch {
    return null;
  }
}
