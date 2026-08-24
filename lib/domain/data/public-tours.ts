import type {
  DataAdapterError,
  Locale,
  PublishedTour,
  Result,
} from "@/lib/domain/data/contracts";

/**
 * The allowlisted row returned by `public.published_tours_v`.
 *
 * This adapter intentionally accepts one row, not an arbitrary PostgREST
 * response.  JSON arrays are checked for holes and unknown properties before
 * they are mapped so static generation cannot accidentally consume draft or
 * admin fields.
 */
export type PublishedTourProjectionRow = {
  tour_id: string;
  tour_version_id: string;
  slug: string;
  locale: Locale;
  title: string;
  summary: string;
  meeting_point: string;
  duration_minutes: number;
  price_vnd_minor: string;
  inclusions: string[];
  exclusions: string[];
  cancellation_policy: string;
  source_url: string;
  verified_at: string;
  attribution: string;
  license: string;
  stops: Array<{
    position: number;
    place_id: string;
    place_slug: string;
    title: string;
  }>;
};

const ROW_FIELDS = [
  "tour_id",
  "tour_version_id",
  "slug",
  "locale",
  "title",
  "summary",
  "meeting_point",
  "duration_minutes",
  "price_vnd_minor",
  "inclusions",
  "exclusions",
  "cancellation_policy",
  "source_url",
  "verified_at",
  "attribution",
  "license",
  "stops",
] as const;
const STOP_FIELDS = ["position", "place_id", "place_slug", "title"] as const;
const LOCALES = new Set<Locale>(["en", "vi"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CANONICAL_UNSIGNED_BIGINT = /^(?:0|[1-9]\d*)$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const FORBIDDEN_SOURCE_QUERY_KEY = /(^|_)(email|phone|name|token|session|user|customer)(_|$)/;

function invalid(
  code: DataAdapterError["code"],
  messageKey: string,
  fieldPath?: string,
): Result<never, DataAdapterError> {
  return {
    ok: false,
    error: fieldPath ? { code, messageKey, fieldPath } : { code, messageKey },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactFields(
  value: unknown,
  fields: readonly string[],
  path: string,
): Result<Record<string, unknown>, DataAdapterError> {
  if (!isRecord(value)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  const actual = Object.keys(value);
  const unknown = actual.find((key) => !fields.includes(key));
  if (unknown !== undefined) return invalid("UNKNOWN_FIELD", "data.adapter.unknown_field", `${path}.${unknown}`);
  const missing = fields.find((key) => !actual.includes(key) || value[key] === undefined);
  if (missing !== undefined) return invalid("MISSING_FIELD", "data.adapter.missing_field", `${path}.${missing}`);
  return { ok: true, value };
}

function denseArray(value: unknown, path: string): Result<unknown[], DataAdapterError> {
  if (!Array.isArray(value)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}[${index}]`);
    }
  }
  if (Object.keys(value).some((key) => !/^\d+$/.test(key))) {
    return invalid("UNKNOWN_FIELD", "data.adapter.unknown_field", path);
  }
  return { ok: true, value };
}

function textValue(value: unknown, path: string, maxLength: number): Result<string, DataAdapterError> {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maxLength ||
    value.trim() !== value ||
    /[\u0000-\u001F\u007F]/.test(value)
  ) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value };
}

function uuidValue(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string" || value !== value.toLowerCase() || !UUID_PATTERN.test(value)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value };
}

function slugValue(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string" || value.length > 160 || value.trim() !== value || !SLUG_PATTERN.test(value)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value };
}

function localeValue(value: unknown, path: string): Result<Locale, DataAdapterError> {
  if (typeof value !== "string" || !LOCALES.has(value as Locale)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value: value as Locale };
}

function dateValue(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string") return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  const match = value.match(DATE_PATTERN);
  if (!match) return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  }
  return { ok: true, value };
}

function httpsUrl(value: unknown, path: string): Result<string, DataAdapterError> {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length > 2048 ||
    /[\u0000-\u001F\u007F\s]/.test(value) ||
    value.includes("@") ||
    /^(?:https:)?\/\/[^/?#]*:\d+(?:[/?#]|$)/i.test(value) ||
    /(?:\?|&)[^=&#]*%[0-9a-f]{2}/i.test(value)
  ) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname === "" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.hash !== "" ||
      [...parsed.searchParams.keys()].some((key) => {
        const normalized = key.toLowerCase();
        return normalized.startsWith("utm_") || normalized === "fbclid" || normalized === "gclid" || FORBIDDEN_SOURCE_QUERY_KEY.test(normalized);
      })
    ) {
      return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
    }
  } catch {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value };
}

function bigintString(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string" || !CANONICAL_UNSIGNED_BIGINT.test(value)) {
    return invalid("INVALID_DB_INTEGER", "data.integer.invalid", path);
  }
  try {
    if (BigInt(value) > MAX_BIGINT) return invalid("UNSAFE_DB_INTEGER", "data.integer.unsafe", path);
  } catch {
    return invalid("INVALID_DB_INTEGER", "data.integer.invalid", path);
  }
  return { ok: true, value };
}

function safeDuration(value: unknown, path: string): Result<number, DataAdapterError> {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 1440) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value };
}

function stringArray(value: unknown, path: string): Result<string[], DataAdapterError> {
  const array = denseArray(value, path);
  if (!array.ok) return array;
  if (array.value.length > 32) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  const result: string[] = [];
  for (let index = 0; index < array.value.length; index += 1) {
    const item = textValue(array.value[index], `${path}[${index}]`, 500);
    if (!item.ok) return item;
    if (result.includes(item.value)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}[${index}]`);
    result.push(item.value);
  }
  return { ok: true, value: result };
}

function mapStops(value: unknown, path: string): Result<PublishedTour["stops"], DataAdapterError> {
  const array = denseArray(value, path);
  if (!array.ok) return array;
  if (array.value.length < 1 || array.value.length > 64) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  const result: PublishedTour["stops"] = [];
  const placeIds = new Set<string>();
  for (let index = 0; index < array.value.length; index += 1) {
    const fields = exactFields(array.value[index], STOP_FIELDS, `${path}[${index}]`);
    if (!fields.ok) return fields;
    if (fields.value.position !== index + 1 || !Number.isSafeInteger(fields.value.position)) {
      return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}[${index}].position`);
    }
    const placeId = uuidValue(fields.value.place_id, `${path}[${index}].place_id`);
    const placeSlug = slugValue(fields.value.place_slug, `${path}[${index}].place_slug`);
    const title = textValue(fields.value.title, `${path}[${index}].title`, 240);
    if (!placeId.ok) return placeId;
    if (!placeSlug.ok) return placeSlug;
    if (!title.ok) return title;
    if (placeIds.has(placeId.value)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}[${index}].place_id`);
    placeIds.add(placeId.value);
    result.push({ position: index + 1, placeId: placeId.value, placeSlug: placeSlug.value, title: title.value });
  }
  return { ok: true, value: result };
}

/** Map one exact localized row from `public.published_tours_v`. */
export function mapPublishedTour(row: unknown): Result<PublishedTour, DataAdapterError> {
  const fields = exactFields(row, ROW_FIELDS, "row");
  if (!fields.ok) return fields;
  const id = uuidValue(fields.value.tour_id, "row.tour_id");
  const versionId = uuidValue(fields.value.tour_version_id, "row.tour_version_id");
  const slug = slugValue(fields.value.slug, "row.slug");
  const locale = localeValue(fields.value.locale, "row.locale");
  const title = textValue(fields.value.title, "row.title", 240);
  const summary = textValue(fields.value.summary, "row.summary", 1000);
  const meetingPoint = textValue(fields.value.meeting_point, "row.meeting_point", 500);
  const duration = safeDuration(fields.value.duration_minutes, "row.duration_minutes");
  const price = bigintString(fields.value.price_vnd_minor, "row.price_vnd_minor");
  const inclusions = stringArray(fields.value.inclusions, "row.inclusions");
  const exclusions = stringArray(fields.value.exclusions, "row.exclusions");
  const cancellationPolicy = textValue(fields.value.cancellation_policy, "row.cancellation_policy", 2000);
  const sourceUrl = httpsUrl(fields.value.source_url, "row.source_url");
  const verifiedAt = dateValue(fields.value.verified_at, "row.verified_at");
  const attribution = textValue(fields.value.attribution, "row.attribution", 500);
  const license = textValue(fields.value.license, "row.license", 240);
  const stops = mapStops(fields.value.stops, "row.stops");
  if (!id.ok) return id;
  if (!versionId.ok) return versionId;
  if (!slug.ok) return slug;
  if (!locale.ok) return locale;
  if (!title.ok) return title;
  if (!summary.ok) return summary;
  if (!meetingPoint.ok) return meetingPoint;
  if (!duration.ok) return duration;
  if (!price.ok) return price;
  if (!inclusions.ok) return inclusions;
  if (!exclusions.ok) return exclusions;
  if (!cancellationPolicy.ok) return cancellationPolicy;
  if (!sourceUrl.ok) return sourceUrl;
  if (!verifiedAt.ok) return verifiedAt;
  if (!attribution.ok) return attribution;
  if (!license.ok) return license;
  if (!stops.ok) return stops;
  return {
    ok: true,
    value: {
      id: id.value,
      versionId: versionId.value,
      slug: slug.value,
      locale: locale.value,
      title: title.value,
      summary: summary.value,
      meetingPoint: meetingPoint.value,
      durationMinutes: duration.value,
      priceVndMinor: price.value,
      inclusions: inclusions.value,
      exclusions: exclusions.value,
      cancellationPolicy: cancellationPolicy.value,
      sourceUrl: sourceUrl.value,
      verifiedAt: verifiedAt.value,
      attribution: attribution.value,
      license: license.value,
      stops: stops.value,
    },
  };
}
