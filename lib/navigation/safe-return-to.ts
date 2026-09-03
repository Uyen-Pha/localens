import type { Locale } from "@/lib/i18n/config";

export type PortalRole = "customer" | "guide" | "admin";

const MAX_RETURN_TO_LENGTH = 2048;
const RETURN_TO_BASE = "https://localens.invalid";

function hasUnsafePathSegment(candidate: string): boolean {
  const rawPath = candidate.split("?", 1)[0];
  return rawPath.split("/").some((rawSegment) => {
    let decoded = rawSegment;
    try {
      while (decoded.includes("%")) {
        const next = decodeURIComponent(decoded);
        if (next === decoded) break;
        decoded = next;
      }
    } catch {
      return true;
    }
    return decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\");
  });
}

export function parseSafeReturnTo(locale: Locale, candidate: string | null): string | null {
  if (candidate === null || candidate.length > MAX_RETURN_TO_LENGTH) return null;
  if (/[\\\p{Cc}]/u.test(candidate) || candidate.includes("#") || hasUnsafePathSegment(candidate)) {
    return null;
  }
  const bookingPrefix = `/${locale}/booking/`;
  const plannerPath = `/${locale}/planner`;
  const customRequestPath = `/${locale}/custom-request`;
  const isPlannerPath = candidate === plannerPath || candidate === `${plannerPath}/`;
  const isCustomRequestPath = candidate === customRequestPath || candidate === `${customRequestPath}/`;
  if (!candidate.startsWith(bookingPrefix) && !isPlannerPath && !isCustomRequestPath) return null;

  try {
    const parsed = new URL(candidate, RETURN_TO_BASE);
    const isBookingPath = parsed.pathname.startsWith(bookingPrefix);
    const isAllowedExactPath = parsed.pathname === plannerPath || parsed.pathname === `${plannerPath}/`
      || parsed.pathname === customRequestPath || parsed.pathname === `${customRequestPath}/`;
    if (parsed.origin !== RETURN_TO_BASE || (!isBookingPath && !isAllowedExactPath) || parsed.hash) {
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
