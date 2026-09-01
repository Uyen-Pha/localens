"use client";

import { useCallback, useEffect, useState } from "react";

import type { FixedTourRuntimePort } from "@/lib/application/fixed-tour/contracts";
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
  const [retryKey, setRetryKey] = useState(0);

  const load = useCallback(async () => {
    setState("loading");
    try {
      setBookings(await fixedTour.listOwnBookings());
      setState("ready");
    } catch {
      setBookings([]);
      setState("error");
    }
  }, [fixedTour]);

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
    <section aria-labelledby="runtime-bookings-heading">
      <h2 id="runtime-bookings-heading">{copy.accountHeading}</h2>
      <p role="note">{copy.pendingPayment}</p>
      {bookings.length === 0 ? <p>{copy.emptyBookings}</p> : (
        <div>
          {bookings.map((booking) => (
            <article key={booking.id}>
              <h3>{locale === "vi" ? booking.titleVi : booking.titleEn}</h3>
              <dl>
                <div><dt>{copy.party}</dt><dd>{booking.partySize}</dd></div>
                <div><dt>{copy.meetingPoint}</dt><dd>{booking.meetingPoint}</dd></div>
                <div><dt>{copy.total}</dt><dd>{formatMoney(booking.checkoutAmountMinor, booking.checkoutCurrency, locale)}</dd></div>
                <div><dt>{copy.createdAt}</dt><dd>{formatDate(booking.createdAt, locale)}</dd></div>
                <div><dt>{copy.holdExpiresAt}</dt><dd>{formatDate(booking.holdExpiresAt, locale)}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
