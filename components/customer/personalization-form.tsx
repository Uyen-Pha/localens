"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FocusEvent, type FormEvent } from "react";

import type {
  ItineraryPreviewDto,
  ReadOnlyApi,
} from "@/lib/application/api/read-only-api";
import type { Locale } from "@/lib/i18n/config";
import type {
  Dictionary,
  PersonalizationPriorityKey,
} from "@/lib/i18n/dictionaries";
import {
  savePersonalizationRequest,
  toItineraryRequest,
  type PersonalizationRequest,
} from "@/lib/application/planner/personalization-session";
import {
  ItineraryPreview,
  type ItineraryPreviewError,
} from "@/components/customer/itinerary-preview";
import { loadPortalSurfaceComposition } from "@/components/portals/portal-session";
import {
  hasValidPersonalizationAreaSelection,
  type PersonalizationAreaOption,
} from "@/lib/application/planner/personalization-areas";
import { signInPath } from "@/lib/navigation/safe-return-to";
import { formatHcmMinute } from "@/lib/domain/itinerary/local-time";

type PersonalizationFormCopy = Dictionary["home"]["personalizationForm"];

const PRIORITY_KEYS: PersonalizationPriorityKey[] = [
  "street_food",
  "history",
  "traditional_craft",
  "traditional_market",
];
const DEFAULT_PRIORITY_WEIGHTS: Record<PersonalizationPriorityKey, 0 | 1 | 2 | 3 | 4 | 5> = {
  street_food: 3,
  history: 0,
  traditional_craft: 0,
  traditional_market: 0,
};
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export function hcmcCalendarDate(now: number): string {
  return formatHcmMinute(Math.floor(now / MINUTE_MS)).slice(0, 10);
}

export function defaultHcmcPlannerStart(now: number): { date: string; time: "09:00" } {
  const current = formatHcmMinute(Math.floor(now / MINUTE_MS));
  return {
    date: current.slice(11, 16) < "09:00" ? current.slice(0, 10) : hcmcCalendarDate(now + DAY_MS),
    time: "09:00",
  };
}

function isFutureHcmcStart(date: string, time: string, now: number): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return false;
  const value = Date.parse(`${date}T${time}:00+07:00`);
  return Number.isFinite(value) && value > now;
}

function keepFocusedControlVisible(event: FocusEvent<HTMLFormElement>): void {
  if (!(event.target instanceof HTMLElement)) return;
  if (typeof event.target.scrollIntoView !== "function") return;
  event.target.scrollIntoView({ block: "nearest", inline: "nearest" });
}

type RuntimeSelection =
  | { mode: "demo"; readOnlyApi: ReadOnlyApi }
  | { mode: "supabase"; areaOptions: PersonalizationAreaOption[] };

export type { PersonalizationRequest } from "@/lib/application/planner/personalization-session";

function numericValue(formData: FormData, name: string): number {
  return Number(formData.get(name) ?? 0);
}

function durationMinutesValue(formData: FormData): number {
  const usesSplitDuration =
    formData.has("durationHours") || formData.has("durationAdditionalMinutes");

  if (!usesSplitDuration) {
    return numericValue(formData, "durationMinutes");
  }

  return (
    numericValue(formData, "durationHours") * 60 +
    numericValue(formData, "durationAdditionalMinutes")
  );
}

export function parseBudgetAmountMinor(
  currency: "VND" | "USD",
  rawValue: unknown,
): number | null {
  const raw = rawValue == null ? "" : String(rawValue).trim();

  if (currency === "VND") {
    if (!/^\d+$/.test(raw)) return null;
    const amountMinor = Number(raw);
    return Number.isSafeInteger(amountMinor) && amountMinor > 0 ? amountMinor : null;
  }

  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole, fraction = ""] = raw.split(".");
  const amountMinor = Number(`${whole}${fraction.padEnd(2, "0")}`);
  return Number.isSafeInteger(amountMinor) && amountMinor > 0 ? amountMinor : null;
}

function weightValue(formData: FormData, key: PersonalizationPriorityKey): 0 | 1 | 2 | 3 | 4 | 5 {
  const value = Math.min(5, Math.max(0, Math.round(numericValue(formData, `priorityWeights.${key}`))));
  return value as 0 | 1 | 2 | 3 | 4 | 5;
}

