"use client";

import { useEffect, useRef } from "react";

import type { ItineraryPreviewDto } from "@/lib/application/api/read-only-api";
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
                      <dt>{copy.placeCostLabel}</dt>
                      <dd>{formatVnd(item.placeCostVnd, locale)}</dd>
                    </div>
                  </dl>
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
                <dt>{copy.totalCostLabel}</dt>
                <dd>{formatVnd(preview.totals.groupCostVnd, locale)}</dd>
              </div>
            </dl>
          </div>
        </>
      ) : null}
    </section>
  );
}
