// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  mapFxSnapshot,
  mapTravelSnapshot,
} from "@/lib/infrastructure/supabase/travel-fx-adapter";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260823093000_travel_fx_snapshots.sql"),
  "utf8",
);

const ids = {
  travel: "00000000-0000-0000-0000-000000000501",
  catalog: "00000000-0000-0000-0000-000000000502",
  from: "00000000-0000-0000-0000-000000000503",
  to: "00000000-0000-0000-0000-000000000504",
  other: "00000000-0000-0000-0000-000000000505",
};

function edge(overrides: Record<string, unknown> = {}) {
  return {
    snapshot_id: ids.travel,
    catalog_snapshot_id: ids.catalog,
    from_place_id: ids.from,
    to_place_id: ids.to,
    mode: "walk",
    minutes: 20,
    group_cost_vnd: "900719925474099",
    verified_at: "2026-08-23T03:00:00.000Z",
    ...overrides,
  };
}

function fx(overrides: Record<string, unknown> = {}) {
  return {
    id: ids.travel,
    vnd_per_usd: "25432.12000000",
    source: "https://example.invalid/fx",
    observed_at: "2026-08-23T03:00:00.000Z",
    environment: "demo",
    is_demo: true,
    ...overrides,
  };
}

describe("mapTravelSnapshot", () => {
  it("maps a named directed projection without inventing a reverse edge", () => {
    const result = mapTravelSnapshot([edge(), edge({
      from_place_id: ids.to,
      to_place_id: ids.from,
      mode: "taxi",
      minutes: 30,
    })]);

    expect(result).toEqual({
      ok: true,
      value: {
        id: ids.travel,
        edges: [
          {
            fromPlaceId: ids.from,
            toPlaceId: ids.to,
            mode: "walk",
            minutes: 20,
            groupCostVnd: 900719925474099,
            verifiedAt: "2026-08-23T03:00:00.000Z",
          },
          {
            fromPlaceId: ids.to,
            toPlaceId: ids.from,
            mode: "taxi",
            minutes: 30,
            groupCostVnd: 900719925474099,
            verifiedAt: "2026-08-23T03:00:00.000Z",
          },
        ],
      },
    });
  });

  it("preserves a sparse directed graph and never fills missing transitions", () => {
    const result = mapTravelSnapshot([edge({ to_place_id: ids.other })]);
    expect(result).toMatchObject({
      ok: true,
      value: { edges: [{ fromPlaceId: ids.from, toPlaceId: ids.other }] },
    });
    if (result.ok) expect(result.value.edges).toHaveLength(1);
  });

  it("rejects duplicate directed pairs, self edges, and mixed snapshot membership", () => {
    expect(mapTravelSnapshot([edge(), edge()])).toMatchObject({
      ok: false,
      error: { code: "SNAPSHOT_MISMATCH" },
    });
    expect(mapTravelSnapshot([edge({ from_place_id: ids.from, to_place_id: ids.from })])).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE" },
    });
    expect(mapTravelSnapshot([edge(), edge({ to_place_id: ids.other, catalog_snapshot_id: ids.other })])).toMatchObject({
      ok: false,
      error: { code: "SNAPSHOT_MISMATCH" },
    });
  });

  it("rejects unsafe, non-canonical, or out-of-range database values", () => {
    for (const value of [
      "1125899906842624",
      "0900719925474099",
      "+900719925474099",
      "900719925474099.0",
      "1e3",
      "9007199254740992",
    ]) {
      expect(mapTravelSnapshot([edge({ group_cost_vnd: value })])).toMatchObject({
        ok: false,
        error: { code: expect.stringMatching(/INVALID_DB_DECIMAL|UNSAFE_DB_INTEGER|INVALID_SHAPE/) },
      });
    }
    for (const value of [0, 241, 20.5, "20"]) {
      expect(mapTravelSnapshot([edge({ minutes: value })])).toMatchObject({
        ok: false,
        error: { code: "INVALID_SHAPE" },
      });
    }
  });

  it("rejects extra or missing projection fields and non-dense arrays", () => {
    expect(mapTravelSnapshot([edge({ unexpected: true })])).toMatchObject({
      ok: false,
      error: { code: "UNKNOWN_FIELD" },
    });
    expect(mapTravelSnapshot([edge({ catalog_snapshot_id: undefined })])).toMatchObject({
      ok: false,
      error: { code: "MISSING_FIELD" },
    });
    const sparse = [] as Array<unknown>;
    sparse.length = 1;
    expect(mapTravelSnapshot(sparse)).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE" },
    });
    expect(mapTravelSnapshot([edge({ verified_at: "2026-08-23T03:00:00+07:00" })])).toMatchObject({
      ok: false,
      error: { code: "INVALID_TIMESTAMP" },
    });
  });
});

