import type {
  ItineraryRequest,
  ItineraryTotals,
  Locale,
  Result,
} from "@/lib/domain/itinerary/contracts";

export type RuntimePlannerErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_EXPIRED"
  | "INVALID_REQUEST"
  | "QUOTA_EXCEEDED"
  | "STALE_REVISION"
  | "SERVICE_UNAVAILABLE";

export interface RuntimePlannerError {
  readonly code: RuntimePlannerErrorCode;
  readonly messageKey: string;
  readonly retryable: boolean;
  readonly correlationId: string;
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
  recommend(
    request: ItineraryRequest,
    locale: Locale,
  ): Promise<Result<RuntimePlannerProposal, RuntimePlannerError>>;
  refine(
    input: RuntimeRefinementRequest,
    locale: Locale,
  ): Promise<Result<RuntimePlannerProposal, RuntimePlannerError>>;
  /** RLS-enforced owner readback for restoring plans and refreshing stale revisions. */
  getPlan(
    planId: string,
    locale: Locale,
  ): Promise<Result<RuntimePlannerProposal, RuntimePlannerError>>;
}
