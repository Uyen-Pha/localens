"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import type { CancellationReasonCode } from "@/lib/application/portal/contracts";
import type { Locale } from "@/lib/i18n/config";
import {
  bookingCancellationCopy,
  CANCELLATION_REASON_OPTIONS,
} from "@/lib/i18n/booking-cancellation";

import styles from "@/components/customer/booking-cancellation-dialog.module.css";

const FOCUSABLE = "button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export interface BookingCancellationReasonValue {
  reasonCode: CancellationReasonCode | null;
  otherReason: string | null;
}

export function BookingCancellationDialog({
  locale,
  bookingTitle,
  submitting,
  error,
  returnFocus,
  onClose,
  onConfirm,
}: {
  locale: Locale;
  bookingTitle: string;
  submitting: boolean;
  error: string | null;
  returnFocus: HTMLElement | null;
  onClose: () => void;
  onConfirm: (value: BookingCancellationReasonValue) => void;
}) {
  const copy = bookingCancellationCopy(locale);
  const [reasonCode, setReasonCode] = useState<CancellationReasonCode | "">("");
  const [otherReason, setOtherReason] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const trimmedOther = otherReason.trim();
  const otherValid = reasonCode !== "other" || (trimmedOther.length >= 3 && trimmedOther.length <= 500);

  useEffect(() => {
    const trigger = returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const overlay = overlayRef.current;
    const siblings = Array.from(document.body.children).filter((element) => element !== overlay);
    const priorOverflow = document.body.style.overflow;
    const prior = siblings.map((element) => ({
      element,
      inert: element.hasAttribute("inert"),
      ariaHidden: element.getAttribute("aria-hidden"),
    }));
    document.body.style.overflow = "hidden";
    for (const element of siblings) {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
    }
    backRef.current?.focus();
    return () => {
      document.body.style.overflow = priorOverflow;
      for (const entry of prior) {
        if (!entry.inert) entry.element.removeAttribute("inert");
        if (entry.ariaHidden === null) entry.element.removeAttribute("aria-hidden");
        else entry.element.setAttribute("aria-hidden", entry.ariaHidden);
      }
      if (trigger?.isConnected) trigger.focus();
    };
  }, [returnFocus]);

  function keyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape" && !submitting) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(overlayRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const dialog = (
    <div className={styles.overlay} ref={overlayRef} onKeyDown={keyDown}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <button className={styles.close} type="button" disabled={submitting} onClick={onClose}>{copy.close}</button>
        <h2 id={titleId}>{copy.title}</h2>
        <p className={styles.description} id={descriptionId}>{copy.description}</p>
        <div className={styles.booking}>
          <strong>{bookingTitle}</strong>
          <span>{copy.statusPrefix}: <em>{copy.pendingStatus}</em></span>
        </div>
        <label className={styles.field}>
          <span>{copy.reasonLabel}</span>
          <select
            aria-label={copy.reasonLabel}
            value={reasonCode}
            disabled={submitting}
            onChange={(event) => {
              const next = event.target.value as CancellationReasonCode | "";
              setReasonCode(next);
              if (next !== "other") setOtherReason("");
            }}
          >
            <option value="">{copy.reasonPlaceholder}</option>
            {CANCELLATION_REASON_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>{option.label[locale]}</option>
            ))}
          </select>
        </label>
        {reasonCode === "other" ? (
          <label className={styles.field}>
            <span>{copy.otherLabel}</span>
            <textarea
              aria-label={copy.otherLabel}
              value={otherReason}
              minLength={3}
              maxLength={500}
              required
              disabled={submitting}
              onChange={(event) => setOtherReason(event.target.value)}
            />
            <small>{copy.otherHint}</small>
          </label>
        ) : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <div className={styles.actions}>
          <button ref={backRef} type="button" disabled={submitting} onClick={onClose}>{copy.back}</button>
          <button
            className={styles.confirm}
            type="button"
            disabled={submitting || !otherValid}
            onClick={() => onConfirm({
              reasonCode: reasonCode === "" ? null : reasonCode,
              otherReason: reasonCode === "other" ? trimmedOther : null,
            })}
          >
            {submitting ? copy.confirming : copy.confirm}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
