// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { recommendItinerary } from "@/lib/application/itinerary/recommend";
import type {
  EngineInput,
  ItineraryRequest,
  ItineraryResult,
} from "@/lib/domain/itinerary/contracts";
import { fingerprintRevisionBinding } from "@/lib/domain/itinerary/fingerprint";
import {
  createSupabaseRecommendAdapter,
  createSupabaseRefineAdapter,
  type SupabaseItineraryAdapterConfig,
  type SupabaseItineraryClient,
} from "@/supabase/functions/_shared/supabase-itinerary-adapter";

const ids = {
  user: "10000000-0000-4000-8000-000000000001",
  quotaPlanner: "20000000-0000-4000-8000-000000000001",
  quotaGemini: "20000000-0000-4000-8000-000000000002",
  plan: "30000000-0000-4000-8000-000000000001",
  revision: "40000000-0000-4000-8000-000000000001",
  catalog: "50000000-0000-4000-8000-000000000001",
  area: "60000000-0000-4000-8000-000000000001",
  place: "70000000-0000-4000-8000-000000000001",
  vendor: "70000000-0000-4000-8000-000000000002",
  menuItem: "70000000-0000-4000-8000-000000000003",
  travel: "80000000-0000-4000-8000-000000000001",
  fx: "90000000-0000-4000-8000-000000000001",
} as const;

const itineraryRequest: ItineraryRequest = {
  startAt: "2026-09-05T01:00:00Z",
  durationMinutes: 120,
  areas: [ids.area],
  budget: { currency: "VND", amountMinor: 500_000 },
  partySize: 2,
  guideLanguage: "vi",
  priorityWeights: {
    street_food: 0,
    history: 5,
    traditional_craft: 0,
    traditional_market: 0,
  },
  pace: "balanced",
  dietaryRequirements: [],
  mobilityRequirements: [],
  lockedStopIds: [],
};

const currentSnapshotRow = {
  catalog_snapshot_id: ids.catalog,
  travel_snapshot_id: ids.travel,
  travel_published_at: "2026-09-04T01:00:00.000Z",
  fx_snapshot_id: null,
  fx_vnd_per_usd: null,
  fx_source: null,
  fx_observed_at: null,
  fx_environment: null,
  fx_is_demo: null,
};

const areaRow = {
  snapshot_id: ids.catalog,
  area_id: ids.area,
  slug: "district-1",
};

const placeRow = {
  snapshot_id: ids.catalog,
  place_id: ids.place,
  area_id: ids.area,
  price_vnd_per_person: "100000",
  visit_duration_minutes: 60,
  experience_types: ["history"],
  guide_languages: ["vi"],
  dietary_support: {},
  mobility_support: {},
  opening_hours: [{ weekday: 6, opens_at: "08:00:00", closes_at: "18:00:00" }],
  opening_exceptions: [],
};

const travelRow = {
  snapshot_id: ids.travel,
  catalog_snapshot_id: ids.catalog,
  edges: [],
};

const foodVendorRow = {
  snapshot_id: ids.catalog,
  place_id: ids.place,
  vendor_id: ids.vendor,
  slug: "history-cafe",
  title: { en: "History cafe", vi: "Quán lịch sử" },
  description: { en: "A verified cafe.", vi: "Một quán đã xác minh." },
  location_note: "Ground floor",
  service_type: "shop",
  capacity_note: "Small groups",
  dietary_support: {},
  mobility_support: {},
  opening_hours: [{ weekday: 6, opens_at: "08:00:00", closes_at: "18:00:00" }],
  opening_exceptions: [],
  status: "published",
  verified_at: "2026-09-04",
};

const foodItemRow = {
  snapshot_id: ids.catalog,
  place_id: ids.place,
  vendor_id: ids.vendor,
  item_id: ids.menuItem,
  slug: "iced-tea",
  title: { en: "Iced tea", vi: "Trà đá" },
  description: { en: "A cold drink.", vi: "Một thức uống lạnh." },
  serving_unit: "drink",
  price_vnd_min: "10000",
  price_vnd_max: "10000",
  portion_description: "One glass",
  dietary_support: {},
  allergens: [],
  available: true,
  status: "published",
  verified_at: "2026-09-04",
};

type DbResult = { data: unknown; error: unknown };
type QueryCall = {
  table: string;
  columns: string | null;
  filters: Array<[string, unknown]>;
  order: { column: string; ascending: boolean } | null;
  limit: number | null;
};

