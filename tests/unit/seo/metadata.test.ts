import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const modulePath = path.resolve(process.cwd(), "lib/seo/metadata.ts");
const moduleUrl = pathToFileURL(modulePath).href;

async function loadSeoHelpers() {
  expect(existsSync(modulePath)).toBe(true);
  return import(moduleUrl);
}

describe("localized public SEO helpers", () => {
  it("normalizes the public site URL and uses the documented local fallback", async () => {
    const { normalizePublicAppUrl } = await loadSeoHelpers();

    expect(normalizePublicAppUrl("https://example.com///")).toBe(
      "https://example.com",
    );
    expect(normalizePublicAppUrl()).toBe("https://localens.example.com");
  });

  it("builds localized canonical, hreflang, and Open Graph metadata", async () => {
    const { getLocalizedHomeMetadata } = await loadSeoHelpers();
    const metadata = getLocalizedHomeMetadata("vi", "https://example.com");

    expect(metadata.title).toContain("LocalLens");
    expect(metadata.description).toContain("Thành phố Hồ Chí Minh");
    expect(metadata.alternates).toEqual({
      canonical: "https://example.com/vi/",
      languages: {
        en: "https://example.com/en/",
        vi: "https://example.com/vi/",
      },
    });
    expect(metadata.openGraph).toMatchObject({
      locale: "vi_VN",
      alternateLocale: ["en_US"],
      url: "https://example.com/vi/",
    });
  });

  it("builds fixed-tour metadata at the localized tours path", async () => {
    const { getLocalizedToursMetadata } = await loadSeoHelpers();
    const metadata = getLocalizedToursMetadata("en", "https://example.com");

    expect(metadata.alternates).toEqual({
      canonical: "https://example.com/en/tours/",
      languages: {
        en: "https://example.com/en/tours/",
        vi: "https://example.com/vi/tours/",
      },
    });
    expect(metadata.openGraph).toMatchObject({
      url: "https://example.com/en/tours/",
    });
  });

  it("serializes truthful bilingual homepage JSON-LD without unsafe markup", async () => {
    const { getHomeJsonLd, serializeJsonLd } = await loadSeoHelpers();
    const jsonLd = getHomeJsonLd("en", "https://example.com");
    const serialized = serializeJsonLd(jsonLd);

    expect(jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "LocalLens",
      url: "https://example.com/en/",
    });
    expect(JSON.stringify(jsonLd)).toContain("Ho Chi Minh City");
    expect(JSON.stringify(jsonLd)).toContain("TravelAgency");
    expect(JSON.stringify(jsonLd)).not.toMatch(/aggregateRating|review|telephone|address/i);
    expect(serialized).not.toContain("</script>");
    expect(JSON.parse(serialized)).toEqual(jsonLd);
  });

  it("lists localized home and fixed-tour routes", async () => {
    const { getSitemapEntries } = await loadSeoHelpers();

    expect(getSitemapEntries("https://example.com///")).toEqual([
      { url: "https://example.com/en/" },
      { url: "https://example.com/vi/" },
      { url: "https://example.com/en/tours/" },
      { url: "https://example.com/vi/tours/" },
    ]);
  });
});
