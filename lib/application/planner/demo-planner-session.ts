import type { Locale } from "@/lib/i18n/config";
import type { DemoPlannerState } from "@/lib/application/planner/demo-planner";
import { isStrictPlannerState } from "@/lib/application/planner/e2e-planner-state-validator";
import {
  DEMO_PLANNER_SESSION_KEY,
  PERSONALIZATION_SESSION_TTL_MS,
} from "@/lib/application/planner/personalization-session";

export const DEMO_PLANNER_SESSION_MAX_CHARS = 256_000;
export const DEMO_PLANNER_SESSION_MAX_OPERATIONS = 12;

export type DemoPlannerOperation = Readonly<{
  type: "lock" | "refine";
  itemId?: string;
  locked?: boolean;
  feedback?: string;
  lockedItemIds?: readonly string[];
  resultRevision: number;
}>;

export type DemoPlannerSession = Readonly<{
  version: 1;
  handoffId: string;
  ownerScope: "anonymous" | `customer:${string}`;
  createdAt: number;
  originalExpiresAt: number;
  locale: Locale;
  state: DemoPlannerState;
  operations: readonly DemoPlannerOperation[];
}>;

export type DemoPlannerSessionReadState =
  | Readonly<{ status: "ok"; session: DemoPlannerSession }>
  | Readonly<{ status: "missing" | "expired" | "invalid" | "storage-error" | "owner-mismatch" }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isState(value: unknown, locale: Locale): value is DemoPlannerState {
  return isStrictPlannerState(value, locale);
}

function isOperation(value: unknown): value is DemoPlannerOperation {
  if (!isRecord(value) || (value.type !== "lock" && value.type !== "refine")) return false;
  if (typeof value.resultRevision !== "number" || !Number.isSafeInteger(value.resultRevision) || value.resultRevision < 1) return false;
  if (value.type === "lock") return typeof value.itemId === "string" && typeof value.locked === "boolean";
  return typeof value.feedback === "string" && value.feedback.length > 0 &&
    Array.isArray(value.lockedItemIds) && value.lockedItemIds.every((id) => typeof id === "string");
}

function isOwnerScope(value: unknown): value is DemoPlannerSession["ownerScope"] {
  return value === "anonymous" || (typeof value === "string" && value.startsWith("customer:") && value.length <= 160);
}

function isSession(value: unknown): value is DemoPlannerSession {
  return isRecord(value) && value.version === 1 &&
    typeof value.handoffId === "string" && value.handoffId.length > 0 && value.handoffId.length <= 96 &&
    isOwnerScope(value.ownerScope) &&
    typeof value.createdAt === "number" && Number.isSafeInteger(value.createdAt) &&
    typeof value.originalExpiresAt === "number" && Number.isSafeInteger(value.originalExpiresAt) &&
    (value.locale === "en" || value.locale === "vi") && isState(value.state, value.locale) &&
    Array.isArray(value.operations) && value.operations.length <= DEMO_PLANNER_SESSION_MAX_OPERATIONS &&
    value.operations.every(isOperation);
}

function newHandoffId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // Fall through to a best-effort local identifier.
  }
  return `planner-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function readDemoPlannerSession(
  now = Date.now(),
  expectedOwnerScope?: DemoPlannerSession["ownerScope"],
): DemoPlannerSessionReadState {
  if (typeof window === "undefined") return { status: "missing" };
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(DEMO_PLANNER_SESSION_KEY);
  } catch {
    return { status: "storage-error" };
  }
  if (!raw) return { status: "missing" };
  if (raw.length > DEMO_PLANNER_SESSION_MAX_CHARS) return { status: "invalid" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "invalid" };
  }
  if (!isSession(parsed)) return { status: "invalid" };
  if (parsed.createdAt > now || parsed.originalExpiresAt !== parsed.createdAt + PERSONALIZATION_SESSION_TTL_MS) {
    return { status: "invalid" };
  }
  if (parsed.originalExpiresAt <= now) {
    try { window.sessionStorage.removeItem(DEMO_PLANNER_SESSION_KEY); } catch { /* best effort */ }
    return { status: "expired" };
  }
  if (expectedOwnerScope !== undefined && parsed.ownerScope !== expectedOwnerScope) return { status: "owner-mismatch" };
  return { status: "ok", session: parsed };
}

export function saveDemoPlannerSession(
  state: DemoPlannerState,
  operation: DemoPlannerOperation,
  ownerScope: DemoPlannerSession["ownerScope"] = "anonymous",
  now = Date.now(),
): boolean {
  if (typeof window === "undefined" || !isState(state, state.locale) || !isOperation(operation)) return false;
  const current = readDemoPlannerSession(now, ownerScope);
  const session: DemoPlannerSession = current.status === "ok" && current.session.locale === state.locale
    ? { ...current.session, state, operations: [...current.session.operations, operation].slice(-DEMO_PLANNER_SESSION_MAX_OPERATIONS) }
    : {
      version: 1,
      handoffId: newHandoffId(),
      ownerScope,
      createdAt: now,
      originalExpiresAt: now + PERSONALIZATION_SESSION_TTL_MS,
      locale: state.locale,
      state,
      operations: [operation],
    };
  try {
    const serialized = JSON.stringify(session);
    if (serialized.length > DEMO_PLANNER_SESSION_MAX_CHARS) return false;
    window.sessionStorage.setItem(DEMO_PLANNER_SESSION_KEY, serialized);
    return window.sessionStorage.getItem(DEMO_PLANNER_SESSION_KEY) === serialized;
  } catch {
    return false;
  }
}

export function clearDemoPlannerSession(): void {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.removeItem(DEMO_PLANNER_SESSION_KEY); } catch { /* best effort */ }
}