describe("mapFxSnapshot", () => {
  it("preserves the exact numeric database decimal and maps the engine shape", () => {
    expect(mapFxSnapshot(fx())).toEqual({
      ok: true,
      value: {
        id: ids.travel,
        vndPerUsd: "25432.12000000",
        observedAtUtc: "2026-08-23T03:00:00.000Z",
      },
    });
  });

  it("accepts stale history as history while the published query owns freshness", () => {
    const result = mapFxSnapshot(fx({
      observed_at: "2025-01-01T00:00:00.000Z",
    }));
    expect(result).toMatchObject({ ok: true, value: { observedAtUtc: "2025-01-01T00:00:00.000Z" } });
  });

  it("rejects a future observation instead of exposing it as current FX", () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    expect(mapFxSnapshot(fx({ observed_at: tomorrow }))).toMatchObject({
      ok: false,
      error: { code: "INVALID_TIMESTAMP" },
    });
  });

  it("rejects non-positive, non-canonical, or over-precision FX decimals", () => {
    for (const value of ["0", "0.00000000", "1", "1.2", "01.2", "+1.2", "1e3", "1.123456789", "1234567890123.1"]) {
      expect(mapFxSnapshot(fx({ vnd_per_usd: value }))).toMatchObject({
        ok: false,
        error: { code: "INVALID_DB_DECIMAL" },
      });
    }
  });

  it("requires exact environment and demo-flag consistency", () => {
    expect(mapFxSnapshot(fx({ environment: "demo", is_demo: false }))).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE" },
    });
    expect(mapFxSnapshot(fx({ environment: "production", is_demo: true }))).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE" },
    });
    expect(mapFxSnapshot(fx({ environment: "sandbox", is_demo: false }))).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE" },
    });
  });

  it("rejects unknown/missing fields and malformed canonical timestamps", () => {
    expect(mapFxSnapshot(fx({ extra: true }))).toMatchObject({
      ok: false,
      error: { code: "UNKNOWN_FIELD" },
    });
    expect(mapFxSnapshot(fx({ observed_at: undefined }))).toMatchObject({
      ok: false,
      error: { code: "MISSING_FIELD" },
    });
    expect(mapFxSnapshot(fx({ observed_at: "2026-08-23 03:00:00+00" }))).toMatchObject({
      ok: false,
      error: { code: "INVALID_TIMESTAMP" },
    });
  });
});

describe("travel/FX migration contract", () => {
  it("declares directed edge bounds and exact snapshot membership", () => {
    expect(migration).toMatch(/CREATE TABLE public\.travel_edges[\s\S]*CHECK \(from_place_id <> to_place_id\)/);
    expect(migration).toMatch(/mode text NOT NULL CHECK \(mode IN \('walk', 'taxi', 'public_transport'\)\)/);
    expect(migration).toMatch(/minutes smallint NOT NULL CHECK \(minutes BETWEEN 1 AND 240\)/);
    expect(migration).toMatch(/group_cost_vnd bigint NOT NULL CHECK \(group_cost_vnd BETWEEN 0 AND 1125899906842623\)/);
    expect(migration).toMatch(/FOREIGN KEY \(catalog_snapshot_id, from_place_id\)\s+REFERENCES public\.catalog_snapshot_places\(snapshot_id, place_id\)/);
    expect(migration).toMatch(/FOREIGN KEY \(catalog_snapshot_id, to_place_id\)\s+REFERENCES public\.catalog_snapshot_places\(snapshot_id, place_id\)/);
    expect(migration).toMatch(/UNIQUE \(snapshot_id, from_place_id, to_place_id\)/);
  });

  it("uses fixed-order source locks, append-only guards, named projections, and seven-day FX freshness", () => {
    const lockOrder = [
      "areas", "area_translations", "places", "place_translations",
      "place_experience_types", "place_guide_languages", "place_supports",
      "place_opening_hours", "place_opening_exceptions", "place_opening_exception_windows",
      "travel_edges",
    ].map((table) => migration.indexOf(`LOCK TABLE public.${table} IN SHARE ROW EXCLUSIVE MODE`));
    expect(lockOrder.every((position) => position >= 0)).toBe(true);
    expect(lockOrder).toEqual([...lockOrder].sort((left, right) => left - right));
    expect(migration).toMatch(/CREATE TRIGGER travel_snapshots_append_only/);
    expect(migration).toMatch(/CREATE TRIGGER travel_snapshots_building_insert_guard/);
    expect(migration).toMatch(/CREATE TRIGGER travel_snapshot_edges_building_insert_guard/);
    expect(migration).toMatch(/CREATE TRIGGER travel_snapshot_edges_append_only/);
    expect(migration).toMatch(/CREATE TRIGGER fx_snapshots_append_only/);
    expect(migration).toMatch(/SELECT status INTO parent_status[\s\S]*FOR SHARE/);
    expect(migration).toMatch(/CREATE OR REPLACE VIEW public\.travel_snapshot_edges_v/);
    expect(migration).toMatch(/CREATE OR REPLACE VIEW public\.latest_fx_snapshot_v/);
    expect(migration).toMatch(/observed_at\s*>=\s*pg_catalog\.now\(\)\s*-\s*INTERVAL '7 days'/i);
    expect(migration).toMatch(/observed_at\s*<=\s*pg_catalog\.now\(\)/i);
    expect(migration).toMatch(/WHERE EXISTS \([\s\S]*SELECT 1[\s\S]*FROM public\.catalog_snapshot_places/);
    expect(migration).not.toMatch(/source_edge_id uuid NOT NULL REFERENCES public\.travel_edges/);
    expect(migration).toMatch(/REVOKE ALL ON TABLE[\s\S]*public\.travel_edges[\s\S]*FROM PUBLIC, anon, authenticated/);
    expect(migration).toMatch(/GRANT SELECT ON public\.travel_snapshot_edges_v TO anon, authenticated/);
    expect(migration).toMatch(/GRANT SELECT ON public\.latest_fx_snapshot_v TO anon, authenticated/);
  });
});