function optionalRequirement(formData: FormData, name: string): string[] {
  const value = String(formData.get(name) ?? "none");
  return value === "none" ? [] : [value];
}

function isInitializedComposition(
  value: unknown,
): boolean {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { mode?: unknown; initialized?: unknown };
  return (
    (candidate.mode === "demo" || candidate.mode === "supabase") &&
    typeof candidate.initialized === "object" &&
    candidate.initialized !== null &&
    typeof (candidate.initialized as { then?: unknown }).then === "function"
  );
}

async function resolveRuntimeSelection(isRetry: boolean, locale: Locale): Promise<RuntimeSelection> {
  const composition = await loadPortalSurfaceComposition();
  if (!isInitializedComposition(composition)) {
    throw new Error("Invalid portal surface composition");
  }

  if (composition.mode === "supabase") {
    await composition.initialized;
    if (composition.personalizationAreas === undefined) {
      throw new Error("Supabase personalization area port is unavailable");
    }
    const areaOptions = await composition.personalizationAreas.listAreas(locale);
    return { mode: "supabase", areaOptions };
  }

  if (isRetry) {
    if (typeof composition.retryInitialization !== "function") {
      throw new Error("Demo composition cannot retry initialization");
    }
    await composition.retryInitialization();
  } else {
    await composition.initialized;
  }

  const { createReadOnlyApi } = await import("@/lib/application/api/read-only-api");
  return { mode: "demo", readOnlyApi: createReadOnlyApi() };
}

/** Map the visible shell to the itinerary contract without making a network call. */
export function buildPersonalizationRequest(formData: FormData): PersonalizationRequest {
  const currency = String(formData.get("budgetCurrency") ?? "VND") as "VND" | "USD";
  const amountMinor = parseBudgetAmountMinor(currency, formData.get("budgetAmount"));
  if (amountMinor === null) throw new Error("Invalid budget amount");

  return {
    startAt: `${String(formData.get("startDate") ?? "")}T${String(formData.get("startTime") ?? "")}:00+07:00`,
    durationMinutes: durationMinutesValue(formData),
    areas: formData.getAll("areas").map(String),
    budget: {
      currency,
      amountMinor,
    },
    partySize: numericValue(formData, "partySize"),
    guideLanguage: String(formData.get("guideLanguage") ?? "en") as "en" | "vi",
    priorityWeights: {
      street_food: weightValue(formData, "street_food"),
      history: weightValue(formData, "history"),
      traditional_craft: weightValue(formData, "traditional_craft"),
      traditional_market: weightValue(formData, "traditional_market"),
    },
    pace: String(formData.get("pace") ?? "relaxed") as "relaxed" | "active",
    dietaryRequirements: optionalRequirement(formData, "diet"),
    mobilityRequirements: optionalRequirement(formData, "mobility"),
    lockedStopIds: [],
    specialNeeds: String(formData.get("specialNeeds") ?? "").trim(),
  };
}

