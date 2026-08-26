import type { PersonalizationPriorityKey } from "@/lib/i18n/dictionaries";

export type PersonalizationRequest = Readonly<{
  startAt: string;
  durationMinutes: number;
  areas: readonly string[];
  budget: Readonly<{ currency: "VND" | "USD"; amountMinor: number }>;
  partySize: number;
  guideLanguage: "en" | "vi";
  priorityWeights: Readonly<Record<PersonalizationPriorityKey, 0 | 1 | 2 | 3 | 4 | 5>>;
  pace: "relaxed" | "active";
  dietaryRequirements: readonly string[];
  mobilityRequirements: readonly string[];
  lockedStopIds: readonly string[];
  specialNeeds: string;
}>;

export const PERSONALIZATION_SESSION_KEY = "localens.personalization.v1";
export const PERSONALIZATION_SESSION_TTL_MS = 30 * 60 * 1000;

const PRIORITY_KEYS: readonly PersonalizationPriorityKey[] = [
  "street_food",
  "history",
  "traditional_craft",
  "traditional_market",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isStringArray(value: unknown, maxItems: number, maxLength: number): value is readonly string[] {
  return Array.isArray(value) && value.length <= maxItems && value.every((item) => isBoundedString(item, maxLength));
}

function isValidHcmTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):00\+07:00$/.exec(value);
  if (!match) return false;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  if (hour > 23 || minute > 59) return false;

  const dateValue = new Date(`${match[1]}T00:00:00Z`);
  return Number.isFinite(dateValue.valueOf()) && dateValue.toISOString().slice(0, 10) === match[1];
}

function isPriorityWeights(value: unknown): value is PersonalizationRequest["priorityWeights"] {
  if (!isRecord(value)) return false;
  return PRIORITY_KEYS.every((key) => {
    const weight = value[key];
    return typeof weight === "number" && Number.isInteger(weight) && weight >= 0 && weight <= 5;
  });
}

export function isPersonalizationRequest(value: unknown): value is PersonalizationRequest {
  if (!isRecord(value) || !isRecord(value.budget)) return false;

  const budget = value.budget;
  return (
    isValidHcmTimestamp(value.startAt) &&
    typeof value.durationMinutes === "number" &&
    Number.isInteger(value.durationMinutes) &&
    value.durationMinutes >= 60 &&
    value.durationMinutes <= 720 &&
    isStringArray(value.areas, 8, 80) &&
    value.areas.length > 0 &&
    (budget.currency === "VND" || budget.currency === "USD") &&
    typeof budget.amountMinor === "number" &&
    Number.isSafeInteger(budget.amountMinor) &&
    budget.amountMinor > 0 &&
    typeof value.partySize === "number" &&
    Number.isSafeInteger(value.partySize) &&
    value.partySize >= 1 &&
    value.partySize <= 20 &&
    (value.guideLanguage === "en" || value.guideLanguage === "vi") &&
    isPriorityWeights(value.priorityWeights) &&
    (value.pace === "relaxed" || value.pace === "active") &&
    isStringArray(value.dietaryRequirements, 8, 80) &&
    isStringArray(value.mobilityRequirements, 8, 80) &&
    isStringArray(value.lockedStopIds, 24, 120) &&
    typeof value.specialNeeds === "string" &&
    value.specialNeeds.length <= 1000
  );
}

type PersonalizationEnvelope = Readonly<{
  version: 1;
  savedAt: number;
  request: PersonalizationRequest;
}>;

export type PersonalizationReadState =
  | Readonly<{ status: "ok"; request: PersonalizationRequest }>
  | Readonly<{ status: "missing" }>
  | Readonly<{ status: "expired" }>
  | Readonly<{ status: "invalid" }>
  | Readonly<{ status: "storage-error" }>;

function isPersonalizationEnvelope(value: unknown): value is PersonalizationEnvelope {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.savedAt === "number" &&
    Number.isSafeInteger(value.savedAt) &&
    isPersonalizationRequest(value.request)
  );
}

export function savePersonalizationRequest(request: PersonalizationRequest): boolean {
  if (typeof window === "undefined" || !isPersonalizationRequest(request)) return false;

  try {
    const envelope: PersonalizationEnvelope = { version: 1, savedAt: Date.now(), request };
    const serialized = JSON.stringify(envelope);
    window.sessionStorage.setItem(PERSONALIZATION_SESSION_KEY, serialized);
    return window.sessionStorage.getItem(PERSONALIZATION_SESSION_KEY) === serialized;
  } catch {
    return false;
  }
}

export function readPersonalizationState(now = Date.now()): PersonalizationReadState {
  if (typeof window === "undefined") return { status: "missing" };

  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(PERSONALIZATION_SESSION_KEY);
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

  if (!isPersonalizationEnvelope(parsed)) return { status: "invalid" };
  if (parsed.savedAt > now) return { status: "invalid" };
  if (now - parsed.savedAt > PERSONALIZATION_SESSION_TTL_MS) {
    try {
      window.sessionStorage.removeItem(PERSONALIZATION_SESSION_KEY);
    } catch {
      // The payload is still expired even if cleanup is blocked by storage policy.
    }
    return { status: "expired" };
  }
  return { status: "ok", request: parsed.request };
}

export function readPersonalizationRequest(now = Date.now()): PersonalizationRequest | null {
  const state = readPersonalizationState(now);
  return state.status === "ok" ? state.request : null;
}

export function clearPersonalizationRequest(): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(PERSONALIZATION_SESSION_KEY);
  } catch {
    // Ignore storage failures; this helper is best-effort by design.
  }
}

/** Keep free-text notes in the local handoff while excluding them from the strict itinerary engine contract. */
export function toItineraryRequest(request: PersonalizationRequest): Omit<PersonalizationRequest, "specialNeeds"> {
  const itineraryRequest = { ...request } as PersonalizationRequest & { specialNeeds?: string };
  Reflect.deleteProperty(itineraryRequest, "specialNeeds");
  return itineraryRequest as Omit<PersonalizationRequest, "specialNeeds">;
}
