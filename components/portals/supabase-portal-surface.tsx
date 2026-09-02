"use client";

import Link from "next/link";
import { lazy, Suspense, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { PortalError, type PortalIdentity } from "@/lib/application/portal/contracts";
import type { SupabasePortalShell } from "@/lib/application/portal/supabase-shell";
import type { Locale } from "@/lib/i18n/config";

import { portalCopy, portalPath, roleLabel, signedInRoleText } from "@/components/portals/portal-copy";
import type { PortalNavigate, PortalRole } from "@/components/portals/portal-surface";
import styles from "@/components/portals/portal.module.css";

export interface SupabasePortalSurfaceProps {
  locale: Locale;
  expectedRole?: PortalRole;
  composition: SupabasePortalShell;
  navigate: PortalNavigate;
}

type LoadState = "loading" | "ready" | "error";

const RuntimeFixedTourAccount = lazy(async () => {
  const module = await import("@/components/customer/runtime-fixed-tour-account");
  return { default: module.RuntimeFixedTourAccount };
});

const RuntimeCancellationQueue = lazy(async () => {
  const module = await import("@/components/admin/runtime-cancellation-queue");
  return { default: module.RuntimeCancellationQueue };
});

const RuntimeGuideAssignmentQueue = lazy(async () => {
  const module = await import("@/components/admin/runtime-guide-assignment-queue");
  return { default: module.RuntimeGuideAssignmentQueue };
});

const RuntimeGuideAssignmentList = lazy(async () => {
  const module = await import("@/components/guide/runtime-guide-assignment-list");
  return { default: module.RuntimeGuideAssignmentList };
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

function RuntimeSignIn({
  locale,
  session,
  navigate,
  onSession,
}: {
  locale: Locale;
  session: SupabasePortalShell["session"];
  navigate: PortalNavigate;
  onSession: (identity: PortalIdentity) => void;
}) {
  const copy = portalCopy(locale);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const identity = await session.signInWithPassword({ email, password });
      onSession(identity);
      navigate(portalPath(locale, identity.role));
    } catch {
      setError(copy.runtimeAuthError);
    } finally {
      setPassword("");
      setSubmitting(false);
    }
  }

  return (
    <RuntimeFrame locale={locale} session={null} onSignOut={() => undefined}>
      <section className={styles.signInHero} aria-labelledby="runtime-sign-in-heading">
        <p className={styles.eyebrow}>{copy.runtimeSignInEyebrow}</p>
        <h1 id="runtime-sign-in-heading">{copy.runtimeSignInHeading}</h1>
        <p>{copy.runtimeSignInIntro}</p>
      </section>
      <form className={styles.signInForm} onSubmit={(event) => void submit(event)}>
        <label className={styles.field}>
          {copy.email}
          <input
            type="email"
            autoComplete="username"
            value={email}
            disabled={submitting}
            required
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          {copy.password}
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            disabled={submitting}
            required
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <div className={styles.actions}>
          <button className={styles.button} type="submit" disabled={submitting}>
            {submitting ? copy.signingIn : copy.signIn}
          </button>
        </div>
      </form>
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
            <RuntimeFixedTourAccount locale={locale} fixedTour={composition.fixedTour} />
          </Suspense>
        ) : null}
        {session.role === "admin" ? (
          <>
            <Suspense fallback={<p role="status" aria-live="polite">{copy.loading}</p>}>
              <RuntimeCancellationQueue locale={locale} fixedTour={composition.fixedTour} />
            </Suspense>
            <Suspense fallback={<p role="status" aria-live="polite">{copy.loading}</p>}>
              <RuntimeGuideAssignmentQueue locale={locale} assignments={composition.guideAssignments} />
            </Suspense>
          </>
        ) : null}
        {session.role === "guide" ? (
          <Suspense fallback={<p role="status" aria-live="polite">{copy.loading}</p>}>
            <RuntimeGuideAssignmentList locale={locale} assignments={composition.guideAssignments} />
          </Suspense>
        ) : null}
      </section>
    </RuntimeFrame>
  );
}

export function SupabasePortalSurface({
  locale,
  expectedRole,
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
  }, [composition, retryKey]);

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
    return <RuntimeSignIn locale={locale} session={composition.session} navigate={navigate} onSession={setSession} />;
  }
  if (expectedRole !== undefined && session.role !== expectedRole) {
    return <RuntimeAccessDenied locale={locale} session={session} onSignOut={() => void signOut()} actionError={actionError} />;
  }
  return <RuntimeRoleShell locale={locale} session={session} composition={composition} onSignOut={() => void signOut()} actionError={actionError} />;
}
