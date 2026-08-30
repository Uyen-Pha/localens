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
import type { ItineraryPreviewFoodSelectionDto } from "@/lib/application/api/read-only-api";
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

function formatMinutes(value: number, locale: Locale): string {
  return locale === "vi" ? `${value} phút` : `${value} min`;
}

function formatVndRange(min: number, max: number, locale: Locale): string {
  if (min === max) return formatVnd(min, locale);
  return `${formatVnd(min, locale)}–${formatVnd(max, locale)}`;
}

function formatServingUnit(selection: ItineraryPreviewFoodSelectionDto, locale: Locale, labels: Record<ItineraryPreviewFoodSelectionDto["servingUnit"], string>): string {
  const label = labels[selection.servingUnit];
  return `${selection.quantity} ${label}${locale === "en" && selection.quantity !== 1 && selection.servingUnit !== "shared_set" ? "s" : ""}`;
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
  const budgetExceeded = draft !== null
    && draft.revisionSnapshot.budgetVnd !== null
    && draft.revisionSnapshot.totals.groupCostMaxVnd > draft.revisionSnapshot.budgetVnd;

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
              <div><dt>{copy.totalDurationLabel}</dt><dd>{formatMinutes(draft.revisionSnapshot.totals.durationMinutes, locale)}</dd></div>
              <div><dt>{copy.venueAdmissionLabel}</dt><dd>{formatVnd(draft.revisionSnapshot.totals.admissionCostVnd, locale)}</dd></div>
              <div><dt>{copy.foodEstimateLabel}</dt><dd>{draft.revisionSnapshot.items.some((item) => item.foodSelection === null && (item.foodCostMinVnd > 0 || item.foodCostMaxVnd > 0))
                ? copy.foodCostUnavailableLabel
                : draft.revisionSnapshot.totals.foodCostMinVnd === 0 && draft.revisionSnapshot.totals.foodCostMaxVnd === 0
                  ? copy.foodNotSelectedLabel
                  : formatVndRange(draft.revisionSnapshot.totals.foodCostMinVnd, draft.revisionSnapshot.totals.foodCostMaxVnd, locale)}</dd></div>
              <div><dt>{copy.travelCostTotalLabel}</dt><dd>{formatVnd(draft.revisionSnapshot.totals.travelCostVnd, locale)}</dd></div>
              <div><dt>{copy.guideCostLabel}</dt><dd>{formatVnd(draft.revisionSnapshot.totals.guideCostVnd, locale)}</dd></div>
              <div><dt>{copy.localLensPayableLabel}</dt><dd>{formatVnd(draft.revisionSnapshot.totals.customerPayableVnd, locale)}</dd></div>
              <div><dt>{copy.payAtVendorLabel}</dt><dd>{draft.revisionSnapshot.totals.payAtVendorMinVnd === 0 && draft.revisionSnapshot.totals.payAtVendorMaxVnd === 0
                ? formatVnd(0, locale)
                : formatVndRange(draft.revisionSnapshot.totals.payAtVendorMinVnd, draft.revisionSnapshot.totals.payAtVendorMaxVnd, locale)}</dd></div>
              <div><dt>{copy.totalCostLabel}</dt><dd>{formatVnd(draft.revisionSnapshot.totals.groupCostMaxVnd, locale)}</dd></div>
            </dl>
            {budgetExceeded ? (
              <p className="custom-request-flow__budget-warning" role="note" aria-label={copy.budgetWarningLabel}>
                {copy.budgetWarningMessage}
              </p>
            ) : null}
            <ol className="custom-request-flow__food-list">
              {draft.revisionSnapshot.items.map((item) => (
                <li key={item.id}>
                  <h3>{item.title}</h3>
                  {item.foodSelection ? (
                    <dl className="custom-request-flow__facts">
                      <div><dt>{copy.vendorLabel}</dt><dd>{item.foodSelection.vendorTitle}</dd></div>
                      <div><dt>{copy.locationNoteLabel}</dt><dd>{item.foodSelection.locationNote}</dd></div>
                      <div><dt>{copy.menuItemLabel}</dt><dd>{item.foodSelection.menuTitle}</dd></div>
                      <div><dt>{copy.quantityLabel}</dt><dd>{formatServingUnit(item.foodSelection, locale, copy.servingUnitValues)}</dd></div>
                      <div><dt>{copy.servingUnitLabel}</dt><dd>{copy.servingUnitValues[item.foodSelection.servingUnit]}</dd></div>
                      <div><dt>{copy.unitPriceLabel}</dt><dd>{formatVndRange(item.foodSelection.priceVndMin, item.foodSelection.priceVndMax, locale)}</dd></div>
                      <div><dt>{copy.estimatedRangeLabel}</dt><dd>{formatVndRange(item.foodCostMinVnd, item.foodCostMaxVnd, locale)}</dd></div>
                      <div><dt>{copy.activityLabel}</dt><dd>{item.foodSelection.activity}</dd></div>
                      <div><dt>{copy.dietaryAllergenLabel}</dt><dd>{item.foodSelection.dietaryAllergenCaveat}</dd></div>
                      <div><dt>{copy.accessibilityWarningLabel}</dt><dd>{item.foodSelection.accessibilityVendorWarning}</dd></div>
                      <div><dt>{copy.payAtVendorLabel}</dt><dd>{item.foodSelection.paymentMode === "pay_at_vendor" ? copy.payAtVendorValue : item.foodSelection.paymentMode}</dd></div>
                    </dl>
                  ) : item.foodCostMinVnd > 0 || item.foodCostMaxVnd > 0 ? (
                    <p>{copy.foodCostUnavailableLabel}</p>
                  ) : (
                    <p>{copy.foodNotSelectedLabel}</p>
                  )}
                </li>
              ))}
            </ol>
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
            <form className="custom-request-flow__card" onSubmit={(event) => {
              event.preventDefault();
              if (budgetExceeded) return;
              setPhase("admin-review");
            }}>
              <h2>{copy.requestHeading}</h2>
              <p>{copy.requestIntro}</p>
              <button className="button button--primary" type="submit" disabled={budgetExceeded}>{copy.submitRequestLabel}</button>
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
                <div><dt>{copy.quoteTotalLabel}</dt><dd>{formatVnd(draft.revisionSnapshot.totals.customerPayableVnd, locale)}</dd></div>
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
