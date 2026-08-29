import {
  catalogSnapshotSchema,
  type CatalogSnapshot,
  type ExperienceType,
  type Locale,
  type SupportStatus,
  type Result,
} from "@/lib/domain/itinerary/contracts";
import type {
  FoodMenuItemCandidate,
  FoodServiceType,
  ServingUnit,
  FoodVendorCandidate,
} from "@/lib/domain/food/contracts";
import type { DataAdapterError } from "@/lib/domain/data/contracts";

/**
 * This is the allowlisted row shape returned by
 * `public.catalog_snapshot_places_v`.  The view aggregates every child table
 * into a dense JSON value so the adapter never has to infer missing places or
 * facts from a partially embedded PostgREST response.
 */
export interface CatalogSnapshotProjectionRow {
  snapshot_id: string;
  place_id: string;
  area_id: string;
  price_vnd_per_person: string;
  visit_duration_minutes: number;
  experience_types: string[];
  guide_languages: string[];
  dietary_support: Record<string, string>;
  mobility_support: Record<string, string>;
  opening_hours: Array<{
    weekday: number;
    opens_at: string;
    closes_at: string;
  }>;
  opening_exceptions: Array<{
    local_date: string;
    closed: boolean;
    windows: Array<{ opens_at: string; closes_at: string }>;
  }>;
}

const ROW_FIELDS = [
  "snapshot_id",
  "place_id",
  "area_id",
  "price_vnd_per_person",
  "visit_duration_minutes",
  "experience_types",
  "guide_languages",
  "dietary_support",
  "mobility_support",
  "opening_hours",
  "opening_exceptions",
] as const;

const OPENING_FIELDS = ["weekday", "opens_at", "closes_at"] as const;
const EXCEPTION_FIELDS = ["local_date", "closed", "windows"] as const;
const WINDOW_FIELDS = ["opens_at", "closes_at"] as const;
const EXPERIENCE_TYPES = new Set<ExperienceType>([
  "street_food",
  "history",
  "traditional_craft",
  "traditional_market",
]);
const LOCALES = new Set<Locale>(["en", "vi"]);
const SUPPORT_STATUSES = new Set<SupportStatus>([
  "supported",
  "unsupported",
  "unknown",
]);
const CANONICAL_UNSIGNED_DECIMAL = /^(?:0|[1-9]\d*)$/;
const CANONICAL_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);
const MAX_PLACE_COST = Math.floor(Number.MAX_SAFE_INTEGER / 20);
const FOOD_VENDOR_FIELDS = [
  "snapshot_id",
  "place_id",
  "vendor_id",
  "slug",
  "title",
  "description",
  "location_note",
  "service_type",
  "capacity_note",
  "dietary_support",
  "mobility_support",
  "opening_hours",
  "opening_exceptions",
  "status",
  "verified_at",
] as const;
const FOOD_ITEM_FIELDS = [
  "snapshot_id",
  "place_id",
  "vendor_id",
  "item_id",
  "slug",
  "title",
  "description",
  "serving_unit",
  "price_vnd_min",
  "price_vnd_max",
  "portion_description",
  "dietary_support",
  "allergens",
  "available",
  "status",
  "verified_at",
] as const;
const FOOD_BUNDLE_FIELDS = ["vendors", "items"] as const;
const FOOD_SERVICE_TYPES = new Set<FoodServiceType>([
  "stall",
  "shop",
  "food_court",
  "street_vendor",
]);
const SERVING_UNITS = new Set<ServingUnit>([
  "portion",
  "bowl",
  "piece",
  "drink",
  "shared_set",
]);
type EngineWeekday = CatalogSnapshot["places"][number]["openingHours"][number]["weekday"];

