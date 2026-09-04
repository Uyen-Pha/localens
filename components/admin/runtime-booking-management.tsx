"use client";

import { useCallback, useEffect, useState } from "react";

import type { BookingCancellation } from "@/lib/application/portal/contracts";
import type { Locale } from "@/lib/i18n/config";
import {
  bookingCancellationCopy,
  cancellationReasonLabel,
} from "@/lib/i18n/booking-cancellation";

export interface AdminCancellationHistoryPort {
  listAdminCancellations(): Promise<BookingCancellation[]>;
}
function formatDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

export function RuntimeBookingManagement({
  locale,
  history,
}: {
  locale: Locale;
  history: AdminCancellationHistoryPort;
}) {
  const copy = bookingCancellationCopy(locale);
  const [items, setItems] = useState<BookingCancellation[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setItems(await history.listAdminCancellations());
    } catch {
      setItems([]);
      setFailed(true);
    }
  }, [history]);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="runtime-portal-panel" aria-labelledby="runtime-booking-management-heading">
      <h2 id="runtime-booking-management-heading">{copy.bookingManagement}</h2>
      <p role="note">{copy.bookingManagementIntro}</p>
      {items === null ? <p role="status">{locale === "vi" ? "Đang tải…" : "Loading…"}</p> : null}
      {failed ? (
        <div role="alert">
          <p>{copy.unavailable}</p>
          <button type="button" onClick={() => void load()}>{locale === "vi" ? "Thử lại" : "Try again"}</button>
        </div>
      ) : null}
      {!failed && items?.length === 0 ? <p>{copy.emptyHistory}</p> : null}
      {!failed && items && items.length > 0 ? (
        <div>
          {items.map((item) => (
            <article key={item.id} aria-labelledby={`runtime-cancellation-history-${item.id}`}>
              <h3 id={`runtime-cancellation-history-${item.id}`}>{item.bookingId}</h3>
              <dl>
                <div><dt>{copy.bookingId}</dt><dd>{item.bookingId}</dd></div>
                <div><dt>{copy.customerId}</dt><dd>{item.customerUserId}</dd></div>
                <div><dt>{copy.source}</dt><dd>{item.sourceKind === "departure" ? copy.sourceDeparture : copy.sourceQuote}</dd></div>
                <div><dt>{copy.statusPrefix}</dt><dd>{copy.cancelledStatus}</dd></div>
                <div><dt>{copy.cancelledAt}</dt><dd>{formatDate(item.cancelledAt, locale)}</dd></div>
                <div><dt>{copy.reason}</dt><dd>{cancellationReasonLabel(item.reasonCode, locale)}</dd></div>
                {item.otherReason ? <div><dt>{copy.otherLabel}</dt><dd>{item.otherReason}</dd></div> : null}
              </dl>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
