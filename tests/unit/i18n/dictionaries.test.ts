import { describe, expect, expectTypeOf, it } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

describe("localized dictionaries", () => {
  it("contains the published English copy", () => {
    const dictionary = getDictionary("en");

    expect(dictionary.home.title).toBe(
      "The city is more than its landmarks",
    );
    expect(dictionary.home.subtitle).toBe(
      "Meet Saigon through its food, stories, markets and makers.",
    );
    expect(dictionary.home.heroPrimaryCta).toBe("Discover Saigon tours");
    expect(dictionary.home.heroSecondaryCta).toBe("Design a private journey");
    expect(dictionary.home.heroImageAlt).toBe(
      "Elderly artisan weaving a rattan basket in Saigon",
    );
    expect(dictionary.home.heroInsetAlt).toBe(
      "Arched facade of Saigon Central Post Office",
    );
    expect(dictionary.home.heroCoordinates).toBe("10.8231° N · 106.6297° E");
    expect(dictionary.home.experienceCategories.map(({ key }) => key)).toEqual([
      "street_food",
      "history",
      "traditional_craft",
      "traditional_market",
    ]);
    expect(dictionary.navigation.experiences).toBe("Experiences");
    expect(dictionary.navigation.privateJourneys).toBe("Private journeys");
    expect(dictionary.navigation.ourCity).toBe("Our city");
  });

  it("contains the published Vietnamese copy", () => {
    const dictionary = getDictionary("vi");

    expect(dictionary.home.title).toBe(
      "Thành phố không chỉ có những địa danh nổi tiếng",
    );
    expect(dictionary.home.subtitle).toBe(
      "Gặp gỡ Sài Gòn qua ẩm thực, câu chuyện, khu chợ và những người làm nghề.",
    );
    expect(dictionary.home.heroPrimaryCta).toBe("Khám phá tour Sài Gòn");
    expect(dictionary.home.heroSecondaryCta).toBe("Thiết kế hành trình riêng");
    expect(dictionary.home.heroImageAlt).toBe(
      "Nghệ nhân lớn tuổi đan giỏ mây ở Sài Gòn",
    );
    expect(dictionary.home.heroInsetAlt).toBe(
      "Mặt tiền mái vòm Bưu điện Trung tâm Sài Gòn",
    );
    expect(dictionary.home.heroCoordinates).toBe("10.8231° B · 106.6297° Đ");
    expect(dictionary.home.experienceCategories.map(({ key }) => key)).toEqual([
      "street_food",
      "history",
      "traditional_craft",
      "traditional_market",
    ]);
    expect(dictionary.navigation.experiences).toBe("Trải nghiệm");
    expect(dictionary.navigation.privateJourneys).toBe("Hành trình riêng");
    expect(dictionary.navigation.ourCity).toBe("Thành phố của chúng ta");
  });

  it("contains complete customer food and payment-split copy in both locales", () => {
    for (const locale of ["en", "vi"] as const) {
      const preview = getDictionary(locale).home.personalizationForm.preview;
      const planner = getDictionary(locale).planner;
      const customRequest = getDictionary(locale).customRequest;

      for (const value of [
        preview.vendorLabel,
        preview.menuItemLabel,
        preview.quantityLabel,
        preview.estimatedRangeLabel,
        preview.payAtVendorLabel,
        preview.foodCostUnavailableLabel,
        preview.foodNotSelectedLabel,
        preview.budgetWarningMessage,
        planner.vendorLabel,
        planner.menuItemLabel,
        planner.quantityLabel,
        planner.estimatedRangeLabel,
        planner.payAtVendorLabel,
        planner.foodCostUnavailableLabel,
        planner.foodNotSelectedLabel,
        customRequest.vendorLabel,
        customRequest.menuItemLabel,
        customRequest.quantityLabel,
        customRequest.estimatedRangeLabel,
        customRequest.payAtVendorLabel,
        customRequest.foodCostUnavailableLabel,
        customRequest.foodNotSelectedLabel,
      ]) {
        expect(value).toEqual(expect.any(String));
        expect(value.length).toBeGreaterThan(0);
      }
    }
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
