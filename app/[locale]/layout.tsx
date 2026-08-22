import type { Metadata } from "next";
import type { ReactNode } from "react";

import "../globals.css";

import { isLocale } from "@/lib/i18n/config";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "LocalLens",
  description: "Cultural experiences in Ho Chi Minh City.",
};

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "vi" }];
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
