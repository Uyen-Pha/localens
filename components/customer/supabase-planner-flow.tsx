"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  readPersonalizationState,
  toItineraryRequest,
  type PersonalizationReadState,
  type PersonalizationRequest,
} from "@/lib/application/planner/personalization-session";
import type {
  RuntimePlannerError,
  RuntimePlannerPort,
  RuntimePlannerProposal,
  RuntimeRefinementRequest,
} from "@/lib/application/planner/runtime-planner";
import type { ItineraryRequest } from "@/lib/domain/itinerary/contracts";
import type { Locale } from "@/lib/i18n/config";
import type { PlannerCopy } from "@/lib/i18n/dictionaries";
import { signInPath } from "@/lib/navigation/safe-return-to";

export interface SupabasePlannerFlowProps {
  locale: Locale;
  copy: PlannerCopy;
  planner: RuntimePlannerPort;
}

type RuntimePlannerUiState =
  | { status: "idle" }
  | { status: "loading"; operation: "recommend" | "refine" }
  | { status: "ready"; proposal: RuntimePlannerProposal }
  | { status: "error"; error: RuntimePlannerError; previous?: RuntimePlannerProposal };

type PlannerAccessState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "recovery"; reason: Exclude<PersonalizationReadState["status"], "ok"> }
  | { status: "ready"; request: ItineraryRequest };

type PendingOperation =
  | { kind: "recommend"; request: ItineraryRequest }
  | { kind: "refine"; request: RuntimeRefinementRequest };

type RetryIntent =
  | { kind: "operation"; operation: PendingOperation; previous?: RuntimePlannerProposal }
  | { kind: "refresh"; previous: RuntimePlannerProposal };

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

function recoveryMessage(
  reason: Exclude<PersonalizationReadState["status"], "ok">,
  copy: PlannerCopy,
): string {
  if (reason === "expired") return copy.handoffExpiredLabel;
  if (reason === "storage-error") return copy.handoffStorageErrorLabel;
  return copy.handoffInvalidLabel;
}

function stableClientError(): RuntimePlannerError {
  return {
    code: "SERVICE_UNAVAILABLE",
    messageKey: "planner.service_unavailable",
    retryable: true,
    correlationId: "00000000-0000-4000-8000-000000000000",
  };
}

function runtimeRequest(request: PersonalizationRequest): ItineraryRequest {
  const safe = toItineraryRequest(request);
  return {
    ...safe,
    areas: [...safe.areas],
    budget: { ...safe.budget },
    priorityWeights: { ...safe.priorityWeights },
    dietaryRequirements: [...safe.dietaryRequirements],
    mobilityRequirements: [...safe.mobilityRequirements],
    lockedStopIds: [...safe.lockedStopIds],
  };
}

function errorMessage(error: RuntimePlannerError, copy: PlannerCopy): string {
  if (error.code === "QUOTA_EXCEEDED") return copy.runtimeQuotaMessage;
  if (error.code === "AUTH_REQUIRED" || error.code === "AUTH_EXPIRED") return copy.runtimeAuthExpiredMessage;
  if (error.code === "INVALID_REQUEST") return copy.runtimeInvalidRequestMessage;
  if (error.code === "STALE_REVISION") return copy.staleRevisionMessage;
  return error.retryable ? copy.runtimeNetworkMessage : copy.runtimeUnavailableMessage;
}

