"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  FixedTourRuntimeError,
  type FixedTourCancellationRequest,
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

function cancellationKey(bookingId: string): string {
  const storageKey = `localens.fixed-tour.cancellation:${bookingId}`;
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const suffix = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const generated = `cancellation-${suffix}`;
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
  const [cancellations, setCancellations] = useState<FixedTourCancellationRequest[]>([]);
  const [retryKey, setRetryKey] = useState(0);
  const [submittingBookingId, setSubmittingBookingId] = useState<string | null>(null);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);
  const [openCancellationId, setOpenCancellationId] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [cancellationMessage, setCancellationMessage] = useState<string | null>(null);
  const [cancellationError, setCancellationError] = useState<string | null>(null);
  const cancellationStatusRef = useRef<HTMLParagraphElement>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [nextBookings, nextPayments, nextCancellations] = await Promise.all([
        fixedTour.listOwnBookings(),
        fixedTour.listOwnPaymentStatuses(),
        fixedTour.listOwnCancellationRequests(),
      ]);
      setBookings(nextBookings);
      setPayments(nextPayments);
      setCancellations(nextCancellations);
      setState("ready");
      return true;
    } catch {
      setBookings([]);
      setPayments([]);
      setCancellations([]);
      setState("error");
      return false;
    }
  }, [fixedTour]);

  useEffect(() => { void load(); }, [load, retryKey]);
  useEffect(() => {
    if (cancellationMessage !== null) cancellationStatusRef.current?.focus();
  }, [cancellationMessage]);

  function paymentErrorText(error: unknown): string {
    if (!(error instanceof FixedTourRuntimeError)) return copy.paymentUnavailable;
    if (error.code === "IDEMPOTENCY_CONFLICT") return copy.paymentConflict;
    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") return copy.paymentDenied;
    return copy.paymentUnavailable;
  }

  async function completePayment(bookingId: string): Promise<void> {
    if (submittingBookingId !== null || cancellingBookingId !== null) return;
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

  function cancellationErrorText(error: unknown): string {
    if (!(error instanceof FixedTourRuntimeError)) return copy.cancellationUnavailable;
    if (error.code === "CONFLICT") return copy.cancellationConflict;
    if (error.code === "IDEMPOTENCY_CONFLICT") return copy.cancellationIdempotencyConflict;
    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") return copy.cancellationDenied;
    return copy.cancellationUnavailable;
  }

  async function requestCancellation(bookingId: string): Promise<void> {
    const reason = cancellationReason.trim();
    if (reason.length === 0 || reason.length > 1000 || cancellingBookingId !== null || submittingBookingId !== null) return;
    setCancellingBookingId(bookingId);
    setCancellationMessage(null);
    setCancellationError(null);
    try {
      await fixedTour.requestCancellation({
        bookingId,
        reason,
        idempotencyKey: cancellationKey(bookingId),
      });
      if (await load()) {
        setOpenCancellationId(null);
        setCancellationReason("");
        setCancellationMessage(copy.cancellationSent);
      }
    } catch (error) {
      setCancellationError(cancellationErrorText(error));
    } finally {
      setCancellingBookingId(null);
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
  const cancellationByBooking = new Map(cancellations.map((request) => [request.bookingId, request]));
  const mutationPending = submittingBookingId !== null || cancellingBookingId !== null;

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
            const cancellation = cancellationByBooking.get(booking.id);
            const canPay = booking.status === "pending_payment" && payment === undefined;
            const canRequestCancellation = booking.status === "pending_payment" && cancellation === undefined;
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
                        disabled={mutationPending}
                        onClick={() => void completePayment(booking.id)}
                      >
                        {copy.completePayment}
                      </button>
                    ) : null}
                  </section>
                ) : null}
                <section aria-labelledby={`runtime-cancellation-${booking.id}`}>
                  <h4 id={`runtime-cancellation-${booking.id}`}>{copy.cancellationHeading}</h4>
                  {cancellation ? (
                    <dl>
                      <div>
                        <dt>{copy.cancellationStatus}</dt>
                        <dd>{copy.cancellationStatusLabels[cancellation.status]}</dd>
                      </div>
                      <div><dt>{copy.reason}</dt><dd>{cancellation.reason}</dd></div>
                      {cancellation.decisionNote ? (
                        <div><dt>{copy.cancellationDecisionNote}</dt><dd>{cancellation.decisionNote}</dd></div>
                      ) : null}
                    </dl>
                  ) : canRequestCancellation ? (
                    openCancellationId === booking.id ? (
                      <form onSubmit={(event) => { event.preventDefault(); void requestCancellation(booking.id); }}>
                        <p role="note" aria-label={copy.cancellationWorkflowLabel}>{copy.cancellationDisclosure}</p>
                        <label>
                          <span>{copy.cancellationReason}</span>
                          <textarea
                            autoFocus
                            aria-describedby={`runtime-cancellation-hint-${booking.id}`}
                            value={cancellationReason}
                            maxLength={1000}
                            disabled={mutationPending}
                            required
                            onChange={(event) => setCancellationReason(event.target.value)}
                          />
                        </label>
                        <small id={`runtime-cancellation-hint-${booking.id}`}>{copy.cancellationReasonHint}</small>
                        <div>
                          <button
                            type="submit"
                            disabled={mutationPending || cancellationReason.trim().length === 0}
                          >
                            {copy.sendCancellation}
                          </button>
                          <button
                            type="button"
                            disabled={mutationPending}
                            onClick={() => { setOpenCancellationId(null); setCancellationReason(""); }}
                          >
                            {copy.closeCancellation}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        disabled={mutationPending}
                        onClick={() => { setCancellationError(null); setOpenCancellationId(booking.id); }}
                      >
                        {copy.requestCancellation}
                      </button>
                    )
                  ) : null}
                </section>
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
      {(cancellingBookingId !== null || cancellationMessage !== null) ? (
        <p ref={cancellationStatusRef} role="status" aria-live="polite" tabIndex={-1}>
          {cancellingBookingId !== null ? copy.sendingCancellation : cancellationMessage}
        </p>
      ) : null}
      {cancellationError ? <p role="alert">{cancellationError}</p> : null}
    </section>
  );
}
