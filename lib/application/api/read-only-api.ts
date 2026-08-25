import {
  itineraryRequestSchema,
  type DomainErrorCode,
  type ExperienceType,
  type ItineraryRequest,
  type Locale,
  type ItineraryResult,
} from "@/lib/domain/itinerary/contracts";
import {
  API_ERROR_CODES,
  API_MESSAGE_CATALOG,
  API_MESSAGE_KEYS,
  type ApiErrorCode,
  type ApiMessageKey,
} from "@/lib/application/api/message-catalog";
import { createItinerary } from "@/lib/domain/itinerary/engine";
import {
  demoCatalogRepository,
  DEMO_CATALOG_STATUS,
  DEMO_DATA_SCOPE,
  DEMO_PLACE_COUNT,
  DEMO_TOUR_COUNT,
  DEMO_SOURCE_STATUS,
  type DemoTourRecord,
  type InternalDemoCatalogRepository,
} from "@/lib/infrastructure/mock/hcmc-catalog";

const REQUEST_FIELDS = [
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
] as const;
const LOCALES = new Set<Locale>(["en", "vi"]);
const EXPERIENCE_TYPES = new Set<ExperienceType>([
  "street_food",
  "history",
  "traditional_craft",
  "traditional_market",
]);
const DIETARY_REQUIREMENT_IDS = new Set(["halal", "vegetarian"]);
const MOBILITY_REQUIREMENT_IDS = new Set(["step-free"]);
const FILTER_FIELDS = ["keyword", "areaIds", "experienceTypes"] as const;
const CORRELATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export { API_ERROR_CODES, API_MESSAGE_CATALOG, API_MESSAGE_KEYS };

export interface TourFilterInput {
  keyword?: string;
  areaIds?: string[];
  experienceTypes?: ExperienceType[];
}

interface NormalizedTourFilter {
  keyword?: string;
  areaIds: string[];
  experienceTypes: ExperienceType[];
}

export interface ApiError {
  code: ApiErrorCode;
  messageKey: ApiMessageKey;
  fieldErrors?: Record<string, string>;
  retryable: boolean;
  correlationId: string;
}
export type ApiResult<T> =
  | { ok: true; value: T; correlationId: string }
  | { ok: false; error: ApiError };

export interface PublicTourDto {
  id: string;
  versionId: string;
  slug: string;
  locale: Locale;
  title: string;
  summary: string;
  meetingPoint: string;
  durationMinutes: number;
  priceVndMinor: string;
  inclusions: string[];
  exclusions: string[];
  cancellationPolicy: string;
  sourceUrl: string;
  verifiedAt: string;
  attribution: string;
  license: string;
  areaIds: string[];
  experienceTypes: ExperienceType[];
  stops: Array<{ position: number; placeId: string; placeSlug: string; title: string }>;
}

export interface PublicTourCatalogDto {
  environment: "demo";
  city: "Ho Chi Minh City";
  dataScope: "partial_demo_sample";
  catalogStatus: "pending_approved_task15_seed";
  sourceStatus: "demo_placeholder";
  samplePlaceCount: 6;
  sampleTourCount: 4;
  locale: Locale;
  tours: PublicTourDto[];
}

export interface ItineraryPreviewItemDto {
  placeId: string;
  placeTitle: string;
  startAt: string;
  endAt: string;
  visitDurationMinutes: number;
  travelMinutesBefore: number;
  transitionBufferMinutesBefore: 0 | 10;
  travelCostVndBefore: number;
  placeCostVnd: number;
  score: number;
}

export interface ItineraryPreviewDto {
  environment: "demo";
  city: "Ho Chi Minh City";
  normalizedStartAt: string;
  budgetVnd: number;
  rankingSource: "deterministic";
  items: ItineraryPreviewItemDto[];
  totals: ItineraryResult["totals"];
  snapshotIds: ItineraryResult["snapshotIds"];
}

export interface ReadOnlyApi {
  listTours(locale: unknown, filters?: unknown): ApiResult<PublicTourCatalogDto>;
  previewItinerary(input: unknown): ApiResult<ItineraryPreviewDto>;
}

