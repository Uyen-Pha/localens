"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  readPersonalizationState,
  toItineraryRequest,
  type PersonalizationReadState,
  type PersonalizationRequest,
} from "@/lib/application/planner/personalization-session";
import {
  normalizeRefinementSignals,
  type RefinementSignals,
} from "@/lib/application/planner/refinement-signals";
import { runtimePlannerErrorUi } from "@/lib/application/planner/runtime-planner-error-ui";
import type {
  RuntimePlannerError,
  RuntimePlannerPort,
  RuntimePlannerProposal,
  RuntimeRefinementRequest,
} from "@/lib/application/planner/runtime-planner";
import {
  readRuntimePendingOperation,
  readRuntimePlanPointer,
  invalidateRuntimePendingOperation,
  removeRuntimePendingOperation,
  removeRuntimePlanPointer,
  saveRuntimePendingOperation,
  saveRuntimePlanPointer,
  type RuntimePendingOperation,
} from "@/lib/application/planner/runtime-planner-session";
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
  | { status: "loading"; operation: "recommend" | "refine" | "restore" }
  | { status: "ready"; proposal: RuntimePlannerProposal }
  | {
    status: "error";
    error: RuntimePlannerError;
    previous?: RuntimePlannerProposal;
    localIssue?: "pending-storage" | "plan-pointer-storage";
  };

type PlannerAccessState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "recovery"; reason: Exclude<PersonalizationReadState["status"], "ok"> }
  | { status: "ready"; request: ItineraryRequest | null; userId: string };

type PendingOperation =
  | { kind: "recommend"; operationId: string; request: ItineraryRequest }
  | { kind: "refine"; operationId: string; request: RuntimeRefinementRequest; signals: RefinementSignals };

type RetryIntent =
  | { kind: "operation"; operation: PendingOperation; previous?: RuntimePlannerProposal }
  | { kind: "refresh"; previous: RuntimePlannerProposal }
  | { kind: "restore"; planId: string; pending: PendingOperation | null };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function newOperationId(): string | null {
  try {
    const operationId = globalThis.crypto.randomUUID();
    return UUID_PATTERN.test(operationId) ? operationId.toLowerCase() : null;
  } catch {
    return null;
  }
}

function canonicalFeedback(signals: RefinementSignals): string {
  const phrases: string[] = [];
  if (signals.pace === "slower") phrases.push("slower");
  if (signals.pace === "faster") phrases.push("faster");
  if (signals.food === "more") phrases.push("more food");
  if (signals.food === "remove") phrases.push("remove food");
  if (signals.preferTypes[0] === "history") phrases.push("history");
  if (signals.preferTypes[0] === "traditional_craft") phrases.push("craft");
  if (signals.preferTypes[0] === "traditional_market") phrases.push("market");
  return phrases.join("; ");
}

function persistedOperation(
  operation: PendingOperation,
  ownerUserId: string,
  savedAt: number,
): RuntimePendingOperation {
  if (operation.kind === "recommend") {
    return {
      version: 1,
      ownerUserId,
      operationId: operation.operationId,
      savedAt,
      kind: "recommend",
      request: operation.request,
    };
  }
  return {
    version: 1,
    ownerUserId,
    operationId: operation.operationId,
    savedAt,
    kind: "refine",
    planId: operation.request.planId,
    baseRevision: operation.request.baseRevision,
    scope: operation.request.delta.scope,
    lockedItemIds: operation.request.lockedItemIds,
    signals: operation.signals,
  };
}

function browserOperation(operation: RuntimePendingOperation): PendingOperation {
  if (operation.kind === "recommend") {
    return { kind: "recommend", operationId: operation.operationId, request: operation.request };
  }
  return {
    kind: "refine",
    operationId: operation.operationId,
    request: {
      planId: operation.planId,
      baseRevision: operation.baseRevision,
      delta: { feedback: canonicalFeedback(operation.signals), scope: operation.scope },
      lockedItemIds: operation.lockedItemIds,
    },
    signals: operation.signals,
  };
}

function pendingOperationError(): RuntimePlannerError {
  return {
    code: "OPERATION_IN_PROGRESS",
    status: 409,
    messageKey: "planner.operation_in_progress",
    retryable: true,
    correlationId: "00000000-0000-4000-8000-000000000000",
    operationState: "in_progress",
  };
}

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
    status: 503,
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

