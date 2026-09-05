import type {
  ItineraryRequest,
  ItineraryTotals,
  Locale,
  Result,
} from "@/lib/domain/itinerary/contracts";

/** One browser-created idempotency scope for one deliberate mutation. */
export interface RuntimePlannerOperation {
  readonly operationId: string;
}

export type RuntimePlannerErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_EXPIRED"
  | "INVALID_REQUEST"
  | "QUOTA_EXCEEDED"
  | "CATALOG_UNAVAILABLE"
  | "TRAVEL_DATA_UNAVAILABLE"
  | "FX_UNAVAILABLE"
  | "NO_FEASIBLE_ITINERARY"
  | "ITINERARY_SEARCH_LIMIT"
  | "INVALID_ITINERARY_INPUT"
  | "USD_DISABLED"
  | "INVALID_ITINERARY_RESULT"
  | "PLAN_NOT_FOUND"
  | "PLAN_UNAVAILABLE"
  | "SNAPSHOT_MISMATCH"
  | "LOCKED_ITEM_INVALID"
  | "STALE_REVISION"
  | "SERVICE_UNAVAILABLE"
  | "OPERATION_IN_PROGRESS"
  | "OPERATION_CONFLICT"
  | "OPERATION_INTERRUPTED";

export type RuntimePlannerOperationState = "rejected" | "in_progress" | "interrupted";

export type RuntimePlannerErrorStatus = 400 | 401 | 404 | 409 | 422 | 429 | 500 | 503;

export type RuntimePlannerErrorMessageKey =
  | "planner.auth_required"
  | "planner.auth_expired"
  | "planner.invalid_request"
  | "planner.service_unavailable"
  | "recommendation.quota_exceeded"
  | "refinement.quota_exceeded"
  | "refinement.stale_revision"
  | "recommendation.catalog_unavailable"
  | "recommendation.travel_data_unavailable"
  | "recommendation.fx_unavailable"
  | "itinerary.input.invalid"
  | "itinerary.usd_disabled"
  | "itinerary.no_feasible"
  | "itinerary.search_limit"
  | "itinerary.result.invalid"
  | "refinement.plan_not_found"
  | "refinement.plan_unavailable"
  | "refinement.snapshot_mismatch"
  | "refinement.locked_item_invalid"
  | "planner.operation_in_progress"
  | "planner.operation_conflict"
  | "planner.operation_interrupted";

/**
 * The strict server-decision tuple frozen for the operation-aware wire contract.
 * `null` means that no verified operation state is emitted on that response.
 */
export interface RuntimePlannerErrorDefinition {
  readonly code: RuntimePlannerErrorCode;
  readonly status: RuntimePlannerErrorStatus;
  readonly messageKey: RuntimePlannerErrorMessageKey;
  readonly retryable: boolean;
  readonly operationState: RuntimePlannerOperationState | null;
}

