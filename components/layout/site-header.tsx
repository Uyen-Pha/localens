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
    /** Legacy aliases remain accepted for isolated component consumers. */
    experiences?: string;
    privateJourneys?: string;
    ourCity?: string;
    tours?: string;
    personalizedTrip?: string;
    howItWorks?: string;
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
  const usesProductionAlignedNavigation = labels.navigation.tours !== undefined ||
    labels.navigation.personalizedTrip !== undefined ||
    labels.navigation.howItWorks !== undefined;
  const toursLabel = labels.navigation.tours ?? labels.navigation.experiences ?? "Tours";
  const personalizedTripLabel = labels.navigation.personalizedTrip ?? labels.navigation.privateJourneys ?? "Personalized trip";
  const howItWorksLabel = labels.navigation.howItWorks ?? labels.navigation.ourCity ?? "How it works";

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="site-header__brand" href={`/${locale}/`}>
          {labels.brand}
        </Link>

        <nav className="site-header__nav" aria-label={labels.navigation.primary}>
          <Link href={`/${locale}/tours/`}>{toursLabel}</Link>
          <Link href={`/${locale}/planner/`}>{personalizedTripLabel}</Link>
          <Link href={`/${locale}/#${usesProductionAlignedNavigation ? "how-it-works" : "experiences"}`}>
            {howItWorksLabel}
          </Link>
        </nav>

        <div className="site-header__actions">
          <LocaleSwitcher
            locale={locale}
            labels={labels.language}
            pathname={pathname}
            search={search}
            hash={hash}
          />
          {usesProductionAlignedNavigation ? (
            <Link className="site-header__cta" href={`/${locale}/sign-in/`}>
              {labels.navigation.signIn}
            </Link>
          ) : (
            <span
              className="site-header__cta site-header__cta--disabled"
              aria-disabled="true"
            >
              {labels.navigation.signIn}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
