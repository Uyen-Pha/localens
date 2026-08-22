import { z } from "zod";

import {
  domainError,
  type DomainError,
} from "@/lib/domain/itinerary/errors";

export { domainError } from "@/lib/domain/itinerary/errors";
export type {
  DomainError,
  DomainErrorCode,
} from "@/lib/domain/itinerary/errors";

export type Locale = "en" | "vi";
export type Result<T, E = DomainError> =
  | { ok: true; value: T }
  | { ok: false; error: E };
export type ExperienceType =
  | "street_food"
  | "history"
  | "traditional_craft"
  | "traditional_market";
export type SupportStatus = "supported" | "unsupported" | "unknown";
export type Pace = "relaxed" | "balanced" | "active";
export type Currency = "VND" | "USD";
export type PriorityWeight = 0 | 1 | 2 | 3 | 4 | 5;
export type PriorityWeights = Record<ExperienceType, PriorityWeight>;

const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const MAX_PLACE_COST = Math.floor(MAX_SAFE / 20);
const MAX_TRAVEL_COST = Math.floor(MAX_SAFE / 8);

const isoDateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/;
const canonicalUtcPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const canonicalHcmOutputPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):00\+07:00$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const decimalPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isValidCalendarDateParts(
  year: number,
  month: number,
  day: number,
): boolean {
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

function isRealCalendarDate(value: string): boolean {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  return isValidCalendarDateParts(year, month, day);
}

function isValidOffset(value: string): boolean {
  const match = value.match(isoDateTimePattern);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hours = Number(match[4]);
  const minutes = Number(match[5]);
  const seconds = Number(match[6]);
  if (
    !isValidCalendarDateParts(year, month, day) ||
    hours > 23 ||
    minutes > 59 ||
    seconds > 59
  ) {
    return false;
  }
  if (match[9] !== undefined) {
    const offsetHours = Number(match[10]);
    const offsetMinutes = Number(match[11]);
    if (offsetHours > 23 || offsetMinutes > 59) return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
}

function isCanonicalUtc(value: string): boolean {
  return (
    canonicalUtcPattern.test(value) &&
    isValidOffset(value) &&
    value.endsWith("Z")
  );
}

function isCanonicalHcmOutput(value: string): boolean {
  const match = value.match(canonicalHcmOutputPattern);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hours = Number(match[4]);
  const minutes = Number(match[5]);
  return (
    isValidCalendarDateParts(year, month, day) &&
    hours <= 23 &&
    minutes <= 59
  );
}

function minutesOf(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function hasOverlappingWindows(
  windows: readonly { opensAt: string; closesAt: string }[],
): boolean {
  const intervals: Array<[number, number]> = [];
  for (const window of windows) {
    const start = minutesOf(window.opensAt);
    const end = minutesOf(window.closesAt);
    intervals.push([start, end > start ? end : end + 24 * 60]);
  }
  intervals.sort(([a], [b]) => a - b);
  return intervals.some((interval, index) => {
    const previous = intervals[index - 1];
    return previous !== undefined && interval[0] < previous[1];
  });
}

function hasOverlappingWeeklyWindows(
  windows: readonly {
    weekday: number;
    opensAt: string;
    closesAt: string;
  }[],
): boolean {
  const weekMinutes = 7 * 24 * 60;
  const segments: Array<[number, number]> = [];
  for (const window of windows) {
    const opensAt = minutesOf(window.opensAt);
    const closesAt = minutesOf(window.closesAt);
    const duration =
      closesAt > opensAt
        ? closesAt - opensAt
        : closesAt + 24 * 60 - opensAt;
    const start = window.weekday * 24 * 60 + opensAt;
    const end = start + duration;
    if (end <= weekMinutes) {
      segments.push([start, end]);
    } else {
      segments.push([start, weekMinutes], [0, end - weekMinutes]);
    }
  }
  segments.sort(([startA], [startB]) => startA - startB);
  return segments.some((segment, index) => {
    const previous = segments[index - 1];
    return previous !== undefined && segment[0] < previous[1];
  });
}

function issuePath(path: PropertyKey[]): string {
  return path
    .map((part) => (typeof part === "number" ? String(part) : String(part)))
    .join(".");
}

const safeInteger = z.number().int().finite().safe();
const nonNegativeSafeInteger = safeInteger.nonnegative();

export const localeSchema = z.enum(["en", "vi"]);
export const experienceTypeSchema = z.enum([
  "street_food",
  "history",
  "traditional_craft",
  "traditional_market",
]);
export const supportStatusSchema = z.enum([
  "supported",
  "unsupported",
  "unknown",
]);
export const paceSchema = z.enum(["relaxed", "balanced", "active"]);
export const currencySchema = z.enum(["VND", "USD"]);
export const priorityWeightSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

const idSchema = z.string().trim().min(1).max(160);
const isoOffsetSchema = z.string().refine(isValidOffset, {
  message: "must be an ISO 8601 timestamp with an explicit offset",
});
const canonicalUtcSchema = z.string().refine(isCanonicalUtc, {
  message: "must be a canonical ISO 8601 UTC timestamp",
});
const localDateSchema = z.string().refine(isRealCalendarDate, {
  message: "must be a real YYYY-MM-DD calendar date",
});
const hhmmSchema = z.string().refine((value) => timePattern.test(value), {
  message: "must use HH:mm",
});

export const priorityWeightsSchema = z
  .object({
    street_food: priorityWeightSchema,
    history: priorityWeightSchema,
    traditional_craft: priorityWeightSchema,
    traditional_market: priorityWeightSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (Object.values(value).every((weight) => weight === 0)) {
      context.addIssue({
        code: "custom",
        message: "at least one priority weight must be positive",
        path: [],
      });
    }
  });

const budgetSchema = z
  .object({
    currency: currencySchema,
    amountMinor: nonNegativeSafeInteger,
  })
  .strict();

export const openingWindowSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    opensAt: hhmmSchema,
    closesAt: hhmmSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.opensAt === value.closesAt) {
      context.addIssue({
        code: "custom",
        message: "opening and closing times cannot be equal",
        path: ["closesAt"],
      });
    }
  });