function PlannerProposal({
  locale,
  copy,
  proposal,
  lockedItemIds,
  controlsDisabled,
  onToggleLock,
}: {
  locale: Locale;
  copy: PlannerCopy;
  proposal: RuntimePlannerProposal;
  lockedItemIds: ReadonlySet<string>;
  controlsDisabled: boolean;
  onToggleLock: (itemId: string) => void;
}) {
  const rationales = Object.values(proposal.rationales);

  return (
    <article className="planner-flow__proposal-card" aria-labelledby="runtime-planner-current-heading">
      <div className="planner-flow__proposal-header">
        <div>
          <p className="eyebrow">{copy.currentRevisionLabel}</p>
          <h2 id="runtime-planner-current-heading">{`${copy.revisionLabel} ${proposal.revision}`}</h2>
        </div>
        <span className="planner-flow__plan-id">{proposal.planId}</span>
      </div>

      <ol className="planner-timeline" aria-label={copy.runtimeTimelineLabel}>
        {proposal.items.map((item) => {
          const locked = lockedItemIds.has(item.placeId);
          return (
            <li className="planner-timeline__item" key={item.placeId}>
              <article>
                <p className="planner-timeline__timezone" role="note">{copy.timezoneLabel}</p>
                <div className="planner-timeline__item-header">
                  <h3>{item.title}</h3>
                  <button
                    className="button button--secondary planner-timeline__lock"
                    type="button"
                    aria-pressed={locked}
                    disabled={controlsDisabled}
                    onClick={() => onToggleLock(item.placeId)}
                  >
                    {locked ? copy.unlockLabel : copy.lockLabel}: {item.title}
                  </button>
                </div>
                <p className="planner-timeline__activity">
                  <strong>{copy.activityLabel}:</strong> {item.summary}
                </p>
                {item.rationale ? <p>{item.rationale}</p> : null}
                <dl className="planner-timeline__details">
                  <div><dt>{copy.startLabel}</dt><dd>{item.startAt}</dd></div>
                  <div><dt>{copy.endLabel}</dt><dd>{item.endAt}</dd></div>
                  <div><dt>{copy.visitDurationLabel}</dt><dd>{formatMinutes(item.visitDurationMinutes, locale)}</dd></div>
                  <div><dt>{copy.travelDurationLabel}</dt><dd>{formatMinutes(item.travelMinutesBefore, locale)}</dd></div>
                  <div><dt>{copy.costLabel}</dt><dd>{formatVnd(item.admissionCostVnd + item.travelCostVnd, locale)}</dd></div>
                </dl>
                {item.food ? (
                  <section className="planner-food" aria-labelledby={`runtime-planner-food-${item.placeId}`}>
                    <h4 id={`runtime-planner-food-${item.placeId}`}>{item.food.itemTitle}</h4>
                    <dl className="planner-food__details">
                      <div><dt>{copy.vendorLabel}</dt><dd>{item.food.vendorTitle}</dd></div>
                      <div><dt>{copy.menuItemLabel}</dt><dd>{item.food.itemTitle}</dd></div>
                      <div><dt>{copy.quantityLabel}</dt><dd>{item.food.quantity}</dd></div>
                      <div><dt>{copy.activityLabel}</dt><dd>{item.food.activity}</dd></div>
                      <div><dt>{copy.estimatedRangeLabel}</dt><dd>{`${formatVnd(item.food.foodCostMinVnd, locale)} – ${formatVnd(item.food.foodCostMaxVnd, locale)}`}</dd></div>
                    </dl>
                  </section>
                ) : <p className="planner-food__none">{copy.foodNotSelectedLabel}</p>}
              </article>
            </li>
          );
        })}
      </ol>

      {rationales.length > 0 ? (
        <section className="planner-flow__checks" aria-labelledby="runtime-planner-rationales-heading">
          <h3 id="runtime-planner-rationales-heading">{copy.runtimeRationaleHeading}</h3>
          <ul>{rationales.map((rationale) => <li key={rationale}>{rationale}</li>)}</ul>
        </section>
      ) : null}

      <div className="planner-flow__totals">
        <dl>
          <div><dt>{copy.totalDurationLabel}</dt><dd>{formatMinutes(proposal.totals.durationMinutes, locale)}</dd></div>
          <div><dt>{copy.venueAdmissionLabel}</dt><dd>{formatVnd(proposal.totals.admissionCostVnd, locale)}</dd></div>
          <div><dt>{copy.foodEstimateLabel}</dt><dd>{`${formatVnd(proposal.totals.foodCostMinVnd, locale)} – ${formatVnd(proposal.totals.foodCostMaxVnd, locale)}`}</dd></div>
          <div><dt>{copy.travelCostTotalLabel}</dt><dd>{formatVnd(proposal.totals.travelCostVnd, locale)}</dd></div>
          <div><dt>{copy.guideCostLabel}</dt><dd>{formatVnd(proposal.totals.guideCostVnd, locale)}</dd></div>
          <div><dt>{copy.localLensPayableLabel}</dt><dd>{formatVnd(proposal.totals.customerPayableVnd, locale)}</dd></div>
          <div><dt>{copy.payAtVendorLabel}</dt><dd>{`${formatVnd(proposal.totals.payAtVendorMinVnd, locale)} – ${formatVnd(proposal.totals.payAtVendorMaxVnd, locale)}`}</dd></div>
          <div><dt>{copy.totalCostLabel}</dt><dd>{formatVnd(proposal.totals.groupCostMaxVnd, locale)}</dd></div>
        </dl>
      </div>
    </article>
  );
}

