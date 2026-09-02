"use client";

import { useCallback, useEffect, useState } from "react";

import {
  FixedTourRuntimeError,
  type FixedTourPaymentStatus,
  type FixedTourRuntimePort,
} from "@/lib/application/fixed-tour/contracts";
import type { CustomerBooking } from "@/lib/domain/data/contracts";
import type { Locale } from "@/lib/i18n/config";
import { fixedTourRuntimeCopy } from "@/lib/i18n/fixed-tour-runtime";

type LoadState = "loading" | "ready" | "error";

function formatMoney(value: string, currency: CustomerBooking["checkoutCurrency"], locale: Locale): string {
  const amount = Number(value);
  return Number.isSafeInteger(amount)
    ? new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(amount)
    : value;
}

function formatDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function paymentKey(bookingId: string): string {
  const storageKey = `localens.fixed-tour.payment:${bookingId}`;
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const suffix = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const generated = `payment-${suffix}`;
  window.sessionStorage.setItem(storageKey, generated);
  return generated;
}

export function RuntimeFixedTourAccount({
  locale,
  fixedTour,
}: {
  locale: Locale;
  fixedTour: FixedTourRuntimePort;
}) {
  const copy = fixedTourRuntimeCopy(locale);
  const [state, setState] = useState<LoadState>("loading");
  const [bookings, setBookings] = useState<CustomerBooking[]>([]);
  const [payments, setPayments] = useState<FixedTourPaymentStatus[]>([]);
  const [retryKey, setRetryKey] = useState(0);
  const [submittingBookingId, setSubmittingBookingId] = useState<string | null>(null);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [nextBookings, nextPayments] = await Promise.all([
        fixedTour.listOwnBookings(),
        fixedTour.listOwnPaymentStatuses(),
      ]);
      setBookings(nextBookings);
      setPayments(nextPayments);
      setState("ready");
      return true;
    } catch {
      setBookings([]);
      setPayments([]);
      setState("error");
      return false;
    }
  }, [fixedTour]);

  useEffect(() => { void load(); }, [load, retryKey]);

  function paymentErrorText(error: unknown): string {
    if (!(error instanceof FixedTourRuntimeError)) return copy.paymentUnavailable;
    if (error.code === "IDEMPOTENCY_CONFLICT") return copy.paymentConflict;
    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") return copy.paymentDenied;
    return copy.paymentUnavailable;
  }

  async function completePayment(bookingId: string): Promise<void> {
    if (submittingBookingId !== null) return;
    setSubmittingBookingId(bookingId);
    setPaymentMessage(null);
    setPaymentError(null);
    try {
      const result = await fixedTour.completeSimulatedPayment({
        bookingId,
        idempotencyKey: paymentKey(bookingId),
      });
      if (await load()) {
        setPaymentMessage(result.state === "expired" ? copy.paymentExpired : copy.paymentRecorded);
      }
    } catch (error) {
      setPaymentError(paymentErrorText(error));
    } finally {
      setSubmittingBookingId(null);
    }
  }

  if (state === "loading") return <p role="status" aria-live="polite">{copy.loading}</p>;
  if (state === "error") {
    return (
      <div role="alert">
        <p>{copy.serviceUnavailable}</p>
        <button type="button" onClick={() => setRetryKey((value) => value + 1)}>{copy.retry}</button>
      </div>
    );
  }

  const paymentByBooking = new Map(payments.map((payment) => [payment.bookingId, payment]));

  return (
    <section aria-labelledby="runtime-bookings-heading">
      <h2 id="runtime-bookings-heading">{copy.accountHeading}</h2>
      {bookings.length === 0 ? <p>{copy.emptyBookings}</p> : (
        <div>
          {bookings.map((booking) => {
            const title = locale === "vi" ? booking.titleVi : booking.titleEn;
            const titleId = `runtime-booking-${booking.id}`;
            const paymentHeadingId = `runtime-payment-${booking.id}`;
            const payment = paymentByBooking.get(booking.id);
            const canPay = booking.status === "pending_payment" && payment === undefined;
            const paymentLabel = payment?.paymentStatus === "paid"
              ? copy.paymentPaid
              : payment === undefined && booking.status === "pending_payment"
                ? copy.paymentPending
                : copy.noSimulatedPayment;
            return (
              <article key={booking.id} aria-labelledby={titleId}>
                <h3 id={titleId}>{title}</h3>
                <dl>
                  <div><dt>{copy.bookingStatus}</dt><dd>{copy.bookingStatusLabels[booking.status]}</dd></div>
                  <div><dt>{copy.paymentStatus}</dt><dd>{paymentLabel}</dd></div>
                  <div><dt>{copy.party}</dt><dd>{booking.partySize}</dd></div>
                  <div><dt>{copy.meetingPoint}</dt><dd>{booking.meetingPoint}</dd></div>
                  <div><dt>{copy.total}</dt><dd>{formatMoney(booking.checkoutAmountMinor, booking.checkoutCurrency, locale)}</dd></div>
                  <div><dt>{copy.createdAt}</dt><dd>{formatDate(booking.createdAt, locale)}</dd></div>
                  <div><dt>{copy.holdExpiresAt}</dt><dd>{formatDate(booking.holdExpiresAt, locale)}</dd></div>
                  {payment ? <div><dt>{copy.simulatedAt}</dt><dd>{formatDate(payment.simulatedAt, locale)}</dd></div> : null}
                </dl>
                {(canPay || payment !== undefined) ? (
                  <section aria-labelledby={paymentHeadingId}>
                    <h4 id={paymentHeadingId}>{copy.paymentHeading}</h4>
                    <p role="note">{copy.simulationDisclosure}</p>
                    {canPay ? (
                      <button
                        type="button"
                        disabled={submittingBookingId !== null}
                        onClick={() => void completePayment(booking.id)}
                      >
                        {copy.completePayment}
                      </button>
                    ) : null}
                  </section>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
      {(submittingBookingId !== null || paymentMessage !== null) ? (
        <p role="status" aria-live="polite">
          {submittingBookingId !== null ? copy.completingPayment : paymentMessage}
        </p>
      ) : null}
      {paymentError ? <p role="alert">{paymentError}</p> : null}
    </section>
  );
}
