import type { ExperienceType } from "@/lib/domain/itinerary/contracts";

export interface RefinementSignals {
  readonly pace: "keep" | "slower" | "faster";
  readonly food: "keep" | "more" | "remove";
  readonly preferTypes: readonly ExperienceType[];
  readonly avoidTypes: readonly ExperienceType[];
}

/** Reduce bounded owner feedback to the only preference signals sent to AI. */
export function normalizeRefinementSignals(feedback: string): RefinementSignals {
  const value = feedback.normalize("NFKC").toLocaleLowerCase("vi-VN");
  const has = (...terms: string[]) => terms.some((term) => value.includes(term));

  return {
    pace: has("chậm", "thư giãn", "slower", "relaxed")
      ? "slower"
      : has("nhanh", "faster", "active") ? "faster" : "keep",
    food: has("bỏ đồ ăn", "không ăn", "remove food", "without food")
      ? "remove"
      : has("thêm đồ ăn", "ẩm thực", "more food", "street food") ? "more" : "keep",
    preferTypes: has("lịch sử", "history") ? ["history"]
      : has("làng nghề", "craft") ? ["traditional_craft"]
      : has("chợ", "market") ? ["traditional_market"] : [],
    avoidTypes: [],
  };
}
