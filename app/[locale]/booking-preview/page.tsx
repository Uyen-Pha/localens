import { notFound } from "next/navigation";
import { BookingLocalPreview } from "@/components/dev/booking-local-preview";
import { isLocale } from "@/lib/i18n/config";

export const metadata = { title: "Booking UI preview | LocalLens", robots: { index: false, follow: false } };

export default async function BookingPreviewPage({ params }: { params: Promise<{ locale: string }> }) {
  // A local design fixture, never a production authentication path.
  if (process.env.NODE_ENV !== "development") notFound();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <BookingLocalPreview locale={locale} />;
}
