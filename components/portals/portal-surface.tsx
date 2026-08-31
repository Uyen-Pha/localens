"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import {
  type DemoPortalIdentity,
  type PortalMode,
} from "@/lib/application/portal/contracts";
import type { Locale } from "@/lib/i18n/config";
import type { DemoPortalComposition } from "@/lib/application/portal/composition";

import { AdminPortal } from "@/components/portals/admin-portal";
import { CustomerPortal } from "@/components/portals/customer-portal";
import { GuidePortal } from "@/components/portals/guide-portal";
import { getDemoPortalComposition } from "@/components/portals/portal-session";
import { portalCopy, portalPath, roleLabel } from "@/components/portals/portal-copy";
import { PortalNav, PortalNotice } from "@/components/portals/portal-chrome";
import styles from "@/components/portals/portal.module.css";

export type PortalRole = "customer" | "guide" | "admin";

export interface PortalSurfaceProps {
  locale: Locale;
  expectedRole?: PortalRole;
  /** Injected by tests and by a future integration boundary; the route defaults to the browser singleton. */
  composition?: DemoPortalComposition;
}

type LoadState = "loading" | "ready" | "error";

const DEMO_IDENTITIES: ReadonlyArray<{
  userId: string;
  role: PortalRole;
  displayName: string;
  email: string;
}> = [
  {
    userId: "demo-user-customer",
    role: "customer",
    displayName: "Demo Traveler",
    email: "traveler@example.invalid",
  },
  {
    userId: "demo-user-guide",
    role: "guide",
    displayName: "Demo Guide",
    email: "guide@example.invalid",
  },
  {
    userId: "demo-user-admin",
    role: "admin",
    displayName: "Demo Administrator",
    email: "admin@example.invalid",
  },
  {
    userId: "demo-user-secondary-customer",
    role: "customer",
    displayName: "Second Demo Traveler",
    email: "traveler-secondary@example.invalid",
  },
];

function rolePathFor(identity: Pick<DemoPortalIdentity, "role">, locale: Locale): string {
  return portalPath(locale, identity.role);
}

function roleRouteLabel(locale: Locale, role: PortalRole): string {
  return roleLabel(locale, role);
}

function PortalFrame({
  locale,
  session,
  onSignOut,
  children,
}: {
  locale: Locale;
  session: DemoPortalIdentity | null;
  onSignOut: () => void;
  children: ReactNode;
}) {
  return (
    <div className={styles.page} data-portal-mode={"demo" satisfies PortalMode}>
      <div className={styles.surface}>
        <PortalNav locale={locale} session={session} onSignOut={onSignOut} />
        {children}
      </div>
    </div>
  );
}

function LoadingPortal({ locale }: { locale: Locale }) {
  const copy = portalCopy(locale);
  return (
    <PortalFrame locale={locale} session={null} onSignOut={() => undefined}>
      <div className={styles.centerState}>
        <p className={styles.eyebrow}>{copy.eyebrow}</p>
        <p className={styles.srStatus} role="status" aria-live="polite">
          {copy.loading}
        </p>
      </div>
    </PortalFrame>
  );
}

function PortalLoadError({ locale, onRetry }: { locale: Locale; onRetry: () => void }) {
  const copy = portalCopy(locale);
  return (
    <PortalFrame locale={locale} session={null} onSignOut={() => undefined}>
      <div className={styles.centerState}>
        <p className={styles.eyebrow}>{copy.demoOnly}</p>
        <h1>{copy.errorTitle}</h1>
        <p>{copy.errorMessage}</p>
        <div className={styles.actions}>
          <button className={styles.button} type="button" onClick={onRetry}>
            {copy.retry}
          </button>
        </div>
      </div>
    </PortalFrame>
  );
}

