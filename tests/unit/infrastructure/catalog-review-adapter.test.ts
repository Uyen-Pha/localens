// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  mapAdminFoodReviewRow,
  reviewFoodCatalogItem,
} from "@/lib/infrastructure/supabase/catalog-review-adapter";

const ids = {
  place: "00000000-0000-0000-0000-000000000201",
  vendor: "00000000-0000-0000-0000-000000000401",
  item: "00000000-0000-0000-0000-000000000402",
};

function projectionRow(overrides: Record<string, unknown> = {}) {
  return {
    item_id: ids.item,
    vendor_id: ids.vendor,
    place_id: ids.place,
    vendor: {
      slug: "synthetic-stall",
      title: { en: "Synthetic stall", vi: "Sạp tổng hợp" },
      description: { en: "Synthetic vendor", vi: "Nhà bán tổng hợp" },
      location_note: "Aisle 2",
      service_type: "stall",
      capacity_note: "Small groups",
      dietary_support: { vegetarian: "supported" },
      mobility_support: { step_free: "supported" },
      opening_hours: [{ weekday: 1, opens_at: "08:00:00", closes_at: "12:00:00" }],
      opening_exceptions: [],
      status: "research_only",
      source_url: "https://example.invalid/vendor",
      verified_at: "2026-08-28",
      attribution: "Synthetic fixture",
    },
    item: {
      slug: "synthetic-dish",
      title: { en: "Synthetic dish", vi: "Món tổng hợp" },
      description: { en: "Synthetic dish", vi: "Món tổng hợp" },
      serving_unit: "portion",
      price_vnd_min: "40000",
      price_vnd_max: "50000",
      portion_description: "One portion",
      dietary_support: { vegetarian: "supported" },
      allergen_support: { peanut: "unsupported" },
      allergens: ["peanut"],
      available: true,
      status: "research_only",
      source_url: "https://example.invalid/item",
      verified_at: "2026-08-28",
      attribution: "Synthetic fixture",
    },
    audit_history: [],
    ...overrides,
  };
}

const checklist = {
  source: true,
  bilingualName: true,
  location: true,
  hours: true,
  price: true,
  availability: true,
  dietaryAllergen: true,
  mobility: true,
};

describe("catalog review adapter", () => {
  it("maps the exact admin projection and preserves missing evidence as null", () => {
    const result = mapAdminFoodReviewRow(projectionRow({
      vendor: { ...projectionRow().vendor as Record<string, unknown>, source_url: null, attribution: null },
      item: { ...projectionRow().item as Record<string, unknown>, price_vnd_min: null, price_vnd_max: null },
    }));

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        itemId: ids.item,
        vendorId: ids.vendor,
        vendor: expect.objectContaining({ sourceUrl: null, attribution: null }),
        item: expect.objectContaining({ priceVndMin: null, priceVndMax: null }),
      }),
    });
  });

  it("rejects missing and unknown projection fields instead of widening the admin boundary", () => {
    expect(mapAdminFoodReviewRow(projectionRow({ unexpected: true }))).toMatchObject({
      ok: false,
      error: { code: "UNKNOWN_FIELD" },
    });
    const missing = projectionRow();
    delete (missing as Record<string, unknown>).audit_history;
    expect(mapAdminFoodReviewRow(missing)).toMatchObject({
      ok: false,
      error: { code: "MISSING_FIELD" },
    });
  });

  it("rejects a half-known price range instead of treating one bound as verified", () => {
    expect(mapAdminFoodReviewRow(projectionRow({
      item: { ...projectionRow().item as Record<string, unknown>, price_vnd_min: null, price_vnd_max: "50000" },
    }))).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE", fieldPath: "row.item.price_vnd_min" },
    });
  });

  it("rejects malformed audit timestamps at the projection boundary", () => {
    expect(mapAdminFoodReviewRow(projectionRow({
      audit_history: [{
        event_id: "00000000-0000-0000-0000-000000000499",
        decision: "rejected",
        rejection_note: "Not verified",
        actor_user_id: "00000000-0000-0000-0000-000000000905",
        reviewed_at: "not-a-timestamp",
      }],
    }))).toMatchObject({
      ok: false,
      error: { code: "INVALID_TIMESTAMP" },
    });
  });

  it("accepts only a fully confirmed research-only item for the sellable transition", () => {
    expect(reviewFoodCatalogItem({
      itemId: ids.item,
      vendorId: ids.vendor,
      decision: "sellable",
      checklist,
      rejectionNote: null,
    })).toEqual({
      ok: true,
      value: {
        itemId: ids.item,
        vendorId: ids.vendor,
        decision: "sellable",
        checklist: {
          source_checked: true,
          bilingual_name_checked: true,
          location_checked: true,
          hours_checked: true,
          price_checked: true,
          availability_checked: true,
          dietary_allergen_checked: true,
          mobility_checked: true,
        },
        rejectionNote: null,
      },
    });
    expect(reviewFoodCatalogItem({
      itemId: ids.item,
      vendorId: ids.vendor,
      decision: "sellable",
      checklist: { ...checklist, price: false },
      rejectionNote: null,
    })).toMatchObject({ ok: false, error: { code: "INVALID_SHAPE", messageKey: "data.review.incomplete" } });
  });

  it("requires a bounded rejection note and keeps a rejection research-only", () => {
    expect(reviewFoodCatalogItem({
      itemId: ids.item,
      vendorId: ids.vendor,
      decision: "research_only",
      checklist: { ...checklist, price: false },
      rejectionNote: "Price evidence is not verified.",
    })).toMatchObject({
      ok: true,
      value: { decision: "research_only", rejectionNote: "Price evidence is not verified." },
    });
    expect(reviewFoodCatalogItem({
      itemId: ids.item,
      vendorId: ids.vendor,
      decision: "research_only",
      checklist,
      rejectionNote: null,
    })).toMatchObject({ ok: false, error: { code: "INVALID_SHAPE", messageKey: "data.review.rejection_note_required" } });
  });

  it("does not accept a forged client role or extra review input", () => {
    expect(reviewFoodCatalogItem({
      itemId: ids.item,
      vendorId: ids.vendor,
      decision: "sellable",
      checklist,
      rejectionNote: null,
      role: "admin",
    })).toMatchObject({ ok: false, error: { code: "UNKNOWN_FIELD" } });
  });
});
