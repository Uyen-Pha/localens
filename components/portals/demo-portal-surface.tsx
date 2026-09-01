"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";

import { clearLocalLensDemoStorage } from "@/lib/application/demo/reset-demo";
import type { DemoPortalComposition } from "@/lib/application/portal/composition";
import type { DemoPortalIdentity } from "@/lib/application/portal/contracts";
import type { Locale } from "@/lib/i18n/config";

import { AdminPortal } from "@/components/portals/admin-portal";
import { CustomerPortal } from "@/components/portals/customer-portal";
import { GuidePortal } from "@/components/portals/guide-portal";
import { PortalNav, PortalNotice } from "@/components/portals/portal-chrome";
import { portalCopy, portalPath, roleLabel, signedInRoleText } from "@/components/portals/portal-copy";
import type { PortalNavigate, PortalRole } from "@/components/portals/portal-surface";
import styles from "@/components/portals/portal.module.css";

export interface DemoPortalSurfaceProps {
  locale: Locale;
  expectedRole?: PortalRole;
  composition: DemoPortalComposition;
  navigate: PortalNavigate;
}

type LoadState = "loading" | "ready" | "error";

const DEMO_IDENTITIES: ReadonlyArray<{
  userId: string;
  role: PortalRole;
  displayName: string;
  email: string;
}> = [
  { userId: "demo-user-customer", role: "customer", displayName: "Demo Traveler", email: "traveler@example.invalid" },
  { userId: "demo-user-guide", role: "guide", displayName: "Demo Guide", email: "guide@example.invalid" },
  { userId: "demo-user-admin", role: "admin", displayName: "Demo Administrator", email: "admin@example.invalid" },
  { userId: "demo-user-secondary-customer", role: "customer", displayName: "Second Demo Traveler", email: "traveler-secondary@example.invalid" },
];

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
    <div className={styles.page} data-portal-mode="demo">
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
        <p className={styles.srStatus} role="status" aria-live="polite">{copy.loading}</p>
      </div>
    </PortalFrame>
  );
}

function PortalLoadError({ locale, onRetry }: { locale: Locale; onRetry: () => void }) {
  const copy = portalCopy(locale);
  return (
    <PortalFrame locale={locale} session={null} onSignOut={() => undefined}>
      <div className={styles.centerState} role="alert">
        <p className={styles.eyebrow}>{copy.demoOnly}</p>
        <h1>{copy.errorTitle}</h1>
        <p>{copy.errorMessage}</p>
        <div className={styles.actions}>
          <button className={styles.button} type="button" onClick={onRetry}>{copy.retry}</button>
        </div>
      </div>
    </PortalFrame>
  );
}

function SignInPortal({
  locale,
  composition,
  session,
  navigate,
  onSessionSelected,
}: {
  locale: Locale;
  composition: DemoPortalComposition;
  session: DemoPortalIdentity | null;
  navigate: PortalNavigate;
  onSessionSelected: (session: DemoPortalIdentity | null) => void;
}) {
  const copy = portalCopy(locale);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetStatus, setResetStatus] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  async function selectIdentity(event: MouseEvent<HTMLAnchorElement>, userId: string, role: PortalRole): Promise<void> {
    event.preventDefault();
    if (selectedId !== null) return;
    setSelectedId(userId);
    setError(null);
    try {
      const nextSession = await composition.session.selectDemoIdentity(userId);
      onSessionSelected(nextSession);
      navigate(portalPath(locale, role));
    } catch {
      setSelectedId(null);
      setError(copy.errorMessage);
    }
  }

  async function resetDemo(): Promise<void> {
    if (resetting || selectedId !== null) return;
    setResetting(true);
    setError(null);
    setResetStatus(null);
    try {
      clearLocalLensDemoStorage({ session: window.sessionStorage, local: window.localStorage });
      await composition.resetDemo();
      onSessionSelected(null);
      setResetStatus(copy.resetComplete);
    } catch {
      setError(copy.resetError);
    } finally {
      setResetting(false);
      window.setTimeout(() => headingRef.current?.focus(), 0);
    }
  }

  return (
    <PortalFrame locale={locale} session={session} onSignOut={() => undefined}>
      <PortalNotice locale={locale} />
      <section className={styles.signInHero} aria-labelledby="portal-sign-in-heading">
        <p className={styles.eyebrow}>{copy.chooseIdentity}</p>
        <h1 id="portal-sign-in-heading" ref={headingRef} tabIndex={-1}>{copy.signInHeading}</h1>
        <p>{copy.signInIntro}</p>
        <p className={styles.hint}>{copy.signInDisclosure}</p>
        <div className={styles.actions}>
          <Link className={`${styles.button} ${styles.buttonSecondary}`} href={`/${locale}/sign-in/`}>{copy.chooseIdentity}</Link>
          <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={resetting || selectedId !== null} onClick={() => void resetDemo()}>
            {resetting ? copy.resettingDemo : copy.resetDemo}
          </button>
        </div>
      </section>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {resetStatus ? <p className={styles.srStatus} role="status">{resetStatus}</p> : null}

      <div className={styles.identityGrid}>
        {DEMO_IDENTITIES.map((identity) => (
          <article className={styles.identityCard} key={identity.userId}>
            <p className={styles.eyebrow}>{roleLabel(locale, identity.role)}</p>
            <h2>{identity.displayName}</h2>
            <p>{identity.email}</p>
            <Link
              className={styles.button}
              href={portalPath(locale, identity.role)}
              aria-disabled={selectedId !== null}
              onClick={(event) => void selectIdentity(event, identity.userId, identity.role)}
            >
              {selectedId === identity.userId ? copy.loading : `${copy.continueAs} ${roleLabel(locale, identity.role)}`}
            </Link>
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
        <p>{signedInRoleText(locale, session.role)}</p>
        <div className={styles.actions}>
          <Link className={styles.button} href={portalPath(locale, session.role)}>{copy.openYourPortal}</Link>
        </div>
      </div>
    </PortalFrame>
  );
}

export function DemoPortalSurface({ locale, expectedRole, composition, navigate }: DemoPortalSurfaceProps) {
  const [session, setSession] = useState<DemoPortalIdentity | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let disposed = false;
    setLoadState("loading");
    const initialization = retryKey === 0 ? composition.initialized : composition.retryInitialization();
    void initialization
      .then(() => composition.session.getSession())
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
  }, [composition, retryKey]);

  if (loadState === "loading") return <LoadingPortal locale={locale} />;
  if (loadState === "error") return <PortalLoadError locale={locale} onRetry={() => setRetryKey((key) => key + 1)} />;

  function signOut(): void {
    void composition.session.signOut().then(() => setSession(null));
  }

  if (expectedRole === undefined || session === null) {
    return <SignInPortal locale={locale} composition={composition} session={session} navigate={navigate} onSessionSelected={setSession} />;
  }
  if (session.role !== expectedRole) {
    return <AccessDeniedPortal locale={locale} session={session} expectedRole={expectedRole} onSignOut={signOut} />;
  }
  if (expectedRole === "customer") {
    return <CustomerPortal locale={locale} composition={composition} session={session} onSignOut={signOut} />;
  }
  if (expectedRole === "guide") {
    return <GuidePortal locale={locale} composition={composition} session={session} onSignOut={signOut} />;
  }
  return <AdminPortal locale={locale} composition={composition} session={session} onSignOut={signOut} />;
}
