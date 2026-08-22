import {
  type ExperienceType,
  type PlaceCandidate,
  type PriorityWeights,
  type Result,
} from "@/lib/domain/itinerary/contracts";
import { domainError } from "@/lib/domain/itinerary/errors";

/**
 * The small, public shape used by the beam and by the comparator tests.  The
 * `placeIds`/`stopIds` aliases make the comparator useful at the domain
 * boundary while the scheduler uses the shorter `ids` field internally.
 */
export interface ComparablePath {
  score: number;
  groupCostVnd: number;
  finishEpochMinute: number;
  ids?: readonly string[];
  placeIds?: readonly string[];
  stopIds?: readonly string[];
  items?: readonly { placeId: string }[];
}

const invalidRanking = <T>(): Result<T> => ({
  ok: false,
  error: domainError(
    "INVALID_ITINERARY_INPUT",
    "itinerary.ranking.invalid",
    ["rankOrder"],
  ),
});

function validIdList(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.every((id) => typeof id === "string" && id.trim().length > 0)
  );
}

/**
 * Build one complete deterministic order from an optional ranker subset.
 * The supplied subset keeps its order; all omitted filtered IDs are appended
 * by plain lexicographic ID order.
 */
export function buildRankOrder(
  filteredIds: readonly string[],
  rankedSubset?: readonly string[],
): Result<string[]> {
  if (!validIdList(filteredIds)) return invalidRanking();

  const filteredSet = new Set(filteredIds);
  if (filteredSet.size !== filteredIds.length) return invalidRanking();

  const supplied = rankedSubset === undefined ? [] : rankedSubset;
  if (!validIdList(supplied)) return invalidRanking();

  const seen = new Set<string>();
  for (const id of supplied) {
    if (!filteredSet.has(id) || seen.has(id)) return invalidRanking();
    seen.add(id);
  }

  const omitted = filteredIds
    .filter((id) => !seen.has(id))
    .slice()
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return { ok: true, value: [...supplied, ...omitted] };
}

/** The deterministic candidate score; rank indexes are intentionally zero based. */
export function scoreCandidate(
  candidate: PlaceCandidate,
  weights: PriorityWeights,
  rankedIndex: number,
  candidateCount: number,
): number {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    !Array.isArray(candidate.types) ||
    typeof weights !== "object" ||
    weights === null
  ) {
    return 0;
  }
  let maxWeight = 0;
  try {
    for (const type of candidate.types as readonly ExperienceType[]) {
      const weight = weights[type];
      if (typeof weight === "number" && Number.isFinite(weight)) {
        maxWeight = Math.max(maxWeight, weight);
      }
    }
  } catch {
    return 0;
  }

  const value = maxWeight * 1000 + (candidateCount - rankedIndex);
  // Valid contracts keep this comfortably below MAX_SAFE_INTEGER.  Keep the
  // standalone helper total as well when called with adversarial values.
  if (!Number.isSafeInteger(value)) return Number.MAX_SAFE_INTEGER;
  return value;
}

function pathIds(path: ComparablePath): readonly string[] {
  return path.ids ?? path.placeIds ?? path.stopIds ?? path.items?.map((item) => item.placeId) ?? [];
}

function joinedIds(path: ComparablePath): string {
  return pathIds(path).join("\u0000");
}

/**
 * Negative means `a` is preferred.  The order is deliberately exactly the
 * product rule: score descending, group cost ascending, finish ascending,
 * then lexicographic joined stop IDs.
 */
export function comparePaths(a: ComparablePath, b: ComparablePath): number {
  if (a.score !== b.score) return a.score > b.score ? -1 : 1;
  if (a.groupCostVnd !== b.groupCostVnd) {
    return a.groupCostVnd < b.groupCostVnd ? -1 : 1;
  }
  if (a.finishEpochMinute !== b.finishEpochMinute) {
    return a.finishEpochMinute < b.finishEpochMinute ? -1 : 1;
  }

  const left = joinedIds(a);
  const right = joinedIds(b);
  return left < right ? -1 : left > right ? 1 : 0;
}
