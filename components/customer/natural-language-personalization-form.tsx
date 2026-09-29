"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import type { ItineraryPreviewDto, ReadOnlyApi } from "@/lib/application/api/read-only-api";
import { createReadOnlyApi } from "@/lib/application/api/read-only-api";
import { loadPortalSurfaceComposition } from "@/components/portals/portal-session";
import {
  parseNaturalLanguage,
  type NaturalLanguageAreaOption,
  type NaturalLanguageDraft,
  type NaturalLanguageField,
  type NaturalLanguageParseResult,
} from "@/lib/application/planner/natural-language";
import {
  savePersonalizationRequest,
  toItineraryRequest,
  type PersonalizationRequest,
} from "@/lib/application/planner/personalization-session";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary, PersonalizationPriorityKey } from "@/lib/i18n/dictionaries";
import { signInPath } from "@/lib/navigation/safe-return-to";
import {hasPersonalizedLeadTime, personalizedLeadTimeMessage} from '@/lib/application/planner/departure-lead-time';
import { ItineraryPreview, type ItineraryPreviewError } from "@/components/customer/itinerary-preview";

type PersonalizationFormCopy = Dictionary["home"]["personalizationForm"];

type RuntimeSelection =
  | { mode: "demo"; readOnlyApi: ReadOnlyApi }
  | { mode: "supabase"; areaOptions: readonly NaturalLanguageAreaOption[] };

type NaturalLanguageComposition = {
  mode: "demo" | "supabase";
  initialized: Promise<unknown>;
  retryInitialization?: () => Promise<unknown>;
  personalizationAreas?: { listAreas: (locale: Locale) => Promise<readonly NaturalLanguageAreaOption[]> };
};

type NaturalLanguagePersonalizationFormProps = Readonly<{
  copy: PersonalizationFormCopy;
  locale: Locale;
  areaOptionsOverride?: readonly NaturalLanguageAreaOption[];
  onPrepared?: () => void;
  onSwitchToManual?: () => void;
  simulatedDisclosure?: string;
  runtimeDisclosure?: string;
  composition?: NaturalLanguageComposition;
}>;

const PRIORITY_KEYS: readonly PersonalizationPriorityKey[] = [
  "street_food",
  "history",
  "traditional_craft",
  "traditional_market",
];

const DEFAULT_PRIORITY_WEIGHTS: Record<PersonalizationPriorityKey, 0 | 1 | 2 | 3 | 4 | 5> = {
  street_food: 0,
  history: 0,
  traditional_craft: 0,
  traditional_market: 0,
};

function isInitializedComposition(value: unknown): value is {
  mode: "demo" | "supabase";
  initialized: Promise<unknown>;
  retryInitialization?: () => Promise<unknown>;
  personalizationAreas?: { listAreas: (locale: Locale) => Promise<readonly NaturalLanguageAreaOption[]> };
} {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { mode?: unknown; initialized?: unknown };
  return (
    (candidate.mode === "demo" || candidate.mode === "supabase") &&
    typeof candidate.initialized === "object" &&
    candidate.initialized !== null &&
    typeof (candidate.initialized as { then?: unknown }).then === "function"
  );
}
async function resolveRuntimeSelection(
  locale: Locale,
  isRetry: boolean,
  areaOptionsOverride?: readonly NaturalLanguageAreaOption[],
  compositionOverride?: NaturalLanguageComposition,
): Promise<RuntimeSelection> {
  const composition = compositionOverride ?? await loadPortalSurfaceComposition();
  if (!isInitializedComposition(composition)) throw new Error("Invalid portal surface composition");

  if (composition.mode === "supabase") {
    await composition.initialized;
    if (areaOptionsOverride) return { mode: "supabase", areaOptions: areaOptionsOverride };
    if (!composition.personalizationAreas) return { mode: "supabase", areaOptions: [] };
    return { mode: "supabase", areaOptions: await composition.personalizationAreas.listAreas(locale) };
  }

  if (isRetry && composition.retryInitialization) await composition.retryInitialization();
  else await composition.initialized;
  return { mode: "demo", readOnlyApi: createReadOnlyApi() };
}
function isFutureHcmcStart(date: string, time: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return false;
  const start = Date.parse(`${date}T${time}:00+07:00`);
  return Number.isFinite(start) && hasPersonalizedLeadTime(`${date}T${time}:00+07:00`);
}

