"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import {
  PortalError,
  type CustomerAccount,
  type CustomerBookingView,
  type DemoPortalIdentity,
} from "@/lib/application/portal/contracts";
import type { CustomerCustomRequest } from "@/lib/domain/data/contracts";
import type { DemoPortalComposition } from "@/lib/application/portal/composition";

import { PortalNav, PortalNotice } from "@/components/portals/portal-chrome";
import {
  BookingCancellationDialog,
  type BookingCancellationReasonValue,
} from "@/components/customer/booking-cancellation-dialog";
import { portalCopy } from "@/components/portals/portal-copy";
import {
  bookingCancellationCopy,
  cancellationReasonLabel,
} from "@/lib/i18n/booking-cancellation";
import styles from "@/components/portals/portal.module.css";

export interface CustomerPortalData {
  account: CustomerAccount;
  bookings: CustomerBookingView[];
  requests: CustomerCustomRequest[];
}

function titleForBooking(booking: CustomerBookingView, locale: "en" | "vi"): string {
  return locale === "vi" ? booking.titleVi : booking.titleEn;
}

function formatDate(value: string, locale: "en" | "vi"): string {
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
    dateStyle: "medium",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function formatMoney(value: string, locale: "en" | "vi"): string {
  const amount = Number(value);
  return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

async function loadCustomerData(composition: DemoPortalComposition): Promise<CustomerPortalData> {
  const [account, bookings, requests] = await Promise.all([
    composition.customer.account.getAccount(),
    composition.customer.account.listCustomerBookings(),
    composition.customer.account.listCustomRequests(),
  ]);
  return { account, bookings, requests };
}

function statusClass(status: string): string {
  if (status === "completed" || status === "approved" || status === "paid") return styles.status;
  if (status === "cancelled" || status === "rejected") return `${styles.status} ${styles.statusCoral}`;
  return `${styles.status} ${styles.statusNeutral}`;
}

function cancellationKey(bookingId: string): string {
  const storageKey = `localens.booking-cancellation:${bookingId}`;
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const suffix = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const generated = `booking-cancellation-${suffix}`;
  window.sessionStorage.setItem(storageKey, generated);
  return generated;
}

export function CustomerPortal({
  locale,
  composition,
  session,
  onSignOut,
}: {
  locale: "en" | "vi";
  composition: DemoPortalComposition;
  session: DemoPortalIdentity;
  onSignOut: () => void;
}) {
  const copy = portalCopy(locale);
  const cancellationCopy = bookingCancellationCopy(locale);
  const [data, setData] = useState<CustomerPortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [profileState, setProfileState] = useState({
    displayName: "",
    nationality: "",
    email: "",
    phone: "",
    language: locale,
  });
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState(false);
  const [openCancellation, setOpenCancellation] = useState<string | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [submittedReviewId, setSubmittedReviewId] = useState<string | null>(null);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, { rating: string; text: string }>>({});
  const cancellationStatusRef = useRef<HTMLParagraphElement>(null);
  const cancellationTriggerRef = useRef<HTMLElement | null>(null);

  async function refresh(): Promise<void> {
    setLoading(true);
    setError(false);
    try {
      const nextData = await loadCustomerData(composition);
      setData(nextData);
      setProfileState({
        displayName: nextData.account.displayName,
        nationality: nextData.account.nationality,
        email: nextData.account.email,
        phone: nextData.account.phone ?? "",
        language: nextData.account.language,
      });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // The composition is stable for the lifetime of this role surface.
  }, [composition]);

  useEffect(() => {
    if (actionMessage === cancellationCopy.success) cancellationStatusRef.current?.focus();
  }, [actionMessage, cancellationCopy.success]);

  async function saveProfile(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setProfileBusy(true);
    setProfileMessage(null);
    setProfileError(false);
    try {
      const account = await composition.customer.account.updateAccount({
        displayName: profileState.displayName,
        nationality: profileState.nationality,
        email: profileState.email,
        phone: profileState.phone || null,
        language: profileState.language,
      });
      setData((current) => current === null ? current : { ...current, account });
      setProfileMessage(copy.profileSaved);
    } catch {
      setProfileError(true);
      setProfileMessage(copy.profileError);
    } finally {
      setProfileBusy(false);
    }
  }

  async function sendCancellation(bookingId: string, reason: BookingCancellationReasonValue): Promise<void> {
    if (actionKey !== null) return;
    setActionKey(`cancel:${bookingId}`);
    setActionError(null);
    setActionMessage(null);
    try {
      await composition.customer.cancellations.cancelBooking({
        bookingId,
        reasonCode: reason.reasonCode,
        otherReason: reason.otherReason,
        idempotencyKey: cancellationKey(bookingId),
      });
      await refresh();
      setOpenCancellation(null);
      setActionMessage(cancellationCopy.success);
    } catch (caught) {
      const message = caught instanceof PortalError && (caught.code === "CONFLICT" || caught.code === "NOT_FOUND")
        ? cancellationCopy.conflict
        : caught instanceof PortalError && (caught.code === "FORBIDDEN" || caught.code === "UNAUTHENTICATED")
          ? cancellationCopy.denied
          : caught instanceof PortalError && caught.code === "INVALID_INPUT"
            ? cancellationCopy.invalid
            : cancellationCopy.unavailable;
      setActionError(message);
      if (caught instanceof PortalError && (caught.code === "CONFLICT" || caught.code === "NOT_FOUND")) {
        await refresh();
        setOpenCancellation(null);
        setActionError(message);
      }
    } finally {
      setActionKey(null);
    }
  }

  function updateReviewDraft(bookingId: string, field: "rating" | "text", value: string): void {
    setReviewDrafts((current) => ({
      ...current,
      [bookingId]: {
        rating: current[bookingId]?.rating ?? "5",
        text: current[bookingId]?.text ?? "",
        [field]: value,
      },
    }));
  }

  async function submitReview(bookingId: string): Promise<void> {
    const draft = reviewDrafts[bookingId] ?? { rating: "5", text: "" };
    setActionKey(`review:${bookingId}`);
    setActionError(null);
    setActionMessage(null);
    try {
      await composition.customer.reviews.submitTourReview({
        bookingId,
        rating: Number(draft.rating),
        text: draft.text,
      });
      await refresh();
      setSubmittedReviewId(bookingId);
      setActionMessage(copy.reviewSubmitted);
    } catch {
      setActionError(copy.reviewUnavailable);
    } finally {
      setActionKey(null);
    }
  }

  return (
    <div className={styles.page} data-portal-role="customer">
      <div className={styles.surface}>
        <PortalNav locale={locale} session={session} onSignOut={onSignOut} />
        <PortalNotice locale={locale} />
        <header className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>{copy.eyebrow}</p>
            <h1>{copy.customerHeading}</h1>
            <p>{copy.customerIntro}</p>
          </div>
          <div className={styles.heroSide}>
            <strong>{copy.signedInAs}</strong>
            <span>{session.displayName}</span>
            <span className={styles.hint}>{session.email}</span>
          </div>
        </header>

        {loading && data === null ? (
          <p className={styles.srStatus} role="status" aria-live="polite">{copy.loadingData}</p>
        ) : null}
        {error ? (
          <div className={styles.error} role="alert">
            <p>{copy.errorMessage}</p>
            <button className={styles.button} type="button" onClick={() => void refresh()}>{copy.retry}</button>
          </div>
        ) : null}

        {data ? (
          <div className={styles.grid}>
            <section className={`${styles.card} ${styles.span4}`} aria-labelledby="customer-profile-heading">
              <div className={styles.sectionHeader}>
                <h2 id="customer-profile-heading">{copy.profileHeading}</h2>
                <span className={styles.status}>{copy.demoOnly}</span>
              </div>
              <p className={styles.sectionIntro}>{copy.profileIntro}</p>
              <form onSubmit={(event) => void saveProfile(event)}>
                <div className={styles.fieldGrid}>
                  <label className={`${styles.field} ${styles.fieldFull}`}>
                    <span>{copy.fullName}</span>
                    <input
                      value={profileState.displayName}
                      onChange={(event) => setProfileState((current) => ({ ...current, displayName: event.target.value }))}
                      autoComplete="name"
                      required
                    />
                  </label>
                  <label className={styles.field}>
                    <span>{copy.nationality}</span>
                    <input
                      value={profileState.nationality}
                      onChange={(event) => setProfileState((current) => ({ ...current, nationality: event.target.value }))}
                      autoComplete="country-name"
                      required
                    />
                  </label>
                  <label className={styles.field}>
                    <span>{copy.phone}</span>
                    <input
                      value={profileState.phone}
                      onChange={(event) => setProfileState((current) => ({ ...current, phone: event.target.value }))}
                      autoComplete="tel"
                    />
                  </label>
                  <label className={`${styles.field} ${styles.fieldFull}`}>
                    <span>{copy.email}</span>
                    <input
                      type="email"
                      value={profileState.email}
                      onChange={(event) => setProfileState((current) => ({ ...current, email: event.target.value }))}
                      autoComplete="email"
                      required
                    />
                  </label>
                  <label className={`${styles.field} ${styles.fieldFull}`}>
                    <span>{copy.language}</span>
                    <select
                      value={profileState.language}
                      onChange={(event) => setProfileState((current) => ({ ...current, language: event.target.value as "en" | "vi" }))}
                    >
                      <option value="en">{copy.english}</option>
                      <option value="vi">{copy.vietnamese}</option>
                    </select>
                  </label>
                </div>
                {profileMessage ? <p className={profileError ? styles.error : styles.success} role={profileError ? "alert" : "status"}>{profileMessage}</p> : null}
                <div className={styles.actions}>
                  <button className={styles.button} type="submit" disabled={profileBusy}>
                    {profileBusy ? copy.saving : copy.saveProfile}
                  </button>
                </div>
              </form>
            </section>

            <section className={`${styles.card} ${styles.span8}`} aria-labelledby="customer-bookings-heading">
              <div className={styles.sectionHeader}>
                <h2 id="customer-bookings-heading">{copy.bookingsHeading}</h2>
                <span className={styles.eyebrow}>{data.bookings.length}</span>
              </div>
              <p className={styles.sectionIntro}>{copy.bookingsIntro}</p>
              {actionMessage ? <p ref={cancellationStatusRef} tabIndex={-1} className={styles.success} role="status">{actionMessage}</p> : null}
              {actionError ? <p className={styles.error} role="alert">{actionError}</p> : null}
              {data.bookings.length === 0 ? (
                <p className={styles.empty}>{copy.noBookings}</p>
              ) : (
                <div className={styles.list}>
                  {data.bookings.map((booking) => {
                    const title = titleForBooking(booking, locale);
                    const cancellation = booking.cancellation;
                    const reviewDraft = reviewDrafts[booking.id] ?? { rating: "5", text: "" };
                    const canCancel = booking.status === "pending_payment" && cancellation === null;
                    return (
                      <article className={styles.bookingCard} key={booking.id} aria-labelledby={`customer-booking-${booking.id}`}>
                        <div className={styles.cardTitleLine}>
                          <div>
                            <h3 id={`customer-booking-${booking.id}`}>{title}</h3>
                            <p>{booking.sourceKind === "departure" ? copy.fixedDeparturesOnly : copy.requestsHeading}</p>
                          </div>
                          <span className={statusClass(booking.status)}>{copy.statusLabels[booking.status]}</span>
                        </div>
                        <dl className={styles.facts}>
                          <div><dt>{copy.bookingStatus}</dt><dd>{copy.statusLabels[booking.status]}</dd></div>
                          <div><dt>{copy.paymentStatus}</dt><dd>{booking.paymentStatus === null ? copy.paymentNotAvailable : copy.paymentStatusLabels[booking.paymentStatus]}</dd></div>
                          <div><dt>{copy.partySize}</dt><dd>{booking.partySize}</dd></div>
                          <div><dt>{copy.meetingPoint}</dt><dd>{booking.meetingPoint}</dd></div>
                          <div><dt>{copy.created}</dt><dd>{formatDate(booking.createdAt, locale)}</dd></div>
                          <div><dt>{copy.total}</dt><dd>{formatMoney(booking.checkoutAmountMinor, locale)}</dd></div>
                        </dl>
                        <p className={styles.notice} role="note">{copy.simulatedPayment}</p>

                        {cancellation ? (
                          <section aria-labelledby={`customer-cancellation-${booking.id}`}>
                            <div className={styles.cardTitleLine}>
                              <h3 id={`customer-cancellation-${booking.id}`}>{cancellationCopy.cancelledStatus}</h3>
                              <span className={`${styles.status} ${styles.statusCoral}`}>{cancellationCopy.cancelledStatus}</span>
                            </div>
                            <dl className={styles.facts}>
                              <div><dt>{cancellationCopy.cancelledAt}</dt><dd>{formatDate(cancellation.cancelledAt, locale)}</dd></div>
                              <div><dt>{cancellationCopy.reason}</dt><dd>{cancellationReasonLabel(cancellation.reasonCode, locale)}</dd></div>
                              {cancellation.otherReason ? <div><dt>{cancellationCopy.otherLabel}</dt><dd>{cancellation.otherReason}</dd></div> : null}
                            </dl>
                          </section>
                        ) : canCancel ? (
                          <button
                            className={`${styles.button} ${styles.buttonSecondary}`}
                            type="button"
                            disabled={actionKey !== null}
                            onClick={(event) => {
                              cancellationTriggerRef.current = event.currentTarget;
                              setActionError(null);
                              setOpenCancellation(booking.id);
                            }}
                          >
                            {cancellationCopy.trigger}
                          </button>
                        ) : null}
                        {openCancellation === booking.id ? (
                          <BookingCancellationDialog
                            locale={locale}
                            bookingTitle={title}
                            submitting={actionKey === `cancel:${booking.id}`}
                            error={actionError}
                            returnFocus={cancellationTriggerRef.current}
                            onClose={() => setOpenCancellation(null)}
                            onConfirm={(reason) => void sendCancellation(booking.id, reason)}
                          />
                        ) : null}

                        <section aria-labelledby={`customer-review-${booking.id}`}>
                          <div className={styles.cardTitleLine}>
                            <h3 id={`customer-review-${booking.id}`}>{copy.reviewHeading}</h3>
                            {booking.review ? <span className={styles.status}>{booking.review.rating}/5</span> : null}
                          </div>
                          {booking.review ? (
                            <p className={styles.success} role="status">
                              {submittedReviewId === booking.id ? copy.reviewSubmitted : copy.reviewExists}
                            </p>
                          ) : booking.status === "completed" ? (
                            <form className={styles.inlineForm} onSubmit={(event) => { event.preventDefault(); void submitReview(booking.id); }}>
                              <p className={styles.hint}>{copy.reviewAvailable}</p>
                              <label>
                                <span>{copy.reviewRating}</span>
                                <select
                                  aria-label={copy.reviewRating}
                                  value={reviewDraft.rating}
                                  onChange={(event) => updateReviewDraft(booking.id, "rating", event.target.value)}
                                >
                                  <option value="5">5 / 5</option>
                                  <option value="4">4 / 5</option>
                                  <option value="3">3 / 5</option>
                                  <option value="2">2 / 5</option>
                                  <option value="1">1 / 5</option>
                                </select>
                              </label>
                              <label>
                                <span>{copy.reviewText}</span>
                                <textarea
                                  aria-label={copy.reviewText}
                                  value={reviewDraft.text}
                                  onChange={(event) => updateReviewDraft(booking.id, "text", event.target.value)}
                                  placeholder={copy.reviewTextHint}
                                  required
                                />
                              </label>
                              <button className={styles.button} type="submit" disabled={actionKey === `review:${booking.id}`}>
                                {actionKey === `review:${booking.id}` ? copy.saving : copy.submitReview}
                              </button>
                            </form>
                          ) : <p className={styles.empty}>{copy.reviewUnavailable}</p>}
                        </section>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className={`${styles.card} ${styles.span6}`} aria-labelledby="customer-requests-heading">
              <div className={styles.sectionHeader}>
                <h2 id="customer-requests-heading">{copy.requestsHeading}</h2>
                <span className={styles.eyebrow}>{data.requests.length}</span>
              </div>
              <p className={styles.sectionIntro}>{copy.requestsIntro}</p>
              {data.requests.length === 0 ? (
                <p className={styles.empty}>{copy.noRequests}</p>
              ) : (
                <ul className={styles.list}>
                  {data.requests.map((request) => (
                    <li className={styles.requestCard} key={request.id}>
                      <div className={styles.cardTitleLine}>
                        <h3>{request.id}</h3>
                        <span className={statusClass(request.status)}>{copy.requestStatusLabels[request.status]}</span>
                      </div>
                      <dl className={styles.facts}>
                        <div><dt>{copy.requestStatus}</dt><dd>{copy.requestStatusLabels[request.status]}</dd></div>
                        <div><dt>{copy.revision}</dt><dd>{request.revisionNo}</dd></div>
                        <div><dt>{copy.updated}</dt><dd>{formatDate(request.updatedAt, locale)}</dd></div>
                      </dl>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
