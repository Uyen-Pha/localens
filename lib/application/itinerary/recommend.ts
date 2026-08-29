import {
  parseEngineInput,
  type EngineInput,
  type FoodSelectionInput,
  type ItineraryResult,
  type PlaceCandidate,
  type Result,
} from "@/lib/domain/itinerary/contracts";
import { createItinerary } from "@/lib/domain/itinerary/engine";
import { filterCandidates } from "@/lib/domain/itinerary/candidate-filter";
import { multiplyVnd, normalizeBudgetToVnd, sumVnd } from "@/lib/domain/itinerary/money";
import {
  foodMenuItemSchema,
  foodVendorSchema,
  type FoodSelection,
} from "@/lib/domain/food/contracts";
import {
  calculateFoodSelectionCost,
  calculateItineraryCostBreakdown,
} from "@/lib/domain/itinerary/food-cost";
import { findEarliestFoodVisitStart } from "@/lib/domain/itinerary/food-filter";
import { normalizeToHcmMinute } from "@/lib/domain/itinerary/local-time";
import {
  type RankFoodValidationOptions,
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
  /** Trusted canonical selections carried forward by refinement locks. */
  lockedFoodSelections?: FoodSelectionInput;
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
const MAX_AI_PROVIDER_CANDIDATES = 128;
const MAX_AI_ALLOWED_VENDORS = 128;
const MAX_AI_ALLOWED_MENU_ITEMS = 256;
const MAX_AI_OPTIONS_PER_PLACE = 64;
const MAX_AI_PROVIDER_PAYLOAD_BYTES = 16 * 1024;

interface FoodAllowlist {
  allowedVendorIds: string[];
  allowedMenuItemIds: string[];
  canonicalSelectionsByPlace: Map<string, FoodSelection[]>;
}

type FoodAllowlistResult =
  | { ok: true; value: FoodAllowlist }
  | { ok: false; reason: "bounded" | "no_feasible" };

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
  lockedFoodSelections?: FoodSelectionInput;
} {
  if (options === undefined) return {};
  if (typeof options !== "object" || options === null) return { ranker: null };
  try {
    return {
      ranker: options.ranker,
      signal: options.signal,
      timeoutSignalFactory: options.timeoutSignalFactory,
      lockedFoodSelections: options.lockedFoodSelections,
    };
  } catch {
    return { ranker: null };
  }
}

function isFoodPriorityPlace(place: PlaceCandidate, input: EngineInput): boolean {
  return input.request.priorityWeights.street_food > 0
    && place.types.some((type) => type === "street_food" || type === "traditional_market");
}

function supports(
  support: Readonly<Record<string, string>>,
  requirements: readonly string[],
): boolean {
  return requirements.every((requirement) => support[requirement] === "supported");
}

