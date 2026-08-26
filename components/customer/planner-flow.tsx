"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  demoPlannerAdapter,
  type DemoPlannerState,
  type PlannerAdapter,
} from "@/lib/application/planner/demo-planner";
import type { Locale } from "@/lib/i18n/config";
import type { PlannerCopy } from "@/lib/i18n/dictionaries";

function formatMinutes(value: number, locale: Locale): string {
  return locale === "vi" ? `${value} phút` : `${value} min`;
}

function formatVnd(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

export function PlannerFlow({
  locale,
  copy,
  adapter = demoPlannerAdapter,
}: {
  locale: Locale;
  copy: PlannerCopy;
  adapter?: PlannerAdapter;
}) {
  const [state, setState] = useState<DemoPlannerState>(() => adapter.createInitial(locale));
  const [feedback, setFeedback] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [staleError, setStaleError] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isRefining, setIsRefining] = useState(false);
  const resultRef = useRef<HTMLElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (statusMessage !== null) resultRef.current?.focus();
  }, [state.current.revision, statusMessage]);

  useEffect(() => {
    if (staleError) alertRef.current?.focus();
  }, [staleError]);

  function toggleLock(itemId: string) {
    setState((current) => ({
      ...current,
      current: {
        ...current.current,
        items: current.current.items.map((item) =>
          item.id === itemId ? { ...item, locked: !item.locked } : item,
        ),
      },
    }));
    setStatusMessage(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedFeedback = feedback.trim();
    if (normalizedFeedback.length === 0) {
      setValidationError(copy.feedbackRequiredMessage);
      setStaleError(false);
      setStatusMessage(null);
      return;
    }

    setValidationError(null);
    setStaleError(false);
    setStatusMessage(null);
    setIsRefining(true);
    const result = adapter.refine(state, {
      baseRevision: state.current.revision,
      feedback: normalizedFeedback,
      lockedItemIds: state.current.items.filter((item) => item.locked).map((item) => item.id),
    });
    setIsRefining(false);

    if (!result.ok) {
      if (result.error.code === "INVALID_FEEDBACK") {
        setValidationError(copy.feedbackRequiredMessage);
        setStaleError(false);
        return;
      }
      setStaleError(true);
      return;
    }

    setState(result.state);
    setFeedback("");
    setStatusMessage(copy.revisionCreatedMessage);
  }

  function refreshLatest() {
    setState(adapter.getLatest(state, state.planId, locale));
    setFeedback("");
    setValidationError(null);
    setStaleError(false);
    setStatusMessage(null);
  }

  return (
    <section className="customer-section planner-flow" aria-labelledby="planner-heading">
      <div className="section-heading section-heading--compact">
        <p className="eyebrow">LocalLens</p>
        <h1 id="planner-heading">{copy.heading}</h1>
        <p>{copy.intro}</p>
      </div>

      <p className="demo-disclosure" role="note">{copy.simulatedDisclosure}</p>
      <p className="planner-flow__proposal">{copy.proposalOnly}</p>

      {staleError ? (
        <div ref={alertRef} className="planner-flow__error" role="alert" tabIndex={-1}>
          <p>{copy.staleRevisionMessage}</p>
          <button className="button button--secondary" type="button" onClick={refreshLatest}>
            {copy.refreshLabel}
          </button>
        </div>
      ) : null}
      {validationError ? <p className="planner-flow__error" role="alert">{validationError}</p> : null}
      {statusMessage ? <p className="planner-flow__status" role="status" aria-live="polite">{statusMessage}</p> : null}

      <article
        ref={resultRef}
        className="planner-flow__proposal-card"
        tabIndex={-1}
        aria-labelledby="planner-current-heading"
      >
        <div className="planner-flow__proposal-header">
          <div>
            <p className="eyebrow">{copy.currentRevisionLabel}</p>
            <h2 id="planner-current-heading">{`${copy.revisionLabel} ${state.current.revision}`}</h2>
          </div>
          <span className="planner-flow__plan-id">{state.planId}</span>
        </div>
        {state.current.feedback ? (
          <p className="planner-flow__current-feedback">
            <strong>{copy.revisionFeedbackLabel}:</strong> {state.current.feedback}
          </p>
        ) : null}

        <ol className="planner-timeline">
          {state.current.items.map((item) => (
            <li className="planner-timeline__item" key={item.id}>
              <article>
                <div className="planner-timeline__item-header">
                  <h3>{item.title}</h3>
                  <button
                    className="button button--secondary planner-timeline__lock"
                    type="button"
                    aria-pressed={item.locked}
                    onClick={() => toggleLock(item.id)}
                  >
                    {item.locked ? copy.unlockLabel : copy.lockLabel}: {item.title}
                  </button>
                </div>
                <p className="planner-timeline__activity">
                  <strong>{copy.activityLabel}:</strong>{" "}
                  <span data-testid="planner-activity">{item.activity}</span>
                </p>
                <dl className="planner-timeline__details">
                  <div><dt>{copy.startLabel}</dt><dd>{item.startAt}</dd></div>
                  <div><dt>{copy.endLabel}</dt><dd>{item.endAt}</dd></div>
                  <div><dt>{copy.visitDurationLabel}</dt><dd>{formatMinutes(item.visitDurationMinutes, locale)}</dd></div>
                  <div><dt>{copy.travelDurationLabel}</dt><dd>{formatMinutes(item.travelMinutesBefore, locale)}</dd></div>
                  <div><dt>{copy.costLabel}</dt><dd>{formatVnd(item.travelCostVndBefore + item.placeCostVnd, locale)}</dd></div>
                </dl>
              </article>
            </li>
          ))}
        </ol>

        <div className="planner-flow__totals">
          <dl>
            <div><dt>{copy.totalDurationLabel}</dt><dd>{formatMinutes(state.current.totals.durationMinutes, locale)}</dd></div>
            <div><dt>{copy.totalCostLabel}</dt><dd>{formatVnd(state.current.totals.costVnd, locale)}</dd></div>
          </dl>
        </div>
      </article>

      <section className="planner-flow__checks" aria-labelledby="planner-warnings-heading">
        <h2 id="planner-warnings-heading">{copy.warningsHeading}</h2>
        <ul>
          {state.current.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      </section>

      <form className="planner-flow__refine" onSubmit={handleSubmit} noValidate>
        <label className="field" htmlFor="planner-feedback">
          <span>{copy.feedbackLabel}</span>
          <textarea
            id="planner-feedback"
            name="feedback"
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder={copy.feedbackPlaceholder}
            rows={4}
            aria-describedby="planner-feedback-hint"
          />
        </label>
        <p id="planner-feedback-hint" className="planner-flow__hint">{copy.proposalOnly}</p>
        <button className="button button--primary" type="submit" disabled={isRefining}>
          {isRefining ? copy.refiningLabel : copy.refineLabel}
        </button>
      </form>

      <section className="planner-flow__history" aria-labelledby="planner-history-heading">
        <h2 id="planner-history-heading">{copy.revisionHistoryHeading}</h2>
        {state.history.length === 0 ? <p>{copy.noHistoryLabel}</p> : (
          <ol>
            {state.history.map((revision) => (
              <li key={revision.revision}>
                <strong>{`${copy.revisionLabel} ${revision.revision}`}</strong>
                {revision.feedback ? <p><span>{copy.revisionFeedbackLabel}:</span> {revision.feedback}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <Link className="button button--secondary" href={`/${locale}/`}>
        {copy.backHomeLabel}
      </Link>
    </section>
  );
}
