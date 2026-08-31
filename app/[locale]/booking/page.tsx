import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DemoBookingEntry } from "@/components/customer/demo-booking-entry";
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
  const copy = getDictionary(locale).booking;
  return {
    title: `${copy.heading} | LocalLens`,
    robots: { index: false, follow: false },
  };
}

export default async function BookingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <div className="booking-page">
      <DemoBookingEntry locale={locale} copy={getDictionary(locale).booking} />
    </div>
  );
}
