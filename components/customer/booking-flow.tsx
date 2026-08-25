"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import type { Locale } from "@/lib/i18n/config";
import {
  createLocalBooking,
  createTestPayment,
  getDemoDeparture,
  type LocalDemoBooking,
} from "@/lib/application/booking/mock-booking";

export interface BookingCopy {
  heading: string;
  intro: string;
  demoDisclosure: string;
  loadingLabel: string;
  invalidDepartureTitle: string;
  invalidPartySizeTitle: string;
  invalidDepartureMessage: string;
  invalidPartySizeMessage: string;
  backToToursLabel: string;
  partySizeLabel: string;
  partySizeHint: string;
  availabilityLabel: string;
  dateLabel: string;
  startLabel: string;
  timezoneLabel: string;
  meetingPointLabel: string;
  sourceLabel: string;
  sourceValue: string;
  unitPriceLabel: string;
  totalLabel: string;
  inclusionsLabel: string;
  inclusionsValue: string;
  continueLabel: string;
  paymentHeading: string;
  paymentIntro: string;
  paymentBanner: string;
  holdLabel: string;
  testSessionLabel: string;
  holdDurationLabel: string;
  testSessionDurationLabel: string;
  paymentStatusLabel: string;
  unpaidStatus: string;
  payLabel: string;
  payingLabel: string;
  successHeading: string;
  successMessage: string;
  successReferenceLabel: string;
  successStatusLabel: string;
  paidStatus: string;
  nextStepsLabel: string;
  nextStepsValue: string;
  cancelLabel: string;
  cancelledMessage: string;
  retryFlowMessage: string;
  retryLabel: string;
  errorLabel: string;
  soldOutMessage: string;
  holdExpiredMessage: string;
  sessionExpiredMessage: string;
  genericErrorMessage: string;
  tourTitles: Record<string, string>;
}

type BookingRequest = { departureId: string; partySize: number };
type BookingErrorKey = "invalidDeparture" | "invalidPartySize" | "soldOut" | "holdExpired" | "sessionExpired" | "generic";
type PaymentPhase = "idle" | "processing" | "success" | "error";

function parsePartySize(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 20 ? parsed : undefined;
}

function formatMoney(value: number, locale: Locale): string {
  const number = new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
    maximumFractionDigits: 0,
  }).format(value);
  return `VND\u00a0${number}`;
}

function formatDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
    dateStyle: "long",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function errorKeyForMessage(message: string): BookingErrorKey {
  if (message === "Not enough demo capacity") return "soldOut";
  if (message === "Demo booking hold expired") return "holdExpired";
  if (message === "Demo payment session expired") return "sessionExpired";
  return "generic";
}

function errorText(copy: BookingCopy, key: BookingErrorKey): string {
  switch (key) {
    case "invalidPartySize": return copy.invalidPartySizeMessage;
    case "soldOut": return copy.soldOutMessage;
    case "holdExpired": return copy.holdExpiredMessage;
    case "sessionExpired": return copy.sessionExpiredMessage;
    case "invalidDeparture": return copy.invalidDepartureMessage;
    default: return copy.genericErrorMessage;
  }
}

