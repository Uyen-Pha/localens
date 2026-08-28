// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { mapCatalogSnapshot } from "@/lib/infrastructure/supabase/catalog-adapter";

const opening = (weekday = 1, opensAt = "08:00:00", closesAt = "18:00:00") => ({
  weekday,
  opens_at: opensAt,
  closes_at: closesAt,
});

const exception = {
  local_date: "2026-09-02",
  closed: false,
  windows: [{ opens_at: "09:00:00", closes_at: "12:00:00" }],
};

const catalogMigration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260823092000_catalog_snapshots.sql"),
  "utf8",
);

function row(overrides: Record<string, unknown> = {}) {
  return {
    snapshot_id: "00000000-0000-0000-0000-000000000501",
    place_id: "00000000-0000-0000-0000-000000000502",
    area_id: "00000000-0000-0000-0000-000000000503",
    price_vnd_per_person: "125000",
    visit_duration_minutes: 90,
    experience_types: ["street_food", "history"],
    guide_languages: ["en"],
    dietary_support: { halal: "unknown" },
    mobility_support: { "step-free": "unsupported" },
    opening_hours: [opening()],
    opening_exceptions: [exception],
    ...overrides,
  };
}

describe("mapCatalogSnapshot", () => {
  it("maps the exact PostgREST projection to the engine catalog without inventing facts", () => {
    const result = mapCatalogSnapshot([row()]);

    expect(result).toEqual({
      ok: true,
      value: {
        id: "00000000-0000-0000-0000-000000000501",
        places: [{
          id: "00000000-0000-0000-0000-000000000502",
          areaId: "00000000-0000-0000-0000-000000000503",
          types: ["street_food", "history"],
          priceVndPerPerson: 125000,
          visitDurationMinutes: 90,
          guideLanguages: ["en"],
          dietarySupport: { halal: "unknown" },
          mobilitySupport: { "step-free": "unsupported" },
          openingHours: [{ weekday: 1, opensAt: "08:00", closesAt: "18:00" }],
          openingExceptions: [{
            localDate: "2026-09-02",
            closed: false,
            windows: [{ opensAt: "09:00", closesAt: "12:00" }],
          }],
          foodVendors: [],
        }],
      },
    });
  });

  it("accepts overnight HCMC local facts without attaching a fake timezone", () => {
    const result = mapCatalogSnapshot([row({
      opening_hours: [opening(6, "22:00:00", "02:00:00")],
      opening_exceptions: [{ local_date: "2026-09-03", closed: true, windows: [] }],
    })]);

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        places: [expect.objectContaining({
          openingHours: [{ weekday: 6, opensAt: "22:00", closesAt: "02:00" }],
          openingExceptions: [{ localDate: "2026-09-03", closed: true, windows: [] }],
        })],
      }),
    });
  });

  it("rejects extra or missing projection fields", () => {
    for (const input of [
      [row({ unexpected: true })],
      [row({ area_id: undefined })],
    ]) {
      const result = mapCatalogSnapshot(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(["UNKNOWN_FIELD", "MISSING_FIELD"]).toContain(result.error.code);
    }
  });

  it("rejects duplicate places and mixed snapshot IDs instead of merging unrelated facts", () => {
    const duplicate = mapCatalogSnapshot([row(), row({ place_id: "00000000-0000-0000-0000-000000000502" })]);
    const mixed = mapCatalogSnapshot([row(), row({ place_id: "00000000-0000-0000-0000-000000000504", snapshot_id: "00000000-0000-0000-0000-000000000505" })]);

    expect(duplicate).toMatchObject({ ok: false, error: { code: "SNAPSHOT_MISMATCH" } });
    expect(mixed).toMatchObject({ ok: false, error: { code: "SNAPSHOT_MISMATCH" } });
  });

  it("requires canonical safe decimal-string money and never accepts a client number", () => {
    for (const price of [125000, "0125000", "+125000", "125000.0", "1e3", "9007199254740992"]) {
      const result = mapCatalogSnapshot([row({ price_vnd_per_person: price })]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(["INVALID_DB_DECIMAL", "UNSAFE_DB_INTEGER"]).toContain(result.error.code);
    }
  });

  it("rejects non-dense child arrays and timezone-bearing opening facts", () => {
    const sparse = [] as Array<unknown>;
    sparse.length = 1;
    sparse[0] = opening();
    delete sparse[0];

    expect(mapCatalogSnapshot([row({ opening_hours: sparse })])).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE" },
    });
    expect(mapCatalogSnapshot([row({ opening_hours: [opening(1, "08:00:00+07:00", "18:00:00")] })])).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE" },
    });
  });

  it("rejects non-UUID snapshot, place, and area identifiers", () => {
    for (const field of ["snapshot_id", "place_id", "area_id"] as const) {
      expect(mapCatalogSnapshot([row({ [field]: "place-1" })])).toMatchObject({
        ok: false,
        error: { code: "INVALID_SHAPE" },
      });
    }
  });

  it("rejects facts that cannot satisfy PlaceCandidate constraints", () => {
    const invalid = [
      row({ experience_types: [] }),
      row({ guide_languages: ["en", "en"] }),
      row({ visit_duration_minutes: 10 }),
      row({ opening_hours: [opening(1, "08:00:00", "08:00:00")] }),
      row({ opening_exceptions: [{ local_date: "2026-09-02", closed: true, windows: [exception.windows[0]] }] }),
    ];

    for (const value of invalid) {
      expect(mapCatalogSnapshot([value])).toMatchObject({ ok: false, error: { code: "INVALID_SHAPE" } });
    }
  });

  it("serializes snapshot copies with a fixed-order read-compatible table lock", () => {
    const lockOrder = [
      "areas",
      "area_translations",
      "places",
      "place_translations",
      "place_experience_types",
      "place_guide_languages",
      "place_supports",
      "place_opening_hours",
      "place_opening_exceptions",
      "place_opening_exception_windows",
    ];
    const positions = lockOrder.map((table) => {
      const match = catalogMigration.indexOf(`LOCK TABLE public.${table} IN SHARE ROW EXCLUSIVE MODE`);
      expect(match).toBeGreaterThan(-1);
      return match;
    });
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it("serializes check-then-act catalog invariants with transaction advisory locks", () => {
    expect(catalogMigration).toMatch(/pg_catalog\.pg_advisory_xact_lock\([\s\S]*pg_catalog\.hashtextextended/);
    expect(catalogMigration).toMatch(/assert_opening_window_nonoverlap[\s\S]*pg_catalog\.pg_advisory_xact_lock/);
    expect(catalogMigration).toMatch(/assert_exception_window_nonoverlap[\s\S]*pg_catalog\.pg_advisory_xact_lock/);
    expect(catalogMigration).toMatch(/assert_published_place_complete[\s\S]*pg_catalog\.pg_advisory_xact_lock/);
  });

  it("locks both place keys in canonical order when a required child is reparented", () => {
    expect(catalogMigration).toMatch(/assert_published_place_row[\s\S]*OLD\.place_id IS DISTINCT FROM NEW\.place_id/);
    expect(catalogMigration).toMatch(/assert_published_place_row[\s\S]*OLD\.place_id::text < NEW\.place_id::text/);
    expect(catalogMigration).toMatch(/assert_published_place_row[\s\S]*private\.assert_published_place_complete\(OLD\.place_id\)[\s\S]*private\.assert_published_place_complete\(NEW\.place_id\)/);
    expect(catalogMigration).toMatch(/assert_opening_window_nonoverlap[\s\S]*OLD\.place_id IS DISTINCT FROM NEW\.place_id/);
    expect(catalogMigration).toMatch(/assert_opening_window_nonoverlap[\s\S]*OLD\.place_id::text < NEW\.place_id::text/);
  });

  it("exposes only the named published projection to API roles", () => {
    expect(catalogMigration).toMatch(/CREATE OR REPLACE VIEW public\.catalog_snapshot_places_v[\s\S]*security_invoker\s*=\s*false/i);
    expect(catalogMigration).toMatch(/ALTER VIEW public\.catalog_snapshot_places_v OWNER TO localens_catalog_rpc_owner/i);
    expect(catalogMigration).toMatch(/GRANT SELECT ON public\.catalog_snapshot_places_v TO anon, authenticated/i);
    expect(catalogMigration).toMatch(/REVOKE ALL ON TABLE[\s\S]*public\.places[\s\S]*FROM anon, authenticated/i);
    expect(catalogMigration).not.toMatch(/GRANT SELECT ON TABLE[\s\S]*public\.places[\s\S]*TO anon, authenticated/i);
  });
});
