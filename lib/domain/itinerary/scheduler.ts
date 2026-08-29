import {
  engineInputSchema,
  placeCandidateSchema,
  type EngineInput,
  type ItineraryItem,
  type ItineraryResult,
  type Pace,
  type PlaceCandidate,
  type Result,
  type FoodSelectionInput,
} from "@/lib/domain/itinerary/contracts";
import {
  foodMenuItemSchema,
  foodSelectionSchema,
  type FoodSelection,
  type FoodVendorCandidate,
} from "@/lib/domain/food/contracts";
import { domainError } from "@/lib/domain/itinerary/errors";
import {
  formatHcmMinute,
  normalizeToHcmMinute,
} from "@/lib/domain/itinerary/local-time";
import { findEarliestVisitStart } from "@/lib/domain/itinerary/opening-hours";
import { multiplyVnd, sumVnd } from "@/lib/domain/itinerary/money";
import {
  calculateFoodSelectionCost,
  calculateItineraryCostBreakdown,
} from "@/lib/domain/itinerary/food-cost";
import {
  chooseFoodSelection,
  findEarliestFoodVisitStart,
} from "@/lib/domain/itinerary/food-filter";
import { indexTravelSnapshot, getTransition, type TravelIndex } from "@/lib/domain/itinerary/travel";
import {
  buildRankOrder,
  comparePaths,
  scoreCandidate,
  type ComparablePath,
} from "@/lib/domain/itinerary/scoring";

const BEAM_WIDTH = 50;
const GLOBAL_STOP_CAP = 8;
const DFS_STATE_CAP = 20_000;

interface ScheduledStop {
  place: PlaceCandidate;
  startEpochMinute: number;
  endEpochMinute: number;
  travelMinutesBefore: number;
  transitionBufferMinutesBefore: 0 | 10;
  travelCostVndBefore: number;
  placeCostVnd: number;
  foodSelection: FoodSelection | null;
  foodCostMinVnd: number;
  foodCostMaxVnd: number;
  payAtVendorMinVnd: number;
  payAtVendorMaxVnd: number;
  customerPayableVnd: number;
  score: number;
}

interface PathState extends ComparablePath {
  ids: string[];
  stops: ScheduledStop[];
  finishEpochMinute: number;
  score: number;
  groupCostVnd: number;
  visitMinutes: number;
  travelMinutes: number;
  transitionBufferMinutes: number;
}

interface SchedulerContext {
  input: EngineInput;
  candidates: PlaceCandidate[];
  candidateById: Map<string, PlaceCandidate>;
  placeCosts: Map<string, number>;
  rankIndexes: Map<string, number>;
  travelIndex: TravelIndex;
  startEpochMinute: number;
  latestEndEpochMinute: number;
  paceCap: number;
  lockedIds: readonly string[];
  lockedIndexes: Map<string, number>;
  budgetVnd: number;
  foodSelections: Map<string, FoodSelection>;
}

export type { FoodSelectionInput };

const invalidScheduler = <T>(issue = "scheduler"): Result<T> => ({
  ok: false,
  error: domainError(
    "INVALID_ITINERARY_INPUT",
    "itinerary.scheduler.invalid",
    [issue],
  ),
});

const noFeasible = <T>(): Result<T> => ({
  ok: false,
  error: domainError(
    "NO_FEASIBLE_ITINERARY",
    "itinerary.no_feasible",
  ),
});

const searchLimit = <T>(): Result<T> => ({
  ok: false,
  error: domainError(
    "ITINERARY_SEARCH_LIMIT",
    "itinerary.search_limit",
  ),
});

function paceCap(pace: Pace): number {
  if (pace === "relaxed") return 3;
  if (pace === "balanced") return 5;
  return 8;
}

function sortCandidates(candidates: readonly PlaceCandidate[]): PlaceCandidate[] {
  return [...candidates].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
}

function isDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  return true;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function pathIsValid(path: PathState, context: SchedulerContext): boolean {
  if (context.lockedIds.length === 0) return path.ids.length > 0;
  return context.lockedIds.every((id) => path.ids.includes(id));
}