export function PersonalizationForm({
  copy,
  locale = "en",
  onPrepared,
}: {
  copy: PersonalizationFormCopy;
  locale?: Locale;
  onPrepared?: () => void;
}) {
  const vi = locale === "vi";
  const formRef = useRef<HTMLFormElement>(null);
  const [summary, setSummary] = useState<Record<string, string>>({});
  function updateSummary() {
    if (!formRef.current) return;
    const d = new FormData(formRef.current);
    setSummary(Object.fromEntries([...d.entries()].map(([k,v]) => [k,String(v)]).concat([["areas",d.getAll("areas").map(String).join("|")]])));
  }
  const [isPreviewed, setIsPreviewed] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [durationHours, setDurationHours] = useState("3");
  const [durationExtra, setDurationExtra] = useState("0");
  const [budgetAmount, setBudgetAmount] = useState("1000000");
  const [budgetCurrency, setBudgetCurrency] = useState<"VND" | "USD">("VND");
  const [preview, setPreview] = useState<ItineraryPreviewDto | null | undefined>(undefined);
  const [previewError, setPreviewError] = useState<ItineraryPreviewError | null>(null);
  const [plannerHandoffSaved, setPlannerHandoffSaved] = useState(false);
  const [plannerHandoffError, setPlannerHandoffError] = useState(false);
  const [runtimeSelection, setRuntimeSelection] = useState<RuntimeSelection | null>(null);
  const [runtimeLoadFailed, setRuntimeLoadFailed] = useState(false);
  const [runtimeRetryKey, setRuntimeRetryKey] = useState(0);
  const [minimumStartDate, setMinimumStartDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [priorityWeights, setPriorityWeights] = useState(DEFAULT_PRIORITY_WEIGHTS);
  const [pace, setPace] = useState<"relaxed" | "active">("relaxed");
  const runtimeLoadRef = useRef<Promise<RuntimeSelection> | null>(null);
  const runtimeLoadLocaleRef = useRef<Locale | null>(null);

  useEffect(() => {
    const now = Date.now();
    const start = defaultHcmcPlannerStart(now);
    setMinimumStartDate(hcmcCalendarDate(now));
    setStartDate(start.date);
    setStartTime(start.time);
  }, []);

  useEffect(() => {
    let disposed = false;
    setRuntimeSelection(null);
    setRuntimeLoadFailed(false);
    if (runtimeLoadRef.current === null || runtimeLoadLocaleRef.current !== locale) {
      runtimeLoadLocaleRef.current = locale;
      runtimeLoadRef.current = resolveRuntimeSelection(runtimeRetryKey > 0, locale);
    }
    void runtimeLoadRef.current
      .then((selection) => {
        if (!disposed) setRuntimeSelection(selection);
      })
      .catch(() => {
        if (!disposed) setRuntimeLoadFailed(true);
      });

    return () => {
      disposed = true;
    };
  }, [runtimeRetryKey, locale]);

  const areaOptions = runtimeSelection?.mode === "supabase"
    ? runtimeSelection.areaOptions
    : runtimeLoadFailed
      ? []
      : copy.areaOptions;

  const selectedAreas = (summary.areas ?? "").split("|").filter(Boolean);
  const travelers = Number(summary.partySize ?? 2);
  const canSuggestBudget = Number.isInteger(travelers) && travelers >= 1 && travelers <= 20 && selectedAreas.length > 0;
  // Provisional planning assumptions, not supplier pricing or route costs.
  const budgetBase = travelers * ((Number(durationHours) + Number(durationExtra) / 60) * 100000 + Math.max(0, selectedAreas.length - 1) * 50000);
  const budgetLow = Math.ceil(budgetBase * 0.8 / 50000) * 50000;
  const budgetHigh = Math.ceil(budgetBase * 1.2 / 50000) * 50000;
  const budgetSuggested = Math.ceil(budgetBase / 50000) * 50000;
  const toDisplayAmount = (vnd: number) => budgetCurrency === "VND" ? vnd : Math.round(vnd / 26000);
  const showBudget = (vnd: number) => toDisplayAmount(vnd).toLocaleString(vi ? "vi-VN" : "en-US") + " " + budgetCurrency;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (runtimeSelection === null) return;
    const formData = new FormData(event.currentTarget);
    const hasDate = String(formData.get("startDate") ?? "").length > 0;
    const hasTime = String(formData.get("startTime") ?? "").length > 0;
    const hasFutureStart = isFutureHcmcStart(
      String(formData.get("startDate") ?? ""),
      String(formData.get("startTime") ?? ""),
      Date.now(),
    );
    const submittedAreas = formData.getAll("areas");
    const hasArea = hasValidPersonalizationAreaSelection(submittedAreas, areaOptions);
    const durationHours = numericValue(formData, "durationHours");
    const durationAdditionalMinutes = numericValue(
      formData,
      "durationAdditionalMinutes",
    );
    const durationMinutes = durationMinutesValue(formData);
    const partySize = numericValue(formData, "partySize");
    const currency = String(formData.get("budgetCurrency") ?? "VND");
    const amountMinor = parseBudgetAmountMinor(currency as "VND" | "USD", formData.get("budgetAmount"));
    const hasValidDuration =
      Number.isInteger(durationHours) &&
      durationHours >= 1 &&
      durationHours <= 12 &&
      Number.isInteger(durationAdditionalMinutes) &&
      durationAdditionalMinutes >= 0 &&
      durationAdditionalMinutes <= 55 &&
      durationAdditionalMinutes % 5 === 0 &&
      Number.isInteger(durationMinutes) &&
      durationMinutes >= 60 &&
      durationMinutes <= 720;
    const hasValidPartySize =
      Number.isSafeInteger(partySize) && partySize >= 1 && partySize <= 20;
    const hasValidBudget =
      (currency === "VND" || currency === "USD") &&
      amountMinor !== null;
    const hasPriority = PRIORITY_KEYS.some(
      (key) => weightValue(formData, key) > 0,
    );

    if (hasDate && hasTime && !hasFutureStart) {
      setIsPreviewed(false);
      setValidationError(copy.startInPastMessage);
      setPreview(undefined);
      setPreviewError(null);
      setPlannerHandoffSaved(false);
      setPlannerHandoffError(false);
      return;
    }

    if (
      !hasDate ||
      !hasTime ||
      !hasArea ||
      !hasValidDuration ||
      !hasValidPartySize ||
      !hasValidBudget ||
      !hasPriority
    ) {
      setIsPreviewed(false);
      setValidationError(copy.validationMessage);
      setPreview(undefined);
      setPreviewError(null);
      setPlannerHandoffSaved(false);
      setPlannerHandoffError(false);
      return;
    }

    const request = buildPersonalizationRequest(formData);
    if (runtimeSelection.mode === "supabase") {
      setValidationError(null);
      setIsPreviewed(false);
      setPreview(undefined);
      setPreviewError(null);
      const saved = savePersonalizationRequest(request);
      setPlannerHandoffSaved(saved);
      if (saved) onPrepared?.();
      setPlannerHandoffError(!saved);
      return;
    }

    const result = runtimeSelection.readOnlyApi.previewItinerary(toItineraryRequest(request));
    if (!result.ok) {
      setIsPreviewed(false);
      setValidationError(null);
      setPreview(null);
      setPreviewError({
        message: copy.preview.errorMessage,
        retryable: result.error.retryable,
        correlationId: result.error.correlationId,
      });
      setPlannerHandoffSaved(false);
      setPlannerHandoffError(false);
      return;
    }

    setValidationError(null);
    setIsPreviewed(true);
    setPreviewError(null);
    setPreview(result.value);
    const saved = savePersonalizationRequest(request);
    setPlannerHandoffSaved(saved);
    if (saved) onPrepared?.();
    setPlannerHandoffError(!saved);
  }

  return (
    <form ref={formRef} onChange={updateSummary} className="personalization-form personalization-form--editorial planner-request" aria-label={copy.formLabel} aria-busy={runtimeSelection === null && !runtimeLoadFailed} onFocusCapture={keepFocusedControlVisible} onSubmit={handleSubmit}>
<div className="planner-request__main"><section className="planner-request__section"><h2><b>01</b>{vi ? "Thông tin chuyến đi" : "Trip information"}</h2><div className="personalization-form__grid">
        <fieldset className="duration-field">
          <legend>{copy.durationLabel}</legend>
          <div className="duration-field__inputs">
            <label className="field">
              <span>{copy.durationHoursLabel}</span>
              <select name="durationHours" value={durationHours} onChange={event => { setDurationHours(event.target.value); if(event.target.value === "12") setDurationExtra("0"); }} required>{Array.from({length:12},(_,i) => <option key={i+1} value={i+1}>{i+1}</option>)}</select>
            </label>
            <label className="field">
              <span>{copy.durationMinutesLabel}</span>
              <select name="durationAdditionalMinutes" value={durationExtra} onChange={event => setDurationExtra(event.target.value)} required>{Array.from({length:durationHours === "12" ? 1 : 12},(_,i) => <option key={i*5} value={i*5}>{i*5}</option>)}</select>
            </label>
          </div>
        </fieldset>

        <div className="field planner-budget-field"><label className="field">
          <span>{copy.budgetLabel}</span>
          <input type="hidden" name="budgetAmount" value={budgetAmount} />
          <input name="budgetDisplay" type="text" inputMode={budgetCurrency === "USD" ? "decimal" : "numeric"}
            value={(() => {
              const [whole, fraction] = budgetAmount.split(".");
              const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, vi ? "." : ",");
              return grouped + (fraction !== undefined ? (vi ? "," : ".") + fraction : "");
            })()}
            onChange={event => {
              const text = event.target.value;
              const raw = vi ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
              if ((budgetCurrency === "VND" ? /^\d*$/ : /^\d*(?:\.\d{0,2})?$/).test(raw)) setBudgetAmount(raw.replace(/^0+(?=\d)/, ""));
            }}
            required aria-label={copy.budgetLabel} />
        </label>
        <div className="planner-budget-suggestion">
        {canSuggestBudget ? <>
          <span>{vi ? "Gợi ý cho cả nhóm" : "Suggested group budget"}</span>
          <strong>{showBudget(budgetLow)} – {showBudget(budgetHigh)}</strong>
          <button type="button" onClick={() => setBudgetAmount(String(toDisplayAmount(budgetSuggested)))}>{vi ? "Dùng mức" : "Use"} {showBudget(budgetSuggested)}</button>
          <small>{vi ? "Ước tính tham khảo, không phải báo giá. Bạn có thể nhập mức khác." : "Planning estimate, not a quote. You can enter another budget."}</small>
          <details><summary>{vi ? "Cách ước tính" : "How this is estimated"}</summary><small>{vi ? "Tạm tính 100.000 VND/người/giờ, cộng 50.000 VND/người cho mỗi khu vực bổ sung; khoảng dao động ±20%. Chưa tính theo điểm đến hay nhà cung cấp cụ thể." : "Provisional allowance: VND 100,000/person/hour plus VND 50,000/person per additional area, with a ±20% range. Not based on specific venues or suppliers."}{budgetCurrency === "USD" ? (vi ? " Quy đổi tham khảo: 1 USD = 26.000 VND." : "Indicative conversion: USD 1 = VND 26,000.") : ""}</small></details>
        </> : <small>{vi ? "Chọn khu vực và số người để xem ngân sách gợi ý." : "Select areas and group size to see a budget suggestion."}</small>}
        </div></div>

        <label className="field">
          <span>{copy.budgetCurrencyLabel}</span>
          <select name="budgetCurrency" value={budgetCurrency} onChange={(event) => { const currency = event.target.value as "VND" | "USD"; setBudgetCurrency(currency); if (currency === "VND") setBudgetAmount(current => current.split(".")[0]); }}>
            {copy.budgetCurrencyOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>

        <label className="field">
          <span>{copy.startDateLabel}</span>
          <span className="planner-date-display">
            <span aria-hidden="true" className="planner-date-display__value">{startDate ? startDate.split("-").reverse().join("/") : "DD/MM/YYYY"}</span>
            <input name="startDate" type="date" lang={vi ? "vi-VN" : "en-GB"} min={minimumStartDate} value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-label={copy.startDateLabel} aria-describedby="planner-date-format timezone-hint" required />
          </span>
          <span id="planner-date-format" className="planner-date-format">{vi ? "Ngày / Tháng / Năm" : "Day / Month / Year"}</span>
          
        </label>

        <div className="field" role="group" aria-label={copy.startTimeLabel}>
          <span>{copy.startTimeLabel}</span>
          <input type="hidden" name="startTime" value={startTime} />
          <span className="planner-start-time">
            <select aria-label={vi ? "Giờ bắt đầu" : "Start hour"} value={String(Number(startTime.slice(0,2)) % 12 || 12)}
              onChange={event => { const hour = Number(event.target.value) % 12 + (Number(startTime.slice(0,2)) >= 12 ? 12 : 0); setStartTime(String(hour).padStart(2,"0") + startTime.slice(2)); }}>
              {Array.from({length:12},(_,i) => <option key={i+1} value={i+1}>{String(i+1).padStart(2,"0")}</option>)}
            </select>
            <span aria-hidden="true">:</span>
            <select aria-label={vi ? "Phút bắt đầu" : "Start minute"} value={startTime.slice(3,5)}
              onChange={event => setStartTime(startTime.slice(0,3) + event.target.value)}>
              {Array.from({length:60},(_,i) => <option key={i} value={String(i).padStart(2,"0")}>{String(i).padStart(2,"0")}</option>)}
            </select>
            <select aria-label={vi ? "Buổi bắt đầu" : "AM or PM"} value={Number(startTime.slice(0,2)) >= 12 ? "PM" : "AM"}
              onChange={event => { const hour = Number(startTime.slice(0,2)) % 12 + (event.target.value === "PM" ? 12 : 0); setStartTime(String(hour).padStart(2,"0") + startTime.slice(2)); }}>
              <option value="AM">AM</option><option value="PM">PM</option>
            </select>
          </span>
        </div>

        <label className="field">
          <span>{copy.languageLabel}</span>
          <select name="guideLanguage" defaultValue="en">
            {copy.languageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>

        <label className="field">
          <span>{copy.partySizeLabel}</span>
          <input name="partySize" type="number" min={1} max={20} defaultValue={2} required aria-label={copy.partySizeLabel} />
          
        </label>
      </div>

      <p className="form-timezone" id="timezone-hint">{copy.timezoneHint}</p>

</section><section className="planner-request__section"><h2><b>02</b>{vi ? "Khu vực và sở thích" : "Areas and interests"}</h2>

      <fieldset className="field-group" aria-describedby="areas-hint">
        <legend>{copy.areasLabel}</legend>
        <p className="field-group__hint" id="areas-hint">{copy.areasHint}</p>
        <div className="check-grid">
          {areaOptions.map((option) => (
            <label className="check-card" key={option.value}>
              <input type="checkbox" name="areas" value={option.value} />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="field-group">
        <legend>{vi ? "Mức độ ưu tiên các trải nghiệm" : "Experience priorities"}</legend>
        <div className="priority-grid">
          {copy.priorities.map((priority) => (
            <label className="priority-control" key={priority.key}>
              <span>{priority.label}</span>
              <select name={`priorityWeights.${priority.key}`} value={priorityWeights[priority.key]} aria-label={priority.label} onChange={event => setPriorityWeights(current => ({ ...current, [priority.key]: Number(event.target.value) as 0 | 1 | 2 | 3 }))}>
{(vi ? ["Không ưu tiên","Ưu tiên thấp","Ưu tiên vừa","Ưu tiên cao"] : ["No preference","Low priority","Medium priority","High priority"]).map((label,value) => <option key={value} value={value}>{label}</option>)}</select>
            </label>
          ))}
        </div>
      </fieldset>

</section><section className="planner-request__section"><h2><b>03</b>{vi ? "Nhu cầu bổ sung" : "Additional requirements"}</h2><div className="personalization-form__grid personalization-form__grid--details">
        <label className="field">
          <span>{copy.paceLabel}</span>
          <select name="pace" value={pace} onChange={(event) => setPace(event.target.value === "active" ? "active" : "relaxed")}>
            {copy.paceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{vi ? "Yêu cầu ăn uống" : copy.dietLabel}</span>
          <select name="diet" defaultValue="none" aria-label={vi ? "Yêu cầu ăn uống" : copy.dietLabel}>
            {copy.dietOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="field field--wide">
          <span>{vi ? "Yêu cầu đặc biệt khác" : copy.specialNeedsLabel}</span>
          <textarea name="specialNeeds" rows={3} maxLength={1000} aria-label={vi ? "Yêu cầu đặc biệt khác" : copy.specialNeedsLabel} aria-describedby="special-needs-hint" />
          <small id="special-needs-hint">{copy.specialNeedsHint}</small>
        </label>
      </div>

</section><section className="planner-request__section"><h2><b>04</b>{vi ? "Xác nhận yêu cầu" : "Review your request"}</h2><div className="personalization-form__footer">
        <button className="button button--primary" type="submit" disabled={runtimeSelection === null}>{vi ? "Tạo lịch trình gợi ý" : "Create suggested itinerary"}</button>
<button className="button button--secondary" type="button" onClick={() => {
formRef.current?.reset(); const start = defaultHcmcPlannerStart(Date.now());
setStartDate(start.date); setStartTime(start.time); setBudgetCurrency("VND"); setBudgetAmount("1000000"); setDurationHours("3"); setDurationExtra("0"); setPriorityWeights(DEFAULT_PRIORITY_WEIGHTS); setPace("relaxed"); setSummary({});
setValidationError(null); setPreview(undefined); setPreviewError(null); setIsPreviewed(false); setPlannerHandoffSaved(false); setPlannerHandoffError(false);
}}>{vi ? "Đặt lại biểu mẫu" : "Reset form"}</button>
        {runtimeSelection === null && !runtimeLoadFailed ? <p className="form-preview" role="status" aria-live="polite">{copy.runtimeLoadingMessage}</p> : null}
        {runtimeLoadFailed ? (
          <>
            <p className="form-validation" role="alert">{copy.runtimeUnavailableMessage}</p>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => {
                runtimeLoadRef.current = null;
                setRuntimeRetryKey((value) => value + 1);
              }}
            >
              {copy.runtimeRetryLabel}
            </button>
          </>
        ) : null}
        {validationError ? <p className="form-validation" role="alert">{validationError}</p> : null}
        {isPreviewed ? <p className="form-preview" role="status">{copy.previewMessage}</p> : null}
      </div>
</section></div>
<aside className="planner-request__summary"><small>LOCALLENS</small><h2>{vi ? "Chuyến đi của bạn" : "Your trip"}</h2><p>{vi ? "Tóm tắt nhanh lựa chọn của bạn." : "Your choices at a glance."}</p>
<dl>{[
[vi ? "Thời lượng" : "Duration", durationHours + (vi ? " giờ " : " hr ") + durationExtra + (vi ? " phút" : " min")],
[vi ? "Ngày" : "Date", startDate ? new Intl.DateTimeFormat(vi ? "vi-VN" : "en-GB").format(new Date(startDate + "T12:00:00")) : "—"],
[vi ? "Bắt đầu" : "Start",startTime + " (GMT+7)"],
[vi ? "Số người" : "Travelers",summary.partySize ?? "2"],
[vi ? "Ngân sách nhóm" : "Group budget",Number(budgetAmount || 0).toLocaleString(vi ? "vi-VN" : "en-US") + " " + budgetCurrency],
[vi ? "Ngôn ngữ" : "Language",copy.languageOptions.find(o => o.value === (summary.guideLanguage ?? "en"))?.label ?? "—"],
[vi ? "Khu vực" : "Areas",(summary.areas ?? "").split("|").map(value => areaOptions.find(o => o.value === value)?.label).filter(Boolean).join(", ") || (vi ? "Chưa chọn" : "Not selected")],
[vi ? "Nhịp độ" : "Pace",copy.paceOptions.find(o => o.value === pace)?.label ?? pace]
].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>{vi ? "Bạn có thể điều chỉnh lựa chọn trước khi tạo lịch trình." : "Adjust your choices before creating your itinerary."}</p></aside>
      {runtimeSelection?.mode === "demo" && isPreviewed ? (
        <div className="personalization-form__planner-cta">
          {plannerHandoffSaved ? (
            <>
              <Link className="button button--secondary" href={`/${locale}/planner/`}>
                {copy.plannerLinkLabel}
              </Link>
              <p className="form-preview" role="note">{copy.plannerLinkDisclosure}</p>
            </>
          ) : null}
          {plannerHandoffError ? <p className="form-validation" role="alert">{copy.plannerLinkStorageError}</p> : null}
        </div>
      ) : null}
      {runtimeSelection?.mode === "supabase" && (plannerHandoffSaved || plannerHandoffError) ? (
        <div className="personalization-form__planner-cta">
          {plannerHandoffSaved ? (
            <>
              <Link className="button button--secondary" href={signInPath(locale, `/${locale}/planner/`)}>
                {copy.runtimePlannerLinkLabel}
              </Link>
              <p className="form-preview" role="note">{copy.runtimePlannerLinkDisclosure}</p>
            </>
          ) : null}
          {plannerHandoffError ? <p className="form-validation" role="alert">{copy.runtimePlannerLinkStorageError}</p> : null}
        </div>
      ) : null}
      {runtimeSelection?.mode === "demo" ? (
        <ItineraryPreview
          locale={locale}
          copy={copy.preview}
          preview={preview}
          error={previewError}
        />
      ) : null}
    </form>
  );
}
