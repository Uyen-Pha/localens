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
}>;

export const PERSONALIZATION_SESSION_KEY = "localens.personalization.v1";

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

function isPersonalizationRequest(value: unknown): value is PersonalizationRequest {
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
    isStringArray(value.lockedStopIds, 24, 120)
  );
}

export function savePersonalizationRequest(request: PersonalizationRequest): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(PERSONALIZATION_SESSION_KEY, JSON.stringify(request));
  } catch {
    // Storage can be disabled or full. The planner remains usable with its default fixture.
  }
}

export function readPersonalizationRequest(): PersonalizationRequest | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(PERSONALIZATION_SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPersonalizationRequest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPersonalizationRequest(): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(PERSONALIZATION_SESSION_KEY);
  } catch {
    // Ignore storage failures; this helper is best-effort by design.
  }
}
