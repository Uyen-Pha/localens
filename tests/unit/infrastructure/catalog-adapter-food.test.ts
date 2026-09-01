// @vitest-environment node

import { describe, expect, it } from "vitest";

import { mapCatalogSnapshot } from "@/lib/infrastructure/supabase/catalog-adapter";

const snapshotId = "00000000-0000-0000-0000-000000000501";
const secondSnapshotId = "00000000-0000-0000-0000-000000000505";
const placeId = "00000000-0000-0000-0000-000000000502";
const secondPlaceId = "00000000-0000-0000-0000-000000000504";
const vendorId = "00000000-0000-0000-0000-000000000601";
const secondVendorId = "00000000-0000-0000-0000-000000000602";
const itemId = "00000000-0000-0000-0000-000000000701";
const secondItemId = "00000000-0000-0000-0000-000000000702";

const place = (overrides: Record<string, unknown> = {}) => ({
  snapshot_id: snapshotId,
  place_id: placeId,
  area_id: "00000000-0000-0000-0000-000000000503",
  price_vnd_per_person: "0",
  visit_duration_minutes: 90,
  experience_types: ["street_food"],
  guide_languages: ["en", "vi"],
  dietary_support: { vegetarian: "unknown" },
  mobility_support: { "step-free": "unknown" },
  opening_hours: [{ weekday: 1, opens_at: "08:00:00", closes_at: "22:00:00" }],
  opening_exceptions: [],
  ...overrides,
});

const vendor = (overrides: Record<string, unknown> = {}) => ({
  snapshot_id: snapshotId,
  place_id: placeId,
  vendor_id: vendorId,
  slug: "bun-oc-stall",
  title: { en: "Bun Oc Stall", vi: "Sạp bún ốc" },
  description: { en: "A verified food stall.", vi: "Một sạp ăn đã xác minh." },
  location_note: "Aisle 2",
  service_type: "stall",
  capacity_note: "Seats 12 guests",
  dietary_support: { vegetarian: "unsupported", halal: "unknown" },
  mobility_support: { "step-free": "supported" },
  opening_hours: [{ weekday: 1, opens_at: "16:00:00", closes_at: "22:00:00" }],
  opening_exceptions: [],
  status: "published",
  verified_at: "2026-08-28",
  ...overrides,
});

const item = (overrides: Record<string, unknown> = {}) => ({
  snapshot_id: snapshotId,
  place_id: placeId,
  vendor_id: vendorId,
  item_id: itemId,
  slug: "bun-oc",
  title: { en: "Snail noodle soup", vi: "Bún ốc" },
  description: { en: "A bowl of noodle soup.", vi: "Một tô bún nước." },
  serving_unit: "bowl",
  price_vnd_min: "40000",
  price_vnd_max: "40000",
  portion_description: "One bowl",
  dietary_support: { vegetarian: "unsupported", halal: "unknown" },
  allergens: ["shellfish"],
  available: true,
  status: "published",
  verified_at: "2026-08-28",
  ...overrides,
});

const map = (
  foodVendorRows: unknown[] = [vendor()],
  foodItemRows: unknown[] = [item()],
  venueRows: unknown[] = [place()],
) => mapCatalogSnapshot(venueRows, { vendors: foodVendorRows, items: foodItemRows });

