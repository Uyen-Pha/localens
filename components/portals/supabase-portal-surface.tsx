"use client";

import Link from "next/link";
import {RuntimeSignIn} from "./runtime-sign-in";
import { lazy, Suspense, useEffect, useState } from "react";
import type { ReactNode } from "react";

import { PortalError, type PortalIdentity } from "@/lib/application/portal/contracts";
import type { SupabasePortalShell } from "@/lib/application/portal/supabase-shell";
import type { Locale } from "@/lib/i18n/config";
import { destinationAfterSignIn, parseSafeReturnTo } from "@/lib/navigation/safe-return-to";

import { portalCopy, portalPath, roleLabel, signedInRoleText } from "@/components/portals/portal-copy";
import type { PortalNavigate, PortalRole } from "@/components/portals/portal-surface";
import styles from "@/components/portals/portal.module.css";

export interface SupabasePortalSurfaceProps {
  locale: Locale;
  expectedRole?: PortalRole;
  returnTo?: string | null;
  composition: SupabasePortalShell;
  navigate: PortalNavigate;
}

type LoadState = "loading" | "ready" | "error";

const RuntimeFixedTourAccount = lazy(async () => {
  const module = await import("@/components/customer/runtime-fixed-tour-account");
  return { default: module.RuntimeFixedTourAccount };
});

const RuntimeBookingManagement = lazy(async () => {
  const module = await import("@/components/admin/runtime-booking-management");
  return { default: module.RuntimeBookingManagement };
});

const RuntimeGuideAssignmentQueue = lazy(async () => {
  const module = await import("@/components/admin/runtime-guide-assignment-queue");
  return { default: module.RuntimeGuideAssignmentQueue };
});

const RuntimeGuideAssignmentList = lazy(async () => {
  const module = await import("@/components/guide/runtime-guide-portal");
  return { default: module.RuntimeGuidePortal };
});

function isStaleRuntimeSession(error: unknown): error is PortalError {
  return error instanceof PortalError &&
    (error.code === "UNAUTHENTICATED" || error.code === "FORBIDDEN");
}

function createCorrelationId(): string {
  const value = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `LL-${value.toUpperCase()}`;
}