export interface ReadOnlyApiOptions {
  repository?: InternalDemoCatalogRepository;
  correlationIdFactory?: () => string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function generatedCorrelationId(): string {
  try {
    const candidate = globalThis.crypto?.randomUUID?.();
    if (candidate !== undefined && CORRELATION_ID_PATTERN.test(candidate)) return candidate;
  } catch {
    // Keep the error envelope safe even when a runtime does not expose UUID generation.
  }
  return "00000000-0000-4000-8000-000000000000";
}

function makeCorrelationId(factory: (() => string) | undefined): string {
  try {
    const candidate = factory?.();
    if (candidate !== undefined && CORRELATION_ID_PATTERN.test(candidate)) return candidate;
  } catch {
    // A correlation ID is observability metadata, never a reason to fail a read.
  }
  return generatedCorrelationId();
}

function failure(
  correlationId: string,
  code: ApiErrorCode,
  messageKey: ApiMessageKey,
  retryable = false,
  fieldErrors?: Record<string, string>,
): ApiResult<never> {
  return {
    ok: false,
    error: {
      code,
      messageKey,
      ...(fieldErrors && Object.keys(fieldErrors).length > 0 ? { fieldErrors } : {}),
      retryable,
      correlationId,
    },
  };
}

function success<T>(correlationId: string, value: T): ApiResult<T> {
  return { ok: true, value, correlationId };
}

function localeError(correlationId: string): ApiResult<never> {
  return failure(correlationId, "INVALID_REQUEST", API_MESSAGE_KEYS.localeInvalid, false, {
    locale: API_MESSAGE_KEYS.localeInvalid,
  });
}

function issuePath(path: readonly PropertyKey[]): string {
  return path.map((part) => String(part)).join(".");
}

function normalizedString(value: unknown, path: string, correlationId: string): ApiResult<string> {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > 120 ||
    /[\u0000-\u001F\u007F]/.test(value)
  ) {
    return failure(correlationId, "INVALID_FILTER", API_MESSAGE_KEYS.filterKeywordInvalid, false, {
      [path]: API_MESSAGE_KEYS.filterKeywordInvalid,
    });
  }
  return success(correlationId, value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US"));
}

function normalizedIdArray(
  value: unknown,
  path: "areaIds" | "experienceTypes",
  correlationId: string,
  allowed: ReadonlySet<string>,
): ApiResult<string[]> {
  const isDensePlainArray = Array.isArray(value)
    && value.length <= 8
    && Object.keys(value).every((key) => /^(?:0|[1-9]\d*)$/.test(key))
    && [...Array(value.length).keys()].every((index) => Object.prototype.hasOwnProperty.call(value, index))
    && value.every((item) => typeof item === "string");
  if (!isDensePlainArray) {
    return failure(
      correlationId,
      "INVALID_FILTER",
      path === "areaIds" ? API_MESSAGE_KEYS.filterAreaInvalid : API_MESSAGE_KEYS.filterExperienceTypeInvalid,
      false,
      { [path]: path === "areaIds" ? API_MESSAGE_KEYS.filterAreaInvalid : API_MESSAGE_KEYS.filterExperienceTypeInvalid },
    );
  }
  const canonical = [...new Set((value as string[]).map((item) => item.trim()))].sort();
  if (canonical.some((item) => item.length === 0 || /[\u0000-\u001F\u007F]/.test(item))) {
    return failure(
      correlationId,
      "INVALID_FILTER",
      path === "areaIds" ? API_MESSAGE_KEYS.filterAreaInvalid : API_MESSAGE_KEYS.filterExperienceTypeInvalid,
      false,
      { [path]: path === "areaIds" ? API_MESSAGE_KEYS.filterAreaInvalid : API_MESSAGE_KEYS.filterExperienceTypeInvalid },
    );
  }
  const unknown = canonical.find((item) => !allowed.has(item));
  if (unknown !== undefined) {
    return failure(
      correlationId,
      path === "areaIds" ? "UNKNOWN_AREA_ID" : "UNKNOWN_EXPERIENCE_TYPE",
      path === "areaIds" ? API_MESSAGE_KEYS.filterAreaUnknown : API_MESSAGE_KEYS.filterExperienceTypeUnknown,
      false,
      { [path]: path === "areaIds" ? API_MESSAGE_KEYS.filterAreaUnknown : API_MESSAGE_KEYS.filterExperienceTypeUnknown },
    );
  }
  return success(correlationId, canonical);
}

function parseTourFilter(
  input: unknown,
  correlationId: string,
  tours: readonly DemoTourRecord[],
): ApiResult<NormalizedTourFilter> {
  if (input === undefined) return success(correlationId, { areaIds: [], experienceTypes: [] });
  if (!isRecord(input)) return failure(correlationId, "INVALID_FILTER", API_MESSAGE_KEYS.filterInvalid);
  const unknownField = Object.keys(input).find((key) => !FILTER_FIELDS.includes(key as (typeof FILTER_FIELDS)[number]));
  if (unknownField !== undefined) {
    return failure(correlationId, "UNKNOWN_FIELD", API_MESSAGE_KEYS.filterUnknownField, false, {
      [unknownField]: API_MESSAGE_KEYS.filterUnknownField,
    });
  }

  let keyword: string | undefined;
  if (input.keyword !== undefined) {
    const parsedKeyword = normalizedString(input.keyword, "keyword", correlationId);
    if (!parsedKeyword.ok) return parsedKeyword;
    keyword = parsedKeyword.value;
  }
  const knownAreas = new Set(tours.flatMap((tour) => tour.areaIds));
  const knownTypes = new Set(tours.flatMap((tour) => tour.experienceTypes));
  let areaIds: string[] = [];
  if (input.areaIds !== undefined) {
    const parsedAreas = normalizedIdArray(input.areaIds, "areaIds", correlationId, knownAreas);
    if (!parsedAreas.ok) return parsedAreas;
    areaIds = parsedAreas.value;
  }
  let experienceTypes: ExperienceType[] = [];
  if (input.experienceTypes !== undefined) {
    const parsedTypes = normalizedIdArray(input.experienceTypes, "experienceTypes", correlationId, knownTypes);
    if (!parsedTypes.ok) return parsedTypes;
    experienceTypes = parsedTypes.value.filter((value): value is ExperienceType => EXPERIENCE_TYPES.has(value as ExperienceType));
  }
  return success(correlationId, { keyword, areaIds, experienceTypes });
}

function filterTours(tours: readonly DemoTourRecord[], filter: NormalizedTourFilter): DemoTourRecord[] {
  return tours.filter((tour) => {
    if (filter.keyword !== undefined) {
      const searchable = `${tour.slug} ${tour.title} ${tour.summary}`.toLocaleLowerCase("en-US");
      if (!searchable.includes(filter.keyword)) return false;
    }
    if (filter.areaIds.length > 0 && !filter.areaIds.some((areaId) => tour.areaIds.includes(areaId))) return false;
    if (filter.experienceTypes.length > 0 && !filter.experienceTypes.some((type) => tour.experienceTypes.includes(type))) return false;
    return true;
  });
}

function requestValidationError(
  input: unknown,
  correlationId: string,
): ApiResult<never> | { ok: true; value: ItineraryRequest } {
  if (!isRecord(input)) {
    return failure(correlationId, "INVALID_REQUEST", API_MESSAGE_KEYS.requestInvalid);
  }

  const topLevelUnknown = Object.keys(input).find((key) => !REQUEST_FIELDS.includes(key as (typeof REQUEST_FIELDS)[number]));
  if (topLevelUnknown !== undefined) {
    return failure(correlationId, "UNKNOWN_FIELD", API_MESSAGE_KEYS.requestUnknownField, false, {
      [topLevelUnknown]: API_MESSAGE_KEYS.requestUnknownField,
    });
  }

  const parsed = itineraryRequestSchema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };

  const fieldErrors: Record<string, string> = {};
  let primaryCode: ApiErrorCode = "INVALID_REQUEST";
  let primaryMessageKey: ApiMessageKey = API_MESSAGE_KEYS.requestInvalid;
  for (const issue of parsed.error.issues) {
    const path = issuePath(issue.path);
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) {
        const fullPath = path.length > 0 ? `${path}.${key}` : key;
        fieldErrors[fullPath] = API_MESSAGE_KEYS.requestUnknownField;
      }
      primaryCode = "UNKNOWN_FIELD";
      primaryMessageKey = API_MESSAGE_KEYS.requestUnknownField;
      continue;
    }
    if (path === "budget.amountMinor") {
      primaryCode = "UNSAFE_MONEY";
      primaryMessageKey = API_MESSAGE_KEYS.moneyUnsafe;
      fieldErrors[path] = API_MESSAGE_KEYS.moneyUnsafe;
      continue;
    }
    if (path === "startAt" || path === "durationMinutes") {
      primaryCode = "UNSAFE_TIME";
      primaryMessageKey = API_MESSAGE_KEYS.timeUnsafe;
      fieldErrors[path] = API_MESSAGE_KEYS.timeUnsafe;
      continue;
    }
    if (path.length > 0) fieldErrors[path] = API_MESSAGE_KEYS.requestInvalid;
  }
  return failure(correlationId, primaryCode, primaryMessageKey, false, fieldErrors);
}

