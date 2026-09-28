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
import tableStyles from './runtime-booking-table.module.css';

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
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState('');
  const [kind,setKind]=useState('');
  const [selected,setSelected]=useState<string|null>(null);
  const filtered=(items??[]).filter(item=>(!status||item.bookingStatus===status)&&(!kind||item.sourceKind===kind)&&[item.bookingId,item.customerUserId,item.titleVi,item.titleEn].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
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
        <><div className={tableStyles.metrics}>{(['pending_payment','confirmed','completed','cancelled','expired'] as const).map(value=><button key={value} aria-pressed={status===value} onClick={()=>setStatus(status===value?'':value)}>{fixedTourCopy.bookingStatusLabels[value]}<strong>{items.filter(item=>item.bookingStatus===value).length}</strong></button>)}</div>
        <div className={tableStyles.layout}><div><div className={tableStyles.filters}>
          <label>Từ khóa<input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Mã đơn, mã khách, tên tour…"/></label>
          <label>Loại tour<select value={kind} onChange={event=>setKind(event.target.value)}><option value="">Tất cả loại tour</option><option value="departure">Tour cố định</option><option value="quote">Tour cá nhân hóa</option></select></label>
          <label>Trạng thái đơn<select value={status} onChange={event=>setStatus(event.target.value)}><option value="">Tất cả trạng thái</option>{Object.entries(fixedTourCopy.bookingStatusLabels).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label>
          <button onClick={()=>{setQuery('');setStatus('');setKind('');}}>Đặt lại</button>
        </div><div className={tableStyles.scroll}><table><caption>Danh sách đơn đặt tour ({filtered.length})</caption><thead><tr>{['Mã đơn','Khách đặt (mã khách)','Loại tour','Lịch trình','Số khách','Tổng tiền','Trạng thái đơn','Thanh toán','Thời gian tạo','Thao tác'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{filtered.map(item=><tr key={item.bookingId}><td>{item.bookingId}</td><td>{item.customerUserId}</td><td>{item.sourceKind==='departure'?'Tour cố định':'Tour cá nhân hóa'}</td><td>{locale==='vi'?item.titleVi:item.titleEn}</td><td>—</td><td>—</td><td><span className={bookingStatusClass(item.bookingStatus)}>{fixedTourCopy.bookingStatusLabels[item.bookingStatus]}</span></td><td>Chưa có dữ liệu</td><td>{formatDate(item.createdAt,locale)}</td><td><button aria-label={`Xem chi tiết ${item.bookingId}`} onClick={()=>setSelected(item.bookingId)}>Xem chi tiết</button></td></tr>)}</tbody></table>{!filtered.length&&<p>Không có đơn phù hợp.</p>}</div></div>
        <aside className={tableStyles.attention}><h3>Đơn cần chú ý</h3>{items.filter(item=>item.bookingStatus==='pending_payment'||item.bookingStatus==='expired').slice(0,4).map(item=><button key={item.bookingId} onClick={()=>setSelected(item.bookingId)}><strong>{item.bookingId}</strong><span>{fixedTourCopy.bookingStatusLabels[item.bookingStatus]}</span><span>{item.titleVi}</span></button>)}</aside></div>
        <section aria-label="Chi tiết đơn đang chọn" className={styles.list}>
          {!selected&&<p>Chọn “Xem chi tiết” để xem thông tin đơn.</p>}
          {items.filter(item=>item.bookingId===selected).map((item) => (
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
        </section></>
      ) : null}
    </section>
  );
}
