import type { Locale } from "@/lib/i18n/config";
import {
  createReadOnlyApi,
  type ItineraryPreviewFoodSelectionDto,
  type ItineraryPreviewItemDto,
  type ReadOnlyApi,
} from "@/lib/application/api/read-only-api";
import {
  itineraryRequestSchema,
} from "@/lib/domain/itinerary/contracts";
import {
  isPersonalizationRequest,
  toItineraryRequest,
  type PersonalizationRequest,
} from "@/lib/application/planner/personalization-session";

export type DemoPlannerItem = Readonly<{
  id: string;
  placeId: string;
  title: string;
  startAt: string;
  endAt: string;
  activity: string;
  visitDurationMinutes: number;
  travelMinutesBefore: number;
  transitionBufferMinutesBefore: 0 | 10;
  travelCostVndBefore: number;
  placeCostVnd: number;
  foodSelection: ItineraryPreviewFoodSelectionDto | null;
  foodCostMinVnd: number;
  foodCostMaxVnd: number;
  payAtVendorMinVnd: number;
  payAtVendorMaxVnd: number;
  customerPayableVnd: number;
  locked: boolean;
}>;

export type DemoPlannerTotals = Readonly<{
  durationMinutes: number;
  costVnd: number;
  admissionCostVnd: number;
  foodCostMinVnd: number;
  foodCostMaxVnd: number;
  travelCostVnd: number;
  guideCostVnd: number;
  payAtVendorMinVnd: number;
  payAtVendorMaxVnd: number;
  customerPayableVnd: number;
  groupCostMinVnd: number;
  groupCostMaxVnd: number;
}>;

export type DemoPlannerRevision = Readonly<{
  revision: number;
  /** Server-normalized budget in VND for this immutable revision snapshot. */
  budgetVnd: number | null;
  items: readonly DemoPlannerItem[];
  totals: DemoPlannerTotals;
  warnings: readonly string[];
  feedback: string;
}>;

export type DemoPlannerState = Readonly<{
  planId: string;
  locale: Locale;
  preferences: PersonalizationRequest | null;
  current: DemoPlannerRevision;
  history: readonly DemoPlannerRevision[];
}>;

export type DemoPlannerRefineInput = Readonly<{
  baseRevision: number;
  feedback: string;
  lockedItemIds: readonly string[];
}>;

export type DemoPlannerError = Readonly<{
  code: "STALE_REVISION";
  expectedRevision: number;
}> | Readonly<{
  code: "INVALID_FEEDBACK";
}>;

export type DemoPlannerResult =
  | { ok: true; state: DemoPlannerState }
  | { ok: false; error: DemoPlannerError };

export type PlannerAdapter = Readonly<{
  createInitial: (locale?: Locale, preferences?: PersonalizationRequest | null) => DemoPlannerState;
  getLatest: (current: DemoPlannerState, planId: string, locale: Locale) => DemoPlannerState;
  refine: (state: DemoPlannerState, input: DemoPlannerRefineInput) => DemoPlannerResult;
}>;

const PLAN_ID = "demo-plan-hcmc-cultural-day";
const LOCALE_COPY: Record<Locale, Readonly<{ warning: string; revisionWarning: string }>> = {
  en: {
    warning: "Demo proposal only: operating hours and availability still require company confirmation.",
    revisionWarning: "This simulated revision has not been validated by the backend yet.",
  },
  vi: {
    warning: "Chỉ là đề xuất demo: giờ hoạt động và tình trạng nhận khách vẫn cần công ty xác nhận.",
    revisionWarning: "Phiên bản mô phỏng này chưa được backend kiểm tra.",
  },
};

const PLANNER_COPY: Record<Locale, Readonly<{ noProposal: string }>> = {
  en: { noProposal: "No demo proposal was created because the submitted constraints have no feasible route." },
  vi: { noProposal: "Chưa tạo được đề xuất demo vì không có lịch trình khả thi với các điều kiện đã nhập." },
};

/** Browser-only test seam. Production and normal local demos ignore this key. */
export const E2E_PLANNER_STATE_SESSION_KEY = "localens.planner.e2e.v1";

const defaultReadOnlyApi = createReadOnlyApi();

