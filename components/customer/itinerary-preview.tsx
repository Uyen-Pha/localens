"use client";

import { useEffect, useRef } from "react";

import type { ItineraryPreviewDto, ItineraryPreviewFoodSelectionDto } from "@/lib/application/api/read-only-api";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";

type ItineraryPreviewCopy = Dictionary["home"]["personalizationForm"]["preview"];

export type ItineraryPreviewError = {
  message: string;
  retryable: boolean;
  correlationId: string;
};

function formatHcmTime(value: string): string {
  const [date, time = ""] = value.split("T");
  return `${date} · ${time.slice(0, 5)} (UTC+07:00)`;
}

function formatMinutes(value: number, locale: Locale): string {
  return locale === "vi" ? `${value} phút` : `${value} min`;
}

function formatVnd(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatVndRange(min: number, max: number, locale: Locale): string {
  if (min === max) return formatVnd(min, locale);
  return `${formatVnd(min, locale)}–${formatVnd(max, locale)}`;
}

function formatServingUnit(
  value: ItineraryPreviewFoodSelectionDto["servingUnit"],
  quantity: number,
  locale: Locale,
  labels: Record<string, string>,
): string {
  const label = labels[value] ?? value;
  return `${quantity} ${label}${locale === "en" && quantity !== 1 && value !== "shared_set" ? "s" : ""}`;
}

export function ItineraryPreview({
  locale,
  copy,
  preview,
  error,
}: {
  locale: Locale;
  copy: ItineraryPreviewCopy;
  preview?: ItineraryPreviewDto | null;
  error?: ItineraryPreviewError | null;
}) {
  const previewRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (preview !== undefined && preview !== null) {
      previewRef.current?.focus();
    }
  }, [preview]);

  if (preview === undefined && error === undefined) return null;

  const warning = preview?.items.some(
    (item) => item.transitionBufferMinutesBefore > 0,
  );

  return (
    <section
      ref={previewRef}
      className="itinerary-preview"
      aria-labelledby="itinerary-preview-title"
      tabIndex={-1}
    >
      <h3 id="itinerary-preview-title">{copy.heading}</h3>

      {error ? (
        <div className="itinerary-preview__error" role="alert">
          <p>{copy.errorMessage}</p>
          {error.retryable ? <p>{copy.retryableMessage}</p> : null}
          <p>
            {copy.correlationLabel}: <code>{error.correlationId}</code>
          </p>
        </div>
      ) : null}

      {preview ? (
        <>
          <p className="itinerary-preview__disclosure">
            {copy.deterministicDisclosure}
          </p>
          <p className="itinerary-preview__proposal">{copy.proposalOnly}</p>

          {warning ? (
            <p className="itinerary-preview__warning" role="note">
              {copy.warningMessage}
            </p>
          ) : null}

          <ol className="itinerary-timeline">
            {preview.items.map((item) => (
              <li className="itinerary-timeline__item" key={item.placeId}>
                <article>
                  <h4>{item.placeTitle}</h4>
                  <dl className="itinerary-timeline__details">
                    <div>
                      <dt>{copy.startLabel}</dt>
                      <dd>{formatHcmTime(item.startAt)}</dd>
                    </div>
                    <div>
                      <dt>{copy.endLabel}</dt>
                      <dd>{formatHcmTime(item.endAt)}</dd>
                    </div>
                    <div>
                      <dt>{copy.visitDurationLabel}</dt>
                      <dd>{formatMinutes(item.visitDurationMinutes, locale)}</dd>
                    </div>
                    <div>
                      <dt>{copy.travelDurationLabel}</dt>
                      <dd>{formatMinutes(item.travelMinutesBefore, locale)}</dd>
                    </div>
                    <div>
                      <dt>{copy.travelCostLabel}</dt>
                      <dd>{formatVnd(item.travelCostVndBefore, locale)}</dd>
                    </div>
                    <div>
                      <dt>{copy.venueAdmissionLabel}</dt>
                      <dd>{formatVnd(item.placeCostVnd, locale)}</dd>
                    </div>
                  </dl>
                  {item.foodSelection ? (
                    <section className="itinerary-food" aria-labelledby={`itinerary-food-${item.placeId}`}>
                      <h5 id={`itinerary-food-${item.placeId}`}>{item.foodSelection.venueTitle}</h5>
                      <dl className="itinerary-food__details">
                        <div>
                          <dt>{copy.vendorLabel}</dt>
                          <dd>{item.foodSelection.vendorTitle}</dd>
                        </div>
                        <div>
                          <dt>{copy.locationNoteLabel}</dt>
                          <dd>{item.foodSelection.locationNote}</dd>
                        </div>
                        <div>
                          <dt>{copy.menuItemLabel}</dt>
                          <dd>{item.foodSelection.menuTitle}</dd>
                        </div>
                        <div>
                          <dt>{copy.quantityLabel}</dt>
                          <dd>{formatServingUnit(item.foodSelection.servingUnit, item.foodSelection.quantity, locale, copy.servingUnitValues)}</dd>
                        </div>
                        <div>
                          <dt>{copy.servingUnitLabel}</dt>
                          <dd>{copy.servingUnitValues[item.foodSelection.servingUnit]}</dd>
                        </div>
                        <div>
                          <dt>{copy.unitPriceLabel}</dt>
                          <dd>{formatVndRange(item.foodSelection.priceVndMin, item.foodSelection.priceVndMax, locale)}</dd>
                        </div>
                        <div>
                          <dt>{copy.estimatedRangeLabel}</dt>
                          <dd>{formatVndRange(item.foodCostMinVnd, item.foodCostMaxVnd, locale)}</dd>
                        </div>
                        <div>
                          <dt>{copy.activityLabel}</dt>
                          <dd>{item.foodSelection.activity}</dd>
                        </div>
                        <div>
                          <dt>{copy.dietaryAllergenLabel}</dt>
                          <dd>{item.foodSelection.dietaryAllergenCaveat}</dd>
                        </div>
                        <div>
                          <dt>{copy.accessibilityWarningLabel}</dt>
                          <dd>{item.foodSelection.accessibilityVendorWarning}</dd>
                        </div>
                        <div>
                          <dt>{copy.payAtVendorLabel}</dt>
                          <dd>{item.foodSelection.paymentMode === "pay_at_vendor" ? copy.payAtVendorValue : item.foodSelection.paymentMode}</dd>
                        </div>
                      </dl>
                    </section>
                  ) : item.foodCostMinVnd > 0 || item.foodCostMaxVnd > 0 ? (
                    <p className="itinerary-food__unavailable">{copy.foodCostUnavailableLabel}</p>
                  ) : (
                    <p className="itinerary-food__none">{copy.foodNotSelectedLabel}</p>
                  )}
                </article>
              </li>
            ))}
          </ol>

          <div className="itinerary-preview__totals">
            <h4>{copy.totalsHeading}</h4>
            <dl>
              <div>
                <dt>{copy.totalDurationLabel}</dt>
                <dd>{formatMinutes(preview.totals.durationMinutes, locale)}</dd>
              </div>
              <div>
                <dt>{copy.totalVisitLabel}</dt>
                <dd>{formatMinutes(preview.totals.visitMinutes, locale)}</dd>
              </div>
              <div>
                <dt>{copy.totalTravelLabel}</dt>
                <dd>{formatMinutes(preview.totals.travelMinutes, locale)}</dd>
              </div>
              <div>
                <dt>{copy.venueAdmissionLabel}</dt>
                <dd>{formatVnd(preview.totals.admissionCostVnd, locale)}</dd>
              </div>
              <div>
                <dt>{copy.foodEstimateLabel}</dt>
                <dd>{preview.items.some((item) => item.foodSelection === null && (item.foodCostMinVnd > 0 || item.foodCostMaxVnd > 0))
                  ? copy.foodCostUnavailableLabel
                  : preview.totals.foodCostMinVnd === 0 && preview.totals.foodCostMaxVnd === 0
                    ? copy.foodNotSelectedLabel
                    : formatVndRange(preview.totals.foodCostMinVnd, preview.totals.foodCostMaxVnd, locale)}</dd>
              </div>
              <div>
                <dt>{copy.travelCostTotalLabel}</dt>
                <dd>{formatVnd(preview.totals.travelCostVnd, locale)}</dd>
              </div>
              <div>
                <dt>{copy.guideCostLabel}</dt>
                <dd>{formatVnd(preview.totals.guideCostVnd, locale)}</dd>
              </div>
              <div>
                <dt>{copy.localLensPayableLabel}</dt>
                <dd>{formatVnd(preview.totals.customerPayableVnd, locale)}</dd>
              </div>
              <div>
                <dt>{copy.payAtVendorLabel}</dt>
                <dd>{preview.totals.payAtVendorMinVnd === 0 && preview.totals.payAtVendorMaxVnd === 0
                  ? formatVnd(0, locale)
                  : formatVndRange(preview.totals.payAtVendorMinVnd, preview.totals.payAtVendorMaxVnd, locale)}</dd>
              </div>
              <div>
                <dt>{copy.totalCostLabel}</dt>
                <dd>{formatVnd(preview.totals.groupCostMaxVnd, locale)}</dd>
              </div>
            </dl>
          </div>
          {preview.totals.groupCostMaxVnd > preview.budgetVnd ? (
            <p className="itinerary-preview__budget-warning" role="note" aria-label={copy.budgetWarningLabel}>
              {copy.budgetWarningMessage}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
