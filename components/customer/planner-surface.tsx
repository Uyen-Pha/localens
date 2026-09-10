"use client";

import { useEffect, useState, type ComponentType } from "react";

import { loadPortalSurfaceComposition } from "@/components/portals/portal-session";
import { portalCopy } from "@/components/portals/portal-copy";
import { ServiceStatus } from "@/components/ui/service-status";
import type { SupabasePlannerFlowProps } from "@/components/customer/supabase-planner-flow";
import type { DemoPortalComposition } from "@/lib/application/portal/composition";
import type { SupabasePortalShell } from "@/lib/application/portal/supabase-shell";
import type { Locale } from "@/lib/i18n/config";
import type { PlannerCopy } from "@/lib/i18n/dictionaries";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { PersonalizationForm } from "./personalization-form";
import { readPersonalizationState } from "@/lib/application/planner/personalization-session";

type PlannerComposition = DemoPortalComposition | SupabasePortalShell;

type LoadedPlanner =
  | {
    mode: "demo";
    Flow: ComponentType<{ locale: Locale; copy: PlannerCopy }>;
  }
  | {
    mode: "supabase";
    Flow: ComponentType<SupabasePlannerFlowProps>;
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
  const [showForm, setShowForm] = useState(true);
  const [hasSavedRequest, setHasSavedRequest] = useState(false);
  useEffect(() => { setHasSavedRequest(readPersonalizationState().status === "ok"); }, []);

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

  if (showForm) return <section className="customer-section planner-flow planner-flow--editorial planner-form-page" aria-labelledby="personalization-heading">
    <div className="section-heading section-heading--compact"><p className="eyebrow">LocalLens</p><h1 id="personalization-heading">{copy.heading}</h1><p>{locale === "vi" ? "Cho chúng tôi biết thời gian, ngân sách và sở thích của bạn để đề xuất tour phù hợp." : "Tell us your schedule, budget and interests to find a tour that suits you."}</p></div>
    {hasSavedRequest && <button className="button button--secondary" type="button" onClick={() => setShowForm(false)}>{locale === "vi" ? "Tiếp tục yêu cầu đã lưu" : "Continue saved request"}</button>}
    <PersonalizationForm locale={locale} copy={getDictionary(locale).home.personalizationForm} onPrepared={() => { setHasSavedRequest(true); setShowForm(false); }} />
  </section>;
  if (failed) {
    return <PlannerSurfaceStatus locale={locale} failed onRetry={() => setRetryKey((value) => value + 1)} />;
  }
  if (selection === null) return <PlannerSurfaceStatus locale={locale} failed={false} onRetry={() => undefined} />;

  if (selection.planner.mode === "demo") {
    const { Flow } = selection.planner;
    return <><button className="button button--secondary" type="button" onClick={() => setShowForm(true)}>{locale === "vi" ? "Nhập lại nhu cầu cá nhân hóa" : "Edit your preferences"}</button><Flow locale={locale} copy={copy} /></>;
  }

  if (selection.composition.mode !== "supabase") {
    return <PlannerSurfaceStatus locale={locale} failed onRetry={() => setRetryKey((value) => value + 1)} />;
  }

  const { Flow } = selection.planner;
  return <><button className="button button--secondary" type="button" onClick={() => setShowForm(true)}>{locale === "vi" ? "Nhập lại nhu cầu cá nhân hóa" : "Edit your preferences"}</button><Flow locale={locale} copy={copy} planner={selection.composition.planner} /></>;
}
