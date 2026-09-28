"use client";

import { useEffect, useRef, useState } from "react";

import type { ResearchSavedInput, ResearchResponse, ResearchStop } from "@/lib/application/planner/research-planner";
import type { ResearchPlannerPort } from "@/lib/infrastructure/supabase/research-planner-adapter";
import styles from "./research-itinerary-editor.module.css";

type EditorOptions = {
  request: ResearchSavedInput;
  options: { id: string; name: string; durationMinutes: number }[];
  revisionNumber?: number;
};

export function ResearchItineraryEditor({
  locale,
  revisionId,
  stops,
  lockedStopIds = [],
  planner,
  onCancel,
  onSaved,
}: {
  locale: "vi" | "en";
  revisionId: string;
  stops: ResearchStop[];
  lockedStopIds?: readonly string[];
  planner: ResearchPlannerPort;
  onCancel: () => void;
  onSaved: (result: Extract<ResearchResponse, { status: "ready" }>) => void;
}) {
  const vi = locale === "vi";
  const [catalog, setCatalog] = useState<EditorOptions | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [ids, setIds] = useState(() => stops.map((stop) => stop.id));
  const [start, setStart] = useState("");
  const [duration, setDuration] = useState("");
  const [amount, setAmount] = useState("");
  const [addId, setAddId] = useState("");
  const editKey = useRef<string | null>(null);
  const lock = useRef(false);

  useEffect(() => {
    let disposed = false;
    setError("");
    if (!planner.options) return () => { disposed = true; };
    planner.options(revisionId).then((value) => {
      if (disposed) return;
      setCatalog(value);
      setStart(value.request.startAt.slice(0, 16));
      setDuration(String(value.request.durationMinutes));
      setAmount(String(value.request.budget.amountMinor / (value.request.budget.currency === "USD" ? 100 : 1)));
    }).catch(() => {
      if (!disposed) setError(vi ? "Không tải được danh sách địa điểm. Hãy thử lại." : "Unable to load places. Try again.");
    });
    return () => { disposed = true; };
  }, [planner, revisionId, retry, vi]);

  function changed() {
    editKey.current = null;
    setError("");
  }

  function reorder(index: number, offset: -1 | 1) {
    const next = [...ids];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    changed();
    setIds(next);
  }

  async function apply() {
    if (!catalog || !planner.edit || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    editKey.current ??= crypto.randomUUID();
    try {
      const value = await planner.edit({
        revisionId,
        stopIds: ids,
        startAt: `${start}:00+07:00`,
        durationMinutes: Number(duration),
        budget: {
          currency: catalog.request.budget.currency,
          amountMinor: Math.round(Number(amount) * (catalog.request.budget.currency === "USD" ? 100 : 1)),
        },
        editKey: editKey.current,
      });
      if (value.status === "ready" && value.revisionId) {
        onSaved(value);
        return;
      }
      const reasons = value.status === "ready" ? [] : value.reasons;
      const messages: Record<string, string> = vi ? {
        locked_stop: "Có điểm được giữ cố định. Hãy bỏ giữ cố định trước khi thay hoặc xóa điểm.",
        budget: "Ngân sách chưa đủ.",
        duration: "Thời lượng chưa đủ, gồm cả di chuyển và chặng về.",
        closed: "Có điểm không phù hợp giờ mở cửa.",
        capacity: "Số khách vượt sức chứa.",
        area: "Có điểm ngoài khu vực đã chọn.",
        dietary: "Chưa đáp ứng yêu cầu ăn uống.",
        invalid_places: "Danh sách địa điểm chưa hợp lệ.",
        travel: "Chưa có chặng di chuyển phù hợp.",
      } : {
        locked_stop: "A stop is fixed. Unlock it before replacing or removing it.",
        budget: "Budget is insufficient.",
        duration: "Allow more time including travel and return.",
        closed: "A visit does not fit opening hours.",
        capacity: "Group exceeds capacity.",
        area: "A place is outside your selected areas.",
        dietary: "Dietary requirements cannot be met.",
        invalid_places: "Invalid stop selection.",
        travel: "A travel leg is unavailable.",
      };
      setError((vi ? "Chưa lưu thay đổi. " : "Changes were not saved. ") + reasons.map((reason) => messages[reason] ?? (vi ? "Vui lòng kiểm tra lựa chọn và thử lại." : "Check your choices and try again.")).join(" "));
    } catch {
      setError(vi ? "Chưa lưu được thay đổi. Bản chỉnh sửa được giữ lại để bạn thử lại." : "Unable to save changes. Your draft is kept for retry.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <section className={styles.editor} aria-label={vi ? "Chỉnh sửa lịch trình" : "Edit itinerary"}>
      <h3>{vi ? "Chỉnh sửa trực tiếp lịch trình" : "Edit your itinerary"}</h3>
      <p>{vi ? "Giữ nguyên nhu cầu đã nhập. Lưu thay đổi để hệ thống kiểm tra thời gian, chi phí và tạo phiên bản mới." : "Your preferences are kept. Save changes to validate time and cost and create a new version."}</p>
      {lockedStopIds.length > 0 && <p role="note">{vi ? "Các điểm được giữ cố định không thể thay hoặc xóa ở đây. Hãy bỏ giữ cố định trước." : "Fixed stops cannot be replaced or removed here. Unlock them before editing."}</p>}
      {error && <p role="alert">{error}</p>}
      {!catalog ? <>
        <p role="status">{vi ? "Đang tải lựa chọn địa điểm…" : "Loading place options…"}</p>
        {error && <button type="button" onClick={() => setRetry((value) => value + 1)}>{vi ? "Tải lại lựa chọn" : "Reload options"}</button>}
        <button type="button" onClick={onCancel}>{vi ? "Hủy chỉnh sửa" : "Discard changes"}</button>
      </> : <form onSubmit={(event) => { event.preventDefault(); void apply(); }}>
        <fieldset disabled={busy}>
          <legend>{vi ? "Điểm dừng theo thứ tự tham quan" : "Stops in visit order"}</legend>
          <ol>
            {ids.map((id, index) => <li key={`${index}-${id}`} className={styles.stop}>
              <label>{vi ? `Điểm dừng ${index + 1}` : `Stop ${index + 1}`}
                <select value={id} disabled={lockedStopIds.includes(id)} onChange={(event) => { changed(); setIds(ids.map((old, itemIndex) => itemIndex === index ? event.target.value : old)); }}>
                  {!catalog.options.some((option) => option.id === id) && <option value={id}>{stops.find((stop) => stop.id === id)?.name ?? id}</option>}
                  {catalog.options.filter((option) => option.id === id || !ids.includes(option.id)).map((option) => <option key={option.id} value={option.id}>{option.name} · {option.durationMinutes} {vi ? "phút" : "min"}</option>)}
                </select>
              </label>
              <div className={styles.actions}>
                <button type="button" disabled={index === 0} aria-label={vi ? `Đưa điểm ${index + 1} lên` : `Move stop ${index + 1} up`} onClick={() => reorder(index, -1)}>↑</button>
                <button type="button" disabled={index === ids.length - 1} aria-label={vi ? `Đưa điểm ${index + 1} xuống` : `Move stop ${index + 1} down`} onClick={() => reorder(index, 1)}>↓</button>
                <button type="button" disabled={lockedStopIds.includes(id)} onClick={() => { changed(); setIds(ids.filter((_, itemIndex) => itemIndex !== index)); }}>{vi ? `Xóa điểm ${index + 1}` : `Remove stop ${index + 1}`}</button>
              </div>
            </li>)}
          </ol>
          <label>{vi ? "Thêm địa điểm" : "Add a place"}
            <select value={addId} onChange={(event) => setAddId(event.target.value)}><option value="">{vi ? "Chọn địa điểm" : "Choose a place"}</option>{catalog.options.filter((option) => !ids.includes(option.id)).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
          </label>
          <button type="button" disabled={!addId || ids.includes(addId) || ids.length >= 24} onClick={() => { changed(); setIds([...ids, addId]); setAddId(""); }}>{vi ? "Thêm điểm dừng" : "Add stop"}</button>
          <div className={styles.fields}>
            <label>{vi ? "Ngày giờ bắt đầu (UTC+07:00)" : "Start date and time (UTC+07:00)"}<input type="datetime-local" required step="60" value={start} onChange={(event) => { changed(); setStart(event.target.value); }} /></label>
            <label>{vi ? "Thời lượng tối đa (phút)" : "Maximum duration (minutes)"}<input type="number" required min="60" max="720" step="1" value={duration} onChange={(event) => { changed(); setDuration(event.target.value); }} /></label>
            <label>{vi ? "Ngân sách tổng" : "Total budget"} ({catalog.request.budget.currency})<input type="number" required min={catalog.request.budget.currency === "USD" ? "0.01" : "1"} step={catalog.request.budget.currency === "USD" ? "0.01" : "1"} value={amount} onChange={(event) => { changed(); setAmount(event.target.value); }} /></label>
          </div>
          <div className={styles.actions}><button type="submit" className="button" disabled={!ids.length}>{busy ? (vi ? "Đang kiểm tra và lưu…" : "Validating and saving…") : (vi ? "Kiểm tra & Lưu phiên bản mới" : "Validate & Save new version")}</button><button type="button" className="button button--secondary" onClick={onCancel}>{vi ? "Hủy chỉnh sửa" : "Discard changes"}</button></div>
        </fieldset>
      </form>}
    </section>
  );
}
