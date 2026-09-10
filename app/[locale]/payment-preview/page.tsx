import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { PaymentPreview } from "@/components/dev/payment-preview";

export const metadata = { title: "Thanh toán | LocalLens", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {

  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <PaymentPreview locale={locale} />;
}
