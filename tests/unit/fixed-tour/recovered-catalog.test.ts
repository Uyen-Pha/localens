import { describe, expect, it } from "vitest";

import { additionalPublishedTours } from "@/lib/application/fixed-tour/additions";
import { mergeRecoveredPublishedTours } from "@/lib/application/fixed-tour/recovered-catalog";
import type { PublishedTour } from "@/lib/domain/data/contracts";

describe("mergeRecoveredPublishedTours", () => {
  it("restores the three source-backed historical tours without duplicating published records", () => {
    const additions = additionalPublishedTours("vi");
    const existing = [additions[0]] as PublishedTour[];

    const result = mergeRecoveredPublishedTours(existing, "vi");

    expect(additions).toHaveLength(3);
    expect(result).toHaveLength(3);
    expect(new Set(result.map((tour) => tour.slug)).size).toBe(3);
    expect(result.map((tour) => tour.title)).toEqual([
      "Dạo Chợ Lớn: Chợ Bình Tây và bữa cơm địa phương",
      "Sài Gòn đời thường: Cà phê vợt và Tân Định",
      "Củ Chi: Theo dấu lịch sử tại Bến Đình",
    ]);
  });
});
