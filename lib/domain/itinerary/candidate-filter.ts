import {
  type EngineInput,
  type PlaceCandidate,
  type Result,
  type SupportStatus,
} from "@/lib/domain/itinerary/contracts";
import { domainError } from "@/lib/domain/itinerary/errors";
import { multiplyVnd } from "@/lib/domain/itinerary/money";

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

const lockedFailure = (placeId: string): Result<PlaceCandidate[]> => ({
  ok: false,
  error: domainError(
    "NO_FEASIBLE_ITINERARY",
    "itinerary.locked_stop.ineligible",
    [`lockedStopIds.${placeId}`],
  ),
});

function isSafeBudget(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string")
  );
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

function isUsableInput(input: unknown): input is EngineInput {
  if (typeof input !== "object" || input === null) return false;
  const candidate = input as Partial<EngineInput>;
  const request = candidate.request;
  const catalog = candidate.catalog;
  if (typeof request !== "object" || request === null) return false;
  if (typeof catalog !== "object" || catalog === null) return false;
  return (
    Array.isArray(catalog.places) &&
    isStringArray(request.areas) &&
    isStringArray(request.dietaryRequirements) &&
    isStringArray(request.mobilityRequirements) &&
    isStringArray(request.lockedStopIds) &&
    typeof request.priorityWeights === "object" &&
    request.priorityWeights !== null &&
    Number.isSafeInteger(request.partySize) &&
    request.partySize >= 1
  );
}

export function filterCandidates(
  input: EngineInput,
  budgetVnd: number,
): Result<PlaceCandidate[]> {
  if (!isUsableInput(input) || !isSafeBudget(budgetVnd)) return invalidFilter();

  const { request, catalog } = input;
  const areas = new Set(request.areas);
  const lockedIds = new Set(request.lockedStopIds);
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

  for (const lockedId of request.lockedStopIds) {
    if (!byId.has(lockedId)) return lockedFailure(lockedId);
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

    const eligible =
      activeAndSellable &&
      areaMatches &&
      languageMatches &&
      dietaryMatches &&
      mobilityMatches &&
      budgetMatches &&
      (hasSelectedType || locked);

    if (locked && !eligible) return lockedFailure(place.id);
    if (eligible) result.push(place);
  }

  result.sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  return { ok: true, value: result };
}