const PLANNER_STATE_KEYS = ["planId", "locale", "preferences", "current", "history"] as const;
const PLANNER_REVISION_KEYS = ["revision", "budgetVnd", "items", "totals", "warnings", "feedback"] as const;
const PLANNER_ITEM_KEYS = [
  "id",
  "placeId",
  "title",
  "startAt",
  "endAt",
  "activity",
  "visitDurationMinutes",
  "travelMinutesBefore",
  "transitionBufferMinutesBefore",
  "travelCostVndBefore",
  "placeCostVnd",
  "foodSelection",
  "foodCostMinVnd",
  "foodCostMaxVnd",
  "payAtVendorMinVnd",
  "payAtVendorMaxVnd",
  "customerPayableVnd",
  "locked",
] as const;
const PLANNER_TOTAL_KEYS = [
  "durationMinutes",
  "costVnd",
  "admissionCostVnd",
  "foodCostMinVnd",
  "foodCostMaxVnd",
  "travelCostVnd",
  "guideCostVnd",
  "payAtVendorMinVnd",
  "payAtVendorMaxVnd",
  "customerPayableVnd",
  "groupCostMinVnd",
  "groupCostMaxVnd",
] as const;
const FOOD_SELECTION_KEYS = [
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
const PERSONALIZATION_KEYS = [
  "startAt",
  "durationMinutes",
  "areas",
  "budget",
  "partySize",
  "guideLanguage",
  "priorityWeights",
  "pace",
  "dietaryRequirements",
  "mobilityRequirements",
  "lockedStopIds",
  "specialNeeds",
] as const;
const BUDGET_KEYS = ["currency", "amountMinor"] as const;
const PRIORITY_KEYS = ["street_food", "history", "traditional_craft", "traditional_market"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key)) && actual.every((key) => keys.includes(key));
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isBoundedText(value: unknown, maxLength: number, allowEmpty = false): value is string {
  return typeof value === "string"
    && (allowEmpty ? value.length <= maxLength : value.length > 0 && value.length <= maxLength)
    && !/[\u0000-\u001F\u007F]/.test(value);
}

function isUniqueStringArray(value: unknown, maxLength: number, itemMaxLength: number): value is readonly string[] {
  return Array.isArray(value)
    && value.length <= maxLength
    && value.every((item) => isBoundedText(item, itemMaxLength))
    && new Set(value).size === value.length;
}

function isPlannerTime(value: unknown): value is string {
  return typeof value === "string"
    && (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
      || /^\d{4}-\d{2}-\d{2} (?:[01]\d|2[0-3]):[0-5]\d$/.test(value));
}

function isStrictPersonalizationRequest(value: unknown): value is PersonalizationRequest {
  if (!isRecord(value) || !hasExactKeys(value, PERSONALIZATION_KEYS) || !isPersonalizationRequest(value)) return false;
  if (!isRecord(value.budget) || !hasExactKeys(value.budget, BUDGET_KEYS)) return false;
  if (!isRecord(value.priorityWeights) || !hasExactKeys(value.priorityWeights, PRIORITY_KEYS)) return false;
  if (!isUniqueStringArray(value.areas, 8, 80)
    || !isUniqueStringArray(value.dietaryRequirements, 8, 80)
    || !isUniqueStringArray(value.mobilityRequirements, 8, 80)
    || !isUniqueStringArray(value.lockedStopIds, 24, 120)
    || !isBoundedText(value.specialNeeds, 1_000, true)) return false;
  return itineraryRequestSchema.safeParse(toItineraryRequest(value)).success;
}

function isStrictFoodSelection(value: unknown): value is ItineraryPreviewFoodSelectionDto {
  if (!isRecord(value) || !hasExactKeys(value, FOOD_SELECTION_KEYS)) return false;
  return isBoundedText(value.venueTitle, 2_000)
    && isBoundedText(value.vendorTitle, 2_000)
    && isBoundedText(value.locationNote, 2_000)
    && isBoundedText(value.menuTitle, 2_000)
    && (value.servingUnit === "portion" || value.servingUnit === "bowl" || value.servingUnit === "piece" || value.servingUnit === "drink" || value.servingUnit === "shared_set")
    && isSafeNonNegativeInteger(value.quantity)
    && value.quantity > 0
    && isSafeNonNegativeInteger(value.priceVndMin)
    && isSafeNonNegativeInteger(value.priceVndMax)
    && value.priceVndMin <= value.priceVndMax
    && isBoundedText(value.activity, 2_000)
    && isBoundedText(value.dietaryAllergenCaveat, 2_000)
    && isBoundedText(value.accessibilityVendorWarning, 2_000)
    && value.paymentMode === "pay_at_vendor";
}

