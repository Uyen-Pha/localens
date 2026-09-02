"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  RuntimeGuideAssignmentError,
  type AdminGuideAssignmentQueueItem,
  type EligibleGuideCandidate,
  type RuntimeGuideAssignmentPort,
} from "@/lib/application/guide-assignment/contracts";
import type { Locale } from "@/lib/i18n/config";
import { guideAssignmentRuntimeCopy } from "@/lib/i18n/guide-assignment-runtime";

type LoadState = "loading" | "ready" | "error";

function safeErrorMessage(
  value: unknown,
  text: ReturnType<typeof guideAssignmentRuntimeCopy>,
): string {
  if (!(value instanceof RuntimeGuideAssignmentError)) return text.unavailable;
  if (value.code === "IDEMPOTENCY_CONFLICT") return text.idempotencyConflict;
  if (value.code === "SCHEDULE_CONFLICT") return text.scheduleConflict;
  if (value.code === "CONFLICT" || value.code === "NOT_FOUND") return text.conflict;
  if (value.code === "FORBIDDEN" || value.code === "UNAUTHENTICATED") return text.denied;
  if (value.code === "INVALID_RESPONSE") return text.malformed;
  return text.unavailable;
}

function assignmentAttempt(bookingId: string, guideUserId: string): { key: string; storageKey: string } {
  const storageKey = `localens.guide-assignment:${bookingId}:${guideUserId}`;
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) return { key: existing, storageKey };
  const suffix = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const generated = `guide-assignment-${suffix}`;
  window.sessionStorage.setItem(storageKey, generated);
  return { key: generated, storageKey };
}

function formatSchedule(startAt: string, endAt: string, locale: Locale): string {
  const formatter = new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  });
  return `${formatter.format(new Date(startAt))} – ${formatter.format(new Date(endAt))}`;
}

export function RuntimeGuideAssignmentQueue({
  locale,
  assignments,
}: {
  locale: Locale;
  assignments: RuntimeGuideAssignmentPort;
}) {
  const text = guideAssignmentRuntimeCopy(locale);
  const [state, setState] = useState<LoadState>("loading");
  const [queue, setQueue] = useState<AdminGuideAssignmentQueueItem[]>([]);
  const [guides, setGuides] = useState<EligibleGuideCandidate[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const acknowledgedStorageKeysRef = useRef(new Set<string>());

  const load = useCallback(async () => {
    setState("loading");
    setLoadError(null);
    try {
      const [nextQueue, nextGuides] = await Promise.all([
        assignments.listAdminQueue(),
        assignments.listEligibleGuides(),
      ]);
      setQueue(nextQueue);
      setGuides(nextGuides);
      setSelected((current) => Object.fromEntries(nextQueue.map((item) => [
        item.bookingId,
        current[item.bookingId] ?? item.guideUserId ?? nextGuides[0]?.guideUserId ?? "",
      ])));
      for (const storageKey of acknowledgedStorageKeysRef.current) {
        window.sessionStorage.removeItem(storageKey);
      }
      acknowledgedStorageKeysRef.current.clear();
      setState("ready");
      return true;
    } catch (caught) {
      setQueue([]);
      setGuides([]);
      setLoadError(safeErrorMessage(caught, text));
      setState("error");
      return false;
    }
  }, [assignments, text]);

  useEffect(() => { void load(); }, [load, retryKey]);
  useEffect(() => { if (message !== null) statusRef.current?.focus(); }, [message]);

  async function assign(item: AdminGuideAssignmentQueueItem): Promise<void> {
    const guideUserId = selected[item.bookingId] ?? "";
    if (!guideUserId || submitting !== null) return;
    setSubmitting(item.bookingId);
    setMessage(null);
    setError(null);
    const attempt = assignmentAttempt(item.bookingId, guideUserId);
    try {
      await assignments.assignGuide({
        bookingId: item.bookingId,
        guideUserId,
        idempotencyKey: attempt.key,
      });
      acknowledgedStorageKeysRef.current.add(attempt.storageKey);
      if (await load()) setMessage(text.saved);
    } catch (caught) {
      setError(safeErrorMessage(caught, text));
    } finally {
      setSubmitting(null);
    }
  }

  if (state === "loading") return <p role="status" aria-live="polite">{text.loading}</p>;
  if (state === "error") {
    return <div role="alert"><p>{loadError ?? text.unavailable}</p><button type="button" onClick={() => setRetryKey((value) => value + 1)}>{text.retry}</button></div>;
  }

  return (
    <section aria-labelledby="runtime-guide-assignment-heading">
      <h2 id="runtime-guide-assignment-heading">{text.adminHeading}</h2>
      <p role="note">{text.adminDisclosure}</p>
      {queue.length === 0 ? <p>{text.emptyAdmin}</p> : (
        <div>
          {queue.map((item) => {
            const title = locale === "vi" ? item.titleVi : item.titleEn;
            const selectedGuide = selected[item.bookingId] ?? "";
            return (
              <article key={item.bookingId} aria-labelledby={`runtime-assignment-${item.bookingId}`}>
                <h3 id={`runtime-assignment-${item.bookingId}`}>{title}</h3>
                <dl>
                  <div><dt>{text.schedule}</dt><dd>{formatSchedule(item.startAt, item.endAt, locale)}</dd></div>
                  <div><dt>{text.meetingPoint}</dt><dd>{item.meetingPoint}</dd></div>
                  <div><dt>{text.partySize}</dt><dd>{item.partySize}</dd></div>
                  <div><dt>{text.tourLanguage}</dt><dd>{text.language[item.language]}</dd></div>
                  <div><dt>{text.currentGuide}</dt><dd>{item.guideDisplayName ?? text.unassigned}</dd></div>
                  {item.assignmentStatus ? <div><dt>{text.status}</dt><dd>{text.assignmentStatus[item.assignmentStatus]}</dd></div> : null}
                </dl>
                {guides.length === 0 ? <p>{text.noGuides}</p> : (
                  <form onSubmit={(event) => { event.preventDefault(); void assign(item); }}>
                    <label>
                      <span>{title}</span>
                      <select
                        value={selectedGuide}
                        disabled={submitting !== null}
                        onChange={(event) => setSelected((current) => ({ ...current, [item.bookingId]: event.target.value }))}
                      >
                        {guides.map((guide) => (
                          <option key={guide.guideUserId} value={guide.guideUserId}>
                            {guide.displayName} · {text.language[guide.language]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="submit" disabled={!selectedGuide || submitting !== null}>{text.assign}</button>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      )}
      {(submitting !== null || message !== null) ? (
        <p ref={statusRef} role="status" aria-live="polite" tabIndex={-1}>{submitting !== null ? text.saving : message}</p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