export const RUNTIME_PLANNER_ERROR_DEFINITIONS = [
  { code: "AUTH_REQUIRED", status: 401, messageKey: "planner.auth_required", retryable: false, operationState: null },
  { code: "AUTH_EXPIRED", status: 401, messageKey: "planner.auth_expired", retryable: false, operationState: null },
  { code: "INVALID_REQUEST", status: 400, messageKey: "planner.invalid_request", retryable: false, operationState: null },
  { code: "QUOTA_EXCEEDED", status: 429, messageKey: "recommendation.quota_exceeded", retryable: true, operationState: "rejected" },
  { code: "QUOTA_EXCEEDED", status: 429, messageKey: "refinement.quota_exceeded", retryable: true, operationState: "rejected" },
  { code: "STALE_REVISION", status: 409, messageKey: "refinement.stale_revision", retryable: true, operationState: "rejected" },
  { code: "SERVICE_UNAVAILABLE", status: 503, messageKey: "planner.service_unavailable", retryable: true, operationState: null },
  { code: "INVALID_ITINERARY_INPUT", status: 400, messageKey: "itinerary.input.invalid", retryable: false, operationState: null },
  { code: "INVALID_ITINERARY_INPUT", status: 400, messageKey: "itinerary.input.invalid", retryable: false, operationState: "rejected" },
  { code: "USD_DISABLED", status: 422, messageKey: "itinerary.usd_disabled", retryable: false, operationState: null },
  { code: "USD_DISABLED", status: 422, messageKey: "itinerary.usd_disabled", retryable: false, operationState: "rejected" },
  { code: "NO_FEASIBLE_ITINERARY", status: 422, messageKey: "itinerary.no_feasible", retryable: false, operationState: "rejected" },
  { code: "CATALOG_UNAVAILABLE", status: 503, messageKey: "recommendation.catalog_unavailable", retryable: true, operationState: "rejected" },
  { code: "TRAVEL_DATA_UNAVAILABLE", status: 503, messageKey: "recommendation.travel_data_unavailable", retryable: true, operationState: "rejected" },
  { code: "FX_UNAVAILABLE", status: 503, messageKey: "recommendation.fx_unavailable", retryable: true, operationState: "rejected" },
  { code: "ITINERARY_SEARCH_LIMIT", status: 503, messageKey: "itinerary.search_limit", retryable: true, operationState: "rejected" },
  { code: "INVALID_ITINERARY_RESULT", status: 500, messageKey: "itinerary.result.invalid", retryable: false, operationState: "rejected" },
  { code: "PLAN_NOT_FOUND", status: 404, messageKey: "refinement.plan_not_found", retryable: false, operationState: "rejected" },
  { code: "PLAN_NOT_FOUND", status: 404, messageKey: "refinement.plan_not_found", retryable: false, operationState: null },
  { code: "PLAN_UNAVAILABLE", status: 503, messageKey: "refinement.plan_unavailable", retryable: true, operationState: null },
  { code: "PLAN_UNAVAILABLE", status: 503, messageKey: "refinement.plan_unavailable", retryable: true, operationState: "rejected" },
  { code: "SNAPSHOT_MISMATCH", status: 409, messageKey: "refinement.snapshot_mismatch", retryable: false, operationState: "rejected" },
  { code: "LOCKED_ITEM_INVALID", status: 422, messageKey: "refinement.locked_item_invalid", retryable: false, operationState: "rejected" },
  { code: "OPERATION_IN_PROGRESS", status: 409, messageKey: "planner.operation_in_progress", retryable: true, operationState: "in_progress" },
  { code: "OPERATION_CONFLICT", status: 409, messageKey: "planner.operation_conflict", retryable: false, operationState: null },
  { code: "OPERATION_INTERRUPTED", status: 409, messageKey: "planner.operation_interrupted", retryable: false, operationState: "interrupted" },
] as const satisfies readonly RuntimePlannerErrorDefinition[];

type RuntimePlannerErrorDefinitionUnion = typeof RUNTIME_PLANNER_ERROR_DEFINITIONS[number];

type RuntimePlannerErrorWireVariant<Definition extends RuntimePlannerErrorDefinitionUnion> =
  Omit<Definition, "operationState"> & (
    Definition["operationState"] extends null
      ? { readonly operationState?: never }
      : { readonly operationState: Definition["operationState"] }
  );

export type RuntimePlannerErrorContract =
  RuntimePlannerErrorDefinitionUnion extends infer Definition
    ? Definition extends RuntimePlannerErrorDefinitionUnion
      ? RuntimePlannerErrorWireVariant<Definition>
      : never
    : never;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate a wire tuple against an exact allowlisted code/context variant. */