function safeProduct(left: number, right: number): number | null {
  const value = left * right;
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function isStrictPlannerItem(value: unknown): value is DemoPlannerItem {
  if (!isRecord(value) || !hasExactKeys(value, PLANNER_ITEM_KEYS)) return false;
  if (!isBoundedText(value.id, 160)
    || !isBoundedText(value.placeId, 160)
    || !isBoundedText(value.title, 2_000)
    || !isPlannerTime(value.startAt)
    || !isPlannerTime(value.endAt)
    || !isBoundedText(value.activity, 2_000)
    || !isSafeNonNegativeInteger(value.visitDurationMinutes)
    || value.visitDurationMinutes < 15
    || value.visitDurationMinutes > 480
    || !isSafeNonNegativeInteger(value.travelMinutesBefore)
    || (value.transitionBufferMinutesBefore !== 0 && value.transitionBufferMinutesBefore !== 10)
    || !isSafeNonNegativeInteger(value.travelCostVndBefore)
    || !isSafeNonNegativeInteger(value.placeCostVnd)
    || !isSafeNonNegativeInteger(value.foodCostMinVnd)
    || !isSafeNonNegativeInteger(value.foodCostMaxVnd)
    || value.foodCostMinVnd > value.foodCostMaxVnd
    || !isSafeNonNegativeInteger(value.payAtVendorMinVnd)
    || !isSafeNonNegativeInteger(value.payAtVendorMaxVnd)
    || value.payAtVendorMinVnd > value.payAtVendorMaxVnd
    || !isSafeNonNegativeInteger(value.customerPayableVnd)
    || typeof value.locked !== "boolean") return false;

  if (value.foodSelection === null) {
    if (value.foodCostMinVnd !== 0 || value.foodCostMaxVnd !== 0 || value.payAtVendorMinVnd !== 0 || value.payAtVendorMaxVnd !== 0) return false;
  } else {
    if (!isStrictFoodSelection(value.foodSelection)) return false;
    const minCost = safeProduct(value.foodSelection.priceVndMin, value.foodSelection.quantity);
    const maxCost = safeProduct(value.foodSelection.priceVndMax, value.foodSelection.quantity);
    if (minCost === null || maxCost === null || value.foodCostMinVnd !== minCost || value.foodCostMaxVnd !== maxCost || value.payAtVendorMinVnd !== minCost || value.payAtVendorMaxVnd !== maxCost) return false;
  }
  return value.customerPayableVnd === value.placeCostVnd + value.travelCostVndBefore
    && Number.isSafeInteger(value.customerPayableVnd);
}

function totalsMatch(items: readonly DemoPlannerItem[], totals: DemoPlannerTotals): boolean {
  const expected = totalsFor(items);
  return PLANNER_TOTAL_KEYS.every((key) => totals[key] === expected[key]);
}

function isStrictPlannerTotals(value: unknown, items: readonly DemoPlannerItem[]): value is DemoPlannerTotals {
  if (!isRecord(value) || !hasExactKeys(value, PLANNER_TOTAL_KEYS)) return false;
  if (!PLANNER_TOTAL_KEYS.every((key) => isSafeNonNegativeInteger(value[key]))) return false;
  return totalsMatch(items, value as DemoPlannerTotals);
}

function isStrictPlannerRevision(value: unknown): value is DemoPlannerRevision {
  if (!isRecord(value) || !hasExactKeys(value, PLANNER_REVISION_KEYS)) return false;
  if (typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 1
    || !Array.isArray(value.items) || value.items.length > 8 || !value.items.every(isStrictPlannerItem)
    || (value.budgetVnd !== null && !isSafeNonNegativeInteger(value.budgetVnd))
    || !Array.isArray(value.warnings) || value.warnings.length > 24 || !value.warnings.every((warning) => isBoundedText(warning, 2_000))
    || !isBoundedText(value.feedback, 2_000, true)) return false;
  return isStrictPlannerTotals(value.totals, value.items);
}

function isStrictPlannerState(value: unknown, locale: Locale): value is DemoPlannerState {
  if (!isRecord(value) || !hasExactKeys(value, PLANNER_STATE_KEYS)
    || !isBoundedText(value.planId, 120)
    || value.locale !== locale
    || (value.preferences !== null && !isStrictPersonalizationRequest(value.preferences))
    || !isStrictPlannerRevision(value.current)
    || !Array.isArray(value.history) || value.history.length > 12 || !value.history.every(isStrictPlannerRevision)) return false;
  const current = value.current as DemoPlannerRevision;
  return (value.history as DemoPlannerRevision[]).every((revision) => revision.revision < current.revision);
}

/**
 * Read a fully validated planner snapshot supplied by the E2E harness. The
 * explicit public flag is compiled into the browser bundle and is off for all
 * normal development/production routes; malformed snapshots are ignored.
 */
export function readE2EPlannerState(locale: Locale): DemoPlannerState | null {
  if (process.env.NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES !== "1" || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(E2E_PLANNER_STATE_SESSION_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStrictPlannerState(parsed, locale) ? parsed : null;
  } catch {
    return null;
  }
}

const INITIAL_ITEM_FACTS = [
  {
    id: "demo-item-ben-thanh",
    placeId: "demo-hcmc-ben-thanh-market",
    startAt: "09:00",
    endAt: "10:00",
    title: {
      en: "Ben Thanh Market",
      vi: "Chợ Bến Thành",
    },
    activity: {
      en: "Browse market lanes and learn how locals shop for breakfast ingredients.",
      vi: "Khám phá các dãy chợ và tìm hiểu cách người địa phương mua nguyên liệu cho bữa sáng.",
    },
    visitDurationMinutes: 60,
    travelMinutesBefore: 0,
    transitionBufferMinutesBefore: 0,
    travelCostVndBefore: 0,
    placeCostVnd: 80_000,
    foodSelection: null,
    foodCostMinVnd: 0,
    foodCostMaxVnd: 0,
    payAtVendorMinVnd: 0,
    payAtVendorMaxVnd: 0,
    customerPayableVnd: 80_000,
    locked: false,
  },
  {
    id: "demo-item-war-remnants",
    placeId: "demo-hcmc-war-remnants",
    startAt: "10:20",
    endAt: "11:35",
    title: {
      en: "War Remnants Museum",
      vi: "Bảo tàng Chứng tích Chiến tranh",
    },
    activity: {
      en: "Follow a guided history story through the museum's documentary collections.",
      vi: "Theo dõi câu chuyện lịch sử qua các bộ sưu tập tư liệu của bảo tàng.",
    },
    visitDurationMinutes: 75,
    travelMinutesBefore: 10,
    transitionBufferMinutesBefore: 10,
    travelCostVndBefore: 25_000,
    placeCostVnd: 120_000,
    foodSelection: null,
    foodCostMinVnd: 0,
    foodCostMaxVnd: 0,
    payAtVendorMinVnd: 0,
    payAtVendorMaxVnd: 0,
    customerPayableVnd: 145_000,
    locked: false,
  },
  {
    id: "demo-item-street-food",
    placeId: "demo-hcmc-street-food",
    startAt: "11:55",
    endAt: "13:00",
    title: {
      en: "District 1 Street Food",
      vi: "Ẩm thực đường phố Quận 1",
    },
    activity: {
      en: "Explore the area; no vendor or menu item has been selected for this demo stop.",
      vi: "Khám phá khu vực; điểm dừng demo này chưa chọn nhà bán hàng hay món cụ thể.",
    },
    visitDurationMinutes: 65,
    travelMinutesBefore: 10,
    transitionBufferMinutesBefore: 10,
    travelCostVndBefore: 30_000,
    placeCostVnd: 0,
    foodSelection: null,
    foodCostMinVnd: 0,
    foodCostMaxVnd: 0,
    payAtVendorMinVnd: 0,
    payAtVendorMaxVnd: 0,
    customerPayableVnd: 30_000,
    locked: false,
  },
] as const;

function cloneItem(item: DemoPlannerItem, locked = item.locked): DemoPlannerItem {
  return { ...item, locked };
}

function totalsFor(items: readonly DemoPlannerItem[]): DemoPlannerTotals {
  const admissionCostVnd = items.reduce((total, item) => total + item.placeCostVnd, 0);
  const foodCostMinVnd = items.reduce((total, item) => total + item.foodCostMinVnd, 0);
  const foodCostMaxVnd = items.reduce((total, item) => total + item.foodCostMaxVnd, 0);
  const travelCostVnd = items.reduce((total, item) => total + item.travelCostVndBefore, 0);
  const payAtVendorMinVnd = items.reduce((total, item) => total + item.payAtVendorMinVnd, 0);
  const payAtVendorMaxVnd = items.reduce((total, item) => total + item.payAtVendorMaxVnd, 0);
  const customerPayableVnd = items.reduce((total, item) => total + item.customerPayableVnd, 0);
  const groupCostMinVnd = admissionCostVnd + foodCostMinVnd + travelCostVnd;
  const groupCostMaxVnd = admissionCostVnd + foodCostMaxVnd + travelCostVnd;
  return {
    durationMinutes: items.reduce(
      (total, item) =>
        total + item.visitDurationMinutes + item.travelMinutesBefore + item.transitionBufferMinutesBefore,
      0,
    ),
    // Keep the legacy quote field scoped to what LocalLens collects. Food
    // marked pay_at_vendor belongs only in the separate estimate fields.
    costVnd: customerPayableVnd,
    admissionCostVnd,
    foodCostMinVnd,
    foodCostMaxVnd,
    travelCostVnd,
    guideCostVnd: 0,
    payAtVendorMinVnd,
    payAtVendorMaxVnd,
    customerPayableVnd,
    groupCostMinVnd,
    groupCostMaxVnd,
  };
}

type HcmDateTime = Readonly<{ date: string; minute: number }>;

function parseHcmDateTime(value: string): HcmDateTime | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):00\+07:00$/.exec(value);
  if (!match) return null;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  if (hour > 23 || minute > 59) return null;
  const dateValue = new Date(`${match[1]}T00:00:00Z`);
  if (!Number.isFinite(dateValue.valueOf()) || dateValue.toISOString().slice(0, 10) !== match[1]) return null;
  return { date: match[1]!, minute: hour * 60 + minute };
}

