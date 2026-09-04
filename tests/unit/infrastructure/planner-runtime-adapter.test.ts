import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { itineraryFixture } from "@/tests/fixtures/itinerary/catalog.v1";
import { createSupabasePlannerRuntimeAdapter } from "@/lib/infrastructure/supabase/planner-runtime-adapter";

const ids = {
  user: "11111111-1111-4111-8111-111111111111",
  plan: "22222222-2222-4222-8222-222222222222",
  catalog: "33333333-3333-4333-8333-333333333333",
  travel: "44444444-4444-4444-8444-444444444444",
  areaOne: "55555555-5555-4555-8555-555555555555",
  areaTwo: "66666666-6666-4666-8666-666666666666",
};

type QueryResponse = { data: unknown; error: unknown };

function queryDouble(response: QueryResponse) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    then: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.then.mockImplementation((resolve, reject) => Promise.resolve(response).then(resolve, reject));
  return query;
}

function wireResponse(overrides: Record<string, unknown> = {}) {
  return {
    advisoryOnly: true,
    degraded: false,
    planId: ids.plan,
    revision: 1,
    rationales: { "place-one": "Matches the selected pace." },
    proposal: {
      normalizedStartAt: "2026-09-05T08:00:00+07:00",
      budgetVnd: "2000000",
      rankingSource: "ai",
      items: [{
        placeId: "place-one",
        startAt: "2026-09-05T09:00:00+07:00",
        endAt: "2026-09-05T09:45:00+07:00",
        visitDurationMinutes: 45,
        travelMinutesBefore: 0,
        transitionBufferMinutesBefore: 0,
        travelCostVndBefore: "0",
        placeCostVnd: "360000",
        foodSelection: null,
        foodCostMinVnd: "0",
        foodCostMaxVnd: "0",
        payAtVendorMinVnd: "0",
        payAtVendorMaxVnd: "0",
        customerPayableVnd: "360000",
        score: 5001,
      }],
      totals: {
        durationMinutes: 105,
        visitMinutes: 45,
        travelMinutes: 0,
        transitionBufferMinutes: 0,
        admissionCostVnd: "360000",
        foodCostMinVnd: "0",
        foodCostMaxVnd: "0",
        travelCostVnd: "0",
        guideCostVnd: "0",
        payAtVendorMinVnd: "0",
        payAtVendorMaxVnd: "0",
        customerPayableVnd: "360000",
        groupCostMinVnd: "360000",
        groupCostMaxVnd: "360000",
        groupCostVnd: "360000",
        score: 5001,
      },
      snapshotIds: { catalog: ids.catalog, travel: ids.travel, fx: null },
    },
    ...overrides,
  };
}

function persistedResult() {
  const result = structuredClone(wireResponse().proposal) as Record<string, any>;
  result.budgetVnd = Number(result.budgetVnd);
  result.items = result.items.map((item: Record<string, unknown>) => ({
    ...item,
    travelCostVndBefore: Number(item.travelCostVndBefore),
    placeCostVnd: Number(item.placeCostVnd),
    foodCostMinVnd: Number(item.foodCostMinVnd),
    foodCostMaxVnd: Number(item.foodCostMaxVnd),
    payAtVendorMinVnd: Number(item.payAtVendorMinVnd),
    payAtVendorMaxVnd: Number(item.payAtVendorMaxVnd),
    customerPayableVnd: Number(item.customerPayableVnd),
  }));
  for (const field of [
    "admissionCostVnd",
    "foodCostMinVnd",
    "foodCostMaxVnd",
    "travelCostVnd",
    "guideCostVnd",
    "payAtVendorMinVnd",
    "payAtVendorMaxVnd",
    "customerPayableVnd",
    "groupCostMinVnd",
    "groupCostMaxVnd",
    "groupCostVnd",
  ]) result.totals[field] = Number(result.totals[field]);
  return result;
}

function clientDouble({
  invoke = { data: wireResponse(), error: null },
  areas = [
    { snapshot_id: ids.catalog, area_id: ids.areaOne, slug: "district-1" },
    { snapshot_id: ids.catalog, area_id: ids.areaTwo, slug: "district-5" },
  ],
  display = [{ snapshot_id: ids.catalog, place_id: "place-one", locale: "en", title: "Place one", summary: "A place." }],
  vendors = [],
  items = [],
  plans = [{ id: ids.plan, latest_revision_no: 1 }],
  revisions = [{ plan_id: ids.plan, revision_no: 1, result_json: persistedResult(), ranking_source: "ai" }],
  session = { data: { session: { user: { id: ids.user } } }, error: null },
  identity = { data: [{ user_id: ids.user, display_name: "Demo customer", role: "customer", language: "en" }], error: null },
}: {
  invoke?: QueryResponse;
  areas?: unknown;
  display?: unknown;
  vendors?: unknown;
  items?: unknown;
  plans?: unknown;
  revisions?: unknown;
  session?: QueryResponse;
  identity?: QueryResponse;
} = {}) {
  const areaQuery = queryDouble({ data: areas, error: null });
  const displayQuery = queryDouble({ data: display, error: null });
  const vendorQuery = queryDouble({ data: vendors, error: null });
  const itemQuery = queryDouble({ data: items, error: null });
  const planQuery = queryDouble({ data: plans, error: null });
  const revisionQuery = queryDouble({ data: revisions, error: null });
  const client = {
    auth: { getSession: vi.fn().mockResolvedValue(session) },
    rpc: vi.fn().mockResolvedValue(identity),
    functions: { invoke: vi.fn().mockResolvedValue(invoke) },
    from: vi.fn((relation: string) => {
      if (relation === "catalog_snapshot_areas_v") return areaQuery;
      if (relation === "catalog_snapshot_place_display_v") return displayQuery;
      if (relation === "catalog_snapshot_food_vendors_v") return vendorQuery;
      if (relation === "trip_plans") return planQuery;
      if (relation === "trip_plan_revisions") return revisionQuery;
      return itemQuery;
    }),
  };
  return { client, areaQuery, displayQuery, vendorQuery, itemQuery, planQuery, revisionQuery };
}

