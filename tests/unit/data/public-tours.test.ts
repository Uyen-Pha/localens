// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { mapPublishedTour } from "@/lib/domain/data/public-tours";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260823094000_tours_departures.sql",
);

const stop = (position = 1, overrides: Record<string, unknown> = {}) => ({
  position,
  place_id: "00000000-0000-0000-0000-000000000102",
  place_slug: "central-market",
  title: "Central Market",
  ...overrides,
});

function row(overrides: Record<string, unknown> = {}) {
  return {
    tour_id: "00000000-0000-0000-0000-000000000001",
    tour_version_id: "00000000-0000-0000-0000-000000000002",
    slug: "central-market-walk",
    locale: "en",
    title: "Central Market Walk",
    summary: "A guided walk through the city's central market.",
    meeting_point: "Main market gate",
    duration_minutes: 180,
    price_vnd_minor: "9007199254740991",
    inclusions: ["licensed guide", "market entry"],
    exclusions: ["hotel transfer"],
    cancellation_policy: "Cancel at least 24 hours before departure.",
    source_url: "https://example.invalid/sources/central-market",
    verified_at: "2026-08-20",
    attribution: "LocalLens editorial team",
    license: "CC BY 4.0",
    stops: [stop()],
    ...overrides,
  };
}

describe("mapPublishedTour", () => {
  it("maps the exact published projection and preserves bigint money as a string", () => {
    expect(mapPublishedTour(row())).toEqual({
      ok: true,
      value: {
        id: "00000000-0000-0000-0000-000000000001",
        versionId: "00000000-0000-0000-0000-000000000002",
        slug: "central-market-walk",
        locale: "en",
        title: "Central Market Walk",
        summary: "A guided walk through the city's central market.",
        meetingPoint: "Main market gate",
        durationMinutes: 180,
        priceVndMinor: "9007199254740991",
        inclusions: ["licensed guide", "market entry"],
        exclusions: ["hotel transfer"],
        cancellationPolicy: "Cancel at least 24 hours before departure.",
        sourceUrl: "https://example.invalid/sources/central-market",
        verifiedAt: "2026-08-20",
        attribution: "LocalLens editorial team",
        license: "CC BY 4.0",
        stops: [{
          position: 1,
          placeId: "00000000-0000-0000-0000-000000000102",
          placeSlug: "central-market",
          title: "Central Market",
        }],
      },
    });
  });

  it("rejects arrays, missing fields, and draft/admin field leakage", () => {
    expect(mapPublishedTour([row()])).toMatchObject({ ok: false, error: { code: "INVALID_SHAPE" } });
    expect(mapPublishedTour({ ...row(), title: undefined })).toMatchObject({
      ok: false,
      error: { code: "MISSING_FIELD", fieldPath: "row.title" },
    });
    expect(mapPublishedTour({ ...row(), status: "draft" })).toMatchObject({
      ok: false,
      error: { code: "UNKNOWN_FIELD", fieldPath: "row.status" },
    });
  });

  it("rejects non-canonical IDs, locales, dates, URLs, and bigint representations", () => {
    const invalidRows = [
      { tour_id: "00000000-0000-0000-0000-00000000000A" },
      { tour_version_id: "tour-version-2" },
      { locale: "fr" },
      { verified_at: "2026-02-29" },
      { source_url: "http://example.invalid/source" },
      { price_vnd_minor: 9007199254740993 },
      { price_vnd_minor: "9007199254740992" },
      { price_vnd_minor: "01" },
      { price_vnd_minor: "-1" },
    ];

    for (const overrides of invalidRows) {
      expect(mapPublishedTour(row(overrides))).toMatchObject({
        ok: false,
        error: { code: expect.stringMatching(/INVALID|UNSAFE/) },
      });
    }
  });

  it("rejects non-dense or non-unique arrays and non-contiguous stop positions", () => {
    const sparse = [] as Array<unknown>;
    sparse.length = 1;
    expect(mapPublishedTour(row({ inclusions: sparse }))).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE" },
    });
    expect(mapPublishedTour(row({ inclusions: ["licensed guide", "licensed guide"] }))).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE" },
    });
    expect(mapPublishedTour(row({ stops: [stop(1), stop(1, { place_id: "00000000-0000-0000-0000-000000000103" })] }))).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE" },
    });
    expect(mapPublishedTour(row({ stops: [stop(2)] }))).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE" },
    });
  });

  it("rejects unknown nested stop fields and unsafe scalar values", () => {
    expect(mapPublishedTour(row({ stops: [stop(1, { admin_note: "hidden" })] }))).toMatchObject({
      ok: false,
      error: { code: "UNKNOWN_FIELD" },
    });
    expect(mapPublishedTour(row({ duration_minutes: 1.5 }))).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE" },
    });
    expect(mapPublishedTour(row({ title: "  title" }))).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE" },
    });
  });
});

describe("fixed-tour SQL artifact", () => {
  it("keeps the pgTAP plan equal to its executable assertion count", () => {
    const pgTap = readFileSync(join(process.cwd(), "supabase", "tests", "database", "tours_departures_test.sql"), "utf8");
    const plan = Number(pgTap.match(/SELECT\s+plan\((\d+)\)/i)?.[1]);
    const assertions = (pgTap.match(/SELECT\s+(?:ok|is|lives_ok|throws_ok)\s*\(/gi) ?? []).length;
    expect(Number.isInteger(plan)).toBe(true);
    expect(assertions).toBe(plan);
  });

  it("declares an invoker, barrier projection and narrow API privileges", () => {
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toMatch(/CREATE OR REPLACE VIEW public\.published_tours_v[\s\S]*security_invoker\s*=\s*true[\s\S]*security_barrier\s*=\s*true/i);
    expect(migration).toMatch(/GRANT SELECT ON public\.published_tours_v TO anon, authenticated/i);
    expect(migration).toMatch(/REVOKE ALL ON TABLE[\s\S]*public\.tours[\s\S]*FROM (?:PUBLIC, )?anon, authenticated/i);
    expect(migration).toMatch(/GRANT SELECT\s*\([^)]*\) ON TABLE public\.(?:tours|tour_translations|tour_versions|tour_version_translations|tour_version_stops)/i);
    expect(migration).not.toMatch(/GRANT SELECT ON TABLE public\.(?:tours|tour_translations|tour_versions|tour_version_translations|tour_version_stops)[^;]*TO anon, authenticated/i);
    expect(migration).not.toMatch(/get_live_departure_availability/i);
  });

  it("pins every public table to forced RLS and uses named non-login owners", () => {
    const migration = readFileSync(migrationPath, "utf8");
    for (const table of ["tours", "tour_translations", "tour_versions", "tour_version_translations", "tour_version_stops", "departures"]) {
      expect(migration).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY[\\s\\S]*ALTER TABLE public\\.${table} FORCE ROW LEVEL SECURITY`, "i"));
    }
    expect(migration).toMatch(/ALTER ROLE localens_tour_rpc_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS/i);
    expect(migration).toMatch(/ALTER ROLE localens_tour_guard_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS/i);
  });
});