class FakeQuery {
  private readonly call: QueryCall;

  constructor(
    private readonly owner: FakeClient,
    table: string,
  ) {
    this.call = { table, columns: null, filters: [], order: null, limit: null };
  }

  select(columns: string) {
    this.call.columns = columns;
    return this;
  }

  eq(column: string, value: unknown) {
    this.call.filters.push([column, value]);
    return this;
  }

  order(column: string, options: { ascending: boolean }) {
    this.call.order = { column, ascending: options.ascending };
    return this;
  }

  limit(value: number) {
    this.call.limit = value;
    return this;
  }

  then<TResult1 = DbResult, TResult2 = never>(
    onfulfilled?: ((value: DbResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.owner.resolve(this.call)).then(onfulfilled, onrejected);
  }
}

class FakeClient {
  readonly events: string[] = [];
  readonly queryCalls: QueryCall[] = [];
  readonly tables: Record<string, unknown[]>;
  readonly auth = {
    getUser: vi.fn(async (token: string) => {
      void token;
      this.events.push("auth.getUser");
      return { data: { user: { id: ids.user } }, error: null };
    }),
  };
  rpcImpl: (name: string, args?: Record<string, unknown>) => Promise<DbResult>;
  readonly rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    this.events.push(`rpc:${name}`);
    return this.rpcImpl(name, args);
  });
  readonly from = vi.fn((table: string) => {
    this.events.push(`from:${table}`);
    return new FakeQuery(this, table);
  });

  constructor(overrides: Record<string, unknown[]> = {}) {
    this.tables = {
      current_itinerary_snapshot_v: [currentSnapshotRow],
      catalog_snapshot_areas_v: [areaRow],
      catalog_snapshot_places_v: [placeRow],
      catalog_snapshot_food_vendors_v: [foodVendorRow],
      catalog_snapshot_food_items_v: [foodItemRow],
      travel_snapshots_v: [travelRow],
      itinerary_travel_snapshot_history_v: [{
        travel_snapshot_id: ids.travel,
        catalog_snapshot_id: ids.catalog,
        travel_published_at: currentSnapshotRow.travel_published_at,
      }],
      itinerary_fx_snapshot_history_v: [],
      travel_snapshots: [{
        id: ids.travel,
        catalog_snapshot_id: ids.catalog,
        published_at: currentSnapshotRow.travel_published_at,
        status: "published",
      }],
      ...overrides,
    };
    this.rpcImpl = async (name, args) => {
      if (name === "get_portal_identity") {
        return {
          data: [{ user_id: ids.user, display_name: "Demo Customer", role: "customer", language: "vi" }],
          error: null,
        };
      }
      if (name === "reserve_ai_quota") {
        return {
          data: [{
            reservation_id: args?.p_reservation_id,
            kind: args?.p_kind,
            bucket_hashes: [args?.p_ip_hash, args?.p_device_hash],
            period_start: "2026-09-04T01:00:00.000Z",
            state: "created",
          }],
          error: null,
        };
      }
      if (name === "create_authenticated_trip_plan") {
        return { data: [{ plan_id: args?.p_plan_id, revision_no: 1 }], error: null };
      }
      if (name === "advance_authenticated_trip_plan_revision") {
        return { data: [{ revision_id: ids.revision, revision_no: 2 }], error: null };
      }
      return { data: null, error: { code: "UNEXPECTED_RPC" } };
    };
  }

  resolve(call: QueryCall): DbResult {
    this.queryCalls.push(structuredClone(call));
    const source = this.tables[call.table];
    if (source === undefined) return { data: null, error: { code: "UNKNOWN_TABLE" } };
    let rows = structuredClone(source) as Array<Record<string, unknown>>;
    for (const [column, value] of call.filters) {
      rows = rows.filter((row) => row[column] === value);
    }
    if (call.order !== null) {
      const { column, ascending } = call.order;
      rows.sort((left, right) => {
        const comparison = String(left[column]).localeCompare(String(right[column]));
        return ascending ? comparison : -comparison;
      });
    }
    if (call.limit !== null) rows = rows.slice(0, call.limit);
    return { data: rows, error: null };
  }

  asClient(): SupabaseItineraryClient {
    return this as unknown as SupabaseItineraryClient;
  }
}

