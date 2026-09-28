"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type {
  ResearchBooking,
  ResearchDemoPort,
  ResearchDemoQuote,
  ResearchDemoRequest,
} from "@/lib/infrastructure/supabase/research-demo-adapter";
import type { CheckoutDetails } from "@/lib/infrastructure/supabase/reviewed-bookings";
import { CheckoutFields } from "../dev/checkout-fields";
import s from "../admin/admin-quotes.module.css";
import local from "./research-demo-requests.module.css";

type CheckoutStage = "quote" | "confirm" | "pay";

type ResearchQuoteCheckoutProps = {
  port: ResearchDemoPort;
  request: ResearchDemoRequest;
  quote: ResearchDemoQuote;
  vi: boolean;
  onChanged?: () => void;
  initialStage?: CheckoutStage;
  onExit?: () => void;
};

export function ResearchQuoteCheckout({
  port,
  request,
  quote,
  vi,
  onChanged,
  initialStage = "quote",
  onExit,
}: ResearchQuoteCheckoutProps) {
  const [booking, setBooking] = useState<ResearchBooking | null>(null);
  const [stage, setStage] = useState<CheckoutStage>(initialStage);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const lock = useRef(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    port.booking?.(quote.id, false)
      .then((nextBooking) => {
        if (!alive) return;
        setBooking(nextBooking);
        if (initialStage === "pay" && nextBooking === null) setStage("confirm");
      })
      .catch(() => {
        if (alive) setError(vi ? "Không thể tải trạng thái đặt tour. Vui lòng thử lại." : "Unable to load booking status. Please retry.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [initialStage, port, quote.id, vi]);

  const expired = Date.parse(quote.expiresAt) <= now || booking?.status === "expired";
  const past = Date.parse(request.request.startAt) <= now;
  const paymentFailed = booking?.payment_status === "failed";
  const unavailable = expired || past || request.status !== "approved";
  const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: quote.currency }).format(quote.amount);
  const paymentPath = `/${vi ? "vi" : "en"}/personalized-payment/?request=${encodeURIComponent(request.id)}&quote=${encodeURIComponent(quote.id)}`;
  const exit = () => {
    if (onExit) onExit();
    else setStage("quote");
  };

  async function create() {
    if (lock.current || unavailable || !port.booking) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const nextBooking = await port.booking(quote.id, true);
      if (!nextBooking) throw Error();
      setBooking(nextBooking);
      setStage("quote");
      onChanged?.();
    } catch {
      setError(vi ? "Không thể tạo đơn. Báo giá hoặc lịch trình có thể đã thay đổi. Vui lòng làm mới thông tin." : "Unable to create booking. The quote or itinerary may have changed. Please refresh.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function pay(details: CheckoutDetails) {
    if (lock.current || unavailable || !port.checkout) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const nextBooking = await port.checkout(quote.id, details);
      setBooking(nextBooking);
      onChanged?.();
      if (nextBooking.payment_status === "failed") {
        setError(vi ? "Thanh toán mô phỏng thất bại. Bạn có thể thử lại khi đơn còn hiệu lực." : "Simulated payment declined. Retry while the booking is valid.");
      }
    } catch {
      setError(vi ? "Chưa thể ghi nhận thanh toán. Vui lòng làm mới để kiểm tra đơn trước khi thử lại." : "Unable to record payment. Refresh to check the booking before retrying.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  if (!port.booking || !port.checkout) return null;
  if (loading) return <p role="status">{vi ? "Đang kiểm tra đơn đặt tour…" : "Checking booking…"}</p>;
  if (booking?.status === "confirmed") {
    return <div role="status"><h4>{vi ? "Đã xác nhận đơn đặt tour" : "Booking confirmed"}</h4><p>{vi ? "Đã thanh toán mô phỏng · Không thu tiền thật" : "Simulated payment recorded · No real charge"}</p><p>{vi ? "Mã đơn" : "Booking ID"}: {booking.id}</p></div>;
  }

  return <div>
    <p className={expired ? s.error : undefined}><strong>{vi ? "Hạn hoàn tất thanh toán" : "Payment deadline"}:</strong> {new Date(booking?.expires_at ?? quote.expiresAt).toLocaleString(vi ? "vi-VN" : "en-GB", { timeZone: "Asia/Ho_Chi_Minh" })}</p>
    <p>{vi ? "Thanh toán cá nhân hóa theo thời hạn báo giá; không áp dụng giữ chỗ 15 phút của tour cố định." : "Personalized payment follows the quote deadline; the fixed-tour 15-minute hold does not apply."}</p>
    {error && <p role="alert" className={s.error}>{error}</p>}
    {booking && <p>{vi ? "Mã đơn" : "Booking ID"}: {booking.id} · {expired ? (vi ? "Đã hết hạn" : "Expired") : paymentFailed ? (vi ? "Thanh toán thất bại · Có thể thử lại" : "Payment failed · You can retry") : (vi ? "Chờ thanh toán" : "Awaiting payment")}</p>}
    {paymentFailed && !expired && <p role="status" className={s.error}>{vi ? "Lần thanh toán trước chưa thành công. Kiểm tra lại thông tin rồi chọn “Thanh toán” để thử lại." : "The previous payment did not complete. Review your details and choose “Pay now” to retry."}</p>}
    {unavailable ? <p role="status" className={s.error}>{past ? (vi ? "Ngày khởi hành đã qua. Vui lòng liên hệ LocalLens để điều chỉnh lịch trình và nhận báo giá mới." : "The departure date has passed. Contact LocalLens to update the itinerary and obtain a new quote.") : (vi ? "Yêu cầu hoặc báo giá không còn đủ điều kiện đặt tour." : "This request or quote is no longer eligible for booking.")}</p> : stage === "quote" ? (booking ? <Link className={local.payLink} href={paymentPath}>{vi ? "Thanh toán" : "Pay now"}</Link> : <button disabled={busy} onClick={() => setStage("confirm")}>{vi ? "Tiếp tục đặt tour" : "Continue booking"}</button>) : stage === "confirm" ? <section><h4>{vi ? "Xác nhận đặt tour cá nhân hóa" : "Confirm personalized booking"}</h4><p>{quote.title} · {request.request.partySize} {vi ? "khách" : "travelers"}</p><p>{new Date(request.request.startAt).toLocaleString(vi ? "vi-VN" : "en-US", { timeZone: "Asia/Ho_Chi_Minh" })}</p><p><strong>{money}</strong></p><p>{quote.conditions}</p><p>{vi ? "Xác nhận sẽ tạo đơn chờ thanh toán. Bạn chưa bị trừ tiền ở bước này." : "Confirming creates a booking awaiting payment. No payment is taken at this step."}</p><button disabled={busy} onClick={() => void create()}>{busy ? (vi ? "Đang tạo đơn…" : "Creating…") : (vi ? "Xác nhận đặt tour" : "Confirm booking")}</button><button className={s.secondary} disabled={busy} onClick={exit}>{vi ? "Quay lại" : "Back"}</button></section> : <CheckoutFields vi={vi} size={booking?.party_size ?? request.request.partySize} contact={{ name: "", email: "", phone: "" }} disabled={unavailable} busy={busy} error={error} onPay={(details) => void pay(details)} onBack={exit} />}
  </div>;
}
