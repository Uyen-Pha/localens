import {
  parseEngineInput,
  type EngineInput,
  type ItineraryResult,
  type PlaceCandidate,
  type Result,
} from "@/lib/domain/itinerary/contracts";
import { foodSelectionSchema, type FoodSelection } from "@/lib/domain/food/contracts";
import { domainError } from "@/lib/domain/itinerary/errors";
import { filterCandidates } from "@/lib/domain/itinerary/candidate-filter";
import { normalizeBudgetToVnd } from "@/lib/domain/itinerary/money";
import { buildRankOrder } from "@/lib/domain/itinerary/scoring";
import { scheduleItinerary } from "@/lib/domain/itinerary/scheduler";
import {
  validateItinerary,
  type ValidationScope,
  type ValidationIssue,
} from "@/lib/domain/itinerary/validator";

const REMEDIABLE_ISSUE_KEYS: ReadonlySet<string> = new Set([
  "candidate.membership",
  "candidate.area",
  "candidate.type",
  "candidate.language",
  "candidate.dietary_support",
  "candidate.mobility_support",
  "candidate.sellability",
  "items.duplicate",
  "budget.exceeded",
  "item.place_cost",
  "item.score",
  "item.duration",
  "item.time",
  "opening_hours",
  "travel.missing",
  "travel.minutes",
  "travel.buffer",
  "travel.cost",
  "travel.transition",
]);

const invalidInput = <T>(issue = "repair"): Result<T> => ({
  ok: false,
  error: domainError("INVALID_ITINERARY_INPUT", "itinerary.repair.invalid", [issue]),
});

const invalidResult = <T>(issues?: readonly ValidationIssue[]): Result<T> => ({
  ok: false,
  error: domainError(
    "INVALID_ITINERARY_RESULT",
    "itinerary.result.invalid",
    issues
      ?.map((issue) => issue.key)
      .filter((key, index, keys) => keys.indexOf(key) === index),
  ),
});

function isDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  return true;
}

function isValidRankOrder(value: unknown): value is readonly string[] {
  if (!isDenseArray(value)) return false;
  const ids = value as readonly unknown[];
  return ids.every((id) => typeof id === "string" && id.trim().length > 0);
}

function issuePlaceIds(
  invalidResult: unknown,
  issues: unknown,
): string[] {
  if (!isDenseArray(issues)) return [];
  let resultItems: readonly unknown[];
  try {
    if (
      typeof invalidResult !== "object" ||
      invalidResult === null ||
      !isDenseArray((invalidResult as { items?: unknown }).items)
    ) return [];
    resultItems = (invalidResult as { items: readonly unknown[] }).items;
  } catch {
    return [];
  }

  const ids: string[] = [];
  for (const issue of issues) {
    if (typeof issue !== "object" || issue === null) continue;
    try {
      const key = (issue as { key?: unknown }).key;
      const itemIndex = (issue as { itemIndex?: unknown }).itemIndex;
      const placeId = (issue as { placeId?: unknown }).placeId;
      if (
        typeof key !== "string" ||
        !REMEDIABLE_ISSUE_KEYS.has(key) ||
        !Number.isSafeInteger(itemIndex) ||
        (itemIndex as number) < 0 ||
        (itemIndex as number) >= resultItems.length ||
        typeof placeId !== "string"
      ) continue;
      const item = resultItems[itemIndex as number];
      if (typeof item !== "object" || item === null) continue;
      const resultPlaceId = (item as { placeId?: unknown }).placeId;
      if (typeof resultPlaceId === "string" && resultPlaceId === placeId && !ids.includes(placeId)) {
        ids.push(placeId);
      }
    } catch {
      // A hostile issue or result item is simply not an exclusion candidate.
    }
  }
  return ids;
}

export function deriveRepairExclusions(
  invalidResult: unknown,
  issues: unknown,
  lockedStopIds: readonly string[],
  filteredCandidates: readonly PlaceCandidate[],
): Set<string> {
  const locked = new Set(lockedStopIds);
  const candidateIds = new Set(filteredCandidates.map((candidate) => candidate.id));
  return new Set(
    issuePlaceIds(invalidResult, issues).filter((id) => candidateIds.has(id) && !locked.has(id)),
  );
}

export function deriveRemainingRankOrder(
  rankOrder: readonly string[],
  excludedUnlockedIds: ReadonlySet<string>,
): string[] {
  return rankOrder.filter((id) => !excludedUnlockedIds.has(id));
}

