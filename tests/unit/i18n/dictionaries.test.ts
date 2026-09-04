import { describe, expect, expectTypeOf, it } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { fixedTourRuntimeCopy } from "@/lib/i18n/fixed-tour-runtime";
import { portalCopy } from "@/components/portals/portal-copy";

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

  it.each([
    {
      locale: "en" as const,
      badge: "Thesis demo",
      ai: "Gemini assisted with ranking; LocalLens validated the timing and cost.",
      fallback: "AI is temporarily unavailable; LocalLens used the safe deterministic fallback.",
      quota: "The thesis-demo AI limit has been reached today. LocalLens will not retry automatically; try again after the quota resets.",
      payment: "Simulated payment — no card details are entered and no real charge occurs.",
    },
    {
      locale: "vi" as const,
      badge: "Bản demo đồ án",
      ai: "Gemini đã hỗ trợ xếp hạng; thời gian và chi phí do LocalLens kiểm tra.",
      fallback: "AI tạm không khả dụng; LocalLens đã dùng phương án xác định an toàn.",
      quota: "Đã đạt giới hạn AI của bản demo hôm nay. LocalLens sẽ không tự động thử lại; hãy thử sau khi hạn mức được làm mới.",
      payment: "Thanh toán mô phỏng — không nhập thông tin thẻ và không phát sinh giao dịch thật.",
    },
  ])("provides typed thesis-demo disclosures in $locale", ({
    locale,
    badge,
    ai,
    fallback,
    quota,
    payment,
  }) => {
    const dictionary = getDictionary(locale);

    expect(dictionary.thesisDemoLabel).toBe(badge);
    expect(dictionary.planner.runtimeAiDisclosure).toBe(ai);
    expect(dictionary.planner.runtimeFallbackDisclosure).toBe(fallback);
    expect(dictionary.planner.runtimeQuotaMessage).toBe(quota);
    expect(dictionary.planner.runtimeDisclosure).not.toMatch(/does not generate|chưa tạo hoặc lưu/i);
    expect(fixedTourRuntimeCopy(locale).simulationDisclosure).toBe(payment);
    expect(portalCopy(locale).simulatedPayment).toBe(payment);
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