const exceptionWindowSchema = z
  .object({ opensAt: hhmmSchema, closesAt: hhmmSchema })
  .strict()
  .superRefine((value, context) => {
    if (value.opensAt === value.closesAt) {
      context.addIssue({
        code: "custom",
        message: "opening and closing times cannot be equal",
        path: ["closesAt"],
      });
    }
  });

export const openingExceptionSchema = z
  .object({
    localDate: localDateSchema,
    closed: z.boolean(),
    windows: z.array(exceptionWindowSchema).max(8),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.closed && value.windows.length > 0) {
      context.addIssue({
        code: "custom",
        message: "closed exceptions cannot contain opening windows",
        path: ["windows"],
      });
    }
    if (!value.closed && hasOverlappingWindows(value.windows)) {
      context.addIssue({
        code: "custom",
        message: "exception windows cannot overlap",
        path: ["windows"],
      });
    }
  });

const supportRecordSchema = z.record(z.string().trim().min(1).max(80), supportStatusSchema);

export const placeCandidateSchema = z
  .object({
    id: idSchema,
    areaId: idSchema,
    types: z.array(experienceTypeSchema).min(1).max(4),
    priceVndPerPerson: nonNegativeSafeInteger.max(MAX_PLACE_COST),
    visitDurationMinutes: safeInteger.min(15).max(480),
    guideLanguages: z.array(localeSchema).min(1).max(2),
    dietarySupport: supportRecordSchema,
    mobilitySupport: supportRecordSchema,
    openingHours: z.array(openingWindowSchema).max(28),
    openingExceptions: z.array(openingExceptionSchema).max(366),
  })
  .strict()
  .superRefine((value, context) => {
    if (!unique(value.types)) {
      context.addIssue({
        code: "custom",
        message: "place types must be unique",
        path: ["types"],
      });
    }
    if (!unique(value.guideLanguages)) {
      context.addIssue({
        code: "custom",
        message: "guide languages must be unique",
        path: ["guideLanguages"],
      });
    }
    if (hasOverlappingWeeklyWindows(value.openingHours)) {
      context.addIssue({
        code: "custom",
        message: "opening windows cannot overlap",
        path: ["openingHours"],
      });
    }
    const dates = value.openingExceptions.map((exception) => exception.localDate);
    if (!unique(dates)) {
      context.addIssue({
        code: "custom",
        message: "opening exception dates must be unique",
        path: ["openingExceptions"],
      });
    }
  });

