"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  FixedTourRuntimeError,
  type FixedTourPaymentStatus,
  type FixedTourRuntimePort,
} from "@/lib/application/fixed-tour/contracts";
import {
  PortalError,
  type BookingCancellation,
} from "@/lib/application/portal/contracts";
import type { CustomerBooking } from "@/lib/domain/data/contracts";
import type { Locale } from "@/lib/i18n/config";
import type { SupabaseBookingCancellationPort } from "@/lib/infrastructure/supabase/booking-cancellation-adapter";
import {
  bookingCancellationCopy,
  cancellationReasonLabel,
} from "@/lib/i18n/booking-cancellation";
import { fixedTourRuntimeCopy } from "@/lib/i18n/fixed-tour-runtime";

import {
  BookingCancellationDialog,
  type BookingCancellationReasonValue,
} from "@/components/customer/booking-cancellation-dialog";

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
  bookingCancellations,
}: {
  locale: Locale;
  fixedTour: FixedTourRuntimePort;
  bookingCancellations: SupabaseBookingCancellationPort;
}) {
  const copy = fixedTourRuntimeCopy(locale);
  const cancellationCopy = bookingCancellationCopy(locale);
  const [state, setState] = useState<LoadState>("loading");
  const [bookings, setBookings] = useState<CustomerBooking[]>([]);
  const [payments, setPayments] = useState<FixedTourPaymentStatus[]>([]);
  const [cancellations, setCancellations] = useState<BookingCancellation[]>([]);
  const [retryKey, setRetryKey] = useState(0);
  const [submittingBookingId, setSubmittingBookingId] = useState<string | null>(null);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);
  const [openCancellationId, setOpenCancellationId] = useState<string | null>(null);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [cancellationMessage, setCancellationMessage] = useState<string | null>(null);
  const [cancellationError, setCancellationError] = useState<string | null>(null);
  const cancellationTriggerRef = useRef<HTMLElement | null>(null);
  const cancellationStatusRef = useRef<HTMLParagraphElement>(null);

  const load = useCallback(async ({ preserveCurrent = false }: { preserveCurrent?: boolean } = {}) => {
    if (!preserveCurrent) setState("loading");
    try {
      const [nextBookings, nextPayments, nextCancellations] = await Promise.all([
        fixedTour.listOwnBookings(),
        fixedTour.listOwnPaymentStatuses(),
        bookingCancellations.listOwnCancellations(),
      ]);
      setBookings(nextBookings);
      setPayments(nextPayments);
      setCancellations(nextCancellations);
      setState("ready");
      return true;
    } catch {
      if (!preserveCurrent) {
        setBookings([]);
        setPayments([]);
        setCancellations([]);
        setState("error");
      }
      return false;
    }
  }, [bookingCancellations, fixedTour]);

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
    if (!(error instanceof PortalError)) return cancellationCopy.unavailable;
    if (error.code === "CONFLICT" || error.code === "NOT_FOUND") return cancellationCopy.conflict;
    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") return cancellationCopy.denied;
    if (error.code === "INVALID_INPUT") return cancellationCopy.invalid;
    return cancellationCopy.unavailable;
  }

  async function cancelBooking(bookingId: string, reason: BookingCancellationReasonValue): Promise<void> {
    if (cancellingBookingId !== null || submittingBookingId !== null) return;
    setCancellingBookingId(bookingId);
    setCancellationMessage(null);
    setCancellationError(null);
    try {
      await bookingCancellations.cancelBooking({
        bookingId,
        reasonCode: reason.reasonCode,
        otherReason: reason.otherReason,
        idempotencyKey: cancellationKey(bookingId),
      });
      const refreshed = await load({ preserveCurrent: true });
      if (!refreshed) {
        setCancellationError(cancellationCopy.refreshUnavailable);
        return;
      }
      setOpenCancellationId(null);
      setCancellationMessage(cancellationCopy.success);
    } catch (error) {
      const message = cancellationErrorText(error);
      setCancellationError(message);
      if (error instanceof PortalError && (error.code === "CONFLICT" || error.code === "NOT_FOUND")) {
        const refreshed = await load({ preserveCurrent: true });
        if (!refreshed) {
          setCancellationError(cancellationCopy.refreshUnavailable);
          return;
        }
        setOpenCancellationId(null);
        setCancellationError(message);
      }
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
            const canCancel = booking.status === "pending_payment" && cancellation === undefined;
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
                {cancellation ? (
                  <section aria-labelledby={`runtime-cancellation-${booking.id}`}>
                    <h4 id={`runtime-cancellation-${booking.id}`}>{cancellationCopy.cancelledStatus}</h4>
                    <dl>
                      <div><dt>{cancellationCopy.cancelledAt}</dt><dd>{formatDate(cancellation.cancelledAt, locale)}</dd></div>
                      <div><dt>{cancellationCopy.reason}</dt><dd>{cancellationReasonLabel(cancellation.reasonCode, locale)}</dd></div>
                      {cancellation.otherReason ? <div><dt>{cancellationCopy.otherLabel}</dt><dd>{cancellation.otherReason}</dd></div> : null}
                    </dl>
                  </section>
                ) : canCancel ? (
                  <button
                    type="button"
                    disabled={mutationPending}
                    onClick={(event) => {
                      cancellationTriggerRef.current = event.currentTarget;
                      setCancellationError(null);
                      setOpenCancellationId(booking.id);
                    }}
                  >
                    {cancellationCopy.trigger}
                  </button>
                ) : null}
                {openCancellationId === booking.id ? (
                  <BookingCancellationDialog
                    locale={locale}
                    bookingTitle={title}
                    submitting={cancellingBookingId === booking.id}
                    error={cancellationError}
                    returnFocus={cancellationTriggerRef.current}
                    onClose={() => setOpenCancellationId(null)}
                    onConfirm={(reason) => void cancelBooking(booking.id, reason)}
                  />
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
      {(cancellingBookingId !== null || cancellationMessage !== null) ? (
        <p ref={cancellationStatusRef} role="status" aria-live="polite" tabIndex={-1}>
          {cancellingBookingId !== null ? cancellationCopy.confirming : cancellationMessage}
        </p>
      ) : null}
      {cancellationError ? <p role="alert">{cancellationError}</p> : null}
    </section>
  );
}