const invalid = (
  code: DataAdapterError["code"],
  messageKey: string,
  fieldPath?: string,
): Result<never, DataAdapterError> => ({
  ok: false,
  error: fieldPath ? { code, messageKey, fieldPath } : { code, messageKey },
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactFields(
  value: unknown,
  fields: readonly string[],
  path: string,
): Result<Record<string, unknown>, DataAdapterError> {
  if (value === undefined) return invalid("MISSING_FIELD", "data.adapter.missing_field", path);
  if (!isRecord(value)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  const actual = Object.keys(value);
  const unknown = actual.find((key) => !fields.includes(key));
  if (unknown !== undefined) return invalid("UNKNOWN_FIELD", "data.adapter.unknown_field", `${path}.${unknown}`);
  const missing = fields.find((key) => value[key] === undefined || !actual.includes(key));
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
  if (Object.keys(value).some((key) => !/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) {
    return invalid("UNKNOWN_FIELD", "data.adapter.unknown_field", path);
  }
  return { ok: true, value };
}

function safeId(value: unknown, path: string): Result<string, DataAdapterError> {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    value.trim() !== value ||
    !UUID_PATTERN.test(value) ||
    /[\u0000-\u001F\u007F]/.test(value)
  ) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value };
}

function safeMoney(value: unknown, path: string): Result<number, DataAdapterError> {
  if (typeof value !== "string" || !CANONICAL_UNSIGNED_DECIMAL.test(value)) {
    return invalid("INVALID_DB_DECIMAL", "data.decimal.invalid", path);
  }
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    return invalid("INVALID_DB_DECIMAL", "data.decimal.invalid", path);
  }
  if (parsed > MAX_SAFE_INTEGER) return invalid("UNSAFE_DB_INTEGER", "data.integer.unsafe", path);
  if (parsed > BigInt(MAX_PLACE_COST)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  return { ok: true, value: Number(parsed) };
}

/** Food prices are bigint-backed too, but unlike admission prices have no domain cap. */
function safeFoodMoney(value: unknown, path: string): Result<number, DataAdapterError> {
  if (typeof value !== "string" || !CANONICAL_UNSIGNED_DECIMAL.test(value)) {
    return invalid("INVALID_DB_DECIMAL", "data.decimal.invalid", path);
  }
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    return invalid("INVALID_DB_DECIMAL", "data.decimal.invalid", path);
  }
  if (parsed > MAX_SAFE_INTEGER) return invalid("UNSAFE_DB_INTEGER", "data.integer.unsafe", path);
  return { ok: true, value: Number(parsed) };
}

function textValue(value: unknown, path: string, maxLength = 2_000): Result<string, DataAdapterError> {
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

function bilingualLabel(value: unknown, path: string): Result<{ en: string; vi: string }, DataAdapterError> {
  const fields = exactFields(value, ["en", "vi"], path);
  if (!fields.ok) return fields;
  const en = textValue(fields.value.en, `${path}.en`);
  const vi = textValue(fields.value.vi, `${path}.vi`);
  if (!en.ok) return en;
  if (!vi.ok) return vi;
  return { ok: true, value: { en: en.value, vi: vi.value } };
}

function foodEnum<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  path: string,
): Result<T, DataAdapterError> {
  if (typeof value !== "string" || !allowed.has(value as T)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value: value as T };
}

function foodAllergens(value: unknown, path: string): Result<string[], DataAdapterError> {
  const array = denseArray(value, path);
  if (!array.ok) return array;
  if (array.value.length > 32) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  const result: string[] = [];
  for (let index = 0; index < array.value.length; index += 1) {
    const allergen = textValue(array.value[index], `${path}[${index}]`, 160);
    if (!allergen.ok) return allergen;
    if (result.includes(allergen.value)) {
      return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}[${index}]`);
    }
    result.push(allergen.value);
  }
  return { ok: true, value: result };
}

function safeDuration(value: unknown, path: string): Result<number, DataAdapterError> {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 15 || value > 480) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value };
}

function localTime(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string" || !CANONICAL_TIME.test(value)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  const seconds = value.slice(5);
  if (seconds !== "" && !/^:00(?:\.0+)?$/.test(seconds)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  // Opening facts are deliberately local wall-clock facts.  +07:00 is applied
  // only by the itinerary time engine, never by this database boundary.
  return { ok: true, value: value.slice(0, 5) };
}

function localDate(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string") return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  const match = value.match(DATE_PATTERN);
  if (!match) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value };
}

function uniqueStrings<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  path: string,
  min = 1,
  max = 8,
): Result<T[], DataAdapterError> {
  const array = denseArray(value, path);
  if (!array.ok) return array;
  if (array.value.length < min || array.value.length > max) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  const result: T[] = [];
  for (let index = 0; index < array.value.length; index += 1) {
    const item = array.value[index];
    if (typeof item !== "string" || !allowed.has(item as T) || result.includes(item as T)) {
      return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}[${index}]`);
    }
    result.push(item as T);
  }
  return { ok: true, value: result };
}

