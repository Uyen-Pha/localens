import { describe, expect, it } from "vitest";

import {
  RUNTIME_PLANNER_ERROR_DEFINITIONS,
  type RuntimePlannerError,
} from "@/lib/application/planner/runtime-planner";
import { runtimePlannerErrorUi } from "@/lib/application/planner/runtime-planner-error-ui";
import { getDictionary } from "@/lib/i18n/dictionaries";

const expectedByCode = {
  AUTH_REQUIRED: { message: "auth-expired", action: "sign-in" },
  AUTH_EXPIRED: { message: "auth-expired", action: "sign-in" },
  INVALID_REQUEST: { message: "invalid-request", action: "edit-request" },
  QUOTA_EXCEEDED: { message: "quota", action: "retry-new-operation" },
  CATALOG_UNAVAILABLE: { message: "catalog-unavailable", action: "retry-new-operation" },
  TRAVEL_DATA_UNAVAILABLE: { message: "travel-data-unavailable", action: "retry-new-operation" },
  FX_UNAVAILABLE: { message: "fx-unavailable", action: "retry-new-operation" },
  NO_FEASIBLE_ITINERARY: { message: "no-feasible-itinerary", action: "edit-request" },
  ITINERARY_SEARCH_LIMIT: { message: "search-limit", action: "retry-new-operation" },
  INVALID_ITINERARY_INPUT: { message: "invalid-itinerary-input", action: "edit-request" },
  USD_DISABLED: { message: "usd-disabled", action: "edit-request" },
  INVALID_ITINERARY_RESULT: { message: "invalid-itinerary-result", action: "none" },
  PLAN_NOT_FOUND: { message: "plan-unavailable", action: "none" },
  PLAN_UNAVAILABLE: { message: "plan-temporarily-unavailable", action: "retry-same-operation" },
  SNAPSHOT_MISMATCH: { message: "snapshot-mismatch", action: "refresh-plan" },
  LOCKED_ITEM_INVALID: { message: "locked-item-invalid", action: "refresh-plan" },
  STALE_REVISION: { message: "stale-revision", action: "refresh-plan" },
  SERVICE_UNAVAILABLE: { message: "service-unavailable", action: "retry-same-operation" },
  OPERATION_IN_PROGRESS: { message: "operation-in-progress", action: "retry-same-operation" },
  OPERATION_CONFLICT: { message: "operation-conflict", action: "retry-new-operation" },
  OPERATION_INTERRUPTED: { message: "operation-interrupted", action: "retry-new-operation" },
} as const;

describe("runtime planner trusted error UI", () => {
  it.each(RUNTIME_PLANNER_ERROR_DEFINITIONS)(
    "maps $code / $messageKey without using raw server text",
    (definition) => {
      const error = {
        code: definition.code,
        status: definition.status,
        messageKey: definition.messageKey,
        retryable: definition.retryable,
        correlationId: "40000000-0000-4000-8000-000000000001",
        ...(definition.operationState === null ? {} : { operationState: definition.operationState }),
      } satisfies RuntimePlannerError;
      const expected = expectedByCode[definition.code];
      const action = definition.code === "PLAN_UNAVAILABLE" && definition.operationState === "rejected"
        ? "retry-new-operation"
        : expected.action;

      expect(runtimePlannerErrorUi(error)).toEqual({ message: expected.message, action });
    },
  );

  it("fails closed for an unknown code", () => {
    expect(runtimePlannerErrorUi({
      code: "PRIVATE_DATABASE_ERROR",
      messageKey: "private.raw.detail",
      retryable: true,
      correlationId: "not-trusted",
    } as unknown as RuntimePlannerError)).toEqual({
      message: "service-unavailable",
      action: "none",
    });
  });

  it.each(["en", "vi"] as const)("provides trusted %s copy for every UI message and CTA", (locale) => {
    const copy = getDictionary(locale).planner;
    const messages = new Set(Object.values(expectedByCode).map(({ message }) => message));

    for (const message of messages) {
      expect(copy.runtimeErrorMessages[message]).toEqual(expect.any(String));
      expect(copy.runtimeErrorMessages[message].trim().length).toBeGreaterThan(10);
    }
    expect(copy.runtimeNewRequestLabel.trim().length).toBeGreaterThan(3);
    expect(JSON.stringify(getDictionary(locale))).not.toContain("amountMinor");
  });
});
