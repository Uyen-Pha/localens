// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROUTES = [
  "sign-in",
  "account",
  "guide",
  "admin",
] as const;

describe("portal route contracts", () => {
  it("defines every bilingual static portal route", () => {
    for (const route of ROUTES) {
      const source = readFileSync(join(process.cwd(), `app/[locale]/${route}/page.tsx`), "utf8");

      expect(source).toContain("dynamicParams = false");
      expect(source).toContain("generateStaticParams");
      expect(source).toContain('{ locale: "en" }');
      expect(source).toContain('{ locale: "vi" }');
      expect(source).toContain("PortalSurface");
    }
  });

  it("marks all portal routes as noindex and validates locale params", () => {
    for (const route of ROUTES) {
      const source = readFileSync(join(process.cwd(), `app/[locale]/${route}/page.tsx`), "utf8");

      expect(source).toMatch(/robots:\s*\{\s*index:\s*false/);
      expect(source).toContain("isLocale(locale)");
      expect(source).toContain("notFound()");
    }
  });

  it("keeps sign-in metadata generic in both locales", () => {
    const source = readFileSync(join(process.cwd(), "app/[locale]/sign-in/page.tsx"), "utf8");

    expect(source).toContain('"Sign in | LocalLens"');
    expect(source).toContain('"Đăng nhập | LocalLens"');
    expect(source).not.toContain("Demo sign in | LocalLens");
    expect(source).not.toContain("Đăng nhập demo | LocalLens");
  });
});
