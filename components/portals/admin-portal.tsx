"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import type { DemoPortalComposition } from "@/lib/application/portal/composition";
import type {
  AdminBookingProjection,
  AdminDepartureProjection,
  AdminFixedTourProjection,
  AdminLocationProjection,
  AdminPersonalizedRequestProjection,
  AdminReportProjection,
  AdminRequestDecision,
  AdminUserProjection,
  CancellationDecision,
  CancellationRequest,
  DemoPortalIdentity,
} from "@/lib/application/portal/contracts";

import { portalCopy, roleLabel } from "@/components/portals/portal-copy";
import { PortalNav, PortalNotice } from "@/components/portals/portal-chrome";
import styles from "@/components/portals/portal.module.css";

interface AdminPortalData {
  users: AdminUserProjection[];
  locations: AdminLocationProjection[];
  fixedTours: AdminFixedTourProjection[];
  departures: AdminDepartureProjection[];
  requests: AdminPersonalizedRequestProjection[];
  bookings: AdminBookingProjection[];
  cancellations: CancellationRequest[];
  report: AdminReportProjection;
}

type Role = AdminUserProjection["role"];

function formatDate(value: string, locale: "en" | "vi"): string {
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
    dateStyle: "medium",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function formatDateTime(value: string, locale: "en" | "vi"): string {
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function statusClass(status: string): string {
  if (["published", "scheduled", "completed", "confirmed", "approved", "paid", "assigned"].includes(status)) {
    return styles.status;
  }
  if (["cancelled", "rejected", "expired"].includes(status)) {
    return `${styles.status} ${styles.statusCoral}`;
  }
  return `${styles.status} ${styles.statusNeutral}`;
}

function titleForBooking(booking: AdminBookingProjection, locale: "en" | "vi"): string {
  return locale === "vi" ? booking.titleVi : booking.titleEn;
}

function titleForTour(tour: AdminFixedTourProjection): string {
  return tour.title;
}

async function loadAdminData(composition: DemoPortalComposition): Promise<AdminPortalData> {
  const [users, locations, fixedTours, departures, requests, bookings, cancellations, report] = await Promise.all([
    composition.admin.users.listUsers(),
    composition.admin.catalog.listLocations(),
    composition.admin.catalog.listFixedTours(),
    composition.admin.catalog.listDepartures(),
    composition.admin.personalizedRequests.listPersonalizedRequests(),
    composition.admin.bookings.listAdminBookings(),
    composition.admin.cancellations.listCancellationRequests(),
    composition.admin.reporting.getReport(),
  ]);

  return { users, locations, fixedTours, departures, requests, bookings, cancellations, report };
}

export function AdminPortal({
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
  const [data, setData] = useState<AdminPortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, Role>>({});
  const [requestDecisions, setRequestDecisions] = useState<Record<string, AdminRequestDecision>>({});
  const [requestNotes, setRequestNotes] = useState<Record<string, string>>({});
  const [cancellationDecisions, setCancellationDecisions] = useState<Record<string, CancellationDecision>>({});
  const [cancellationNotes, setCancellationNotes] = useState<Record<string, string>>({});
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, string>>({});

  async function refresh(): Promise<void> {
    setLoading(true);
    setError(false);
    try {
      setData(await loadAdminData(composition));
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

  async function saveRole(event: FormEvent<HTMLFormElement>, user: AdminUserProjection): Promise<void> {
    event.preventDefault();
    const role = roleDrafts[user.userId] ?? user.role;
    setActionKey(`role:${user.userId}`);
    setActionMessage(null);
    setActionError(null);
    try {
      await composition.admin.users.updateUserRole({ userId: user.userId, role });
      await refresh();
      setActionMessage(copy.roleSaved);
    } catch {
      setActionError(copy.roleError);
    } finally {
      setActionKey(null);
    }
  }

  async function saveRequestDecision(event: FormEvent<HTMLFormElement>, request: AdminPersonalizedRequestProjection): Promise<void> {
    event.preventDefault();
    const decision = requestDecisions[request.id] ?? "approved";
    const note = requestNotes[request.id]?.trim() || null;
    setActionKey(`request:${request.id}`);
    setActionMessage(null);
    setActionError(null);
    try {
      await composition.admin.personalizedRequests.reviewPersonalizedRequest({
        requestId: request.id,
        decision,
        note,
      });
      await refresh();
      setActionMessage(copy.decisionSaved);
    } catch {
      setActionError(copy.decisionError);
    } finally {
      setActionKey(null);
    }
  }

  async function saveCancellationDecision(
    event: FormEvent<HTMLFormElement>,
    request: CancellationRequest,
  ): Promise<void> {
    event.preventDefault();
    const decision = cancellationDecisions[request.id] ?? "approved";
    const note = cancellationNotes[request.id]?.trim() || null;
    setActionKey(`cancellation:${request.id}`);
    setActionMessage(null);
    setActionError(null);
    try {
      await composition.admin.cancellations.decideCancellation({
        requestId: request.id,
        decision,
        note,
      });
      await refresh();
      setActionMessage(copy.cancellationDecisionSaved);
    } catch {
      setActionError(copy.cancellationDecisionError);
    } finally {
      setActionKey(null);
    }
  }

  async function saveAssignment(
    event: FormEvent<HTMLFormElement>,
    booking: AdminBookingProjection,
    guideUserId: string,
  ): Promise<void> {
    event.preventDefault();
    if (!guideUserId) return;
    setActionKey(`assignment:${booking.id}`);
    setActionMessage(null);
    setActionError(null);
    try {
      await composition.admin.assignments.assignGuideToFixedDeparture({ bookingId: booking.id, guideUserId });
      await refresh();
      setActionMessage(copy.guideAssignmentSaved);
    } catch {
      setActionError(copy.guideAssignmentError);
    } finally {
      setActionKey(null);
    }
  }

  const guides = data?.users.filter((user) => user.role === "guide") ?? [];
  const departureById = new Map((data?.departures ?? []).map((departure) => [departure.id, departure]));
  const tourByVersionId = new Map((data?.fixedTours ?? []).map((tour) => [tour.versionId, tour]));
  const cancellationByBookingId = new Map((data?.cancellations ?? []).map((request) => [request.bookingId, request]));
  const assignableBookings = (data?.bookings ?? []).filter(
    (booking) => booking.status === "confirmed" && booking.sourceKind === "departure" && departureById.get(booking.sourceId)?.status === "scheduled",
  );

  return (
    <div className={styles.page} data-portal-role="admin">
      <div className={styles.surface}>
        <PortalNav locale={locale} session={session} onSignOut={onSignOut} />
        <PortalNotice locale={locale} />
        <header className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>{copy.overview}</p>
            <h1>{copy.adminPortal}</h1>
            <p>{copy.reportIntro}</p>
          </div>
          <div className={styles.heroSide}>
            <strong>{copy.signedInAs}</strong>
            <span>{session.displayName}</span>
            <span className={styles.hint}>{roleLabel(locale, session.role)}</span>
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
        {actionMessage ? <p className={styles.success} role="status">{actionMessage}</p> : null}
        {actionError ? <p className={styles.error} role="alert">{actionError}</p> : null}

        {data ? (
          <div className={styles.grid}>
            <section className={`${styles.card} ${styles.span12}`} aria-labelledby="admin-users-heading">
              <div className={styles.sectionHeader}>
                <h2 id="admin-users-heading">{copy.usersHeading}</h2>
                <span className={styles.status}>{copy.demoOnly}</span>
              </div>
              <p className={styles.sectionIntro}>{copy.usersIntro}</p>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <caption className={styles.srStatus}>{copy.usersHeading}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{copy.fullName}</th>
                      <th scope="col">{copy.role}</th>
                      <th scope="col">{copy.language}</th>
                      <th scope="col">{copy.active}</th>
                      <th scope="col">{copy.saveRole}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((user) => (
                      <tr key={user.userId}>
                        <td>
                          <strong>{user.displayName}</strong>
                          <br />
                          <span className={styles.hint}>{user.email}</span>
                        </td>
                        <td>
                          <form id={`admin-role-form-${user.userId}`} onSubmit={(event) => void saveRole(event, user)}>
                            <label>
                              <span className={styles.srStatus}>{copy.role}</span>
                              <select
                                aria-label={`${copy.role}: ${user.displayName}`}
                                value={roleDrafts[user.userId] ?? user.role}
                                onChange={(event) => setRoleDrafts((current) => ({ ...current, [user.userId]: event.target.value as Role }))}
                              >
                                <option value="customer">{copy.customer}</option>
                                <option value="guide">{copy.guide}</option>
                                <option value="admin">{copy.admin}</option>
                              </select>
                            </label>
                          </form>
                        </td>
                        <td>{user.language === "vi" ? copy.vietnamese : copy.english}</td>
                        <td><span className={styles.status}>{user.active ? copy.active : copy.rejected}</span></td>
                        <td>
                          <button
                            className={styles.tableAction}
                            form={`admin-role-form-${user.userId}`}
                            type="submit"
                            disabled={actionKey === `role:${user.userId}`}
                          >
                            {actionKey === `role:${user.userId}` ? copy.saving : copy.saveRole}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={`${styles.card} ${styles.span6}`} aria-labelledby="admin-locations-heading">
              <div className={styles.sectionHeader}>
                <h2 id="admin-locations-heading">{copy.locationsHeading}</h2>
                <span className={styles.eyebrow}>{data.locations.length}</span>
              </div>
              <p className={styles.sectionIntro}>{copy.locationsIntro}</p>
              {data.locations.length === 0 ? (
                <p className={styles.empty}>{copy.noLocations}</p>
              ) : (
                <ul className={styles.list}>
                  {data.locations.map((location) => (
                    <li className={styles.requestCard} key={location.id}>
                      <div className={styles.cardTitleLine}>
                        <h3>{location.title}</h3>
                        <span className={statusClass(location.status)}>{copy.placeStatusLabels[location.status]}</span>
                      </div>
                      <p className={styles.hint}>{location.slug} · {location.locale.toUpperCase()}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={`${styles.card} ${styles.span6}`} aria-labelledby="admin-catalog-heading">
              <div className={styles.sectionHeader}>
                <h2 id="admin-catalog-heading">{copy.fixedToursHeading}</h2>
                <span className={styles.eyebrow}>{data.fixedTours.length}</span>
              </div>
              <p className={styles.sectionIntro}>{copy.fixedToursIntro}</p>
              {data.fixedTours.length === 0 ? <p className={styles.empty}>{copy.noTours}</p> : null}
              <ul className={styles.list}>
                {data.fixedTours.map((tour) => (
                  <li className={styles.requestCard} key={tour.id}>
                    <div className={styles.cardTitleLine}>
                      <h3>{titleForTour(tour)}</h3>
                      <span className={statusClass(tour.status)}>{copy.tourStatusLabels[tour.status]}</span>
                    </div>
                    <p className={styles.hint}>{tour.slug} · {tour.versionId}</p>
                  </li>
                ))}
              </ul>
              {data.departures.length === 0 ? <p className={styles.empty}>{copy.noDepartures}</p> : null}
              {data.departures.length > 0 ? (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <caption className={styles.srStatus}>{copy.fixedToursHeading}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{copy.date}</th>
                        <th scope="col">{copy.fixedToursHeading}</th>
                        <th scope="col">{copy.assignmentStatus}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.departures.map((departure) => (
                        <tr key={departure.id}>
                          <td>{formatDate(departure.date, locale)}</td>
                          <td>{tourByVersionId.get(departure.tourVersionId)?.title ?? departure.tourVersionId}</td>
                          <td><span className={statusClass(departure.status)}>{copy.departureStatusLabels[departure.status]}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>

            <section className={`${styles.card} ${styles.span6}`} aria-labelledby="admin-personalized-heading">
              <div className={styles.sectionHeader}>
                <h2 id="admin-personalized-heading">{copy.personalizedHeading}</h2>
                <span className={styles.status}>{copy.demoOnly}</span>
              </div>
              <p className={styles.sectionIntro}>{copy.personalizedIntro}</p>
              {data.requests.length === 0 ? (
                <p className={styles.empty}>{copy.noPersonalizedRequests}</p>
              ) : (
                <ul className={styles.list}>
                  {data.requests.map((request) => (
                    <li className={styles.decisionCard} key={request.id}>
                      <div className={styles.cardTitleLine}>
                        <div>
                          <h3>{request.id}</h3>
                          <p>{request.planId}</p>
                        </div>
                        <span className={statusClass(request.status)}>{copy.requestStatusLabels[request.status]}</span>
                      </div>
                      <dl className={styles.facts}>
                        <div><dt>{copy.requestStatus}</dt><dd>{copy.requestStatusLabels[request.status]}</dd></div>
                        <div><dt>{copy.revision}</dt><dd>{request.revisionNo}</dd></div>
                        <div><dt>{copy.updated}</dt><dd>{formatDate(request.updatedAt, locale)}</dd></div>
                      </dl>
                      {request.status === "pending_review" || request.status === "changes_requested" ? (
                        <form className={styles.inlineForm} onSubmit={(event) => void saveRequestDecision(event, request)}>
                          <label>
                            <span>{copy.decision}</span>
                            <select
                              aria-label={`${copy.decision}: ${request.id}`}
                              value={requestDecisions[request.id] ?? "approved"}
                              onChange={(event) => setRequestDecisions((current) => ({ ...current, [request.id]: event.target.value as AdminRequestDecision }))}
                            >
                              <option value="approved">{copy.approved}</option>
                              <option value="changes_requested">{copy.changesRequested}</option>
                              <option value="rejected">{copy.rejected}</option>
                            </select>
                          </label>
                          <label>
                            <span>{copy.decisionNote}</span>
                            <textarea
                              aria-label={`${copy.decisionNote}: ${request.id}`}
                              value={requestNotes[request.id] ?? ""}
                              onChange={(event) => setRequestNotes((current) => ({ ...current, [request.id]: event.target.value }))}
                            />
                          </label>
                          <button className={styles.button} type="submit" disabled={actionKey === `request:${request.id}`}>
                            {actionKey === `request:${request.id}` ? copy.saving : copy.saveDecision}
                          </button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={`${styles.card} ${styles.span6}`} aria-labelledby="admin-bookings-heading">
              <div className={styles.sectionHeader}>
                <h2 id="admin-bookings-heading">{copy.bookingsCancellationsHeading}</h2>
                <span className={styles.eyebrow}>{data.bookings.length}</span>
              </div>
              <p className={styles.sectionIntro}>{copy.bookingsCancellationsIntro}</p>
              {data.bookings.length === 0 ? (
                <p className={styles.empty}>{copy.noAdminBookings}</p>
              ) : (
                <ul className={styles.list}>
                  {data.bookings.map((booking) => {
                    const cancellation = cancellationByBookingId.get(booking.id);
                    return (
                      <li className={styles.bookingCard} key={booking.id}>
                        <div className={styles.cardTitleLine}>
                          <div>
                            <h3>{titleForBooking(booking, locale)}</h3>
                            <p>{booking.id} · {booking.ownerUserId}</p>
                          </div>
                          <span className={statusClass(booking.status)}>{copy.statusLabels[booking.status]}</span>
                        </div>
                        <dl className={styles.facts}>
                          <div><dt>{copy.bookingStatus}</dt><dd>{copy.statusLabels[booking.status]}</dd></div>
                          <div><dt>{copy.paymentStatus}</dt><dd>{booking.paymentStatus === null ? copy.paymentNotAvailable : copy.paymentStatusLabels[booking.paymentStatus]}</dd></div>
                          <div><dt>{copy.partySize}</dt><dd>{booking.partySize}</dd></div>
                          <div><dt>{copy.role}</dt><dd>{booking.assignedGuideUserId ?? copy.noneRecorded}</dd></div>
                        </dl>
                        {cancellation ? (
                          <div className={styles.notice}>
                            <p><strong>{copy.cancellationHeading}:</strong> {copy.cancellationStatusLabels[cancellation.status]}</p>
                            {cancellation.status === "pending" ? (
                              <form className={styles.inlineForm} onSubmit={(event) => void saveCancellationDecision(event, cancellation)}>
                                <label>
                                  <span>{copy.decision}</span>
                                  <select
                                    aria-label={`${copy.decision}: ${booking.id}`}
                                    value={cancellationDecisions[cancellation.id] ?? "approved"}
                                    onChange={(event) => setCancellationDecisions((current) => ({ ...current, [cancellation.id]: event.target.value as CancellationDecision }))}
                                  >
                                    <option value="approved">{copy.approved}</option>
                                    <option value="rejected">{copy.rejected}</option>
                                  </select>
                                </label>
                                <label>
                                  <span>{copy.cancellationNote}</span>
                                  <textarea
                                    aria-label={`${copy.cancellationNote}: ${booking.id}`}
                                    value={cancellationNotes[cancellation.id] ?? ""}
                                    onChange={(event) => setCancellationNotes((current) => ({ ...current, [cancellation.id]: event.target.value }))}
                                  />
                                </label>
                                <button className={styles.button} type="submit" disabled={actionKey === `cancellation:${cancellation.id}`}>
                                  {actionKey === `cancellation:${cancellation.id}` ? copy.saving : copy.saveDecision}
                                </button>
                              </form>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
              {data.cancellations.length === 0 ? <p className={styles.empty}>{copy.noCancellationRequests}</p> : null}
            </section>

            <section className={`${styles.card} ${styles.span8}`} aria-labelledby="admin-assignments-heading">
              <div className={styles.sectionHeader}>
                <h2 id="admin-assignments-heading">{copy.assignmentsHeading}</h2>
                <span className={styles.status}>{copy.fixedDeparturesOnly}</span>
              </div>
              <p className={styles.sectionIntro}>{copy.assignmentsIntro}</p>
              {assignableBookings.length === 0 ? (
                <p className={styles.empty}>{copy.noAssignableBookings}</p>
              ) : (
                <ul className={styles.list}>
                  {assignableBookings.map((booking) => {
                    const selectedGuide = assignmentDrafts[booking.id] ?? booking.assignedGuideUserId ?? guides[0]?.userId ?? "";
                    const departure = departureById.get(booking.sourceId);
                    return (
                      <li className={styles.assignmentCard} key={booking.id}>
                        <div className={styles.cardTitleLine}>
                          <div>
                            <h3>{titleForBooking(booking, locale)}</h3>
                            <p>{departure?.id ?? booking.sourceId} · {formatDate(departure?.date ?? booking.createdAt, locale)}</p>
                          </div>
                          <span className={styles.status}>{copy.assignmentStatus}</span>
                        </div>
                        <form className={styles.inlineForm} onSubmit={(event) => void saveAssignment(event, booking, selectedGuide)}>
                          <label>
                            <span>{copy.assignGuide}</span>
                            <select
                              aria-label={`${copy.assignGuide}: ${booking.id}`}
                              value={selectedGuide}
                              disabled={guides.length === 0}
                              onChange={(event) => setAssignmentDrafts((current) => ({ ...current, [booking.id]: event.target.value }))}
                            >
                              {guides.map((guide) => <option key={guide.userId} value={guide.userId}>{guide.displayName}</option>)}
                            </select>
                          </label>
                          <button className={styles.button} type="submit" disabled={!selectedGuide || actionKey === `assignment:${booking.id}`}>
                            {actionKey === `assignment:${booking.id}` ? copy.saving : copy.assignGuide}
                          </button>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className={`${styles.card} ${styles.span4}`} aria-labelledby="admin-assignment-gap-heading">
              <div className={styles.sectionHeader}>
                <h2 id="admin-assignment-gap-heading">{copy.demoOnly}</h2>
                          <span className={`${styles.status} ${styles.statusNeutral}`}>{copy.demoOnly}</span>
              </div>
              <p className={styles.sectionIntro}>{copy.personalizedAssignmentGap}</p>
            </section>

            <section className={`${styles.card} ${styles.span12}`} aria-labelledby="admin-reporting-heading">
              <div className={styles.sectionHeader}>
                <h2 id="admin-reporting-heading">{copy.reportHeading}</h2>
                <span className={styles.status}>{copy.demoOnly}</span>
              </div>
              <p className={styles.sectionIntro}>{copy.reportIntro}</p>
              <p className={styles.hint}>{copy.reportGenerated}: {formatDateTime(data.report.generatedAt, locale)}</p>
              <dl className={styles.metricGrid}>
                <div className={styles.metric}><dt>{copy.usersCount}</dt><dd>{data.report.userCount}</dd></div>
                <div className={styles.metric}><dt>{copy.customersCount}</dt><dd>{data.report.customerCount}</dd></div>
                <div className={styles.metric}><dt>{copy.guidesCount}</dt><dd>{data.report.guideCount}</dd></div>
                <div className={styles.metric}><dt>{copy.adminsCount}</dt><dd>{data.report.adminCount}</dd></div>
                <div className={styles.metric}><dt>{copy.bookingCount}</dt><dd>{data.report.bookingCount}</dd></div>
                <div className={styles.metric}><dt>{copy.confirmedCount}</dt><dd>{data.report.confirmedBookingCount}</dd></div>
                <div className={styles.metric}><dt>{copy.completedCount}</dt><dd>{data.report.completedBookingCount}</dd></div>
                <div className={styles.metric}><dt>{copy.paidCount}</dt><dd>{data.report.paidBookingCount}</dd></div>
                <div className={styles.metric}><dt>{copy.pendingCancellationCount}</dt><dd>{data.report.pendingCancellationCount}</dd></div>
              </dl>
              <p className={styles.notice} role="note">{copy.reportDisclosure}</p>
              <div className={styles.actions}>
                <Link className={styles.buttonSecondary + " " + styles.linkButton} href={`/${locale}/admin/catalog/`}>
                  {copy.catalogLink}
                </Link>
                <span className={styles.hint}>{copy.catalogIntro}</span>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
