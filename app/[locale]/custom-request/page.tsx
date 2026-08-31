import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DemoCustomRequestEntry } from "@/components/customer/demo-custom-request-entry";
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
    title: `${getDictionary(locale).customRequest.heading} | LocalLens`,
    robots: { index: false, follow: false },
  };
}

export default async function CustomRequestPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <div className="journey-page journey-page--custom-request">
      <DemoCustomRequestEntry locale={locale} copy={getDictionary(locale).customRequest} />
    </div>
  );
}
