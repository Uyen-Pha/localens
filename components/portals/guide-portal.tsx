"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import type {
  DemoPortalIdentity,
  GuideAssignedTour,
  GuideProfile,
} from "@/lib/application/portal/contracts";
import type { DemoPortalComposition } from "@/lib/application/portal/composition";

import { PortalNav, PortalNotice } from "@/components/portals/portal-chrome";
import { portalCopy } from "@/components/portals/portal-copy";
import styles from "@/components/portals/portal.module.css";

interface GuidePortalData {
  profile: GuideProfile;
  assignments: GuideAssignedTour[];
}

function formatDate(value: string, locale: "en" | "vi"): string {
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
    dateStyle: "medium",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function formatTime(value: string, locale: "en" | "vi"): string {
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function statusClass(status: string): string {
  return status === "assigned" ? styles.status : `${styles.status} ${styles.statusNeutral}`;
}

async function loadGuideData(composition: DemoPortalComposition): Promise<GuidePortalData> {
  const [profile, assignments] = await Promise.all([
    composition.guide.profile.getGuideProfile(),
    composition.guide.assignments.listAssignedTours(),
  ]);
  return { profile, assignments };
}

export function GuidePortal({
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
  const [data, setData] = useState<GuidePortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [profileState, setProfileState] = useState({
    displayName: "",
    phone: "",
    bio: "",
    language: locale,
  });
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState(false);

  async function refresh(): Promise<void> {
    setLoading(true);
    setError(false);
    try {
      const nextData = await loadGuideData(composition);
      setData(nextData);
      setProfileState({
        displayName: nextData.profile.displayName,
        phone: nextData.profile.phone ?? "",
        bio: nextData.profile.bio ?? "",
        language: nextData.profile.language,
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

  async function saveProfile(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setProfileBusy(true);
    setProfileMessage(null);
    setProfileError(false);
    try {
      const profile = await composition.guide.profile.updateGuideProfile({
        displayName: profileState.displayName,
        phone: profileState.phone || null,
        bio: profileState.bio || null,
        language: profileState.language,
      });
      setData((current) => current === null ? current : { ...current, profile });
      setProfileMessage(copy.guideProfileSaved);
    } catch {
      setProfileError(true);
      setProfileMessage(copy.profileError);
    } finally {
      setProfileBusy(false);
    }
  }

  return (
    <div className={styles.page} data-portal-role="guide">
      <div className={styles.surface}>
        <PortalNav locale={locale} session={session} onSignOut={onSignOut} />
        <PortalNotice locale={locale} />
        <header className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>{copy.eyebrow}</p>
            <h1>{copy.guidePortal}</h1>
            <p>{copy.scheduleIntro}</p>
          </div>
          <div className={styles.heroSide}>
            <strong>{copy.signedInAs}</strong>
            <span>{session.displayName}</span>
            <span className={styles.hint}>{session.email}</span>
          </div>
        </header>

        {loading && data === null ? <p className={styles.srStatus} role="status" aria-live="polite">{copy.loadingData}</p> : null}
        {error ? (
          <div className={styles.error} role="alert">
            <p>{copy.errorMessage}</p>
            <button className={styles.button} type="button" onClick={() => void refresh()}>{copy.retry}</button>
          </div>
        ) : null}

        {data ? (
          <div className={styles.grid}>
            <section className={`${styles.card} ${styles.span4}`} aria-labelledby="guide-profile-heading">
              <div className={styles.sectionHeader}>
                <h2 id="guide-profile-heading">{copy.guideProfileHeading}</h2>
                <span className={styles.status}>{copy.demoOnly}</span>
              </div>
              <p className={styles.sectionIntro}>{copy.guideProfileIntro}</p>
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
                    <span>{copy.phone}</span>
                    <input
                      value={profileState.phone}
                      onChange={(event) => setProfileState((current) => ({ ...current, phone: event.target.value }))}
                      autoComplete="tel"
                    />
                  </label>
                  <label className={styles.field}>
                    <span>{copy.language}</span>
                    <select
                      value={profileState.language}
                      onChange={(event) => setProfileState((current) => ({ ...current, language: event.target.value as "en" | "vi" }))}
                    >
                      <option value="en">{copy.english}</option>
                      <option value="vi">{copy.vietnamese}</option>
                    </select>
                  </label>
                  <label className={`${styles.field} ${styles.fieldFull}`}>
                    <span>{copy.email}</span>
                    <input value={data.profile.email} readOnly aria-readonly="true" />
                    <small>{copy.profileIntro}</small>
                  </label>
                  <label className={`${styles.field} ${styles.fieldFull}`}>
                    <span>{copy.shortBio}</span>
                    <textarea
                      aria-label={copy.shortBio}
                      value={profileState.bio}
                      onChange={(event) => setProfileState((current) => ({ ...current, bio: event.target.value }))}
                    />
                  </label>
                </div>
                {profileMessage ? <p className={profileError ? styles.error : styles.success} role={profileError ? "alert" : "status"}>{profileMessage}</p> : null}
                <div className={styles.actions}>
                  <button className={styles.button} type="submit" disabled={profileBusy}>{profileBusy ? copy.saving : copy.saveProfile}</button>
                </div>
              </form>
            </section>

            <section className={`${styles.card} ${styles.span8}`} aria-labelledby="guide-schedule-heading">
              <div className={styles.sectionHeader}>
                <h2 id="guide-schedule-heading">{copy.scheduleHeading}</h2>
                <span className={styles.eyebrow}>{data.assignments.length}</span>
              </div>
              <p className={styles.sectionIntro}>{copy.scheduleIntro}</p>
              <p className={styles.notice} role="note">{copy.readOnlyAssignment}</p>
              {data.assignments.length === 0 ? (
                <p className={styles.empty}>{copy.noAssignments}</p>
              ) : (
                <div className={styles.list}>
                  {data.assignments.map((assignment) => (
                    <article className={styles.assignmentCard} key={assignment.bookingId} aria-labelledby={`guide-assignment-${assignment.bookingId}`}>
                      <div className={styles.cardTitleLine}>
                        <div>
                          <h3 id={`guide-assignment-${assignment.bookingId}`}>{assignment.title}</h3>
                          <p>{assignment.departureId}</p>
                        </div>
                        <span className={statusClass(assignment.assignmentStatus)}>{copy.assignmentStatusLabels[assignment.assignmentStatus]}</span>
                      </div>
                      <dl className={styles.facts}>
                        <div><dt>{copy.date}</dt><dd>{formatDate(assignment.startAt, locale)}</dd></div>
                        <div><dt>{copy.scheduleHeading}</dt><dd>{formatTime(assignment.startAt, locale)}–{formatTime(assignment.endAt, locale)}</dd></div>
                        <div><dt>{copy.meetingPoint}</dt><dd>{assignment.meetingPoint}</dd></div>
                        <div><dt>{copy.partySize}</dt><dd>{assignment.partySize}</dd></div>
                        <div><dt>{copy.tourLanguage}</dt><dd>{assignment.language === "vi" ? copy.vietnamese : copy.english}</dd></div>
                        <div><dt>{copy.accessibilityNeeds}</dt><dd>{assignment.specialNeeds ?? copy.noneRecorded}</dd></div>
                      </dl>
                      {assignment.cancellationStatus ? (
                        <p className={styles.notice} role="status">
                          {copy.cancellationNotice}: {copy.cancellationStatusLabels[assignment.cancellationStatus]}
                        </p>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className={`${styles.card} ${styles.span12}`} aria-labelledby="guide-assigned-heading">
              <div className={styles.sectionHeader}>
                <h2 id="guide-assigned-heading">{copy.assignedToursHeading}</h2>
                <span className={styles.status}>{copy.demoOnly}</span>
              </div>
              <p className={styles.sectionIntro}>{copy.readOnlyAssignment}</p>
              {data.assignments.length === 0 ? <p className={styles.empty}>{copy.noAssignments}</p> : null}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