function supportRecord(
  value: unknown,
  path: string,
): Result<Record<string, SupportStatus>, DataAdapterError> {
  if (!isRecord(value)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  const result: Record<string, SupportStatus> = {};
  for (const [key, status] of Object.entries(value)) {
    if (
      key.length < 1 ||
      key.length > 80 ||
      key.trim() !== key ||
      /[\u0000-\u001F\u007F]/.test(key) ||
      typeof status !== "string" ||
      !SUPPORT_STATUSES.has(status as SupportStatus)
    ) {
      return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}.${key}`);
    }
    result[key] = status as SupportStatus;
  }
  return { ok: true, value: result };
}

function openingWindow(value: unknown, path: string) {
  const fields = exactFields(value, OPENING_FIELDS, path);
  if (!fields.ok) return fields;
  const weekday = fields.value.weekday;
  if (typeof weekday !== "number" || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}.weekday`);
  }
  const opensAt = localTime(fields.value.opens_at, `${path}.opens_at`);
  const closesAt = localTime(fields.value.closes_at, `${path}.closes_at`);
  if (!opensAt.ok) return opensAt;
  if (!closesAt.ok) return closesAt;
  if (opensAt.value === closesAt.value) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}.closes_at`);
  }
  return { ok: true as const, value: { weekday: weekday as EngineWeekday, opensAt: opensAt.value, closesAt: closesAt.value } };
}

function exceptionWindow(value: unknown, path: string) {
  const fields = exactFields(value, WINDOW_FIELDS, path);
  if (!fields.ok) return fields;
  const opensAt = localTime(fields.value.opens_at, `${path}.opens_at`);
  const closesAt = localTime(fields.value.closes_at, `${path}.closes_at`);
  if (!opensAt.ok) return opensAt;
  if (!closesAt.ok) return closesAt;
  if (opensAt.value === closesAt.value) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}.closes_at`);
  }
  return { ok: true as const, value: { opensAt: opensAt.value, closesAt: closesAt.value } };
}

function openingHours(value: unknown, path: string) {
  const array = denseArray(value, path);
  if (!array.ok) return array;
  if (array.value.length > 28) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  const result: Array<{ weekday: EngineWeekday; opensAt: string; closesAt: string }> = [];
  for (let index = 0; index < array.value.length; index += 1) {
    const window = openingWindow(array.value[index], `${path}[${index}]`);
    if (!window.ok) return window;
    result.push(window.value);
  }
  return { ok: true as const, value: result };
}

