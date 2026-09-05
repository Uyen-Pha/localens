import { describe, expect, it } from "vitest";

import {
  isRuntimePlannerErrorContract,
  RUNTIME_PLANNER_ERROR_DEFINITIONS,
  type RuntimePlannerErrorContract,
  type RuntimePlannerOperation,
  type RuntimePlannerPort,
  type RuntimePlannerProposal,
} from "@/lib/application/planner/runtime-planner";
import {
  toItineraryRequest,
  type PersonalizationRequest,
} from "@/lib/application/planner/personalization-session";
import type { Result } from "@/lib/domain/itinerary/contracts";

const personalizationWithSpecialNeeds: PersonalizationRequest = {
  startAt: "2026-09-05T10:30:00+07:00",
  durationMinutes: 240,
  areas: ["district-1"],
  budget: { currency: "VND", amountMinor: 1_500_000 },
  partySize: 2,
  guideLanguage: "vi",
  priorityWeights: {
    street_food: 5,
    history: 3,
    traditional_craft: 1,
    traditional_market: 4,
  },
  pace: "active",
  dietaryRequirements: ["vegetarian"],
  mobilityRequirements: ["step-free"],
  lockedStopIds: [],
  specialNeeds: "Private medical information must stay out of the runtime request.",
};

const expectedErrorDefinitions = [
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
] as const;

const operationRejectedCodes = [
  "QUOTA_EXCEEDED",
  "CATALOG_UNAVAILABLE",
  "TRAVEL_DATA_UNAVAILABLE",
  "FX_UNAVAILABLE",
  "STALE_REVISION",
  "INVALID_ITINERARY_INPUT",
  "USD_DISABLED",
  "NO_FEASIBLE_ITINERARY",
  "ITINERARY_SEARCH_LIMIT",
  "INVALID_ITINERARY_RESULT",
  "PLAN_NOT_FOUND",
  "PLAN_UNAVAILABLE",
  "SNAPSHOT_MISMATCH",
  "LOCKED_ITEM_INVALID",
] as const;

describe("runtime planner port", () => {
  it("exports an operation scope that contains only the browser-generated UUID", () => {
    const operation: RuntimePlannerOperation = {
      operationId: "10000000-0000-4000-8000-000000000001",
    };

    expect(operation).toEqual({ operationId: "10000000-0000-4000-8000-000000000001" });
  });

  it("freezes strict error code/status/message/retry/state pairs for the next runtime contract", () => {
    const operationInProgress: RuntimePlannerErrorContract = expectedErrorDefinitions[23];

    expect(operationInProgress).toEqual({
      code: "OPERATION_IN_PROGRESS",
      status: 409,
      messageKey: "planner.operation_in_progress",
      retryable: true,
      operationState: "in_progress",
    });
    expect(RUNTIME_PLANNER_ERROR_DEFINITIONS).toEqual(expectedErrorDefinitions);
  });

  it("covers every persisted operation rejection without broadening unrelated states", () => {
    const rejectedCodes = new Set(
      RUNTIME_PLANNER_ERROR_DEFINITIONS
        .filter(({ operationState }) => operationState === "rejected")
        .map(({ code }) => code),
    );

    expect(rejectedCodes).toEqual(new Set(operationRejectedCodes));
    expect(isRuntimePlannerErrorContract({
      code: "OPERATION_CONFLICT",
      status: 409,
      messageKey: "planner.operation_conflict",
      retryable: false,
    })).toBe(true);
    expect(isRuntimePlannerErrorContract({
      code: "OPERATION_CONFLICT",
      status: 409,
      messageKey: "planner.operation_conflict",
      retryable: false,
      operationState: "rejected",
    })).toBe(false);
  });

  it("accepts only the frozen state variant for each wire error context", () => {
    expect(isRuntimePlannerErrorContract({
      code: "PLAN_NOT_FOUND",
      status: 404,
      messageKey: "refinement.plan_not_found",
      retryable: false,
    })).toBe(true);
    expect(isRuntimePlannerErrorContract({
      code: "PLAN_NOT_FOUND",
      status: 404,
      messageKey: "refinement.plan_not_found",
      retryable: false,
      operationState: "rejected",
    })).toBe(true);
    expect(isRuntimePlannerErrorContract({
      code: "PLAN_NOT_FOUND",
      status: 503,
      messageKey: "refinement.plan_not_found",
      retryable: false,
    })).toBe(false);
    expect(isRuntimePlannerErrorContract({
      code: "INVALID_ITINERARY_INPUT",
      status: 400,
      messageKey: "itinerary.input.invalid",
      retryable: false,
      operationState: "interrupted",
    })).toBe(false);
    expect(isRuntimePlannerErrorContract({
      code: "SERVICE_UNAVAILABLE",
      status: 503,
      messageKey: "planner.service_unavailable",
      retryable: true,
      operationState: null,
    })).toBe(false);
  });

  it("does not permit specialNeeds in a runtime recommendation", () => {
    const request = toItineraryRequest(personalizationWithSpecialNeeds);

    expect(request).not.toHaveProperty("specialNeeds");
  });

  it("requires owner-scoped reads to return the same typed result as mutations", async () => {
    const proposal = {} as RuntimePlannerProposal;
    const success: Result<RuntimePlannerProposal, never> = { ok: true, value: proposal };
    const port: RuntimePlannerPort = {
      getSession: async () => ({ userId: "customer-session-id", role: "customer" }),
      recommend: async () => success,
      refine: async () => success,
      getPlan: async () => success,
    };

    await expect(port.getPlan("plan-id", "vi")).resolves.toEqual(success);
  });
});
