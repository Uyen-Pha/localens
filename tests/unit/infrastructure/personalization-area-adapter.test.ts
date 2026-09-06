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
    then: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.then.mockImplementation((resolve, reject) => Promise.resolve(response).then(resolve, reject));
  return query;
}

function clientDouble(overrides: {
  current?: QueryResponse;
  areas?: QueryResponse;
} = {}) {
  const queries = {
    current: queryDouble(overrides.current ?? { data: [{ catalog_snapshot_id: ids.snapshot }], error: null }),
    areas: queryDouble(overrides.areas ?? {
      data: [{ snapshot_id: ids.snapshot, area_id: ids.area, slug: "synthetic-central-hcmc" }],
      error: null,
    }),
  };
  const client = {
    from: vi.fn((relation: string) => {
      if (relation === "current_itinerary_snapshot_v") return queries.current;
      if (relation === "catalog_snapshot_areas_v") return queries.areas;
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
    expect(client.from).not.toHaveBeenCalledWith("catalog_snapshot_area_translations");
    expect(queries.areas.eq).toHaveBeenCalledWith("snapshot_id", ids.snapshot);
  });

  it("labels a known canonical geography slug without reading translation tables", async () => {
    const { client } = clientDouble({
      areas: {
        data: [{ snapshot_id: ids.snapshot, area_id: ids.area, slug: "central-historical" }],
        error: null,
      },
    });

    await expect(createSupabasePersonalizationAreaAdapter(client as never).listAreas("vi"))
      .resolves.toEqual([expect.objectContaining({
        value: "central-historical",
        label: "Quận 1 & trung tâm",
      })]);
    expect(client.from).toHaveBeenCalledTimes(2);
    expect(client.from).not.toHaveBeenCalledWith("catalog_snapshot_area_translations");
  });

  it.each([
    ["RLS error", { areas: { data: null, error: { code: "42501", detail: "private" } } }, "SERVICE_UNAVAILABLE"],
    ["duplicate current snapshot", { current: { data: [{ catalog_snapshot_id: ids.snapshot }, { catalog_snapshot_id: ids.snapshot }], error: null } }, "SERVICE_UNAVAILABLE"],
    ["unknown area slug", { areas: { data: [{ snapshot_id: ids.snapshot, area_id: ids.area, slug: "unpublished-area" }], error: null } }, "INVALID_RESPONSE"],
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
