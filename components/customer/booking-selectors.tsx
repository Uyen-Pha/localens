"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Minus, Plus, UserRound, X } from "lucide-react";
import { DepartureCalendar } from "./departure-calendar";
import type { LiveDepartureAvailability } from "@/lib/domain/data/contracts";
import type { Locale } from "@/lib/i18n/config";

export function BookingSelectors({ locale, departures, selected, price, disabled, partySize, onPartyChange, onSelect }: {
  locale: Locale; departures: LiveDepartureAvailability[]; selected: LiveDepartureAvailability; price: string;
  disabled: boolean; partySize: string; onPartyChange: (value: string) => void; onSelect: (departure: LiveDepartureAvailability) => void;
}) {
  const [open, setOpen] = useState<"date" | "people" | null>(null);
  const [draft, setDraft] = useState(Number(partySize));
  const root = useRef<HTMLDivElement>(null);
  const dateButton = useRef<HTMLButtonElement>(null);
  const peopleButton = useRef<HTMLButtonElement>(null);
  const vi = locale === "vi";
  const max = Math.min(100, selected.remainingCapacity);
  const date = new Intl.DateTimeFormat(vi ? "vi-VN" : "en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(selected.startAt));
  function close() { setOpen(null); (open === "date" ? dateButton : peopleButton).current?.focus(); }
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(null); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") { setOpen(null); (open === "date" ? dateButton : peopleButton).current?.focus(); } }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div className="booking-selectors" ref={root}>
    <div className="booking-selectors__fields">
      <button ref={dateButton} aria-label={`${vi ? "Ngày khởi hành" : "Date"}: ${date}`} type="button" disabled={disabled} aria-expanded={open === "date"} aria-controls="booking-date-panel" onClick={() => setOpen(open === "date" ? null : "date")}><span><strong>{vi ? "Ngày khởi hành" : "Date"}</strong><span>{date}</span></span><ChevronDown size={18} /></button>
      <button ref={peopleButton} aria-label={`${vi ? "Số người" : "Travelers"} ${partySize}`} type="button" disabled={disabled} aria-expanded={open === "people"} aria-controls="booking-people-panel" onClick={() => { setDraft(Math.max(1, Math.min(Number(partySize) || 1, max))); setOpen(open === "people" ? null : "people"); }}><span><strong>{vi ? "Số người" : "Travelers"}</strong><span className="booking-selectors__count"><UserRound size={20} />{partySize}</span></span><ChevronDown size={18} /></button>
    </div>
    {open === "date" && <div id="booking-date-panel" className="booking-selectors__panel booking-selectors__panel--date">
      <button className="booking-selectors__close" type="button" aria-label={vi ? "Đóng lịch" : "Close calendar"} onClick={close}><X size={18} /></button>
      <DepartureCalendar locale={locale} departures={departures} selected={selected} price={price} disabled={disabled} onSelect={d => { onSelect(d); close(); }} twoMonths />
    </div>}
    {open === "people" && <div id="booking-people-panel" className="booking-selectors__panel">
      <p>{vi ? `Chọn tối đa ${max} khách cho chuyến này.` : `Select up to ${max} travelers for this departure.`}</p>
      <div className="booking-selectors__people"><div><strong>{vi ? "Khách tham gia" : "Travelers"}</strong></div>
        <div className="booking-selectors__stepper"><button type="button" disabled={draft <= 1} aria-label={vi ? "Giảm số khách" : "Remove traveler"} onClick={() => setDraft(draft - 1)}><Minus size={18} /></button><output aria-live="polite">{draft}</output><button type="button" disabled={draft >= max} aria-label={vi ? "Tăng số khách" : "Add traveler"} onClick={() => setDraft(draft + 1)}><Plus size={18} /></button></div>
      </div>
      <button type="button" className="tour-booking__button" onClick={() => { onPartyChange(String(draft)); close(); }}>{vi ? "Áp dụng" : "Apply"}</button>
    </div>}
  </div>;
}
