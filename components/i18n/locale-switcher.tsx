"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isLocale, type Locale } from "@/lib/i18n/config";

export type LocaleSwitcherLabels = {
  label: string;
  options: Record<Locale, string>;
};

export type LocaleSwitcherProps = {
  locale: Locale;
  labels: LocaleSwitcherLabels;
  pathname?: string | null;
};

function alternateLocale(locale: Locale): Locale {
  return locale === "en" ? "vi" : "en";
}

export function getEquivalentLocalePath(
  pathname: string | null | undefined,
  targetLocale: Locale,
): string {
  const path = pathname?.startsWith("/") ? pathname : "/";
  const segments = path.split("/");

  if (isLocale(segments[1])) {
    segments[1] = targetLocale;
    return segments.join("/") || `/${targetLocale}/`;
  }

  return path === "/" ? `/${targetLocale}/` : `/${targetLocale}${path}`;
}

export function LocaleSwitcher({
  locale,
  labels,
  pathname: pathnameProp,
}: LocaleSwitcherProps) {
  const pathname = usePathname();
  const targetLocale = alternateLocale(locale);

  return (
    <nav className="locale-switcher" aria-label={labels.label}>
      <Link
        className="locale-switcher__link"
        href={getEquivalentLocalePath(
          pathnameProp ?? pathname,
          targetLocale,
        )}
      >
        {labels.options[targetLocale]}
      </Link>
    </nav>
  );
}
