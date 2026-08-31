import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PortalSurface } from "@/components/portals/portal-surface";
import { isLocale } from "@/lib/i18n/config";

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

  return {
    title: locale === "vi" ? "Cổng hướng dẫn viên | LocalLens" : "Guide portal | LocalLens",
    robots: { index: false, follow: false },
  };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return <PortalSurface locale={locale} expectedRole="guide" />;
}
