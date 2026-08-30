import Link from "next/link";

import {
  LocaleSwitcher,
  type LocaleSwitcherLabels,
} from "@/components/i18n/locale-switcher";
import type { Locale } from "@/lib/i18n/config";

export type SiteHeaderLabels = {
  brand: string;
  navigation: {
    primary: string;
    experiences: string;
    privateJourneys: string;
    ourCity: string;
    signIn: string;
  };
  language: LocaleSwitcherLabels;
};

export type SiteHeaderProps = {
  locale: Locale;
  labels: SiteHeaderLabels;
  pathname?: string | null;
  search?: string | null;
  hash?: string | null;
};

export function SiteHeader({ locale, labels, pathname, search, hash }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="site-header__brand" href={`/${locale}/`}>
          {labels.brand}
        </Link>

        <nav className="site-header__nav" aria-label={labels.navigation.primary}>
          <Link href={`/${locale}/tours/`}>{labels.navigation.experiences}</Link>
          <Link href={`/${locale}/planner/`}>
            {labels.navigation.privateJourneys}
          </Link>
          <Link href={`/${locale}/#experiences`}>{labels.navigation.ourCity}</Link>
        </nav>

        <div className="site-header__actions">
          <LocaleSwitcher
            locale={locale}
            labels={labels.language}
            pathname={pathname}
            search={search}
            hash={hash}
          />
          <span
            className="site-header__cta site-header__cta--disabled"
            aria-disabled="true"
          >
            {labels.navigation.signIn}
          </span>
        </div>
      </div>
    </header>
  );
}
