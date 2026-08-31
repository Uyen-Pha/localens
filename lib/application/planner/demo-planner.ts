import type { Locale } from "@/lib/i18n/config";
import {
  createReadOnlyApi,
  type ItineraryPreviewFoodSelectionDto,
  type ItineraryPreviewItemDto,
  type ReadOnlyApi,
} from "@/lib/application/api/read-only-api";
import {
  toItineraryRequest,
  type PersonalizationRequest,
} from "@/lib/application/planner/personalization-session";
import {
  totalsFor,
} from "@/lib/application/planner/e2e-planner-state-validator";

export { E2E_PLANNER_STATE_SESSION_KEY, readE2EPlannerState } from "@/lib/application/planner/e2e-planner-state-validator";

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

const defaultReadOnlyApi = createReadOnlyApi();
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

function feedbackRequestsFoodRemoval(feedback: string): boolean {
  const normalized = feedback.toLocaleLowerCase("en-US");
  if (/(?:\b(?:do not|don't|dont|not)\s+(?:remove|skip|drop|omit)\s+(?:the\s+)?food\b|\bno\s+food\s+allerg(?:y|ies)\b)/u.test(normalized)
    || /\b(?:không|đừng)\s+(?:bỏ|xoá|xóa)\s+(?:món|ẩm thực)\b/u.test(normalized)) return false;
  return /\b(?:remove|skip|drop|omit)\s+(?:the\s+)?food(?:\s+stop)?\b/u.test(normalized)
    || /\b(?:bỏ|xoá|xóa)\s+(?:món|ẩm thực)\b/u.test(normalized);
}

function withoutFoodSelection(item: DemoPlannerItem): DemoPlannerItem {
  return {
    ...item,
    foodSelection: null,
    foodCostMinVnd: 0,
    foodCostMaxVnd: 0,
    payAtVendorMinVnd: 0,
    payAtVendorMaxVnd: 0,
  };
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
      const removeFoodSelection = feedbackRequestsFoodRemoval(feedback);
      const items = state.current.items.map((item) => {
        const locked = lockedIds.has(item.id);
        if (locked) return cloneItem(item, true);
        const next = { ...cloneItem(item, false), activity: adjustedActivity(feedback, state.locale) };
        return removeFoodSelection && next.foodSelection !== null ? withoutFoodSelection(next) : next;
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
