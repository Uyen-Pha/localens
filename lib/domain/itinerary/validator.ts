import {
  itineraryResultSchema,
  type EngineInput,
  type PlaceCandidate,
  type ItineraryItem,
} from "@/lib/domain/itinerary/contracts";
import {
  foodMenuItemSchema,
  foodSelectionSchema,
  foodVendorSchema,
  type FoodSelection,
  type FoodVendorCandidate,
} from "@/lib/domain/food/contracts";
import { filterCandidates } from "@/lib/domain/itinerary/candidate-filter";
import { normalizeToHcmMinute, formatHcmMinute } from "@/lib/domain/itinerary/local-time";
import { findEarliestVisitStart } from "@/lib/domain/itinerary/opening-hours";
import { normalizeBudgetToVnd, multiplyVnd, sumVnd } from "@/lib/domain/itinerary/money";
import {
  calculateFoodSelectionCost,
  calculateItineraryCostBreakdown,
  type FoodSelectionCost,
} from "@/lib/domain/itinerary/food-cost";
import { findEarliestFoodVisitStart } from "@/lib/domain/itinerary/food-filter";
import { getTransition, indexTravelSnapshot } from "@/lib/domain/itinerary/travel";

export interface ValidationIssue {
  key: string;
  itemIndex?: number;
  placeId?: string;
}

/**
 * The only reduced validation universe permitted by the repair path. The
 * caller must provide the exact remaining candidate IDs; normal validation
 * intentionally has no reduced-candidate behavior.
 */
export interface ValidationScope {
  candidateIds: readonly string[];
}

type IssueLocation = Pick<ValidationIssue, "itemIndex" | "placeId">;

class IssueCollector {
  private readonly values: ValidationIssue[] = [];

  public add(key: string, location: IssueLocation = {}): void {
    const issue: ValidationIssue = { key };
    if (Number.isSafeInteger(location.itemIndex) && location.itemIndex !== undefined) {
      issue.itemIndex = location.itemIndex;
    }
    // Place IDs originate in the trusted catalog. Never copy a value supplied
    // only by an untrusted result into an issue, since it could contain PII.
    if (location.placeId !== undefined) issue.placeId = location.placeId;
    if (!this.values.some((existing) =>
      existing.key === issue.key &&
      existing.itemIndex === issue.itemIndex &&
      existing.placeId === issue.placeId,
    )) this.values.push(issue);
  }

  public get issues(): ValidationIssue[] {
    return [...this.values];
  }
}

const RESULT_MALFORMED = "result.malformed";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function issueLocation(index: number, place?: PlaceCandidate): IssueLocation {
  return { itemIndex: index, ...(place ? { placeId: place.id } : {}) };
}

function selectedType(place: PlaceCandidate, input: EngineInput, locked: boolean): boolean {
  if (locked) return true;
  return place.types.some((type) => input.request.priorityWeights[type] > 0);
}

function isFoodPriorityPlace(place: PlaceCandidate, input: EngineInput): boolean {
  return (
    input.request.priorityWeights.street_food > 0 &&
    place.types.some((type) => type === "street_food" || type === "traditional_market")
  );
}

function supports(
  value: Record<string, unknown>,
  requirements: readonly string[],
): boolean {
  return requirements.every((requirement) => value[requirement] === "supported");
}

function optionalSellabilityPasses(place: PlaceCandidate): boolean {
  const value = place as PlaceCandidate & { active?: unknown; sellable?: unknown };
  return (
    (!("active" in value) || value.active === true) &&
    (!("sellable" in value) || value.sellable === true)
  );
}

function resultShapeIsUsable(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  return Array.isArray(value.items) && isObject(value.totals) && isObject(value.snapshotIds);
}

function getCanonicalMinute(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeToHcmMinute(value);
  if (!normalized.ok) return null;
  return normalized.value;
}

function scoreFor(
  place: PlaceCandidate,
  input: EngineInput,
  rankedIndex: number,
  candidateCount: number,
): number {
  const maxWeight = place.types.reduce(
    (maximum, type) => Math.max(maximum, input.request.priorityWeights[type]),
    0,
  );
  return maxWeight * 1000 + (candidateCount - rankedIndex);
}