function toAmount(raw: string, currency: "VND" | "USD"): number | null {
  const value = raw.trim();
  if (!value) return null;
  const normalized = currency === "VND"
    ? value.replace(/[^\d]/g, "")
    : value.replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function buildRequest(
  draft: NaturalLanguageDraft,
  description: string,
  locale: Locale,
  areaOptions: readonly NaturalLanguageAreaOption[],
  runtimeMode: RuntimeSelection["mode"],
): PersonalizationRequest | null {
  if (
    !draft.startDate ||
    !draft.startTime ||
    draft.durationMinutes === undefined ||
    draft.partySize === undefined ||
    !draft.budgetAmount ||
    !draft.budgetCurrency ||
    !draft.budgetBasis
  ) return null;

  const amount = toAmount(draft.budgetAmount, draft.budgetCurrency);
  if (amount === null) return null;
  const amountMinor = draft.budgetCurrency === "USD" ? Math.round(amount * 100) : Math.round(amount);
  const groupAmountMinor = draft.budgetBasis === "per_person" ? amountMinor * draft.partySize : amountMinor;
  if (!Number.isSafeInteger(groupAmountMinor) || groupAmountMinor <= 0) return null;

  const areas = draft.areas.length > 0 ? draft.areas : areaOptions.map((option) => option.value);
  const priorityWeights = PRIORITY_KEYS.reduce((result, key) => {
    result[key] = draft.priorityWeights[key] ?? 0;
    return result;
  }, { ...DEFAULT_PRIORITY_WEIGHTS });

  // The release demo catalog intentionally has no structured food-vendor
  // records yet. Keep the customer's food preference in specialNeeds, but do
  // not let that incomplete demo fixture make the whole preview infeasible.
  if (runtimeMode === "demo" && priorityWeights.street_food > 0) {
    priorityWeights.street_food = 0;
    if (Object.values(priorityWeights).every((weight) => weight === 0)) {
      priorityWeights.traditional_market = 3;
    }
  }

  return {
    startAt: `${draft.startDate}T${draft.startTime}:00+07:00`,
    durationMinutes: draft.durationMinutes,
    areas,
    budget: { currency: draft.budgetCurrency, amountMinor: groupAmountMinor },
    partySize: draft.partySize,
    guideLanguage: draft.guideLanguage ?? (locale === "vi" ? "vi" : "en"),
    priorityWeights,
    pace: draft.pace === "active" ? "active" : "relaxed",
    dietaryRequirements: draft.dietaryRequirements,
    mobilityRequirements: draft.mobilityRequirements,
    lockedStopIds: [],
    specialNeeds: description.trim().slice(0, 1000),
  };
}

function missingFields(draft: NaturalLanguageDraft): NaturalLanguageField[] {
  const missing: NaturalLanguageField[] = [];
  if (!draft.startDate) missing.push("startDate");
  if (!draft.startTime) missing.push("startTime");
  if (draft.durationMinutes === undefined) missing.push("duration");
  if (draft.partySize === undefined) missing.push("partySize");
  if (!draft.budgetAmount || !draft.budgetCurrency) missing.push("budget");
  if (draft.budgetAmount && !draft.budgetBasis) missing.push("budgetBasis");
  return missing;
}

function emptyDraft(): NaturalLanguageDraft {
  return {
    areas: [],
    priorityWeights: DEFAULT_PRIORITY_WEIGHTS,
    dietaryRequirements: [],
    mobilityRequirements: [],
  };
}

function formatDuration(minutes: number | undefined, vi: boolean): string {
  if (minutes === undefined) return "—";
  const hours = Math.floor(minutes / 60);
  const extra = minutes % 60;
  return vi ? `${hours} giờ${extra ? ` ${extra} phút` : ""}` : `${hours} hr${extra ? ` ${extra} min` : ""}`;
}

function formatDate(value: string | undefined, locale: Locale): string {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB").format(date);
}

function formatBudget(draft: NaturalLanguageDraft, vi: boolean): string {
  if (!draft.budgetAmount || !draft.budgetCurrency) return "—";
  const basis = draft.budgetBasis === "per_person" ? (vi ? " / người" : " / person") : (vi ? " / nhóm" : " / group");
  return `${Number(draft.budgetAmount).toLocaleString(vi ? "vi-VN" : "en-US")} ${draft.budgetCurrency}${basis}`;
}

function displayMissing(field: NaturalLanguageField, vi: boolean): string {
  const labels: Record<NaturalLanguageField, string> = vi
    ? {
      startDate: "ngày bắt đầu",
      startTime: "giờ bắt đầu",
      duration: "thời lượng",
      partySize: "số người",
      budget: "ngân sách",
      budgetBasis: "ngân sách tính cho nhóm hay mỗi người",
    }
    : {
      startDate: "start date",
      startTime: "start time",
      duration: "duration",
      partySize: "group size",
      budget: "budget",
      budgetBasis: "whether the budget is for the group or each person",
    };
  return labels[field];
}

export function NaturalLanguagePersonalizationForm({
  copy,
  locale,
  areaOptionsOverride,
  onPrepared,
  onSwitchToManual,
  simulatedDisclosure,
  runtimeDisclosure,
  composition,
}: NaturalLanguagePersonalizationFormProps) {
  const vi = locale === "vi";
  const labels = vi
    ? {
      eyebrow: "Bắt đầu bằng một câu mô tả",
      title: "Hãy kể LocalLens biết bạn muốn trải nghiệm Sài Gòn như thế nào",
      intro: "Mô tả tự nhiên ngày đi, số người, thời lượng, ngân sách và điều bạn thích. Hệ thống sẽ chuyển nội dung thành dữ liệu để lập lịch trình.",
      inputLabel: "Mô tả nhu cầu chuyến đi",
      placeholder: "Ví dụ: Tôi muốn đi 4 người ở TP.HCM lúc 9 giờ ngày 10/10/2026, trong khoảng 4 giờ, tổng ngân sách 4 triệu đồng, thích ẩm thực và chợ truyền thống, ít đi bộ, có hướng dẫn viên nói tiếng Anh.",
      example: "Dùng câu ví dụ",
      analyze: "Phân tích nhu cầu",
      analyzing: "Đang phân tích…",
      manual: "Tự nhập chi tiết",
      disclosure: "Bản demo dùng bộ phân tích quy tắc an toàn; đây chưa phải kết nối AI trả phí hoặc chatbot hội thoại liên tục.",
      understood: "Nhu cầu hệ thống đã ghi nhận",
      understoodIntro: "Hãy kiểm tra phần tóm tắt này trước khi tạo lịch trình.",
      complete: "Thông tin chính đã đủ để lập lịch trình.",
      missing: "Cần bổ sung một vài thông tin",
      edit: "Chỉnh lại thông tin đã hiểu",
      date: "Ngày bắt đầu",
      time: "Giờ bắt đầu",
      duration: "Thời lượng (giờ)",
      people: "Số người",
      budget: "Ngân sách",
      group: "Cho cả nhóm",
      perPerson: "Mỗi người",
      understoodDate: "Ngày",
      understoodTime: "Bắt đầu",
      understoodDuration: "Thời lượng",
      understoodPeople: "Số người",
      understoodBudget: "Ngân sách",
      understoodArea: "Khu vực",
      understoodInterest: "Ưu tiên",
      understoodLanguage: "Ngôn ngữ hướng dẫn",
      understoodWalking: "Di chuyển",
      allAreas: "Toàn bộ khu vực phù hợp ở TP.HCM",
      relaxedWalking: "Nhịp thư thả, ưu tiên ít đi bộ",
      create: "Tạo lịch trình gợi ý",
      createHint: "Sau khi tạo, bạn vẫn có thể giữ, thay, bỏ hoặc thêm điểm trên trang điều chỉnh.",
      reset: "Nhập lại câu mô tả",
      needDescription: "Hãy nhập câu mô tả trước khi phân tích.",
      missingSummary: "Hệ thống cần bạn bổ sung: ",
      runtimeReady: "Bộ lập lịch đã sẵn sàng.",
      runtimeLoading: "Đang chuẩn bị bộ lập lịch…",
      runtimeError: "Không thể chuẩn bị bộ lập lịch. Hãy thử lại.",
      retry: "Thử lại",
      steps: "Cách hoạt động",
      stepOne: "Bạn mô tả nhu cầu bằng một câu.",
      stepTwo: "Hệ thống làm rõ phần còn thiếu.",
      stepThree: "Lịch trình được tạo để bạn xem và điều chỉnh.",
    }
    : {
      eyebrow: "Start with one sentence",
      title: "Tell LocalLens what your Saigon day should feel like",
      intro: "Describe your date, group, duration, budget and interests naturally. The system turns the description into structured planning data.",
      inputLabel: "Describe your trip",
      placeholder: "For example: I want to explore Ho Chi Minh City with 4 people at 9am on October 10, 2026, for about 4 hours, with a total budget of 4 million VND. We like food and traditional markets, prefer less walking, and need an English-speaking guide.",
      example: "Use the example",
      analyze: "Analyze my needs",
      analyzing: "Analyzing…",
      manual: "Enter details manually",
      disclosure: "Demo parser only: this is not a paid AI service or a continuous chatbot conversation.",
      understood: "What the system understood",
      understoodIntro: "Review this summary before creating the itinerary.",
      complete: "The essential information is ready for itinerary planning.",
      missing: "A few details are still needed",
      edit: "Adjust understood details",
      date: "Start date",
      time: "Start time",
      duration: "Duration (hours)",
      people: "People",
      budget: "Budget",
      group: "Whole group",
      perPerson: "Per person",
      understoodDate: "Date",
      understoodTime: "Start",
      understoodDuration: "Duration",
      understoodPeople: "People",
      understoodBudget: "Budget",
      understoodArea: "Area",
      understoodInterest: "Priorities",
      understoodLanguage: "Guide language",
      understoodWalking: "Walking preference",
      allAreas: "All suitable areas in Ho Chi Minh City",
      relaxedWalking: "Relaxed pace, less walking preferred",
      create: "Create suggested itinerary",
      createHint: "You can still keep, replace, remove or add stops on the refinement page.",
      reset: "Start over",
      needDescription: "Enter a description before analyzing it.",
      missingSummary: "Still needed: ",
      runtimeReady: "The planner is ready.",
      runtimeLoading: "Preparing the planner…",
      runtimeError: "The planner could not be prepared. Try again.",
      retry: "Try again",
      steps: "From sentence to itinerary",
      stepOne: "Describe your needs in one sentence.",
      stepTwo: "The system asks only for missing details.",
      stepThree: "Review and refine the generated itinerary.",
    };

  const [description, setDescription] = useState("");
  const [analysis, setAnalysis] = useState<NaturalLanguageParseResult | null>(null);
  const [draft, setDraft] = useState<NaturalLanguageDraft>(emptyDraft);
  const [runtimeSelection, setRuntimeSelection] = useState<RuntimeSelection | null>(null);
  const [runtimeLoadFailed, setRuntimeLoadFailed] = useState(false);
  const [runtimeRetryKey, setRuntimeRetryKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ItineraryPreviewDto | null | undefined>(undefined);
  const [previewError, setPreviewError] = useState<ItineraryPreviewError | null>(null);
  const [plannerHandoffSaved, setPlannerHandoffSaved] = useState(false);
  const [plannerHandoffError, setPlannerHandoffError] = useState(false);

  const overridesKey = JSON.stringify(areaOptionsOverride ?? null);
  useEffect(() => {
    let disposed = false;
    setRuntimeSelection(null);
    setRuntimeLoadFailed(false);
    void resolveRuntimeSelection(locale, runtimeRetryKey > 0, areaOptionsOverride, composition)
      .then((selection) => {
        if (!disposed) setRuntimeSelection(selection);
      })
      .catch(() => {
        if (!disposed) setRuntimeLoadFailed(true);
      });
    return () => {
      disposed = true;
    };
  }, [composition, locale, runtimeRetryKey, overridesKey]);

  const areaOptions = areaOptionsOverride
    ?? (runtimeSelection?.mode === "supabase" && runtimeSelection.areaOptions.length > 0
      ? runtimeSelection.areaOptions
      : (copy.areaOptions as readonly NaturalLanguageAreaOption[]));
  const currentMissing = analysis ? missingFields(draft) : [];
  const complete = analysis !== null && currentMissing.length === 0;
  const selectedAreaLabels = draft.areas
    .map((value) => areaOptions.find((option) => option.value === value)?.label)
    .filter((label): label is string => Boolean(label));
  const priorityLabels = copy.priorities
    .filter((priority) => draft.priorityWeights[priority.key] > 0)
    .map((priority) => priority.label);
  const demoFoodFallback = runtimeSelection?.mode === "demo" && draft.priorityWeights.street_food > 0;

  const understoodRows = useMemo(() => [
    [labels.understoodDate, formatDate(draft.startDate, locale)],
    [labels.understoodTime, draft.startTime ?? "—"],
    [labels.understoodDuration, formatDuration(draft.durationMinutes, vi)],
    [labels.understoodPeople, draft.partySize?.toString() ?? "—"],
    [labels.understoodBudget, formatBudget(draft, vi)],
    [labels.understoodArea, selectedAreaLabels.length > 0 && selectedAreaLabels.length < areaOptions.length ? selectedAreaLabels.join(", ") : labels.allAreas],
    [labels.understoodInterest, priorityLabels.length > 0 ? priorityLabels.join(", ") : "—"],
    [labels.understoodLanguage, draft.guideLanguage === "en" ? (vi ? "Tiếng Anh" : "English") : draft.guideLanguage === "vi" ? (vi ? "Tiếng Việt" : "Vietnamese") : "—"],
    [labels.understoodWalking, draft.pace === "relaxed" ? labels.relaxedWalking : "—"],
  ], [areaOptions.length, draft, labels, locale, priorityLabels, selectedAreaLabels, vi]);

  function updateDraft(patch: Partial<NaturalLanguageDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setValidationError(null);
    setPlannerHandoffError(false);
  }

  function analyzeDescription() {
    if (description.trim().length < 8) {
      setValidationError(labels.needDescription);
      return;
    }
    const result = parseNaturalLanguage(description, areaOptions);
    setAnalysis(result);
    setDraft(result.draft);
    setValidationError(null);
    setPreview(undefined);
    setPreviewError(null);
    setPlannerHandoffSaved(false);
    setPlannerHandoffError(false);
  }

  function resetDescription() {
    setDescription("");
    setAnalysis(null);
    setDraft(emptyDraft());
    setValidationError(null);
    setPreview(undefined);
    setPreviewError(null);
    setPlannerHandoffSaved(false);
    setPlannerHandoffError(false);
  }

  function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (runtimeSelection === null || isSubmitting) return;
    if (!complete) {
      setValidationError(`${labels.missingSummary}${currentMissing.map((field) => displayMissing(field, vi)).join(", ")}.`);
      return;
    }
    if (!draft.startDate || !draft.startTime || !isFutureHcmcStart(draft.startDate, draft.startTime)) {
      setValidationError(personalizedLeadTimeMessage(locale));
      return;
    }
    const request = buildRequest(draft, description, locale, areaOptions, runtimeSelection.mode);
    if (!request) {
      setValidationError(labels.missingSummary + currentMissing.map((field) => displayMissing(field, vi)).join(", ") + ".");
      return;
    }

    setIsSubmitting(true);
    setValidationError(null);
    setPreview(undefined);
    setPreviewError(null);
    setPlannerHandoffSaved(false);
    setPlannerHandoffError(false);

    if (runtimeSelection.mode === "supabase") {
      const saved = savePersonalizationRequest(request);
      setPlannerHandoffSaved(saved);
      setPlannerHandoffError(!saved);
      setIsSubmitting(false);
      if (saved) onPrepared?.();
      return;
    }

    const result = runtimeSelection.readOnlyApi.previewItinerary(toItineraryRequest(request));
    if (!result.ok) {
      setPreview(null);
      setPreviewError({
        message: copy.preview.errorMessage,
        retryable: result.error.retryable,
        correlationId: result.error.correlationId,
      });
      setIsSubmitting(false);
      return;
    }

    setPreview(result.value);
    const saved = savePersonalizationRequest(request);
    setPlannerHandoffSaved(saved);
    setPlannerHandoffError(!saved);
    setIsSubmitting(false);
    if (saved) onPrepared?.();
  }

  return (
    <form
      className="personalization-form personalization-form--editorial planner-request natural-language-planner"
      aria-label={copy.formLabel}
      aria-busy={runtimeSelection === null && !runtimeLoadFailed}
      onSubmit={submitRequest}
    >
      <div className="planner-request__main">
        <section className="planner-request__section natural-language-entry">
          <p className="natural-language-entry__eyebrow">{labels.eyebrow}</p>
          <h2>{labels.title}</h2>
          <p className="natural-language-entry__intro">{labels.intro}</p>
          <label className="field natural-language-entry__textarea">
            <span>{labels.inputLabel}</span>
            <textarea
              rows={6}
              value={description}
              maxLength={1000}
              placeholder={labels.placeholder}
              onFocus={(event) => {
                const field = event.currentTarget;
                const rect = field.getBoundingClientRect();
                const style = getComputedStyle(field);
                const ring = style.outlineStyle !== "none"
                  ? Math.max(0, (Number.parseFloat(style.outlineWidth) || 0) + (Number.parseFloat(style.outlineOffset) || 0))
                  : 0;
                const width = document.documentElement.clientWidth || window.innerWidth;
                const height = document.documentElement.clientHeight || window.innerHeight;
                if (rect.top - ring < 0 || rect.bottom + ring > height
                  || rect.left - ring < 0 || rect.right + ring > width) {
                  field.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
                }
              }}
              onChange={(event) => {
                setDescription(event.target.value);
                if (analysis) setAnalysis(null);
                setPreview(undefined);
                setPreviewError(null);
                setValidationError(null);
              }}
            />
          </label>
          <div className="natural-language-entry__example">
            <button
              className="natural-language-link"
              type="button"
              onClick={() => {
                setDescription(labels.placeholder);
                setAnalysis(null);
                setValidationError(null);
              }}
            >
              {labels.example}
            </button>
            <span>{vi ? "Bạn có thể viết theo cách của mình, không cần đúng mẫu." : "Use your own words; there is no required template."}</span>
          </div>
          <div className="natural-language-entry__actions">
            <button className="button button--primary" type="button" onClick={analyzeDescription} disabled={runtimeSelection === null || description.trim().length < 8}>
              {analysis ? labels.analyze : labels.analyze}
            </button>
            {onSwitchToManual ? (
              <button className="button button--secondary" type="button" onClick={onSwitchToManual}>
                {labels.manual}
              </button>
            ) : null}
          </div>
          <p className="natural-language-entry__disclosure">{labels.disclosure}</p>
          {runtimeSelection !== null ? <p className="natural-language-entry__disclosure" role="note">{runtimeSelection.mode === "supabase" ? runtimeDisclosure ?? labels.disclosure : simulatedDisclosure ?? labels.disclosure}</p> : null}
          {runtimeSelection === null && !runtimeLoadFailed ? <p className="form-preview" role="status">{labels.runtimeLoading}</p> : null}
          {runtimeSelection !== null ? <p className="natural-language-runtime" role="status">{labels.runtimeReady}</p> : null}
          {runtimeLoadFailed ? (
            <div className="natural-language-entry__error" role="alert">
              <p>{labels.runtimeError}</p>
              <button className="button button--secondary" type="button" onClick={() => setRuntimeRetryKey((value) => value + 1)}>{labels.retry}</button>
            </div>
          ) : null}
        </section>

        {analysis ? (
          <section className="planner-request__section natural-language-understood" aria-labelledby="natural-language-understood-heading">
            <p className="natural-language-entry__eyebrow">02</p>
            <h2 id="natural-language-understood-heading">{labels.understood}</h2>
            <p>{labels.understoodIntro}</p>
            <dl className="natural-language-understood__grid">
              {understoodRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
            {currentMissing.length > 0 ? (
              <div className="natural-language-clarification" role="alert">
                <h3>{labels.missing}</h3>
                <p>{labels.missingSummary}{currentMissing.map((field) => displayMissing(field, vi)).join(", ")}.</p>
              </div>
            ) : <p className="natural-language-complete" role="status">{labels.complete}</p>}
            {demoFoodFallback ? (
              <p className="natural-language-entry__disclosure">
                {vi
                  ? "Bản demo hiện chưa có dữ liệu quầy/món bán được. LocalLens vẫn tạo đề xuất từ các điểm phù hợp; yêu cầu ẩm thực được giữ trong mô tả để xử lý tiếp."
                  : "The demo catalog does not yet contain structured food-vendor data. LocalLens will still create a proposal from suitable places, while keeping the food request in the description for follow-up."}
              </p>
            ) : null}

            <details className="natural-language-edit" open={currentMissing.length > 0}>
              <summary>{labels.edit}</summary>
              <div className="natural-language-edit__grid">
                <label className="field"><span>{labels.date}</span><input type="date" value={draft.startDate ?? ""} onChange={(event) => updateDraft({ startDate: event.target.value })} /></label>
                <label className="field"><span>{labels.time}</span><input type="time" value={draft.startTime ?? ""} onChange={(event) => updateDraft({ startTime: event.target.value })} /></label>
                <label className="field"><span>{labels.duration}</span><input type="number" min="1" max="12" step="0.5" value={draft.durationMinutes === undefined ? "" : draft.durationMinutes / 60} onChange={(event) => updateDraft({ durationMinutes: event.target.value ? Math.round(Number(event.target.value) * 60) : undefined })} /></label>
                <label className="field"><span>{labels.people}</span><input type="number" min="1" max="20" value={draft.partySize ?? ""} onChange={(event) => updateDraft({ partySize: event.target.value ? Number(event.target.value) : undefined })} /></label>
                <label className="field"><span>{labels.budget}</span><input type="text" inputMode="decimal" value={draft.budgetAmount ?? ""} onChange={(event) => updateDraft({ budgetAmount: event.target.value })} /></label>
                <label className="field"><span>{copy.budgetCurrencyLabel}</span><select value={draft.budgetCurrency ?? "VND"} onChange={(event) => updateDraft({ budgetCurrency: event.target.value as "VND" | "USD" })}><option value="VND">VND</option><option value="USD">USD</option></select></label>
              </div>
              {draft.budgetAmount ? (
                <fieldset className="natural-language-basis">
                  <legend>{vi ? "Ngân sách được tính theo" : "Budget is calculated by"}</legend>
                  <label><input type="radio" name="natural-budget-basis" checked={draft.budgetBasis === "group"} onChange={() => updateDraft({ budgetBasis: "group" })} />{labels.group}</label>
                  <label><input type="radio" name="natural-budget-basis" checked={draft.budgetBasis === "per_person"} onChange={() => updateDraft({ budgetBasis: "per_person" })} />{labels.perPerson}</label>
                </fieldset>
              ) : null}
            </details>

            <div className="natural-language-understood__footer">
              <button className="button button--primary" type="submit" disabled={!complete || runtimeSelection === null || isSubmitting}>
                {isSubmitting ? (vi ? "Đang tạo lịch trình…" : "Creating itinerary…") : labels.create}
              </button>
              <button className="button button--secondary" type="button" onClick={resetDescription}>{labels.reset}</button>
              <p>{labels.createHint}</p>
            </div>
            {validationError ? <p className="form-validation" role="alert">{validationError}</p> : null}
            {plannerHandoffError ? <p className="form-validation" role="alert">{copy.runtimePlannerLinkStorageError}</p> : null}
          </section>
        ) : null}

        {runtimeSelection?.mode === "demo" ? <ItineraryPreview locale={locale} copy={copy.preview} preview={preview} error={previewError} /> : null}

        {runtimeSelection?.mode === "demo" && plannerHandoffSaved ? (
          <div className="personalization-form__planner-cta">
            <a className="button button--secondary" href={`/${locale}/planner/`}>{copy.plannerLinkLabel}</a>
            <p className="form-preview" role="note">{copy.plannerLinkDisclosure}</p>
          </div>
        ) : null}
        {runtimeSelection?.mode === "supabase" && plannerHandoffSaved ? (
          <div className="personalization-form__planner-cta">
            <a className="button button--secondary" href={signInPath(locale, `/${locale}/planner/`)}>{copy.runtimePlannerLinkLabel}</a>
            <p className="form-preview" role="note">{copy.runtimePlannerLinkDisclosure}</p>
          </div>
        ) : null}
      </div>

      <aside className="planner-request__summary natural-language-steps">
        <small>LOCALLENS</small>
        <h2>{labels.steps}</h2>
        <ol>
          <li>{labels.stepOne}</li>
          <li>{labels.stepTwo}</li>
          <li>{labels.stepThree}</li>
        </ol>
        <p>{vi ? "Lịch trình chỉ là đề xuất. Các bước duyệt, báo giá, đặt tour và thanh toán vẫn giữ nguyên." : "The itinerary is a proposal. Review, quote, booking and payment steps remain separate."}</p>
      </aside>
    </form>
  );
}
