import { describe, expect, it } from "vitest";

import { reviewedDataset } from "@/components/dev/reviewed-tours";

describe("reviewed localhost tours", () => {
  it("describes the Saigon lunch without exposing the selected restaurant", () => {
    const heritage = reviewedDataset.tours[0];
    const customerCopy = JSON.stringify({
      translations: heritage.translations,
      inclusions: heritage.inclusions,
      englishInclusions: heritage.englishInclusions,
      stops: reviewedDataset.places.filter((place) => heritage.stopPlaceIds.includes(place.id)),
    });

    expect(customerCopy).not.toContain("Cơm Tấm Mộc");
    expect(customerCopy).not.toContain("85 Lý Tự Trọng");
    expect(customerCopy).toContain("một phần cơm tấm Sài Gòn và một đồ uống cơ bản");
    expect(customerCopy).toContain("one serving of Saigon broken rice and one basic drink");
    expect(customerCopy).not.toContain("nhà hàng sẽ được xác nhận");
    expect(customerCopy).not.toContain("restaurant to be confirmed");
  });
});
