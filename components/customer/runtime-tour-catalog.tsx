"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, Clock3, MapPin, Route } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { FixedTourRuntimePort } from "@/lib/application/fixed-tour/contracts";
import type { LiveDepartureAvailability, PublishedTour } from "@/lib/domain/data/contracts";
import type { Locale } from "@/lib/i18n/config";
import { fixedTourRuntimeCopy } from "@/lib/i18n/fixed-tour-runtime";

type LoadState = "loading" | "ready" | "error";

// Illustrative artwork only: never represents a verified stop or vendor.
const tourImages: Record<string, { src: string; vi: string; en: string }> = {
  "demo-craft-and-tasting-afternoon": {
    src: "/images/editorial/saigon-artisan-hero.webp",
    vi: "Minh họa nghệ nhân đan giỏ mây", en: "Illustration of an artisan weaving a rattan basket",
  },
  "demo-heritage-and-market-morning": {
    src: "/images/green/ben-thanh-market.webp",
    vi: "Chợ Bến Thành, ảnh minh họa văn hóa chợ Sài Gòn", en: "Ben Thanh Market, illustrating Saigon market culture",
  },
  "demo-waterways-and-evening-stories": {
    src: "/images/green/street-food.webp",
    vi: "Ẩm thực đường phố, ảnh minh họa nhịp sống Sài Gòn", en: "Street food, illustrating everyday life in Saigon",
  },
};
const defaultImage = {
  src: "/images/green/ben-thanh-market.webp",
  vi: "Chợ Bến Thành, ảnh minh họa Thành phố Hồ Chí Minh", en: "Ben Thanh Market, an illustrative view of Ho Chi Minh City",
};

function formatVnd(value: string, locale: Locale): string {
  const amount = Number(value);
  return Number.isSafeInteger(amount)
    ? new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(amount)
    : value;
}

function formatDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

export function RuntimeTourCatalog({ locale, fixedTour, initialized }: {
  locale: Locale;
  fixedTour: FixedTourRuntimePort;
  initialized: Promise<void>;
}) {
  const copy = fixedTourRuntimeCopy(locale);
  const visual = locale === "vi" ? {
    eyebrow: "Sài Gòn qua góc nhìn bản địa", image: "Ảnh minh họa", minutes: "phút",
    details: "Điểm hẹn & hành trình", book: "Đặt tour", departures: "Chọn lịch khởi hành",
    count: "hành trình để khám phá", perPerson: "/ khách", stops: "điểm dừng",
  } : {
    eyebrow: "Saigon through local eyes", image: "Illustrative image", minutes: "min",
    details: "Meeting point & itinerary", book: "Book tour", departures: "Choose a departure",
    count: "journeys to discover", perPerson: "/ person", stops: "stops",
  };
  const [state, setState] = useState<LoadState>("loading");
  const [tours, setTours] = useState<PublishedTour[]>([]);
  const [availability, setAvailability] = useState<LiveDepartureAvailability[]>([]);
  const [retryKey, setRetryKey] = useState(0);

  const load = useCallback(async () => {
    setState("loading");
    try {
      await initialized;
      const [published, departures] = await Promise.all([
        fixedTour.listPublishedTours(locale), fixedTour.listAvailability(),
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
    return <div role="alert"><p>{copy.serviceUnavailable}</p><button type="button" onClick={() => setRetryKey((value) => value + 1)}>{copy.retry}</button></div>;
  }

  return (
    <div className="runtime-catalog">
      <section aria-labelledby="runtime-fixed-tours-title">
        <div className="runtime-catalog__heading">
          <p className="runtime-catalog__eyebrow"><MapPin size={15} aria-hidden="true" />{visual.eyebrow}</p>
          <h1 id="runtime-fixed-tours-title">{copy.catalogHeading}</h1>
          <p>{copy.catalogIntro}</p>
        </div>
        <div className="runtime-catalog__toolbar">
          <p><strong>{tours.length.toString().padStart(2, "0")}</strong> {visual.count}</p>
          <p className="runtime-catalog__disclosure" role="note">{copy.runtimeDisclosure}</p>
        </div>
        {tours.length === 0 ? <p>{copy.emptyCatalog}</p> : (
          <div className="runtime-catalog__grid">
            {tours.map((tour, index) => {
              const departures = availability.filter((item) => item.tourVersionId === tour.versionId);
              const picture = tourImages[tour.slug] ?? defaultImage;
              return (
                <article className="runtime-tour" key={`${tour.id}:${tour.versionId}`}>
                  <figure className="runtime-tour__media">
                    <Image src={picture.src} alt={picture[locale]} width={800} height={500} loading={index === 0 ? "eager" : "lazy"} />
                    <figcaption>{visual.image}</figcaption>
                  </figure>
                  <div className="runtime-tour__body">
                    <div className="runtime-tour__meta">
                      <span><Clock3 size={15} aria-hidden="true" />{tour.durationMinutes} {visual.minutes}</span>
                      <span><Route size={15} aria-hidden="true" />{tour.stops.length} {visual.stops}</span>
                    </div>
                    <h2>{tour.title}</h2>
                    <p className="runtime-tour__summary">{tour.summary}</p>
                    <p className="runtime-tour__price">{formatVnd(tour.priceVndMinor, locale)} <span>{visual.perPerson}</span></p>
                    <details className="runtime-tour__details">
                      <summary>{visual.details}</summary>
                      <dl>
                        <div><dt>{copy.meetingPoint}</dt><dd>{tour.meetingPoint}</dd></div>
                        <div><dt>{copy.stops}</dt><dd>{tour.stops.map((stop) => stop.title).join(", ")}</dd></div>
                        <div><dt>{copy.cancellationPolicy}</dt><dd>{tour.cancellationPolicy}</dd></div>
                      </dl>
                    </details>
                    <div className="runtime-tour__departures">
                      <h3><CalendarDays size={16} aria-hidden="true" />{visual.departures}</h3>
                      {departures.length === 0 ? <p>{copy.notFound}</p> : departures.map((departure) => {
                        const canBook = departure.status === "scheduled" && departure.remainingCapacity > 0;
                        return (
                          <div className={`runtime-tour__departure${canBook ? "" : " runtime-tour__departure--unavailable"}`} key={departure.id}>
                            <div>
                              <p><time dateTime={departure.startAt}>{formatDate(departure.startAt, locale)}</time></p>
                              <p className="runtime-tour__seats">{canBook ? copy.seatsRemaining(departure.remainingCapacity) : copy.soldOut}</p>
                            </div>
                            {canBook ? (
                              <Link className="runtime-tour__book" aria-label={`${copy.bookTour(tour.title)} — ${formatDate(departure.startAt, locale)}`} href={`/${locale}/booking/?departure=${departure.id}&partySize=1`}>
                                {visual.book}<ArrowUpRight size={17} aria-hidden="true" />
                              </Link>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
