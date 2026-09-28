"use client";

import { useCallback, useEffect, useState } from "react";

import type { AdminBookingManagementProjection } from "@/lib/application/portal/contracts";
import type { Locale } from "@/lib/i18n/config";
import { fixedTourRuntimeCopy } from "@/lib/i18n/fixed-tour-runtime";
import {
  bookingCancellationCopy,
  cancellationReasonLabel,
} from "@/lib/i18n/booking-cancellation";
import type { SupabaseAdminBookingManagementPort } from "@/lib/infrastructure/supabase/booking-cancellation-adapter";

import styles from "@/components/portals/portal.module.css";

function formatDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function bookingStatusClass(status: AdminBookingManagementProjection["bookingStatus"]): string {
  if (status === "cancelled" || status === "expired") return styles.statusCoral;
  if (status === "pending_payment") return styles.statusNeutral;
  return styles.status;
}

export function RuntimeBookingManagement({
  locale,
  bookingManagement,
}: {
  locale: Locale;
  bookingManagement: SupabaseAdminBookingManagementPort;
}) {
  const copy = bookingCancellationCopy(locale);
  const fixedTourCopy = fixedTourRuntimeCopy(locale);
  const [items, setItems] = useState<AdminBookingManagementProjection[] | null>(null);
  const [failed, setFailed] = useState(false);
  const cancellationCount = items?.filter((item) => item.cancellation !== null).length ?? 0;

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setItems(await bookingManagement.listAdminBookings());
    } catch {
      setItems([]);
      setFailed(true);
    }
  }, [bookingManagement]);

  useEffect(() => { void load(); }, [load]);

  return (
    <section
      className={`${styles.card} ${styles.runtimeAdminCard} ${styles.runtimeAdminBookings} runtime-portal-panel`}
      aria-labelledby="runtime-booking-management-heading"
    >
      <div className={styles.sectionHeader}>
        <h2 id="runtime-booking-management-heading">{copy.bookingManagement}</h2>
        {items !== null && !failed ? <span className={styles.eyebrow}>{items.length}</span> : null}
      </div>
      <p className={styles.sectionIntro} role="note">{copy.bookingManagementIntro}</p>
      {items !== null && !failed ? (
        <dl className={styles.metricGrid} aria-label={locale === "vi" ? "Tổng quan đơn đặt tour" : "Booking overview"}>
          <div className={styles.metric}>
            <dt>{copy.totalBookings}</dt>
            <dd>{items.length}</dd>
          </div>
          <div className={styles.metric}>
            <dt>{copy.cancelledBookings}</dt>
            <dd>{cancellationCount}</dd>
          </div>
        </dl>
      ) : null}
      {items === null ? <p className={styles.srStatus} role="status">{locale === "vi" ? "Đang tải…" : "Loading…"}</p> : null}
      {failed ? (
        <div className={styles.error} role="alert">
          <p>{copy.unavailable}</p>
          <button className={styles.button} type="button" onClick={() => void load()}>{locale === "vi" ? "Thử lại" : "Try again"}</button>
        </div>
      ) : null}
      {!failed && items?.length === 0 ? <p className={styles.empty}>{copy.emptyBookings}</p> : null}
      {!failed && items && items.length > 0 ? (
        <div className={styles.list}>
          {items.map((item) => (
            <article className={styles.bookingCard} key={item.bookingId} aria-labelledby={`runtime-booking-management-${item.bookingId}`}>
              <div className={styles.cardTitleLine}>
                <h3 id={`runtime-booking-management-${item.bookingId}`}>{locale === "vi" ? item.titleVi : item.titleEn}</h3>
                <span className={bookingStatusClass(item.bookingStatus)}>{fixedTourCopy.bookingStatusLabels[item.bookingStatus]}</span>
              </div>
              <dl className={styles.facts}>
                <div><dt>{copy.bookingId}</dt><dd>{item.bookingId}</dd></div>
                <div><dt>{copy.customerId}</dt><dd>{item.customerUserId}</dd></div>
                <div><dt>{copy.source}</dt><dd>{item.sourceKind === "departure" ? copy.sourceDeparture : copy.sourceQuote}</dd></div>
                <div><dt>{copy.statusPrefix}</dt><dd>{fixedTourCopy.bookingStatusLabels[item.bookingStatus]}</dd></div>
                <div><dt>{copy.bookingCreatedAt}</dt><dd>{formatDate(item.createdAt, locale)}</dd></div>
                {item.cancellation ? (
                  <>
                    <div><dt>{copy.cancelledAt}</dt><dd>{formatDate(item.cancellation.cancelledAt, locale)}</dd></div>
                    <div><dt>{copy.reason}</dt><dd>{cancellationReasonLabel(item.cancellation.reasonCode, locale)}</dd></div>
                    {item.cancellation.otherReason ? <div><dt>{copy.otherLabel}</dt><dd>{item.cancellation.otherReason}</dd></div> : null}
                  </>
                ) : null}
              </dl>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
