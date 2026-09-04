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

const RUNTIME_COPY = {
  en: {
    loading: "Loading your secure planner…",
    activeDisclosure: "Authenticated thesis-demo planner — AI ranks approved options; LocalLens validates timing and cost before saving.",
    signIn: "Sign in to generate itinerary",
    generate: "Generate itinerary",
    generating: "Generating itinerary…",
    aiReady: "AI-assisted itinerary ready.",
    fallbackReady: "Safe fallback itinerary ready.",
    fallbackLabel: "Fallback status",
    fallbackDetail: "AI was unavailable, so LocalLens used its deterministic fallback. The itinerary remains a thesis-demo proposal.",
    quota: "AI demo limit reached. Please try again after the quota window resets; LocalLens will not retry automatically.",
    network: "The planner lost its network connection. Nothing was submitted automatically.",
    authExpired: "Your customer session expired. Sign in again before generating or refining an itinerary.",
    invalid: "LocalLens could not safely process this planner request. Return to personalization and review the structured choices.",
    unavailable: "The authenticated planner is temporarily unavailable. Nothing was submitted automatically.",
    retry: "Try again",
    timeline: "Itinerary timeline",
    rationaleHeading: "Why these stops were suggested",
    scopeLabel: "Refinement scope",
    scopePartial: "Adjust unlocked stops",
    scopeFull: "Rebuild the full itinerary",
  },
  vi: {
    loading: "Đang tải planner bảo mật…",
    activeDisclosure: "Planner demo đồ án có xác thực — AI xếp hạng lựa chọn đã duyệt; LocalLens kiểm tra thời gian và chi phí trước khi lưu.",
    signIn: "Đăng nhập để tạo lịch trình",
    generate: "Tạo lịch trình",
    generating: "Đang tạo lịch trình…",
    aiReady: "Lịch trình có AI hỗ trợ đã sẵn sàng.",
    fallbackReady: "Lịch trình dự phòng an toàn đã sẵn sàng.",
    fallbackLabel: "Trạng thái dự phòng",
    fallbackDetail: "AI tạm không khả dụng nên LocalLens dùng phương án xác định. Lịch trình vẫn chỉ là đề xuất demo đồ án.",
    quota: "Đã đạt giới hạn AI của bản demo. Hãy thử lại sau khi hạn mức được làm mới; LocalLens sẽ không tự động thử lại.",
    network: "Planner bị mất kết nối mạng. Hệ thống không tự động gửi lại yêu cầu.",
    authExpired: "Phiên khách hàng đã hết hạn. Hãy đăng nhập lại trước khi tạo hoặc tinh chỉnh lịch trình.",
    invalid: "LocalLens không thể xử lý an toàn yêu cầu này. Hãy quay lại biểu mẫu và kiểm tra các lựa chọn có cấu trúc.",
    unavailable: "Planner có xác thực đang tạm không khả dụng. Hệ thống không tự động gửi lại yêu cầu.",
    retry: "Thử lại",
    timeline: "Dòng thời gian lịch trình",
    rationaleHeading: "Lý do đề xuất các điểm này",
    scopeLabel: "Phạm vi điều chỉnh",
    scopePartial: "Điều chỉnh các điểm chưa khóa",
    scopeFull: "Tạo lại toàn bộ lịch trình",
  },
} as const;

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

function errorMessage(error: RuntimePlannerError, locale: Locale, copy: PlannerCopy): string {
  const runtimeCopy = RUNTIME_COPY[locale];
  if (error.code === "QUOTA_EXCEEDED") return runtimeCopy.quota;
  if (error.code === "AUTH_REQUIRED" || error.code === "AUTH_EXPIRED") return runtimeCopy.authExpired;
  if (error.code === "INVALID_REQUEST") return runtimeCopy.invalid;
  if (error.code === "STALE_REVISION") return copy.staleRevisionMessage;
  return error.retryable ? runtimeCopy.network : runtimeCopy.unavailable;
}