describe("mapCatalogSnapshot food projections", () => {
  it("joins one vendor and exact/ranged menu prices into the matching place", () => {
    const result = map(
      [vendor()],
      [item(), item({ item_id: secondItemId, slug: "che", price_vnd_min: "25000", price_vnd_max: "35000" })],
    );

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        id: snapshotId,
        places: [expect.objectContaining({
          id: placeId,
          foodVendors: [{
            id: vendorId,
            placeId,
            slug: "bun-oc-stall",
            title: { en: "Bun Oc Stall", vi: "Sạp bún ốc" },
            description: { en: "A verified food stall.", vi: "Một sạp ăn đã xác minh." },
            locationNote: "Aisle 2",
            serviceType: "stall",
            capacityNote: "Seats 12 guests",
            dietarySupport: { vegetarian: "unsupported", halal: "unknown" },
            mobilitySupport: { "step-free": "supported" },
            openingHours: [{ weekday: 1, opensAt: "16:00", closesAt: "22:00" }],
            openingExceptions: [],
            status: "sellable",
            menuItems: [
              expect.objectContaining({
                id: itemId,
                vendorId,
                servingUnit: "bowl",
                priceVndMin: 40000,
                priceVndMax: 40000,
                available: true,
                status: "sellable",
                verifiedAt: "2026-08-28",
              }),
              expect.objectContaining({
                id: secondItemId,
                priceVndMin: 25000,
                priceVndMax: 35000,
              }),
            ],
          }],
        })],
      }),
    });
  });

  it("maps an explicit empty food bundle to foodVendors: []", () => {
    const result = mapCatalogSnapshot([place()], { vendors: [], items: [] });
    expect(result).toMatchObject({ ok: true, value: { places: [{ foodVendors: [] }] } });
  });

  it("requires an exact food bundle and exact projection fields", () => {
    expect(mapCatalogSnapshot([place()], undefined)).toMatchObject({ ok: false, error: { code: "MISSING_FIELD" } });
    expect(mapCatalogSnapshot([place()], { vendors: [], items: [], extra: [] })).toMatchObject({ ok: false, error: { code: "UNKNOWN_FIELD" } });
    expect(map([vendor({ extra: true })], [])).toMatchObject({ ok: false, error: { code: "UNKNOWN_FIELD" } });
    expect(map([], [item({ extra: true })])).toMatchObject({ ok: false, error: { code: "UNKNOWN_FIELD" } });
    expect(map([], [item({ title: { en: "Only English", vi: "Bún ốc", extra: "no" } })])).toMatchObject({ ok: false, error: { code: "UNKNOWN_FIELD" } });
    expect(map([vendor({ opening_hours: [{ weekday: 1, opens_at: "16:00:00", closes_at: "22:00:00", extra: true }] })], [])).toMatchObject({ ok: false, error: { code: "UNKNOWN_FIELD" } });
  });

  it("rejects malformed bilingual/support/hour values and unknown enums", () => {
    const invalidRows = [
      [[vendor({ title: { en: "Stall", vi: null } })], []],
      [[vendor({ dietary_support: { vegetarian: "maybe" } })], []],
      [[vendor({ opening_hours: [{ weekday: 1, opens_at: "25:00:00", closes_at: "22:00:00" }] })], []],
      [[vendor({ service_type: "restaurant" })], []],
      [[], [item({ serving_unit: "plate" })]],
      [[], [item({ status: "draft" })]],
    ];

    for (const [vendors, items] of invalidRows) {
      expect(map(vendors, items)).toMatchObject({ ok: false, error: { code: "INVALID_SHAPE" } });
    }
  });

  it("fails closed for exact research_only vendor and menu-item projections", () => {
    expect(map([vendor({ status: "research_only" })], [])).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE" },
    });
    expect(map([vendor()], [item({ status: "research_only" })])).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE" },
    });
  });

  it("accepts food prices through Number.MAX_SAFE_INTEGER but rejects unsafe/non-canonical values and inverted ranges", () => {
    const safeResult = map([vendor()], [item({ price_vnd_min: "9007199254740991", price_vnd_max: "9007199254740991" })]);
    expect(safeResult).toMatchObject({ ok: true });
    for (const price of ["9007199254740992", "040000", "+40000", "40000.0", 40000]) {
      expect(map([vendor()], [item({ price_vnd_min: price })])).toMatchObject({ ok: false });
    }
    expect(map([vendor()], [item({ price_vnd_min: "50000", price_vnd_max: "40000" })])).toMatchObject({ ok: false });
  });

  it("rejects duplicate IDs, orphan vendors, and cross-parent food rows", () => {
    expect(map([vendor(), vendor({ slug: "duplicate" })], [])).toMatchObject({ ok: false });
    expect(map([], [item(), item({ item_id: secondItemId })])).toMatchObject({ ok: false });
    expect(map([vendor({ place_id: secondPlaceId })], [])).toMatchObject({ ok: false });
    expect(map([vendor()], [item({ snapshot_id: secondSnapshotId })])).toMatchObject({ ok: false });
    expect(map([vendor()], [item({ place_id: secondPlaceId })], [place(), place({ place_id: secondPlaceId })])).toMatchObject({ ok: false });
    expect(map([vendor(), vendor({ vendor_id: secondVendorId })], [item({ vendor_id: "00000000-0000-0000-0000-000000000603" })])).toMatchObject({ ok: false });
  });
});
