"use client";

import { useState, type FormEvent } from "react";

import type { Dictionary } from "@/lib/i18n/dictionaries";

type PersonalizationFormCopy = Dictionary["home"]["personalizationForm"];

export function PersonalizationForm({ copy }: { copy: PersonalizationFormCopy }) {
  const [isPreviewed, setIsPreviewed] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPreviewed(true);
  }

  return (
    <form
      className="personalization-form"
      aria-label={copy.formLabel}
      onSubmit={handleSubmit}
    >
      <div className="personalization-form__grid">
        <label className="field">
          <span>{copy.durationLabel}</span>
          <select name="duration" defaultValue="half-day">
            {copy.durationOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>{copy.budgetLabel}</span>
          <select name="budget" defaultValue="30-60">
            {copy.budgetOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>{copy.startDateLabel}</span>
          <input name="startDate" type="date" aria-label={copy.startDateLabel} aria-describedby="start-date-hint" />
          <small id="start-date-hint">{copy.startDateHint}</small>
        </label>

        <label className="field">
          <span>{copy.startTimeLabel}</span>
          <input name="startTime" type="time" defaultValue="09:00" />
        </label>

        <label className="field">
          <span>{copy.languageLabel}</span>
          <select name="language" defaultValue="english">
            {copy.languageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>{copy.partySizeLabel}</span>
          <input name="partySize" type="number" min={1} max={20} defaultValue={2} aria-label={copy.partySizeLabel} aria-describedby="party-size-hint" />
          <small id="party-size-hint">{copy.partySizeHint}</small>
        </label>
      </div>

      <fieldset className="field-group">
        <legend>{copy.areasLabel}</legend>
        <p className="field-group__hint">{copy.areasHint}</p>
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
        <div className="check-grid check-grid--priorities">
          {copy.priorities.map((priority) => (
            <label className="check-card" key={priority}>
              <input type="checkbox" name="priorities" value={priority} />
              <span>{priority}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="personalization-form__grid personalization-form__grid--details">
        <label className="field">
          <span>{copy.paceLabel}</span>
          <select name="pace" defaultValue="balanced">
            {copy.paceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>{copy.dietLabel}</span>
          <select name="diet" defaultValue="none">
            {copy.dietOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>{copy.mobilityLabel}</span>
          <select name="mobility" defaultValue="none">
            {copy.mobilityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field field--wide">
          <span>{copy.specialNeedsLabel}</span>
          <textarea name="specialNeeds" rows={3} aria-label={copy.specialNeedsLabel} aria-describedby="special-needs-hint" />
          <small id="special-needs-hint">{copy.specialNeedsHint}</small>
        </label>
      </div>

      <div className="personalization-form__footer">
        <button className="button button--primary" type="submit">
          {copy.submitLabel}
        </button>
        {isPreviewed ? (
          <p className="form-preview" role="status">
            {copy.previewMessage}
          </p>
        ) : null}
      </div>
    </form>
  );
}
