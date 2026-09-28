import { describe, expect, it } from "vitest";

import { parseNaturalLanguage } from "@/lib/application/planner/natural-language";

const areas = [
  { value: "central", label: "Khu trung tâm" },
  { value: "cho-lon", label: "Chợ Lớn" },
];

describe("parseNaturalLanguage", () => {
  it("normalizes a Vietnamese trip description into planner fields", () => {
    const result = parseNaturalLanguage(
      "Tôi muốn đi 4 người ở TP.HCM lúc 9 giờ ngày 10/10/2027 trong 4 giờ, ngân sách 4 triệu đồng cho cả nhóm, thích ẩm thực và chợ truyền thống, ít đi bộ, hướng dẫn viên nói tiếng Anh.",
      areas,
    );

    expect(result.missing).toEqual([]);
    expect(result.draft).toMatchObject({
      startDate: "2027-10-10",
      startTime: "09:00",
      durationMinutes: 240,
      partySize: 4,
      budgetAmount: "4000000",
      budgetCurrency: "VND",
      budgetBasis: "group",
      guideLanguage: "en",
      pace: "relaxed",
    });
    expect(result.draft.priorityWeights.street_food).toBeGreaterThan(0);
    expect(result.draft.priorityWeights.traditional_market).toBeGreaterThan(0);
  });

  it("reports fields that still need clarification instead of inventing them", () => {
    const result = parseNaturalLanguage("Tôi muốn khám phá ẩm thực Sài Gòn", areas);

    expect(result.missing).toEqual([
      "startDate",
      "startTime",
      "duration",
      "partySize",
      "budget",
    ]);
  });
});
