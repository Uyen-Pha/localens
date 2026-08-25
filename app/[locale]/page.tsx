import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CustomerHome } from "@/components/customer/customer-home";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import {
  getHomeJsonLd,
  getLocalizedHomeMetadata,
  getPublicSiteUrl,
  serializeJsonLd,
} from "@/lib/seo/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  return getLocalizedHomeMetadata(locale, getPublicSiteUrl());
}

export default async function LocaleHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = getDictionary(locale);
  const jsonLd = serializeJsonLd(getHomeJsonLd(locale, getPublicSiteUrl()));

  return (
    <>
      <CustomerHome locale={locale} dictionary={dictionary} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
    </>
  );
}