function nextLockedIndex(path: PathState, context: SchedulerContext): number {
  let count = 0;
  for (const id of path.ids) {
    if (context.lockedIndexes.has(id)) count += 1;
  }
  return count;
}

function canAppend(path: PathState, candidate: PlaceCandidate, context: SchedulerContext): boolean {
  if (path.ids.includes(candidate.id)) return false;
  const lockIndex = context.lockedIndexes.get(candidate.id);
  if (lockIndex === undefined) return true;
  return lockIndex === nextLockedIndex(path, context);
}

function rootPath(startEpochMinute: number): PathState {
  return {
    ids: [],
    stops: [],
    score: 0,
    groupCostVnd: 0,
    finishEpochMinute: startEpochMinute,
    visitMinutes: 0,
    travelMinutes: 0,
    transitionBufferMinutes: 0,
  };
}

function isFoodPriorityPlace(place: PlaceCandidate, input: EngineInput): boolean {
  return (
    input.request.priorityWeights.street_food > 0 &&
    place.types.some((type) => type === "street_food" || type === "traditional_market")
  );
}

function normalizeFoodSelections(
  input: EngineInput,
  foodSelections: FoodSelectionInput | undefined,
  catalogById: ReadonlyMap<string, PlaceCandidate>,
): Result<Map<string, FoodSelection>> {
  const normalized = new Map<string, FoodSelection>();
  if (foodSelections === undefined) return { ok: true, value: normalized };

  let prototype: object | null;
  let ownKeys: readonly (string | symbol)[];
  try {
    if (typeof foodSelections !== "object" || foodSelections === null || Array.isArray(foodSelections)) {
      return invalidScheduler("foodSelections");
    }
    prototype = Object.getPrototypeOf(foodSelections);
    ownKeys = Reflect.ownKeys(foodSelections);
  } catch {
    return invalidScheduler("foodSelections");
  }
  if (prototype !== Object.prototype && prototype !== null) return invalidScheduler("foodSelections");

  for (const key of ownKeys) {
    if (typeof key !== "string") return invalidScheduler("foodSelections");
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(foodSelections, key);
    } catch {
      return invalidScheduler("foodSelections");
    }
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) return invalidScheduler("foodSelections");

    const place = catalogById.get(key);
    if (place === undefined || !isFoodPriorityPlace(place, input)) {
      return invalidScheduler("foodSelections");
    }
    const parsed = foodSelectionSchema.safeParse(descriptor.value);
    if (!parsed.success) return invalidScheduler("foodSelections");
    normalized.set(key, parsed.data);
  }
  return { ok: true, value: normalized };
}

function supports(
  value: Record<string, unknown>,
  requirements: readonly string[],
): boolean {
  return requirements.every((requirement) => value[requirement] === "supported");
}

interface VerifiedFoodSelection {
  vendor: FoodVendorCandidate;
  selection: FoodSelection;
  minVnd: number;
  maxVnd: number;
  payAtVendorMinVnd: number;
  payAtVendorMaxVnd: number;
  customerPayableVnd: number;
}

function verifyFoodSelection(
  place: PlaceCandidate,
  selection: FoodSelection,
  input: EngineInput,
): VerifiedFoodSelection | null {
  if (!foodSelectionSchema.safeParse(selection).success) return null;
  const vendor = place.foodVendors.find((candidate) => candidate.id === selection.vendorId);
  if (vendor === undefined || vendor.placeId !== place.id || vendor.status !== "sellable") return null;
  if (!supports(vendor.dietarySupport, input.request.dietaryRequirements)) return null;
  if (!supports(vendor.mobilitySupport, input.request.mobilityRequirements)) return null;
  const item = vendor.menuItems.find((candidate) => candidate.id === selection.menuItemId);
  if (item === undefined || item.vendorId !== vendor.id) return null;
  if (!foodMenuItemSchema.safeParse(item).success || item.available !== true || item.status !== "sellable") return null;
  if (!supports(item.dietarySupport, input.request.dietaryRequirements)) return null;
  if (selection.priceVndMin !== item.priceVndMin || selection.priceVndMax !== item.priceVndMax) return null;
  const expectedQuantity = item.servingUnit === "shared_set" ? 1 : input.request.partySize;
  if (selection.quantity !== expectedQuantity || selection.paymentMode !== "pay_at_vendor") return null;
  const cost = calculateFoodSelectionCost(selection, item, input.request.partySize);
  if (!cost.ok) return null;
  return {
    vendor,
    selection,
    minVnd: cost.value.minVnd,
    maxVnd: cost.value.maxVnd,
    payAtVendorMinVnd: cost.value.payAtVendorMinVnd,
    payAtVendorMaxVnd: cost.value.payAtVendorMaxVnd,
    customerPayableVnd: cost.value.customerPayableVnd,
  };
}