function formatHcmDateTime(date: string, minute: number): string {
  const dateValue = new Date(`${date}T00:00:00Z`);
  dateValue.setUTCMinutes(minute);
  const nextDate = dateValue.toISOString().slice(0, 10);
  const hour = String(dateValue.getUTCHours()).padStart(2, "0");
  const nextMinute = String(dateValue.getUTCMinutes()).padStart(2, "0");
  return `${nextDate} ${hour}:${nextMinute}`;
}

function displayHcmTimestamp(value: string): string {
  return value.replace("T", " ").replace("+07:00", "").replace(/:00$/, "");
}

function mapPreviewItem(item: ItineraryPreviewItemDto, lockedStopIds: readonly string[], locale: Locale): DemoPlannerItem {
  return {
    id: `demo-generated-${item.placeId}`,
    placeId: item.placeId,
    title: item.placeTitle,
    startAt: displayHcmTimestamp(item.startAt),
    endAt: displayHcmTimestamp(item.endAt),
    activity: locale === "vi"
      ? "Khám phá địa điểm cùng hướng dẫn viên địa phương theo trình tự đề xuất."
      : "Review this place with a local guide and follow the proposed route.",
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
    locked: lockedStopIds.includes(item.placeId),
  };
}

function generatedItems(
  preferences: PersonalizationRequest,
  locale: Locale,
  readOnlyApi: ReadOnlyApi,
): { items: DemoPlannerItem[]; warning: string | null; budgetVnd: number | null } {
  const result = readOnlyApi.previewItinerary(toItineraryRequest(preferences));
  if (!result.ok || result.value.items.length === 0) {
    return { items: [], warning: PLANNER_COPY[locale].noProposal, budgetVnd: null };
  }

  const items = result.value.items.map((item) => mapPreviewItem(item, preferences.lockedStopIds, locale));
  const totals = totalsFor(items);
  if (
    totals.durationMinutes > preferences.durationMinutes ||
    totals.groupCostMaxVnd > result.value.budgetVnd
  ) {
    return { items: [], warning: PLANNER_COPY[locale].noProposal, budgetVnd: result.value.budgetVnd };
  }
  return { items, warning: null, budgetVnd: result.value.budgetVnd };
}

