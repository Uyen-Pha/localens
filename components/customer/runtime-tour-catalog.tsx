"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { FixedTourRuntimePort } from "@/lib/application/fixed-tour/contracts";
import type { LiveDepartureAvailability, PublishedTour } from "@/lib/domain/data/contracts";
import type { Locale } from "@/lib/i18n/config";
import { fixedTourRuntimeCopy } from "@/lib/i18n/fixed-tour-runtime";

type LoadState = "loading" | "ready" | "error";

function formatVnd(value: string, locale: Locale): string {
  const amount = Number(value);
  return Number.isSafeInteger(amount)
    ? new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(amount)
    : value;
}

function formatDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

export function RuntimeTourCatalog({
  locale,
  fixedTour,
  initialized,
}: {
  locale: Locale;
  fixedTour: FixedTourRuntimePort;
  initialized: Promise<void>;
}) {
  const copy = fixedTourRuntimeCopy(locale);
  const [state, setState] = useState<LoadState>("loading");
  const [tours, setTours] = useState<PublishedTour[]>([]);
  const [availability, setAvailability] = useState<LiveDepartureAvailability[]>([]);
  const [retryKey, setRetryKey] = useState(0);

  const load = useCallback(async () => {
    setState("loading");
    try {
      await initialized;
      const [published, departures] = await Promise.all([
        fixedTour.listPublishedTours(locale),
        fixedTour.listAvailability(),
      ]);
      setTours(published);
      setAvailability(departures);
      setState("ready");
    } catch {
      setTours([]);
      setAvailability([]);
      setState("error");
    }
  }, [fixedTour, initialized, locale]);

  useEffect(() => { void load(); }, [load, retryKey]);

  if (state === "loading") return <p role="status" aria-live="polite">{copy.loading}</p>;
  if (state === "error") {
    return (
      <div role="alert">
        <p>{copy.serviceUnavailable}</p>
        <button type="button" onClick={() => setRetryKey((value) => value + 1)}>{copy.retry}</button>
      </div>
    );
  }

  return (
    <div className="customer-home customer-tours-page">
      <section className="customer-section customer-section--discovery" aria-labelledby="runtime-fixed-tours-title">
        <div className="section-heading section-heading--tours">
          <p className="eyebrow">{copy.catalogEyebrow}</p>
          <h1 id="runtime-fixed-tours-title">{copy.catalogHeading}</h1>
          <p>{copy.catalogIntro}</p>
          <p role="note">{copy.runtimeDisclosure}</p>
        </div>
        {tours.length === 0 ? <p>{copy.emptyCatalog}</p> : (
          <div className="demo-tour-grid demo-tour-grid--editorial">
            {tours.map((tour) => {
              const departures = availability.filter((item) => item.tourVersionId === tour.versionId);
              return (
                <article className="demo-tour-card demo-tour-card--editorial" key={`${tour.id}:${tour.versionId}`}>
                  <h2>{tour.title}</h2>
                  <p>{tour.summary}</p>
                  <dl>
                    <div><dt>{copy.duration}</dt><dd>{tour.durationMinutes} min</dd></div>
                    <div><dt>{copy.meetingPoint}</dt><dd>{tour.meetingPoint}</dd></div>
                    <div><dt>{copy.cancellationPolicy}</dt><dd>{tour.cancellationPolicy}</dd></div>
                    <div><dt>{copy.stops}</dt><dd>{tour.stops.map((stop) => stop.title).join(", ")}</dd></div>
                  </dl>
                  <p>{formatVnd(tour.priceVndMinor, locale)}</p>
                  <h3>{copy.availability}</h3>
                  {departures.length === 0 ? <p>{copy.notFound}</p> : departures.map((departure) => {
                    const canBook = departure.status === "scheduled" && departure.remainingCapacity > 0;
                    return (
                      <div key={departure.id}>
                        <p>{formatDate(departure.startAt, locale)}</p>
                        <p>{canBook ? copy.seatsRemaining(departure.remainingCapacity) : copy.soldOut}</p>
                        {canBook ? (
                          <Link href={`/${locale}/booking/?departure=${departure.id}&partySize=1`}>
                            {copy.bookTour(tour.title)}
                          </Link>
                        ) : null}
                      </div>
                    );
                  })}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