function mapTour(tour: DemoTourRecord): PublicTourDto {
  return {
    id: tour.id,
    versionId: tour.versionId,
    slug: tour.slug,
    locale: tour.locale,
    title: tour.title,
    summary: tour.summary,
    meetingPoint: tour.meetingPoint,
    durationMinutes: tour.durationMinutes,
    priceVndMinor: tour.priceVndMinor,
    inclusions: [...tour.inclusions],
    exclusions: [...tour.exclusions],
    cancellationPolicy: tour.cancellationPolicy,
    sourceUrl: tour.sourceUrl,
    verifiedAt: tour.verifiedAt,
    attribution: tour.attribution,
    license: tour.license,
    areaIds: [...tour.areaIds],
    experienceTypes: [...tour.experienceTypes],
    stops: tour.stops.map((stop) => ({ ...stop })),
  };
}

function mapPreview(
  result: ItineraryResult,
  repository: InternalDemoCatalogRepository,
  locale: Locale,
): ItineraryPreviewDto {
  return {
    environment: repository.environment,
    city: repository.city,
    normalizedStartAt: result.normalizedStartAt,
    budgetVnd: result.budgetVnd,
    rankingSource: "deterministic",
    items: result.items.map((item) => ({
      placeId: item.placeId,
      placeTitle: repository.getPlaceTitle(item.placeId, locale) ?? item.placeId,
      startAt: item.startAt,
      endAt: item.endAt,
      visitDurationMinutes: item.visitDurationMinutes,
      travelMinutesBefore: item.travelMinutesBefore,
      transitionBufferMinutesBefore: item.transitionBufferMinutesBefore,
      travelCostVndBefore: item.travelCostVndBefore,
      placeCostVnd: item.placeCostVnd,
      score: item.score,
    })),
    totals: {
      durationMinutes: result.totals.durationMinutes,
      visitMinutes: result.totals.visitMinutes,
      travelMinutes: result.totals.travelMinutes,
      transitionBufferMinutes: result.totals.transitionBufferMinutes,
      groupCostVnd: result.totals.groupCostVnd,
      score: result.totals.score,
    },
    snapshotIds: {
      catalog: result.snapshotIds.catalog,
      travel: result.snapshotIds.travel,
      fx: result.snapshotIds.fx,
    },
  };
}

