"use client";

import { useState, type FormEvent } from "react";

import type {
  Dictionary,
  PersonalizationPriorityKey,
} from "@/lib/i18n/dictionaries";

type PersonalizationFormCopy = Dictionary["home"]["personalizationForm"];

const MAX_SAFE_MINOR = Number.MAX_SAFE_INTEGER;
const PRIORITY_KEYS: PersonalizationPriorityKey[] = [
  "street_food",
  "history",
  "traditional_craft",
  "traditional_market",
];

export type PersonalizationRequest = {
  startAt: string;
  durationMinutes: number;
  areas: string[];
  budget: { currency: "VND" | "USD"; amountMinor: number };
  partySize: number;
  guideLanguage: "en" | "vi";
  priorityWeights: Record<PersonalizationPriorityKey, 0 | 1 | 2 | 3 | 4 | 5>;
  pace: "relaxed" | "active";
  dietaryRequirements: string[];
  mobilityRequirements: string[];
  lockedStopIds: string[];
};

function numericValue(formData: FormData, name: string): number {
  return Number(formData.get(name) ?? 0);
}

function weightValue(formData: FormData, key: PersonalizationPriorityKey): 0 | 1 | 2 | 3 | 4 | 5 {
  const value = Math.min(5, Math.max(0, Math.round(numericValue(formData, `priorityWeights.${key}`))));
  return value as 0 | 1 | 2 | 3 | 4 | 5;
}

function optionalRequirement(formData: FormData, name: string): string[] {
  const value = String(formData.get(name) ?? "none");
  return value === "none" ? [] : [value];
}

/** Map the visible shell to the itinerary contract without making a network call. */
export function buildPersonalizationRequest(formData: FormData): PersonalizationRequest {
  const currency = String(formData.get("budgetCurrency") ?? "VND") as "VND" | "USD";
  const amount = numericValue(formData, "budgetAmount");

  return {
    startAt: `${String(formData.get("startDate") ?? "")}T${String(formData.get("startTime") ?? "")}:00+07:00`,
    durationMinutes: numericValue(formData, "durationMinutes"),
    areas: formData.getAll("areas").map(String),
    budget: {
      currency,
      amountMinor: currency === "USD" ? Math.round(amount * 100) : amount,
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
  };
}

export function PersonalizationForm({ copy }: { copy: PersonalizationFormCopy }) {
  const [isPreviewed, setIsPreviewed] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [budgetCurrency, setBudgetCurrency] = useState<"VND" | "USD">("VND");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const hasDate = String(formData.get("startDate") ?? "").length > 0;
    const hasTime = String(formData.get("startTime") ?? "").length > 0;
    const hasArea = formData.getAll("areas").length > 0;
    const durationMinutes = numericValue(formData, "durationMinutes");
    const partySize = numericValue(formData, "partySize");
    const currency = String(formData.get("budgetCurrency") ?? "VND");
    const amount = numericValue(formData, "budgetAmount");
    const amountMinor = currency === "USD" ? Math.round(amount * 100) : amount;
    const hasValidDuration =
      Number.isInteger(durationMinutes) && durationMinutes >= 60 && durationMinutes <= 720;
    const hasValidPartySize =
      Number.isSafeInteger(partySize) && partySize >= 1 && partySize <= 20;
    const hasValidBudget =
      (currency === "VND" || currency === "USD") &&
      Number.isFinite(amount) &&
      amount > 0 &&
      (currency === "USD" || Number.isInteger(amount)) &&
      Number.isSafeInteger(amountMinor);
    const hasPriority = PRIORITY_KEYS.some(
      (key) => weightValue(formData, key) > 0,
    );

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
      return;
    }

    buildPersonalizationRequest(formData);
    setValidationError(null);
    setIsPreviewed(true);
  }

  return (
    <form className="personalization-form" aria-label={copy.formLabel} onSubmit={handleSubmit}>
      <div className="personalization-form__grid">
        <label className="field">
          <span>{copy.durationLabel}</span>
          <input name="durationMinutes" type="number" min={60} max={720} step={15} defaultValue={180} required aria-label={copy.durationLabel} aria-describedby="duration-hint" />
          <small id="duration-hint">{copy.durationHint}</small>
        </label>

        <label className="field">
          <span>{copy.budgetLabel}</span>
          <input name="budgetAmount" type="number" min={1} max={budgetCurrency === "USD" ? MAX_SAFE_MINOR / 100 : MAX_SAFE_MINOR} step={budgetCurrency === "USD" ? "0.01" : "1"} defaultValue={1000000} required aria-label={copy.budgetLabel} aria-describedby="budget-hint" />
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
          <input name="startDate" type="date" aria-label={copy.startDateLabel} aria-describedby="start-date-hint timezone-hint" required />
          <small id="start-date-hint">{copy.startDateHint}</small>
        </label>

        <label className="field">
          <span>{copy.startTimeLabel}</span>
          <input name="startTime" type="time" defaultValue="09:00" required aria-describedby="timezone-hint" />
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

      <fieldset className="field-group" aria-describedby="areas-hint">
        <legend>{copy.areasLabel}</legend>
        <p className="field-group__hint" id="areas-hint">{copy.areasHint}</p>
        <div className="check-grid">
          {copy.areaOptions.map((option) => (
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
              <input name={`priorityWeights.${priority.key}`} type="number" min={0} max={5} step={1} defaultValue={priority.key === "street_food" ? 3 : 0} aria-label={priority.label} />
            </label>
          ))}
        </div>
      </fieldset>

      <div className="personalization-form__grid personalization-form__grid--details">
        <label className="field">
          <span>{copy.paceLabel}</span>
          <select name="pace" defaultValue="relaxed">
            {copy.paceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{copy.dietLabel}</span>
          <select name="diet" defaultValue="none">
            {copy.dietOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{copy.mobilityLabel}</span>
          <select name="mobility" defaultValue="none">
            {copy.mobilityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="field field--wide">
          <span>{copy.specialNeedsLabel}</span>
          <textarea name="specialNeeds" rows={3} aria-label={copy.specialNeedsLabel} aria-describedby="special-needs-hint" />
          <small id="special-needs-hint">{copy.specialNeedsHint}</small>
        </label>
      </div>

      <div className="personalization-form__footer">
        <button className="button button--primary" type="submit">{copy.submitLabel}</button>
        {validationError ? <p className="form-validation" role="alert">{validationError}</p> : null}
        {isPreviewed ? <p className="form-preview" role="status">{copy.previewMessage}</p> : null}
      </div>
    </form>
  );
}
