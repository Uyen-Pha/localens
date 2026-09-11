"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadPortalSurfaceComposition } from "@/components/portals/portal-session";
import type { ReviewedBookings, ReviewedBooking } from "@/lib/infrastructure/supabase/reviewed-bookings";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import type { Locale } from "@/lib/i18n/config";
import { reviewedDataset } from "./reviewed-tours";
import { reviewedDepartures } from "./reviewed-departures";
import styles from "./payment-preview.module.css";
import {paymentLabels,paymentStatus} from "../customer/reviewed-payment-status";

export function PaymentPreview({ locale }: { locale: Locale }) {
  const vi = locale === "vi";
  const router = useRouter();
  const [service,setService] = useState<ReviewedBookings|null>(null);
  const [booking,setBooking] = useState<ReviewedBooking|null>(null);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [reload,setReload] = useState(0);
  const [selection, setSelection] = useState<{ departure: string; size: number } | null>(null);
  const [paid, setPaid] = useState(false);
  const [expiresAt, setExpiresAt] = useState(0);
  const [remaining, setRemaining] = useState(900);
  useEffect(() => {
    let alive=true;
    const query = new URLSearchParams(window.location.search);
    const id=query.get('booking');
    if(!id) {setSelection({departure:query.get('departure')??'',size:Number(query.get('partySize'))});setError(vi?'Vui lòng chọn Đặt tour để tạo đơn trước khi thanh toán.':'Please book your tour before paying.');return;}
    void (async()=>{
      const shell=await loadPortalSurfaceComposition();await shell.initialized;
      const identity=await shell.session.getSession();
      if(!identity) {router.replace('/'+locale+'/sign-in/');return;}
      if(shell.mode!=='supabase'||!shell.reviewedBookings) throw new Error('unavailable');
      const row=await shell.reviewedBookings.get(id);
      if(!alive)return;
      setService(shell.reviewedBookings);setBooking(row);setError('');
      setSelection({departure:row.departure_id,size:row.party_size});
      setPaid((row.status==='confirmed'||row.status==='completed')&&!!row.paid_at);
      setExpiresAt(Date.parse(row.expires_at));
      setRemaining(row.status==='expired'||row.status==='cancelled'?0:Math.max(0,Math.ceil((Date.parse(row.expires_at)-Date.now())/1000)));
    })().catch(()=>{if(alive)setError(vi?'Không thể tải đơn đặt tour. Vui lòng thử lại.':'Unable to load your booking. Please try again.');});
    return ()=>{alive=false;};
  }, [locale,vi,router,reload]);
  async function pay() {
    if(!service||!booking||busy)return;
    setBusy(true);setError('');
    try {
      const row=await service.pay(booking.id);
      setBooking(row);setPaid((row.status==='confirmed'||row.status==='completed')&&!!row.paid_at);
      if(row.status==='expired'||row.status==='cancelled')setRemaining(0);
      sessionStorage.removeItem('reviewed-attempt:'+row.departure_id+':'+row.party_size);
      window.dispatchEvent(new Event('localens-bookings-changed'));
    } catch {setError(vi?'Chưa thể xác nhận thanh toán. Vui lòng thử lại; kết quả chỉ được hiển thị sau khi lưu thành công.':'Unable to confirm payment. Please retry; success is shown only after it is saved.');}
    finally {setBusy(false);}
  }
  useEffect(() => {
    if (!expiresAt || paid) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    const timer = window.setInterval(tick, 1000);
    window.addEventListener("focus", tick);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", tick); };
  }, [expiresAt, paid]);
  useEffect(()=>{if(booking?.status!=='cancelled')return;const timer=setInterval(()=>setReload(n=>n+1),15000);return ()=>clearInterval(timer);},[booking?.status]);
  const expired = remaining === 0;
  const match = reviewedDataset.tours.flatMap((tour, index) => tour.departures.flatMap(d => reviewedDepartures(d, index)).map(departure => ({ tour, departure }))).find(item => item.departure.id === selection?.departure);
  if (!selection) return <main className={styles.page} role={error ? "alert" : "status"}>{error || (vi ? "Đang tải…" : "Loading…")}{error && <button onClick={()=>setReload(n=>n+1)}>{vi?"Thử lại":"Retry"}</button>}</main>;
  if (!match || !Number.isInteger(selection.size) || selection.size < 1 || selection.size > match.departure.capacity) return <main className={styles.page}><h1>{vi ? "Thông tin chuyến đi không hợp lệ" : "Invalid trip details"}</h1><Link href={`/${locale}/tours/`}>{vi ? "Chọn lại tour" : "Choose a tour"}</Link></main>;
  const { tour, departure } = match;
  const money = (value: number) => new Intl.NumberFormat(vi ? "vi-VN" : "en-US", { style: "currency", currency: vi ? "VND" : "USD" }).format(vi ? value : value / 26000);
  const back = `/${locale}/booking/?departure=${encodeURIComponent(departure.id)}&partySize=${selection.size}`;
  if(booking?.status==='cancelled')return <main className={styles.page}><h1>{vi?'Đơn đã hủy':'Booking cancelled'}</h1><p role="status">{paymentLabels[locale][paymentStatus(booking)]}</p><p>{vi?'Hoàn tiền mô phỏng, không phát sinh giao dịch tiền thật.':'Simulated refund; no real money is transferred.'}</p><Link href={`/${locale}/bookings/`}>{vi?'Xem đơn đặt tour':'View bookings'}</Link></main>;
  return <main className={styles.page}>
    <Link href={back}>← {vi ? "Quay lại tour" : "Back to tour"}</Link>
    <p className={styles.eyebrow}>LOCALLENS · {vi ? "THANH TOÁN MÔ PHỎNG" : "SIMULATED CHECKOUT"}</p>
    <h1>{paid ? (vi ? "Thanh toán mô phỏng thành công" : "Simulated payment successful") : (vi ? "Hoàn tất chuyến đi của bạn" : "Complete your trip")}</h1>
    <p role="status">{vi ? "Trạng thái phiên mô phỏng: " : "Simulated checkout status: "}<strong>{paid ? (vi ? "Đã thanh toán" : "Paid") : expired ? (vi ? "Đã hết hạn giữ chỗ" : "Hold expired") : (vi ? "Chờ thanh toán" : "Pending payment")}</strong></p>
    {error && <div role="alert"><p>{error}</p>{!booking && <button onClick={()=>setReload(n=>n+1)}>{vi?"Thử lại":"Retry"}</button>}</div>}
    <div className={styles.grid}>
      <section className={styles.card} aria-labelledby="payment-heading">
        {!paid && <div className={styles.note}>
          <strong>{vi ? "Giữ chỗ trong 15 phút. Kiểm tra thông tin chuyến đi trước khi xác nhận." : "Your spot is held for 15 minutes. Review your trip details before confirming."}</strong>
          <div role="timer" aria-label={vi ? "Thời gian giữ chỗ còn lại" : "Hold time remaining"} style={{ fontSize: 36, fontWeight: 700, fontVariantNumeric: "tabular-nums", marginTop: 12 }}>{String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}</div>
          {expired && <p role="alert">{vi ? "Đã hết thời gian giữ chỗ. Phiên đặt tour mô phỏng đã hủy. Vui lòng quay lại tour để đặt lại." : "Your hold has expired. This simulated checkout is cancelled. Return to the tour to book again."}<br /><Link href={back}>{vi ? "Chọn lại chuyến đi" : "Select your trip again"}</Link></p>}
        </div>}
        {paid ? <><CheckCircle2 size={48} /><h2 id="payment-heading">{vi ? "Bạn đã hoàn tất trải nghiệm thanh toán" : "Your checkout experience is complete"}</h2><p role="status">{vi ? "Không có khoản tiền nào bị trừ. Kết quả này không phải vé hoặc xác nhận đặt tour thực tế." : "No money was charged. This result is not a ticket or a real booking confirmation."}</p><Link className={styles.button} href={`/${locale}/bookings/`}>{vi ? "Xem đơn đặt tour" : "View bookings"}</Link></> : <>
          <ShieldCheck size={36} /><h2 id="payment-heading">{vi ? "Thanh toán mô phỏng" : "Simulated payment"}</h2>
          <p>{vi ? "Kiểm tra thông tin chuyến đi bên cạnh, sau đó chọn thanh toán để trải nghiệm bước xác nhận." : "Review your trip details, then select pay to try the confirmation step."}</p>
          <div className={styles.note}>{vi ? "Không thu tiền thật. Không cần nhập thông tin thẻ hoặc tài khoản ngân hàng. Đơn mô phỏng được lưu trong mục Đơn đặt tour của bạn." : "No real charge. No card or bank details required. Your simulated booking is saved in your Bookings."}</div>
          <button className={styles.button} disabled={expired || !booking || busy || !expiresAt} onClick={() => void pay()}>{busy ? (vi?"Đang xử lý…":"Processing…") : (vi ? "Thanh toán mô phỏng" : "Simulate payment")} · {money(booking?.total_vnd ?? tour.priceVndPerPerson * selection.size)}</button>
        </>}
      </section>
      <aside className={styles.card}><h2>{vi ? "Thông tin chuyến đi" : "Your trip"}</h2><h3>{tour.translations[locale].title}</h3>
        <dl><dt>{vi ? "Khởi hành" : "Departure"}</dt><dd>{new Intl.DateTimeFormat(vi ? "vi-VN" : "en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(departure.startAt))} (GMT+7)</dd><dt>{vi ? "Số khách" : "Travelers"}</dt><dd>{selection.size}</dd><dt>{vi ? "Giá mỗi khách" : "Price per traveler"}</dt><dd>{money(booking ? booking.total_vnd / booking.party_size : tour.priceVndPerPerson)}</dd></dl>
        <div className={styles.total}><span>{vi ? "Tổng tiền mô phỏng" : "Simulated total"}</span><strong>{money(booking?.total_vnd ?? tour.priceVndPerPerson * selection.size)}</strong></div>
        {!vi && <p>USD conversion: $1 = 26,000 VND.</p>}
      </aside>
    </div>
  </main>;
}


