// @vitest-environment node

import { describe, expect, it } from "vitest";

import { normalizeRefinementSignals } from "@/supabase/functions/_shared/refinement-signals";

describe("refinement signal normalization", () => {
  it.each([
    [
      "Đi chậm hơn và bỏ đồ ăn",
      { pace: "slower", food: "remove", preferTypes: [], avoidTypes: [] },
    ],
    [
      "A faster route with more street food and history",
      { pace: "faster", food: "more", preferTypes: ["history"], avoidTypes: [] },
    ],
    [
      "Thư giãn ở làng nghề",
      { pace: "slower", food: "keep", preferTypes: ["traditional_craft"], avoidTypes: [] },
    ],
  ] as const)("maps bounded bilingual feedback without returning the source text: %s", (feedback, expected) => {
    const signals = normalizeRefinementSignals(feedback);

    expect(signals).toEqual(expected);
    expect(JSON.stringify(signals)).not.toContain(feedback);
  });

  it("gives an explicit food-removal request precedence over food preferences", () => {
    expect(normalizeRefinementSignals("Remove food, but maybe add more food later")).toEqual({
      pace: "keep",
      food: "remove",
      preferTypes: [],
      avoidTypes: [],
    });
  });
});