function addExactNumberIssue(
  collector: IssueCollector,
  key: string,
  actual: unknown,
  expected: number,
  location: IssueLocation = {},
): void {
  if (typeof actual !== "number" || !Object.is(actual, expected)) {
    collector.add(key, location);
  }
}

interface ValidatedFood {
  selection: FoodSelection | null;
  vendor: FoodVendorCandidate | null;
  cost: FoodSelectionCost | null;
}

function validateFoodSelection(
  collector: IssueCollector,
  place: PlaceCandidate,
  input: EngineInput,
  itemValue: Record<string, unknown>,
  location: IssueLocation,
): ValidatedFood {
  const requiresFood = isFoodPriorityPlace(place, input);
  const rawSelection = itemValue.foodSelection;
  if (rawSelection === null) {
    if (requiresFood) collector.add("food.selection.missing", location);
    return { selection: null, vendor: null, cost: null };
  }
  const parsedSelection = foodSelectionSchema.safeParse(rawSelection);
  if (!parsedSelection.success) {
    collector.add("food.selection.malformed", location);
    if (isObject(rawSelection) && rawSelection.paymentMode !== "pay_at_vendor") {
      collector.add("food.payment_mode", location);
    }
    if (!requiresFood) collector.add("food.selection.unexpected", location);
    return { selection: null, vendor: null, cost: null };
  }
  const selection = parsedSelection.data;
  if (!requiresFood) collector.add("food.selection.unexpected", location);

  const vendor = place.foodVendors.find((candidate) => candidate.id === selection.vendorId) ?? null;
  if (vendor === null || vendor.placeId !== place.id) {
    collector.add("food.vendor.membership", location);
    return { selection, vendor: null, cost: null };
  }
  if (!foodVendorSchema.safeParse(vendor).success) {
    collector.add("food.vendor.malformed", location);
    return { selection, vendor, cost: null };
  }
  if (vendor.status !== "sellable") collector.add("food.vendor.status", location);
  if (!supports(vendor.dietarySupport, input.request.dietaryRequirements) ||
      !supports(vendor.mobilitySupport, input.request.mobilityRequirements)) {
    collector.add("food.support", location);
  }

  const menuItem = vendor.menuItems.find((candidate) => candidate.id === selection.menuItemId) ?? null;
  if (menuItem === null) {
    const elsewhere = input.catalog.places.some((candidate) =>
      candidate.foodVendors.some((candidateVendor) =>
        candidateVendor.menuItems.some((candidateItem) => candidateItem.id === selection.menuItemId),
      ),
    );
    collector.add(elsewhere ? "food.menu.parent" : "food.menu.membership", location);
    return { selection, vendor, cost: null };
  }
  if (menuItem.vendorId !== vendor.id) collector.add("food.menu.parent", location);
  if (!foodMenuItemSchema.safeParse(menuItem).success) {
    collector.add("food.menu.malformed", location);
    return { selection, vendor, cost: null };
  }
  if (menuItem.available !== true || menuItem.status !== "sellable") {
    collector.add("food.item.status", location);
  }
  if (!supports(menuItem.dietarySupport, input.request.dietaryRequirements)) {
    collector.add("food.support", location);
  }
  if (selection.priceVndMin !== menuItem.priceVndMin || selection.priceVndMax !== menuItem.priceVndMax) {
    collector.add("food.price_snapshot", location);
  }
  const expectedQuantity = menuItem.servingUnit === "shared_set" ? 1 : input.request.partySize;
  if (selection.quantity !== expectedQuantity) collector.add("food.quantity", location);
  if (selection.paymentMode !== "pay_at_vendor") collector.add("food.payment_mode", location);

  const cost = calculateFoodSelectionCost(selection, menuItem, input.request.partySize);
  if (!cost.ok) {
    collector.add("food.cost", location);
    return { selection, vendor, cost: null };
  }
  return { selection, vendor, cost: cost.value };
}

function isDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  return true;
}

