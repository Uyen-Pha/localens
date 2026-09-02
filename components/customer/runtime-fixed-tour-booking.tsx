"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import {
  FixedTourRuntimeError,
  type FixedTourRuntimeErrorCode,
} from "@/lib/application/fixed-tour/contracts";
import type { SupabasePortalShell } from "@/lib/application/portal/supabase-shell";
import type { LiveDepartureAvailability } from "@/lib/domain/data/contracts";
import type { Locale } from "@/lib/i18n/config";
import { fixedTourRuntimeCopy } from "@/lib/i18n/fixed-tour-runtime";
import { signInPath } from "@/lib/navigation/safe-return-to";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type ReadyState = "loading" | "ready" | FixedTourRuntimeErrorCode;

function keyFor(locale: Locale, departureId: string, partySize: number): string {
  return `localens.fixed-tour.hold:${locale}:${departureId}:${partySize}`;
}

function idempotencyKey(locale: Locale, departureId: string, partySize: number): string {
  const storageKey = keyFor(locale, departureId, partySize);
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const generated = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `hold-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  window.sessionStorage.setItem(storageKey, generated);
  return generated;
}

export function RuntimeFixedTourBooking({
  locale,
  composition,
  departureId,
  initialPartySize,
  returnTo,
  navigate,
}: {
  locale: Locale;
  composition: SupabasePortalShell;
  departureId: string;
  initialPartySize: string;
  returnTo?: string | null;
  navigate: (path: string) => void;
}) {
  const copy = fixedTourRuntimeCopy(locale);
  const [state, setState] = useState<ReadyState>("loading");
  const [departure, setDeparture] = useState<LiveDepartureAvailability | null>(null);
  const [partySize, setPartySize] = useState(initialPartySize);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const partyRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        await composition.initialized;
        if (!UUID_PATTERN.test(departureId)) {
          if (!disposed) setState("NOT_FOUND");
          return;
        }
        const session = await composition.session.getSession();
        if (session === null) {
          if (!disposed) setState("UNAUTHENTICATED");
          return;
        }
        if (session.role !== "customer") {
          if (!disposed) setState("FORBIDDEN");
          return;
        }
        const available = (await composition.fixedTour.listAvailability()).find((item) => item.id === departureId);
        if (!available) {
          if (!disposed) setState("NOT_FOUND");
          return;
        }
        if (available.status !== "scheduled" || available.remainingCapacity < 1) {
          if (!disposed) setState("SOLD_OUT");
          return;
        }
        if (!disposed) {
          setDeparture(available);
          setState("ready");
        }
      } catch {
        if (!disposed) setState("SERVICE_UNAVAILABLE");
      }
    })();
    return () => { disposed = true; };
  }, [composition, departureId]);

  useEffect(() => {
    if (state !== "ready" && state !== "loading") alertRef.current?.focus();
  }, [state]);

  function message(code: Exclude<ReadyState, "loading" | "ready">): string {
    if (code === "UNAUTHENTICATED") return copy.signInRequired;
    if (code === "FORBIDDEN") return copy.accessDenied;
    if (code === "IDEMPOTENCY_CONFLICT") return copy.idempotencyConflict;
    if (code === "SOLD_OUT") return copy.soldOut;
    if (code === "NOT_FOUND" || code === "INVALID_INPUT") return copy.notFound;
    return copy.serviceUnavailable;
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submittingRef.current || departure === null) return;
    const size = Number(partySize);
    if (!Number.isSafeInteger(size) || size < 1 || size > 100) {
      setState("INVALID_INPUT");
      queueMicrotask(() => partyRef.current?.focus());
      return;
    }
    if (size > departure.remainingCapacity) {
      setState("SOLD_OUT");
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const result = await composition.fixedTour.beginBooking({
        departureId,
        partySize: size,
        locale,
        idempotencyKey: idempotencyKey(locale, departureId, size),
      });
      navigate(`/${locale}/account/?hold=${result.state}`);
    } catch (error) {
      setState(error instanceof FixedTourRuntimeError ? error.code : "SERVICE_UNAVAILABLE");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (state === "loading") return <p role="status" aria-live="polite">{copy.loading}</p>;
  if (state !== "ready") {
    const invalidParty = state === "INVALID_INPUT";
    return (
      <section aria-labelledby="runtime-booking-heading">
        <h1 id="runtime-booking-heading">{copy.bookingHeading}</h1>
        <p ref={alertRef} tabIndex={-1} role="alert">{invalidParty ? copy.invalidPartySize : message(state)}</p>
        {invalidParty && departure ? (
          <form onSubmit={(event) => void submit(event)}>
            <label>{copy.partySize}<input ref={partyRef} type="number" min={1} max={100} value={partySize} onChange={(event) => { setPartySize(event.target.value); setState("ready"); }} /></label>
            <p>{copy.partySizeHint}</p>
            <button type="submit">{copy.hold}</button>
          </form>
        ) : state === "UNAUTHENTICATED" ? (
          <Link href={signInPath(locale, returnTo)}>{copy.signInRequired}</Link>
        ) : <Link href={`/${locale}/tours/`}>{copy.catalogHeading}</Link>}
      </section>
    );
  }

  return (
    <section aria-labelledby="runtime-booking-heading">
      <h1 id="runtime-booking-heading">{copy.bookingHeading}</h1>
      <p>{copy.bookingIntro}</p>
      <p role="note">{copy.pendingPayment}</p>
      <form noValidate onSubmit={(event) => void submit(event)}>
        <label>
          {copy.partySize}
          <input ref={partyRef} type="number" min={1} max={100} required value={partySize} disabled={submitting} onChange={(event) => setPartySize(event.target.value)} />
        </label>
        <p>{copy.partySizeHint}</p>
        <button type="submit" disabled={submitting}>{submitting ? copy.holding : copy.hold}</button>
      </form>
    </section>
  );
}
