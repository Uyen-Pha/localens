import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PlannerSurface } from "@/components/customer/planner-surface";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

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
    title: `${getDictionary(locale).planner.heading} | LocalLens`,
    robots: { index: false, follow: false },
  };
}

export default async function PlannerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <div className="journey-page journey-page--planner">
      <PlannerSurface locale={locale} copy={getDictionary(locale).planner} />
    </div>
  );
}