export function isRuntimePlannerErrorContract(value: unknown): value is RuntimePlannerErrorContract {
  if (!isRecord(value)) return false;

  return RUNTIME_PLANNER_ERROR_DEFINITIONS.some((definition) => {
    if (
      value.code !== definition.code
      || value.status !== definition.status
      || value.messageKey !== definition.messageKey
      || value.retryable !== definition.retryable
    ) return false;

    return definition.operationState === null
      ? !Object.prototype.hasOwnProperty.call(value, "operationState")
      : value.operationState === definition.operationState;
  });
}

export interface RuntimePlannerError {
  readonly code: RuntimePlannerErrorCode;
  readonly messageKey: string;
  readonly retryable: boolean;
  readonly correlationId: string;
  /** Optional until 14.3 coordinates the current legacy adapter with the new wire tuple. */
  readonly status?: RuntimePlannerErrorStatus;
  /** Absent for transport/validation failures whose operation outcome is unknown or unclaimed. */
  readonly operationState?: RuntimePlannerOperationState;
}

export type RuntimePlannerSource = "ai" | "deterministic";

export type RuntimePlannerMessageKey =
  | "itinerary.ai_unavailable"
  | "itinerary.ai_invalid"
  | "itinerary.ai_aborted";

export interface RuntimePlannerFoodItem {
  readonly vendorId: string;
  readonly vendorTitle: string;
  readonly itemId: string;
  readonly itemTitle: string;
  readonly quantity: number;
  readonly activity: string;
  readonly foodCostMinVnd: number;
  readonly foodCostMaxVnd: number;
  readonly payAtVendorMinVnd: number;
  readonly payAtVendorMaxVnd: number;
}

export interface RuntimePlannerItem {
  readonly placeId: string;
  readonly title: string;
  readonly summary: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly visitDurationMinutes: number;
  readonly travelMinutesBefore: number;
  readonly transitionBufferMinutesBefore: 0 | 10;
  readonly admissionCostVnd: number;
  readonly travelCostVnd: number;
  readonly food: RuntimePlannerFoodItem | null;
  readonly customerPayableVnd: number;
  readonly score: number;
  readonly rationale: string | null;
}

export interface RuntimePlannerSnapshotIds {
  readonly catalog: string;
  readonly travel: string;
  readonly fx: string | null;
}

export interface RuntimePlannerProposal {
  readonly planId: string;
  readonly revision: number;
  readonly source: RuntimePlannerSource;
  readonly degraded: boolean;
  readonly messageKey?: RuntimePlannerMessageKey;
  readonly normalizedStartAt: string;
  readonly rationales: Readonly<Record<string, string>>;
  readonly items: readonly RuntimePlannerItem[];
  readonly totals: ItineraryTotals;
  readonly budgetVnd: number;
  readonly snapshotIds: RuntimePlannerSnapshotIds;
}

/** The bounded Edge refinement payload; it deliberately carries no identity or personalization notes. */
export interface RuntimeRefinementRequest {
  readonly planId: string;
  readonly baseRevision: number;
  readonly delta: Readonly<{
    feedback: string;
    scope: "partial" | "full";
  }>;
  readonly lockedItemIds: readonly string[];
}

export interface RuntimePlannerPort {
  getSession(): Promise<{ userId: string; role: "customer" } | null>;
  /** Notify the planner surface when the authenticated account lifecycle changes. */
  subscribeSession?(listener: (userId: string | null) => void): () => void;
  recommend(
    request: ItineraryRequest,
    locale: Locale,
    operation: RuntimePlannerOperation,
  ): Promise<Result<RuntimePlannerProposal, RuntimePlannerError>>;
  refine(
    input: RuntimeRefinementRequest,
    locale: Locale,
    operation: RuntimePlannerOperation,
  ): Promise<Result<RuntimePlannerProposal, RuntimePlannerError>>;
  /** RLS-enforced owner readback for restoring plans and refreshing stale revisions. */
  getPlan(
    planId: string,
    locale: Locale,
  ): Promise<Result<RuntimePlannerProposal, RuntimePlannerError>>;
}