function request(headers: Record<string, string> = {}) {
  return new Request("https://functions.example/recommend-itinerary", {
    headers: {
      Authorization: "Bearer signed-access-token",
      "x-forwarded-for": " 203.0.113.7 , 10.0.0.2",
      "x-localens-device-id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      ...headers,
    },
  });
}

function uuidFactory(...values: string[]) {
  const fallback = values.at(-1) ?? ids.quotaPlanner;
  return vi.fn(() => values.shift() ?? fallback);
}

function config(
  userClient: FakeClient,
  serviceClient: FakeClient,
  overrides: Partial<SupabaseItineraryAdapterConfig> = {},
): SupabaseItineraryAdapterConfig {
  return {
    userClient: userClient.asClient(),
    serviceClient: serviceClient.asClient(),
    quotaHmacKey: "localens-test-quota-key-32-bytes-minimum",
    geminiEnabled: true,
    geminiApiKey: "gemini-test-key",
    randomUuid: uuidFactory(ids.quotaPlanner, ids.quotaGemini, ids.plan),
    ...overrides,
  };
}

async function resolveInput(
  adapter: ReturnType<typeof createSupabaseRecommendAdapter>,
  principal = { userId: ids.user },
) {
  return adapter.resolveEngineInput(itineraryRequest, {
    correlationId: "a0000000-0000-4000-8000-000000000001",
    principal,
    guestToken: null,
    turnstileToken: null,
  });
}

async function deterministicResult(input: EngineInput): Promise<ItineraryResult> {
  const recommendation = await recommendItinerary(input);
  expect(recommendation.ok).toBe(true);
  if (!recommendation.ok) throw new Error("fixture did not produce an itinerary");
  return recommendation.value.result;
}

function sha256(bytes: Uint8Array) {
  return globalThis.crypto.subtle
    .digest("SHA-256", bytes.buffer as ArrayBuffer)
    .then((value) => new Uint8Array(value));
}