export function SignInPortal({
  locale,
  composition,
  session,
}: {
  locale: Locale;
  composition: DemoPortalComposition;
  session: DemoPortalIdentity | null;
}) {
  const copy = portalCopy(locale);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function selectIdentity(userId: string, role: PortalRole): Promise<void> {
    setSelectedId(userId);
    setError(null);
    try {
      await composition.session.selectDemoIdentity(userId);
      if (typeof window !== "undefined") {
        window.location.assign(rolePathFor({ role }, locale));
      }
    } catch {
      setSelectedId(null);
      setError(copy.errorMessage);
    }
  }

  return (
    <PortalFrame locale={locale} session={session} onSignOut={() => undefined}>
      <PortalNotice locale={locale} />
      <section className={styles.signInHero} aria-labelledby="portal-sign-in-heading">
        <p className={styles.eyebrow}>{copy.chooseIdentity}</p>
        <h1 id="portal-sign-in-heading">{copy.signInHeading}</h1>
        <p>{copy.signInIntro}</p>
        <p className={styles.hint}>{copy.signInDisclosure}</p>
        <div className={styles.actions}>
          <a className={`${styles.button} ${styles.buttonSecondary}`} href={`/${locale}/sign-in/`}>
            {copy.chooseIdentity}
          </a>
        </div>
      </section>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.identityGrid}>
        {DEMO_IDENTITIES.map((identity) => (
          <article className={styles.identityCard} key={identity.userId}>
            <p className={styles.eyebrow}>{roleRouteLabel(locale, identity.role)}</p>
            <h2>{identity.displayName}</h2>
            <p>{identity.email}</p>
            <button
              className={styles.button}
              type="button"
              disabled={selectedId !== null}
              onClick={() => void selectIdentity(identity.userId, identity.role)}
            >
              {selectedId === identity.userId ? copy.loading : `${copy.continueAs} ${roleRouteLabel(locale, identity.role)}`}
            </button>
          </article>
        ))}
      </div>
    </PortalFrame>
  );
}

function AccessDeniedPortal({
  locale,
  session,
  expectedRole,
  onSignOut,
}: {
  locale: Locale;
  session: DemoPortalIdentity;
  expectedRole: PortalRole;
  onSignOut: () => void;
}) {
  const copy = portalCopy(locale);
  const heading = expectedRole === "customer"
    ? copy.accessDeniedTitle
    : expectedRole === "guide"
      ? copy.guideAccessDeniedTitle
      : copy.adminAccessDeniedTitle;
  return (
    <PortalFrame locale={locale} session={session} onSignOut={onSignOut}>
      <div className={styles.centerState}>
        <p className={styles.eyebrow}>{copy.demoOnly}</p>
        <h1>{heading}</h1>
        <p>{copy.accessDeniedMessage}</p>
        <p>{copy.signedInAsRole} {roleLabel(locale, session.role)}.</p>
        <div className={styles.actions}>
          <a className={styles.button} href={rolePathFor(session, locale)}>
            {copy.openYourPortal}
          </a>
        </div>
      </div>
    </PortalFrame>
  );
}

export function PortalSurface({ locale, expectedRole, composition: injectedComposition }: PortalSurfaceProps) {
  const [composition, setComposition] = useState<DemoPortalComposition | null>(injectedComposition ?? null);
  const [session, setSession] = useState<DemoPortalIdentity | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let disposed = false;
    setLoadState("loading");

    let activeComposition: DemoPortalComposition;
    try {
      activeComposition = injectedComposition ?? getDemoPortalComposition();
      setComposition(activeComposition);
    } catch {
      setLoadState("error");
      return () => undefined;
    }

    void activeComposition.initialized
      .then(() => activeComposition.session.getSession())
      .then((nextSession) => {
        if (disposed) return;
        setSession(nextSession);
        setLoadState("ready");
      })
      .catch(() => {
        if (disposed) return;
        setLoadState("error");
      });

    return () => {
      disposed = true;
    };
  }, [injectedComposition, retryKey]);

  if (loadState === "loading" || composition === null) return <LoadingPortal locale={locale} />;
  if (loadState === "error") return <PortalLoadError locale={locale} onRetry={() => setRetryKey((key) => key + 1)} />;

  const activeComposition = composition;

  function signOut(): void {
    void activeComposition.session.signOut().then(() => setSession(null));
  }

  if (expectedRole === undefined) {
    return <SignInPortal locale={locale} composition={activeComposition} session={session} />;
  }

  if (session === null) {
    return <SignInPortal locale={locale} composition={activeComposition} session={null} />;
  }

  if (session.role !== expectedRole) {
    return (
      <AccessDeniedPortal
        locale={locale}
        session={session}
        expectedRole={expectedRole}
        onSignOut={signOut}
      />
    );
  }

  if (expectedRole === "customer") {
    return <CustomerPortal locale={locale} composition={activeComposition} session={session} onSignOut={signOut} />;
  }
  if (expectedRole === "guide") {
    return <GuidePortal locale={locale} composition={activeComposition} session={session} onSignOut={signOut} />;
  }
  return <AdminPortal locale={locale} composition={activeComposition} session={session} onSignOut={signOut} />;
}
