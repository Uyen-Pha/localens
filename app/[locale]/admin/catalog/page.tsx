import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CatalogReviewLiveQueue } from "@/components/admin/catalog-review-queue";
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
    title: locale === "vi" ? "Duyệt danh mục món ăn | LocalLens" : "Food catalog review | LocalLens",
    robots: { index: false, follow: false },
  };
}

export default async function CatalogReviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <div className="admin-page admin-page--catalog-review">
      <CatalogReviewLiveQueue locale={locale} />
    </div>
  );
}