function scopedCandidates(
  collector: IssueCollector,
  scope: unknown,
  authoritativeCandidates: readonly PlaceCandidate[],
): PlaceCandidate[] {
  if (scope === undefined) return [...authoritativeCandidates];

  try {
    if (!isObject(scope) || !isDenseArray(scope.candidateIds)) {
      collector.add("rank_scope");
      return [];
    }
    const ids = scope.candidateIds;
    if (ids.length === 0 || !ids.every((id) => typeof id === "string" && id.length > 0)) {
      collector.add("rank_scope");
      return [];
    }
    const authoritativeIds = new Set(authoritativeCandidates.map((candidate) => candidate.id));
    const requestedIds = new Set<string>();
    for (const id of ids) {
      if (typeof id !== "string" || requestedIds.has(id) || !authoritativeIds.has(id)) {
        collector.add("rank_scope");
        return [];
      }
      requestedIds.add(id);
    }
    return authoritativeCandidates.filter((candidate) => requestedIds.has(candidate.id));
  } catch {
    collector.add("rank_scope");
    return [];
  }
}

function validateRankOrder(
  collector: IssueCollector,
  rankOrder: unknown,
  candidates: readonly PlaceCandidate[],
): Map<string, number> | null {
  if (!isDenseArray(rankOrder)) {
    collector.add("rank_order");
    return null;
  }
  try {
    const candidateIds = candidates.map((place) => place.id);
    const expected = new Set(candidateIds);
    const seen = new Set<string>();
    let valid = rankOrder.length === candidateIds.length;
    for (const id of rankOrder) {
      if (typeof id !== "string" || !expected.has(id) || seen.has(id)) valid = false;
      if (typeof id === "string") seen.add(id);
    }
    if (seen.size !== expected.size) valid = false;
    if (!valid) {
      collector.add("rank_order");
      return null;
    }
    return new Map(rankOrder.map((id, index) => [id as string, index]));
  } catch {
    collector.add("rank_order");
    return null;
  }
}

function validateResultShape(
  value: unknown,
  collector: IssueCollector,
): Record<string, unknown> | null {
  let parsedSuccessfully = false;
  try {
    parsedSuccessfully = itineraryResultSchema.safeParse(value).success;
  } catch {
    collector.add(RESULT_MALFORMED);
    return null;
  }
  if (!resultShapeIsUsable(value)) {
    collector.add(RESULT_MALFORMED);
    return null;
  }
  // The schema caps the item list at eight. Keep inspecting a structurally
  // usable result so the authoritative global-cap issue remains observable.
  if (!parsedSuccessfully) collector.add(RESULT_MALFORMED);
  return value;
}

