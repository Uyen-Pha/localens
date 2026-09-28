"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { readPersonalizationState } from "@/lib/application/planner/personalization-session";
import type { ResearchResponse } from "@/lib/application/planner/research-planner";
import type { ResearchPlannerPort } from "@/lib/infrastructure/supabase/research-planner-adapter";
import type { ResearchRequestPort } from "@/lib/infrastructure/supabase/research-request-adapter";
import { ResearchGuidedAdjustments } from "./research-guided-adjustments";
import { ResearchItineraryTimeline } from "./research-itinerary-timeline";
import styles from "./research-planner-flow.module.css";
import {hasPersonalizedLeadTime, personalizedLeadTimeMessage} from '@/lib/application/planner/departure-lead-time';

type ActorRole = "customer" | "guide" | "admin" | "signed-out";

export function ResearchPlannerFlow({
  locale,
  planner,
  requests,
  actorRole = "signed-out",
  actorId,
}: {
  locale: "vi" | "en";
  planner: ResearchPlannerPort;
  requests?: ResearchRequestPort;
  actorRole?: ActorRole;
  actorId?: string;
}) {
  const vi = locale === "vi";
  const [result, setResult] = useState<ResearchResponse | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [submittedNow, setSubmittedNow] = useState(false);
  const [sendError, setSendError] = useState("");
  const [editing, setEditing] = useState(false);
  const [changeNotice, setChangeNotice] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const epoch = useRef(0);
  const originHandoff = useRef("");
  const sendingLock = useRef(false);
  const pending = useRef<{ key: string; planner: ResearchPlannerPort; promise: Promise<ResearchResponse> } | null>(null);


  function rememberRevision(value: ResearchResponse, handoffId: string) {
    if (value.status !== "ready" || !value.revisionId || typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(`localens.research.revision.${actorId}.${handoffId}`, value.revisionId);
    } catch {
      // The server revision remains authoritative when browser storage is unavailable.
    }
  }

  useEffect(() => {
    let disposed = false;
    epoch.current += 1;
    setResult(null);
    setError("");
    setConfirmed(false);
    setSent(false);
    setSubmittedNow(false);
    setSendError("");
    setEditing(false);
    setNeedsRefresh(false);

    if (actorRole === "signed-out" || !actorId) {
      setError("AUTH_REQUIRED");
      return () => { disposed = true; };
    }
    if (actorRole !== "customer") {
      setError("CUSTOMER_REQUIRED");
      return () => { disposed = true; };
    }

    const saved = readPersonalizationState();
    if (saved.status !== "ok") {
      setError("FORM_REQUIRED");
      return () => { disposed = true; };
    }

    let cachedRevision: string | undefined;
    originHandoff.current = saved.handoffId;
    try {
      cachedRevision = window.sessionStorage.getItem(`localens.research.revision.${actorId}.${saved.handoffId}`) ?? undefined;
    } catch {
      cachedRevision = undefined;
    }
    const key = `${actorId}:${saved.handoffId}:${retry}`;
    if (!pending.current || pending.current.key !== key || pending.current.planner !== planner) {
      if (!(cachedRevision && planner.resume) && !hasPersonalizedLeadTime(saved.request.startAt)) {
        setError("DEPARTURE_TOO_SOON");
        return () => { disposed = true; };
      }
      pending.current = {key, planner, promise: cachedRevision && planner.resume ? planner.resume(cachedRevision) : planner(saved.request)};
    }

    pending.current.promise
      .then((value) => {
        if (disposed) return;
        rememberRevision(value, saved.handoffId);
        setResult(value);
        if (value.status === "ready" && value.submittedRequestId) setSent(true);
      })
      .catch((reason: unknown) => {
        if (!disposed) setError(reason instanceof Error ? reason.message : "SERVICE_UNAVAILABLE");
      });
    return () => { disposed = true; epoch.current += 1; };
  }, [actorRole, actorId, planner, retry]);

  const renderEpoch = epoch.current;
  const renderHandoff = originHandoff.current;
  function isCurrent() {
    const saved = readPersonalizationState();
    return epoch.current === renderEpoch && saved.status === 'ok' && saved.handoffId === renderHandoff;
  }

  function acceptRevision(next: ResearchResponse) {
    if (!isCurrent() || next.status !== 'ready' || !next.revisionId) return;
    rememberRevision(next, renderHandoff);
    setResult(next); setEditing(false); setConfirmed(false); setNeedsRefresh(false); setSendError('');
    setSent(Boolean(next.submittedRequestId)); setSubmittedNow(false);
    setChangeNotice(vi ? 'Đã tải phiên bản lịch trình mới nhất. Vui lòng kiểm tra và xác nhận lại trước khi gửi.' : 'Latest itinerary loaded. Review and confirm it again before sending.');
  }

  async function reconcile() {
    if (refreshing || !result || result.status !== 'ready' || !result.revisionId) return;
    setEditing(false); setConfirmed(false); setNeedsRefresh(true); setRefreshing(true);
    try {
      if (!planner.resume) throw Error('RESUME_UNAVAILABLE');
      const next = await planner.resume(result.revisionId);
      if (next.status !== 'ready' || !next.revisionId) throw Error('REVISION_UNAVAILABLE');
      acceptRevision(next);
    } catch {
      if (isCurrent()) setSendError('REVISION_REFRESH_FAILED');
    } finally {
      if (isCurrent()) setRefreshing(false);
    }
  }

  async function send() {
    if (!isCurrent() || !requests || !result || result.status !== "ready" || !result.revisionId || !confirmed || sendingLock.current || editing || sent || needsRefresh || refreshing) return;
    const saved = readPersonalizationState();
    const startAt = result.request?.startAt ?? (saved.status === 'ok' ? saved.request.startAt : '');
    if (!hasPersonalizedLeadTime(startAt)) {
      setSendError('DEPARTURE_TOO_SOON');
      return;
    }
    sendingLock.current = true;
    setSending(true);
    setSendError("");
    try {
      await requests.submit(result.revisionId);
      if (!isCurrent()) return;
      setSent(true);
      setSubmittedNow(true);
      setSendError("");
    } catch (reason: unknown) {
      if (!isCurrent()) return;
      const code = reason instanceof Error ? reason.message : 'REQUEST_SUBMIT_FAILED';
      setSendError(code);
      if (code === 'REVISION_CONFLICT') await reconcile();
    } finally {
      sendingLock.current = false;
      setSending(false);
    }
  }

  const money = (value: number) => `${new Intl.NumberFormat(vi ? "vi-VN" : "en-US").format(value)} VND`;
  const reasonText: Record<string, string> = vi
    ? {
      budget: "Ngân sách chưa đủ cho các điểm dừng, hướng dẫn viên và chặng đi về. Hãy tăng ngân sách hoặc chọn ít khu vực hơn.",
      duration: "Thời lượng chưa đủ, tính cả thời gian di chuyển và chặng về. Hãy tăng thời lượng hoặc chọn khu vực gần hơn.",
      capacity: "Số người vượt giới hạn nhóm của các địa điểm. Hãy giảm số khách hoặc chọn khu vực khác.",
      closed: "Các điểm phù hợp không còn đủ thời gian tham quan trong giờ hoạt động. Hãy đổi ngày hoặc bắt đầu sớm hơn.",
      dietary: "Chưa xác nhận được địa điểm ăn uống đáp ứng yêu cầu. Hãy điều chỉnh yêu cầu ăn uống hoặc trao đổi thêm với LocalLens.",
      area: "Chưa có địa điểm đủ điều kiện trong khu vực đã chọn. Hãy chọn khu vực khác.",
    }
    : {
      budget: "Increase your budget or choose fewer areas; travel and the return trip are included.",
      duration: "Allow more time or choose a closer area, including the return trip.",
      capacity: "Reduce the group size or choose another area.",
      closed: "Try another date or an earlier start; visits must fit opening hours.",
      dietary: "Dietary support is not confirmed. Adjust your request or contact LocalLens.",
      area: "Choose another area with eligible places.",
    };

  if (!result && !error) return <section className={styles.state} role="status" aria-live="polite" aria-busy="true"><h2>{vi ? "Đang tạo lịch trình phù hợp với bạn…" : "Preparing your itinerary…"}</h2><p>{vi ? "Đang lọc địa điểm, sắp xếp thứ tự và kiểm tra thời gian, chi phí trước khi trả kết quả." : "Filtering places, arranging stops and checking time and costs."}</p></section>;
  if (error || !result || result.status !== "ready") {
    return (
      <section className={styles.state} role="alert">
        <h2>{vi ? "Chưa thể tạo lịch trình" : "Unable to create an itinerary"}</h2>
        {error === "AUTH_REQUIRED" ? <>
          <p>{vi ? "Vui lòng đăng nhập để tạo tour cá nhân hóa. Thông tin đã điền vẫn được giữ lại." : "Please sign in. Your preferences have been kept."}</p>
          <Link className="button" href={`/${locale}/sign-in/?returnTo=/${locale}/planner/`}>{vi ? "Đăng nhập" : "Sign in"}</Link>
        </> : error === "CUSTOMER_REQUIRED" ? <p>{vi ? "Chỉ tài khoản khách hàng mới có thể gửi yêu cầu tour cá nhân hóa." : "Only customer accounts can submit personalized tour requests."}</p> : <>
          {error === "DEPARTURE_TOO_SOON" ? <p>{personalizedLeadTimeMessage(locale)}</p> : result?.status === "no_match" ? <ul>{result.reasons.map((reason) => <li key={reason}>{reasonText[reason] ?? reasonText.area}</li>)}</ul> : <p>{vi ? "Dịch vụ tạo lịch trình chưa sẵn sàng hoặc yêu cầu cần kiểm tra lại. Bạn có thể thử lại hoặc chỉnh thông tin phía trên." : "The planner is unavailable or your request needs checking. Retry or edit your preferences above."}</p>}
          <button type="button" className="button button--secondary" onClick={() => setRetry((value) => value + 1)}>{vi ? "Thử lại" : "Try again"}</button>
        </>}
      </section>
    );
  }

  const preferenceNames: Record<string, string> = vi
    ? { street_food: "ẩm thực", history: "lịch sử và văn hóa", traditional_craft: "làng nghề", traditional_market: "chợ và đời sống địa phương" }
    : { street_food: "food", history: "history and culture", traditional_craft: "crafts", traditional_market: "markets and local life" };
  const plan = result.plan;

  return (
    <section className={styles.layout} aria-label={vi ? "Lịch trình gợi ý" : "Suggested itinerary"}>
      <div>
        <p className={styles.eyebrow}>{vi ? "Lịch trình đã được kiểm tra" : "Validated itinerary"}</p>
        <h2>{vi ? "Tour cá nhân hóa dành cho bạn" : "Your personalized itinerary"}</h2>
        <p>{vi ? "Khởi hành và trở về điểm hẹn dự kiến tại khu Nguyễn Huệ." : "Depart from and return to the proposed meeting point near Nguyen Hue."}</p>
        {result.revisionNumber && <p role="status">{vi ? `Phiên bản ${result.revisionNumber}` : `Version ${result.revisionNumber}`}</p>}
        {changeNotice && <p role="status">{changeNotice}</p>}
        {result.preferenceNotices?.map((notice) => <p key={notice.preference} role="note">{vi ? `Các điểm ${preferenceNames[notice.preference]} bạn ưu tiên ${notice.reason === "closed" ? "không còn đủ thời gian tham quan trong giờ hoạt động" : "chưa phù hợp với các điều kiện của chuyến đi"}. Chúng tôi đã chọn trải nghiệm khác trong khu vực bạn chọn.` : `Your preferred ${preferenceNames[notice.preference]} stops do not fit this trip’s constraints. We selected other experiences within your chosen area.`}</p>)}
        {result.revisionId && (planner.suggest || planner.refine || (planner.edit && planner.options)) && !sent && !sending && !editing && !needsRefresh && !refreshing && <button className="button button--secondary" type="button" onClick={() => { setConfirmed(false); setEditing(true); }}>{vi ? "Điều chỉnh lịch trình" : "Adjust itinerary"}</button>}
        {editing ? <ResearchGuidedAdjustments locale={locale} result={result} planner={planner} onCancel={() => void reconcile()} onSaved={acceptRevision} /> : <ResearchItineraryTimeline locale={locale} plan={plan} />}
      </div>
      <aside className={styles.summary}>
        <h3>{vi ? "Tổng kết chuyến đi" : "Trip summary"}</h3>
        <dl>
          <dt>{vi ? "Số điểm dừng" : "Stops"}</dt><dd>{plan.stops.length}</dd>
          <dt>{vi ? "Tổng thời gian" : "Total time"}</dt><dd>{plan.durationMinutes} {vi ? "phút" : "min"}</dd>
          <dt>{vi ? "Tham quan và ăn uống" : "Visits and food"}</dt><dd>{money(plan.visitAndFoodVnd)}</dd>
          <dt>{vi ? "Di chuyển cả nhóm" : "Group transport"}</dt><dd>{money(plan.transportVnd)}</dd>
          <dt>{vi ? "Hướng dẫn viên" : "Guide"}</dt><dd>{money(plan.guideVnd)}</dd>
          <dt>{vi ? "Tổng chi phí dự kiến" : "Estimated total"}</dt><dd><strong>{money(plan.totalVnd)}</strong></dd>
        </dl>
        {result.request?.budget && <p className={styles.budget}>{vi ? "Ngân sách tổng" : "Group budget"}: {new Intl.NumberFormat(vi ? "vi-VN" : "en-US").format(result.request.budget.amountMinor / (result.request.budget.currency === "USD" ? 100 : 1))} {result.request.budget.currency}</p>}
        <p>{vi ? "Lịch trình mẫu sử dụng ước tính nội bộ; chi phí và khả năng tiếp khách chưa phải xác nhận của cơ sở." : "Sample itinerary using internal estimates; costs and availability are not confirmed by operators."}</p>
        {result.exchangeRateVndPerUsd && <p>{vi ? "Tỷ giá mô phỏng" : "Simulation exchange rate"}: 1 USD = {money(result.exchangeRateVndPerUsd)}</p>}
        {requests && !sent && <>
          {needsRefresh && <p role="alert">{vi ? 'Cần tải lại phiên bản mới nhất trước khi gửi.' : 'Reload the latest version before submitting.'}</p>}
          {needsRefresh && <button type="button" disabled={refreshing} onClick={() => void reconcile()}>{vi ? 'Tải lại phiên bản mới nhất' : 'Reload latest version'}</button>}
          {refreshing && <p role="status">{vi ? 'Đang đối chiếu phiên bản đã lưu…' : 'Checking the saved revision…'}</p>}
          <label><input type="checkbox" disabled={sending || editing || needsRefresh || refreshing} checked={confirmed} onChange={(event) => { setConfirmed(event.target.checked); setSendError(""); }} />{vi ? "Tôi đồng ý với lịch trình này." : "I agree with this itinerary."}</label>
          <button className="button" type="button" disabled={!confirmed || !result.revisionId || sending || editing || needsRefresh || refreshing} onClick={() => void send()}>{sending ? (vi ? "Đang gửi…" : "Sending…") : (vi ? "Xác nhận & Gửi yêu cầu" : "Confirm & send request")}</button>
          {sendError === "AUTH_REQUIRED" && <p role="alert">{vi ? "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại." : "Your session has expired. Please sign in again."}</p>}
          {sendError === 'DEPARTURE_TOO_SOON' && <p role="alert">{personalizedLeadTimeMessage(locale)}</p>}
          {sendError && sendError !== "AUTH_REQUIRED" && sendError !== 'DEPARTURE_TOO_SOON' && <p role="alert">{vi ? "Gửi yêu cầu thất bại. Vui lòng thử lại sau." : "The request could not be sent. Please try again later."}</p>}
          <p>{vi ? "Gửi yêu cầu chưa tạo đơn đặt tour và chưa thu tiền." : "Sending a request does not create a booking or charge you."}</p>
        </>}
        {sent && <div role="status"><p><strong>{vi ? "Yêu cầu đã được gửi" : "Request sent"}</strong></p>{submittedNow ? <p>{vi ? "Trạng thái: Chờ duyệt" : "Status: Pending review"}</p> : <p>{vi ? "Xem trạng thái mới nhất trong danh sách yêu cầu." : "Check the request list for the latest status."}</p>}<Link className="button button--secondary" href={`/${locale}/bookings/#personalized-requests`}>{vi ? "Xem yêu cầu của tôi" : "View my requests"}</Link></div>}
      </aside>
    </section>
  );
}
