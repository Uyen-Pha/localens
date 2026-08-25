import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FixedToursGrid } from "@/components/customer/fixed-tours-grid";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import {
  getLocalizedHomeMetadata,
  getPublicSiteUrl,
} from "@/lib/seo/metadata";

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "vi" }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dictionary = getDictionary(locale);
  const metadata = getLocalizedHomeMetadata(locale, getPublicSiteUrl());
  return {
    ...metadata,
    title: `${dictionary.home.discoveryTitle} | LocalLens`,
  };
}

export default async function ToursPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dictionary = getDictionary(locale);
  const copy = dictionary.home;

  return (
    <div className="customer-home customer-tours-page">
      <section className="customer-section customer-section--discovery" aria-labelledby="fixed-tours-title">
        <div className="section-heading">
          <p className="eyebrow">{copy.discoveryEyebrow}</p>
          <h1 id="fixed-tours-title">{copy.discoveryTitle}</h1>
          <p>{copy.discoveryIntro}</p>
        </div>
        <FixedToursGrid locale={locale} copy={copy} hrefForTour={(id) => `#${id}`} headingLevel="h2" />
      </section>
    </div>
  );
}
