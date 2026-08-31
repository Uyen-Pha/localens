// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  loadAdminFoodReviewQueue,
  mapAdminFoodReviewRow,
  reviewFoodCatalogItem,
  submitFoodCatalogReview,
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
  it("loads a bounded admin page through the authenticated session and guarded queue RPC", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: ids.item } },
      error: null,
    });
    const rpc = vi.fn().mockResolvedValue({ data: [projectionRow()], error: null });
    const client = { auth: { getUser }, rpc };

    const result = await loadAdminFoodReviewQueue(client, { page: 2, pageSize: 5 });

    expect(getUser).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("get_admin_food_catalog_review_queue", {
      p_limit: 5,
      p_offset: 10,
    });
    expect(result).toMatchObject({
      ok: true,
      value: { viewerRole: "admin", page: 2, pageSize: 5, hasMore: false },
    });
  });

  it("rejects an offset that cannot be represented by the guarded integer RPC", async () => {
    const client = {
      auth: { getUser: vi.fn() },
      rpc: vi.fn(),
    };

    const result = await loadAdminFoodReviewQueue(client, { page: 100_000_000, pageSize: 50 });

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_SHAPE", messageKey: "data.pagination.invalid" } });
    expect(client.auth.getUser).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("rejects a queue response larger than the requested page", async () => {
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: ids.item } }, error: null }) },
      rpc: vi.fn().mockResolvedValue({ data: Array.from({ length: 6 }, () => projectionRow()), error: null }),
    };

    const result = await loadAdminFoodReviewQueue(client, { page: 0, pageSize: 5 });

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_SHAPE", messageKey: "data.pagination.too_many_items" } });
  });

  it("keeps a forged or missing session fail-closed instead of treating a queue error as admin", async () => {
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: ids.item } },
          error: null,
        }),
      },
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "42501", message: "admin role required" },
      }),
    };

    const result = await loadAdminFoodReviewQueue(client, { page: 0, pageSize: 25 });

    expect(result).toMatchObject({ ok: true, value: { viewerRole: "customer", rows: [] } });
    expect(client.rpc).toHaveBeenCalledWith("get_admin_food_catalog_review_queue", {
      p_limit: 25,
      p_offset: 0,
    });
  });

  it("surfaces a resolved RPC error as a failed review action", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "42501", message: "admin role required" },
      }),
    };

    const result = await submitFoodCatalogReview(client, {
      itemId: ids.item,
      vendorId: ids.vendor,
      decision: "research_only",
      checklist,
      rejectionNote: "Evidence still needs review.",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE", messageKey: "data.review.rpc_failed" },
    });
    expect(client.rpc).toHaveBeenCalledWith("review_food_catalog_item", expect.objectContaining({
      p_item_id: ids.item,
      p_vendor_id: ids.vendor,
      p_decision: "research_only",
    }));
  });

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

  it("rejects open exceptions without windows and bounds nested arrays", () => {
    expect(mapAdminFoodReviewRow(projectionRow({
      vendor: {
        ...projectionRow().vendor as Record<string, unknown>,
        opening_exceptions: [{ local_date: "2026-08-28", closed: false, windows: [] }],
      },
    })).ok).toBe(false);

    const tooManyHours = Array.from({ length: 101 }, (_, weekday) => ({
      weekday: weekday % 7,
      opens_at: "08:00:00",
      closes_at: "12:00:00",
    }));
    expect(mapAdminFoodReviewRow(projectionRow({
      vendor: { ...projectionRow().vendor as Record<string, unknown>, opening_hours: tooManyHours },
    })).ok).toBe(false);

    const tooManyHistory = Array.from({ length: 101 }, (_, index) => ({
      event_id: `00000000-0000-0000-0000-${String(index + 500).padStart(12, "0")}`,
      decision: "rejected",
      rejection_note: "Needs evidence.",
      actor_user_id: "00000000-0000-0000-0000-000000000905",
      reviewed_at: "2026-08-28T00:00:00Z",
    }));
    expect(mapAdminFoodReviewRow(projectionRow({ audit_history: tooManyHistory })).ok).toBe(false);
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
