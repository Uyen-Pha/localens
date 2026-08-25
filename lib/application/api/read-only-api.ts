import {
  itineraryRequestSchema,
  type ExperienceType,
  type ItineraryRequest,
  type Locale,
  type ItineraryResult,
} from "@/lib/domain/itinerary/contracts";
import { createItinerary } from "@/lib/domain/itinerary/engine";
import {
  demoCatalogRepository,
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
const CORRELATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface ApiError {
  code: string;
  messageKey: string;
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
  experienceTypes: ExperienceType[];
  stops: Array<{ position: number; placeId: string; placeSlug: string; title: string }>;
}

export interface PublicTourCatalogDto {
  environment: "demo";
  city: "Ho Chi Minh City";
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
  listTours(locale: unknown): ApiResult<PublicTourCatalogDto>;
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
  code: string,
  messageKey: string,
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
  return failure(correlationId, "INVALID_REQUEST", "api.locale.invalid", false, {
    locale: "api.locale.invalid",
  });
}

function issuePath(path: readonly PropertyKey[]): string {
  return path.map((part) => String(part)).join(".");
}

function requestValidationError(
  input: unknown,
  correlationId: string,
): ApiResult<never> | { ok: true; value: ItineraryRequest } {
  if (!isRecord(input)) {
    return failure(correlationId, "INVALID_REQUEST", "api.request.invalid");
  }

  const topLevelUnknown = Object.keys(input).find((key) => !REQUEST_FIELDS.includes(key as (typeof REQUEST_FIELDS)[number]));
  if (topLevelUnknown !== undefined) {
    return failure(correlationId, "UNKNOWN_FIELD", "api.request.unknown_field", false, {
      [topLevelUnknown]: "api.request.unknown_field",
    });
  }

  const parsed = itineraryRequestSchema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };

  const fieldErrors: Record<string, string> = {};
  let primaryCode = "INVALID_REQUEST";
  let primaryMessageKey = "api.request.invalid";
  for (const issue of parsed.error.issues) {
    const path = issuePath(issue.path);
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) {
        const fullPath = path.length > 0 ? `${path}.${key}` : key;
        fieldErrors[fullPath] = "api.request.unknown_field";
      }
      primaryCode = "UNKNOWN_FIELD";
      primaryMessageKey = "api.request.unknown_field";
      continue;
    }
    if (path === "budget.amountMinor") {
      primaryCode = "UNSAFE_MONEY";
      primaryMessageKey = "api.money.unsafe";
      fieldErrors[path] = "api.money.unsafe";
      continue;
    }
    if (path === "startAt" || path === "durationMinutes") {
      primaryCode = "UNSAFE_TIME";
      primaryMessageKey = "api.time.unsafe";
      fieldErrors[path] = "api.time.unsafe";
      continue;
    }
    if (path.length > 0) fieldErrors[path] = "api.request.invalid";
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
  result: { ok: false; error: { code: string; messageKey: string; retryable: boolean } },
): ApiResult<never> {
  return failure(correlationId, result.error.code, result.error.messageKey, result.error.retryable);
}

export function createReadOnlyApi(options: ReadOnlyApiOptions = {}): ReadOnlyApi {
  const repository = options.repository ?? demoCatalogRepository;
  const correlationIdFactory = options.correlationIdFactory;

  return {
    listTours(localeInput: unknown): ApiResult<PublicTourCatalogDto> {
      const correlationId = makeCorrelationId(correlationIdFactory);
      if (typeof localeInput !== "string" || !LOCALES.has(localeInput as Locale)) return localeError(correlationId);
      try {
        const locale = localeInput as Locale;
        return success(correlationId, {
          environment: repository.environment,
          city: repository.city,
          locale,
          tours: repository.listTours(locale).map(mapTour),
        });
      } catch {
        return failure(correlationId, "INTERNAL_ERROR", "api.internal", true);
      }
    },

    previewItinerary(input: unknown): ApiResult<ItineraryPreviewDto> {
      const correlationId = makeCorrelationId(correlationIdFactory);
      const parsed = requestValidationError(input, correlationId);
      if (!parsed.ok) return parsed;

      const request = parsed.value;
      if (request.areas.some((areaId) => !repository.hasArea(areaId))) {
        return failure(correlationId, "UNKNOWN_AREA_ID", "api.area.unknown", false, {
          areas: "api.area.unknown",
        });
      }
      if (request.lockedStopIds.some((placeId) => !repository.hasPlace(placeId))) {
        return failure(correlationId, "UNKNOWN_PLACE_ID", "api.place.unknown", false, {
          lockedStopIds: "api.place.unknown",
        });
      }

      try {
        const engineInput = repository.getEngineInput(request);
        const result = createItinerary(engineInput, undefined, "deterministic");
        if (!result.ok) return domainFailure(correlationId, result);
        return success(correlationId, mapPreview(result.value, repository, request.guideLanguage));
      } catch {
        return failure(correlationId, "INTERNAL_ERROR", "api.internal", true);
      }
    },
  };
}
