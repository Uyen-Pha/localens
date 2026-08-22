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
    explore: string;
    fixedTours: string;
    planTrip: string;
    signIn: string;
  };
  language: LocaleSwitcherLabels;
};

export type SiteHeaderProps = {
  locale: Locale;
  labels: SiteHeaderLabels;
  pathname?: string | null;
};

export function SiteHeader({ locale, labels, pathname }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="site-header__brand" href={`/${locale}/`}>
          {labels.brand}
        </Link>

        <nav className="site-header__nav" aria-label={labels.navigation.primary}>
          <Link href={`/${locale}/explore/`}>{labels.navigation.explore}</Link>
          <Link href={`/${locale}/tours/`}>
            {labels.navigation.fixedTours}
          </Link>
          <Link href={`/${locale}/plan/`}>{labels.navigation.planTrip}</Link>
        </nav>

        <div className="site-header__actions">
          <LocaleSwitcher
            locale={locale}
            labels={labels.language}
            pathname={pathname}
          />
          <Link className="site-header__cta" href={`/${locale}/sign-in/`}>
            {labels.navigation.signIn}
          </Link>
        </div>
      </div>
    </header>
  );
}
