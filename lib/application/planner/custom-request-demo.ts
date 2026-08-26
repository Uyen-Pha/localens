import {
  isPersonalizationRequest,
  type PersonalizationRequest,
} from "@/lib/application/planner/personalization-session";
import type { DemoPlannerRevision, DemoPlannerItem } from "@/lib/application/planner/demo-planner";

export const CUSTOM_REQUEST_SESSION_KEY = "localens.custom-request.v1";
export const CUSTOM_REQUEST_SESSION_TTL_MS = 30 * 60 * 1000;

export type CustomRequestDraft = Readonly<{
  planId: string;
  revision: number;
  preferences: PersonalizationRequest;
  revisionSnapshot: DemoPlannerRevision;
}>;

export type CustomRequestDraftReadState =
  | Readonly<{ status: "ok"; draft: CustomRequestDraft }>
  | Readonly<{ status: "missing" }>
  | Readonly<{ status: "expired" }>
  | Readonly<{ status: "invalid" }>
  | Readonly<{ status: "storage-error" }>;

type CustomRequestEnvelope = Readonly<{
  version: 1;
  savedAt: number;
  draft: CustomRequestDraft;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isDemoPlannerItem(value: unknown): value is DemoPlannerItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" && value.id.length > 0 &&
    typeof value.placeId === "string" && value.placeId.length > 0 &&
    typeof value.title === "string" && value.title.length > 0 &&
    typeof value.startAt === "string" && value.startAt.length > 0 &&
    typeof value.endAt === "string" && value.endAt.length > 0 &&
    typeof value.activity === "string" && value.activity.length > 0 &&
    isSafeNonNegativeNumber(value.visitDurationMinutes) &&
    isSafeNonNegativeNumber(value.travelMinutesBefore) &&
    (value.transitionBufferMinutesBefore === 0 || value.transitionBufferMinutesBefore === 10) &&
    isSafeNonNegativeNumber(value.travelCostVndBefore) &&
    isSafeNonNegativeNumber(value.placeCostVnd) &&
    typeof value.locked === "boolean"
  );
}

function isDemoPlannerRevision(value: unknown): value is DemoPlannerRevision {
  if (
    !isRecord(value) ||
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1
  ) return false;
  if (!Array.isArray(value.items) || value.items.length === 0 || value.items.length > 12 || !value.items.every(isDemoPlannerItem)) return false;
  if (!isRecord(value.totals)) return false;
  const items = value.items as DemoPlannerItem[];
  const durationMinutes = items.reduce(
    (total, item) => total + item.visitDurationMinutes + item.travelMinutesBefore + item.transitionBufferMinutesBefore,
    0,
  );
  const costVnd = items.reduce(
    (total, item) => total + item.travelCostVndBefore + item.placeCostVnd,
    0,
  );
  return (
    isSafeNonNegativeNumber(value.totals.durationMinutes) &&
    isSafeNonNegativeNumber(value.totals.costVnd) &&
    value.totals.durationMinutes === durationMinutes &&
    value.totals.costVnd === costVnd &&
    Array.isArray(value.warnings) && value.warnings.every((warning) => typeof warning === "string") &&
    typeof value.feedback === "string"
  );
}

function isCustomRequestDraft(value: unknown): value is CustomRequestDraft {
  if (
    !isRecord(value) ||
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1
  ) return false;
  return (
    typeof value.planId === "string" && value.planId.length > 0 && value.planId.length <= 120 &&
    isPersonalizationRequest(value.preferences) &&
    isDemoPlannerRevision(value.revisionSnapshot) &&
    value.revisionSnapshot.revision === value.revision
  );
}

function isCustomRequestEnvelope(value: unknown): value is CustomRequestEnvelope {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.savedAt === "number" &&
    Number.isSafeInteger(value.savedAt) &&
    isCustomRequestDraft(value.draft)
  );
}

export function saveCustomRequestDraft(draft: CustomRequestDraft): boolean {
  if (typeof window === "undefined" || !isCustomRequestDraft(draft)) return false;

  try {
    const serialized = JSON.stringify({ version: 1, savedAt: Date.now(), draft } satisfies CustomRequestEnvelope);
    window.sessionStorage.setItem(CUSTOM_REQUEST_SESSION_KEY, serialized);
    return window.sessionStorage.getItem(CUSTOM_REQUEST_SESSION_KEY) === serialized;
  } catch {
    return false;
  }
}

export function readCustomRequestDraftState(now = Date.now()): CustomRequestDraftReadState {
  if (typeof window === "undefined") return { status: "missing" };

  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(CUSTOM_REQUEST_SESSION_KEY);
  } catch {
    return { status: "storage-error" };
  }
  if (!raw) return { status: "missing" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "invalid" };
  }
  if (!isCustomRequestEnvelope(parsed)) return { status: "invalid" };
  if (parsed.savedAt > now) return { status: "invalid" };
  if (now - parsed.savedAt > CUSTOM_REQUEST_SESSION_TTL_MS) {
    try {
      window.sessionStorage.removeItem(CUSTOM_REQUEST_SESSION_KEY);
    } catch {
      // The payload is expired even if cleanup is blocked by storage policy.
    }
    return { status: "expired" };
  }
  return { status: "ok", draft: parsed.draft };
}

export function clearCustomRequestDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(CUSTOM_REQUEST_SESSION_KEY);
  } catch {
    // Best-effort cleanup for this browser-only demo handoff.
  }
}
