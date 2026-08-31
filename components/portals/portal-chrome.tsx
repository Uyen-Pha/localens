"use client";

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
      <a className={styles.localBrand} href={`/${locale}/`}>
        {copy.brand}
      </a>
      <div className={styles.localNavLinks}>
        {session?.role === "customer" ? (
          <a href={`/${locale}/account/`}>{copy.accountNav}</a>
        ) : null}
        {session?.role === "guide" ? (
          <a href={`/${locale}/guide/`}>{copy.guideNav}</a>
        ) : null}
        {session?.role === "admin" ? (
          <a href={`/${locale}/admin/`}>{copy.adminNav}</a>
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
