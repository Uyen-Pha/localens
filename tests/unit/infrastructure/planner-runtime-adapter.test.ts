import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { itineraryFixture } from "@/tests/fixtures/itinerary/catalog.v1";
import { RUNTIME_PLANNER_ERROR_DEFINITIONS } from "@/lib/application/planner/runtime-planner";
import { createSupabasePlannerRuntimeAdapter } from "@/lib/infrastructure/supabase/planner-runtime-adapter";

const ids = {
  user: "11111111-1111-4111-8111-111111111111",
  plan: "22222222-2222-4222-8222-222222222222",
  catalog: "33333333-3333-4333-8333-333333333333",
  travel: "44444444-4444-4444-8444-444444444444",
  areaOne: "55555555-5555-4555-8555-555555555555",
  areaTwo: "66666666-6666-4666-8666-666666666666",
  areaThree: "77777777-7777-4777-8777-777777777777",
  areaFour: "88888888-8888-4888-8888-888888888888",
  operation: "99999999-9999-4999-8999-999999999999",
};

const runtimeOperation = { operationId: ids.operation } as const;
const accessToken = "fixture.bound.access-token";
const refinementRequest = {
  planId: ids.plan,
  baseRevision: 1,
  delta: { feedback: "More history", scope: "partial" },
  lockedItemIds: ["item-one"],
} as const;

type QueryResponse = { data: unknown; error: unknown };

function queryDouble(response: QueryResponse) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    limit: vi.fn(),
    order: vi.fn(),
    then: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.then.mockImplementation((resolve, reject) => Promise.resolve(response).then(resolve, reject));
  return query;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function gatewayFailure(
  status: number,
  body: unknown,
): QueryResponse {
  return {
    data: null,
    error: {
      context: new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    },
  };
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

type MutableJsonRecord = Record<string, unknown>;
type MutableProposal = MutableJsonRecord & {
  items: MutableJsonRecord[];
  totals: MutableJsonRecord;
};

function mutableJsonRecord(value: unknown): MutableJsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Expected a mutable JSON object fixture");
  }
  return value as MutableJsonRecord;
}

function mutableProposal(value: unknown): MutableProposal {
  const proposal = mutableJsonRecord(value);
  if (!Array.isArray(proposal.items)) throw new TypeError("Expected proposal items fixture");
  proposal.items.forEach(mutableJsonRecord);
  mutableJsonRecord(proposal.totals);
  return proposal as MutableProposal;
}

function persistedResult() {
  const result = mutableProposal(structuredClone(wireResponse().proposal));
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
  currentSnapshot = [{ catalog_snapshot_id: ids.catalog }],
  display = [{ snapshot_id: ids.catalog, place_id: "place-one", locale: "en", title: "Place one", summary: "A place." }],
  vendors = [],
  items = [],
  revisions = [{ plan_id: ids.plan, revision_no: 1, result_json: persistedResult(), ranking_source: "ai" }],
  revisionError = null,
  revisionThrows = false,
  session = { data: { session: { user: { id: ids.user }, access_token: accessToken } }, error: null },
  identity = { data: [{ user_id: ids.user, display_name: "Demo customer", role: "customer", language: "en" }], error: null },
}: {
  invoke?: QueryResponse;
  areas?: unknown;
  currentSnapshot?: unknown;
  display?: unknown;
  vendors?: unknown;
  items?: unknown;
  revisions?: unknown;
  revisionError?: unknown;
  revisionThrows?: boolean;
  session?: QueryResponse;
  identity?: QueryResponse;
} = {}) {
  const currentSnapshotQuery = queryDouble({ data: currentSnapshot, error: null });
  const areaQuery = queryDouble({ data: areas, error: null });
  const displayQuery = queryDouble({ data: display, error: null });
  const vendorQuery = queryDouble({ data: vendors, error: null });
  const itemQuery = queryDouble({ data: items, error: null });
  const revisionQuery = queryDouble({ data: revisions, error: revisionError });
  if (revisionThrows) {
    revisionQuery.then.mockImplementation((_resolve, reject) => Promise.reject(new Error("private database detail")).then(_resolve, reject));
  }
  let authStateChange: ((event: string, session: unknown) => void) | undefined;
  const unsubscribe = vi.fn();
  const onAuthStateChange = vi.fn((listener: (event: string, session: unknown) => void) => {
    authStateChange = listener;
    return { data: { subscription: { unsubscribe } } };
  });
  const client = {
    auth: { getSession: vi.fn().mockResolvedValue(session), onAuthStateChange },
    rpc: vi.fn().mockResolvedValue(identity),
    functions: { invoke: vi.fn().mockResolvedValue(invoke) },
    from: vi.fn((relation: string) => {
      if (relation === "current_itinerary_snapshot_v") return currentSnapshotQuery;
      if (relation === "catalog_snapshot_areas_v") return areaQuery;
      if (relation === "catalog_snapshot_place_display_v") return displayQuery;
      if (relation === "catalog_snapshot_food_vendors_v") return vendorQuery;
      if (relation === "trip_plan_revisions") return revisionQuery;
      return itemQuery;
    }),
  };
  return {
    client,
    currentSnapshotQuery,
    areaQuery,
    displayQuery,
    vendorQuery,
    itemQuery,
    revisionQuery,
    authStateChange: (event: string, session: unknown = null) => authStateChange?.(event, session),
    unsubscribe,
  };
}

