"use client";

import type { RuntimePlannerPort } from "@/lib/application/planner/runtime-planner";
import type { Locale } from "@/lib/i18n/config";
import type { PlannerCopy } from "@/lib/i18n/dictionaries";

export interface SupabasePlannerFlowProps {
  locale: Locale;
  copy: PlannerCopy;
  /** Task 4 owns the first runtime operation; this scaffold deliberately does not call the port. */
  planner: RuntimePlannerPort;
}

/**
 * Fail-closed Task 3 boundary. The runtime planner is supplied for Task 4,
 * but this scaffold intentionally performs neither AI calls nor mutations.
 */
export function SupabasePlannerFlow(props: SupabasePlannerFlowProps) {
  return (
    <section className="customer-section planner-flow planner-flow--editorial" aria-labelledby="supabase-planner-heading">
      <div className="section-heading section-heading--compact">
        <p className="eyebrow">LocalLens</p>
        <h1 id="supabase-planner-heading">{props.copy.heading}</h1>
        <p>{props.copy.intro}</p>
      </div>
      <p className="planner-flow__proposal" role="note">{props.copy.runtimeDisclosure}</p>
    </section>
  );
}