function domainFailure(
  correlationId: string,
  result: { ok: false; error: { code: DomainErrorCode; retryable: boolean } },
): ApiResult<never> {
  const messageKeyByCode: Record<DomainErrorCode, ApiMessageKey> = {
    INVALID_ITINERARY_INPUT: API_MESSAGE_KEYS.itineraryInvalid,
    USD_DISABLED: API_MESSAGE_KEYS.itineraryUsdDisabled,
    NO_FEASIBLE_ITINERARY: API_MESSAGE_KEYS.itineraryNoFeasible,
    ITINERARY_SEARCH_LIMIT: API_MESSAGE_KEYS.itinerarySearchLimit,
    INVALID_ITINERARY_RESULT: API_MESSAGE_KEYS.itineraryInvalid,
  };
  return failure(correlationId, result.error.code, messageKeyByCode[result.error.code], result.error.retryable);
}

export function createReadOnlyApi(options: ReadOnlyApiOptions = {}): ReadOnlyApi {
  const repository = options.repository ?? demoCatalogRepository;
  const correlationIdFactory = options.correlationIdFactory;

  return {
    listTours(localeInput: unknown, filterInput?: unknown): ApiResult<PublicTourCatalogDto> {
      const correlationId = makeCorrelationId(correlationIdFactory);
      if (typeof localeInput !== "string" || !LOCALES.has(localeInput as Locale)) return localeError(correlationId);
      try {
        const locale = localeInput as Locale;
        const tours = repository.listTours(locale);
        const parsedFilter = parseTourFilter(filterInput, correlationId, tours);
        if (!parsedFilter.ok) return parsedFilter;
        return success(correlationId, {
          environment: repository.environment,
          city: repository.city,
          dataScope: DEMO_DATA_SCOPE,
          catalogStatus: DEMO_CATALOG_STATUS,
          sourceStatus: DEMO_SOURCE_STATUS,
          samplePlaceCount: DEMO_PLACE_COUNT,
          sampleTourCount: DEMO_TOUR_COUNT,
          locale,
          tours: filterTours(tours, parsedFilter.value).map(mapTour),
        });
      } catch {
        return failure(correlationId, "INTERNAL_ERROR", API_MESSAGE_KEYS.internal, true);
      }
    },

    previewItinerary(input: unknown): ApiResult<ItineraryPreviewDto> {
      const correlationId = makeCorrelationId(correlationIdFactory);
      const parsed = requestValidationError(input, correlationId);
      if (!parsed.ok) return parsed;

      const request = parsed.value;
      if (request.dietaryRequirements.some((requirementId) => !DIETARY_REQUIREMENT_IDS.has(requirementId))) {
        return failure(correlationId, "UNKNOWN_REQUIREMENT_ID", API_MESSAGE_KEYS.requirementUnknown, false, {
          dietaryRequirements: API_MESSAGE_KEYS.requirementUnknown,
        });
      }
      if (request.mobilityRequirements.some((requirementId) => !MOBILITY_REQUIREMENT_IDS.has(requirementId))) {
        return failure(correlationId, "UNKNOWN_REQUIREMENT_ID", API_MESSAGE_KEYS.requirementUnknown, false, {
          mobilityRequirements: API_MESSAGE_KEYS.requirementUnknown,
        });
      }
      if (request.areas.some((areaId) => !repository.hasArea(areaId))) {
        return failure(correlationId, "UNKNOWN_AREA_ID", API_MESSAGE_KEYS.areaUnknown, false, {
          areas: API_MESSAGE_KEYS.areaUnknown,
        });
      }
      if (request.lockedStopIds.some((placeId) => !repository.hasPlace(placeId))) {
        return failure(correlationId, "UNKNOWN_PLACE_ID", API_MESSAGE_KEYS.placeUnknown, false, {
          lockedStopIds: API_MESSAGE_KEYS.placeUnknown,
        });
      }

      try {
        const engineInput = repository.getEngineInput(request);
        const result = createItinerary(engineInput, undefined, "deterministic");
        if (!result.ok) return domainFailure(correlationId, result);
        return success(correlationId, mapPreview(result.value, repository, request.guideLanguage));
      } catch {
        return failure(correlationId, "INTERNAL_ERROR", API_MESSAGE_KEYS.internal, true);
      }
    },
  };
}
