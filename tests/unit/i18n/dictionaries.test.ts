import { describe, expect, expectTypeOf, it } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

describe("localized dictionaries", () => {
  it("contains the published English copy", () => {
    const dictionary = getDictionary("en");

    expect(dictionary.home.title).toBe(
      "Your Saigon, planned around you",
    );
    expect(dictionary.home.subtitle).toBe(
      "Tell us your time, budget and interests. We’ll shape a route you can review and refine.",
    );
    expect(dictionary.home.heroPrimaryCta).toBe("Plan my Saigon day");
    expect(dictionary.home.heroSecondaryCta).toBe("Browse ready-made tours");
    expect(dictionary.home.heroImageAlt).toBe(
      "Illustrated map of central Saigon with a suggested route",
    );
    expect(dictionary.home.heroInsetAlt).toBe(
      "Ben Thanh Market clock tower in Ho Chi Minh City",
    );
    expect(dictionary.home.heroCoordinates).toBe("SAIGON · 10.8231° N · 106.6297° E");
    expect(dictionary.home.personalizationForm.durationLabel).toBe("How much time do you have?");
    expect(dictionary.home.personalizationForm.durationHoursLabel).toBe("Hours");
    expect(dictionary.home.personalizationForm.durationMinutesLabel).toBe("Minutes");
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
      "Sài Gòn của bạn, được thiết kế quanh bạn",
    );
    expect(dictionary.home.subtitle).toBe(
      "Hãy cho chúng tôi biết thời gian, ngân sách và điều bạn quan tâm. Chúng tôi sẽ tạo một tuyến đường để bạn xem lại và điều chỉnh.",
    );
    expect(dictionary.home.heroPrimaryCta).toBe("Lên kế hoạch ngày ở Sài Gòn");
    expect(dictionary.home.heroSecondaryCta).toBe("Xem các tour có sẵn");
    expect(dictionary.home.heroImageAlt).toBe(
      "Bản đồ minh họa khu trung tâm Sài Gòn với tuyến đường gợi ý",
    );
    expect(dictionary.home.heroInsetAlt).toBe(
      "Tháp đồng hồ chợ Bến Thành tại Thành phố Hồ Chí Minh",
    );
    expect(dictionary.home.heroCoordinates).toBe("SÀI GÒN · 10.8231° B · 106.6297° Đ");
    expect(dictionary.home.personalizationForm.durationLabel).toBe("Bạn có bao nhiêu thời gian?");
    expect(dictionary.home.personalizationForm.durationHoursLabel).toBe("Giờ");
    expect(dictionary.home.personalizationForm.durationMinutesLabel).toBe("Phút");
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
