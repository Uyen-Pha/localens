"use client";

import { useCallback, useEffect, useState } from "react";

import {
  RuntimeGuideAssignmentError,
  type GuideOwnAssignment,
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
  if (value.code === "FORBIDDEN" || value.code === "UNAUTHENTICATED") return text.denied;
  if (value.code === "INVALID_RESPONSE") return text.malformed;
  return text.unavailable;
}

function formatSchedule(item: GuideOwnAssignment, locale: Locale): string {
  const formatter = new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  });
  const start = formatter.format(new Date(item.startAt));
  return item.endAt === null ? start : `${start} – ${formatter.format(new Date(item.endAt))}`;
}

export function RuntimeGuideAssignmentList({
  locale,
  assignments,
}: {
  locale: Locale;
  assignments: RuntimeGuideAssignmentPort;
}) {
  const text = guideAssignmentRuntimeCopy(locale);
  const [state, setState] = useState<LoadState>("loading");
  const [items, setItems] = useState<GuideOwnAssignment[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const load = useCallback(async () => {
    setState("loading");
    setLoadError(null);
    try {
      setItems(await assignments.listOwnAssignments());
      setState("ready");
    } catch (caught) {
      setItems([]);
      setLoadError(safeErrorMessage(caught, text));
      setState("error");
    }
  }, [assignments, text]);

  useEffect(() => { void load(); }, [load, retryKey]);

  if (state === "loading") return <p role="status" aria-live="polite">{text.loading}</p>;
  if (state === "error") {
    return <div role="alert"><p>{loadError ?? text.unavailable}</p><button type="button" onClick={() => setRetryKey((value) => value + 1)}>{text.retry}</button></div>;
  }

  return (
    <section aria-labelledby="runtime-guide-own-assignments-heading">
      <h2 id="runtime-guide-own-assignments-heading">{text.guideHeading}</h2>
      <p role="note">{text.guideDisclosure}</p>
      {items.length === 0 ? <p>{text.emptyGuide}</p> : items.map((item) => {
        const requirementLabels = [...item.mobilityFlags, ...item.dietaryFlags].map((flag) => text.flags[flag]);
        return (
          <article key={item.assignmentId} aria-labelledby={`runtime-guide-own-${item.assignmentId}`}>
            <h3 id={`runtime-guide-own-${item.assignmentId}`}>{item.title}</h3>
            <dl>
              <div><dt>{text.schedule}</dt><dd>{formatSchedule(item, locale)}</dd></div>
              <div><dt>{text.meetingPoint}</dt><dd>{item.meetingPoint}</dd></div>
              <div><dt>{text.partySize}</dt><dd>{item.partySize}</dd></div>
              <div><dt>{text.tourLanguage}</dt><dd>{text.language[item.language]}</dd></div>
              <div><dt>{text.status}</dt><dd>{text.assignmentStatus[item.assignmentStatus]}</dd></div>
              <div><dt>{text.requirements}</dt><dd>{requirementLabels.length === 0 ? text.noRequirements : requirementLabels.join(", ")}</dd></div>
            </dl>
          </article>
        );
      })}
    </section>
  );
}