function openingExceptions(value: unknown, path: string) {
  const array = denseArray(value, path);
  if (!array.ok) return array;
  if (array.value.length > 366) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  const result: Array<{
    localDate: string;
    closed: boolean;
    windows: Array<{ opensAt: string; closesAt: string }>;
  }> = [];
  const dates = new Set<string>();
  for (let index = 0; index < array.value.length; index += 1) {
    const fields = exactFields(array.value[index], EXCEPTION_FIELDS, `${path}[${index}]`);
    if (!fields.ok) return fields;
    const date = localDate(fields.value.local_date, `${path}[${index}].local_date`);
    if (!date.ok) return date;
    if (dates.has(date.value)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}[${index}].local_date`);
    dates.add(date.value);
    if (typeof fields.value.closed !== "boolean") {
      return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}[${index}].closed`);
    }
    const windows = denseArray(fields.value.windows, `${path}[${index}].windows`);
    if (!windows.ok) return windows;
    if (windows.value.length > 8 || (fields.value.closed && windows.value.length > 0)) {
      return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}[${index}].windows`);
    }
    const mappedWindows: Array<{ opensAt: string; closesAt: string }> = [];
    for (let windowIndex = 0; windowIndex < windows.value.length; windowIndex += 1) {
      const window = exceptionWindow(windows.value[windowIndex], `${path}[${index}].windows[${windowIndex}]`);
      if (!window.ok) return window;
      mappedWindows.push(window.value);
    }
    result.push({ localDate: date.value, closed: fields.value.closed, windows: mappedWindows });
  }
  return { ok: true as const, value: result };
}

type MappedCatalogRow = {
  snapshotId: string;
  placeId: string;
  place: CatalogSnapshot["places"][number];
};

type MappedFoodVendor = {
  snapshotId: string;
  placeId: string;
  vendorId: string;
  vendor: FoodVendorCandidate;
};

type MappedFoodItem = {
  snapshotId: string;
  placeId: string;
  vendorId: string;
  itemId: string;
  item: FoodMenuItemCandidate;
};

function mapRow(value: unknown, rowIndex: number): Result<MappedCatalogRow, DataAdapterError> {
  const fields = exactFields(value, ROW_FIELDS, `rows[${rowIndex}]`);
  if (!fields.ok) return fields;
  const snapshotId = safeId(fields.value.snapshot_id, `rows[${rowIndex}].snapshot_id`);
  const placeId = safeId(fields.value.place_id, `rows[${rowIndex}].place_id`);
  const areaId = safeId(fields.value.area_id, `rows[${rowIndex}].area_id`);
  if (!snapshotId.ok) return snapshotId;
  if (!placeId.ok) return placeId;
  if (!areaId.ok) return areaId;
  const price = safeMoney(fields.value.price_vnd_per_person, `rows[${rowIndex}].price_vnd_per_person`);
  const duration = safeDuration(fields.value.visit_duration_minutes, `rows[${rowIndex}].visit_duration_minutes`);
  const types = uniqueStrings(fields.value.experience_types, EXPERIENCE_TYPES, `rows[${rowIndex}].experience_types`, 1, 4);
  const languages = uniqueStrings(fields.value.guide_languages, LOCALES, `rows[${rowIndex}].guide_languages`, 1, 2);
  const dietary = supportRecord(fields.value.dietary_support, `rows[${rowIndex}].dietary_support`);
  const mobility = supportRecord(fields.value.mobility_support, `rows[${rowIndex}].mobility_support`);
  const hours = openingHours(fields.value.opening_hours, `rows[${rowIndex}].opening_hours`);
  const exceptions = openingExceptions(fields.value.opening_exceptions, `rows[${rowIndex}].opening_exceptions`);
  if (!price.ok) return price;
  if (!duration.ok) return duration;
  if (!types.ok) return types;
  if (!languages.ok) return languages;
  if (!dietary.ok) return dietary;
  if (!mobility.ok) return mobility;
  if (!hours.ok) return hours;
  if (!exceptions.ok) return exceptions;
  return {
    ok: true as const,
    value: {
      snapshotId: snapshotId.value,
      placeId: placeId.value,
      place: {
        id: placeId.value,
        areaId: areaId.value,
        types: types.value,
        priceVndPerPerson: price.value,
        visitDurationMinutes: duration.value,
        guideLanguages: languages.value,
        dietarySupport: dietary.value,
        mobilitySupport: mobility.value,
        openingHours: hours.value,
        openingExceptions: exceptions.value,
        foodVendors: [],
      },
    },
  };
}

function mapFoodVendor(value: unknown, rowIndex: number): Result<MappedFoodVendor, DataAdapterError> {
  const path = `foodRows.vendors[${rowIndex}]`;
  const fields = exactFields(value, FOOD_VENDOR_FIELDS, path);
  if (!fields.ok) return fields;
  const snapshotId = safeId(fields.value.snapshot_id, `${path}.snapshot_id`);
  const placeId = safeId(fields.value.place_id, `${path}.place_id`);
  const vendorId = safeId(fields.value.vendor_id, `${path}.vendor_id`);
  const slug = textValue(fields.value.slug, `${path}.slug`, 160);
  const title = bilingualLabel(fields.value.title, `${path}.title`);
  const description = bilingualLabel(fields.value.description, `${path}.description`);
  const locationNote = textValue(fields.value.location_note, `${path}.location_note`);
  const serviceType = foodEnum(fields.value.service_type, FOOD_SERVICE_TYPES, `${path}.service_type`);
  const capacityNote = textValue(fields.value.capacity_note, `${path}.capacity_note`);
  const dietarySupport = supportRecord(fields.value.dietary_support, `${path}.dietary_support`);
  const mobilitySupport = supportRecord(fields.value.mobility_support, `${path}.mobility_support`);
  const hours = openingHours(fields.value.opening_hours, `${path}.opening_hours`);
  const exceptions = openingExceptions(fields.value.opening_exceptions, `${path}.opening_exceptions`);
  const verifiedAt = localDate(fields.value.verified_at, `${path}.verified_at`);
  if (!snapshotId.ok) return snapshotId;
  if (!placeId.ok) return placeId;
  if (!vendorId.ok) return vendorId;
  if (!slug.ok) return slug;
  if (!title.ok) return title;
  if (!description.ok) return description;
  if (!locationNote.ok) return locationNote;
  if (!serviceType.ok) return serviceType;
  if (!capacityNote.ok) return capacityNote;
  if (!dietarySupport.ok) return dietarySupport;
  if (!mobilitySupport.ok) return mobilitySupport;
  if (!hours.ok) return hours;
  if (!exceptions.ok) return exceptions;
  if (!verifiedAt.ok) return verifiedAt;
  if (fields.value.status !== "published") {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}.status`);
  }
  return {
    ok: true,
    value: {
      snapshotId: snapshotId.value,
      placeId: placeId.value,
      vendorId: vendorId.value,
      vendor: {
        id: vendorId.value,
        placeId: placeId.value,
        slug: slug.value,
        title: title.value,
        description: description.value,
        locationNote: locationNote.value,
        serviceType: serviceType.value,
        capacityNote: capacityNote.value,
        dietarySupport: dietarySupport.value,
        mobilitySupport: mobilitySupport.value,
        openingHours: hours.value,
        openingExceptions: exceptions.value,
        status: "sellable",
        menuItems: [],
      },
    },
  };
}

