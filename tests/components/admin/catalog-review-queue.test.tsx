import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env/public", () => ({ parsePublicEnv: vi.fn((value: unknown) => value) }));
vi.mock("@/lib/supabase/client", () => ({ createBrowserSupabaseClient: vi.fn() }));

import {
  CatalogReviewLiveQueue,
  CatalogReviewQueue,
  type CatalogReviewQueueProps,
} from "@/components/admin/catalog-review-queue";
import type { AdminFoodReviewRow } from "@/lib/infrastructure/supabase/catalog-review-adapter";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

afterEach(cleanup);

const row: AdminFoodReviewRow = {
  itemId: "00000000-0000-0000-0000-000000000402",
  vendorId: "00000000-0000-0000-0000-000000000401",
  placeId: "00000000-0000-0000-0000-000000000201",
  vendor: {
    slug: "synthetic-stall",
    title: { en: "Synthetic stall", vi: "Sạp tổng hợp" },
    description: { en: "Synthetic vendor", vi: "Nhà bán tổng hợp" },
    locationNote: null,
    serviceType: "stall",
    capacityNote: "Small groups",
    dietarySupport: { vegetarian: "supported" },
    mobilitySupport: {},
    openingHours: [],
    openingExceptions: [],
    status: "research_only",
    sourceUrl: null,
    verifiedAt: null,
    attribution: null,
  },
  item: {
    slug: "synthetic-dish",
    title: { en: "Synthetic dish", vi: "Món tổng hợp" },
    description: { en: "Synthetic dish", vi: "Món tổng hợp" },
    servingUnit: "portion",
    priceVndMin: null,
    priceVndMax: null,
    portionDescription: "One portion",
    dietarySupport: { vegetarian: "unknown" },
    allergenSupport: {},
    allergens: [],
    available: false,
    status: "research_only",
    sourceUrl: null,
    verifiedAt: null,
    attribution: null,
  },
  auditHistory: [{
    eventId: "00000000-0000-0000-0000-000000000499",
    decision: "rejected",
    rejectionNote: "Price evidence is not verified.",
    actorUserId: "00000000-0000-0000-0000-000000000905",
    reviewedAt: "2026-08-28T00:00:00Z",
  }],
};

function renderQueue(overrides: Partial<CatalogReviewQueueProps> = {}) {
  return render(<CatalogReviewQueue locale="en" rows={[row]} viewerRole="admin" {...overrides} />);
}

