"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  FixedTourRuntimeError,
  type FixedTourCancellationDecision,
  type FixedTourCancellationQueueItem,
  type FixedTourRuntimePort,
} from "@/lib/application/fixed-tour/contracts";
import type { Locale } from "@/lib/i18n/config";
import { fixedTourRuntimeCopy } from "@/lib/i18n/fixed-tour-runtime";

type LoadState = "loading" | "ready" | "error";

function decisionKey(requestId: string, decision: FixedTourCancellationDecision): string {
  const storageKey = `localens.fixed-tour.cancellation-decision:${requestId}:${decision}`;
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const suffix = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const generated = `cancellation-decision-${suffix}`;
  window.sessionStorage.setItem(storageKey, generated);
  return generated;
}

export function RuntimeCancellationQueue({
  locale,
  fixedTour,
}: {
  locale: Locale;
  fixedTour: FixedTourRuntimePort;
}) {
  const copy = fixedTourRuntimeCopy(locale);
  const [state, setState] = useState<LoadState>("loading");
  const [items, setItems] = useState<FixedTourCancellationQueueItem[]>([]);
  const [retryKey, setRetryKey] = useState(0);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [submittingRequestId, setSubmittingRequestId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const decisionStatusRef = useRef<HTMLParagraphElement>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      setItems(await fixedTour.listCancellationQueue());
      setState("ready");
      return true;
    } catch {
      setItems([]);
      setState("error");
      return false;
    }
  }, [fixedTour]);

  useEffect(() => { void load(); }, [load, retryKey]);
  useEffect(() => {
    if (message !== null) decisionStatusRef.current?.focus();
  }, [message]);

  function errorText(value: unknown): string {
    if (!(value instanceof FixedTourRuntimeError)) return copy.cancellationDecisionUnavailable;
    if (value.code === "CONFLICT") return copy.cancellationDecisionConflict;
    if (value.code === "IDEMPOTENCY_CONFLICT") return copy.cancellationDecisionIdempotencyConflict;
    if (value.code === "FORBIDDEN" || value.code === "UNAUTHENTICATED") return copy.cancellationDecisionDenied;
    return copy.cancellationDecisionUnavailable;
  }

  async function decide(item: FixedTourCancellationQueueItem, decision: FixedTourCancellationDecision): Promise<void> {
    if (submittingRequestId !== null || item.status !== "pending") return;
    const noteValue = notes[item.requestId]?.trim() ?? "";
    setSubmittingRequestId(item.requestId);
    setMessage(null);
    setError(null);
    try {
      await fixedTour.decideCancellation({
        requestId: item.requestId,
        decision,
        note: noteValue.length === 0 ? null : noteValue,
        idempotencyKey: decisionKey(item.requestId, decision),
      });
      if (await load()) setMessage(copy.cancellationDecisionSaved);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setSubmittingRequestId(null);
    }
  }

  if (state === "loading") return <p role="status" aria-live="polite">{copy.loading}</p>;
  if (state === "error") {
    return (
      <div role="alert">
        <p>{copy.serviceUnavailable}</p>
        <button type="button" onClick={() => setRetryKey((value) => value + 1)}>{copy.retry}</button>
      </div>
    );
  }

  return (
    <section aria-labelledby="runtime-cancellation-queue-heading">
      <h2 id="runtime-cancellation-queue-heading">{copy.adminCancellationHeading}</h2>
      {items.length === 0 ? <p>{copy.emptyCancellationQueue}</p> : (
        <div>
          {items.map((item) => {
            const title = locale === "vi" ? item.titleVi : item.titleEn;
            return (
              <article key={item.requestId} aria-labelledby={`runtime-cancellation-request-${item.requestId}`}>
                <h3 id={`runtime-cancellation-request-${item.requestId}`}>{title}</h3>
                <dl>
                  <div><dt>{copy.customer}</dt><dd>{item.customerDisplayName}</dd></div>
                  <div><dt>{copy.reason}</dt><dd>{item.reason}</dd></div>
                  <div><dt>{copy.bookingStatus}</dt><dd>{copy.bookingStatusLabels[item.bookingStatus]}</dd></div>
                  <div><dt>{copy.cancellationStatus}</dt><dd>{copy.cancellationStatusLabels[item.status]}</dd></div>
                  {item.decisionNote ? <div><dt>{copy.decisionNote}</dt><dd>{item.decisionNote}</dd></div> : null}
                </dl>
                {item.status === "pending" ? (
                  <div>
                    <label>
                      <span>{copy.decisionNote}</span>
                      <textarea
                        value={notes[item.requestId] ?? ""}
                        maxLength={1000}
                        disabled={submittingRequestId !== null}
                        onChange={(event) => setNotes((current) => ({
                          ...current,
                          [item.requestId]: event.target.value,
                        }))}
                      />
                    </label>
                    <div>
                      <button
                        type="button"
                        disabled={submittingRequestId !== null}
                        onClick={() => void decide(item, "approved")}
                      >
                        {copy.approveCancellation}
                      </button>
                      <button
                        type="button"
                        disabled={submittingRequestId !== null}
                        onClick={() => void decide(item, "rejected")}
                      >
                        {copy.rejectCancellation}
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
      {(submittingRequestId !== null || message !== null) ? (
        <p ref={decisionStatusRef} role="status" aria-live="polite" tabIndex={-1}>
          {submittingRequestId !== null ? copy.savingCancellationDecision : message}
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