export function BookingFlow({ locale, copy }: { locale: Locale; copy: BookingCopy }) {
  const [request, setRequest] = useState<BookingRequest | null>(null);
  const [queryError, setQueryError] = useState<BookingErrorKey | null>(null);
  const [partySize, setPartySize] = useState(1);
  const [booking, setBooking] = useState<LocalDemoBooking | null>(null);
  const [bookingError, setBookingError] = useState<BookingErrorKey | null>(null);
  const [paymentPhase, setPaymentPhase] = useState<PaymentPhase>("idle");
  const [paymentError, setPaymentError] = useState<BookingErrorKey | null>(null);
  const partySizeRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLElement>(null);
  const queryErrorRef = useRef<HTMLParagraphElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const paymentTimerRef = useRef<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const setStatusRef = (node: HTMLElement | null) => {
    statusRef.current = node;
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const departureId = params.get("departure");
    const parsedPartySize = parsePartySize(params.get("partySize"));
    if (getDemoDeparture(departureId) === undefined) {
      setQueryError("invalidDeparture");
      return;
    }
    if (parsedPartySize === undefined) {
      setQueryError("invalidPartySize");
      return;
    }
    setPartySize(parsedPartySize);
    setRequest({ departureId: departureId as string, partySize: parsedPartySize });
  }, []);

  useEffect(() => {
    if (bookingError !== null || paymentError !== null || paymentPhase === "processing" || notice !== null) {
      window.setTimeout(() => statusRef.current?.focus(), 0);
    }
  }, [bookingError, notice, paymentError, paymentPhase]);

  useEffect(() => {
    if (queryError !== null) window.setTimeout(() => queryErrorRef.current?.focus(), 0);
  }, [queryError]);

  useEffect(() => {
    if (booking !== null) window.setTimeout(() => headingRef.current?.focus(), 0);
  }, [booking]);

  useEffect(() => () => {
    if (paymentTimerRef.current !== null) window.clearTimeout(paymentTimerRef.current);
  }, []);

  if (queryError !== null) {
    return (
      <section className="customer-section booking-flow" aria-labelledby="booking-heading">
        <p className="eyebrow">LocalLens</p>
        <h1 id="booking-heading">{queryError === "invalidPartySize" ? copy.invalidPartySizeTitle : copy.invalidDepartureTitle}</h1>
        <p ref={queryErrorRef} className="booking-flow__error" role="alert" tabIndex={-1}>{errorText(copy, queryError)}</p>
        <Link className="button button--secondary" href={`/${locale}/tours`}>{copy.backToToursLabel}</Link>
      </section>
    );
  }

  if (request === null) {
    return (
      <section className="customer-section booking-flow" aria-labelledby="booking-heading">
        <p className="eyebrow">LocalLens</p>
        <h1 id="booking-heading">{copy.heading}</h1>
        <p role="status" aria-live="polite">{copy.loadingLabel}</p>
      </section>
    );
  }

  const departure = getDemoDeparture(request.departureId);
  if (departure === undefined) return null;
  const selectedDeparture = departure;
  const tourTitle = copy.tourTitles[departure.tourSlug] ?? departure.tourSlug;

  function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!Number.isSafeInteger(partySize) || partySize < 1 || partySize > 20) {
      setBookingError("invalidPartySize");
      partySizeRef.current?.focus();
      return;
    }
    try {
      const nextBooking = createLocalBooking({ departureId: selectedDeparture.departureId, partySize });
      setRequest({ departureId: selectedDeparture.departureId, partySize });
      setBooking(nextBooking);
      setNotice(null);
      setBookingError(null);
      setPaymentError(null);
      setPaymentPhase("idle");
    } catch (error) {
      setBookingError(errorKeyForMessage(error instanceof Error ? error.message : ""));
    }
  }

  function payInTestMode() {
    if (booking === null || paymentPhase === "processing" || paymentPhase === "success") return;
    setPaymentError(null);
    setPaymentPhase("processing");
    paymentTimerRef.current = window.setTimeout(() => {
      paymentTimerRef.current = null;
      try {
        const paidBooking = createTestPayment({ bookingId: booking.bookingId });
        setBooking(paidBooking);
        setPaymentPhase("success");
      } catch (error) {
        setPaymentError(errorKeyForMessage(error instanceof Error ? error.message : ""));
        setPaymentPhase("error");
      }
    }, 1_000);
  }

  function handlePaymentAction() {
    if (paymentError === "holdExpired" || paymentError === "sessionExpired") {
      setBooking(null);
      setPaymentError(null);
      setPaymentPhase("idle");
      setNotice(copy.retryFlowMessage);
      return;
    }
    payInTestMode();
  }

  function cancelCheckout() {
    if (paymentTimerRef.current !== null) {
      window.clearTimeout(paymentTimerRef.current);
      paymentTimerRef.current = null;
    }
    setBooking(null);
    setPaymentError(null);
    setPaymentPhase("idle");
    setBookingError(null);
    setNotice(copy.cancelledMessage);
  }

  return (
    <section className="customer-section booking-flow" aria-labelledby="booking-heading">
      <div className="section-heading section-heading--compact">
        <p className="eyebrow">LocalLens</p>
        <h1 ref={headingRef} id="booking-heading" tabIndex={-1}>{booking === null ? copy.heading : paymentPhase === "success" ? copy.successHeading : copy.paymentHeading}</h1>
        <p>{booking === null ? copy.intro : paymentPhase === "success" ? copy.successMessage : copy.paymentIntro}</p>
      </div>

      <p className="demo-disclosure" role="note">{copy.demoDisclosure}</p>
      {notice !== null ? <p ref={setStatusRef} className="booking-flow__pending" role="status" tabIndex={-1}>{notice}</p> : null}

      {booking === null ? (
        <form className="booking-flow__card" onSubmit={submitBooking} noValidate>
          <h2>{tourTitle}</h2>
          <dl className="booking-flow__facts">
            <div><dt>{copy.dateLabel}</dt><dd>{formatDate(departure.date, locale)}</dd></div>
            <div><dt>{copy.startLabel}</dt><dd>{departure.startsAt}</dd></div>
            <div><dt>{copy.timezoneLabel}</dt><dd>{departure.timezone}</dd></div>
            <div><dt>{copy.meetingPointLabel}</dt><dd>{departure.meetingPoint}</dd></div>
            <div><dt>{copy.availabilityLabel}</dt><dd>{departure.remainingCapacity}</dd></div>
            <div><dt>{copy.sourceLabel}</dt><dd>{copy.sourceValue}</dd></div>
          </dl>

          <label className="field booking-flow__party-field">
            <span>{copy.partySizeLabel}</span>
            <input
              ref={partySizeRef}
              type="number"
              min={1}
              max={20}
              step={1}
              value={partySize}
              onChange={(event) => setPartySize(Number(event.target.value))}
              aria-label={copy.partySizeLabel}
              aria-invalid={bookingError === "invalidPartySize"}
              aria-describedby="booking-party-hint"
            />
            <small id="booking-party-hint">{copy.partySizeHint}</small>
          </label>

          <dl className="booking-flow__price-summary">
            <div><dt>{copy.unitPriceLabel}</dt><dd>{formatMoney(departure.unitPriceMinor, locale)}</dd></div>
            <div><dt>{copy.totalLabel}</dt><dd>{formatMoney(departure.unitPriceMinor * (Number.isSafeInteger(partySize) ? partySize : 0), locale)}</dd></div>
          </dl>
          <p>{copy.inclusionsLabel}: {copy.inclusionsValue}</p>
          {bookingError !== null ? <p ref={setStatusRef} className="booking-flow__error" role="alert" tabIndex={-1}>{errorText(copy, bookingError)}</p> : null}
          <div className="booking-flow__actions">
            <button className="button" type="submit">{copy.continueLabel}</button>
            <Link className="button button--secondary" href={`/${locale}/tours`}>{copy.backToToursLabel}</Link>
          </div>
        </form>
      ) : paymentPhase === "success" ? (
        <div ref={setStatusRef} className="booking-flow__card" aria-live="polite" tabIndex={-1}>
          <p className="booking-flow__success">{copy.paymentBanner}</p>
          <dl className="booking-flow__facts">
            <div><dt>{copy.successReferenceLabel}</dt><dd><code>{booking.bookingId}</code></dd></div>
            <div><dt>{copy.successStatusLabel}</dt><dd>{copy.paidStatus}</dd></div>
            <div><dt>{copy.totalLabel}</dt><dd>{formatMoney(booking.quote.totalMinor, locale)}</dd></div>
          </dl>
          <p><strong>{copy.nextStepsLabel}:</strong> {copy.nextStepsValue}</p>
          <Link className="button button--secondary" href={`/${locale}/tours`}>{copy.backToToursLabel}</Link>
        </div>
      ) : (
        <div className="booking-flow__card">
          <p className="booking-flow__payment-banner" role="note">{copy.paymentBanner}</p>
          <dl className="booking-flow__facts">
            <div><dt>{copy.totalLabel}</dt><dd>{formatMoney(booking.quote.totalMinor, locale)}</dd></div>
            <div><dt>{copy.holdLabel}</dt><dd><span>{copy.holdDurationLabel}</span> · {new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { timeStyle: "short", timeZone: departure.timezone }).format(new Date(booking.holdExpiresAt))}</dd></div>
            <div><dt>{copy.testSessionLabel}</dt><dd>{copy.testSessionDurationLabel}</dd></div>
            <div><dt>{copy.paymentStatusLabel}</dt><dd>{copy.unpaidStatus}</dd></div>
          </dl>
          {paymentError !== null ? <p ref={setStatusRef} className="booking-flow__error" role="alert" tabIndex={-1}>{errorText(copy, paymentError)}</p> : null}
          {paymentPhase === "processing" ? <p ref={setStatusRef} className="booking-flow__pending" role="status" aria-live="polite" tabIndex={-1}>{copy.payingLabel}</p> : null}
          <div className="booking-flow__actions">
            <button className="button" type="button" disabled={paymentPhase === "processing"} onClick={handlePaymentAction}>
              {paymentPhase === "processing" ? copy.payingLabel : paymentError !== null ? copy.retryLabel : copy.payLabel}
            </button>
            <button className="button button--secondary" type="button" onClick={cancelCheckout}>{copy.cancelLabel}</button>
          </div>
        </div>
      )}
    </section>
  );
}
