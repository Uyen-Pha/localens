import type { RuntimePlannerError } from "@/lib/application/planner/runtime-planner";

export type RuntimePlannerErrorUiMessage =
  | "auth-expired"
  | "invalid-request"
  | "quota"
  | "catalog-unavailable"
  | "travel-data-unavailable"
  | "fx-unavailable"
  | "no-feasible-itinerary"
  | "search-limit"
  | "invalid-itinerary-input"
  | "usd-disabled"
  | "invalid-itinerary-result"
  | "plan-unavailable"
  | "plan-temporarily-unavailable"
  | "snapshot-mismatch"
  | "locked-item-invalid"
  | "stale-revision"
  | "service-unavailable"
  | "operation-in-progress"
  | "operation-conflict"
  | "operation-interrupted";

export type RuntimePlannerErrorUiAction =
  | "none"
  | "sign-in"
  | "edit-request"
  | "refresh-plan"
  | "retry-same-operation"
  | "retry-new-operation";

export interface RuntimePlannerErrorUi {
  readonly message: RuntimePlannerErrorUiMessage;
  readonly action: RuntimePlannerErrorUiAction;
}

/** Convert a typed runtime failure into a bounded, trusted presentation decision. */
export function runtimePlannerErrorUi(error: RuntimePlannerError): RuntimePlannerErrorUi {
  switch (error.code) {
    case "AUTH_REQUIRED":
    case "AUTH_EXPIRED":
      return { message: "auth-expired", action: "sign-in" };
    case "INVALID_REQUEST":
      return { message: "invalid-request", action: "edit-request" };
    case "INVALID_ITINERARY_INPUT":
      return { message: "invalid-itinerary-input", action: "edit-request" };
    case "USD_DISABLED":
      return { message: "usd-disabled", action: "edit-request" };
    case "NO_FEASIBLE_ITINERARY":
      return { message: "no-feasible-itinerary", action: "edit-request" };
    case "QUOTA_EXCEEDED":
      return { message: "quota", action: "retry-new-operation" };
    case "CATALOG_UNAVAILABLE":
      return { message: "catalog-unavailable", action: "retry-new-operation" };
    case "TRAVEL_DATA_UNAVAILABLE":
      return { message: "travel-data-unavailable", action: "retry-new-operation" };
    case "FX_UNAVAILABLE":
      return { message: "fx-unavailable", action: "retry-new-operation" };
    case "ITINERARY_SEARCH_LIMIT":
      return { message: "search-limit", action: "retry-new-operation" };
    case "INVALID_ITINERARY_RESULT":
      return { message: "invalid-itinerary-result", action: "none" };
    case "PLAN_NOT_FOUND":
      return { message: "plan-unavailable", action: "none" };
    case "PLAN_UNAVAILABLE":
      return {
        message: "plan-temporarily-unavailable",
        action: error.operationState === "rejected" ? "retry-new-operation" : "retry-same-operation",
      };
    case "SNAPSHOT_MISMATCH":
      return { message: "snapshot-mismatch", action: "refresh-plan" };
    case "LOCKED_ITEM_INVALID":
      return { message: "locked-item-invalid", action: "refresh-plan" };
    case "STALE_REVISION":
      return { message: "stale-revision", action: "refresh-plan" };
    case "SERVICE_UNAVAILABLE":
      return { message: "service-unavailable", action: "retry-same-operation" };
    case "OPERATION_IN_PROGRESS":
      return { message: "operation-in-progress", action: "retry-same-operation" };
    case "OPERATION_CONFLICT":
      return { message: "operation-conflict", action: "retry-new-operation" };
    case "OPERATION_INTERRUPTED":
      return { message: "operation-interrupted", action: "retry-new-operation" };
    default:
      return { message: "service-unavailable", action: "none" };
  }
}