describe("Supabase planner runtime adapter", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("notifies account lifecycle changes without treating initialization or token refresh as an account change", () => {
    const { client, authStateChange, unsubscribe } = clientDouble();
    const listener = vi.fn();
    const stop = createSupabasePlannerRuntimeAdapter(client as never).subscribeSession?.(listener);

    const session = { user: { id: ids.user }, access_token: accessToken };
    authStateChange("INITIAL_SESSION", session);
    authStateChange("TOKEN_REFRESHED", session);
    expect(listener).not.toHaveBeenCalled();

    authStateChange("SIGNED_IN", session);
    authStateChange("SIGNED_OUT", null);
    authStateChange("SIGNED_IN", {
      user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      access_token: "fixture.second.access-token",
    });
    authStateChange("USER_UPDATED", {
      user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      access_token: "fixture.second.access-token",
    });
    expect(listener).toHaveBeenNthCalledWith(1, null);
    expect(listener).toHaveBeenNthCalledWith(2, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

    stop?.();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending mutation before dispatch when the authenticated account changes", async () => {
    const { client, areaQuery, authStateChange } = clientDouble();
    const pendingAreas = deferred<QueryResponse>();
    areaQuery.then.mockImplementation((resolve, reject) => pendingAreas.promise.then(resolve, reject));
    const adapter = createSupabasePlannerRuntimeAdapter(client as never);
    const listener = vi.fn();
    adapter.subscribeSession?.(listener);

    const resultPromise = adapter.recommend(itineraryFixture.request, "en", runtimeOperation);
    await vi.waitFor(() => expect(areaQuery.then).toHaveBeenCalled());
    authStateChange("SIGNED_IN", {
      user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      access_token: "fixture.second.access-token",
    });
    pendingAreas.resolve({
      data: [
        { snapshot_id: ids.catalog, area_id: ids.areaOne, slug: "district-1" },
        { snapshot_id: ids.catalog, area_id: ids.areaTwo, slug: "district-5" },
      ],
      error: null,
    });

    await expect(resultPromise).resolves.toMatchObject({
      ok: false,
      error: { code: "AUTH_EXPIRED" },
    });
    expect(client.functions.invoke).not.toHaveBeenCalled();
  });

  it("pins area canonicalization to the current catalog snapshot before invoking the Edge function", async () => {
    const { client, currentSnapshotQuery, areaQuery, displayQuery } = clientDouble({
      areas: [
        { snapshot_id: ids.catalog, area_id: ids.areaOne, slug: "central-historical" },
        { snapshot_id: ids.catalog, area_id: ids.areaTwo, slug: "district-5-chinatown" },
        { snapshot_id: ids.catalog, area_id: ids.areaThree, slug: "district-3-cultural" },
        { snapshot_id: ids.catalog, area_id: ids.areaFour, slug: "outer-hcmc" },
      ],
    });
    const adapter = createSupabasePlannerRuntimeAdapter(client as never);
    const homepageRequest = {
      ...itineraryFixture.request,
      areas: [
        "demo-hcmc-district-1",
        "demo-hcmc-district-5",
        "demo-hcmc-district-3",
        "demo-hcmc-thu-duc",
      ],
    };

    const result = await adapter.recommend(homepageRequest, "en", runtimeOperation);

    expect(result).toMatchObject({ ok: true, value: { planId: ids.plan, source: "ai", items: [{ title: "Place one" }] } });
    expect(currentSnapshotQuery.select).toHaveBeenCalledWith("catalog_snapshot_id");
    expect(areaQuery.eq).toHaveBeenCalledWith("snapshot_id", ids.catalog);
    expect(areaQuery.in).toHaveBeenCalledWith("slug", [
      "central-historical",
      "district-5-chinatown",
      "district-3-cultural",
      "outer-hcmc",
    ]);
    expect(client.functions.invoke).toHaveBeenCalledWith("recommend-itinerary", {
      body: {
        operationId: ids.operation,
        input: { ...homepageRequest, areas: [ids.areaOne, ids.areaTwo, ids.areaThree, ids.areaFour] },
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-localens-device-id": expect.stringMatching(/^[0-9a-f-]{36}$/),
      },
    });
    expect(displayQuery.eq).toHaveBeenCalledWith("snapshot_id", ids.catalog);
    expect(displayQuery.in).toHaveBeenCalledWith("place_id", ["place-one"]);
    expect(window.sessionStorage.getItem("localens.ai-device.v1")).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(client.functions.invoke.mock.calls)).not.toMatch(/specialNeeds|guestToken|turnstile|email|phone|userId/i);
  });

  it("canonicalizes the published synthetic area slug without a district remap", async () => {
    const { client } = clientDouble({
      areas: [{ snapshot_id: ids.catalog, area_id: ids.areaOne, slug: "synthetic-central-hcmc" }],
    });
    const adapter = createSupabasePlannerRuntimeAdapter(client as never);

    const result = await adapter.recommend({
      ...itineraryFixture.request,
      areas: ["synthetic-central-hcmc"],
    }, "en", runtimeOperation);

    expect(result).toMatchObject({ ok: true });
    expect(client.functions.invoke).toHaveBeenCalledWith("recommend-itinerary", expect.objectContaining({
      body: expect.objectContaining({
        input: expect.objectContaining({ areas: [ids.areaOne] }),
      }),
    }));
  });

  it("keeps one validated device UUID for the tab and regenerates an invalid stored value", async () => {
    window.sessionStorage.setItem("localens.ai-device.v1", "not-a-uuid");
    const { client } = clientDouble();
    const adapter = createSupabasePlannerRuntimeAdapter(client as never);

    await adapter.recommend(itineraryFixture.request, "en", runtimeOperation);
    const first = window.sessionStorage.getItem("localens.ai-device.v1");
    await adapter.recommend(itineraryFixture.request, "en", runtimeOperation);

    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(client.functions.invoke.mock.calls[0]?.[1].headers["x-localens-device-id"]).toBe(first);
    expect(client.functions.invoke.mock.calls[1]?.[1].headers["x-localens-device-id"]).toBe(first);
  });

  it("reuses the same caller-supplied operation UUID for same-body retries", async () => {
    const { client } = clientDouble();
    const adapter = createSupabasePlannerRuntimeAdapter(client as never);

    await adapter.recommend(itineraryFixture.request, "en", runtimeOperation);
    await adapter.recommend(itineraryFixture.request, "en", runtimeOperation);

    expect(client.functions.invoke.mock.calls.map((call) => call[1].body)).toEqual([
      { operationId: ids.operation, input: { ...itineraryFixture.request, areas: [ids.areaOne, ids.areaTwo] } },
      { operationId: ids.operation, input: { ...itineraryFixture.request, areas: [ids.areaOne, ids.areaTwo] } },
    ]);
  });

  it("uses the bounded refinement body without customer identity or private personalization", async () => {
    const { client } = clientDouble();
    const adapter = createSupabasePlannerRuntimeAdapter(client as never);
    const operationWithPrivateFields = {
      operationId: ids.operation,
      userId: ids.user,
      email: "private@example.test",
      phone: "+84900000000",
    };

    await adapter.refine(refinementRequest, "en", operationWithPrivateFields);

    expect(client.functions.invoke).toHaveBeenCalledWith("refine-itinerary", {
      body: {
        operationId: ids.operation,
        planId: ids.plan,
        baseRevision: 1,
        delta: { feedback: "More history", scope: "partial" },
        lockedItemIds: ["item-one"],
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-localens-device-id": expect.stringMatching(/^[0-9a-f-]{36}$/),
      },
    });
    expect(JSON.stringify(client.functions.invoke.mock.calls)).not.toMatch(/private@example|\+849|userId|email|phone/i);
  });

  it.each([
    ["recommend", "not-a-uuid"],
    ["recommend", "99999999-9999-4999-8999-99999999999A"],
    ["refine", "not-a-uuid"],
    ["refine", "99999999-9999-4999-8999-99999999999A"],
  ] as const)("rejects a noncanonical %s operation UUID before side effects", async (kind, operationId) => {
    const { client } = clientDouble();
    const adapter = createSupabasePlannerRuntimeAdapter(client as never);

    const result = kind === "recommend"
      ? await adapter.recommend(itineraryFixture.request, "en", { operationId })
      : await adapter.refine(refinementRequest, "en", { operationId });

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST", retryable: false } });
    expect(client.auth.getSession).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
    expect(client.functions.invoke).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("localens.ai-device.v1")).toBeNull();
  });

  it("loads localized food vendor and menu labels only for a selected returned food item", async () => {
    const response = wireResponse();
    const proposal = mutableProposal(response.proposal);
    const firstItem = proposal.items[0];
    if (firstItem === undefined) throw new TypeError("Expected a proposal item fixture");
    firstItem.foodSelection = {
      vendorId: "vendor-one",
      menuItemId: "item-one",
      quantity: 1,
      priceVndMin: "30000",
      priceVndMax: "40000",
      paymentMode: "pay_at_vendor",
      activity: "Taste a local dish",
    };
    firstItem.foodCostMinVnd = "30000";
    firstItem.foodCostMaxVnd = "40000";
    firstItem.payAtVendorMinVnd = "30000";
    firstItem.payAtVendorMaxVnd = "40000";
    proposal.totals.foodCostMinVnd = "30000";
    proposal.totals.foodCostMaxVnd = "40000";
    proposal.totals.payAtVendorMinVnd = "30000";
    proposal.totals.payAtVendorMaxVnd = "40000";
    const { client, vendorQuery, itemQuery } = clientDouble({
      invoke: { data: response, error: null },
      vendors: [{ snapshot_id: ids.catalog, place_id: "place-one", vendor_id: "vendor-one", title: { en: "Vendor one", vi: "Quầy một" } }],
      items: [{ snapshot_id: ids.catalog, place_id: "place-one", vendor_id: "vendor-one", item_id: "item-one", title: { en: "Dish one", vi: "Món một" } }],
    });

    await expect(createSupabasePlannerRuntimeAdapter(client as never).recommend(itineraryFixture.request, "en", runtimeOperation))
      .resolves.toMatchObject({ ok: true, value: { items: [{ food: { vendorTitle: "Vendor one", itemTitle: "Dish one" } }] } });
    expect(vendorQuery.in).toHaveBeenCalledWith("place_id", ["place-one"]);
    expect(itemQuery.in).toHaveBeenCalledWith("place_id", ["place-one"]);
  });

  it("restores the newest owner-scoped revision in one RLS query and remaps persisted money safely", async () => {
    const latest = { plan_id: ids.plan, revision_no: 2, result_json: persistedResult(), ranking_source: "ai" };
    const { client, revisionQuery } = clientDouble({ revisions: [latest] });
    const result = await createSupabasePlannerRuntimeAdapter(client as never).getPlan(ids.plan, "en");

    expect(result).toMatchObject({ ok: true, value: { planId: ids.plan, revision: 2, budgetVnd: 2_000_000 } });
    expect(client.functions.invoke).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalledWith("trip_plans");
    expect(client.from).toHaveBeenCalledWith("trip_plan_revisions");
    expect(revisionQuery.eq).toHaveBeenCalledWith("plan_id", ids.plan);
    expect(revisionQuery.order).toHaveBeenCalledWith("revision_no", { ascending: false });
    expect(revisionQuery.limit).toHaveBeenCalledWith(1);
    expect(JSON.stringify(revisionQuery.select.mock.calls)).not.toMatch(/owner_user_id|actor_user_id|email|phone/i);
  });

  it.each([
    ["zero rows", { revisions: [] }, "PLAN_NOT_FOUND", 404, false],
    ["forbidden", { revisions: [], revisionError: { status: 403, message: "private owner detail" } }, "PLAN_NOT_FOUND", 404, false],
    ["not found", { revisions: [], revisionError: { status: 404, message: "private owner detail" } }, "PLAN_NOT_FOUND", 404, false],
    ["expired auth", { revisions: [], revisionError: { status: 401, message: "private auth detail" } }, "AUTH_EXPIRED", 401, false],
    ["server failure", { revisions: [], revisionError: { status: 503, message: "private database detail" } }, "SERVICE_UNAVAILABLE", 503, true],
    ["network failure", { revisions: [], revisionThrows: true }, "SERVICE_UNAVAILABLE", 503, true],
  ] as const)("maps owner plan readback %s without leaking database detail", async (_label, options, code, status, retryable) => {
    const { client } = clientDouble(options);

    const result = await createSupabasePlannerRuntimeAdapter(client as never).getPlan(ids.plan, "en");

    expect(result).toMatchObject({ ok: false, error: { code, status, retryable } });
    expect(JSON.stringify(result)).not.toContain("private");
  });

  it.each([
    ["network failure", () => Promise.reject(new Error("network unavailable")), "SERVICE_UNAVAILABLE", true],
    ["malformed body", () => Promise.resolve({ data: { private: "detail" }, error: null }), "SERVICE_UNAVAILABLE", true],
  ])("maps %s to a safe planner error", async (_label, invocation, code, retryable) => {
    const { client } = clientDouble();
    client.functions.invoke.mockImplementationOnce(invocation);
    const result = await createSupabasePlannerRuntimeAdapter(client as never).recommend(itineraryFixture.request, "en", runtimeOperation);

    expect(result).toMatchObject({ ok: false, error: { code, retryable } });
    expect(JSON.stringify(result)).not.toContain("detail");
  });

  it.each([
    [401, "AUTH_REQUIRED", "planner.auth_required", false, null],
    [409, "STALE_REVISION", "refinement.stale_revision", true, "rejected"],
    [429, "QUOTA_EXCEEDED", "recommendation.quota_exceeded", true, "rejected"],
    [503, "SERVICE_UNAVAILABLE", "planner.service_unavailable", true, null],
  ] as const)("uses the validated %i FunctionsHttpError gateway envelope", async (status, code, messageKey, retryable, operationState) => {
    const correlationId = "77777777-7777-4777-8777-777777777777";
    const { client } = clientDouble({
      invoke: gatewayFailure(status, {
        code,
        messageKey,
        retryable,
        ...(operationState === null ? {} : { operationState }),
        correlationId,
      }),
    });

    const result = await createSupabasePlannerRuntimeAdapter(client as never).recommend(itineraryFixture.request, "en", runtimeOperation);

    expect(result).toEqual({
      ok: false,
      error: {
        code,
        status,
        messageKey,
        retryable,
        ...(operationState === null ? {} : { operationState }),
        correlationId,
      },
    });
  });

  it.each([
    ["malformed JSON", 503, "{not json", "SERVICE_UNAVAILABLE", true],
    ["extra provider field", 409, {
      code: "STALE_REVISION",
      messageKey: "refinement.stale_revision",
      retryable: true,
      operationState: "rejected",
      correlationId: "77777777-7777-4777-8777-777777777777",
      providerDetail: "do not expose",
    }, "SERVICE_UNAVAILABLE", true],
  ] as const)("falls back safely when the FunctionsHttpError body has %s", async (_label, status, body, expectedCode, retryable) => {
    const { client } = clientDouble({ invoke: gatewayFailure(status, body) });

    const result = await createSupabasePlannerRuntimeAdapter(client as never).recommend(itineraryFixture.request, "en", runtimeOperation);

    expect(result).toMatchObject({
      ok: false,
      error: { code: expectedCode, status: 503, messageKey: "planner.service_unavailable", retryable },
    });
    expect(JSON.stringify(result)).not.toContain("providerDetail");
    expect(JSON.stringify(result)).not.toContain("do not expose");
  });

  it.each(RUNTIME_PLANNER_ERROR_DEFINITIONS)(
    "accepts only the trusted $code/$status/$messageKey/$operationState tuple",
    async (definition) => {
      const correlationId = "77777777-7777-4777-8777-777777777777";
      const body = {
        code: definition.code,
        messageKey: definition.messageKey,
        retryable: definition.retryable,
        ...(definition.operationState === null ? {} : { operationState: definition.operationState }),
        correlationId,
      };
      const { client } = clientDouble({ invoke: gatewayFailure(definition.status, body) });

      const result = await createSupabasePlannerRuntimeAdapter(client as never)
        .refine(refinementRequest, "en", runtimeOperation);

      expect(result).toEqual({
        ok: false,
        error: {
          code: definition.code,
          status: definition.status,
          messageKey: definition.messageKey,
          retryable: definition.retryable,
          ...(definition.operationState === null ? {} : { operationState: definition.operationState }),
          correlationId,
        },
      });
    },
  );

  it.each([
    ["wrong status", 500, { code: "USD_DISABLED", messageKey: "itinerary.usd_disabled", retryable: false }],
    ["wrong message key", 422, { code: "USD_DISABLED", messageKey: "itinerary.no_feasible", retryable: false }],
    ["wrong retryability", 422, { code: "USD_DISABLED", messageKey: "itinerary.usd_disabled", retryable: true }],
    ["wrong operation state", 429, { code: "QUOTA_EXCEEDED", messageKey: "refinement.quota_exceeded", retryable: true, operationState: "in_progress" }],
    ["missing operation state", 429, { code: "QUOTA_EXCEEDED", messageKey: "refinement.quota_exceeded", retryable: true }],
    ["extra field", 503, { code: "SERVICE_UNAVAILABLE", messageKey: "planner.service_unavailable", retryable: true, detail: "private" }],
  ] as const)("sanitizes a FunctionsHttpError with a %s", async (_label, status, partialBody) => {
    const { client } = clientDouble({
      invoke: gatewayFailure(status, {
        ...partialBody,
        correlationId: "77777777-7777-4777-8777-777777777777",
      }),
    });

    const result = await createSupabasePlannerRuntimeAdapter(client as never)
      .refine(refinementRequest, "en", runtimeOperation);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "SERVICE_UNAVAILABLE",
        status: 503,
        messageKey: "planner.service_unavailable",
        retryable: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain("private");
  });

  it("does not call catalog or Edge services when the authenticated customer session is unavailable", async () => {
    const { client } = clientDouble({ session: { data: { session: null }, error: null } });
    const result = await createSupabasePlannerRuntimeAdapter(client as never).recommend(itineraryFixture.request, "en", runtimeOperation);

    expect(result).toMatchObject({ ok: false, error: { code: "AUTH_REQUIRED" } });
    expect(client.from).not.toHaveBeenCalled();
    expect(client.functions.invoke).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", []],
    ["duplicate", [{ catalog_snapshot_id: ids.catalog }, { catalog_snapshot_id: ids.catalog }]],
  ])("fails closed when the current itinerary snapshot row is %s", async (_label, currentSnapshot) => {
    const { client, areaQuery } = clientDouble({ currentSnapshot });

    const result = await createSupabasePlannerRuntimeAdapter(client as never).recommend(itineraryFixture.request, "en", runtimeOperation);

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
    expect(areaQuery.select).not.toHaveBeenCalled();
    expect(client.functions.invoke).not.toHaveBeenCalled();
  });

  it.each(["read", "write"] as const)("fails closed without invoking an Edge function when sessionStorage %s throws", async (operation) => {
    const { client } = clientDouble();
    if (operation === "read") {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("storage blocked"); });
    } else {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage blocked"); });
    }

    const result = await createSupabasePlannerRuntimeAdapter(client as never).recommend(itineraryFixture.request, "en", runtimeOperation);

    expect(result).toMatchObject({ ok: false, error: { code: "SERVICE_UNAVAILABLE", retryable: true } });
    expect(client.functions.invoke).not.toHaveBeenCalled();
  });

  it("rejects an unknown gateway message key without exposing it to planner consumers", async () => {
    const { client } = clientDouble({ invoke: { data: wireResponse({ messageKey: "provider.private_detail" }), error: null } });
    const result = await createSupabasePlannerRuntimeAdapter(client as never).recommend(itineraryFixture.request, "en", runtimeOperation);

    expect(result).toMatchObject({ ok: false, error: { code: "SERVICE_UNAVAILABLE" } });
    expect(JSON.stringify(result)).not.toContain("provider.private_detail");
  });

  it("fails closed for duplicate or mixed-snapshot area rows and localized display rows", async () => {
    const duplicateAreas = clientDouble({
      areas: [
        { snapshot_id: ids.catalog, area_id: ids.areaOne, slug: "district-1" },
        { snapshot_id: ids.catalog, area_id: ids.areaOne, slug: "district-1" },
        { snapshot_id: ids.catalog, area_id: ids.areaTwo, slug: "district-5" },
      ],
    });
    await expect(createSupabasePlannerRuntimeAdapter(duplicateAreas.client as never).recommend(itineraryFixture.request, "en", runtimeOperation))
      .resolves.toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
    expect(duplicateAreas.client.functions.invoke).not.toHaveBeenCalled();

    const mixedSnapshotAreas = clientDouble({
      areas: [
        { snapshot_id: ids.catalog, area_id: ids.areaOne, slug: "district-1" },
        { snapshot_id: "88888888-8888-4888-8888-888888888888", area_id: ids.areaTwo, slug: "district-5" },
      ],
    });
    await expect(createSupabasePlannerRuntimeAdapter(mixedSnapshotAreas.client as never).recommend(itineraryFixture.request, "en", runtimeOperation))
      .resolves.toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
    expect(mixedSnapshotAreas.client.functions.invoke).not.toHaveBeenCalled();

    const duplicateDisplay = clientDouble({
      display: [
        { snapshot_id: ids.catalog, place_id: "place-one", locale: "en", title: "One", summary: "One." },
        { snapshot_id: ids.catalog, place_id: "place-one", locale: "en", title: "Again", summary: "Again." },
      ],
    });
    await expect(createSupabasePlannerRuntimeAdapter(duplicateDisplay.client as never).recommend(itineraryFixture.request, "en", runtimeOperation))
      .resolves.toMatchObject({ ok: false, error: { code: "SERVICE_UNAVAILABLE" } });
  });
});
