import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CustomerAccount } from "@/components/portals/customer-account";
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
    title: locale === "vi" ? "Quản lý tài khoản | LocalLens" : "My account | LocalLens",
    robots: { index: false, follow: false },
  };
}

export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return <CustomerAccount locale={locale} />;
}
