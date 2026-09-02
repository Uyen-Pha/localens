import type { Locale } from "@/lib/i18n/config";

export type PortalRole = "customer" | "guide" | "admin";

const MAX_RETURN_TO_LENGTH = 2048;
const RETURN_TO_BASE = "https://localens.invalid";

export function parseSafeReturnTo(locale: Locale, candidate: string | null): string | null {
  if (candidate === null || candidate.length > MAX_RETURN_TO_LENGTH) return null;
  if (/[\\\p{Cc}]/u.test(candidate)) return null;
  const bookingPrefix = `/${locale}/booking/`;
  if (!candidate.startsWith(bookingPrefix)) return null;

  try {
    const parsed = new URL(candidate, RETURN_TO_BASE);
    if (parsed.origin !== RETURN_TO_BASE || !parsed.pathname.startsWith(bookingPrefix) || parsed.hash) {
      return null;
    }
    return candidate;
  } catch {
    return null;
  }
}

export function signInPath(locale: Locale, returnTo?: string | null): string {
  const safeReturnTo = parseSafeReturnTo(locale, returnTo ?? null);
  const path = `/${locale}/sign-in/`;
  return safeReturnTo === null ? path : `${path}?returnTo=${encodeURIComponent(safeReturnTo)}`;
}

export function destinationAfterSignIn({
  locale,
  role,
  returnTo,
}: {
  locale: Locale;
  role: PortalRole;
  returnTo?: string | null;
}): string {
  if (role === "customer") {
    return parseSafeReturnTo(locale, returnTo ?? null) ?? `/${locale}/account/`;
  }
  return `/${locale}/${role}/`;
}