export const catalogSnapshotSchema = z
  .object({
    id: idSchema,
    places: z.array(placeCandidateSchema).max(5000),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.places.map((place) => place.id);
    if (!unique(ids)) {
      context.addIssue({
        code: "custom",
        message: "catalog place IDs must be unique",
        path: ["places"],
      });
    }
  });

export const travelEdgeSchema = z
  .object({
    fromPlaceId: idSchema,
    toPlaceId: idSchema,
    mode: z.enum(["walk", "taxi", "public_transport"]),
    minutes: safeInteger.min(1).max(240),
    groupCostVnd: nonNegativeSafeInteger.max(MAX_TRAVEL_COST),
    verifiedAt: isoOffsetSchema,
  })
  .strict();

export const travelSnapshotSchema = z
  .object({ id: idSchema, edges: z.array(travelEdgeSchema) })
  .strict()
  .superRefine((value, context) => {
    const keys = value.edges.map(
      (edge) => `${edge.fromPlaceId}\u0000${edge.toPlaceId}`,
    );
    if (!unique(keys)) {
      context.addIssue({
        code: "custom",
        message: "travel edges must be unique by directed place pair",
        path: ["edges"],
      });
    }
  });

export const fxSnapshotSchema = z
  .object({
    id: idSchema,
    vndPerUsd: z.string().regex(decimalPattern).refine((value) => Number(value) > 0, {
      message: "FX rate must be positive",
    }),
    observedAtUtc: canonicalUtcSchema,
  })
  .strict();

export const itineraryRequestSchema = z
  .object({
    startAt: isoOffsetSchema,
    durationMinutes: safeInteger.min(60).max(720),
    areas: z.array(idSchema).min(1).max(12),
    budget: budgetSchema,
    partySize: safeInteger.min(1).max(20),
    guideLanguage: localeSchema,
    priorityWeights: priorityWeightsSchema,
    pace: paceSchema,
    dietaryRequirements: z.array(idSchema).max(12),
    mobilityRequirements: z.array(idSchema).max(12),
    lockedStopIds: z.array(idSchema).max(8),
  })
  .strict()
  .superRefine((value, context) => {
    const arrays: Array<[string, readonly string[]]> = [
      ["areas", value.areas],
      ["dietaryRequirements", value.dietaryRequirements],
      ["mobilityRequirements", value.mobilityRequirements],
      ["lockedStopIds", value.lockedStopIds],
    ];
    for (const [name, values] of arrays) {
      if (!unique(values)) {
        context.addIssue({
          code: "custom",
          message: `${name} must contain unique IDs`,
          path: [name],
        });
      }
    }
  });

export const openingIntervalSchema = z
  .object({
    startEpochMinute: safeInteger,
    endEpochMinute: safeInteger,
    sourceWindowKey: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.startEpochMinute >= value.endEpochMinute) {
      context.addIssue({
        code: "custom",
        message: "opening interval must have a positive duration",
        path: ["endEpochMinute"],
      });
    }
  });

export const itineraryItemSchema = z
  .object({
    placeId: idSchema,
    startAt: z.string().refine(isCanonicalHcmOutput, {
      message: "itinerary times must use +07:00",
    }),
    endAt: z.string().refine(isCanonicalHcmOutput, {
      message: "itinerary times must use +07:00",
    }),
    visitDurationMinutes: safeInteger.min(15).max(480),
    travelMinutesBefore: safeInteger.nonnegative(),
    transitionBufferMinutesBefore: z.union([z.literal(0), z.literal(10)]),
    travelCostVndBefore: nonNegativeSafeInteger,
    placeCostVnd: nonNegativeSafeInteger,
    score: z.number().finite().safe(),
  })
  .strict();

