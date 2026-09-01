"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ComponentType } from "react";

import type { DemoPortalComposition } from "@/lib/application/portal/composition";
import type { SupabasePortalShell } from "@/lib/application/portal/supabase-shell";
import type { Locale } from "@/lib/i18n/config";

import { portalCopy } from "@/components/portals/portal-copy";
import { loadPortalSurfaceComposition } from "@/components/portals/portal-session";
import styles from "@/components/portals/portal.module.css";

export type PortalRole = "customer" | "guide" | "admin";
export type PortalNavigate = (path: string) => void;
type PortalSurfaceComposition = DemoPortalComposition | SupabasePortalShell;
type DemoSurface = ComponentType<{
  locale: Locale;
  expectedRole?: PortalRole;
  composition: DemoPortalComposition;
  navigate: PortalNavigate;
}>;
type SupabaseSurface = ComponentType<{
  locale: Locale;
  expectedRole?: PortalRole;
  composition: SupabasePortalShell;
  navigate: PortalNavigate;
}>;
type LoadedSurface =
  | { mode: "demo"; composition: DemoPortalComposition; Surface: DemoSurface }
  | { mode: "supabase"; composition: SupabasePortalShell; Surface: SupabaseSurface };

export interface PortalSurfaceProps {
  locale: Locale;
  expectedRole?: PortalRole;
  /** Tests may inject one explicit mode; routes use the Task 4 browser singleton loader. */
  composition?: PortalSurfaceComposition;
  /** Optional navigation seam for browser-composition tests; routes use Next soft navigation by default. */
  navigate?: PortalNavigate;
}

type LoadState = "loading" | "ready" | "error";

async function loadSelectedSurface(composition: PortalSurfaceComposition): Promise<LoadedSurface> {
  // Lazy module loading can outlast initialization; observe early rejection so
  // the selected surface can render its existing localized recovery state.
  void composition.initialized.catch(() => undefined);

  if (composition.mode === "demo") {
    const { DemoPortalSurface } = await import("@/components/portals/demo-portal-surface");
    return { mode: "demo", composition, Surface: DemoPortalSurface };
  }

  const { SupabasePortalSurface } = await import("@/components/portals/supabase-portal-surface");
  return { mode: "supabase", composition, Surface: SupabasePortalSurface };
}

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
  const [loadedSurface, setLoadedSurface] = useState<LoadedSurface | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [retryKey, setRetryKey] = useState(0);
  const [correlationId, setCorrelationId] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    setLoadState("loading");
    setCorrelationId(null);
    setLoadedSurface(null);
    const compositionLoad = injectedComposition
      ? Promise.resolve(injectedComposition)
      : loadPortalSurfaceComposition();
    void compositionLoad
      .then((composition) => loadSelectedSurface(composition))
      .then((selectedSurface) => {
        if (disposed) return;
        setLoadedSurface(selectedSurface);
        setLoadState("ready");
      })
      .catch(() => {
        if (disposed) return;
        setLoadedSurface(null);
        setCorrelationId(createCorrelationId());
        setLoadState("error");
      });

    return () => {
      disposed = true;
    };
  }, [injectedComposition, retryKey]);

  if (loadState === "loading") return <NeutralState locale={locale} />;
  if (loadState === "error" || loadedSurface === null) {
    return (
      <NeutralState
        locale={locale}
        correlationId={correlationId ?? createCorrelationId()}
        onRetry={() => setRetryKey((key) => key + 1)}
      />
    );
  }

  if (loadedSurface.mode === "demo") {
    const { Surface, composition } = loadedSurface;
    return <Surface locale={locale} expectedRole={expectedRole} composition={composition} navigate={navigate} />;
  }
  const { Surface, composition } = loadedSurface;
  return <Surface locale={locale} expectedRole={expectedRole} composition={composition} navigate={navigate} />;
}

function RouterPortalSurface(props: PortalSurfaceProps) {
  const router = useRouter();
  return <PortalSurfaceContent {...props} navigate={(path) => router.push(path)} />;
}

export function PortalSurface(props: PortalSurfaceProps) {
  if (props.navigate) return <PortalSurfaceContent {...props} navigate={props.navigate} />;
  return <RouterPortalSurface {...props} />;
}
