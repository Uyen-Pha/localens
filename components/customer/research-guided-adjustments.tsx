"use client";

import { useRef, useState } from "react";

import type { ResearchResponse } from "@/lib/application/planner/research-planner";
import type { ResearchPlannerPort } from "@/lib/infrastructure/supabase/research-planner-adapter";
import { ResearchItineraryTimeline } from "./research-itinerary-timeline";
import { ResearchItineraryEditor } from "./research-itinerary-editor";
import styles from "./research-guided-adjustments.module.css";

type Intent = "replace" | "add" | "remove" | "less_travel" | "cheaper" | "more_food" | "more_history" | "relaxed" | "earlier" | "locks";
type Ready = Extract<ResearchResponse, { status: "ready" }>;
type Suggestions = Extract<Awaited<ReturnType<NonNullable<ResearchPlannerPort["suggest"]>>>, { status: "suggestions" }>["suggestions"];

export function ResearchGuidedAdjustments({
  locale,
  result,
  planner,
  onSaved,
  onCancel,
}: {
  locale: "vi" | "en";
  result: Ready;
  planner: ResearchPlannerPort;
  onSaved: (result: ResearchResponse) => void;
  onCancel: () => void;
}) {
  const vi = locale === "vi";
  const [locks, setLocks] = useState<string[]>([...(result.lockedStopIds ?? [])]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestions>([]);
  const [selected, setSelected] = useState("");
  const context = useRef<{ intent: Intent; targetId?: string; lockedStopIds: string[] } | null>(null);
  const editKey = useRef("");
  const working = useRef(false);
  const dirty = [...locks].sort().join("|") !== [...(result.lockedStopIds ?? [])].sort().join("|");
  const money = (value: number) => `${new Intl.NumberFormat("vi-VN").format(value)} VND`;
  const delta = (value: number) => `${value > 0 ? "+" : ""}${new Intl.NumberFormat("vi-VN").format(value)}`;

  async function suggest(intent: Intent, targetId?: string) {
    if (working.current || !planner.suggest || !result.revisionId) return;
    working.current = true;
    setBusy(true);
    setNotice("");
    setSuggestions([]);
    setSelected("");
    editKey.current = "";
    context.current = { intent, targetId, lockedStopIds: [...locks] };
    try {
      const response = await planner.suggest({ revisionId: result.revisionId, ...context.current });
      if (response.status === "suggestions" && response.suggestions.length) setSuggestions(response.suggestions);
      else setNotice(vi ? "Chưa tìm được phương án phù hợp hơn với các điều kiện hiện tại. Lịch trình của bạn vẫn được giữ nguyên." : "No better option fits the current constraints. Your itinerary is unchanged.");
    } catch {
      setNotice(vi ? "Chưa tải được gợi ý. Bạn có thể thử lại; lịch trình vẫn được giữ nguyên." : "Unable to load suggestions. Your itinerary is unchanged; please retry.");
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  async function apply() {
    if (working.current || !planner.refine || !result.revisionId || !selected || !context.current) return;
    working.current = true;
    setBusy(true);
    setNotice("");
    if (!editKey.current) editKey.current = crypto.randomUUID();
    try {
      const response = await planner.refine({ revisionId: result.revisionId, ...context.current, suggestionId: selected, editKey: editKey.current });
      if (response.status === "ready") onSaved(response);
      else setNotice(vi ? "Phương án chưa thể áp dụng. Lịch trình đã lưu vẫn được giữ nguyên." : "This option could not be applied. Your saved itinerary is unchanged.");
    } catch {
      setNotice(vi ? "Chưa xác nhận được thay đổi. Hãy thử áp dụng lại để kiểm tra và lưu an toàn." : "Unable to confirm the change. Retry applying to safely check and save.");
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  const quick: [Intent, string, string][] = [
    ["less_travel", "Ít di chuyển", "Less travel"],
    ["cheaper", "Tiết kiệm hơn", "Lower cost"],
    ["more_food", "Thêm ẩm thực", "More food"],
    ["more_history", "Thêm lịch sử", "More history"],
    ["relaxed", "Nhẹ nhàng hơn", "More relaxed"],
    ["earlier", "Kết thúc sớm hơn", "Finish earlier"],
  ];
  const preview = suggestions.find((option) => option.id === selected);

  if (advanced && result.revisionId && planner.options && planner.edit) {
    return <ResearchItineraryEditor locale={locale} revisionId={result.revisionId} stops={result.plan.stops} lockedStopIds={result.lockedStopIds} planner={planner} onCancel={() => setAdvanced(false)} onSaved={onSaved} />;
  }

  return (
    <section className={styles.panel} aria-label={vi ? "Điều chỉnh lịch trình" : "Adjust itinerary"} aria-busy={busy}>
      <h3>{vi ? "Bạn muốn thay đổi điều gì?" : "What would you like to change?"}</h3>
      <p>{vi ? "Giữ những điểm bạn thích, chọn thay đổi và xem trước tác động trước khi áp dụng." : "Keep your favourite stops and preview the impact before applying a change."}</p>
      <fieldset disabled={busy} className={styles.controls}>
        <div className={styles.quick}>{quick.map(([intent, viLabel, enLabel]) => <button type="button" key={intent} disabled={!planner.suggest || !planner.refine} onClick={() => void suggest(intent)}>{vi ? viLabel : enLabel}</button>)}</div>
        <ResearchItineraryTimeline
          locale={locale}
          plan={result.plan}
          renderActions={(stopId) => (
            <div className={styles.actions}>
              <button type="button" disabled={locks.includes(stopId) || !planner.suggest || !planner.refine} onClick={() => void suggest("replace", stopId)}>{vi ? "Thay điểm này" : "Replace stop"}</button>
              <button type="button" disabled={locks.includes(stopId) || result.plan.stops.length === 1 || !planner.suggest || !planner.refine} onClick={() => void suggest("remove", stopId)}>{vi ? "Bỏ điểm này" : "Remove"}</button>
              <label><input type="checkbox" disabled={!planner.suggest || !planner.refine} checked={locks.includes(stopId)} onChange={() => { setLocks((current) => current.includes(stopId) ? current.filter((id) => id !== stopId) : [...current, stopId]); setSuggestions([]); setSelected(""); setNotice(""); editKey.current = ""; }} />{vi ? "Giữ điểm này" : "Keep fixed"}</label>
            </div>
          )}
        />
        <div className={styles.actions}><button type="button" disabled={!planner.suggest || !planner.refine} onClick={() => void suggest("add")}>+ {vi ? "Thêm trải nghiệm" : "Add experience"}</button>{dirty && <button type="button" onClick={() => void suggest("locks")}>{vi ? "Xem trước điểm cố định" : "Preview fixed stops"}</button>}</div>
        {dirty && <p>{vi ? "Điểm cố định chưa được lưu. Xem trước và áp dụng thay đổi để lưu cùng lịch trình." : "Fixed stops are not saved yet. Preview and apply to save them with your itinerary."}</p>}
        {suggestions.length > 0 && <div className={styles.suggestions}><h4>{vi ? "Gợi ý điều chỉnh phù hợp" : "Validated options"}</h4>{suggestions.map((option) => <label className={styles.option} key={option.id}><input type="radio" name="itinerary-suggestion" value={option.id} checked={selected === option.id} onChange={() => { setSelected(option.id); editKey.current = ""; }} /><div><strong>{option.label}</strong><p>{option.plan.stops.map((stop) => stop.name).join(" → ")}</p><p>{delta(option.delta.costVnd)} VND · {delta(option.delta.travelMinutes)} {vi ? "phút di chuyển" : "travel min"} · {delta(option.delta.durationMinutes)} {vi ? "phút tổng cộng" : "total min"}</p></div></label>)}</div>}
        {preview && <div className={styles.preview}><h4>{vi ? "Xem trước lịch trình mới" : "Preview itinerary"}</h4><ol>{preview.plan.stops.map((stop) => <li key={stop.id}><strong>{stop.arrival} – {stop.departure}</strong> {stop.name}</li>)}</ol><p>{vi ? "Trở về" : "Return"} {preview.plan.returnTime} · {preview.plan.durationMinutes} {vi ? "phút" : "min"} · {money(preview.plan.totalVnd)}</p><button className="button" type="button" onClick={() => void apply()}>{vi ? "Áp dụng thay đổi" : "Apply changes"}</button></div>}
        <div className={styles.footer}><button type="button" onClick={onCancel}>{vi ? "Hủy điều chỉnh" : "Cancel adjustments"}</button>{planner.edit && planner.options && <button type="button" disabled={dirty} onClick={() => setAdvanced((value) => !value)} aria-expanded={advanced}>{vi ? "Chỉnh nâng cao" : "Advanced editing"}</button>}</div>
      </fieldset>
      {busy && <p role="status">{vi ? "Đang xử lý thay đổi…" : "Processing changes…"}</p>}
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
    </section>
  );
}
