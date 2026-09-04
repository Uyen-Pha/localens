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
    budgetVnd: "1500000",
    rankingSource: "ai",
    snapshotIds,
    items: [{
      placeId: "place-market",
      startAt: "2026-09-05T10:30:00+07:00",
      endAt: "2026-09-05T11:30:00+07:00",
      visitDurationMinutes: 60,
      travelMinutesBefore: 0,
      transitionBufferMinutesBefore: 0,
      travelCostVndBefore: "0",
      placeCostVnd: "0",
      foodSelection: {
        vendorId: "vendor-banh-mi",
        menuItemId: "item-banh-mi",
        quantity: 2,
        priceVndMin: "30000",
        priceVndMax: "35000",
        paymentMode: "pay_at_vendor",
        activity: "food_stop",
      },
      foodCostMinVnd: "60000",
      foodCostMaxVnd: "70000",
      payAtVendorMinVnd: "60000",
      payAtVendorMaxVnd: "70000",
      customerPayableVnd: "0",
      score: 1,
    }],
    totals: {
      durationMinutes: 60,
      visitMinutes: 60,
      travelMinutes: 0,
      transitionBufferMinutes: 0,
      admissionCostVnd: "0",
      foodCostMinVnd: "60000",
      foodCostMaxVnd: "70000",
      travelCostVnd: "0",
      guideCostVnd: "0",
      payAtVendorMinVnd: "60000",
      payAtVendorMaxVnd: "70000",
      customerPayableVnd: "0",
      groupCostMinVnd: "60000",
      groupCostMaxVnd: "70000",
      groupCostVnd: "70000",
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
        admissionCostVnd: 0,
        food: { vendorTitle: "Quầy bánh mì", itemTitle: "Bánh mì thịt", foodCostMaxVnd: 70_000 },
      }],
      budgetVnd: 1_500_000,
      totals: { groupCostVnd: 70_000 },
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
    ["numeric wire money", { ...aiResponse, proposal: { ...aiResponse.proposal, budgetVnd: 1_500_000 } }],
    ["a negative wire amount", { ...aiResponse, proposal: { ...aiResponse.proposal, budgetVnd: "-1" } }],
    ["a fractional wire amount", { ...aiResponse, proposal: { ...aiResponse.proposal, budgetVnd: "1.5" } }],
    ["a malformed wire amount", { ...aiResponse, proposal: { ...aiResponse.proposal, budgetVnd: "01" } }],
    ["a bigint overflow", { ...aiResponse, proposal: { ...aiResponse.proposal, budgetVnd: "9007199254740992" } }],
    ["an unknown message key", { ...aiResponse, messageKey: "itinerary.provider_detail" }],
    ["a deterministic source without degraded mode", {
      ...aiResponse,
      proposal: { ...aiResponse.proposal, rankingSource: "deterministic" },
    }],
    ["a degraded AI source", { ...aiResponse, degraded: true }],
    ["an extra top-level response field", { ...aiResponse, providerTrace: "must not cross the boundary" }],
  ])("fails closed for %s", (_label, invalidResponse) => {
    expect(toRuntimePlannerProposal(invalidResponse, displayRows, "vi")).toBeNull();
  });
});