function compareIds(left: { id: string }, right: { id: string }): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function buildFoodAllowlist(
  input: EngineInput,
  candidates: readonly PlaceCandidate[],
  budgetVnd: number,
): FoodAllowlistResult {
  const start = normalizeToHcmMinute(input.request.startAt);
  if (!start.ok) return { ok: false, reason: "no_feasible" };
  const requestEnd = start.value + input.request.durationMinutes;
  if (!Number.isSafeInteger(requestEnd)) return { ok: false, reason: "no_feasible" };

  const allowedVendorIds = new Set<string>();
  const allowedMenuItemIds = new Set<string>();
  const canonicalSelectionsByPlace = new Map<string, FoodSelection[]>();
  let aggregateOptions = 0;

  for (const place of candidates) {
    if (!isFoodPriorityPlace(place, input)) continue;
    const admissionResult = multiplyVnd(place.priceVndPerPerson, input.request.partySize);
    if (!admissionResult.ok || admissionResult.value > budgetVnd) {
      canonicalSelectionsByPlace.set(place.id, []);
      continue;
    }
    const remainingBudget = budgetVnd - admissionResult.value;
    const selections: FoodSelection[] = [];
    const vendors = [...place.foodVendors].sort(compareIds);
    for (const rawVendor of vendors) {
      const vendorResult = foodVendorSchema.safeParse(rawVendor);
      if (!vendorResult.success) continue;
      const vendor = vendorResult.data;
      if (
        vendor.placeId !== place.id ||
        vendor.status !== "sellable" ||
        !supports(vendor.dietarySupport, input.request.dietaryRequirements) ||
        !supports(vendor.mobilitySupport, input.request.mobilityRequirements)
      ) continue;

      const items = [...vendor.menuItems].sort(compareIds);
      let vendorHasSelection = false;
      for (const rawItem of items) {
        const itemResult = foodMenuItemSchema.safeParse(rawItem);
        if (!itemResult.success) continue;
        const item = itemResult.data;
        if (
          item.vendorId !== vendor.id ||
          item.status !== "sellable" ||
          item.available !== true ||
          !supports(item.dietarySupport, input.request.dietaryRequirements)
        ) continue;

        if (selections.length >= MAX_AI_OPTIONS_PER_PLACE) {
          return { ok: false, reason: "bounded" };
        }
        if (aggregateOptions >= MAX_AI_ALLOWED_MENU_ITEMS) {
          return { ok: false, reason: "bounded" };
        }
        if (!allowedMenuItemIds.has(item.id) && allowedMenuItemIds.size >= MAX_AI_ALLOWED_MENU_ITEMS) {
          return { ok: false, reason: "bounded" };
        }
        if (!allowedVendorIds.has(vendor.id) && allowedVendorIds.size >= MAX_AI_ALLOWED_VENDORS) {
          return { ok: false, reason: "bounded" };
        }

        const quantity = item.servingUnit === "shared_set" ? 1 : input.request.partySize;
        const selection: FoodSelection = {
          vendorId: vendor.id,
          menuItemId: item.id,
          quantity,
          priceVndMin: item.priceVndMin,
          priceVndMax: item.priceVndMax,
          paymentMode: "pay_at_vendor",
          activity: "Taste and discuss the selected dish",
        };
        const cost = calculateFoodSelectionCost(selection, item, input.request.partySize);
        if (!cost.ok || cost.value.maxVnd > remainingBudget) continue;
        const interval = findEarliestFoodVisitStart(
          place,
          vendor,
          start.value,
          requestEnd,
          place.visitDurationMinutes,
        );
        if (!interval.ok || interval.value === null) continue;
        selections.push(selection);
        aggregateOptions += 1;
        vendorHasSelection = true;
        allowedMenuItemIds.add(item.id);
      }
      if (vendorHasSelection) allowedVendorIds.add(vendor.id);
    }
    selections.sort((left, right) =>
      left.vendorId < right.vendorId ? -1 : left.vendorId > right.vendorId ? 1 :
        left.menuItemId < right.menuItemId ? -1 : left.menuItemId > right.menuItemId ? 1 : 0,
    );
    canonicalSelectionsByPlace.set(place.id, selections);
    if (selections.length === 0) return { ok: false, reason: "no_feasible" };
  }

  const sortedVendorIds = [...allowedVendorIds].sort();
  const sortedMenuItemIds = [...allowedMenuItemIds].sort();
  if (sortedVendorIds.length > MAX_AI_ALLOWED_VENDORS || sortedMenuItemIds.length > MAX_AI_ALLOWED_MENU_ITEMS) {
    return { ok: false, reason: "bounded" };
  }
  return {
    ok: true,
    value: {
      allowedVendorIds: sortedVendorIds,
      allowedMenuItemIds: sortedMenuItemIds,
      canonicalSelectionsByPlace,
    },
  };
}

function sameFoodSelection(left: FoodSelection, right: FoodSelection): boolean {
  return left.vendorId === right.vendorId
    && left.menuItemId === right.menuItemId
    && left.quantity === right.quantity
    && left.priceVndMin === right.priceVndMin
    && left.priceVndMax === right.priceVndMax
    && left.paymentMode === right.paymentMode
    && left.activity === right.activity;
}

function lockedSelectionsAreCanonical(
  lockedSelections: FoodSelectionInput | undefined,
  allowlist: FoodAllowlist,
): boolean {
  if (lockedSelections === undefined) return true;
  for (const placeId of Object.keys(lockedSelections)) {
    const canonical = allowlist.canonicalSelectionsByPlace.get(placeId);
    const locked = lockedSelections[placeId];
    if (canonical === undefined) return false;
    if (locked === undefined) return false;
    if (locked === null) continue;
    if (!canonical.some((selection) => sameFoodSelection(selection, locked))) {
      return false;
    }
  }
  return true;
}