describe("Supabase planner runtime adapter", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("canonicalizes areas, invokes the authenticated Edge function, and maps localized display rows", async () => {
    const { client, areaQuery, displayQuery } = clientDouble();
    const adapter = createSupabasePlannerRuntimeAdapter(client as never);

    const result = await adapter.recommend(itineraryFixture.request, "en");

    expect(result).toMatchObject({ ok: true, value: { planId: ids.plan, source: "ai", items: [{ title: "Place one" }] } });
    expect(areaQuery.in).toHaveBeenCalledWith("slug", ["district-1", "district-5"]);
    expect(client.functions.invoke).toHaveBeenCalledWith("recommend-itinerary", {
      body: { input: { ...itineraryFixture.request, areas: [ids.areaOne, ids.areaTwo] } },
      headers: { "x-localens-device-id": expect.stringMatching(/^[0-9a-f-]{36}$/) },
    });
    expect(displayQuery.eq).toHaveBeenCalledWith("snapshot_id", ids.catalog);
    expect(displayQuery.in).toHaveBeenCalledWith("place_id", ["place-one"]);
    expect(window.sessionStorage.getItem("localens.ai-device.v1")).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(client.functions.invoke.mock.calls)).not.toMatch(/specialNeeds|guestToken|turnstile|email|phone|userId/i);
  });

  it("keeps one validated device UUID for the tab and regenerates an invalid stored value", async () => {
    window.sessionStorage.setItem("localens.ai-device.v1", "not-a-uuid");
    const { client } = clientDouble();
    const adapter = createSupabasePlannerRuntimeAdapter(client as never);

    await adapter.recommend(itineraryFixture.request, "en");
    const first = window.sessionStorage.getItem("localens.ai-device.v1");
    await adapter.recommend(itineraryFixture.request, "en");

    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(client.functions.invoke.mock.calls[0]?.[1].headers["x-localens-device-id"]).toBe(first);
    expect(client.functions.invoke.mock.calls[1]?.[1].headers["x-localens-device-id"]).toBe(first);
  });

  it("uses the bounded refinement body without customer identity or private personalization", async () => {
    const { client } = clientDouble();
    const adapter = createSupabasePlannerRuntimeAdapter(client as never);

    await adapter.refine({
      planId: ids.plan,
      baseRevision: 1,
      delta: { feedback: "More history", scope: "partial" },
      lockedItemIds: ["item-one"],
    }, "en");

    expect(client.functions.invoke).toHaveBeenCalledWith("refine-itinerary", {
      body: {
        planId: ids.plan,
        baseRevision: 1,
        delta: { feedback: "More history", scope: "partial" },
        lockedItemIds: ["item-one"],
      },
      headers: { "x-localens-device-id": expect.stringMatching(/^[0-9a-f-]{36}$/) },
    });
  });

  it("loads localized food vendor and menu labels only for a selected returned food item", async () => {
    const response = wireResponse();
    const proposal = response.proposal as Record<string, any>;
    proposal.items[0].foodSelection = {
      vendorId: "vendor-one",
      menuItemId: "item-one",
      quantity: 1,
      priceVndMin: "30000",
      priceVndMax: "40000",
      paymentMode: "pay_at_vendor",
      activity: "Taste a local dish",
    };
    proposal.items[0].foodCostMinVnd = "30000";
    proposal.items[0].foodCostMaxVnd = "40000";
    proposal.items[0].payAtVendorMinVnd = "30000";
    proposal.items[0].payAtVendorMaxVnd = "40000";
    proposal.totals.foodCostMinVnd = "30000";
    proposal.totals.foodCostMaxVnd = "40000";
    proposal.totals.payAtVendorMinVnd = "30000";
    proposal.totals.payAtVendorMaxVnd = "40000";
    const { client, vendorQuery, itemQuery } = clientDouble({
      invoke: { data: response, error: null },
      vendors: [{ snapshot_id: ids.catalog, place_id: "place-one", vendor_id: "vendor-one", title: { en: "Vendor one", vi: "Quầy một" } }],
      items: [{ snapshot_id: ids.catalog, place_id: "place-one", vendor_id: "vendor-one", item_id: "item-one", title: { en: "Dish one", vi: "Món một" } }],
    });

    await expect(createSupabasePlannerRuntimeAdapter(client as never).recommend(itineraryFixture.request, "en"))
      .resolves.toMatchObject({ ok: true, value: { items: [{ food: { vendorTitle: "Vendor one", itemTitle: "Dish one" } }] } });
    expect(vendorQuery.in).toHaveBeenCalledWith("place_id", ["place-one"]);
    expect(itemQuery.in).toHaveBeenCalledWith("place_id", ["place-one"]);
  });

  it("restores only the latest owner-scoped plan through RLS reads and remaps persisted money safely", async () => {
    const { client, planQuery, revisionQuery } = clientDouble();
    const result = await createSupabasePlannerRuntimeAdapter(client as never).getPlan(ids.plan, "en");

    expect(result).toMatchObject({ ok: true, value: { planId: ids.plan, revision: 1, budgetVnd: 2_000_000 } });
    expect(client.functions.invoke).not.toHaveBeenCalled();
    expect(client.from).toHaveBeenCalledWith("trip_plans");
    expect(planQuery.eq).toHaveBeenCalledWith("id", ids.plan);
    expect(client.from).toHaveBeenCalledWith("trip_plan_revisions");
    expect(revisionQuery.eq).toHaveBeenNthCalledWith(1, "plan_id", ids.plan);
    expect(revisionQuery.eq).toHaveBeenNthCalledWith(2, "revision_no", 1);
    expect(JSON.stringify(revisionQuery.select.mock.calls)).not.toMatch(/owner_user_id|actor_user_id|email|phone/i);
  });

  it.each([
    ["network failure", () => Promise.reject(new Error("network unavailable")), "SERVICE_UNAVAILABLE", true],
    ["expired session", () => Promise.resolve({ data: null, error: { context: { status: 401 } } }), "AUTH_EXPIRED", false],
    ["stale revision", () => Promise.resolve({ data: null, error: { context: { status: 409 } } }), "STALE_REVISION", false],
    ["quota response", () => Promise.resolve({ data: null, error: { context: { status: 429 } } }), "QUOTA_EXCEEDED", false],
    ["service response", () => Promise.resolve({ data: null, error: { context: { status: 503 } } }), "SERVICE_UNAVAILABLE", true],
    ["malformed body", () => Promise.resolve({ data: { private: "detail" }, error: null }), "SERVICE_UNAVAILABLE", false],
  ])("maps %s to a safe planner error", async (_label, invocation, code, retryable) => {
    const { client } = clientDouble();
    client.functions.invoke.mockImplementationOnce(invocation);
    const result = await createSupabasePlannerRuntimeAdapter(client as never).recommend(itineraryFixture.request, "en");

    expect(result).toMatchObject({ ok: false, error: { code, retryable } });
    expect(JSON.stringify(result)).not.toContain("detail");
  });

  it("does not call catalog or Edge services when the authenticated customer session is unavailable", async () => {
    const { client } = clientDouble({ session: { data: { session: null }, error: null } });
    const result = await createSupabasePlannerRuntimeAdapter(client as never).recommend(itineraryFixture.request, "en");

    expect(result).toMatchObject({ ok: false, error: { code: "AUTH_REQUIRED" } });
    expect(client.from).not.toHaveBeenCalled();
    expect(client.functions.invoke).not.toHaveBeenCalled();
  });

  it("rejects an unknown gateway message key without exposing it to planner consumers", async () => {
    const { client } = clientDouble({ invoke: { data: wireResponse({ messageKey: "provider.private_detail" }), error: null } });
    const result = await createSupabasePlannerRuntimeAdapter(client as never).recommend(itineraryFixture.request, "en");

    expect(result).toMatchObject({ ok: false, error: { code: "SERVICE_UNAVAILABLE" } });
    expect(JSON.stringify(result)).not.toContain("provider.private_detail");
  });

  it("fails closed for duplicate area or localized display rows", async () => {
    const duplicateAreas = clientDouble({
      areas: [
        { snapshot_id: ids.catalog, area_id: ids.areaOne, slug: "district-1" },
        { snapshot_id: ids.catalog, area_id: ids.areaOne, slug: "district-1" },
        { snapshot_id: ids.catalog, area_id: ids.areaTwo, slug: "district-5" },
      ],
    });
    await expect(createSupabasePlannerRuntimeAdapter(duplicateAreas.client as never).recommend(itineraryFixture.request, "en"))
      .resolves.toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
    expect(duplicateAreas.client.functions.invoke).not.toHaveBeenCalled();

    const duplicateDisplay = clientDouble({
      display: [
        { snapshot_id: ids.catalog, place_id: "place-one", locale: "en", title: "One", summary: "One." },
        { snapshot_id: ids.catalog, place_id: "place-one", locale: "en", title: "Again", summary: "Again." },
      ],
    });
    await expect(createSupabasePlannerRuntimeAdapter(duplicateDisplay.client as never).recommend(itineraryFixture.request, "en"))
      .resolves.toMatchObject({ ok: false, error: { code: "SERVICE_UNAVAILABLE" } });
  });
});