function chooseScheduledFood(
  place: PlaceCandidate,
  earliestEpochMinute: number,
  context: SchedulerContext,
  baseCostVnd: number,
): (VerifiedFoodSelection & { startEpochMinute: number }) | null {
  const supplied = context.foodSelections.get(place.id);
  if (supplied !== undefined) {
    const verified = verifyFoodSelection(place, supplied, context.input);
    if (verified === null) return null;
    const start = findEarliestFoodVisitStart(
      place,
      verified.vendor,
      earliestEpochMinute,
      context.latestEndEpochMinute,
      place.visitDurationMinutes,
    );
    if (!start.ok || start.value === null) return null;
    const total = sumVnd([baseCostVnd, verified.maxVnd]);
    if (!total.ok || total.value > context.budgetVnd) return null;
    return { ...verified, startEpochMinute: start.value };
  }

  const vendors = [...place.foodVendors].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  const remainingBudget = context.budgetVnd - baseCostVnd;
  if (!Number.isSafeInteger(remainingBudget) || remainingBudget < 0) return null;
  for (const vendor of vendors) {
    const selection = chooseFoodSelection(vendor, context.input.request, remainingBudget);
    if (!selection.ok) continue;
    const verified = verifyFoodSelection(place, selection.value, context.input);
    if (verified === null) continue;
    const start = findEarliestFoodVisitStart(
      place,
      verified.vendor,
      earliestEpochMinute,
      context.latestEndEpochMinute,
      place.visitDurationMinutes,
    );
    if (!start.ok || start.value === null) continue;
    const total = sumVnd([baseCostVnd, verified.maxVnd]);
    if (!total.ok || total.value > context.budgetVnd) continue;
    return { ...verified, startEpochMinute: start.value };
  }
  return null;
}