function shiftedItems(
  items: readonly DemoPlannerItem[],
  preferences: PersonalizationRequest | null,
): DemoPlannerItem[] {
  if (!preferences) return items.map((item) => cloneItem(item));
  const requestedStart = parseHcmDateTime(preferences.startAt);
  if (!requestedStart) return items.map((item) => cloneItem(item));

  const defaultStart = 9 * 60;
  return items.map((item) => {
    const itemStart = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(item.startAt);
    const itemEnd = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(item.endAt);
    if (!itemStart || !itemEnd) return cloneItem(item);
    const startMinute = Number(itemStart[1]) * 60 + Number(itemStart[2]);
    const endMinute = Number(itemEnd[1]) * 60 + Number(itemEnd[2]);
    const offset = requestedStart.minute - defaultStart;
    return {
      ...cloneItem(item),
      startAt: formatHcmDateTime(requestedStart.date, startMinute + offset),
      endAt: formatHcmDateTime(requestedStart.date, endMinute + offset),
    };
  });
}

function initialState(
  readOnlyApi: ReadOnlyApi,
  locale: Locale = "en",
  preferences?: PersonalizationRequest | null,
): DemoPlannerState {
  const fixtureItems = preferences === undefined
    ? shiftedItems(INITIAL_ITEM_FACTS.map((item) => ({
        ...item,
        title: item.title[locale],
        activity: item.activity[locale],
    })), null)
    : [];
  const generated = preferences === undefined
    ? { items: fixtureItems, warning: null, budgetVnd: null }
    : preferences === null
      ? { items: [], warning: PLANNER_COPY[locale].noProposal, budgetVnd: null }
      : generatedItems(preferences, locale, readOnlyApi);
  const warnings = [LOCALE_COPY[locale].warning];
  if (generated.warning !== null) warnings.push(PLANNER_COPY[locale].noProposal);
  return {
    planId: PLAN_ID,
    locale,
    preferences: preferences ?? null,
    current: {
      revision: 1,
      budgetVnd: generated.budgetVnd,
      items: generated.items,
      totals: totalsFor(generated.items),
      warnings,
      feedback: "",
    },
    history: [],
  };
}

