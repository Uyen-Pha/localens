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
  hash?: string | null;
};

function alternateLocale(locale: Locale): Locale {
  return locale === "en" ? "vi" : "en";
}

export function getEquivalentLocalePath(
  pathname: string | null | undefined,
  targetLocale: Locale,
  search = "",
  hash = "",
): string {
  const path = pathname?.startsWith("/") ? pathname : "/";
  const segments = path.split("/");

  if (isLocale(segments[1])) {
    segments[1] = targetLocale;
    return `${segments.join("/") || `/${targetLocale}/`}${search}${hash}`;
  }

  return `${path === "/" ? `/${targetLocale}/` : `/${targetLocale}${path}`}${search}${hash}`;
}

function LocaleSwitcherLink({
  locale,
  labels,
  pathname: pathnameProp,
  search: searchProp,
  hash: hashProp,
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
  const hash =
    hashProp !== undefined
      ? hashProp ?? ""
      : typeof window === "undefined"
        ? ""
        : window.location.hash;

  return (
    <>
      <span className="locale-switcher__current" aria-current="page">
        {labels.options[locale]}
      </span>
      <span className="locale-switcher__separator" aria-hidden="true">
        /
      </span>
      <Link
        className="locale-switcher__link"
        href={getEquivalentLocalePath(
          pathnameProp ?? pathname,
          targetLocale,
          search,
          hash,
        )}
      >
        {labels.options[targetLocale]}
      </Link>
    </>
  );
}

function LocaleSwitcherFallback({
  locale,
  labels,
  pathname,
  search,
  hash,
}: LocaleSwitcherProps) {
  const targetLocale = alternateLocale(locale);
  const fallbackSearch =
    search ?? (typeof window === "undefined" ? "" : window.location.search);
  const fallbackHash =
    hash !== undefined
      ? hash ?? ""
      : typeof window === "undefined"
        ? ""
        : window.location.hash;

  return (
    <>
      <span className="locale-switcher__current" aria-current="page">
        {labels.options[locale]}
      </span>
      <span className="locale-switcher__separator" aria-hidden="true">
        /
      </span>
      <Link
        className="locale-switcher__link"
        href={getEquivalentLocalePath(
          pathname,
          targetLocale,
          fallbackSearch,
          fallbackHash,
        )}
      >
        {labels.options[targetLocale]}
      </Link>
    </>
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
