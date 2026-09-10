"use client";

import { useState } from "react";
import type { LiveDepartureAvailability } from "@/lib/domain/data/contracts";
import type { Locale } from "@/lib/i18n/config";

export function departureDay(startAt: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(startAt));
}

// Illustrative display conversion only; booking amounts remain in VND.
export function previewMoney(value: number, locale: Locale): string {
  return locale === "vi" ? `${new Intl.NumberFormat("vi-VN").format(value)} VND`
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 26000);
}

export function DepartureCalendar({ locale, departures, selected, price, disabled, onSelect, twoMonths = false }: {
  locale: Locale; departures: LiveDepartureAvailability[]; selected: LiveDepartureAvailability;
  twoMonths?: boolean; price: string; disabled: boolean; onSelect: (departure: LiveDepartureAvailability) => void;
}) {
  const selectedDay = departureDay(selected.startAt);
  const [month, setMonth] = useState(selectedDay.slice(0, 7));
  const [year, monthNumber] = month.split("-").map(Number);

  const years = [...new Set(departures.map(d => Number(departureDay(d.startAt).slice(0, 4))))].sort();
  const today = departureDay(new Date().toISOString());
  const months = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, i, 1))));
  function move(delta: number) {
    const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
    setMonth(date.toISOString().slice(0, 7));
  }
  return <section className="departure-calendar" aria-label={locale === "vi" ? "Chọn ngày khởi hành" : "Choose departure date"}>
    <h3>{locale === "vi" ? "Chọn ngày khởi hành" : "Choose departure date"}</h3>
    <div className="departure-calendar__navigation">
      <button type="button" disabled={disabled || month === `${years[0]}-01`} aria-label={locale === "vi" ? "Tháng trước" : "Previous month"} onClick={() => move(-1)}>‹</button>
      <select aria-label={locale === "vi" ? "Tháng" : "Month"} disabled={disabled} value={monthNumber} onChange={e => setMonth(`${year}-${e.target.value.padStart(2, "0")}`)}>{months.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}</select>
      <select aria-label={locale === "vi" ? "Năm" : "Year"} disabled={disabled} value={year} onChange={e => setMonth(`${e.target.value}-${String(monthNumber).padStart(2, "0")}`)}>{years.map(y => <option key={y}>{y}</option>)}</select>
      <button type="button" disabled={disabled || month === `${years.at(-1)}-12`} aria-label={locale === "vi" ? "Tháng sau" : "Next month"} onClick={() => move(1)}>›</button>
    </div>
    <div className={twoMonths ? "departure-calendar__months" : undefined}>{Array.from({ length: twoMonths ? 2 : 1 }, (_, n) => {
      const first = new Date(Date.UTC(year, monthNumber - 1 + n, 1));
      const currentMonth = first.toISOString().slice(0, 7);
      const offset = (first.getUTCDay() + 6) % 7;
      const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
      return <div key={currentMonth} className="departure-calendar__month"><h4>{new Intl.DateTimeFormat(locale, {month:"long", year:"numeric", timeZone:"UTC"}).format(first)}</h4><div className="departure-calendar__grid">
      {(locale === "vi" ? ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]).map(day => <span className="departure-calendar__weekday" key={day}>{day}</span>)}
      {Array.from({ length: offset }, (_, i) => <span key={`blank-${i}`} />)}
      {Array.from({ length: days }, (_, i) => {
        const date = `${currentMonth}-${String(i + 1).padStart(2, "0")}`;
        const trip = departures.find(d => departureDay(d.startAt) === date && d.status === "scheduled" && d.remainingCapacity > 0 && d.startAt > new Date().toISOString());
        const available = !!trip && date >= today;
        return <button type="button" key={date} disabled={disabled || !available} aria-pressed={date === selectedDay} aria-label={`${date}${available ? `, ${price}` : locale === "vi" ? ", Không có chuyến còn chỗ" : ", Unavailable"}`} onClick={() => { if (trip) onSelect(trip); }}><span>{i + 1}</span>{available && <small>{price}</small>}</button>;
      })}
    </div>
    </div>; })}</div>
    <p className="tour-booking__hint">{locale === "vi" ? "Giá mỗi khách · Ngày mờ không có chuyến còn chỗ." : "Price per person · Faded dates are unavailable."}</p>
  </section>;
}