function canonicalRankOrder(
  filtered: readonly PlaceCandidate[],
  supplied: readonly string[],
): Result<string[]> {
  const result = buildRankOrder(filtered.map((candidate) => candidate.id), supplied);
  if (!result.ok || result.value.length !== filtered.length) return invalidInput("rankOrder");
  if (result.value.some((id, index) => id !== supplied[index]?.trim())) return invalidInput("rankOrder");
  return result;
}

function rankingSourceOf(value: unknown): "ai" | "deterministic" {
  try {
    if (typeof value === "object" && value !== null &&
      (value as { rankingSource?: unknown }).rankingSource === "ai") return "ai";
  } catch {
    // Malformed prior results do not change the safe deterministic fallback.
  }
  return "deterministic";
}

function isFoodPriorityPlace(place: PlaceCandidate, input: EngineInput): boolean {
  return input.request.priorityWeights.street_food > 0 &&
    place.types.some((type) => type === "street_food" || type === "traditional_market");
}

function lockedFoodSelections(
  source: EngineInput,
  priorResult: unknown,
): Result<Record<string, FoodSelection>> {
  const selections = Object.create(null) as Record<string, FoodSelection>;
  if (typeof priorResult !== "object" || priorResult === null) {
    return { ok: false, error: domainError("NO_FEASIBLE_ITINERARY", "itinerary.no_feasible") };
  }
  const rawItems = (priorResult as { items?: unknown }).items;
  if (!Array.isArray(rawItems)) return { ok: false, error: domainError("NO_FEASIBLE_ITINERARY", "itinerary.no_feasible") };
  for (const lockedId of source.request.lockedStopIds) {
    const place = source.catalog.places.find((candidate) => candidate.id === lockedId);
    if (place === undefined || !isFoodPriorityPlace(place, source)) continue;
    const rawItem = rawItems.find((item) =>
      typeof item === "object" && item !== null && (item as { placeId?: unknown }).placeId === lockedId,
    );
    const rawSelection = rawItem && typeof rawItem === "object"
      ? (rawItem as { foodSelection?: unknown }).foodSelection
      : undefined;
    const parsed = foodSelectionSchema.safeParse(rawSelection);
    if (!parsed.success) {
      return {
        ok: false,
        error: domainError("NO_FEASIBLE_ITINERARY", "itinerary.no_feasible"),
      };
    }
    selections[lockedId] = parsed.data;
  }
  return { ok: true, value: selections };
}

export function repairItinerary(
  source: unknown,
  _invalidResult: unknown,
  issues: unknown,
  rankOrder: unknown,
): Result<ItineraryResult> {
  try {
    const parsed = parseEngineInput(source);
    if (!parsed.ok) return parsed;
    if (!isValidRankOrder(rankOrder)) return invalidInput("rankOrder");

    const budget = normalizeBudgetToVnd(
      parsed.value.request,
      parsed.value.fx,
      parsed.value.asOfUtc,
    );
    if (!budget.ok) return budget;
    const filtered = filterCandidates(parsed.value, budget.value.budgetVnd);
    if (!filtered.ok) return filtered;
    const lockedSelections = lockedFoodSelections(parsed.value, _invalidResult);
    if (!lockedSelections.ok) return lockedSelections;
    const originalOrder = canonicalRankOrder(filtered.value, rankOrder);
    if (!originalOrder.ok) return originalOrder;

    const excluded = deriveRepairExclusions(
      _invalidResult,
      issues,
      parsed.value.request.lockedStopIds,
      filtered.value,
    );
    const remainingCandidates = filtered.value.filter((candidate) => !excluded.has(candidate.id));
    const remainingRankOrder = deriveRemainingRankOrder(originalOrder.value, excluded);
    if (remainingCandidates.length === 0 || remainingRankOrder.length === 0) {
      return {
        ok: false,
        error: domainError("NO_FEASIBLE_ITINERARY", "itinerary.no_feasible"),
      };
    }

    const scheduled = scheduleItinerary(
      parsed.value,
      remainingCandidates,
      remainingRankOrder,
      budget.value.budgetVnd,
      rankingSourceOf(_invalidResult),
      lockedSelections.value,
    );
    if (!scheduled.ok) return scheduled;

    const scope: ValidationScope = {
      candidateIds: remainingCandidates.map((candidate) => candidate.id),
    };
    const validation = validateItinerary(parsed.value, scheduled.value, remainingRankOrder, scope);
    if (!validation.valid) return invalidResult(validation.issues);
    return scheduled;
  } catch {
    return invalidInput();
  }
}
