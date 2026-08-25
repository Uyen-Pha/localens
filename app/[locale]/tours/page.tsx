import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TourCatalogExplorer } from "@/components/customer/tour-catalog-explorer";
import { createReadOnlyApi } from "@/lib/application/api/read-only-api";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import {
  getLocalizedToursMetadata,
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
  return getLocalizedToursMetadata(locale, getPublicSiteUrl());
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
  const catalogResult = createReadOnlyApi().listTours(locale);

  return (
    <div className="customer-home customer-tours-page">
      <section className="customer-section customer-section--discovery" aria-labelledby="fixed-tours-title">
        <div className="section-heading">
          <p className="eyebrow">{copy.discoveryEyebrow}</p>
          <h1 id="fixed-tours-title">{copy.tourCatalog.catalogHeading}</h1>
          <p>{copy.tourCatalog.catalogIntro}</p>
        </div>
        <TourCatalogExplorer
          locale={locale}
          copy={copy.tourCatalog}
          areaOptions={copy.tourCatalog.areaOptions}
          initialCatalog={catalogResult.ok ? catalogResult.value : null}
          initialError={catalogResult.ok ? null : {
            retryable: catalogResult.error.retryable,
            correlationId: catalogResult.error.correlationId,
          }}
        />
      </section>
    </div>
  );
}
