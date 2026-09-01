import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FixedTourRouteSurface } from "@/components/customer/fixed-tour-route-surface";
import { isLocale } from "@/lib/i18n/config";
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
  return <FixedTourRouteSurface locale={locale} route="tours" />;
}
