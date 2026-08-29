import {
  parseEngineInput,
  type ItineraryResult,
  type Result,
} from "@/lib/domain/itinerary/contracts";
import { domainError } from "@/lib/domain/itinerary/errors";
import { filterCandidates } from "@/lib/domain/itinerary/candidate-filter";
import { normalizeBudgetToVnd } from "@/lib/domain/itinerary/money";
import { buildRankOrder } from "@/lib/domain/itinerary/scoring";
import { scheduleItinerary } from "@/lib/domain/itinerary/scheduler";
import type { FoodSelectionInput } from "@/lib/domain/itinerary/scheduler";
import { validateItinerary } from "@/lib/domain/itinerary/validator";
import { repairItinerary } from "@/lib/domain/itinerary/repair";

const invalidInput = <T>(issue = "engine"): Result<T> => ({
  ok: false,
  error: domainError("INVALID_ITINERARY_INPUT", "itinerary.engine.invalid", [issue]),
});

function isValidRankingSource(value: unknown): value is "ai" | "deterministic" {
  return value === "ai" || value === "deterministic";
}

export function createItinerary(
  source: unknown,
  rankedSubset?: unknown,
  rankingSource: "ai" | "deterministic" = "deterministic",
  foodSelections?: FoodSelectionInput,
): Result<ItineraryResult> {
  try {
    if (!isValidRankingSource(rankingSource)) return invalidInput("rankingSource");
    const parsed = parseEngineInput(source);
    if (!parsed.ok) return parsed;

    const budget = normalizeBudgetToVnd(
      parsed.value.request,
      parsed.value.fx,
      parsed.value.asOfUtc,
    );
    if (!budget.ok) return budget;
    const filtered = filterCandidates(parsed.value, budget.value.budgetVnd);
    if (!filtered.ok) return filtered;
    const ranked = buildRankOrder(
      filtered.value.map((candidate) => candidate.id),
      rankedSubset as readonly string[] | undefined,
    );
    if (!ranked.ok) return ranked;

    const scheduled = scheduleItinerary(
      parsed.value,
      filtered.value,
      ranked.value,
      budget.value.budgetVnd,
      rankingSource,
      foodSelections,
    );
    if (!scheduled.ok) return scheduled;

    const validation = validateItinerary(parsed.value, scheduled.value, ranked.value);
    if (validation.valid) return scheduled;

    const repaired = repairItinerary(parsed.value, scheduled.value, validation.issues, ranked.value);
    if (!repaired.ok) return repaired;
    return repaired;
  } catch {
    return invalidInput();
  }
}