function mergeLockedFoodSelections(
  aiSelections: readonly { placeId: string; selection: FoodSelection }[],
  lockedSelections: FoodSelectionInput | undefined,
): FoodSelectionInput | null {
  const merged = Object.create(null) as Record<string, FoodSelection | null>;
  if (lockedSelections !== undefined) {
    for (const placeId of Object.keys(lockedSelections)) {
      const selection = lockedSelections[placeId];
      Object.defineProperty(merged, placeId, {
        value: selection === null ? null : {
            vendorId: selection.vendorId,
            menuItemId: selection.menuItemId,
            quantity: selection.quantity,
            priceVndMin: selection.priceVndMin,
            priceVndMax: selection.priceVndMax,
            paymentMode: selection.paymentMode,
            activity: selection.activity,
          },
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  }
  for (const { placeId, selection } of aiSelections) {
    const hasExisting = Object.prototype.hasOwnProperty.call(merged, placeId);
    const existing = hasExisting ? merged[placeId] : undefined;
    if (hasExisting && (existing === null || existing === undefined || !sameFoodSelection(existing, selection))) return null;
    if (!hasExisting) {
      Object.defineProperty(merged, placeId, {
        value: {
          vendorId: selection.vendorId,
          menuItemId: selection.menuItemId,
          quantity: selection.quantity,
          priceVndMin: selection.priceVndMin,
          priceVndMax: selection.priceVndMax,
          paymentMode: selection.paymentMode,
          activity: selection.activity,
        },
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  }
  return merged;
}

function safeAbortState(signal: AbortSignal | undefined): boolean {
  try {
    return signal?.aborted === true;
  } catch {
    return true;
  }
}

function isProviderPayloadWithinBounds(request: RankRequest): boolean {
  try {
    const serialized = JSON.stringify(request);
    if (typeof serialized !== "string") return false;
    return new TextEncoder().encode(serialized).byteLength <= MAX_AI_PROVIDER_PAYLOAD_BYTES;
  } catch {
    return false;
  }
}

function stripLockedFoodlessSelections(
  result: ItineraryResult,
  lockedSelections: FoodSelectionInput | undefined,
): ItineraryResult | null {
  if (lockedSelections === undefined) return result;
  const lockedFoodless = new Set(
    Object.keys(lockedSelections).filter((placeId) => lockedSelections[placeId] === null),
  );
  if (lockedFoodless.size === 0) return result;

  let changed = false;
  const items: ItineraryResult["items"] = [];
  for (const item of result.items) {
    if (!lockedFoodless.has(item.placeId)) {
      items.push(item);
      continue;
    }
    changed = true;
    const customerPayable = sumVnd([item.placeCostVnd, item.travelCostVndBefore]);
    if (!customerPayable.ok) return null;
    items.push({
      ...item,
      foodSelection: null,
      foodCostMinVnd: 0,
      foodCostMaxVnd: 0,
      payAtVendorMinVnd: 0,
      payAtVendorMaxVnd: 0,
      customerPayableVnd: customerPayable.value,
    });
  }
  if (!changed) return result;

  const travelCost = sumVnd(items.map((item) => item.travelCostVndBefore));
  if (!travelCost.ok) return null;
  const cost = calculateItineraryCostBreakdown(items, travelCost.value, result.totals.guideCostVnd);
  if (!cost.ok) return null;
  return {
    ...result,
    items,
    totals: {
      ...result.totals,
      ...cost.value,
    },
  };
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

  const read = readOptions(options);

  // Run deterministic orchestration first. This establishes the authoritative
  // domain result and ensures provider failures cannot mask domain failures.
  const deterministicResult = createItinerary(
    parsed.value,
    undefined,
    "deterministic",
    read.lockedFoodSelections,
  );
  if (!deterministicResult.ok) return deterministicResult;
  const deterministicValue = stripLockedFoodlessSelections(
    deterministicResult.value,
    read.lockedFoodSelections,
  );
  if (deterministicValue === null) return fallback(deterministicResult.value, "itinerary.ai_invalid");
  const deterministic = { ok: true as const, value: deterministicValue };

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
  if (filtered.value.length > MAX_AI_PROVIDER_CANDIDATES) {
    return fallback(deterministic.value, "itinerary.ai_invalid");
  }

  const allowlist = buildFoodAllowlist(
    parsed.value,
    filtered.value,
    budget.value.budgetVnd,
  );
  if (!allowlist.ok) {
    if (allowlist.reason === "no_feasible") {
      return {
        ok: false,
        error: {
          code: "NO_FEASIBLE_ITINERARY",
          messageKey: "itinerary.no_feasible",
          retryable: false,
        },
      };
    }
    return fallback(deterministic.value, "itinerary.ai_invalid");
  }
  if (!lockedSelectionsAreCanonical(read.lockedFoodSelections, allowlist.value)) {
    return {
      ok: false,
      error: {
        code: "NO_FEASIBLE_ITINERARY",
        messageKey: "itinerary.no_feasible",
        retryable: false,
      },
    };
  }

  const request = toPublicRankRequest(
    filtered.value,
    parsed.value.request.priorityWeights,
    parsed.value.request.pace,
    allowlist.value.allowedVendorIds,
    allowlist.value.allowedMenuItemIds,
  );
  if (!isProviderPayloadWithinBounds(request)) {
    return fallback(deterministic.value, "itinerary.ai_invalid");
  }

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
      {
        ...allowlist.value,
        lockedFoodlessPlaceIds: read.lockedFoodSelections === undefined
          ? []
          : Object.keys(read.lockedFoodSelections).filter(
              (placeId) => read.lockedFoodSelections?.[placeId] === null,
            ),
      } satisfies RankFoodValidationOptions,
    );
    if (!validated.ok) {
      return fallback(deterministic.value, "itinerary.ai_invalid");
    }

    const foodSelections = mergeLockedFoodSelections(
      validated.value.foodSelections,
      read.lockedFoodSelections,
    );
    if (foodSelections === null) {
      return fallback(deterministic.value, "itinerary.ai_invalid");
    }

    const aiResult = createItinerary(
      parsed.value,
      validated.value.orderedIds,
      "ai",
      foodSelections,
    );
    if (!aiResult.ok) {
      return fallback(deterministic.value, "itinerary.ai_invalid");
    }
    const strippedAiResult = stripLockedFoodlessSelections(
      aiResult.value,
      read.lockedFoodSelections,
    );
    if (strippedAiResult === null) {
      return fallback(deterministic.value, "itinerary.ai_invalid");
    }

    return {
      ok: true,
      value: {
        result: strippedAiResult,
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