function appendStop(
  path: PathState,
  candidate: PlaceCandidate,
  context: SchedulerContext,
): PathState | null {
  if (!canAppend(path, candidate, context)) return null;
  if (path.ids.length >= context.paceCap || path.ids.length >= GLOBAL_STOP_CAP) return null;

  const placeCost = context.placeCosts.get(candidate.id);
  if (placeCost === undefined) return null;

  let travelMinutesBefore = 0;
  let transitionBufferMinutesBefore: 0 | 10 = 0;
  let travelCostVndBefore = 0;
  let earliestStart = context.startEpochMinute;

  if (path.stops.length > 0) {
    const previous = path.stops[path.stops.length - 1];
    const transition = getTransition(
      context.travelIndex,
      previous.place.id,
      candidate.id,
    );
    if (transition === null) return null;
    travelMinutesBefore = transition.minutes;
    transitionBufferMinutesBefore = 10;
    travelCostVndBefore = transition.groupCostVnd;
    earliestStart =
      previous.endEpochMinute + transition.minutes + transitionBufferMinutesBefore;
  }

  if (earliestStart > context.latestEndEpochMinute) return null;
  const baseCostResult = sumVnd([path.groupCostVnd, placeCost, travelCostVndBefore]);
  if (!baseCostResult.ok || baseCostResult.value > context.budgetVnd) return null;

  let visitStartEpochMinute: number;
  let food: (VerifiedFoodSelection & { startEpochMinute: number }) | null = null;
  if (isFoodPriorityPlace(candidate, context.input)) {
    food = chooseScheduledFood(candidate, earliestStart, context, baseCostResult.value);
    if (food === null) return null;
    visitStartEpochMinute = food.startEpochMinute;
  } else {
    const visitStart = findEarliestVisitStart(
      candidate,
      earliestStart,
      context.latestEndEpochMinute,
      candidate.visitDurationMinutes,
    );
    if (!visitStart.ok || visitStart.value === null) return null;
    visitStartEpochMinute = visitStart.value;
  }
  const endEpochMinute = visitStartEpochMinute + candidate.visitDurationMinutes;
  if (endEpochMinute > context.latestEndEpochMinute) return null;

  const rankedIndex = context.rankIndexes.get(candidate.id);
  if (rankedIndex === undefined) return null;
  const score = scoreCandidate(
    candidate,
    context.input.request.priorityWeights,
    rankedIndex,
    context.candidates.length,
  );
  const groupCostResult = sumVnd([
    baseCostResult.value,
    food?.maxVnd ?? 0,
  ]);
  if (!groupCostResult.ok || groupCostResult.value > context.budgetVnd) return null;
  const customerPayableResult = sumVnd([
    placeCost,
    travelCostVndBefore,
    food?.customerPayableVnd ?? 0,
  ]);
  if (!customerPayableResult.ok) return null;

  return {
    ids: [...path.ids, candidate.id],
    stops: [
      ...path.stops,
      {
        place: candidate,
        startEpochMinute: visitStartEpochMinute,
        endEpochMinute,
        travelMinutesBefore,
        transitionBufferMinutesBefore,
        travelCostVndBefore,
        placeCostVnd: placeCost,
        foodSelection: food?.selection ?? null,
        foodCostMinVnd: food?.minVnd ?? 0,
        foodCostMaxVnd: food?.maxVnd ?? 0,
        payAtVendorMinVnd: food?.payAtVendorMinVnd ?? 0,
        payAtVendorMaxVnd: food?.payAtVendorMaxVnd ?? 0,
        customerPayableVnd: customerPayableResult.value,
        score,
      },
    ],
    score: path.score + score,
    groupCostVnd: groupCostResult.value,
    finishEpochMinute: endEpochMinute,
    visitMinutes: path.visitMinutes + candidate.visitDurationMinutes,
    travelMinutes: path.travelMinutes + travelMinutesBefore,
    transitionBufferMinutes:
      path.transitionBufferMinutes + transitionBufferMinutesBefore,
  };
}

function buildResult(
  path: PathState,
  context: SchedulerContext,
  rankingSource: "ai" | "deterministic",
): Result<ItineraryResult> {
  const items: ItineraryItem[] = path.stops.map((stop) => ({
    placeId: stop.place.id,
    startAt: formatHcmMinute(stop.startEpochMinute),
    endAt: formatHcmMinute(stop.endEpochMinute),
    visitDurationMinutes: stop.place.visitDurationMinutes,
    travelMinutesBefore: stop.travelMinutesBefore,
    transitionBufferMinutesBefore: stop.transitionBufferMinutesBefore,
    travelCostVndBefore: stop.travelCostVndBefore,
    placeCostVnd: stop.placeCostVnd,
    foodSelection: stop.foodSelection,
    foodCostMinVnd: stop.foodCostMinVnd,
    foodCostMaxVnd: stop.foodCostMaxVnd,
    payAtVendorMinVnd: stop.payAtVendorMinVnd,
    payAtVendorMaxVnd: stop.payAtVendorMaxVnd,
    customerPayableVnd: stop.customerPayableVnd,
    score: stop.score,
  }));

  const travelCost = sumVnd(path.stops.map((stop) => stop.travelCostVndBefore));
  if (!travelCost.ok) return invalidScheduler("travelCost");
  const cost = calculateItineraryCostBreakdown(
    items,
    travelCost.value,
    0,
  );
  if (!cost.ok) return invalidScheduler("cost");

  return {
    ok: true,
    value: {
      normalizedStartAt: formatHcmMinute(context.startEpochMinute),
      budgetVnd: context.budgetVnd,
      rankingSource,
      items,
      totals: {
      durationMinutes: path.finishEpochMinute - context.startEpochMinute,
      visitMinutes: path.visitMinutes,
      travelMinutes: path.travelMinutes,
      transitionBufferMinutes: path.transitionBufferMinutes,
      admissionCostVnd: cost.value.admissionCostVnd,
      foodCostMinVnd: cost.value.foodCostMinVnd,
      foodCostMaxVnd: cost.value.foodCostMaxVnd,
      travelCostVnd: cost.value.travelCostVnd,
      guideCostVnd: cost.value.guideCostVnd,
      payAtVendorMinVnd: cost.value.payAtVendorMinVnd,
      payAtVendorMaxVnd: cost.value.payAtVendorMaxVnd,
      customerPayableVnd: cost.value.customerPayableVnd,
      groupCostMinVnd: cost.value.groupCostMinVnd,
      groupCostMaxVnd: cost.value.groupCostMaxVnd,
      groupCostVnd: cost.value.groupCostVnd,
      score: path.score,
      },
      snapshotIds: {
        catalog: context.input.catalog.id,
        travel: context.input.travel.id,
        fx:
          context.input.request.budget.currency === "USD"
            ? context.input.fx?.id ?? null
            : null,
      },
    },
  };
}