function cloneState(state: DemoPlannerState, planId: string, locale: Locale): DemoPlannerState {
  return {
    planId,
    locale,
    preferences: state.preferences,
    current: {
      ...state.current,
      items: state.current.items.map((item) => cloneItem(item)),
      warnings: [...state.current.warnings],
    },
    history: state.history.map((revision) => ({
      ...revision,
      items: revision.items.map((item) => cloneItem(item)),
      warnings: [...revision.warnings],
    })),
  };
}

function adjustedActivity(feedback: string, locale: Locale): string {
  const normalized = feedback.toLocaleLowerCase("en-US");
  if (normalized.includes("food") || normalized.includes("ẩm thực")) {
    return locale === "vi"
      ? "Giữ lựa chọn món ăn ở trạng thái tuỳ chọn; demo này chưa chọn nhà bán hàng hay món cụ thể."
      : "Keep food optional; this demo has no selected vendor or menu item.";
  }
  if (normalized.includes("history") || normalized.includes("lịch sử")) {
    return locale === "vi"
      ? "Dành thêm thời gian cho bối cảnh lịch sử và câu hỏi cùng hướng dẫn viên tại điểm này."
      : "Make more room for the guide's historical context and questions at this stop.";
  }
  return locale === "vi"
    ? "Điều chỉnh trọng tâm tham quan theo phản hồi mới nhất của khách."
    : "Adjust the visit focus to reflect the latest traveler feedback.";
}

export function createDemoPlannerAdapter(
  options: Readonly<{ readOnlyApi?: ReadOnlyApi }> = {},
): PlannerAdapter {
  const readOnlyApi = options.readOnlyApi ?? defaultReadOnlyApi;
  return {
    createInitial: (locale = "en", preferences) => initialState(readOnlyApi, locale, preferences),
    getLatest(current, planId, locale) {
      return cloneState(current, planId, locale);
    },
    refine(state, input) {
      if (input.baseRevision !== state.current.revision) {
        return {
          ok: false,
          error: {
            code: "STALE_REVISION",
            expectedRevision: state.current.revision,
          },
        };
      }

      const feedback = input.feedback.trim();
      if (feedback.length === 0) {
        return { ok: false, error: { code: "INVALID_FEEDBACK" } };
      }
      const lockedIds = new Set(input.lockedItemIds);
      const items = state.current.items.map((item) => {
        const locked = lockedIds.has(item.id);
        if (locked) return cloneItem(item, true);
        return { ...cloneItem(item, false), activity: adjustedActivity(feedback, state.locale) };
      });

      const nextRevision: DemoPlannerRevision = {
        revision: state.current.revision + 1,
        budgetVnd: state.current.budgetVnd,
        items,
        totals: totalsFor(items),
        warnings: [LOCALE_COPY[state.locale].warning, LOCALE_COPY[state.locale].revisionWarning],
        feedback,
      };

      return {
        ok: true,
        state: {
          planId: state.planId,
          locale: state.locale,
          preferences: state.preferences,
          current: nextRevision,
          history: [...state.history, state.current],
        },
      };
    },
  };
}

export const demoPlannerAdapter = createDemoPlannerAdapter();