function PlannerProposal({
  locale,
  copy,
  proposal,
  lockedItemIds,
  onToggleLock,
}: {
  locale: Locale;
  copy: PlannerCopy;
  proposal: RuntimePlannerProposal;
  lockedItemIds: ReadonlySet<string>;
  onToggleLock: (itemId: string) => void;
}) {
  const runtimeCopy = RUNTIME_COPY[locale];
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

      <ol className="planner-timeline" aria-label={runtimeCopy.timeline}>
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
          <h3 id="runtime-planner-rationales-heading">{runtimeCopy.rationaleHeading}</h3>
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
  const runtimeCopy = RUNTIME_COPY[locale];
  const [access, setAccess] = useState<PlannerAccessState>({ status: "loading" });
  const [uiState, setUiState] = useState<RuntimePlannerUiState>({ status: "idle" });
  const [lockedItemIds, setLockedItemIds] = useState<ReadonlySet<string>>(() => new Set());
  const [feedback, setFeedback] = useState("");
  const [scope, setScope] = useState<"partial" | "full">("partial");
  const [validationError, setValidationError] = useState<string | null>(null);
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
  const staleBlocked = uiState.status === "error" && uiState.error.code === "STALE_REVISION";

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
    if (inFlightRef.current || staleBlocked) return;
    setLockedItemIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function submitRefinement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (currentProposal === undefined || staleBlocked || inFlightRef.current) return;
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
    if (intent === null || uiState.status !== "error" || !uiState.error.retryable) return;
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
          {access.status === "loading" ? <p role="status" aria-live="polite">{runtimeCopy.loading}</p> : null}
        </>
      ) : <p className="planner-flow__proposal" role="note">{runtimeCopy.activeDisclosure}</p>}

      {access.status === "signed-out" ? (
        <div className="planner-flow__handoff-error">
          <p>{runtimeCopy.authExpired}</p>
          <Link className="button button--primary" href={signInPath(locale, `/${locale}/planner/`)}>
            {runtimeCopy.signIn}
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
          {runtimeCopy.generate}
        </button>
      ) : null}

      {uiState.status === "loading" ? (
        <div>
          <p role="status" aria-live="polite">
            {uiState.operation === "recommend" ? runtimeCopy.generating : copy.refiningLabel}
          </p>
          <button className="button button--primary" type="button" disabled>
            {uiState.operation === "recommend" ? runtimeCopy.generating : copy.refiningLabel}
          </button>
        </div>
      ) : null}

      {uiState.status === "error" ? (
        <div className="planner-flow__error" role="alert">
          <p>{errorMessage(uiState.error, locale, copy)}</p>
          {(uiState.error.code === "AUTH_REQUIRED" || uiState.error.code === "AUTH_EXPIRED") ? (
            <Link className="button button--primary" href={signInPath(locale, `/${locale}/planner/`)}>
              {runtimeCopy.signIn}
            </Link>
          ) : null}
          {uiState.error.code === "STALE_REVISION" && uiState.previous ? (
            <button className="button button--secondary" type="button" onClick={() => void refreshLatest()}>
              {copy.refreshLabel}
            </button>
          ) : null}
          {uiState.error.retryable ? (
            <button className="button button--secondary" type="button" onClick={retryLastOperation}>
              {runtimeCopy.retry}
            </button>
          ) : null}
        </div>
      ) : null}

      {currentProposal ? (
        <>
          <p className="planner-flow__status" role="status" aria-live="polite">
            {currentProposal.degraded ? runtimeCopy.fallbackReady : runtimeCopy.aiReady}
          </p>
          {currentProposal.degraded ? (
            <p className="planner-flow__default-disclosure" role="note" aria-label={runtimeCopy.fallbackLabel}>
              {runtimeCopy.fallbackDetail}
            </p>
          ) : null}
          <PlannerProposal
            locale={locale}
            copy={copy}
            proposal={currentProposal}
            lockedItemIds={lockedItemIds}
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
              <span>{runtimeCopy.scopeLabel}</span>
              <select
                id="runtime-planner-scope"
                name="scope"
                value={scope}
                onChange={(event) => setScope(event.target.value === "full" ? "full" : "partial")}
                required
              >
                <option value="partial">{runtimeCopy.scopePartial}</option>
                <option value="full">{runtimeCopy.scopeFull}</option>
              </select>
            </label>
            <p id="runtime-planner-feedback-hint" className="planner-flow__hint">{copy.proposalOnly}</p>
            {validationError ? <p className="planner-flow__error" role="alert">{validationError}</p> : null}
            <button
              className="button button--primary"
              type="submit"
              disabled={uiState.status === "loading" || staleBlocked}
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
