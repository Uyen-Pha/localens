"use client";

import Link from "next/link";

import type { DemoPortalIdentity } from "@/lib/application/portal/contracts";
import type { Locale } from "@/lib/i18n/config";

import { portalCopy } from "@/components/portals/portal-copy";
import styles from "@/components/portals/portal.module.css";

export function PortalNotice({ locale }: { locale: Locale }) {
  const copy = portalCopy(locale);

  return (
    <p className={styles.demoNotice} role="note">
      <strong>{copy.demoOnly}.</strong> {copy.demoNotice}
    </p>
  );
}

export function PortalNav({
  locale,
  session,
  onSignOut,
}: {
  locale: Locale;
  session: DemoPortalIdentity | null;
  onSignOut: () => void;
}) {
  const copy = portalCopy(locale);

  return (
    <nav className={styles.localNav} aria-label={copy.brand}>
      <Link className={styles.localBrand} href={`/${locale}/`}>
        {copy.brand}
      </Link>
      <div className={styles.localNavLinks}>
        {session?.role === "customer" ? (
          <Link href={`/${locale}/account/`}>{copy.accountNav}</Link>
        ) : null}
        {session?.role === "guide" ? (
          <Link href={`/${locale}/guide/`}>{copy.guideNav}</Link>
        ) : null}
        {session?.role === "admin" ? (
          <Link href={`/${locale}/admin/`}>{copy.adminNav}</Link>
        ) : null}
        {session ? (
          <button type="button" onClick={onSignOut}>
            {copy.signOut}
          </button>
        ) : null}
      </div>
    </nav>
  );
}