function createContext(
  input: EngineInput,
  filtered: readonly PlaceCandidate[],
  rankOrder: readonly string[],
  budgetVnd: number,
  foodSelections?: FoodSelectionInput,
): Result<SchedulerContext> {
  const parsedInput = engineInputSchema.safeParse(input);
  if (!parsedInput.success) return invalidScheduler();
  const canonicalInput = parsedInput.data;
  if (!Array.isArray(filtered)) return invalidScheduler("filtered");
  if (!isDenseArray(filtered)) return invalidScheduler("filtered");
  if (filtered.length === 0) return noFeasible();
  if (!Number.isSafeInteger(budgetVnd) || budgetVnd < 0) return invalidScheduler("budgetVnd");

  const catalogById = new Map(
    canonicalInput.catalog.places.map((place) => [place.id, place]),
  );
  const selectedCandidates: PlaceCandidate[] = [];
  const candidateById = new Map<string, PlaceCandidate>();
  const placeCosts = new Map<string, number>();
  for (const suppliedCandidate of filtered) {
    const parsedCandidate = placeCandidateSchema.safeParse(suppliedCandidate);
    if (!parsedCandidate.success) return invalidScheduler("filtered");
    const candidate = parsedCandidate.data;
    const canonicalCandidate = catalogById.get(candidate.id);
    if (
      canonicalCandidate === undefined ||
      stableSerialize(candidate) !== stableSerialize(canonicalCandidate)
    ) {
      return invalidScheduler("filtered");
    }
    if (candidateById.has(candidate.id)) return invalidScheduler("filtered");
    selectedCandidates.push(canonicalCandidate);
    candidateById.set(candidate.id, canonicalCandidate);
    const cost = multiplyVnd(canonicalCandidate.priceVndPerPerson, canonicalInput.request.partySize);
    if (!cost.ok) return invalidScheduler("filtered");
    placeCosts.set(candidate.id, cost.value);
  }

  const candidates = sortCandidates(selectedCandidates);
  const orderResult = buildRankOrder(candidates.map((candidate) => candidate.id), rankOrder);
  if (!orderResult.ok || orderResult.value.length !== candidates.length) {
    return invalidScheduler("rankOrder");
  }
  const normalizedRankOrder = isDenseArray(rankOrder)
    ? rankOrder.map((id) => (typeof id === "string" ? id.trim() : id))
    : [];
  if (orderResult.value.some((id, index) => id !== normalizedRankOrder[index])) {
    return invalidScheduler("rankOrder");
  }
  const rankIndexes = new Map(orderResult.value.map((id, index) => [id, index]));

  const start = normalizeToHcmMinute(canonicalInput.request.startAt);
  if (!start.ok) return invalidScheduler("request.start");
  const latestEndEpochMinute = start.value + canonicalInput.request.durationMinutes;
  if (!Number.isSafeInteger(latestEndEpochMinute)) return invalidScheduler("request.duration");

  const travel = indexTravelSnapshot(canonicalInput.travel);
  if (!travel.ok) return invalidScheduler("travel");

  const lockedIndexes = new Map<string, number>();
  for (const [index, id] of canonicalInput.request.lockedStopIds.entries()) {
    lockedIndexes.set(id, index);
    if (!candidateById.has(id)) return noFeasible();
  }

  const normalizedFoodSelections = normalizeFoodSelections(canonicalInput, foodSelections, catalogById);
  if (!normalizedFoodSelections.ok) return normalizedFoodSelections;

  return {
    ok: true,
    value: {
      input: canonicalInput,
      candidates,
      candidateById,
      placeCosts,
      rankIndexes,
      travelIndex: travel.value,
      startEpochMinute: start.value,
      latestEndEpochMinute,
      paceCap: Math.min(paceCap(canonicalInput.request.pace), GLOBAL_STOP_CAP),
      lockedIds: canonicalInput.request.lockedStopIds,
      lockedIndexes,
      budgetVnd,
      foodSelections: normalizedFoodSelections.value,
    },
  };
}

