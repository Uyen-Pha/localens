import {
  isPersonalizationRequest,
  readPersonalizationState,
  type PersonalizationOwnerScope,
  type PersonalizationRequest,
} from "@/lib/application/planner/personalization-session";
import type { DemoPlannerRevision, DemoPlannerItem, DemoPlannerState } from "@/lib/application/planner/demo-planner";
import type { ItineraryPreviewFoodSelectionDto } from "@/lib/application/api/read-only-api";
import type { Locale } from "@/lib/i18n/config";

export const CUSTOM_REQUEST_SESSION_KEY = "localens.custom-request.v1";
export const CUSTOM_REQUEST_SESSION_TTL_MS = 30 * 60 * 1000;

export type CustomRequestDraft = Readonly<{
  planId: string;
  revision: number;
  preferences: PersonalizationRequest;
  revisionSnapshot: DemoPlannerRevision;
  integrityFingerprint: string;
  /** Present on new handoffs; omitted only for legacy local drafts. */
  handoffId?: string;
  ownerScope?: PersonalizationOwnerScope;
  originalExpiresAt?: number;
  locale?: Locale;
  requestId?: string;
}>;

export type CustomRequestDraftInput = Omit<CustomRequestDraft, "integrityFingerprint">;

export function customRequestDraftFromPlanner(
  state: DemoPlannerState,
): CustomRequestDraftInput {
  if (state.preferences === null || state.current.items.length === 0) {
    throw new Error("A confirmed planner revision is required");
  }

  const input: CustomRequestDraftInput = {
    planId: state.planId,
    revision: state.current.revision,
    preferences: state.preferences,
    revisionSnapshot: state.current,
  };
  const handoff = readPersonalizationState();
  if (handoff.status !== "ok" || JSON.stringify(handoff.request) !== JSON.stringify(state.preferences)) return input;
  return {
    ...input,
    handoffId: handoff.handoffId,
    ownerScope: handoff.ownerScope,
    originalExpiresAt: handoff.originalExpiresAt,
    locale: state.locale,
    requestId: stableCustomRequestId({ ...input, handoffId: handoff.handoffId }),
  };
}

export function stableCustomRequestId(draft: Pick<CustomRequestDraftInput, "planId" | "revision" | "handoffId">): string {
  return draft.handoffId === undefined
    ? `demo-request-${draft.planId}-${draft.revision}`
    : `demo-request-${draft.handoffId}-${draft.revision}`;
}

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

const FOOD_SELECTION_FIELDS = [
  "venueTitle",
  "vendorTitle",
  "locationNote",
  "menuTitle",
  "servingUnit",
  "quantity",
  "priceVndMin",
  "priceVndMax",
  "activity",
  "dietaryAllergenCaveat",
  "accessibilityVendorWarning",
  "paymentMode",
] as const;

function isFoodSelection(value: unknown): value is ItineraryPreviewFoodSelectionDto {
  if (!isRecord(value)) return false;
  if (Object.keys(value).some((key) => !FOOD_SELECTION_FIELDS.includes(key as (typeof FOOD_SELECTION_FIELDS)[number]))) return false;
  if (FOOD_SELECTION_FIELDS.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) return false;
  return (
    typeof value.venueTitle === "string" && value.venueTitle.length > 0 &&
    typeof value.vendorTitle === "string" && value.vendorTitle.length > 0 &&
    typeof value.locationNote === "string" && value.locationNote.length > 0 &&
    typeof value.menuTitle === "string" && value.menuTitle.length > 0 &&
    (value.servingUnit === "portion" || value.servingUnit === "bowl" || value.servingUnit === "piece" || value.servingUnit === "drink" || value.servingUnit === "shared_set") &&
    isSafeNonNegativeNumber(value.quantity) && value.quantity > 0 &&
    isSafeNonNegativeNumber(value.priceVndMin) && isSafeNonNegativeNumber(value.priceVndMax) && value.priceVndMin <= value.priceVndMax &&
    typeof value.activity === "string" && value.activity.length > 0 &&
    typeof value.dietaryAllergenCaveat === "string" && value.dietaryAllergenCaveat.length > 0 &&
    typeof value.accessibilityVendorWarning === "string" && value.accessibilityVendorWarning.length > 0 &&
    value.paymentMode === "pay_at_vendor"
  );
}

const FNV32_PRIME = 16_777_619;