function mapFoodItem(value: unknown, rowIndex: number): Result<MappedFoodItem, DataAdapterError> {
  const path = `foodRows.items[${rowIndex}]`;
  const fields = exactFields(value, FOOD_ITEM_FIELDS, path);
  if (!fields.ok) return fields;
  const snapshotId = safeId(fields.value.snapshot_id, `${path}.snapshot_id`);
  const placeId = safeId(fields.value.place_id, `${path}.place_id`);
  const vendorId = safeId(fields.value.vendor_id, `${path}.vendor_id`);
  const itemId = safeId(fields.value.item_id, `${path}.item_id`);
  const slug = textValue(fields.value.slug, `${path}.slug`, 160);
  const title = bilingualLabel(fields.value.title, `${path}.title`);
  const description = bilingualLabel(fields.value.description, `${path}.description`);
  const servingUnit = foodEnum(fields.value.serving_unit, SERVING_UNITS, `${path}.serving_unit`);
  const priceMin = safeFoodMoney(fields.value.price_vnd_min, `${path}.price_vnd_min`);
  const priceMax = safeFoodMoney(fields.value.price_vnd_max, `${path}.price_vnd_max`);
  const portionDescription = textValue(fields.value.portion_description, `${path}.portion_description`);
  const dietarySupport = supportRecord(fields.value.dietary_support, `${path}.dietary_support`);
  const allergens = foodAllergens(fields.value.allergens, `${path}.allergens`);
  const verifiedAt = localDate(fields.value.verified_at, `${path}.verified_at`);
  if (!snapshotId.ok) return snapshotId;
  if (!placeId.ok) return placeId;
  if (!vendorId.ok) return vendorId;
  if (!itemId.ok) return itemId;
  if (!slug.ok) return slug;
  if (!title.ok) return title;
  if (!description.ok) return description;
  if (!servingUnit.ok) return servingUnit;
  if (!priceMin.ok) return priceMin;
  if (!priceMax.ok) return priceMax;
  if (!portionDescription.ok) return portionDescription;
  if (!dietarySupport.ok) return dietarySupport;
  if (!allergens.ok) return allergens;
  if (typeof fields.value.available !== "boolean") {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}.available`);
  }
  if (!verifiedAt.ok) return verifiedAt;
  if (fields.value.status !== "published") {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}.status`);
  }
  if (priceMin.value > priceMax.value) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}.price_vnd_max`);
  }
  return {
    ok: true,
    value: {
      snapshotId: snapshotId.value,
      placeId: placeId.value,
      vendorId: vendorId.value,
      itemId: itemId.value,
      item: {
        id: itemId.value,
        vendorId: vendorId.value,
        slug: slug.value,
        title: title.value,
        description: description.value,
        servingUnit: servingUnit.value,
        priceVndMin: priceMin.value,
        priceVndMax: priceMax.value,
        portionDescription: portionDescription.value,
        dietarySupport: dietarySupport.value,
        allergens: allergens.value,
        available: fields.value.available,
        status: "sellable",
        verifiedAt: verifiedAt.value,
      },
    },
  };
}

/** Map only the named published catalog projection into the strict engine DTO. */
export function mapCatalogSnapshot(
  rows: unknown,
  foodRows: unknown,
): Result<CatalogSnapshot, DataAdapterError> {
  const array = denseArray(rows, "rows");
  if (!array.ok) return array;
  if (array.value.length === 0) return invalid("MISSING_FIELD", "data.adapter.missing_field", "rows[0]");

  const mapped: MappedCatalogRow[] = [];
  for (let index = 0; index < array.value.length; index += 1) {
    const result = mapRow(array.value[index], index);
    if (!result.ok) return result;
    mapped.push(result.value);
  }

  const snapshotId = mapped[0]?.snapshotId;
  const placeIds = new Set<string>();
  for (const item of mapped) {
    if (item.snapshotId !== snapshotId || placeIds.has(item.placeId)) {
      return invalid("SNAPSHOT_MISMATCH", "data.snapshot.mismatch", "rows");
    }
    placeIds.add(item.placeId);
  }

  const foodFields = exactFields(foodRows, FOOD_BUNDLE_FIELDS, "foodRows");
  if (!foodFields.ok) return foodFields;
  const vendorRows = denseArray(foodFields.value.vendors, "foodRows.vendors");
  const itemRows = denseArray(foodFields.value.items, "foodRows.items");
  if (!vendorRows.ok) return vendorRows;
  if (!itemRows.ok) return itemRows;

  const foodVendors: MappedFoodVendor[] = [];
  const vendorIds = new Set<string>();
  const vendorKeys = new Set<string>();
  for (let index = 0; index < vendorRows.value.length; index += 1) {
    const result = mapFoodVendor(vendorRows.value[index], index);
    if (!result.ok) return result;
    const mappedVendor = result.value;
    if (mappedVendor.snapshotId !== snapshotId) {
      return invalid("SNAPSHOT_MISMATCH", "data.snapshot.mismatch", `foodRows.vendors[${index}].snapshot_id`);
    }
    if (vendorIds.has(mappedVendor.vendorId)) {
      return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `foodRows.vendors[${index}].vendor_id`);
    }
    const vendorKey = `${mappedVendor.snapshotId}\u0000${mappedVendor.placeId}\u0000${mappedVendor.vendorId}`;
    if (vendorKeys.has(vendorKey)) {
      return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `foodRows.vendors[${index}]`);
    }
    if (!placeIds.has(mappedVendor.placeId)) {
      return invalid("SNAPSHOT_MISMATCH", "data.snapshot.mismatch", `foodRows.vendors[${index}].place_id`);
    }
    vendorIds.add(mappedVendor.vendorId);
    vendorKeys.add(vendorKey);
    foodVendors.push(mappedVendor);
  }

  const vendorByKey = new Map<string, MappedFoodVendor>();
  for (const mappedVendor of foodVendors) {
    vendorByKey.set(`${mappedVendor.snapshotId}\u0000${mappedVendor.placeId}\u0000${mappedVendor.vendorId}`, mappedVendor);
  }
  const foodItems: MappedFoodItem[] = [];
  const itemIds = new Set<string>();
  const itemKeys = new Set<string>();
  for (let index = 0; index < itemRows.value.length; index += 1) {
    const result = mapFoodItem(itemRows.value[index], index);
    if (!result.ok) return result;
    const mappedItem = result.value;
    if (mappedItem.snapshotId !== snapshotId) {
      return invalid("SNAPSHOT_MISMATCH", "data.snapshot.mismatch", `foodRows.items[${index}].snapshot_id`);
    }
    if (itemIds.has(mappedItem.itemId)) {
      return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `foodRows.items[${index}].item_id`);
    }
    const itemKey = `${mappedItem.snapshotId}\u0000${mappedItem.placeId}\u0000${mappedItem.vendorId}\u0000${mappedItem.itemId}`;
    if (itemKeys.has(itemKey)) {
      return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `foodRows.items[${index}]`);
    }
    const parentKey = `${mappedItem.snapshotId}\u0000${mappedItem.placeId}\u0000${mappedItem.vendorId}`;
    if (!vendorByKey.has(parentKey)) {
      return invalid("SNAPSHOT_MISMATCH", "data.snapshot.mismatch", `foodRows.items[${index}]`);
    }
    itemIds.add(mappedItem.itemId);
    itemKeys.add(itemKey);
    foodItems.push(mappedItem);
  }

  const candidate: CatalogSnapshot = {
    id: snapshotId ?? "",
    places: mapped.map((item) => item.place),
  };
  const placeById = new Map(candidate.places.map((place) => [place.id, place]));
  for (const mappedVendor of foodVendors) {
    placeById.get(mappedVendor.placeId)?.foodVendors.push(mappedVendor.vendor);
  }
  for (const mappedItem of foodItems) {
    vendorByKey.get(`${mappedItem.snapshotId}\u0000${mappedItem.placeId}\u0000${mappedItem.vendorId}`)?.vendor.menuItems.push(mappedItem.item);
  }
  const parsed = catalogSnapshotSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.length ? issue.path.join(".") : "rows";
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value: parsed.data };
}
