import { describe, expect, it } from "vitest";

import { DEFAULT_LOCALE, isLocale, LOCALES } from "@/lib/i18n/config";

describe("locale contract", () => {
  it("accepts only the two published locales", () => {
    expect(LOCALES).toEqual(["en", "vi"]);
    expect(DEFAULT_LOCALE).toBe("en");
    expect(isLocale("en")).toBe(true);
    expect(isLocale("vi")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(1)).toBe(false);
  });
});