function fnv1a32(value: string, offset: number): string {
  let hash = offset >>> 0;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, FNV32_PRIME) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function canonicalDraftMaterial(draft: CustomRequestDraftInput): string {
  const handoffMaterial = draft.handoffId === undefined
    ? {}
    : {
      handoffId: draft.handoffId,
      ownerScope: draft.ownerScope,
      originalExpiresAt: draft.originalExpiresAt,
      locale: draft.locale,
      requestId: draft.requestId,
    };
  return JSON.stringify({
    planId: draft.planId,
    revision: draft.revision,
    preferences: {
      startAt: draft.preferences.startAt,
      durationMinutes: draft.preferences.durationMinutes,
      areas: draft.preferences.areas,
      budget: draft.preferences.budget,
      partySize: draft.preferences.partySize,
      guideLanguage: draft.preferences.guideLanguage,
      priorityWeights: draft.preferences.priorityWeights,
      pace: draft.preferences.pace,
      dietaryRequirements: draft.preferences.dietaryRequirements,
      mobilityRequirements: draft.preferences.mobilityRequirements,
      lockedStopIds: draft.preferences.lockedStopIds,
      specialNeeds: draft.preferences.specialNeeds,
    },
    revisionSnapshot: {
      revision: draft.revisionSnapshot.revision,
      budgetVnd: draft.revisionSnapshot.budgetVnd,
      items: draft.revisionSnapshot.items.map((item) => ({
        id: item.id,
        placeId: item.placeId,
        title: item.title,
        startAt: item.startAt,
        endAt: item.endAt,
        activity: item.activity,
        visitDurationMinutes: item.visitDurationMinutes,
        travelMinutesBefore: item.travelMinutesBefore,
        transitionBufferMinutesBefore: item.transitionBufferMinutesBefore,
        travelCostVndBefore: item.travelCostVndBefore,
        placeCostVnd: item.placeCostVnd,
        foodSelection: item.foodSelection,
        foodCostMinVnd: item.foodCostMinVnd,
        foodCostMaxVnd: item.foodCostMaxVnd,
        payAtVendorMinVnd: item.payAtVendorMinVnd,
        payAtVendorMaxVnd: item.payAtVendorMaxVnd,
        customerPayableVnd: item.customerPayableVnd,
        locked: item.locked,
      })),
      totals: draft.revisionSnapshot.totals,
      warnings: draft.revisionSnapshot.warnings,
      feedback: draft.revisionSnapshot.feedback,
    },
    ...handoffMaterial,
  });
}

/** Local tamper detection only; this checksum is not a server security authority. */
export function localDraftFingerprint(draft: CustomRequestDraftInput): string {
  const material = canonicalDraftMaterial(draft);
  return [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b]
    .map((offset) => fnv1a32(material, offset))
    .join("");
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
    (value.foodSelection === null || isFoodSelection(value.foodSelection)) &&
    isSafeNonNegativeNumber(value.foodCostMinVnd) &&
    isSafeNonNegativeNumber(value.foodCostMaxVnd) &&
    value.foodCostMinVnd <= value.foodCostMaxVnd &&
    isSafeNonNegativeNumber(value.payAtVendorMinVnd) &&
    isSafeNonNegativeNumber(value.payAtVendorMaxVnd) &&
    value.payAtVendorMinVnd <= value.payAtVendorMaxVnd &&
    isSafeNonNegativeNumber(value.customerPayableVnd) &&
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
    (total, item) => total + item.customerPayableVnd,
    0,
  );
  const admissionCostVnd = items.reduce((total, item) => total + item.placeCostVnd, 0);
  const foodCostMinVnd = items.reduce((total, item) => total + item.foodCostMinVnd, 0);
  const foodCostMaxVnd = items.reduce((total, item) => total + item.foodCostMaxVnd, 0);
  const travelCostVnd = items.reduce((total, item) => total + item.travelCostVndBefore, 0);
  const payAtVendorMinVnd = items.reduce((total, item) => total + item.payAtVendorMinVnd, 0);
  const payAtVendorMaxVnd = items.reduce((total, item) => total + item.payAtVendorMaxVnd, 0);
  const groupCostMinVnd = admissionCostVnd + foodCostMinVnd + travelCostVnd;
  const groupCostMaxVnd = admissionCostVnd + foodCostMaxVnd + travelCostVnd;
  return (
    isSafeNonNegativeNumber(value.totals.durationMinutes) &&
    isSafeNonNegativeNumber(value.totals.costVnd) &&
    value.totals.durationMinutes === durationMinutes &&
    value.totals.costVnd === costVnd &&
    isSafeNonNegativeNumber(value.totals.admissionCostVnd) &&
    isSafeNonNegativeNumber(value.totals.foodCostMinVnd) &&
    isSafeNonNegativeNumber(value.totals.foodCostMaxVnd) &&
    isSafeNonNegativeNumber(value.totals.travelCostVnd) &&
    isSafeNonNegativeNumber(value.totals.guideCostVnd) &&
    isSafeNonNegativeNumber(value.totals.payAtVendorMinVnd) &&
    isSafeNonNegativeNumber(value.totals.payAtVendorMaxVnd) &&
    isSafeNonNegativeNumber(value.totals.customerPayableVnd) &&
    isSafeNonNegativeNumber(value.totals.groupCostMinVnd) &&
    isSafeNonNegativeNumber(value.totals.groupCostMaxVnd) &&
    value.totals.admissionCostVnd === admissionCostVnd &&
    value.totals.foodCostMinVnd === foodCostMinVnd &&
    value.totals.foodCostMaxVnd === foodCostMaxVnd &&
    value.totals.travelCostVnd === travelCostVnd &&
    value.totals.guideCostVnd === 0 &&
    value.totals.payAtVendorMinVnd === payAtVendorMinVnd &&
    value.totals.payAtVendorMaxVnd === payAtVendorMaxVnd &&
    value.totals.customerPayableVnd === costVnd &&
    value.totals.groupCostMinVnd === groupCostMinVnd &&
    value.totals.groupCostMaxVnd === groupCostMaxVnd &&
    (value.budgetVnd === null || isSafeNonNegativeNumber(value.budgetVnd)) &&
    Array.isArray(value.warnings) && value.warnings.every((warning) => typeof warning === "string") &&
    typeof value.feedback === "string"
  );
}

