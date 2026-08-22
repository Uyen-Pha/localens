"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { isLocale, type Locale } from "@/lib/i18n/config";

export type LocaleSwitcherLabels = {
  label: string;
  options: Record<Locale, string>;
};

export type LocaleSwitcherProps = {
  locale: Locale;
  labels: LocaleSwitcherLabels;
  pathname?: string | null;
  search?: string | null;
};

function alternateLocale(locale: Locale): Locale {
  return locale === "en" ? "vi" : "en";
}

export function getEquivalentLocalePath(
  pathname: string | null | undefined,
  targetLocale: Locale,
  search = "",
): string {
  const path = pathname?.startsWith("/") ? pathname : "/";
  const segments = path.split("/");

  if (isLocale(segments[1])) {
    segments[1] = targetLocale;
    return `${segments.join("/") || `/${targetLocale}/`}${search}`;
  }

  return `${path === "/" ? `/${targetLocale}/` : `/${targetLocale}${path}`}${search}`;
}

function LocaleSwitcherLink({
  locale,
  labels,
  pathname: pathnameProp,
  search: searchProp,
}: LocaleSwitcherProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const targetLocale = alternateLocale(locale);
  const search =
    searchProp !== undefined
      ? searchProp ?? ""
      : typeof window === "undefined"
        ? searchParams.toString()
          ? `?${searchParams.toString()}`
          : ""
        : window.location.search;

  return (
    <Link
      className="locale-switcher__link"
      href={getEquivalentLocalePath(pathnameProp ?? pathname, targetLocale, search)}
    >
      {labels.options[targetLocale]}
    </Link>
  );
}

function LocaleSwitcherFallback({
  locale,
  labels,
  pathname,
  search,
}: LocaleSwitcherProps) {
  const targetLocale = alternateLocale(locale);
  const fallbackSearch =
    search ?? (typeof window === "undefined" ? "" : window.location.search);

  return (
    <Link
      className="locale-switcher__link"
      href={getEquivalentLocalePath(pathname, targetLocale, fallbackSearch)}
    >
      {labels.options[targetLocale]}
    </Link>
  );
}

export function LocaleSwitcher(props: LocaleSwitcherProps) {
  return (
    <nav className="locale-switcher" aria-label={props.labels.label}>
      <Suspense fallback={<LocaleSwitcherFallback {...props} />}>
        <LocaleSwitcherLink {...props} />
      </Suspense>
    </nav>
  );
}
