"use client";
import { TourReviews } from './tour-reviews';

import Link from "next/link";
import { BookingSelectors } from "./booking-selectors";
import { previewMoney } from "./departure-calendar";
import { TourGallery, TourFAQs } from "./tour-detail-extras";
import { ArrowLeft, ArrowRight, CalendarDays, Clock3, MapPin, ShieldCheck, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import {
  FixedTourRuntimeError,
  type FixedTourRuntimeErrorCode,
} from "@/lib/application/fixed-tour/contracts";
import type { SupabasePortalShell } from "@/lib/application/portal/supabase-shell";
import type { LiveDepartureAvailability, PublishedTour } from "@/lib/domain/data/contracts";
import { tourIllustration } from "@/lib/domain/data/tour-illustrations";
import type { Locale } from "@/lib/i18n/config";
import { fixedTourRuntimeCopy } from "@/lib/i18n/fixed-tour-runtime";
import { signInPath } from "@/lib/navigation/safe-return-to";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type ReadyState = "loading" | "ready" | FixedTourRuntimeErrorCode;

function keyFor(locale: Locale, departureId: string, partySize: number): string {
  return `localens.fixed-tour.hold:${locale}:${departureId}:${partySize}`;
}

function idempotencyKey(locale: Locale, departureId: string, partySize: number): string {
  const storageKey = keyFor(locale, departureId, partySize);
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const generated = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `hold-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  window.sessionStorage.setItem(storageKey, generated);
  return generated;
}

export function RuntimeFixedTourBooking({
  locale,
  composition,
  departureId,
  initialPartySize,
  localCalendar = false,
  overview,
  returnTo,
  navigate,
}: {
  locale: Locale;
  composition: Pick<SupabasePortalShell, "initialized" | "session" | "fixedTour">;
  departureId: string;
  initialPartySize: string;
  localCalendar?: boolean;
  overview?: { transport: string; note: string };
  returnTo?: string | null;
  navigate: (path: string) => void;
}) {
  const copy = fixedTourRuntimeCopy(locale);
  const ui = locale === "vi" ? {
    back: "Tất cả tour", eyebrow: "Khám phá cùng LocalLens", image: "Ảnh minh họa trải nghiệm",
    itinerary: "Hành trình của bạn", minutes: "phút", perPerson: "/ khách", total: "Tổng tiền",
    unitPrice: "Giá mỗi khách", select: "Chọn số người tham gia", departure: "Lịch khởi hành",
    secure: "Giữ chỗ trong 15 phút", explanation: "Kiểm tra thông tin chuyến đi trước khi xác nhận.",
    priceNote: "Số tiền chính thức được xác nhận khi tạo giữ chỗ.", included: "Bao gồm", excluded: "Chưa bao gồm",
    reserve: "Đặt tour", steps: ["Chọn tour", "Giữ chỗ", "Thanh toán"], signIn: "Đăng nhập để tiếp tục",
  } : {
    back: "All tours", eyebrow: "Explore with LocalLens", image: "Illustrative experience photo",
    itinerary: "Your itinerary", minutes: "min", perPerson: "/ person", total: "Total",
    unitPrice: "Price per person", select: "Choose your group size", departure: "Departure",
    secure: "A 15-minute hold", explanation: "Review your trip details before confirming.",
    priceNote: "The final amount is confirmed when your hold is created.", included: "Included", excluded: "Not included",
    reserve: "Book tour", steps: ["Choose a tour", "Hold your places", "Payment"], signIn: "Sign in to continue",
  };
  const [state, setState] = useState<ReadyState>("loading");
  const [departure, setDeparture] = useState<LiveDepartureAvailability | null>(null);
  const [departures, setDepartures] = useState<LiveDepartureAvailability[]>([]);
  const [tour, setTour] = useState<PublishedTour | null>(null);
  const [partySize, setPartySize] = useState(initialPartySize);
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [connectionLost, setConnectionLost] = useState(false);
  const submittingRef = useRef(false);
  const partyRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let disposed = false;
    setState("loading");
    setDeparture(null);
    setTour(null);
    void (async () => {
      try {
        await composition.initialized;
        if (!UUID_PATTERN.test(departureId)) {
          if (!disposed) setState("NOT_FOUND");
          return;
        }
        const session = await composition.session.getSession();
        if (session && session.role !== "customer") {
          if (!disposed) setState("FORBIDDEN");
          return;
        }
        const [availability, tours] = await Promise.all([
          composition.fixedTour.listAvailability(), composition.fixedTour.listPublishedTours(locale),
        ]);
        const available = availability.find((item) => item.id === departureId);
        const selected = tours.find((item) => item.versionId === available?.tourVersionId);
        if (!available || !selected) {
          if (!disposed) setState("NOT_FOUND");
          return;
        }
        if (available.status !== "scheduled" || available.remainingCapacity < 1) {
          if (!disposed) setState("SOLD_OUT");
          return;
        }
        if (!disposed) {
          setDepartures(availability.filter(item => item.tourVersionId === available.tourVersionId));
          setDeparture(available);
          setTour(selected);
          setState("ready");
        }
      } catch {
        if (!disposed) setState("SERVICE_UNAVAILABLE");
      }
    })();
    return () => { disposed = true; };
  }, [composition, departureId, locale]);

  useEffect(() => {
    if (state !== "ready" && state !== "loading") alertRef.current?.focus();
  }, [state]);

  function message(code: Exclude<ReadyState, "loading" | "ready">): string {
    if (code === "UNAUTHENTICATED") return copy.signInRequired;
    if (code === "FORBIDDEN") return copy.accessDenied;
    if (code === "IDEMPOTENCY_CONFLICT") return copy.idempotencyConflict;
    if (code === "SOLD_OUT") return copy.soldOut;
    if (code === "NOT_FOUND" || code === "INVALID_INPUT") return copy.notFound;
    return copy.serviceUnavailable;
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submittingRef.current || departure === null) return;
    const size = Number(partySize);
    if (!Number.isSafeInteger(size) || size < 1 || size > 15) {
      setState("INVALID_INPUT");
      queueMicrotask(() => partyRef.current?.focus());
      return;
    }
    if (size > departure.remainingCapacity) {
      setBookingError(locale === "vi" ? `Chỉ còn lại ${departure.remainingCapacity} chỗ` : `Only ${departure.remainingCapacity} places remain`);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setBookingError("");
    let stage: "check" | "create" = "check";
    try {
      const session = await composition.session.getSession();
      if (!session) {
        window.location.assign(signInPath(locale, `/${locale}/booking/?departure=${departure.id}&partySize=${size}`));
        return;
      }
      const fresh = await composition.fixedTour.listAvailability();
      setConnectionLost(false);
      setDepartures(fresh.filter(item => item.tourVersionId === departure.tourVersionId));
      const latest = fresh.find(item => item.id === departure.id);
      if (latest) setDeparture(latest);
      if (!latest || latest.status !== "scheduled" || latest.remainingCapacity < size) {
        setBookingError(locale === "vi" ? "Rất tiếc, số chỗ vừa thay đổi. Vui lòng chọn lại" : "Availability has just changed. Please choose again.");
        return;
      }
      stage = "create";
      const result = await composition.fixedTour.beginBooking({
        departureId: departure.id,
        partySize: size,
        locale,
        idempotencyKey: idempotencyKey(locale, departure.id, size),
      });
      navigate(`/${locale}/account/?hold=${result.state}`);
    } catch (error) {
      if (error instanceof FixedTourRuntimeError && error.code === "SOLD_OUT") {
        setBookingError(locale === "vi" ? "Rất tiếc, số chỗ vừa thay đổi. Vui lòng chọn lại" : "Availability has just changed. Please choose again.");
        try {
          const fresh = await composition.fixedTour.listAvailability();
          setDepartures(fresh.filter(item => item.tourVersionId === departure.tourVersionId));
          const latest = fresh.find(item => item.id === departure.id);
          if (latest) setDeparture(latest);
        } catch { setConnectionLost(true); }
      } else {
        setConnectionLost(stage === "check");
        setBookingError(locale === "vi"
          ? (stage === "check" ? "Mất kết nối hệ thống. Vui lòng thử lại" : "Đã có lỗi xảy ra. Chưa thể tạo đơn đặt tour. Vui lòng thử lại sau")
          : (stage === "check" ? "Connection lost. Please try again." : "We could not create your booking. Please try again later."));
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const backLink = <Link className="tour-booking__back" href={`/${locale}/tours/`}><ArrowLeft size={16} aria-hidden="true" />{ui.back}</Link>;
  if (state === "loading") return <div className="tour-booking">{backLink}<div className="tour-booking__state" role="status" aria-live="polite">{copy.loading}</div></div>;
  const invalidParty = state === "INVALID_INPUT";
  if ((state !== "ready" && !invalidParty) || !departure || !tour) {
    return (
      <section className="tour-booking tour-detail" aria-labelledby="runtime-booking-heading">
        {backLink}
        <div className="tour-booking__state">
          <ShieldCheck size={32} aria-hidden="true" />
          <h1 id="runtime-booking-heading">{copy.bookingHeading}</h1>
          <p ref={alertRef} tabIndex={-1} role="alert">{state === "ready" ? copy.notFound : message(state)}</p>
          {state === "UNAUTHENTICATED" ? <Link className="tour-booking__button" href={signInPath(locale, returnTo)}>{ui.signIn}<ArrowRight size={18} aria-hidden="true" /></Link>
            : <Link className="tour-booking__button" href={`/${locale}/tours/`}>{ui.back}<ArrowRight size={18} aria-hidden="true" /></Link>}
        </div>
      </section>
    );
  }

  const picture = tourIllustration(tour.slug);
  const size = Number(partySize);
  const validSize = Number.isSafeInteger(size) && size >= 1 && size <= 15 && size <= departure.remainingCapacity;
  const unitPrice = Number(tour.priceVndMinor);
  const validPrice = Number.isSafeInteger(unitPrice) && unitPrice >= 0;
  const currency = new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
  const money = (value: number) => localCalendar ? previewMoney(value, locale) : currency.format(value);
  const total = validPrice && validSize && !connectionLost ? (localCalendar ? money(unitPrice * size) : currency.format(BigInt(tour.priceVndMinor) * BigInt(size))) : "—";
  const date = new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(departure.startAt));
  const timeFormat = new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });

  return (
    <section className="tour-booking tour-detail" aria-labelledby="runtime-booking-heading">
      {backLink}
      <ol className="tour-booking__steps" aria-label={copy.bookingHeading}>
        {ui.steps.map((step, index) => <li key={step} aria-current={index === 1 ? "step" : undefined}><span>{index + 1}</span>{step}</li>)}
      </ol>
      <div className="tour-booking__layout">
        <div className="tour-booking__story">
          <TourGallery locale={locale} slug={tour.slug} src={picture.src} alt={picture[locale]}/><p className="tour-booking__eyebrow">{ui.eyebrow}</p>
          <h1 id="runtime-booking-heading">{tour.title}</h1>
          <p className="tour-booking__intro">{tour.summary}</p>
          {overview && <dl className="tour-booking__overview">
            <div><dt><Clock3 size={16} aria-hidden="true" />{locale === "vi" ? "Khung giờ" : "Tour hours"}</dt><dd>{timeFormat.format(new Date(departure.startAt))} – {timeFormat.format(new Date(departure.endAt))}</dd></div>
            <div><dt><Users size={16} aria-hidden="true" />{locale === "vi" ? "Nhóm nhỏ" : "Small group"}</dt><dd>{locale === "vi" ? "Tối đa 15 khách" : "Up to 15 guests"}</dd></div>
            <div><dt><MapPin size={16} aria-hidden="true" />{locale === "vi" ? "Di chuyển" : "Getting around"}</dt><dd>{overview.transport}</dd></div>
          </dl>}
          <div className="tour-booking__facts">
            <div><Clock3 size={20} aria-hidden="true" /><p><span>{copy.duration}</span><strong>{Math.floor(tour.durationMinutes / 60)} {locale === "vi" ? "giờ" : "hr"}{tour.durationMinutes % 60 > 0 ? ` ${tour.durationMinutes % 60} ${ui.minutes}` : ""}</strong></p></div>
            <div><MapPin size={20} aria-hidden="true" /><p><span>{copy.meetingPoint}</span><strong>{tour.meetingPoint}</strong></p></div>
          </div>
          <nav className="tour-detail-nav" aria-label={locale === "vi" ? "Thông tin tour" : "Tour information"}><a href="#booking-itinerary">{locale === "vi" ? "Lịch trình" : "Itinerary"}</a><a href="#booking-inclusions">{locale === "vi" ? "Giá bao gồm" : "Inclusions"}</a><a href="#booking-notes">{locale === "vi" ? "Lưu ý" : "Before you go"}</a><a href="#tour-reviews-heading">{locale === "vi" ? "Đánh giá" : "Reviews"}</a></nav><section className="tour-booking__itinerary" aria-labelledby="booking-itinerary">
            <h2 id="booking-itinerary">{ui.itinerary}</h2>
            <ol>{tour.stops.map((stop, index) => <li key={`${stop.position}:${stop.placeId}`}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{stop.title.includes(" · ") ? stop.title.split(" · ").slice(1).join(" · ") : stop.title}</h3>{stop.title.includes(" · ") && <p className="tour-detail-stop-time">{stop.title.split(" · ")[0]}</p>}</div></li>)}</ol>
          </section>
          <div className="tour-booking__inclusions" id="booking-inclusions">
            {tour.inclusions.length > 0 && <section><h2>{ui.included}</h2><ul>{tour.inclusions.map((item, index) => <li key={index}>{item}</li>)}</ul></section>}
            {tour.exclusions.length > 0 && <section><h2>{ui.excluded}</h2><ul>{tour.exclusions.map((item, index) => <li key={index}>{item}</li>)}</ul></section>}
          </div>
          <details className="tour-booking__policy" id="booking-notes"><summary>{copy.cancellationPolicy}</summary><p>{tour.cancellationPolicy}</p></details>
          
          {overview && <details className="tour-booking__policy"><summary>{locale === "vi" ? "Thông tin cần biết trước chuyến đi" : "Before you go"}</summary><p>{overview.note}</p></details>}
        </div>
        <aside className="tour-booking__checkout" aria-labelledby="booking-checkout">
          <p className="tour-booking__eyebrow">{copy.catalogEyebrow}</p>
          <h2 id="booking-checkout">{ui.reserve}</h2>
          <p className="tour-booking__price">{validPrice ? money(unitPrice) : "—"}<span>{ui.perPerson}</span></p>
          
          {localCalendar && <BookingSelectors partySize={partySize} onPartyChange={value => { setPartySize(value); setBookingError(""); if (invalidParty) setState("ready"); }} locale={locale} departures={departures} selected={departure} price={validPrice ? money(unitPrice) : "—"} disabled={submitting} onSelect={next => { setDeparture(next); setBookingError(""); if (invalidParty) setState("ready"); }} />}
          {localCalendar && locale === "en" && <p className="tour-booking__hint">Illustrative conversion: $1 = 26,000 VND. Base prices and booking amounts remain in VND.</p>}
          <div className="tour-booking__date"><CalendarDays size={22} aria-hidden="true" /><div><span>{ui.departure}</span><strong><time dateTime={departure.startAt}>{date}</time></strong><p>{timeFormat.format(new Date(departure.startAt))} – {timeFormat.format(new Date(departure.endAt))} (GMT+7)</p></div></div>
          <p className="tour-booking__capacity"><Users size={16} aria-hidden="true" />{copy.seatsRemaining(departure.remainingCapacity)}</p>
          <form noValidate onSubmit={(event) => void submit(event)}>
            {!localCalendar && <><label htmlFor="booking-party-size">{copy.partySize}</label>
            <p className="tour-booking__hint" id="booking-party-hint">{locale === "vi" ? "Mỗi đơn đặt tối đa 15 khách." : "Up to 15 travelers per booking."}</p>
            <input id="booking-party-size" ref={partyRef} type="number" min={1} max={15} required value={partySize} disabled={submitting} aria-describedby="booking-party-hint" aria-invalid={invalidParty || undefined} onChange={(event) => { setPartySize(event.target.value); if (invalidParty) setState("ready"); }} />
            </>}
            {invalidParty && <p className="tour-booking__error" ref={alertRef} tabIndex={-1} role="alert">{locale === "vi" ? "Vui lòng chọn từ 1 đến 15 khách." : "Please select 1 to 15 travelers."}</p>}
            {(bookingError || size > departure.remainingCapacity) && <p className="tour-booking__error" role="alert">{bookingError || (locale === "vi" ? `Chỉ còn lại ${departure.remainingCapacity} chỗ` : `Only ${departure.remainingCapacity} places remain`)}</p>}
            <div className="tour-booking__breakdown"><span>{ui.unitPrice}</span><span>{validPrice ? money(unitPrice) : "—"}</span></div>
            <div className="tour-booking__total"><span>{ui.total}</span><output aria-label={ui.total} aria-live="polite">{total}</output></div>
            <button className="tour-booking__button" type="submit" disabled={submitting}>{submitting ? copy.holding : ui.reserve}<ArrowRight size={18} aria-hidden="true" /></button>
          </form>
          <div className="tour-booking__assurance"><ShieldCheck size={22} aria-hidden="true" /><div><strong>{ui.secure}</strong><p>{ui.explanation}</p></div></div>
          <p className="tour-booking__disclosure" role="note">{copy.runtimeDisclosure}</p>
        </aside></div><TourReviews locale={locale} departure={departure.id}/><TourFAQs locale={locale}/>
    </section>
  );
}