export const itineraryTotalsSchema = z
  .object({
    durationMinutes: safeInteger.nonnegative(),
    visitMinutes: safeInteger.nonnegative(),
    travelMinutes: safeInteger.nonnegative(),
    transitionBufferMinutes: safeInteger.nonnegative(),
    groupCostVnd: nonNegativeSafeInteger,
    score: z.number().finite().safe(),
  })
  .strict();

export const itineraryResultSchema = z
  .object({
    normalizedStartAt: z.string().refine(isCanonicalHcmOutput, {
      message: "itinerary times must use +07:00",
    }),
    budgetVnd: nonNegativeSafeInteger,
    rankingSource: z.enum(["ai", "deterministic"]),
    items: z.array(itineraryItemSchema).max(8),
    totals: itineraryTotalsSchema,
    snapshotIds: z
      .object({ catalog: idSchema, travel: idSchema, fx: z.union([idSchema, z.null()]) })
      .strict(),
  })
  .strict();

export const engineInputSchema = z
  .object({
    request: itineraryRequestSchema,
    catalog: catalogSnapshotSchema,
    travel: travelSnapshotSchema,
    fx: fxSnapshotSchema.optional(),
    asOfUtc: canonicalUtcSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.request.budget.currency === "USD" && value.fx === undefined) {
      context.addIssue({
        code: "custom",
        message: "USD budgets require an FX snapshot",
        path: ["fx"],
      });
    }
    if (value.fx !== undefined && Date.parse(value.asOfUtc) < Date.parse(value.fx.observedAtUtc)) {
      context.addIssue({
        code: "custom",
        message: "as-of time cannot precede the FX observation",
        path: ["asOfUtc"],
      });
    }
  });

export type ItineraryRequest = z.infer<typeof itineraryRequestSchema>;
export type OpeningWindow = z.infer<typeof openingWindowSchema>;
export type OpeningException = z.infer<typeof openingExceptionSchema>;
export type OpeningInterval = z.infer<typeof openingIntervalSchema>;
export type PlaceCandidate = z.infer<typeof placeCandidateSchema>;
export type CatalogSnapshot = z.infer<typeof catalogSnapshotSchema>;
export type TravelEdge = z.infer<typeof travelEdgeSchema>;
export type TravelSnapshot = z.infer<typeof travelSnapshotSchema>;
export type FxSnapshot = z.infer<typeof fxSnapshotSchema>;
export type EngineInput = z.infer<typeof engineInputSchema>;
export type ItineraryItem = z.infer<typeof itineraryItemSchema>;
export type ItineraryTotals = z.infer<typeof itineraryTotalsSchema>;
export type ItineraryResult = z.infer<typeof itineraryResultSchema>;

export const LocaleSchema = localeSchema;
export const ExperienceTypeSchema = experienceTypeSchema;
export const SupportStatusSchema = supportStatusSchema;
export const PaceSchema = paceSchema;
export const CurrencySchema = currencySchema;
export const PriorityWeightsSchema = priorityWeightsSchema;
export const ItineraryRequestSchema = itineraryRequestSchema;
export const OpeningWindowSchema = openingWindowSchema;
export const OpeningExceptionSchema = openingExceptionSchema;
export const OpeningIntervalSchema = openingIntervalSchema;
export const PlaceCandidateSchema = placeCandidateSchema;
export const CatalogSnapshotSchema = catalogSnapshotSchema;
export const TravelEdgeSchema = travelEdgeSchema;
export const TravelSnapshotSchema = travelSnapshotSchema;
export const FxSnapshotSchema = fxSnapshotSchema;
export const EngineInputSchema = engineInputSchema;
export const ItineraryItemSchema = itineraryItemSchema;
export const ItineraryTotalsSchema = itineraryTotalsSchema;
export const ItineraryResultSchema = itineraryResultSchema;

export function parseEngineInput(source: unknown): Result<EngineInput> {
  const parsed = engineInputSchema.safeParse(source);
  if (parsed.success) return { ok: true, value: parsed.data };

  const issueKeys = parsed.error.issues
    .map((issue) => issuePath(issue.path))
    .filter((path, index, paths) => path.length > 0 && paths.indexOf(path) === index);

  return {
    ok: false,
    error: domainError(
      "INVALID_ITINERARY_INPUT",
      "itinerary.input.invalid",
      issueKeys,
    ),
  };
}
