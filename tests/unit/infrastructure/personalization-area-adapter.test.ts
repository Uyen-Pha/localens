import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSupabasePersonalizationAreaAdapter,
  PersonalizationAreaError,
} from "@/lib/infrastructure/supabase/personalization-area-adapter";

const ids = {
  snapshot: "11111111-1111-4111-8111-111111111111",
  area: "22222222-2222-4222-8222-222222222222",
};

type QueryResponse = { data: unknown; error: unknown };

function queryDouble(response: QueryResponse) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    then: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.then.mockImplementation((resolve, reject) => Promise.resolve(response).then(resolve, reject));
  return query;
}

function clientDouble(overrides: {
  current?: QueryResponse;
  areas?: QueryResponse;
  translations?: QueryResponse;
} = {}) {
  const queries = {
    current: queryDouble(overrides.current ?? { data: [{ catalog_snapshot_id: ids.snapshot }], error: null }),
    areas: queryDouble(overrides.areas ?? {
      data: [{ snapshot_id: ids.snapshot, area_id: ids.area, slug: "synthetic-central-hcmc" }],
      error: null,
    }),
    translations: queryDouble(overrides.translations ?? {
      data: [{ snapshot_id: ids.snapshot, area_id: ids.area, locale: "en", name: "Catalog name" }],
      error: null,
    }),
  };
  const client = {
    from: vi.fn((relation: string) => {
      if (relation === "current_itinerary_snapshot_v") return queries.current;
      if (relation === "catalog_snapshot_areas_v") return queries.areas;
      if (relation === "catalog_snapshot_area_translations") return queries.translations;
      throw new Error(`unexpected relation ${relation}`);
    }),
  };
  return { client, queries };
}

describe("Supabase personalization area adapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads the one current published snapshot and returns a minimal localized option", async () => {
    const { client, queries } = clientDouble();

    await expect(createSupabasePersonalizationAreaAdapter(client as never).listAreas("en"))
      .resolves.toEqual([expect.objectContaining({
        value: "synthetic-central-hcmc",
        label: "Synthetic Central HCMC Demo Area",
        areaId: ids.area,
        snapshotId: ids.snapshot,
      })]);
    expect(client.from).toHaveBeenNthCalledWith(1, "current_itinerary_snapshot_v");
    expect(client.from).toHaveBeenNthCalledWith(2, "catalog_snapshot_areas_v");
    expect(client.from).toHaveBeenNthCalledWith(3, "catalog_snapshot_area_translations");
    expect(queries.areas.eq).toHaveBeenCalledWith("snapshot_id", ids.snapshot);
    expect(queries.translations.in).toHaveBeenCalledWith("area_id", [ids.area]);
  });

  it.each([
    ["RLS error", { areas: { data: null, error: { code: "42501", detail: "private" } } }, "SERVICE_UNAVAILABLE"],
    ["duplicate current snapshot", { current: { data: [{ catalog_snapshot_id: ids.snapshot }, { catalog_snapshot_id: ids.snapshot }], error: null } }, "SERVICE_UNAVAILABLE"],
    ["malformed translation", { translations: { data: [{ snapshot_id: ids.snapshot, area_id: ids.area, locale: "en", name: "" }], error: null } }, "INVALID_RESPONSE"],
  ] as const)("fails closed on %s", async (_label, overrides, code) => {
    const { client } = clientDouble(overrides);

    await expect(createSupabasePersonalizationAreaAdapter(client as never).listAreas("en"))
      .rejects.toMatchObject({ name: "PersonalizationAreaError", code });
    await expect(createSupabasePersonalizationAreaAdapter(client as never).listAreas("en"))
      .rejects.not.toThrow(/private|42501/i);
  });

  it("exposes only stable browser-safe error text", async () => {
    const error = new PersonalizationAreaError("INVALID_RESPONSE");
    expect(error.message).not.toMatch(/snapshot|area_id|private/i);
    expect(error.code).toBe("INVALID_RESPONSE");
  });
});