function RuntimeFrame({
  locale,
  session,
  onSignOut,
  children,
}: {
  locale: Locale;
  session: PortalIdentity | null;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const copy = portalCopy(locale);
  return (
    <div className={styles.page} data-portal-mode="supabase">
      <div className={styles.surface}>
        <nav className={styles.localNav} aria-label={copy.brand}>
          <Link className={styles.localBrand} href={`/${locale}/`}>{copy.brand}</Link>
          <div className={styles.localNavLinks}>
            {session ? <Link href={portalPath(locale, session.role)}>{roleLabel(locale, session.role)}</Link> : null}
            {session ? <button type="button" onClick={onSignOut}>{copy.signOut}</button> : null}
          </div>
        </nav>
        {children}
      </div>
    </div>
  );
}

function LoadingRuntime({ locale }: { locale: Locale }) {
  const copy = portalCopy(locale);
  return (
    <RuntimeFrame locale={locale} session={null} onSignOut={() => undefined}>
      <div className={styles.centerState}>
        <p className={styles.eyebrow}>{copy.brand}</p>
        <p className={styles.srStatus} role="status" aria-live="polite">{copy.loading}</p>
      </div>
    </RuntimeFrame>
  );
}

function RuntimeUnavailable({
  locale,
  correlationId,
  onRetry,
}: {
  locale: Locale;
  correlationId: string;
  onRetry: () => void;
}) {
  const copy = portalCopy(locale);
  return (
    <RuntimeFrame locale={locale} session={null} onSignOut={() => undefined}>
      <div className={styles.centerState} role="alert">
        <p className={styles.eyebrow}>{copy.brand}</p>
        <h1>{copy.serviceUnavailableTitle}</h1>
        <p>{copy.serviceUnavailableMessage}</p>
        <p className={styles.correlationId}>{copy.correlationIdLabel}: {correlationId}</p>
        <div className={styles.actions}>
          <button className={styles.button} type="button" onClick={onRetry}>{copy.retry}</button>
        </div>
      </div>
    </RuntimeFrame>
  );
}

function RuntimeAccessDenied({
  locale,
  session,
  onSignOut,
  actionError,
}: {
  locale: Locale;
  session: PortalIdentity;
  onSignOut: () => void;
  actionError: string | null;
}) {
  const copy = portalCopy(locale);
  return (
    <RuntimeFrame locale={locale} session={session} onSignOut={onSignOut}>
      <div className={styles.centerState}>
        <p className={styles.eyebrow}>{copy.runtimeConnected}</p>
        <h1>{copy.runtimeAccessDeniedTitle}</h1>
        <p>{copy.accessDeniedMessage}</p>
        <p>{signedInRoleText(locale, session.role)}</p>
        {actionError ? <p className={styles.error} role="alert">{actionError}</p> : null}
        <div className={styles.actions}>
          <Link className={styles.button} href={portalPath(locale, session.role)}>{copy.openYourPortal}</Link>
        </div>
      </div>
    </RuntimeFrame>
  );
}

function RuntimeRoleShell({
  locale,
  session,
  composition,
  onSignOut,
  actionError,
}: {
  locale: Locale;
  session: PortalIdentity;
  composition: SupabasePortalShell;
  onSignOut: () => void;
  actionError: string | null;
}) {
  const copy = portalCopy(locale);
  if (session.role === 'guide') return <Suspense fallback={<p role="status">{copy.loading}</p>}>
    <RuntimeGuideAssignmentList locale={locale} session={session} profilePort={composition.guideProfile} assignments={composition.guideAssignments} onSignOut={onSignOut}/>
  </Suspense>;
  return (
    <RuntimeFrame locale={locale} session={session} onSignOut={onSignOut}>
      <section className={styles.runtimeShell} aria-labelledby="runtime-shell-heading">
        <p className={styles.eyebrow}>{copy.runtimeConnected}</p>
        <h1 id="runtime-shell-heading">{copy.runtimeShellHeading}</h1>
        <dl className={styles.runtimeIdentity}>
          <div><dt>{copy.displayName}</dt><dd>{session.displayName}</dd></div>
          <div><dt>{copy.email}</dt><dd>{session.email}</dd></div>
          <div><dt>{copy.role}</dt><dd>{roleLabel(locale, session.role)}</dd></div>
        </dl>
        <p className={styles.runtimeDisclosure} role="note">{copy.runtimeDisclosure}</p>
        {actionError ? <p className={styles.error} role="alert">{actionError}</p> : null}
        {session.role === "customer" ? (
          <Suspense fallback={<p role="status" aria-live="polite">{copy.loading}</p>}>
            <RuntimeFixedTourAccount
              locale={locale}
              fixedTour={composition.fixedTour}
              bookingCancellations={composition.bookingCancellations}
            />
          </Suspense>
        ) : null}
        {session.role === "admin" ? (
          <>
            <Suspense fallback={<p role="status" aria-live="polite">{copy.loading}</p>}>
              <RuntimeBookingManagement locale={locale} bookingManagement={composition.bookingCancellations} />
            </Suspense>
            <Suspense fallback={<p role="status" aria-live="polite">{copy.loading}</p>}>
              <RuntimeGuideAssignmentQueue locale={locale} assignments={composition.guideAssignments} />
            </Suspense>
          </>
        ) : null}
      </section>
    </RuntimeFrame>
  );
}

export function SupabasePortalSurface({
  locale,
  expectedRole,
  returnTo,
  composition,
  navigate,
}: SupabasePortalSurfaceProps) {
  const copy = portalCopy(locale);
  const [session, setSession] = useState<PortalIdentity | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [retryKey, setRetryKey] = useState(0);
  const [correlationId, setCorrelationId] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    setLoadState("loading");
    setCorrelationId("");
    void (async () => {
      try {
        await composition.initialized;
        let identity: PortalIdentity | null;
        try {
          identity = await composition.session.getSession();
        } catch (error) {
          if (!isStaleRuntimeSession(error)) throw error;
          try {
            await composition.session.signOut();
          } catch {
            // A revoked remote session can also reject cleanup; local recovery remains available.
          }
          identity = null;
        }
        if (disposed) return;
        setSession(identity);
        setLoadState("ready");
        if (identity !== null && expectedRole === undefined && parseSafeReturnTo(locale, returnTo ?? null) !== null) {
          navigate(destinationAfterSignIn({ locale, role: identity.role, returnTo }));
        }
      } catch {
        if (disposed) return;
        setSession(null);
        setCorrelationId(createCorrelationId());
        setLoadState("error");
      }
    })();
    return () => {
      disposed = true;
    };
  }, [composition, retryKey, expectedRole, locale, returnTo, navigate]);

  async function signOut(): Promise<void> {
    setActionError(null);
    try {
      await composition.session.signOut();
      setSession(null);
    } catch {
      setActionError(copy.runtimeActionError);
    }
  }

  if (loadState === "loading") return <LoadingRuntime locale={locale} />;
  if (loadState === "error") {
    return <RuntimeUnavailable locale={locale} correlationId={correlationId} onRetry={() => setRetryKey((key) => key + 1)} />;
  }
  if (session === null) {
    return <RuntimeSignIn locale={locale} session={composition.session} returnTo={returnTo} navigate={navigate} onSession={setSession} />;
  }
  if (expectedRole !== undefined && session.role !== expectedRole) {
    return <RuntimeAccessDenied locale={locale} session={session} onSignOut={() => void signOut()} actionError={actionError} />;
  }
  return <RuntimeRoleShell locale={locale} session={session} composition={composition} onSignOut={() => void signOut()} actionError={actionError} />;
}
