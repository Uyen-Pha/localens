"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { DemoPortalComposition } from "@/lib/application/portal/composition";
import type { SupabasePortalShell } from "@/lib/application/portal/supabase-shell";
import type { Locale } from "@/lib/i18n/config";

import { DemoPortalSurface } from "@/components/portals/demo-portal-surface";
import { portalCopy } from "@/components/portals/portal-copy";
import { loadPortalSurfaceComposition } from "@/components/portals/portal-session";
import { SupabasePortalSurface } from "@/components/portals/supabase-portal-surface";
import styles from "@/components/portals/portal.module.css";

export type PortalRole = "customer" | "guide" | "admin";
export type PortalNavigate = (path: string) => void;
type PortalSurfaceComposition = DemoPortalComposition | SupabasePortalShell;

export interface PortalSurfaceProps {
  locale: Locale;
  expectedRole?: PortalRole;
  /** Tests may inject one explicit mode; routes use the Task 4 browser singleton loader. */
  composition?: PortalSurfaceComposition;
  /** Optional navigation seam for browser-composition tests; routes use Next soft navigation by default. */
  navigate?: PortalNavigate;
}

type LoadState = "loading" | "ready" | "error";

function createCorrelationId(): string {
  const value = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `LL-${value.toUpperCase()}`;
}

function NeutralState({
  locale,
  correlationId,
  onRetry,
}: {
  locale: Locale;
  correlationId?: string;
  onRetry?: () => void;
}) {
  const copy = portalCopy(locale);
  const isError = correlationId !== undefined;
  return (
    <div className={styles.page} data-portal-mode={isError ? "unavailable" : "loading"}>
      <div className={styles.surface}>
        <div className={styles.centerState} role={isError ? "alert" : undefined}>
          <p className={styles.eyebrow}>{copy.brand}</p>
          {isError ? (
            <>
              <h1>{copy.serviceUnavailableTitle}</h1>
              <p>{copy.serviceUnavailableMessage}</p>
              <p className={styles.correlationId}>{copy.correlationIdLabel}: {correlationId}</p>
              <div className={styles.actions}>
                <button className={styles.button} type="button" onClick={onRetry}>{copy.retry}</button>
              </div>
            </>
          ) : (
            <p className={styles.srStatus} role="status" aria-live="polite">{copy.loading}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PortalSurfaceContent({
  locale,
  expectedRole,
  composition: injectedComposition,
  navigate,
}: PortalSurfaceProps & { navigate: PortalNavigate }) {
  const [composition, setComposition] = useState<PortalSurfaceComposition | null>(injectedComposition ?? null);
  const [loadState, setLoadState] = useState<LoadState>(injectedComposition ? "ready" : "loading");
  const [retryKey, setRetryKey] = useState(0);
  const [correlationId, setCorrelationId] = useState<string | null>(null);

  useEffect(() => {
    if (injectedComposition) {
      setComposition(injectedComposition);
      setLoadState("ready");
      setCorrelationId(null);
      return;
    }

    let disposed = false;
    setLoadState("loading");
    setCorrelationId(null);
    void loadPortalSurfaceComposition()
      .then((loaded) => {
        if (disposed) return;
        setComposition(loaded);
        setLoadState("ready");
      })
      .catch(() => {
        if (disposed) return;
        setComposition(null);
        setCorrelationId(createCorrelationId());
        setLoadState("error");
      });

    return () => {
      disposed = true;
    };
  }, [injectedComposition, retryKey]);

  if (loadState === "loading") return <NeutralState locale={locale} />;
  if (loadState === "error" || composition === null) {
    return (
      <NeutralState
        locale={locale}
        correlationId={correlationId ?? createCorrelationId()}
        onRetry={() => setRetryKey((key) => key + 1)}
      />
    );
  }

  if (composition.mode === "demo") {
    return <DemoPortalSurface locale={locale} expectedRole={expectedRole} composition={composition} navigate={navigate} />;
  }
  return <SupabasePortalSurface locale={locale} expectedRole={expectedRole} composition={composition} navigate={navigate} />;
}

function RouterPortalSurface(props: PortalSurfaceProps) {
  const router = useRouter();
  return <PortalSurfaceContent {...props} navigate={(path) => router.push(path)} />;
}

export function PortalSurface(props: PortalSurfaceProps) {
  if (props.navigate) return <PortalSurfaceContent {...props} navigate={props.navigate} />;
  return <RouterPortalSurface {...props} />;
}