describe("Supabase itinerary adapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("verifies the bearer token and customer identity without returning the token", async () => {
    const user = new FakeClient();
    const service = new FakeClient();
    const adapter = createSupabaseRecommendAdapter(config(user, service), request());

    const result = await adapter.verifyAccessToken("signed-access-token", "correlation-id");

    expect(user.auth.getUser).toHaveBeenCalledWith("signed-access-token");
    expect(user.rpc).toHaveBeenCalledWith("get_portal_identity");
    expect(result).toEqual({ ok: true, principal: { userId: ids.user } });
    expect(JSON.stringify(result)).not.toContain("signed-access-token");
  });

  it("rejects missing or non-customer principals before any snapshot read", async () => {
    const user = new FakeClient();
    const service = new FakeClient();
    user.rpcImpl = async (name) => name === "get_portal_identity"
      ? { data: [{ user_id: ids.user, display_name: "Guide", role: "guide", language: "vi" }], error: null }
      : { data: null, error: { code: "UNEXPECTED" } };
    const adapter = createSupabaseRecommendAdapter(config(user, service), request());

    await expect(adapter.verifyAccessToken("signed-access-token", "correlation-id"))
      .resolves.toEqual({ ok: false, error: { code: "AUTH_INVALID" } });
    await expect(resolveInput(adapter, null as never))
      .resolves.toEqual({ ok: false, error: { code: "AUTH_REQUIRED" } });
    expect(user.from).not.toHaveBeenCalled();
  });

  it("loads one current bundle first, filters every projection, and returns strict mapped input", async () => {
    const user = new FakeClient();
    const service = new FakeClient();
    const adapter = createSupabaseRecommendAdapter(config(user, service), request());

    const result = await resolveInput(adapter);

    expect(result).toMatchObject({
      ok: true,
      input: {
        request: itineraryRequest,
        catalog: {
          id: ids.catalog,
          places: [{
            id: ids.place,
            areaId: ids.area,
            foodVendors: [{ id: ids.vendor, menuItems: [{ id: ids.menuItem }] }],
          }],
        },
        travel: { id: ids.travel, edges: [] },
        asOfUtc: currentSnapshotRow.travel_published_at,
      },
    });
    expect(user.events[0]).toBe("from:current_itinerary_snapshot_v");
    expect(user.queryCalls.find((call) => call.table === "catalog_snapshot_places_v")?.filters)
      .toContainEqual(["snapshot_id", ids.catalog]);
    expect(user.queryCalls.find((call) => call.table === "travel_snapshots_v")?.filters)
      .toEqual(expect.arrayContaining([
        ["snapshot_id", ids.travel],
        ["catalog_snapshot_id", ids.catalog],
      ]));
    expect(service.rpc).toHaveBeenCalledWith("reserve_ai_quota", expect.objectContaining({
      p_kind: "planner",
      p_ip_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_device_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
    expect(JSON.stringify(service.rpc.mock.calls)).not.toContain("203.0.113.7");
    expect(JSON.stringify(service.rpc.mock.calls)).not.toContain("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("maps the current production FX row for USD budgets", async () => {
    const fxCurrent = {
      ...currentSnapshotRow,
      fx_snapshot_id: ids.fx,
      fx_vnd_per_usd: "25000.00000000",
      fx_source: "https://example.invalid/fx",
      fx_observed_at: "2026-09-04T00:00:00.000Z",
      fx_environment: "production",
      fx_is_demo: false,
    };
    const user = new FakeClient({ current_itinerary_snapshot_v: [fxCurrent] });
    const service = new FakeClient();
    const adapter = createSupabaseRecommendAdapter(config(user, service), request());
    const usdRequest: ItineraryRequest = {
      ...itineraryRequest,
      budget: { currency: "USD", amountMinor: 2_000 },
    };

    const result = await adapter.resolveEngineInput(usdRequest, {
      correlationId: "a0000000-0000-4000-8000-000000000001",
      principal: { userId: ids.user },
      guestToken: null,
      turnstileToken: null,
    });

    expect(result).toMatchObject({
      ok: true,
      input: {
        fx: {
          id: ids.fx,
          vndPerUsd: "25000.00000000",
          observedAtUtc: "2026-09-04T00:00:00.000Z",
        },
      },
    });
  });

  it("rejects duplicate current bundles and request areas outside the current catalog", async () => {
    const duplicateUser = new FakeClient({
      current_itinerary_snapshot_v: [currentSnapshotRow, currentSnapshotRow],
    });
    const duplicateAdapter = createSupabaseRecommendAdapter(
      config(duplicateUser, new FakeClient()),
      request(),
    );
    await expect(resolveInput(duplicateAdapter)).resolves.toEqual({
      ok: false,
      error: { code: "CATALOG_UNAVAILABLE" },
    });
    expect(duplicateUser.from).toHaveBeenCalledTimes(1);

    const areaUser = new FakeClient({ catalog_snapshot_areas_v: [] });
    const areaAdapter = createSupabaseRecommendAdapter(config(areaUser, new FakeClient()), request());
    await expect(resolveInput(areaAdapter)).resolves.toEqual({
      ok: false,
      error: { code: "CATALOG_UNAVAILABLE" },
    });
    expect(areaUser.from).not.toHaveBeenCalledWith("catalog_snapshot_places_v");
  });

  it("fails closed on a missing device identifier before snapshots or quota", async () => {
    const user = new FakeClient();
    const service = new FakeClient();
    const headers = new Headers(request().headers);
    headers.delete("x-localens-device-id");
    const adapter = createSupabaseRecommendAdapter(
      config(user, service),
      new Request("https://functions.example/recommend-itinerary", { headers }),
    );

    await expect(resolveInput(adapter)).resolves.toEqual({
      ok: false,
      error: { code: "CHALLENGE_REQUIRED" },
    });
    expect(user.from).not.toHaveBeenCalled();
    expect(service.rpc).not.toHaveBeenCalled();
  });

  it("maps planner quota rejection to QUOTA_EXCEEDED", async () => {
    const user = new FakeClient();
    const service = new FakeClient();
    service.rpcImpl = async () => ({ data: null, error: { code: "P0001", message: "quota exceeded" } });
    const adapter = createSupabaseRecommendAdapter(config(user, service), request());

    await expect(resolveInput(adapter)).resolves.toEqual({
      ok: false,
      error: { code: "QUOTA_EXCEEDED" },
    });
    expect(user.queryCalls.map((call) => call.table)).toEqual(["current_itinerary_snapshot_v"]);
  });

  it("reserves Gemini quota inside the ranker so rejection degrades without a provider call", async () => {
    const user = new FakeClient();
    const service = new FakeClient();
    let quotaCalls = 0;
    service.rpcImpl = async (name, args) => {
      if (name !== "reserve_ai_quota") return { data: null, error: { code: "UNEXPECTED" } };
      quotaCalls += 1;
      if (args?.p_kind === "gemini") return { data: null, error: { code: "P0001" } };
      return {
        data: [{
          reservation_id: args?.p_reservation_id,
          kind: args?.p_kind,
          bucket_hashes: [args?.p_ip_hash, args?.p_device_hash],
          period_start: "2026-09-04T01:00:00.000Z",
          state: "created",
        }],
        error: null,
      };
    };
    const provider = vi.fn<typeof fetch>();
    const adapter = createSupabaseRecommendAdapter(
      config(user, service, { fetchImpl: provider }),
      request(),
    );
    const resolved = await resolveInput(adapter);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    const recommendation = await recommendItinerary(resolved.input, { ranker: adapter.ranker });

    expect(recommendation).toMatchObject({
      ok: true,
      value: { degraded: true, result: { rankingSource: "deterministic" } },
    });
    expect(quotaCalls).toBe(2);
    expect(provider).not.toHaveBeenCalled();
  });

  it("generates a plan id before fingerprinting and persists revision one through the authenticated RPC", async () => {
    const user = new FakeClient();
    const service = new FakeClient();
    const randomUuid = uuidFactory(ids.quotaPlanner, ids.plan);
    const adapter = createSupabaseRecommendAdapter(
      config(user, service, { randomUuid, geminiEnabled: false, geminiApiKey: undefined }),
      request(),
    );
    const resolved = await resolveInput(adapter);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const result = await deterministicResult(resolved.input as EngineInput);

    await expect(adapter.commitRecommendation({ input: resolved.input as EngineInput, result }, {
      correlationId: "a0000000-0000-4000-8000-000000000001",
      principal: { userId: ids.user },
      guestToken: null,
      turnstileToken: null,
    })).resolves.toEqual({ ok: true, planId: ids.plan, revision: 1 });

    const call = user.rpc.mock.calls.find(([name]) => name === "create_authenticated_trip_plan");
    expect(call?.[1]).toMatchObject({ p_plan_id: ids.plan });
    const dto = (call?.[1] as { persistence_dto: { fingerprint: string } }).persistence_dto;
    await expect(fingerprintRevisionBinding(ids.plan, 1, resolved.input as EngineInput, result, sha256))
      .resolves.toBe(dto.fingerprint);
  });

  it("loads the owner-visible latest revision, normalizes PostgREST timestamps, and exposes stable lock item IDs", async () => {
    const user = new FakeClient();
    const service = new FakeClient({ travel_snapshots: [] });
    const recommendAdapter = createSupabaseRecommendAdapter(
      config(user, service, { geminiEnabled: false, geminiApiKey: undefined }),
      request(),
    );
    const resolved = await resolveInput(recommendAdapter);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const engineInput = resolved.input as EngineInput;
    const result = await deterministicResult(engineInput);
    const fingerprint = await fingerprintRevisionBinding(ids.plan, 1, engineInput, result, sha256);
    user.tables.trip_plans = [{ id: ids.plan, latest_revision_no: 1 }];
    user.tables.trip_plan_revisions = [{
      id: ids.revision,
      plan_id: ids.plan,
      revision_no: 1,
      fingerprint,
      catalog_snapshot_id: ids.catalog,
      travel_snapshot_id: ids.travel,
      fx_snapshot_id: null,
      request_json: itineraryRequest,
      result_json: result,
      created_at: currentSnapshotRow.travel_published_at,
    }];
    user.tables.trip_plan_items = result.items.map((item, index) => ({
      revision_id: ids.revision,
      position: index + 1,
      place_id: item.placeId,
      start_at: new Date(item.startAt).toISOString(),
      end_at: new Date(item.endAt).toISOString(),
      visit_duration_minutes: item.visitDurationMinutes,
    }));
    service.events.length = 0;
    service.queryCalls.length = 0;
    service.rpc.mockClear();
    const refineAdapter = createSupabaseRefineAdapter(
      config(user, service, {
        geminiEnabled: false,
        geminiApiKey: undefined,
        randomUuid: uuidFactory(ids.quotaPlanner),
      }),
      request(),
    );

    const prepared = await refineAdapter.prepareRefinement({
      planId: ids.plan,
      baseRevision: 1,
      delta: { feedback: "Chậm hơn", scope: "partial" },
      lockedItemIds: [ids.place],
    }, {
      correlationId: "a0000000-0000-4000-8000-000000000001",
      principal: { userId: ids.user },
      guestCapability: null,
    });

    expect(prepared).toMatchObject({
      ok: true,
      planId: ids.plan,
      currentRevision: 1,
      previousRevision: {
        items: [{ itemId: ids.place, placeId: ids.place, position: 1 }],
        lockedItems: [{ itemId: ids.place, placeId: ids.place, position: 1 }],
      },
    });
    expect(user.queryCalls.find((call) => call.table === "trip_plans")?.filters)
      .toContainEqual(["id", ids.plan]);
    expect(user.queryCalls.find((call) => call.table === "trip_plan_revisions")?.filters)
      .toEqual(expect.arrayContaining([["plan_id", ids.plan], ["revision_no", 1]]));
    expect(service.events[0]).toBe("rpc:reserve_ai_quota");
    expect(user.events).toContain("from:itinerary_travel_snapshot_history_v");
    expect(service.events).not.toContain("from:travel_snapshots");
  });

  it("commits refinement by CAS and redacts stale PostgreSQL errors", async () => {
    const user = new FakeClient();
    const service = new FakeClient();
    const adapter = createSupabaseRefineAdapter(
      config(user, service, { geminiEnabled: false, geminiApiKey: undefined }),
      request(),
    );
    const engineInput: EngineInput = {
      request: itineraryRequest,
      catalog: {
        id: ids.catalog,
        places: [{
          id: ids.place,
          areaId: ids.area,
          types: ["history"],
          priceVndPerPerson: 100_000,
          visitDurationMinutes: 60,
          guideLanguages: ["vi"],
          dietarySupport: {},
          mobilitySupport: {},
          openingHours: [{ weekday: 6, opensAt: "08:00", closesAt: "18:00" }],
          openingExceptions: [],
          foodVendors: [],
        }],
      },
      travel: { id: ids.travel, edges: [] },
      asOfUtc: currentSnapshotRow.travel_published_at,
    };
    const result = await deterministicResult(engineInput);
    const previousRevision = {
      planId: ids.plan,
      revision: 1,
      fingerprint: await fingerprintRevisionBinding(ids.plan, 1, engineInput, result, sha256),
      catalogSnapshotId: ids.catalog,
      travelSnapshotId: ids.travel,
      fxSnapshotId: null,
      authoritativeInput: engineInput,
      authoritativeResult: result,
      items: result.items.map((item, index) => ({ ...item, itemId: item.placeId, position: index + 1 })),
      lockedItems: [{
        itemId: ids.place,
        placeId: ids.place,
        position: 1,
        startAt: result.items[0]!.startAt,
        endAt: result.items[0]!.endAt,
        visitDurationMinutes: result.items[0]!.visitDurationMinutes,
      }],
    };

    const commitInput: Parameters<typeof adapter.commitRefinement>[0] = {
      planId: ids.plan,
      baseRevision: 1,
      lockedItemIds: [ids.place],
      normalizedDelta: { feedback: "Chậm hơn", scope: "partial" },
      previousRevision,
      scope: "partial",
      result,
    };
    const context = {
      correlationId: "a0000000-0000-4000-8000-000000000001",
      principal: { userId: ids.user },
      guestCapability: null,
    };

    await expect(adapter.commitRefinement(commitInput, context))
      .resolves.toEqual({ ok: true, revision: 2 });

    expect(user.rpc).toHaveBeenCalledWith("advance_authenticated_trip_plan_revision", expect.objectContaining({
      plan_id: ids.plan,
      base_revision_no: 1,
      persistence_dto: expect.objectContaining({ revisionNo: 2, lockedPlaceIds: [ids.place] }),
    }));
    const casCall = user.rpc.mock.calls.find(([name]) => name === "advance_authenticated_trip_plan_revision");
    const casDto = (casCall?.[1] as { persistence_dto: { fingerprint: string } }).persistence_dto;
    const lockedEngineInput: EngineInput = {
      ...engineInput,
      request: { ...engineInput.request, lockedStopIds: [ids.place] },
    };
    await expect(fingerprintRevisionBinding(ids.plan, 2, lockedEngineInput, result, sha256))
      .resolves.toBe(casDto.fingerprint);

    user.rpcImpl = async (name) => name === "advance_authenticated_trip_plan_revision"
      ? { data: null, error: { code: "P0001", message: "stale revision SQL detail" } }
      : { data: null, error: { code: "UNEXPECTED" } };
    const stale = await adapter.commitRefinement(commitInput, context);
    expect(stale).toEqual({ ok: false, error: { code: "STALE_REVISION" } });
    expect(JSON.stringify(stale)).not.toContain("SQL");
  });
});
