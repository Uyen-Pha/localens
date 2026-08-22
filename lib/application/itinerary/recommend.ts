import {
  parseEngineInput,
  type EngineInput,
  type ItineraryResult,
  type Result,
} from "@/lib/domain/itinerary/contracts";
import { createItinerary } from "@/lib/domain/itinerary/engine";
import { filterCandidates } from "@/lib/domain/itinerary/candidate-filter";
import { normalizeBudgetToVnd } from "@/lib/domain/itinerary/money";
import {
  type RankRequest,
  type RankResponse,
  type Ranker,
  toPublicRankRequest,
  validateRankResponse,
} from "@/lib/application/itinerary/ranking-port";

export interface TimeoutSignalHandle {
  signal: AbortSignal;
  cancel: () => void;
}
/** Injectable for deterministic fake-timer tests and future runtimes. */
export type TimeoutSignalFactory = (timeoutMs: number) => TimeoutSignalHandle;

export interface RecommendOptions {
  ranker?: Ranker;
  signal?: AbortSignal;
  timeoutSignalFactory?: TimeoutSignalFactory;
}

export interface Recommendation {
  result: ItineraryResult;
  degraded: boolean;
  messageKey?:
    | "itinerary.ai_unavailable"
    | "itinerary.ai_invalid"
    | "itinerary.ai_aborted";
  rationales: Record<string, string>;
}

const AI_TIMEOUT_MS = 8_000;

function defaultTimeoutSignalFactory(timeoutMs: number): TimeoutSignalHandle {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
  };
}

function invalidInputResult<T>(input: unknown): Result<T> {
  return createItinerary(input) as Result<T>;
}

function fallback(
  result: ItineraryResult,
  messageKey: Recommendation["messageKey"],
): Result<Recommendation> {
  return {
    ok: true,
    value: {
      result,
      degraded: true,
      ...(messageKey ? { messageKey } : {}),
      rationales: {},
    },
  };
}

type RankOutcome =
  | { kind: "response"; value: unknown }
  | { kind: "aborted" }
  | { kind: "invalid" };

/**
 * Invoke a provider while making abort authoritative. A provider that ignores
 * the signal cannot keep the recommendation request alive past the timeout;
 * its eventual settlement is still observed to avoid an unhandled rejection.
 */
async function invokeRanker(
  ranker: Ranker,
  request: RankRequest,
  signal: AbortSignal,
): Promise<RankOutcome> {
  if (signal.aborted) return { kind: "aborted" };

  return new Promise<RankOutcome>((resolve) => {
    let settled = false;
    const settle = (outcome: RankOutcome) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      resolve(outcome);
    };
    const onAbort = () => settle({ kind: "aborted" });

    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }

    let providerPromise: Promise<RankResponse>;
    try {
      providerPromise = Promise.resolve(ranker(request, signal));
    } catch {
      settle({ kind: "invalid" });
      return;
    }

    providerPromise.then(
      (value) => settle(signal.aborted ? { kind: "aborted" } : { kind: "response", value }),
      () => settle(signal.aborted ? { kind: "aborted" } : { kind: "invalid" }),
    );
  });
}

function readOptions(options: RecommendOptions | undefined): {
  ranker?: unknown;
  signal?: AbortSignal;
  timeoutSignalFactory?: TimeoutSignalFactory;
} {
  if (options === undefined) return {};
  if (typeof options !== "object" || options === null) return { ranker: null };
  try {
    return {
      ranker: options.ranker,
      signal: options.signal,
      timeoutSignalFactory: options.timeoutSignalFactory,
    };
  } catch {
    return { ranker: null };
  }
}

function safeAbortState(signal: AbortSignal | undefined): boolean {
  try {
    return signal?.aborted === true;
  } catch {
    return true;
  }
}

function parseInput(input: unknown): Result<EngineInput> {
  try {
    return parseEngineInput(input);
  } catch {
    return invalidInputResult(input);
  }
}

export async function recommendItinerary(
  input: unknown,
  options?: RecommendOptions,
): Promise<Result<Recommendation>> {
  const parsed = parseInput(input);
  if (!parsed.ok) return parsed;

  // Run deterministic orchestration first. This establishes the authoritative
  // domain result and ensures provider failures cannot mask domain failures.
  const deterministic = createItinerary(parsed.value, undefined, "deterministic");
  if (!deterministic.ok) return deterministic;

  const read = readOptions(options);
  if (read.ranker === undefined) {
    return fallback(deterministic.value, "itinerary.ai_unavailable");
  }
  if (typeof read.ranker !== "function") {
    return fallback(deterministic.value, "itinerary.ai_invalid");
  }

  if (safeAbortState(read.signal)) {
    return fallback(deterministic.value, "itinerary.ai_aborted");
  }

  const budget = normalizeBudgetToVnd(
    parsed.value.request,
    parsed.value.fx,
    parsed.value.asOfUtc,
  );
  if (!budget.ok) return budget;
  const filtered = filterCandidates(parsed.value, budget.value.budgetVnd);
  if (!filtered.ok) return filtered;

  const request = toPublicRankRequest(
    filtered.value,
    parsed.value.request.priorityWeights,
    parsed.value.request.pace,
  );

  let timeoutHandle: TimeoutSignalHandle;
  try {
    const factory = read.timeoutSignalFactory ?? defaultTimeoutSignalFactory;
    timeoutHandle = factory(AI_TIMEOUT_MS);
    if (
      typeof timeoutHandle !== "object" ||
      timeoutHandle === null ||
      typeof timeoutHandle.signal !== "object" ||
      timeoutHandle.signal === null ||
      typeof timeoutHandle.cancel !== "function"
    ) {
      return fallback(deterministic.value, "itinerary.ai_invalid");
    }
  } catch {
    return fallback(deterministic.value, "itinerary.ai_invalid");
  }

  const combinedController = new AbortController();
  const abortCombined = () => combinedController.abort();
  const callerSignal = read.signal;
  const timeoutSignal = timeoutHandle.signal;
  try {
    callerSignal?.addEventListener("abort", abortCombined, { once: true });
    timeoutSignal.addEventListener("abort", abortCombined, { once: true });
    if (callerSignal?.aborted || timeoutSignal.aborted) abortCombined();

    const outcome = await invokeRanker(
      read.ranker as Ranker,
      request,
      combinedController.signal,
    );

    if (outcome.kind === "aborted") {
      return fallback(deterministic.value, "itinerary.ai_aborted");
    }
    if (outcome.kind === "invalid") {
      return fallback(deterministic.value, "itinerary.ai_invalid");
    }

    const validated = validateRankResponse(
      outcome.value,
      filtered.value.map((candidate) => candidate.id),
    );
    if (!validated.ok) {
      return fallback(deterministic.value, "itinerary.ai_invalid");
    }

    const aiResult = createItinerary(
      parsed.value,
      validated.value.orderedIds,
      "ai",
    );
    if (!aiResult.ok) {
      return fallback(deterministic.value, "itinerary.ai_invalid");
    }

    return {
      ok: true,
      value: {
        result: aiResult.value,
        degraded: false,
        rationales: validated.value.rationales,
      },
    };
  } catch {
    return fallback(deterministic.value, "itinerary.ai_invalid");
  } finally {
    try {
      callerSignal?.removeEventListener("abort", abortCombined);
      timeoutSignal.removeEventListener("abort", abortCombined);
      timeoutHandle.cancel();
    } catch {
      // Cleanup is best effort for hostile injected test/runtime signals.
    }
  }
}
