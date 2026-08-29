import {
  itineraryRequestSchema,
  placeCandidateSchema,
  type EngineInput,
  type PlaceCandidate,
  type Result,
  type SupportStatus,
} from "@/lib/domain/itinerary/contracts";
import { domainError } from "@/lib/domain/itinerary/errors";
import { multiplyVnd } from "@/lib/domain/itinerary/money";
import {
  chooseFoodSelection,
  filterFoodVendors,
} from "@/lib/domain/itinerary/food-filter";
import {
  formatHcmMinute,
  normalizeToHcmMinute,
} from "@/lib/domain/itinerary/local-time";

type OptionalSellability = PlaceCandidate & {
  active?: unknown;
  sellable?: unknown;
};

const invalidFilter = <T>(): Result<T> => ({
  ok: false,
  error: domainError(
    "INVALID_ITINERARY_INPUT",
    "itinerary.candidate_filter.invalid",
  ),
});

const lockedFailure = (index: number): Result<PlaceCandidate[]> => ({
  ok: false,
  error: domainError(
    "NO_FEASIBLE_ITINERARY",
    "itinerary.locked_stop.ineligible",
    [`request.lockedStopIds.${index}`],
  ),
});

function isSafeBudget(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function supportSatisfies(
  support: unknown,
  requirements: readonly string[],
): boolean {
  if (typeof support !== "object" || support === null) return false;
  const values = support as Record<string, unknown>;
  return requirements.every((key) => values[key] === ("supported" as SupportStatus));
}

function isActiveAndSellable(place: OptionalSellability): boolean {
  if ("active" in place && place.active !== true) return false;
  if ("sellable" in place && place.sellable !== true) return false;
  return true;
}

function foodPriorityNeedsConcreteSelection(
  place: PlaceCandidate,
  input: EngineInput,
  remainingBudgetVnd: number,
): boolean {
  const isFoodPlace = place.types.some((type) =>
    type === "street_food" || type === "traditional_market",
  );
  if (!isFoodPlace || input.request.priorityWeights.street_food <= 0) {
    return true;
  }

  const start = normalizeToHcmMinute(input.request.startAt);
  if (!start.ok) return false;
  const end = start.value + place.visitDurationMinutes;
  if (!Number.isSafeInteger(end)) return false;
  const visitDate = formatHcmMinute(start.value).slice(0, 10);
  const preferredInterval = {
    startEpochMinute: start.value,
    endEpochMinute: end,
  };
  const validatedPlace = { ...place } as OptionalSellability;
  delete validatedPlace.active;
  delete validatedPlace.sellable;
  const vendors = filterFoodVendors(
    validatedPlace,
    input.request,
    visitDate,
    preferredInterval,
  );
  return vendors.some((vendor) =>
    chooseFoodSelection(vendor, input.request, remainingBudgetVnd).ok,
  );
}

function isUsableInput(input: unknown): input is EngineInput {
  try {
    if (typeof input !== "object" || input === null) return false;
    const candidate = input as Partial<EngineInput>;
    const request = candidate.request;
    const catalog = candidate.catalog;
    if (typeof request !== "object" || request === null) return false;
    if (typeof catalog !== "object" || catalog === null) return false;
    if (!itineraryRequestSchema.safeParse(request).success) return false;
    if (!Array.isArray(catalog.places)) return false;
    return catalog.places.every((place) => {
      if (typeof place !== "object" || place === null) return false;
      const catalogPlace = { ...place } as PlaceCandidate & OptionalSellability;
      delete catalogPlace.active;
      delete catalogPlace.sellable;
      return placeCandidateSchema.safeParse(catalogPlace).success;
    });
  } catch {
    return false;
  }
}

export function filterCandidates(
  input: EngineInput,
  budgetVnd: number,
): Result<PlaceCandidate[]> {
  if (!isUsableInput(input) || !isSafeBudget(budgetVnd)) return invalidFilter();

  const { request, catalog } = input;
  const areas = new Set(request.areas);
  const lockedIds = new Set(request.lockedStopIds);
  const lockedIndexes = new Map(
    request.lockedStopIds.map((lockedId, index) => [lockedId, index]),
  );
  const weights = request.priorityWeights;
  const places = catalog.places;
  const byId = new Map<string, PlaceCandidate>();

  for (const place of places) {
    if (
      typeof place !== "object" ||
      place === null ||
      typeof place.id !== "string" ||
      byId.has(place.id)
    ) {
      return invalidFilter();
    }
    byId.set(place.id, place);
  }

  for (const [index, lockedId] of request.lockedStopIds.entries()) {
    if (!byId.has(lockedId)) return lockedFailure(index);
  }

  const result: PlaceCandidate[] = [];
  for (const place of places) {
    const candidate = place as OptionalSellability;
    const locked = lockedIds.has(place.id);
    const hasSelectedType =
      Array.isArray(place.types) &&
      place.types.some((type) => weights[type] > 0);
    const areaMatches = areas.has(place.areaId);
    const languageMatches =
      Array.isArray(place.guideLanguages) &&
      place.guideLanguages.includes(request.guideLanguage);
    const dietaryMatches = supportSatisfies(
      place.dietarySupport,
      request.dietaryRequirements,
    );
    const mobilityMatches = supportSatisfies(
      place.mobilitySupport,
      request.mobilityRequirements,
    );
    const placeCost = multiplyVnd(place.priceVndPerPerson, request.partySize);
    if (!placeCost.ok) return invalidFilter();
    const budgetMatches = placeCost.value <= budgetVnd;
    const activeAndSellable = isActiveAndSellable(candidate);
    const foodMatches = foodPriorityNeedsConcreteSelection(
      place,
      input,
      budgetVnd - placeCost.value,
    );

    const eligible =
      activeAndSellable &&
      areaMatches &&
      languageMatches &&
      dietaryMatches &&
      mobilityMatches &&
      budgetMatches &&
      foodMatches &&
      (hasSelectedType || locked);

    if (locked && !eligible) {
      return lockedFailure(lockedIndexes.get(place.id) ?? 0);
    }
    if (eligible) result.push(place);
  }

  result.sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  return { ok: true, value: result };
}
