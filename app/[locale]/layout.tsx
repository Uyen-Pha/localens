import type { ReactNode } from "react";

import "../globals.css";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { notFound } from "next/navigation";

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
    <html lang={locale}>
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