function isCustomRequestDraftInput(value: unknown): value is CustomRequestDraftInput {
  if (
    !isRecord(value) ||
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1
  ) return false;
  const hasHandoffMetadata = ["handoffId", "ownerScope", "originalExpiresAt", "locale", "requestId"]
    .some((field) => Object.prototype.hasOwnProperty.call(value, field));
  const hasCompleteHandoffMetadata = !hasHandoffMetadata || (
    typeof value.handoffId === "string" && value.handoffId.length > 0 && value.handoffId.length <= 96 &&
    (value.ownerScope === "anonymous" || (typeof value.ownerScope === "string" && value.ownerScope.startsWith("customer:") && value.ownerScope.length <= 160)) &&
    typeof value.originalExpiresAt === "number" && Number.isSafeInteger(value.originalExpiresAt) && value.originalExpiresAt > 0 &&
    (value.locale === "en" || value.locale === "vi") &&
    typeof value.requestId === "string" && value.requestId === stableCustomRequestId(value as Pick<CustomRequestDraftInput, "planId" | "revision" | "handoffId">) && value.requestId.length <= 120
  );
  return (
    typeof value.planId === "string" && value.planId.length > 0 && value.planId.length <= 120 &&
    isPersonalizationRequest(value.preferences) &&
    isDemoPlannerRevision(value.revisionSnapshot) &&
    value.revisionSnapshot.revision === value.revision &&
    hasCompleteHandoffMetadata
  );
}

function isCustomRequestDraft(value: unknown): value is CustomRequestDraft {
  if (!isCustomRequestDraftInput(value) || !isRecord(value)) return false;
  const fingerprint = (value as Record<string, unknown>).integrityFingerprint;
  return typeof fingerprint === "string" && /^[0-9a-f]{32}$/.test(fingerprint);
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

export function saveCustomRequestDraft(draft: CustomRequestDraftInput): boolean {
  if (typeof window === "undefined" || !isCustomRequestDraftInput(draft)) return false;

  try {
    const storedDraft: CustomRequestDraft = {
      ...draft,
      integrityFingerprint: localDraftFingerprint(draft),
    };
    const serialized = JSON.stringify({ version: 1, savedAt: Date.now(), draft: storedDraft } satisfies CustomRequestEnvelope);
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
  const { integrityFingerprint, ...draftWithoutFingerprint } = parsed.draft;
  if (localDraftFingerprint(draftWithoutFingerprint) !== integrityFingerprint) return { status: "invalid" };
  if (parsed.savedAt > now) return { status: "invalid" };
  const expiresAt = parsed.draft.originalExpiresAt ?? parsed.savedAt + CUSTOM_REQUEST_SESSION_TTL_MS;
  if (expiresAt <= parsed.savedAt || now >= expiresAt) {
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