function bestPath(
  current: PathState | null,
  candidate: PathState,
): PathState {
  if (current === null || comparePaths(candidate, current) < 0) return candidate;
  return current;
}

function runBeam(context: SchedulerContext): PathState | null {
  const orderedCandidates = context.candidates;
  let beam: PathState[] = [rootPath(context.startEpochMinute)];
  let best: PathState | null = null;

  while (beam.length > 0) {
    const expanded: PathState[] = [];
    for (const path of beam) {
      for (const candidate of orderedCandidates) {
        const next = appendStop(path, candidate, context);
        if (next === null) continue;
        expanded.push(next);
        if (pathIsValid(next, context)) best = bestPath(best, next);
      }
    }
    if (expanded.length === 0) break;
    expanded.sort(comparePaths);
    beam = expanded.slice(0, BEAM_WIDTH);
  }
  return best;
}

interface DfsOutcome {
  best: PathState | null;
  hitLimit: boolean;
}

function runDfs(context: SchedulerContext): DfsOutcome {
  const orderedCandidates = context.candidates;
  let states = 0;
  let best: PathState | null = null;
  let hitLimit = false;

  const visit = (path: PathState): void => {
    if (hitLimit) return;
    states += 1;
    if (states >= DFS_STATE_CAP) {
      hitLimit = true;
      return;
    }
    if (pathIsValid(path, context)) best = bestPath(best, path);
    if (path.ids.length >= context.paceCap || path.ids.length >= GLOBAL_STOP_CAP) return;
    for (const candidate of orderedCandidates) {
      const next = appendStop(path, candidate, context);
      if (next !== null) visit(next);
      if (hitLimit) return;
    }
  };

  visit(rootPath(context.startEpochMinute));
  return { best, hitLimit };
}

function findBestSingleStop(context: SchedulerContext): PathState | null {
  let best: PathState | null = null;
  const root = rootPath(context.startEpochMinute);
  for (const candidate of context.candidates) {
    const single = appendStop(root, candidate, context);
    if (single !== null && pathIsValid(single, context)) {
      best = bestPath(best, single);
    }
  }
  return best;
}

export function scheduleItinerary(
  input: EngineInput,
  filtered: readonly PlaceCandidate[],
  rankOrder: readonly string[],
  budgetVnd: number,
  rankingSource: "ai" | "deterministic",
  foodSelections?: FoodSelectionInput,
): Result<ItineraryResult> {
  try {
    if (rankingSource !== "ai" && rankingSource !== "deterministic") {
      return invalidScheduler("rankingSource");
    }
    const contextResult = createContext(input, filtered, rankOrder, budgetVnd, foodSelections);
    if (!contextResult.ok) return contextResult;
    const context = contextResult.value;

    const beamBest = runBeam(context);
    if (beamBest !== null) {
      return buildResult(beamBest, context, rankingSource);
    }

    // With no locks, no valid first stop means no valid multi-stop route: a
    // later stop can never be reached without a valid first stop. Enumerating
    // singles explicitly keeps this fallback deterministic and auditable.
    if (context.lockedIds.length === 0) {
      const singleBest = findBestSingleStop(context);
      if (singleBest !== null) {
        return buildResult(singleBest, context, rankingSource);
      }
      return noFeasible();
    }

    const fallback = runDfs(context);
    if (fallback.hitLimit) return searchLimit();
    if (fallback.best !== null) {
      return buildResult(fallback.best, context, rankingSource);
    }
    return noFeasible();
  } catch {
    return invalidScheduler();
  }
}
