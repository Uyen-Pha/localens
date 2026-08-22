import {
  engineInputSchema,
  type EngineInput,
  type ItineraryItem,
  type ItineraryResult,
  type Pace,
  type PlaceCandidate,
  type Result,
} from "@/lib/domain/itinerary/contracts";
import { domainError } from "@/lib/domain/itinerary/errors";
import {
  formatHcmMinute,
  normalizeToHcmMinute,
} from "@/lib/domain/itinerary/local-time";
import { findEarliestVisitStart } from "@/lib/domain/itinerary/opening-hours";
import { multiplyVnd, sumVnd } from "@/lib/domain/itinerary/money";
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
}

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
  const visitStart = findEarliestVisitStart(
    candidate,
    earliestStart,
    context.latestEndEpochMinute,
    candidate.visitDurationMinutes,
  );
  if (!visitStart.ok || visitStart.value === null) return null;
  const endEpochMinute = visitStart.value + candidate.visitDurationMinutes;
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
    path.groupCostVnd,
    placeCost,
    travelCostVndBefore,
  ]);
  if (!groupCostResult.ok || groupCostResult.value > context.budgetVnd) return null;

  return {
    ids: [...path.ids, candidate.id],
    stops: [
      ...path.stops,
      {
        place: candidate,
        startEpochMinute: visitStart.value,
        endEpochMinute,
        travelMinutesBefore,
        transitionBufferMinutesBefore,
        travelCostVndBefore,
        placeCostVnd: placeCost,
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
): ItineraryResult {
  const items: ItineraryItem[] = path.stops.map((stop) => ({
    placeId: stop.place.id,
    startAt: formatHcmMinute(stop.startEpochMinute),
    endAt: formatHcmMinute(stop.endEpochMinute),
    visitDurationMinutes: stop.place.visitDurationMinutes,
    travelMinutesBefore: stop.travelMinutesBefore,
    transitionBufferMinutesBefore: stop.transitionBufferMinutesBefore,
    travelCostVndBefore: stop.travelCostVndBefore,
    placeCostVnd: stop.placeCostVnd,
    score: stop.score,
  }));

  return {
    normalizedStartAt: formatHcmMinute(context.startEpochMinute),
    budgetVnd: context.budgetVnd,
    rankingSource,
    items,
    totals: {
      durationMinutes: path.finishEpochMinute - context.startEpochMinute,
      visitMinutes: path.visitMinutes,
      travelMinutes: path.travelMinutes,
      transitionBufferMinutes: path.transitionBufferMinutes,
      groupCostVnd: path.groupCostVnd,
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
  };
}

function createContext(
  input: EngineInput,
  filtered: readonly PlaceCandidate[],
  rankOrder: readonly string[],
  budgetVnd: number,
): Result<SchedulerContext> {
  if (!engineInputSchema.safeParse(input).success) return invalidScheduler();
  if (!Array.isArray(filtered) || filtered.length === 0) return noFeasible();
  if (!Number.isSafeInteger(budgetVnd) || budgetVnd < 0) return invalidScheduler("budgetVnd");

  const candidates = sortCandidates(filtered);
  const candidateById = new Map<string, PlaceCandidate>();
  const placeCosts = new Map<string, number>();
  for (const candidate of candidates) {
    if (candidateById.has(candidate.id)) return invalidScheduler("filtered");
    // A scheduler call is a trusted internal boundary, but malformed values
    // must still become a stable Result rather than escaping as a throw.
    if (!candidate || typeof candidate.id !== "string") return invalidScheduler("filtered");
    candidateById.set(candidate.id, candidate);
    const cost = multiplyVnd(candidate.priceVndPerPerson, input.request.partySize);
    if (!cost.ok) return invalidScheduler("filtered");
    placeCosts.set(candidate.id, cost.value);
  }

  const orderResult = buildRankOrder(candidates.map((candidate) => candidate.id), rankOrder);
  if (!orderResult.ok || orderResult.value.length !== candidates.length) {
    return invalidScheduler("rankOrder");
  }
  if (orderResult.value.some((id, index) => id !== rankOrder[index])) {
    return invalidScheduler("rankOrder");
  }
  const rankIndexes = new Map(orderResult.value.map((id, index) => [id, index]));

  const start = normalizeToHcmMinute(input.request.startAt);
  if (!start.ok) return invalidScheduler("request.start");
  const latestEndEpochMinute = start.value + input.request.durationMinutes;
  if (!Number.isSafeInteger(latestEndEpochMinute)) return invalidScheduler("request.duration");

  const travel = indexTravelSnapshot(input.travel);
  if (!travel.ok) return invalidScheduler("travel");

  const lockedIndexes = new Map<string, number>();
  for (const [index, id] of input.request.lockedStopIds.entries()) {
    lockedIndexes.set(id, index);
    if (!candidateById.has(id)) return noFeasible();
  }

  return {
    ok: true,
    value: {
      input,
      candidates,
      candidateById,
      placeCosts,
      rankIndexes,
      travelIndex: travel.value,
      startEpochMinute: start.value,
      latestEndEpochMinute,
      paceCap: Math.min(paceCap(input.request.pace), GLOBAL_STOP_CAP),
      lockedIds: input.request.lockedStopIds,
      lockedIndexes,
      budgetVnd,
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
): Result<ItineraryResult> {
  try {
    if (rankingSource !== "ai" && rankingSource !== "deterministic") {
      return invalidScheduler("rankingSource");
    }
    const contextResult = createContext(input, filtered, rankOrder, budgetVnd);
    if (!contextResult.ok) return contextResult;
    const context = contextResult.value;

    const beamBest = runBeam(context);
    if (beamBest !== null) {
      return { ok: true, value: buildResult(beamBest, context, rankingSource) };
    }

    // With no locks, no valid first stop means no valid multi-stop route: a
    // later stop can never be reached without a valid first stop. Enumerating
    // singles explicitly keeps this fallback deterministic and auditable.
    if (context.lockedIds.length === 0) {
      const singleBest = findBestSingleStop(context);
      if (singleBest !== null) {
        return { ok: true, value: buildResult(singleBest, context, rankingSource) };
      }
      return noFeasible();
    }

    const fallback = runDfs(context);
    if (fallback.hitLimit) return searchLimit();
    if (fallback.best !== null) {
      return { ok: true, value: buildResult(fallback.best, context, rankingSource) };
    }
    return noFeasible();
  } catch {
    return invalidScheduler();
  }
}