function errorMessage(
  error: RuntimePlannerError,
  copy: PlannerCopy,
  localIssue?: "pending-storage" | "plan-pointer-storage",
): string {
  if (localIssue === "pending-storage") return copy.runtimePendingStorageErrorMessage;
  if (localIssue === "plan-pointer-storage") return copy.runtimePlanPointerStorageWarning;
  return copy.runtimeErrorMessages[runtimePlannerErrorUi(error).message];
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
  const [sessionRevision, setSessionRevision] = useState(0);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const retryIntentRef = useRef<RetryIntent | null>(null);
  const sessionEpochRef = useRef(0);
  const activeUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (planner.subscribeSession === undefined) return;

    return planner.subscribeSession((userId) => {
      if (userId === activeUserIdRef.current) return;
      activeUserIdRef.current = userId;
      sessionEpochRef.current += 1;
      inFlightRef.current = false;
      retryIntentRef.current = null;
      removeRuntimePendingOperation(window.sessionStorage);
      removeRuntimePlanPointer(window.localStorage);
      setAccess({ status: "loading" });
      setUiState({ status: "idle" });
      setLockedItemIds(new Set());
      setFeedback("");
      setScope("partial");
      setValidationError(null);
      setNeedsFreshRevision(false);
      setSessionRevision((current) => current + 1);
    });
  }, [planner]);

  useEffect(() => {
    mountedRef.current = true;
    let disposed = false;
    const epoch = sessionEpochRef.current + 1;
    sessionEpochRef.current = epoch;

    void planner.getSession()
      .then(async (session) => {
        if (disposed) return;
        if (session === null) {
          activeUserIdRef.current = null;
          setAccess({ status: "signed-out" });
          return;
        }
        activeUserIdRef.current = session.userId;
        const handoff = readPersonalizationState();
        const request = handoff.status === "ok" ? runtimeRequest(handoff.request) : null;
        setAccess({
          status: "ready",
          request,
          userId: session.userId,
        });
        setLockedItemIds(new Set(handoff.status === "ok" ? handoff.request.lockedStopIds : []));

        const now = Date.now();
        const storedPending = readRuntimePendingOperation(
          window.sessionStorage,
          session.userId,
          now,
        );
        const pending = storedPending === null ? null : browserOperation(storedPending);
        const pointer = readRuntimePlanPointer(window.localStorage, session.userId, now);
        const planId = pointer?.planId ?? (storedPending?.kind === "refine" ? storedPending.planId : null);
        if (planId === null) {
          if (handoff.status !== "ok") {
            setAccess({ status: "recovery", reason: handoff.status });
          }
          if (pending !== null) {
            retryIntentRef.current = { kind: "operation", operation: pending };
            setUiState({ status: "error", error: pendingOperationError() });
          }
          return;
        }
        await restorePersistedPlan(planId, pending, session.userId, epoch);
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
      sessionEpochRef.current += 1;
      mountedRef.current = false;
    };
  }, [locale, planner, sessionRevision]);

  function restoreFreshGeneration(userId: string) {
    const handoff = readPersonalizationState();
    retryIntentRef.current = null;
    setLockedItemIds(new Set());
    setNeedsFreshRevision(false);
    if (handoff.status === "ok") {
      setAccess({ status: "ready", request: runtimeRequest(handoff.request), userId });
      setLockedItemIds(new Set(handoff.request.lockedStopIds));
    } else {
      setAccess({ status: "recovery", reason: handoff.status });
    }
    setUiState({ status: "idle" });
  }

  async function restorePersistedPlan(
    planId: string,
    pending: PendingOperation | null,
    userId: string,
    epoch = sessionEpochRef.current,
  ) {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    retryIntentRef.current = { kind: "restore", planId, pending };
    setUiState({ status: "loading", operation: "restore" });
    try {
      const result = await planner.getPlan(planId, locale);
      if (!mountedRef.current || sessionEpochRef.current !== epoch) return;
      if (!result.ok) {
        if (result.error.code === "PLAN_NOT_FOUND") {
          removeRuntimePlanPointer(window.localStorage);
          if (pending?.kind === "refine" && pending.request.planId === planId) {
            invalidateRuntimePendingOperation(window.sessionStorage);
          }
          restoreFreshGeneration(userId);
          return;
        }
        if (runtimePlannerErrorUi(result.error).action !== "retry-same-operation") {
          retryIntentRef.current = null;
        }
        setUiState({ status: "error", error: result.error });
        return;
      }
      if (pending === null) {
        retryIntentRef.current = null;
        setUiState({ status: "ready", proposal: result.value });
      } else {
        retryIntentRef.current = { kind: "operation", operation: pending, previous: result.value };
        setUiState({ status: "error", error: pendingOperationError(), previous: result.value });
      }
    } catch {
      if (mountedRef.current && sessionEpochRef.current === epoch) {
        setUiState({ status: "error", error: stableClientError() });
      }
    } finally {
      if (sessionEpochRef.current === epoch) inFlightRef.current = false;
    }
  }

  const currentProposal = uiState.status === "ready"
    ? uiState.proposal
    : uiState.status === "error"
      ? uiState.previous
      : undefined;
  async function execute(operation: PendingOperation, previous?: RuntimePlannerProposal) {
    if (inFlightRef.current) return;
    if (access.status !== "ready") return;
    inFlightRef.current = true;
    const epoch = sessionEpochRef.current;
    retryIntentRef.current = previous === undefined
      ? { kind: "operation", operation }
      : { kind: "operation", operation, previous };
    const persisted = saveRuntimePendingOperation(
      window.sessionStorage,
      persistedOperation(operation, access.userId, Date.now()),
    );
    if (!persisted) {
      inFlightRef.current = false;
      const error = stableClientError();
      setUiState(previous === undefined
        ? { status: "error", error, localIssue: "pending-storage" }
        : { status: "error", error, previous, localIssue: "pending-storage" });
      return;
    }
    setValidationError(null);
    setUiState({ status: "loading", operation: operation.kind });

    try {
      const result = operation.kind === "recommend"
        ? await planner.recommend(operation.request, locale, { operationId: operation.operationId })
        : await planner.refine(operation.request, locale, { operationId: operation.operationId });
      if (!mountedRef.current || sessionEpochRef.current !== epoch) return;
      if (!result.ok) {
        const presentation = runtimePlannerErrorUi(result.error);
        if (
          !result.error.retryable
          || result.error.operationState === "rejected"
          || result.error.operationState === "interrupted"
        ) {
          invalidateRuntimePendingOperation(window.sessionStorage);
        }
        if (presentation.action === "refresh-plan") setNeedsFreshRevision(true);
        if (["none", "sign-in", "edit-request"].includes(presentation.action)) {
          retryIntentRef.current = null;
        }
        setUiState(previous === undefined
          ? { status: "error", error: result.error }
          : { status: "error", error: result.error, previous });
        return;
      }
      const pointerSaved = saveRuntimePlanPointer(window.localStorage, {
        version: 1,
        ownerUserId: access.userId,
        planId: result.value.planId,
        savedAt: Date.now(),
      });
      setLockedItemIds((current) => {
        const available = new Set(result.value.items.map((item) => item.placeId));
        return new Set([...current].filter((itemId) => available.has(itemId)));
      });
      if (operation.kind === "refine") setFeedback("");
      if (!pointerSaved) {
        setUiState({
          status: "error",
          error: stableClientError(),
          previous: result.value,
          localIssue: "plan-pointer-storage",
        });
        return;
      }
      if (!removeRuntimePendingOperation(window.sessionStorage)) {
        setUiState({
          status: "error",
          error: stableClientError(),
          previous: result.value,
          localIssue: "plan-pointer-storage",
        });
        return;
      }
      retryIntentRef.current = null;
      setUiState({ status: "ready", proposal: result.value });
    } catch {
      if (!mountedRef.current || sessionEpochRef.current !== epoch) return;
      const error = stableClientError();
      setUiState(previous === undefined
        ? { status: "error", error }
        : { status: "error", error, previous });
    } finally {
      if (sessionEpochRef.current === epoch) inFlightRef.current = false;
    }
  }

  function generateProposal() {
    if (access.status !== "ready" || access.request === null) return;
    const operationId = newOperationId();
    if (operationId === null) {
      setUiState({ status: "error", error: stableClientError() });
      return;
    }
    void execute({ kind: "recommend", operationId, request: access.request });
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
    const signals = normalizeRefinementSignals(normalizedFeedback);
    const safeFeedback = canonicalFeedback(signals);
    if (safeFeedback.length === 0) {
      setValidationError(copy.runtimeFeedbackUnsupportedMessage);
      return;
    }
    const operationId = newOperationId();
    if (operationId === null) {
      setUiState({ status: "error", error: stableClientError(), previous: currentProposal });
      return;
    }
    const request: RuntimeRefinementRequest = {
      planId: currentProposal.planId,
      baseRevision: currentProposal.revision,
      delta: { feedback: safeFeedback, scope },
      lockedItemIds: [...lockedItemIds],
    };
    void execute({ kind: "refine", operationId, request, signals }, currentProposal);
  }

  function retryLastOperation() {
    const intent = retryIntentRef.current;
    const presentation = uiState.status === "error" ? runtimePlannerErrorUi(uiState.error) : null;
    if (
      intent === null
      || uiState.status !== "error"
      || presentation === null
      || presentation.action !== "retry-same-operation" && presentation.action !== "retry-new-operation"
      || (needsFreshRevision && intent.kind !== "refresh")
    ) return;
    if (intent.kind === "refresh") {
      void refreshLatest(intent.previous);
      return;
    }
    if (intent.kind === "restore") {
      if (access.status === "ready") {
        void restorePersistedPlan(intent.planId, intent.pending, access.userId);
      }
      return;
    }
    if (presentation.action === "retry-same-operation") {
      void execute(intent.operation, intent.previous);
      return;
    }
    const operationId = newOperationId();
    if (operationId === null) return;
    void execute({ ...intent.operation, operationId }, intent.previous);
  }

  async function refreshLatest(previous = currentProposal) {
    if (previous === undefined || inFlightRef.current) return;
    inFlightRef.current = true;
    const epoch = sessionEpochRef.current;
    retryIntentRef.current = { kind: "refresh", previous };
    setUiState({ status: "loading", operation: "refine" });
    try {
      const result = await planner.getPlan(previous.planId, locale);
      if (!mountedRef.current || sessionEpochRef.current !== epoch) return;
      if (!result.ok) {
        setUiState({ status: "error", error: result.error, previous });
        return;
      }
      setNeedsFreshRevision(false);
      if (access.status === "ready") {
        const pointerSaved = saveRuntimePlanPointer(window.localStorage, {
          version: 1,
          ownerUserId: access.userId,
          planId: result.value.planId,
          savedAt: Date.now(),
        });
        if (!pointerSaved) {
          setUiState({
            status: "error",
            error: stableClientError(),
            previous: result.value,
            localIssue: "plan-pointer-storage",
          });
          return;
        }
      }
      setLockedItemIds((current) => {
        const available = new Set(result.value.items.map((item) => item.placeId));
        return new Set([...current].filter((itemId) => available.has(itemId)));
      });
      retryIntentRef.current = null;
      setUiState({ status: "ready", proposal: result.value });
    } catch {
      if (mountedRef.current && sessionEpochRef.current === epoch) {
        setUiState({ status: "error", error: stableClientError(), previous });
      }
    } finally {
      if (sessionEpochRef.current === epoch) inFlightRef.current = false;
    }
  }

  const errorPresentation = uiState.status === "error"
    ? runtimePlannerErrorUi(uiState.error)
    : null;

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

      {access.status === "ready" && access.request !== null && uiState.status === "idle" ? (
        <button className="button button--primary" type="button" onClick={generateProposal}>
          {copy.runtimeGenerateLabel}
        </button>
      ) : null}

      {uiState.status === "loading" ? (
        <div>
          <p role="status" aria-live="polite">
            {uiState.operation === "recommend"
              ? copy.runtimeGeneratingLabel
              : uiState.operation === "refine"
                ? copy.refiningLabel
                : copy.runtimeLoadingLabel}
          </p>
          <button className="button button--primary" type="button" disabled>
            {uiState.operation === "recommend"
              ? copy.runtimeGeneratingLabel
              : uiState.operation === "refine"
                ? copy.refiningLabel
                : copy.runtimeLoadingLabel}
          </button>
        </div>
      ) : null}

      {uiState.status === "error" ? (
        <div className="planner-flow__error" role="alert">
          <p>{errorMessage(uiState.error, copy, uiState.localIssue)}</p>
          {errorPresentation?.action === "sign-in" ? (
            <Link className="button button--primary" href={signInPath(locale, `/${locale}/planner/`)}>
              {copy.runtimeSignInLabel}
            </Link>
          ) : null}
          {errorPresentation?.action === "edit-request" ? (
            <Link className="button button--secondary" href={`/${locale}/#personalize`}>
              {copy.backToPersonalizationLabel}
            </Link>
          ) : null}
          {errorPresentation?.action === "refresh-plan" && uiState.previous ? (
            <button className="button button--secondary" type="button" onClick={() => void refreshLatest()}>
              {copy.refreshLabel}
            </button>
          ) : null}
          {(errorPresentation?.action === "retry-same-operation" || errorPresentation?.action === "retry-new-operation") && retryIntentRef.current !== null ? (
            <button className="button button--secondary" type="button" onClick={retryLastOperation}>
              {errorPresentation.action === "retry-new-operation"
                ? copy.runtimeNewRequestLabel
                : uiState.error.code === "OPERATION_IN_PROGRESS"
                  ? copy.runtimeCheckAgainLabel
                  : copy.runtimeRetryLabel}
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
            <p id="runtime-planner-feedback-hint" className="planner-flow__hint">
              {copy.runtimeFeedbackSupportedHint}
            </p>
            {validationError ? <p className="planner-flow__error" role="alert">{validationError}</p> : null}
            <button
              className="button button--primary"
              type="submit"
              disabled={uiState.status === "loading" || needsFreshRevision}
            >
              {uiState.status === "loading" && uiState.operation === "refine" ? copy.refiningLabel : copy.refineLabel}
            </button>
          </form>
          <Link className="button button--secondary" href={`/${locale}/tours/`}>
            {copy.fixedToursLabel}
          </Link>
        </>
      ) : null}

      <Link className="button button--secondary" href={`/${locale}/`}>{copy.backHomeLabel}</Link>
    </section>
  );
}