function validateInner(
  input: EngineInput,
  resultValue: unknown,
  rankOrder: unknown,
  collector: IssueCollector,
  scope: unknown,
): void {
  const result = validateResultShape(resultValue, collector);
  if (result === null) return;

  const startResult = normalizeToHcmMinute(input.request.startAt);
  const budgetResult = normalizeBudgetToVnd(input.request, input.fx, input.asOfUtc);
  if (!startResult.ok) collector.add("request.start");
  if (!budgetResult.ok) {
    collector.add("budget.normalized");
  }
  const normalizedStart = startResult.ok ? startResult.value : null;
  const expectedStartAt = normalizedStart === null ? null : formatHcmMinute(normalizedStart);
  if (expectedStartAt !== null && result.normalizedStartAt !== expectedStartAt) {
    collector.add("request.start");
  }

  const expectedBudget = budgetResult.ok ? budgetResult.value.budgetVnd : null;
  if (expectedBudget !== null) {
    addExactNumberIssue(collector, "budget.normalized", result.budgetVnd, expectedBudget);
  }

  const candidateResult = expectedBudget === null
    ? null
    : filterCandidates(input, expectedBudget);
  const authoritativeCandidates = candidateResult?.ok === true ? candidateResult.value : [];
  const filteredCandidates = scopedCandidates(collector, scope, authoritativeCandidates);
  const candidatesById = new Map(input.catalog.places.map((place) => [place.id, place]));
  const filteredById = new Map(filteredCandidates.map((place) => [place.id, place]));
  const rankIndexes = validateRankOrder(collector, rankOrder, filteredCandidates);
  const rankedCandidateCount = filteredCandidates.length;

  const expectedFxId = budgetResult.ok ? budgetResult.value.fxSnapshotId : null;
  if (!isObject(result.snapshotIds)) {
    collector.add(RESULT_MALFORMED);
  } else {
    if (result.snapshotIds.catalog !== input.catalog.id) collector.add("snapshot.catalog");
    if (result.snapshotIds.travel !== input.travel.id) collector.add("snapshot.travel");
    if (result.snapshotIds.fx !== expectedFxId) collector.add("snapshot.fx");
  }

  const items = result.items;
  if (!Array.isArray(items)) {
    collector.add(RESULT_MALFORMED);
    return;
  }
  if (items.length > 8) collector.add("global_cap");
  const paceCap = input.request.pace === "relaxed" ? 3 : input.request.pace === "balanced" ? 5 : 8;
  if (items.length > paceCap) collector.add("pace");

  const travelIndexResult = indexTravelSnapshot(input.travel);
  const travelIndex = travelIndexResult.ok ? travelIndexResult.value : null;
  if (!travelIndexResult.ok) collector.add("travel.snapshot");

  const lockedIds = input.request.lockedStopIds;
  const positions = new Map<string, number>();
  let totalVisit = 0;
  let totalTravel = 0;
  let totalBuffer = 0;
  const transitionCosts: number[] = [];
  const costItems: Array<Pick<ItineraryItem, "placeCostVnd" | "foodSelection">> = [];
  let totalScore = 0;
  let previousEnd: number | null = null;
  let previousTrustedPlaceId: string | null = null;
  let finalEnd = normalizedStart;
  const requestEnd = normalizedStart === null ? null : normalizedStart + input.request.durationMinutes;

  for (let index = 0; index < items.length; index += 1) {
    const itemValue = items[index];
    const location = issueLocation(index);
    if (!isObject(itemValue)) {
      collector.add(RESULT_MALFORMED, location);
      previousTrustedPlaceId = null;
      continue;
    }
    const placeId = itemValue.placeId;
    const place = typeof placeId === "string" ? candidatesById.get(placeId) : undefined;
    const filteredPlace = typeof placeId === "string" ? filteredById.get(placeId) : undefined;
    const trustedLocation = issueLocation(index, place);
    const isUniqueTrustedPlace = place !== undefined && filteredPlace !== undefined && !positions.has(place.id);
    let trustedDuration: number | null = null;
    let expectedItemScore: number | null = null;
    let expectedPlaceCost: number | null = null;
    let validatedFood: ValidatedFood = { selection: null, vendor: null, cost: null };
    if (typeof placeId !== "string" || !place) {
      collector.add("candidate.membership", location);
    } else {
      if (!filteredPlace) collector.add("candidate.membership", issueLocation(index, place));
      if (positions.has(placeId)) collector.add("items.duplicate", trustedLocation);
      else positions.set(placeId, index);

      if (!input.request.areas.includes(place.areaId)) collector.add("candidate.area", trustedLocation);
      if (!selectedType(place, input, lockedIds.includes(place.id))) collector.add("candidate.type", trustedLocation);
      if (!place.guideLanguages.includes(input.request.guideLanguage)) collector.add("candidate.language", trustedLocation);
      if (!supports(place.dietarySupport, input.request.dietaryRequirements)) collector.add("candidate.dietary_support", trustedLocation);
      if (!supports(place.mobilitySupport, input.request.mobilityRequirements)) collector.add("candidate.mobility_support", trustedLocation);
      if (!optionalSellabilityPasses(place)) collector.add("candidate.sellability", trustedLocation);

      const expectedPlaceCostResult = multiplyVnd(place.priceVndPerPerson, input.request.partySize);
      if (!expectedPlaceCostResult.ok) collector.add("item.place_cost", trustedLocation);
      else {
        addExactNumberIssue(collector, "item.place_cost", itemValue.placeCostVnd, expectedPlaceCostResult.value, trustedLocation);
        if (expectedBudget !== null && expectedPlaceCostResult.value > expectedBudget) collector.add("budget.exceeded", trustedLocation);
        expectedPlaceCost = expectedPlaceCostResult.value;
      }

      const rankedIndex = rankIndexes?.get(place.id);
      if (rankedIndex === undefined) collector.add("rank_order", trustedLocation);
      else {
        expectedItemScore = scoreFor(place, input, rankedIndex, rankedCandidateCount);
        addExactNumberIssue(collector, "item.score", itemValue.score, expectedItemScore, trustedLocation);
      }
      trustedDuration = place.visitDurationMinutes;
      validatedFood = validateFoodSelection(collector, place, input, itemValue, trustedLocation);
    }

    const start = getCanonicalMinute(itemValue.startAt);
    const end = getCanonicalMinute(itemValue.endAt);
    const duration = itemValue.visitDurationMinutes;
    if (start === null || end === null) {
      collector.add("item.time", trustedLocation);
      previousTrustedPlaceId = null;
      continue;
    }
    if (trustedDuration === null || end - start !== trustedDuration || duration !== trustedDuration) {
      collector.add("item.duration", trustedLocation);
    }
    if (normalizedStart !== null && start < normalizedStart) collector.add("request.start", trustedLocation);
    if (requestEnd !== null && end > requestEnd) collector.add("request.duration", trustedLocation);
    if (previousEnd !== null && start < previousEnd) collector.add("timeline.overlap", trustedLocation);
    if (place && trustedDuration !== null && requestEnd !== null && end <= requestEnd && start >= normalizedStart! && trustedDuration > 0) {
      const earliest = findEarliestVisitStart(place, start, requestEnd, trustedDuration);
      if (!earliest.ok || earliest.value !== start) collector.add("opening_hours", trustedLocation);
    }

    const travelMinutes = itemValue.travelMinutesBefore;
    const transitionBuffer = itemValue.transitionBufferMinutesBefore;
    const travelCost = itemValue.travelCostVndBefore;
    let authoritativeTravelCost = 0;
    if (index === 0) {
      if (travelMinutes !== 0) collector.add("travel.minutes", trustedLocation);
      if (transitionBuffer !== 0) collector.add("travel.buffer", trustedLocation);
      if (travelCost !== 0) collector.add("travel.cost", trustedLocation);
    } else {
      const currentPlaceId = typeof placeId === "string" ? placeId : "";
      const edge = travelIndex && previousTrustedPlaceId && currentPlaceId && isUniqueTrustedPlace
        ? getTransition(travelIndex, previousTrustedPlaceId, currentPlaceId)
        : null;
      if (!edge) {
        collector.add("travel.missing", trustedLocation);
      } else {
        if (travelMinutes !== edge.minutes) collector.add("travel.minutes", trustedLocation);
        if (transitionBuffer !== 10) collector.add("travel.buffer", trustedLocation);
        if (travelCost !== edge.groupCostVnd) collector.add("travel.cost", trustedLocation);
        if (previousEnd !== null && start < previousEnd + edge.minutes + 10) collector.add("travel.transition", trustedLocation);
        totalTravel += edge.minutes;
        totalBuffer += 10;
        transitionCosts.push(edge.groupCostVnd);
        authoritativeTravelCost = edge.groupCostVnd;
      }
    }

    if (place && validatedFood.vendor !== null && start !== null && end !== null && requestEnd !== null && end <= requestEnd) {
      const foodOpening = findEarliestFoodVisitStart(
        place,
        validatedFood.vendor,
        start,
        requestEnd,
        end - start,
      );
      if (!foodOpening.ok || foodOpening.value !== start) {
        collector.add("food.vendor.opening_hours", trustedLocation);
      }
    }

    const foodCost = validatedFood.cost;
    const expectedFoodMin = foodCost?.minVnd ?? 0;
    const expectedFoodMax = foodCost?.maxVnd ?? 0;
    const expectedPayMin = foodCost?.payAtVendorMinVnd ?? 0;
    const expectedPayMax = foodCost?.payAtVendorMaxVnd ?? 0;
    addExactNumberIssue(collector, "item.food_cost", itemValue.foodCostMinVnd, expectedFoodMin, trustedLocation);
    addExactNumberIssue(collector, "item.food_cost", itemValue.foodCostMaxVnd, expectedFoodMax, trustedLocation);
    addExactNumberIssue(collector, "item.pay_at_vendor", itemValue.payAtVendorMinVnd, expectedPayMin, trustedLocation);
    addExactNumberIssue(collector, "item.pay_at_vendor", itemValue.payAtVendorMaxVnd, expectedPayMax, trustedLocation);
    if (expectedPlaceCost !== null) {
      const expectedCustomer = sumVnd([expectedPlaceCost, authoritativeTravelCost, foodCost?.customerPayableVnd ?? 0]);
      if (!expectedCustomer.ok) collector.add("item.customer_payable", trustedLocation);
      else addExactNumberIssue(collector, "item.customer_payable", itemValue.customerPayableVnd, expectedCustomer.value, trustedLocation);
      if (isUniqueTrustedPlace) {
        costItems.push({
          placeCostVnd: expectedPlaceCost,
          foodSelection: validatedFood.cost === null ? null : validatedFood.selection,
        });
      }
    }

    if (isUniqueTrustedPlace && trustedDuration !== null) totalVisit += trustedDuration;
    if (expectedItemScore !== null && isUniqueTrustedPlace) totalScore += expectedItemScore;
    previousTrustedPlaceId = isUniqueTrustedPlace ? place!.id : null;
    previousEnd = end;
    finalEnd = end;
  }

  for (const [index, lockedId] of lockedIds.entries()) {
    const position = positions.get(lockedId);
    if (position === undefined) collector.add("lock.missing", { itemIndex: index });
    else if (index > 0) {
      const previousPosition = positions.get(lockedIds[index - 1]);
      if (previousPosition !== undefined && position <= previousPosition) collector.add("lock.order", { itemIndex: position, placeId: lockedId });
    }
  }

  const totals = isObject(result.totals) ? result.totals : {};
  if (normalizedStart !== null && finalEnd !== null) {
    addExactNumberIssue(collector, "totals.duration", totals.durationMinutes, finalEnd - normalizedStart);
  }
  addExactNumberIssue(collector, "totals.visit", totals.visitMinutes, totalVisit);
  addExactNumberIssue(collector, "totals.travel", totals.travelMinutes, totalTravel);
  addExactNumberIssue(collector, "totals.buffer", totals.transitionBufferMinutes, totalBuffer);
  const totalTravelCostResult = sumVnd(transitionCosts);
  const totalCostResult = totalTravelCostResult.ok
    ? calculateItineraryCostBreakdown(costItems, totalTravelCostResult.value, 0)
    : null;
  if (totalCostResult === null || !totalCostResult.ok) {
    collector.add("totals.group_cost");
  } else {
    const expectedTotals = totalCostResult.value;
    addExactNumberIssue(collector, "totals.admission_cost", totals.admissionCostVnd, expectedTotals.admissionCostVnd);
    addExactNumberIssue(collector, "totals.food_cost", totals.foodCostMinVnd, expectedTotals.foodCostMinVnd);
    addExactNumberIssue(collector, "totals.food_cost", totals.foodCostMaxVnd, expectedTotals.foodCostMaxVnd);
    addExactNumberIssue(collector, "totals.travel_cost", totals.travelCostVnd, expectedTotals.travelCostVnd);
    addExactNumberIssue(collector, "totals.guide_cost", totals.guideCostVnd, expectedTotals.guideCostVnd);
    addExactNumberIssue(collector, "totals.pay_at_vendor", totals.payAtVendorMinVnd, expectedTotals.payAtVendorMinVnd);
    addExactNumberIssue(collector, "totals.pay_at_vendor", totals.payAtVendorMaxVnd, expectedTotals.payAtVendorMaxVnd);
    addExactNumberIssue(collector, "totals.customer_payable", totals.customerPayableVnd, expectedTotals.customerPayableVnd);
    addExactNumberIssue(collector, "totals.group_cost", totals.groupCostMinVnd, expectedTotals.groupCostMinVnd);
    addExactNumberIssue(collector, "totals.group_cost", totals.groupCostMaxVnd, expectedTotals.groupCostMaxVnd);
    addExactNumberIssue(collector, "totals.group_cost", totals.groupCostVnd, expectedTotals.groupCostVnd);
    if (expectedBudget !== null && expectedTotals.groupCostMaxVnd > expectedBudget) collector.add("budget.exceeded");
  }
  addExactNumberIssue(collector, "totals.score", totals.score, totalScore);
  if (expectedBudget !== null && isSafeNonNegativeInteger(totals.groupCostVnd) && totals.groupCostVnd > expectedBudget) collector.add("budget.exceeded");
}

export function validateItinerary(
  input: EngineInput,
  result: unknown,
  rankOrder: readonly string[],
  scope?: ValidationScope,
): { valid: true } | { valid: false; issues: ValidationIssue[] } {
  const collector = new IssueCollector();
  try {
    validateInner(input, result, rankOrder, collector, scope);
  } catch {
    collector.add(RESULT_MALFORMED);
  }
  const issues = collector.issues;
  return issues.length === 0 ? { valid: true } : { valid: false, issues };
}
