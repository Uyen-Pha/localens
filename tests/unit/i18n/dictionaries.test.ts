import { describe, expect, expectTypeOf, it } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

describe("localized dictionaries", () => {
  it("contains the published English copy", () => {
    const dictionary = getDictionary("en");

    expect(dictionary.home.title).toBe(
      "Discover Ho Chi Minh City through local eyes.",
    );
    expect(dictionary.home.subtitle).toBe(
      "Authentic cultural experiences, thoughtfully planned for you.",
    );
    expect(dictionary.navigation.explore).toBe("Explore");
    expect(dictionary.navigation.planTrip).toBe("Plan my trip");
  });

  it("contains the published Vietnamese copy", () => {
    const dictionary = getDictionary("vi");

    expect(dictionary.home.title).toBe(
      "Khám phá Thành phố Hồ Chí Minh qua góc nhìn người bản địa.",
    );
    expect(dictionary.home.subtitle).toBe(
      "Trải nghiệm văn hóa đích thực, được lên kế hoạch dành riêng cho bạn.",
    );
    expect(dictionary.navigation.explore).toBe("Khám phá");
    expect(dictionary.navigation.planTrip).toBe("Lên kế hoạch chuyến đi");
  });

  it("requires the typed locale boundary", () => {
    expectTypeOf(getDictionary)
      .parameter(0)
      .toEqualTypeOf<Locale>();

    if (false) {
      // @ts-expect-error Unsupported locale values must be rejected by the Locale type.
      getDictionary("fr");
    }
  });
});
