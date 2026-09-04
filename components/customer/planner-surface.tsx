"use client";

import { useEffect, useState, type ComponentType } from "react";

import { loadPortalSurfaceComposition } from "@/components/portals/portal-session";
import { portalCopy } from "@/components/portals/portal-copy";
import { ServiceStatus } from "@/components/ui/service-status";
import type { DemoPortalComposition } from "@/lib/application/portal/composition";
import type { RuntimePlannerPort } from "@/lib/application/planner/runtime-planner";
import type { SupabasePortalShell } from "@/lib/application/portal/supabase-shell";
import type { Locale } from "@/lib/i18n/config";
import type { PlannerCopy } from "@/lib/i18n/dictionaries";

type PlannerComposition = DemoPortalComposition | SupabasePortalShell;

type LoadedPlanner =
  | {
    mode: "demo";
    Flow: ComponentType<{ locale: Locale; copy: PlannerCopy }>;
  }
  | {
    mode: "supabase";
    Flow: ComponentType<{ locale: Locale; copy: PlannerCopy; planner: RuntimePlannerPort }>;
  };

export interface PlannerSurfaceProps {
  locale: Locale;
  copy: PlannerCopy;
}

async function loadSelectedPlanner(composition: PlannerComposition): Promise<LoadedPlanner> {
  await composition.initialized;

  if (composition.mode === "demo") {
    const { PlannerFlow } = await import("@/components/customer/planner-flow");
    return { mode: "demo", Flow: PlannerFlow };
  }

  const { SupabasePlannerFlow } = await import("@/components/customer/supabase-planner-flow");
  return { mode: "supabase", Flow: SupabasePlannerFlow };
}

function PlannerSurfaceStatus({
  locale,
  failed,
  onRetry,
}: {
  locale: Locale;
  failed: boolean;
  onRetry: () => void;
}) {
  const copy = portalCopy(locale);
  const labels = {
    available: copy.loading,
    degraded: copy.loading,
    unavailable: copy.serviceUnavailableTitle,
  };

  if (!failed) {
    return (
      <div className="customer-section planner-flow planner-flow--editorial">
        <ServiceStatus state="degraded" labels={labels} />
      </div>
    );
  }

  return (
    <div className="customer-section planner-flow planner-flow--editorial" role="alert">
      <ServiceStatus state="unavailable" labels={labels} />
      <p>{copy.serviceUnavailableMessage}</p>
      <button className="button button--secondary" type="button" onClick={onRetry}>{copy.retry}</button>
    </div>
  );
}

export function PlannerSurface({ locale, copy }: PlannerSurfaceProps) {
  const [selection, setSelection] = useState<{ composition: PlannerComposition; planner: LoadedPlanner } | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let disposed = false;
    setSelection(null);
    setFailed(false);

    void loadPortalSurfaceComposition()
      .then((composition) => Promise.all([composition, loadSelectedPlanner(composition)] as const))
      .then(([composition, planner]) => {
        if (disposed) return;
        setSelection({ composition, planner });
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });

    return () => {
      disposed = true;
    };
  }, [retryKey]);

  if (failed) {
    return <PlannerSurfaceStatus locale={locale} failed onRetry={() => setRetryKey((value) => value + 1)} />;
  }
  if (selection === null) return <PlannerSurfaceStatus locale={locale} failed={false} onRetry={() => undefined} />;

  if (selection.planner.mode === "demo") {
    const { Flow } = selection.planner;
    return <Flow locale={locale} copy={copy} />;
  }

  if (selection.composition.mode !== "supabase") {
    return <PlannerSurfaceStatus locale={locale} failed onRetry={() => setRetryKey((value) => value + 1)} />;
  }

  const { Flow } = selection.planner;
  return <Flow locale={locale} copy={copy} planner={selection.composition.planner} />;
}
