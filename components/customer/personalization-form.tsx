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

const MAX_SAFE_MINOR = Number.MAX_SAFE_INTEGER;
const MAX_SAFE_USD_AMOUNT = `${Math.floor(MAX_SAFE_MINOR / 100)}.${String(
  MAX_SAFE_MINOR % 100,
).padStart(2, "0")}`;
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
}: {
  copy: PersonalizationFormCopy;
  locale?: Locale;
}) {
  const [isPreviewed, setIsPreviewed] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
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
      durationHours >= 0 &&
      durationHours <= 12 &&
      Number.isInteger(durationAdditionalMinutes) &&
      durationAdditionalMinutes >= 0 &&
      durationAdditionalMinutes <= 45 &&
      durationAdditionalMinutes % 15 === 0 &&
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
    setPlannerHandoffError(!saved);
  }

  return (
    <form className="personalization-form personalization-form--editorial" aria-label={copy.formLabel} aria-busy={runtimeSelection === null && !runtimeLoadFailed} onFocusCapture={keepFocusedControlVisible} onSubmit={handleSubmit}>
      <div className="personalization-form__grid">
        <fieldset className="duration-field" aria-describedby="duration-hint">
          <legend>{copy.durationLabel}</legend>
          <div className="duration-field__inputs">
            <label className="field">
              <span>{copy.durationHoursLabel}</span>
              <input name="durationHours" type="number" min={0} max={12} step={1} defaultValue={3} required />
            </label>
            <label className="field">
              <span>{copy.durationMinutesLabel}</span>
              <input name="durationAdditionalMinutes" type="number" min={0} max={45} step={15} defaultValue={0} required />
            </label>
          </div>
          <small id="duration-hint">{copy.durationHint}</small>
        </fieldset>

        <label className="field">
          <span>{copy.budgetLabel}</span>
          <input name="budgetAmount" type="number" min={1} max={budgetCurrency === "USD" ? MAX_SAFE_USD_AMOUNT : MAX_SAFE_MINOR} step={budgetCurrency === "USD" ? "0.01" : "1"} defaultValue={1000000} required aria-label={copy.budgetLabel} aria-describedby="budget-hint" />
          <small id="budget-hint">{copy.budgetHint}</small>
        </label>

        <label className="field">
          <span>{copy.budgetCurrencyLabel}</span>
          <select name="budgetCurrency" value={budgetCurrency} onChange={(event) => setBudgetCurrency(event.target.value as "VND" | "USD")}>
            {copy.budgetCurrencyOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>

        <label className="field">
          <span>{copy.startDateLabel}</span>
          <input name="startDate" type="date" min={minimumStartDate} value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-label={copy.startDateLabel} aria-describedby="start-date-hint timezone-hint" required />
          <small id="start-date-hint">{copy.startDateHint}</small>
        </label>

        <label className="field">
          <span>{copy.startTimeLabel}</span>
          <input name="startTime" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required aria-describedby="timezone-hint" />
        </label>

        <label className="field">
          <span>{copy.languageLabel}</span>
          <select name="guideLanguage" defaultValue="en">
            {copy.languageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>

        <label className="field">
          <span>{copy.partySizeLabel}</span>
          <input name="partySize" type="number" min={1} max={20} defaultValue={2} required aria-label={copy.partySizeLabel} aria-describedby="party-size-hint" />
          <small id="party-size-hint">{copy.partySizeHint}</small>
        </label>
      </div>

      <p className="form-timezone" id="timezone-hint">{copy.timezoneHint}</p>

      <fieldset className="field-group">
        <legend>{copy.presetsLegend}</legend>
        <p className="field-group__hint">{copy.presetsHint}</p>
        <div className="personalization-form__footer personalization-form__presets">
          <button
            className="button button--secondary"
            type="button"
            onClick={() => setPriorityWeights({ street_food: 1, history: 5, traditional_craft: 2, traditional_market: 2 })}
          >
            {copy.historyPresetLabel}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => setPriorityWeights({ street_food: 5, history: 1, traditional_craft: 1, traditional_market: 4 })}
          >
            {copy.foodPresetLabel}
          </button>
          <button className="button button--secondary" type="button" onClick={() => setPace("relaxed")}>
            {copy.relaxedPresetLabel}
          </button>
        </div>
      </fieldset>

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
        <legend>{copy.prioritiesLegend}</legend>
        <div className="priority-grid">
          {copy.priorities.map((priority) => (
            <label className="priority-control" key={priority.key}>
              <span>{priority.label}</span>
              <input
                name={`priorityWeights.${priority.key}`}
                type="number"
                min={0}
                max={5}
                step={1}
                value={priorityWeights[priority.key]}
                onChange={(event) => {
                  const value = Math.min(5, Math.max(0, Math.round(Number(event.target.value))));
                  setPriorityWeights((current) => ({
                    ...current,
                    [priority.key]: Number.isFinite(value) ? value as 0 | 1 | 2 | 3 | 4 | 5 : 0,
                  }));
                }}
                aria-label={priority.label}
              />
            </label>
          ))}
        </div>
      </fieldset>

      <div className="personalization-form__grid personalization-form__grid--details">
        <label className="field">
          <span>{copy.paceLabel}</span>
          <select name="pace" value={pace} onChange={(event) => setPace(event.target.value === "active" ? "active" : "relaxed")}>
            {copy.paceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{copy.dietLabel}</span>
          <select name="diet" defaultValue="none" aria-label={copy.dietLabel}>
            {copy.dietOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <small>{copy.dietaryUnsupportedNote}</small>
        </label>
        <label className="field">
          <span>{copy.mobilityLabel}</span>
          <select name="mobility" defaultValue="none" aria-label={copy.mobilityLabel}>
            {copy.mobilityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <small>{copy.mobilityUnsupportedNote}</small>
        </label>
        <label className="field field--wide">
          <span>{copy.specialNeedsLabel}</span>
          <textarea name="specialNeeds" rows={3} maxLength={1000} aria-label={copy.specialNeedsLabel} aria-describedby="special-needs-hint" />
          <small id="special-needs-hint">{copy.specialNeedsHint}</small>
        </label>
      </div>

      <div className="personalization-form__footer">
        <button className="button button--primary" type="submit" disabled={runtimeSelection === null}>{copy.submitLabel}</button>
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
