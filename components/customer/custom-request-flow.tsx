"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  readCustomRequestDraftState,
  type CustomRequestDraft,
} from "@/lib/application/planner/custom-request-demo";
import {
  readPersonalizationState,
} from "@/lib/application/planner/personalization-session";
import type { Locale } from "@/lib/i18n/config";
import type { CustomRequestCopy } from "@/lib/i18n/dictionaries";

type LoadStatus = "pending" | "ok" | "missing" | "expired" | "invalid" | "storage-error" | "stale";
type DemoPhase = "sign-in" | "request" | "admin-review" | "quote" | "accepted" | "stripe-mock";

function formatVnd(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function samePreferences(left: CustomRequestDraft["preferences"], right: CustomRequestDraft["preferences"]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function statusMessage(status: Exclude<LoadStatus, "pending" | "ok">, copy: CustomRequestCopy): string {
  if (status === "missing") return copy.missingPlanMessage;
  if (status === "expired") return copy.expiredPlanMessage;
  if (status === "invalid") return copy.invalidPlanMessage;
  if (status === "stale") return copy.stalePlanMessage;
  return copy.storageErrorMessage;
}

export function CustomRequestFlow({
  locale,
  copy,
}: {
  locale: Locale;
  copy: CustomRequestCopy;
}) {
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("pending");
  const [draft, setDraft] = useState<CustomRequestDraft | null>(null);
  const [phase, setPhase] = useState<DemoPhase>("sign-in");

  useEffect(() => {
    const personalization = readPersonalizationState();
    const selectedRevision = readCustomRequestDraftState();
    if (personalization.status !== "ok") {
      setLoadStatus(personalization.status);
      return;
    }
    if (selectedRevision.status !== "ok") {
      setLoadStatus(selectedRevision.status);
      return;
    }
    if (!samePreferences(personalization.request, selectedRevision.draft.preferences)) {
      setLoadStatus("stale");
      return;
    }
    setDraft(selectedRevision.draft);
    setLoadStatus("ok");
  }, []);

  const issue = loadStatus !== "pending" && loadStatus !== "ok" ? statusMessage(loadStatus, copy) : null;

  return (
    <section className="customer-section custom-request-flow" aria-labelledby="custom-request-heading">
      <div className="section-heading section-heading--compact">
        <p className="eyebrow">LocalLens</p>
        <h1 id="custom-request-heading">{copy.heading}</h1>
        <p>{copy.intro}</p>
      </div>

      <p className="demo-disclosure" role="note">{copy.demoDisclosure}</p>

      {issue ? (
        <div className="custom-request-flow__error" role="alert">
          <p>{issue}</p>
          <Link className="button button--secondary" href={`/${locale}/planner`}>{copy.backToPlannerLabel}</Link>
        </div>
      ) : null}

      {loadStatus === "ok" && draft ? (
        <>
          <section className="custom-request-flow__card" aria-labelledby="custom-request-selected-heading">
            <h2 id="custom-request-selected-heading">{copy.selectedRevisionHeading}</h2>
            <dl className="custom-request-flow__facts">
              <div><dt>{copy.revisionLabel}</dt><dd>{draft.revision}</dd></div>
              <div><dt>{copy.planIdLabel}</dt><dd><code>{draft.planId}</code></dd></div>
              <div><dt>{copy.totalDurationLabel}</dt><dd>{draft.revisionSnapshot.totals.durationMinutes} min</dd></div>
              <div><dt>{copy.totalCostLabel}</dt><dd>{formatVnd(draft.revisionSnapshot.totals.costVnd, locale)}</dd></div>
            </dl>
          </section>

          {phase === "sign-in" ? (
            <section className="custom-request-flow__card" aria-labelledby="custom-request-sign-in-heading">
              <h2 id="custom-request-sign-in-heading">{copy.signInBoundaryHeading}</h2>
              <p>{copy.signInBoundaryMessage}</p>
              <p role="note">{copy.noBackendAuthDisclosure}</p>
              <button className="button button--primary" type="button" onClick={() => setPhase("request")}>
                {copy.continueLocalDemoLabel}
              </button>
            </section>
          ) : null}

          {phase === "request" ? (
            <form className="custom-request-flow__card" onSubmit={(event) => { event.preventDefault(); setPhase("admin-review"); }}>
              <h2>{copy.requestHeading}</h2>
              <p>{copy.requestIntro}</p>
              <button className="button button--primary" type="submit">{copy.submitRequestLabel}</button>
            </form>
          ) : null}

          {phase === "admin-review" ? (
            <section className="custom-request-flow__card" aria-labelledby="custom-request-review-heading">
              <h2 id="custom-request-review-heading">{copy.adminReviewHeading}</h2>
              <p role="status">{copy.adminReviewPendingMessage}</p>
              <button className="button button--primary" type="button" onClick={() => setPhase("quote")}>
                {copy.simulateQuoteLabel}
              </button>
            </section>
          ) : null}

          {phase === "quote" ? (
            <section className="custom-request-flow__card" aria-labelledby="custom-request-quote-heading">
              <h2 id="custom-request-quote-heading">{copy.quoteHeading}</h2>
              <p>{copy.quoteMessage}</p>
              <dl className="custom-request-flow__facts">
                <div><dt>{copy.quoteExpiresLabel}</dt><dd>48 hours (mock)</dd></div>
                <div><dt>{copy.quoteTotalLabel}</dt><dd>{formatVnd(draft.revisionSnapshot.totals.costVnd, locale)}</dd></div>
              </dl>
              <button className="button button--primary" type="button" onClick={() => setPhase("accepted")}>
                {copy.acceptQuoteLabel}
              </button>
            </section>
          ) : null}

          {phase === "accepted" ? (
            <section className="custom-request-flow__card" aria-labelledby="custom-request-accepted-heading">
              <h2 id="custom-request-accepted-heading">{copy.quoteHeading}</h2>
              <p role="status">{copy.quoteAcceptedMessage}</p>
              <button className="button button--primary" type="button" onClick={() => setPhase("stripe-mock")}>
                {copy.openStripeMockLabel}
              </button>
            </section>
          ) : null}

          {phase === "stripe-mock" ? (
            <section className="custom-request-flow__card" aria-labelledby="custom-request-stripe-heading">
              <h2 id="custom-request-stripe-heading">{copy.stripeMockHeading}</h2>
              <p>{copy.stripeMockMessage}</p>
              <p role="note">{copy.noPaymentNetworkDisclosure}</p>
            </section>
          ) : null}
        </>
      ) : null}

      <Link className="button button--secondary" href={`/${locale}/`}>{copy.backHomeLabel}</Link>
    </section>
  );
}
