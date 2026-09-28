import { describe, expect, it, vi } from "vitest";
import { createDemoAdminPlacesPort } from "@/lib/infrastructure/demo/admin-places";

describe("admin places demo", () => {
  it("compares Vietnam calendar dates independently of localized date formatting", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T18:00:00Z"));
    const NativeDateTimeFormat = Intl.DateTimeFormat;
    const format = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (...args) {
      const formatter = new NativeDateTimeFormat(...args);
      Object.defineProperty(formatter, "format", { value: () => "09/13/2026" });
      return formatter;
    });
    try {
      const port = createDemoAdminPlacesPort();
      const place = (await port.list())[0];
      await expect(port.save({ ...place, verifiedAt: "2026-09-13" }, place.id)).resolves.toBeUndefined();
      await expect(port.save({ ...place, verifiedAt: "2026-09-14" }, place.id)).rejects.toMatchObject({ field: "verifiedAt" });
    } finally {
      format.mockRestore();
      vi.useRealTimers();
    }
  });
  it("isolates demo state and returns independent copies", async () => {
    const port = createDemoAdminPlacesPort();
    const rows = await port.list();
    expect(rows).toHaveLength(35);
    expect(rows.filter(row => row.status === "published")).toHaveLength(23);
    expect(rows.filter(row => row.status === "draft")).toHaveLength(11);
    expect(rows.find(row => row.name === "Dinh Độc Lập")).toMatchObject({ status: "published", cost: 80000, sourceUrl: "https://dinhdoclap.gov.vn/en/visiting-hours/" });
    expect(rows.find(row => row.name === "Phố đi bộ Nguyễn Huệ")).toMatchObject({ status: "draft", cost: null });
    rows[0].name = "changed";
    expect((await port.list())[0].name).not.toBe("changed");
    await port.setStatus(rows[0].id, "archived");
    expect((await createDemoAdminPlacesPort().list())[0].status).toBe("published");
  });
  it("creates drafts and preserves their status on editing", async () => {
    const port = createDemoAdminPlacesPort();
    const input = (await port.list())[0];
    await port.save({ ...input, name: "Mới", sourceUrl: "" });
    const created = (await port.list()).find(row => row.name === "Mới")!;
    expect(created.status).toBe("draft");
    await port.save({ ...input, name: "Đã sửa" }, created.id);
    expect((await port.list()).find(row => row.id === created.id)?.status).toBe("draft");
  });
  it("validates basic fields before saving and rejects unknown records", async () => {
    const port = createDemoAdminPlacesPort();
    const input = (await port.list())[0];
    for (const [field, value] of [["name", " "], ["cost", -1], ["duration", 0]] as const) {
      await expect(port.save({ ...input, [field]: value })).rejects.toMatchObject({ field });
    }
    await expect(port.save(input, "missing")).rejects.toThrow();
    await expect(port.setStatus("missing", "archived")).rejects.toThrow();
  });
  it("requires complete verified source data before publishing", async () => {
    const port = createDemoAdminPlacesPort();
    const draft = (await port.list()).find(row => row.status === "draft")!;
    await expect(port.setStatus(draft.id, "published")).rejects.toMatchObject({ field: "sourceUrl" });
    const complete = (await port.list())[0];
    for (const [field, value] of [["sourceUrl", "javascript:alert(1)"], ["verifiedAt", "2026-02-30"], ["verifiedAt", "2999-01-01"], ["address", ""], ["hours", ""], ["description", ""], ["sourceNote", ""]] as const) {
      await port.save({ ...complete, [field]: value }, draft.id);
      await expect(port.setStatus(draft.id, "published")).rejects.toMatchObject({ field });
    }
    await port.save(complete, draft.id);
    await port.setStatus(draft.id, "published");
    expect((await port.list()).find(row => row.id === draft.id)?.status).toBe("published");
  });
  it("rejects incomplete published edits without changing the record", async () => {
    const port = createDemoAdminPlacesPort();
    const original = (await port.list())[0];
    await expect(port.save({ ...original, sourceUrl: "" }, original.id)).rejects.toMatchObject({ field: "sourceUrl" });
    expect((await port.list())[0]).toEqual(original);
  });
  it("accepts safe image URLs and rejects unsafe URLs even on drafts", async () => {
    const port = createDemoAdminPlacesPort();
    const input = (await port.list())[0];
    for (const imageUrl of ["javascript:alert(1)", "data:image/svg+xml,unsafe", "//example.com/image.webp", "/\\example.com/image.webp"]) {
      await expect(port.save({ ...input, imageUrl })).rejects.toMatchObject({ field: "imageUrl" });
    }
    for (const imageUrl of ["/images/editorial/category-history.webp", "https://example.com/image.webp", "http://example.com/image.webp", ""]) {
      await expect(port.save({ ...input, imageUrl })).resolves.toBeUndefined();
    }
  });
});
