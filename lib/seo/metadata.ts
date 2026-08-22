import type { Metadata } from "next";

import type { Locale } from "@/lib/i18n/config";

export const DEFAULT_PUBLIC_APP_URL = "https://localens.example.com";

const HOME_COPY: Record<Locale, { title: string; description: string }> = {
  en: {
    title: "LocalLens | Cultural experiences in Ho Chi Minh City",
    description:
      "Thoughtful cultural experiences in Ho Chi Minh City, planned through local eyes.",
  },
  vi: {
    title: "LocalLens | Trải nghiệm văn hóa tại Thành phố Hồ Chí Minh",
    description:
      "Trải nghiệm văn hóa tại Thành phố Hồ Chí Minh, được lên kế hoạch qua góc nhìn người bản địa.",
  },
};

const LOCALE_METADATA: Record<
  Locale,
  { openGraphLocale: string; alternateOpenGraphLocale: string }
> = {
  en: { openGraphLocale: "en_US", alternateOpenGraphLocale: "vi_VN" },
  vi: { openGraphLocale: "vi_VN", alternateOpenGraphLocale: "en_US" },
};

export function normalizePublicAppUrl(value?: string): string {
  const source = value?.trim() || DEFAULT_PUBLIC_APP_URL;
  const parsed = new URL(source);

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_APP_URL must use HTTP or HTTPS");
  }

  if (parsed.search || parsed.hash) {
    throw new Error("NEXT_PUBLIC_APP_URL must not include a query or hash");
  }

  return parsed.toString().replace(/\/+$/, "");
}

export function getPublicSiteUrl(): string {
  return normalizePublicAppUrl(process.env.NEXT_PUBLIC_APP_URL);
}

function localizedUrl(siteUrl: string, locale: Locale): string {
  return `${normalizePublicAppUrl(siteUrl)}/${locale}/`;
}

export function getLocalizedHomeMetadata(
  locale: Locale,
  siteUrl: string = getPublicSiteUrl(),
): Metadata {
  const normalizedSiteUrl = normalizePublicAppUrl(siteUrl);
  const copy = HOME_COPY[locale];
  const localeMetadata = LOCALE_METADATA[locale];

  return {
    metadataBase: new URL(normalizedSiteUrl),
    title: copy.title,
    description: copy.description,
    alternates: {
      canonical: localizedUrl(normalizedSiteUrl, locale),
      languages: {
        en: localizedUrl(normalizedSiteUrl, "en"),
        vi: localizedUrl(normalizedSiteUrl, "vi"),
      },
    },
    openGraph: {
      type: "website",
      siteName: "LocalLens",
      title: copy.title,
      description: copy.description,
      url: localizedUrl(normalizedSiteUrl, locale),
      locale: localeMetadata.openGraphLocale,
      alternateLocale: [localeMetadata.alternateOpenGraphLocale],
    },
  };
}

export function getHomeJsonLd(locale: Locale, siteUrl: string = getPublicSiteUrl()) {
  const normalizedSiteUrl = normalizePublicAppUrl(siteUrl);
  const copy = HOME_COPY[locale];

  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "LocalLens",
    url: localizedUrl(normalizedSiteUrl, locale),
    description: copy.description,
    inLanguage: locale,
    publisher: {
      "@type": "TravelAgency",
      name: "LocalLens",
      url: normalizedSiteUrl,
      areaServed: {
        "@type": "City",
        name: "Ho Chi Minh City",
      },
      availableLanguage: ["English", "Vietnamese"],
    },
  };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export function getSitemapEntries(siteUrl: string = getPublicSiteUrl()) {
  const normalizedSiteUrl = normalizePublicAppUrl(siteUrl);
  return ["en", "vi"].map((locale) => ({
    url: `${normalizedSiteUrl}/${locale}/`,
  }));
}