export function SupabasePlannerFlow({ locale, copy, planner }: SupabasePlannerFlowProps) {
  const [access, setAccess] = useState<PlannerAccessState>({ status: "loading" });
  const [uiState, setUiState] = useState<RuntimePlannerUiState>({ status: "idle" });
  const [lockedItemIds, setLockedItemIds] = useState<ReadonlySet<string>>(() => new Set());
  const [feedback, setFeedback] = useState("");
  const [scope, setScope] = useState<"partial" | "full">("partial");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [needsFreshRevision, setNeedsFreshRevision] = useState(false);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const retryIntentRef = useRef<RetryIntent | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    let disposed = false;

    void planner.getSession()
      .then((session) => {
        if (disposed) return;
        const handoff = readPersonalizationState();
        if (handoff.status !== "ok") {
          setAccess({ status: "recovery", reason: handoff.status });
          return;
        }
        if (session === null) {
          setAccess({ status: "signed-out" });
          return;
        }
        setAccess({ status: "ready", request: runtimeRequest(handoff.request) });
        setLockedItemIds(new Set(handoff.request.lockedStopIds));
      })
      .catch(() => {
        if (disposed) return;
        const handoff = readPersonalizationState();
        setAccess(handoff.status === "ok"
          ? { status: "signed-out" }
          : { status: "recovery", reason: handoff.status });
      });

    return () => {
      disposed = true;
      mountedRef.current = false;
    };
  }, [planner]);

  const currentProposal = uiState.status === "ready"
    ? uiState.proposal
    : uiState.status === "error"
      ? uiState.previous
      : undefined;
  async function execute(operation: PendingOperation, previous?: RuntimePlannerProposal) {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    retryIntentRef.current = previous === undefined
      ? { kind: "operation", operation }
      : { kind: "operation", operation, previous };
    setValidationError(null);
    setUiState({ status: "loading", operation: operation.kind });

    try {
      const result = operation.kind === "recommend"
        ? await planner.recommend(operation.request, locale)
        : await planner.refine(operation.request, locale);
      if (!mountedRef.current) return;
      if (!result.ok) {
        if (result.error.code === "STALE_REVISION") setNeedsFreshRevision(true);
        setUiState(previous === undefined
          ? { status: "error", error: result.error }
          : { status: "error", error: result.error, previous });
        return;
      }
      setUiState({ status: "ready", proposal: result.value });
      setLockedItemIds((current) => {
        const available = new Set(result.value.items.map((item) => item.placeId));
        return new Set([...current].filter((itemId) => available.has(itemId)));
      });
      if (operation.kind === "refine") setFeedback("");
    } catch {
      if (!mountedRef.current) return;
      const error = stableClientError();
      setUiState(previous === undefined
        ? { status: "error", error }
        : { status: "error", error, previous });
    } finally {
      inFlightRef.current = false;
    }
  }

  function generateProposal() {
    if (access.status !== "ready") return;
    void execute({ kind: "recommend", request: access.request });
  }

  function toggleLock(itemId: string) {
    if (inFlightRef.current || needsFreshRevision) return;
    setLockedItemIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function submitRefinement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (currentProposal === undefined || needsFreshRevision || inFlightRef.current) return;
    const normalizedFeedback = feedback.trim();
    if (normalizedFeedback.length === 0) {
      setValidationError(copy.feedbackRequiredMessage);
      return;
    }
    const request: RuntimeRefinementRequest = {
      planId: currentProposal.planId,
      baseRevision: currentProposal.revision,
      delta: { feedback: normalizedFeedback, scope },
      lockedItemIds: [...lockedItemIds],
    };
    void execute({ kind: "refine", request }, currentProposal);
  }

  function retryLastOperation() {
    const intent = retryIntentRef.current;
    if (
      intent === null
      || uiState.status !== "error"
      || !uiState.error.retryable
      || uiState.error.code === "STALE_REVISION"
      || (needsFreshRevision && intent.kind !== "refresh")
    ) return;
    if (intent.kind === "refresh") {
      void refreshLatest(intent.previous);
      return;
    }
    void execute(intent.operation, intent.previous);
  }

  async function refreshLatest(previous = currentProposal) {
    if (previous === undefined || inFlightRef.current) return;
    inFlightRef.current = true;
    retryIntentRef.current = { kind: "refresh", previous };
    setUiState({ status: "loading", operation: "refine" });
    try {
      const result = await planner.getPlan(previous.planId, locale);
      if (!mountedRef.current) return;
      if (!result.ok) {
        setUiState({ status: "error", error: result.error, previous });
        return;
      }
      setNeedsFreshRevision(false);
      setUiState({ status: "ready", proposal: result.value });
      setLockedItemIds((current) => {
        const available = new Set(result.value.items.map((item) => item.placeId));
        return new Set([...current].filter((itemId) => available.has(itemId)));
      });
    } catch {
      if (mountedRef.current) setUiState({ status: "error", error: stableClientError(), previous });
    } finally {
      inFlightRef.current = false;
    }
  }

  return (
    <section className="customer-section planner-flow planner-flow--editorial" aria-labelledby="supabase-planner-heading">
      <div className="section-heading section-heading--compact">
        <p className="eyebrow">LocalLens</p>
        <h1 id="supabase-planner-heading">{copy.heading}</h1>
        <p>{copy.intro}</p>
      </div>

      {uiState.status === "idle" ? (
        <>
          <p className="planner-flow__proposal" role="note">{copy.runtimeDisclosure}</p>
          {access.status === "loading" ? <p role="status" aria-live="polite">{copy.runtimeLoadingLabel}</p> : null}
        </>
      ) : <p className="planner-flow__proposal" role="note">{copy.runtimeActiveDisclosure}</p>}

      {access.status === "signed-out" ? (
        <div className="planner-flow__handoff-error">
          <p>{copy.runtimeAuthExpiredMessage}</p>
          <Link className="button button--primary" href={signInPath(locale, `/${locale}/planner/`)}>
            {copy.runtimeSignInLabel}
          </Link>
        </div>
      ) : null}

      {access.status === "recovery" ? (
        <div className="planner-flow__handoff-error" role="alert">
          <p>{recoveryMessage(access.reason, copy)}</p>
          <Link className="button button--secondary" href={`/${locale}/#personalize`}>
            {copy.backToPersonalizationLabel}
          </Link>
        </div>
      ) : null}

      {access.status === "ready" && uiState.status === "idle" ? (
        <button className="button button--primary" type="button" onClick={generateProposal}>
          {copy.runtimeGenerateLabel}
        </button>
      ) : null}

      {uiState.status === "loading" ? (
        <div>
          <p role="status" aria-live="polite">
            {uiState.operation === "recommend" ? copy.runtimeGeneratingLabel : copy.refiningLabel}
          </p>
          <button className="button button--primary" type="button" disabled>
            {uiState.operation === "recommend" ? copy.runtimeGeneratingLabel : copy.refiningLabel}
          </button>
        </div>
      ) : null}

      {uiState.status === "error" ? (
        <div className="planner-flow__error" role="alert">
          <p>{errorMessage(uiState.error, copy)}</p>
          {(uiState.error.code === "AUTH_REQUIRED" || uiState.error.code === "AUTH_EXPIRED") ? (
            <Link className="button button--primary" href={signInPath(locale, `/${locale}/planner/`)}>
              {copy.runtimeSignInLabel}
            </Link>
          ) : null}
          {uiState.error.code === "STALE_REVISION" && uiState.previous ? (
            <button className="button button--secondary" type="button" onClick={() => void refreshLatest()}>
              {copy.refreshLabel}
            </button>
          ) : null}
          {uiState.error.retryable && uiState.error.code !== "STALE_REVISION" ? (
            <button className="button button--secondary" type="button" onClick={retryLastOperation}>
              {copy.runtimeRetryLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      {currentProposal ? (
        <>
          <p className="planner-flow__status" role="status" aria-live="polite">
            {currentProposal.degraded ? copy.runtimeFallbackReadyLabel : copy.runtimeAiDisclosure}
          </p>
          {currentProposal.degraded ? (
            <p className="planner-flow__default-disclosure" role="note" aria-label={copy.runtimeFallbackLabel}>
              {copy.runtimeFallbackDisclosure}
            </p>
          ) : null}
          <PlannerProposal
            locale={locale}
            copy={copy}
            proposal={currentProposal}
            lockedItemIds={lockedItemIds}
            controlsDisabled={needsFreshRevision}
            onToggleLock={toggleLock}
          />
          <form className="planner-flow__refine" onSubmit={submitRefinement} noValidate>
            <label className="field" htmlFor="runtime-planner-feedback">
              <span>{copy.feedbackLabel}</span>
              <textarea
                id="runtime-planner-feedback"
                name="feedback"
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                placeholder={copy.feedbackPlaceholder}
                maxLength={2000}
                rows={4}
                aria-describedby="runtime-planner-feedback-hint"
              />
            </label>
            <label className="field" htmlFor="runtime-planner-scope">
              <span>{copy.runtimeScopeLabel}</span>
              <select
                id="runtime-planner-scope"
                name="scope"
                value={scope}
                onChange={(event) => setScope(event.target.value === "full" ? "full" : "partial")}
                required
              >
                <option value="partial">{copy.runtimeScopePartialLabel}</option>
                <option value="full">{copy.runtimeScopeFullLabel}</option>
              </select>
            </label>
            <p id="runtime-planner-feedback-hint" className="planner-flow__hint">{copy.proposalOnly}</p>
            {validationError ? <p className="planner-flow__error" role="alert">{validationError}</p> : null}
            <button
              className="button button--primary"
              type="submit"
              disabled={uiState.status === "loading" || needsFreshRevision}
            >
              {uiState.status === "loading" && uiState.operation === "refine" ? copy.refiningLabel : copy.refineLabel}
            </button>
          </form>
        </>
      ) : null}

      <Link className="button button--secondary" href={`/${locale}/`}>{copy.backHomeLabel}</Link>
    </section>
  );
}
