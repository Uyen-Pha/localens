import type { ReactNode } from "react";
import localFont from "next/font/local";

import "../globals.css";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { notFound } from "next/navigation";

const displayFont = localFont({
  src: "../../public/fonts/cormorant-garamond-600.woff2",
  weight: "600",
  style: "normal",
  display: "swap",
  preload: true,
  fallback: ["Georgia", "Times New Roman", "serif"],
  variable: "--font-display",
  adjustFontFallback: "Times New Roman",
});

const bodyFont = localFont({
  src: [
    {
      path: "../../public/fonts/manrope-400.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/manrope-600.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  display: "swap",
  preload: true,
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
  variable: "--font-body",
  adjustFontFallback: "Arial",
});

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

  const dictionary = getDictionary(locale);

  return (
    <html lang={locale} className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body>
        <a className="skip-link" href="#main-content">
          {dictionary.navigation.skipToContent}
        </a>
        <SiteHeader
          locale={locale}
          labels={{
            brand: dictionary.brand,
            navigation: dictionary.navigation,
            language: dictionary.language,
          }}
        />
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter locale={locale} labels={dictionary.footer} />
      </body>
    </html>
  );
}