describe("admin catalog review queue", () => {
  it("renders bilingual evidence and says not verified for missing facts", () => {
    renderQueue();

    expect(screen.getByRole("heading", { level: 1, name: "Food catalog review" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Synthetic dish" })).toBeInTheDocument();
    expect(screen.getByText("Sạp tổng hợp")).toBeInTheDocument();
    expect(screen.getAllByText("not verified").length).toBeGreaterThan(0);
    expect(screen.getByText("Price evidence is not verified.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve|sellable/i })).toBeNull();
  });

  it("does not expose review controls to an ordinary customer", () => {
    renderQueue({ viewerRole: "customer" });

    expect(screen.getByRole("alert")).toHaveTextContent("Admin sign-in required");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /approve|reject|sellable/i })).toBeNull();
  });

  it("requires every confirmation before calling the guarded sellable action", async () => {
    const onReview = vi.fn().mockResolvedValue({ ok: true, value: row });
    const complete = {
      ...row,
      vendor: {
        ...row.vendor,
        locationNote: "Aisle 2",
        sourceUrl: "https://example.invalid/vendor",
        verifiedAt: "2026-08-28",
        attribution: "Synthetic fixture",
        mobilitySupport: { step_free: "supported" as const },
        openingHours: [{ weekday: 1 as const, opensAt: "08:00", closesAt: "12:00" }],
      },
      item: {
        ...row.item,
        available: true,
        priceVndMin: "40000",
        priceVndMax: "50000",
        allergens: ["peanut"],
        allergenSupport: { peanut: "unsupported" as const },
        sourceUrl: "https://example.invalid/item",
        verifiedAt: "2026-08-28",
        attribution: "Synthetic fixture",
        dietarySupport: { vegetarian: "supported" as const },
      },
    };
    render(<CatalogReviewQueue locale="en" rows={[complete]} viewerRole="admin" onReview={onReview} />);

    const card = screen.getByRole("article", { name: "Synthetic dish" });
    const approve = within(card).getByRole("button", { name: /approve.*sellable/i });
    expect(approve).toBeDisabled();
    const checks = within(card).getAllByRole("checkbox");
    expect(checks.length).toBe(8);
    for (const checkbox of checks) fireEvent.click(checkbox);
    expect(approve).toBeEnabled();
    fireEvent.click(approve);

    expect(onReview).toHaveBeenCalledWith(expect.objectContaining({
      itemId: complete.itemId,
      vendorId: complete.vendorId,
      decision: "sellable",
      rejectionNote: null,
    }));
  });

  it("does not offer sellable approval when a required evidence string is empty", () => {
    const incomplete = {
      ...row,
      vendor: {
        ...row.vendor,
        locationNote: "Aisle 2",
        sourceUrl: "https://example.invalid/vendor",
        verifiedAt: "2026-08-28",
        attribution: "",
        mobilitySupport: { step_free: "supported" as const },
        openingHours: [{ weekday: 1 as const, opensAt: "08:00", closesAt: "12:00" }],
      },
      item: {
        ...row.item,
        available: true,
        priceVndMin: "40000",
        priceVndMax: "50000",
        allergens: ["peanut"],
        allergenSupport: { peanut: "unsupported" as const },
        sourceUrl: "https://example.invalid/item",
        verifiedAt: "2026-08-28",
        attribution: "Synthetic fixture",
        dietarySupport: { vegetarian: "supported" as const },
      },
    };
    renderQueue({ rows: [incomplete] });

    const card = screen.getByRole("article", { name: "Synthetic dish" });
    for (const checkbox of within(card).getAllByRole("checkbox")) fireEvent.click(checkbox);

    expect(within(card).queryByRole("button", { name: /approve.*sellable/i })).toBeNull();
    expect(within(card).getByText("not verified")).toBeInTheDocument();
  });

  it("requires and submits a rejection note without changing the row to sellable", () => {
    const onReview = vi.fn().mockResolvedValue({ ok: true, value: row });
    renderQueue({ onReview });

    const card = screen.getByRole("article", { name: "Synthetic dish" });
    const note = within(card).getByRole("textbox", { name: /rejection note/i });
    const reject = within(card).getByRole("button", { name: /keep research-only/i });
    expect(reject).toBeDisabled();
    fireEvent.change(note, { target: { value: "Accessibility is not verified." } });
    expect(reject).toBeEnabled();
    fireEvent.click(reject);
    expect(onReview).toHaveBeenCalledWith(expect.objectContaining({
      decision: "research_only",
      rejectionNote: "Accessibility is not verified.",
    }));
  });

  it("does not call a missing rejection note approved when displaying audit history", () => {
    renderQueue({
      rows: [{
        ...row,
        auditHistory: [{ ...row.auditHistory[0], rejectionNote: null }],
      }],
    });

    expect(within(screen.getByRole("article", { name: "Synthetic dish" })).getAllByText("not verified").length).toBeGreaterThan(0);
    expect(screen.queryByText("approved")).toBeNull();
  });

  it("does not offer approval when an evidence row is no longer research-only", () => {
    const complete = {
      ...row,
      vendor: {
        ...row.vendor,
        locationNote: "Aisle 2",
        sourceUrl: "https://example.invalid/vendor",
        verifiedAt: "2026-08-28",
        attribution: "Synthetic fixture",
        mobilitySupport: { step_free: "supported" as const },
        openingHours: [{ weekday: 1 as const, opensAt: "08:00", closesAt: "12:00" }],
      },
      item: {
        ...row.item,
        available: true,
        priceVndMin: "40000",
        priceVndMax: "50000",
        allergens: ["peanut"],
        allergenSupport: { peanut: "unsupported" as const },
        sourceUrl: "https://example.invalid/item",
        verifiedAt: "2026-08-28",
        attribution: "Synthetic fixture",
        dietarySupport: { vegetarian: "supported" as const },
        status: "sellable" as const,
      },
    };
    renderQueue({ rows: [complete] });

    const card = screen.getByRole("article", { name: "Synthetic dish" });
    for (const checkbox of within(card).getAllByRole("checkbox")) fireEvent.click(checkbox);

    expect(within(card).getByRole("button", { name: /approve.*sellable/i })).toBeDisabled();
  });

  it("requires evidence for every listed allergen and every open exception window", () => {
    const incomplete = {
      ...row,
      vendor: {
        ...row.vendor,
        locationNote: "Aisle 2",
        sourceUrl: "https://example.invalid/vendor",
        verifiedAt: "2026-08-28",
        attribution: "Synthetic fixture",
        mobilitySupport: { step_free: "supported" as const },
        openingHours: [{ weekday: 1 as const, opensAt: "08:00", closesAt: "12:00" }],
        openingExceptions: [{ localDate: "2026-08-28", closed: false, windows: [] }],
      },
      item: {
        ...row.item,
        available: true,
        priceVndMin: "40000",
        priceVndMax: "50000",
        allergens: ["peanut", "shellfish"],
        allergenSupport: { peanut: "unsupported" as const },
        sourceUrl: "https://example.invalid/item",
        verifiedAt: "2026-08-28",
        attribution: "Synthetic fixture",
        dietarySupport: { vegetarian: "supported" as const },
      },
    };
    renderQueue({ rows: [incomplete] });

    const card = screen.getByRole("article", { name: "Synthetic dish" });
    for (const checkbox of within(card).getAllByRole("checkbox")) fireEvent.click(checkbox);

    expect(within(card).queryByRole("button", { name: /approve.*sellable/i })).toBeNull();
  });

  it("treats a resolved RPC error as a failed review rather than success", async () => {
    const onReview = vi.fn().mockResolvedValue({ error: { code: "42501", message: "admin role required" } });
    renderQueue({ onReview });

    const card = screen.getByRole("article", { name: "Synthetic dish" });
    const note = within(card).getByRole("textbox", { name: /rejection note/i });
    fireEvent.change(note, { target: { value: "Still needs verification." } });
    fireEvent.click(within(card).getByRole("button", { name: /keep research-only/i }));

    await waitFor(() => expect(within(card).getByRole("status")).toHaveTextContent("could not be recorded"));
    expect(within(card).queryByText("Review decision recorded.")).toBeNull();
  });

  it("treats a resolved RPC envelope with an error field, including null, as a failure", async () => {
    const onReview = vi.fn().mockResolvedValue({ error: null });
    renderQueue({ onReview });

    const card = screen.getByRole("article", { name: "Synthetic dish" });
    const note = within(card).getByRole("textbox", { name: /rejection note/i });
    fireEvent.change(note, { target: { value: "Still needs verification." } });
    fireEvent.click(within(card).getByRole("button", { name: /keep research-only/i }));

    await waitFor(() => expect(within(card).getByRole("status")).toHaveTextContent("could not be recorded"));
  });

  const malformedReviewResults: Array<[string, unknown]> = [
    ["undefined", undefined],
    ["null", null],
    ["malformed object", { message: "not a Result" }],
    ["false result without error", { ok: false }],
    ["success without validated value", { ok: true }],
    ["success with null value", { ok: true, value: null }],
  ];

  it.each(malformedReviewResults)("treats %s callback results as failed review actions", async (_label, result) => {
    const onReview = vi.fn().mockReturnValue(result);
    renderQueue({ onReview });

    const card = screen.getByRole("article", { name: "Synthetic dish" });
    const note = within(card).getByRole("textbox", { name: /rejection note/i });
    fireEvent.change(note, { target: { value: "Still needs verification." } });
    fireEvent.click(within(card).getByRole("button", { name: /keep research-only/i }));

    await waitFor(() => expect(within(card).getByRole("status")).toHaveTextContent("could not be recorded"));
    expect(within(card).queryByText("Review decision recorded.")).toBeNull();
  });

  it("resets checklist confirmations when the same row key receives changed evidence", async () => {
    const complete = {
      ...row,
      vendor: {
        ...row.vendor,
        locationNote: "Aisle 2",
        sourceUrl: "https://example.invalid/vendor",
        verifiedAt: "2026-08-28",
        attribution: "Synthetic fixture",
        mobilitySupport: { step_free: "supported" as const },
        openingHours: [{ weekday: 1 as const, opensAt: "08:00", closesAt: "12:00" }],
      },
      item: {
        ...row.item,
        available: true,
        priceVndMin: "40000",
        priceVndMax: "50000",
        allergens: ["peanut"],
        allergenSupport: { peanut: "unsupported" as const },
        sourceUrl: "https://example.invalid/item",
        verifiedAt: "2026-08-28",
        attribution: "Synthetic fixture",
        dietarySupport: { vegetarian: "supported" as const },
      },
    };
    const rendered = renderQueue({ rows: [complete] });
    const card = screen.getByRole("article", { name: "Synthetic dish" });
    fireEvent.click(within(card).getAllByRole("checkbox")[0]);
    expect(within(card).getAllByRole("checkbox")[0]).toBeChecked();

    rendered.rerender(<CatalogReviewQueue locale="en" rows={[{
      ...complete,
      item: { ...complete.item, priceVndMax: "60000" },
    }]} viewerRole="admin" />);

    await waitFor(() => expect(within(screen.getByRole("article", { name: "Synthetic dish" })).getAllByRole("checkbox")[0]).not.toBeChecked());
  });

  it("removes an approved row after the validated live RPC result and safely refreshes the queue", async () => {
    const liveRow = {
      item_id: row.itemId,
      vendor_id: row.vendorId,
      place_id: row.placeId,
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
        status: "draft",
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
        status: "draft",
        source_url: "https://example.invalid/item",
        verified_at: "2026-08-28",
        attribution: "Synthetic fixture",
      },
      audit_history: [],
    };
    let queueCalls = 0;
    const rpc = vi.fn().mockImplementation((functionName: string) => {
      if (functionName === "get_admin_food_catalog_review_queue") {
        queueCalls += 1;
        return Promise.resolve({ data: queueCalls === 1 ? [liveRow] : [], error: null });
      }
      return Promise.resolve({
        data: [{
          ...liveRow,
          vendor: { ...liveRow.vendor, status: "published" },
          item: { ...liveRow.item, status: "published" },
        }],
        error: null,
      });
    });
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: row.itemId } }, error: null }) },
      rpc,
    };
    vi.mocked(createBrowserSupabaseClient).mockReturnValue(client as unknown as ReturnType<typeof createBrowserSupabaseClient>);

    render(<CatalogReviewLiveQueue locale="en" />);
    const card = await waitFor(() => screen.getByRole("article", { name: "Synthetic dish" }));
    for (const checkbox of within(card).getAllByRole("checkbox")) fireEvent.click(checkbox);
    fireEvent.click(within(card).getByRole("button", { name: /approve.*sellable/i }));

    await waitFor(() => expect(screen.queryByRole("article", { name: "Synthetic dish" })).toBeNull());
    expect(rpc).toHaveBeenCalledWith("review_food_catalog_item", expect.any(Object));
    expect(queueCalls).toBe(2);
  });

  it("blocks load more while the post-review page zero refresh is pending", async () => {
    const rawRows = Array.from({ length: 25 }, (_, index) => {
      const itemId = `00000000-0000-0000-0000-${String(402 + index).padStart(12, "0")}`;
      return {
        item_id: itemId,
        vendor_id: row.vendorId,
        place_id: row.placeId,
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
          status: "draft",
          source_url: "https://example.invalid/vendor",
          verified_at: "2026-08-28",
          attribution: "Synthetic fixture",
        },
        item: {
          slug: `synthetic-dish-${index}`,
          title: { en: index === 0 ? "Synthetic dish" : `Synthetic dish ${index}`, vi: "Món tổng hợp" },
          description: { en: "Synthetic dish", vi: "Món tổng hợp" },
          serving_unit: "portion",
          price_vnd_min: "40000",
          price_vnd_max: "50000",
          portion_description: "One portion",
          dietary_support: { vegetarian: "supported" },
          allergen_support: { peanut: "unsupported" },
          allergens: ["peanut"],
          available: true,
          status: "draft",
          source_url: "https://example.invalid/item",
          verified_at: "2026-08-28",
          attribution: "Synthetic fixture",
        },
        audit_history: [],
      };
    });
    let queueCalls = 0;
    let resolveRefresh!: (value: { data: unknown[]; error: null }) => void;
    const refresh = new Promise<{ data: unknown[]; error: null }>((resolve) => {
      resolveRefresh = resolve;
    });
    const rpc = vi.fn().mockImplementation((functionName: string) => {
      if (functionName === "get_admin_food_catalog_review_queue") {
        queueCalls += 1;
        if (queueCalls === 1) return Promise.resolve({ data: rawRows, error: null });
        if (queueCalls === 2) return refresh;
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({
        data: [{
          ...rawRows[0],
          vendor: { ...rawRows[0].vendor, status: "published" },
          item: { ...rawRows[0].item, status: "published" },
        }],
        error: null,
      });
    });
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: row.itemId } }, error: null }) },
      rpc,
    };
    vi.mocked(createBrowserSupabaseClient).mockReturnValue(client as unknown as ReturnType<typeof createBrowserSupabaseClient>);

    render(<CatalogReviewLiveQueue locale="en" />);
    const card = await waitFor(() => screen.getByRole("article", { name: "Synthetic dish" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument());
    for (const checkbox of within(card).getAllByRole("checkbox")) fireEvent.click(checkbox);
    fireEvent.click(within(card).getByRole("button", { name: /approve.*sellable/i }));

    await waitFor(() => expect(queueCalls).toBe(2));
    expect(screen.queryByRole("button", { name: /load more/i })).toBeNull();
    expect(rpc).not.toHaveBeenCalledWith("get_admin_food_catalog_review_queue", { p_limit: 25, p_offset: 25 });

    resolveRefresh({ data: [], error: null });
    await waitFor(() => expect(screen.queryByRole("article", { name: "Synthetic dish" })).toBeNull());
    expect(queueCalls).toBe(2);
  });
});
