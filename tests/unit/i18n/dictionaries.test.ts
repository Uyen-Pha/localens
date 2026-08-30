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
    expect(dictionary.navigation.experiences).toBe("Experiences");
    expect(dictionary.navigation.privateJourneys).toBe("Private journeys");
    expect(dictionary.navigation.ourCity).toBe("Our city");
  });

  it("contains the published Vietnamese copy", () => {
    const dictionary = getDictionary("vi");

    expect(dictionary.home.title).toBe(
      "Khám phá Thành phố Hồ Chí Minh qua góc nhìn người bản địa.",
    );
    expect(dictionary.home.subtitle).toBe(
      "Trải nghiệm văn hóa đích thực, được lên kế hoạch dành riêng cho bạn.",
    );
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
