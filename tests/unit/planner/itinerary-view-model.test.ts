import { describe, expect, it } from "vitest";

import {
  toRuntimePlannerProposal,
  type RuntimePlannerDisplayRow,
  type RuntimePlannerResponse,
} from "@/lib/application/planner/itinerary-view-model";

const snapshotIds = {
  catalog: "catalog-snapshot-1",
  travel: "travel-snapshot-1",
  fx: null,
} as const;

const displayRows: readonly RuntimePlannerDisplayRow[] = [{
  snapshotId: snapshotIds.catalog,
  placeId: "place-market",
  locale: "vi",
  title: "Chợ Bến Thành",
  summary: "Chợ trung tâm thành phố.",
  food: [{
    vendorId: "vendor-banh-mi",
    title: "Quầy bánh mì",
    items: [{ itemId: "item-banh-mi", title: "Bánh mì thịt" }],
  }],
}];

const aiResponse: RuntimePlannerResponse = {
  advisoryOnly: true,
  degraded: false,
  planId: "plan-ai",
  revision: 1,
  proposal: {
    normalizedStartAt: "2026-09-05T10:30:00+07:00",
    budgetVnd: 1_500_000,
    rankingSource: "ai",
    snapshotIds,
    items: [{
      placeId: "place-market",
      startAt: "2026-09-05T10:30:00+07:00",
      endAt: "2026-09-05T11:30:00+07:00",
      visitDurationMinutes: 60,
      travelMinutesBefore: 0,
      transitionBufferMinutesBefore: 0,
      travelCostVndBefore: 0,
      placeCostVnd: 0,
      foodSelection: {
        vendorId: "vendor-banh-mi",
        menuItemId: "item-banh-mi",
        quantity: 2,
        priceVndMin: 30_000,
        priceVndMax: 35_000,
        paymentMode: "pay_at_vendor",
        activity: "food_stop",
      },
      foodCostMinVnd: 60_000,
      foodCostMaxVnd: 70_000,
      payAtVendorMinVnd: 60_000,
      payAtVendorMaxVnd: 70_000,
      customerPayableVnd: 0,
      score: 1,
    }],
    totals: {
      durationMinutes: 60,
      visitMinutes: 60,
      travelMinutes: 0,
      transitionBufferMinutes: 0,
      admissionCostVnd: 0,
      foodCostMinVnd: 60_000,
      foodCostMaxVnd: 70_000,
      travelCostVnd: 0,
      guideCostVnd: 0,
      payAtVendorMinVnd: 60_000,
      payAtVendorMaxVnd: 70_000,
      customerPayableVnd: 0,
      groupCostMinVnd: 60_000,
      groupCostMaxVnd: 70_000,
      groupCostVnd: 70_000,
      score: 1,
    },
  },
  rationales: { "place-market": "Ưu tiên trải nghiệm ẩm thực địa phương." },
};

describe("runtime itinerary view model", () => {
  it("maps AI and deterministic proposals into explicit source labels", () => {
    const fallbackResponse: RuntimePlannerResponse = {
      ...aiResponse,
      degraded: true,
      planId: "plan-fallback",
      messageKey: "itinerary.ai_unavailable",
      proposal: { ...aiResponse.proposal, rankingSource: "deterministic" },
    };

    expect(toRuntimePlannerProposal(aiResponse, displayRows, "vi")).toMatchObject({
      planId: aiResponse.planId,
      revision: 1,
      source: "ai",
      degraded: false,
      items: [{
        title: "Chợ Bến Thành",
        rationale: "Ưu tiên trải nghiệm ẩm thực địa phương.",
        food: { vendorTitle: "Quầy bánh mì", itemTitle: "Bánh mì thịt" },
      }],
    });
    expect(toRuntimePlannerProposal(fallbackResponse, displayRows, "vi")).toMatchObject({
      source: "deterministic",
      degraded: true,
    });
  });

  it.each([
    ["a missing place title", [{ ...displayRows[0], title: "" }]],
    ["a row from another catalog snapshot", [{ ...displayRows[0], snapshotId: "catalog-snapshot-other" }]],
    ["a duplicate display row", [displayRows[0], displayRows[0]]],
  ])("fails closed for %s", (_label, invalidRows) => {
    expect(toRuntimePlannerProposal(aiResponse, invalidRows, "vi")).toBeNull();
  });

  it.each([
    ["an unknown food vendor", { ...aiResponse, proposal: { ...aiResponse.proposal, items: [{ ...aiResponse.proposal.items[0], foodSelection: { ...aiResponse.proposal.items[0].foodSelection!, vendorId: "vendor-unknown" } }] } }],
    ["an unknown food item", { ...aiResponse, proposal: { ...aiResponse.proposal, items: [{ ...aiResponse.proposal.items[0], foodSelection: { ...aiResponse.proposal.items[0].foodSelection!, menuItemId: "item-unknown" } }] } }],
    ["a bigint overflow", { ...aiResponse, proposal: { ...aiResponse.proposal, budgetVnd: Number.MAX_SAFE_INTEGER + 1 } }],
    ["an unknown message key", { ...aiResponse, messageKey: "itinerary.provider_detail" }],
    ["an extra top-level response field", { ...aiResponse, providerTrace: "must not cross the boundary" }],
  ])("fails closed for %s", (_label, invalidResponse) => {
    expect(toRuntimePlannerProposal(invalidResponse, displayRows, "vi")).toBeNull();
  });
});
