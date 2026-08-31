import type { DataAdapterError, Result } from "@/lib/domain/data/contracts";

export type FoodReviewStatus = "research_only" | "sellable" | "temporarily_closed";
export type FoodReviewDecision = "research_only" | "sellable";
export type FoodReviewSupportStatus = "supported" | "unsupported" | "unknown";

type NullableBilingualLabel = { en: string | null; vi: string | null };
type SupportRecord = Record<string, FoodReviewSupportStatus>;
type OpeningHour = { weekday: number; opensAt: string; closesAt: string };
type OpeningException = {
  localDate: string;
  closed: boolean;
  windows: Array<{ opensAt: string; closesAt: string }>;
};

export type AdminFoodReviewHistoryEntry = {
  eventId: string;
  decision: "approved" | "rejected";
  rejectionNote: string | null;
  actorUserId: string;
  reviewedAt: string;
};

export type AdminFoodReviewRow = {
  itemId: string;
  vendorId: string;
  placeId: string;
  vendor: {
    slug: string;
    title: NullableBilingualLabel;
    description: NullableBilingualLabel;
    locationNote: string | null;
    serviceType: "stall" | "shop" | "food_court" | "street_vendor";
    capacityNote: string | null;
    dietarySupport: SupportRecord;
    mobilitySupport: SupportRecord;
    openingHours: OpeningHour[];
    openingExceptions: OpeningException[];
    status: FoodReviewStatus;
    sourceUrl: string | null;
    verifiedAt: string | null;
    attribution: string | null;
  };
  item: {
    slug: string;
    title: NullableBilingualLabel;
    description: NullableBilingualLabel;
    servingUnit: "portion" | "bowl" | "piece" | "drink" | "shared_set";
    priceVndMin: string | null;
    priceVndMax: string | null;
    portionDescription: string | null;
    dietarySupport: SupportRecord;
    allergenSupport: SupportRecord;
    allergens: string[];
    available: boolean | null;
    status: FoodReviewStatus;
    sourceUrl: string | null;
    verifiedAt: string | null;
    attribution: string | null;
  };
  auditHistory: AdminFoodReviewHistoryEntry[];
};

export type ReviewFoodCatalogItemInput = {
  itemId: string;
  vendorId: string;
  decision: FoodReviewDecision;
  checklist: {
    source: boolean;
    bilingualName: boolean;
    location: boolean;
    hours: boolean;
    price: boolean;
    availability: boolean;
    dietaryAllergen: boolean;
    mobility: boolean;
  };
  rejectionNote: string | null;
};

export type ReviewFoodCatalogItemArgs = {
  itemId: string;
  vendorId: string;
  decision: FoodReviewDecision;
  checklist: {
    source_checked: boolean;
    bilingual_name_checked: boolean;
    location_checked: boolean;
    hours_checked: boolean;
    price_checked: boolean;
    availability_checked: boolean;
    dietary_allergen_checked: boolean;
    mobility_checked: boolean;
  };
  rejectionNote: string | null;
};

/** The queue is deliberately paged so an admin response cannot grow without bound. */
export const ADMIN_REVIEW_PAGE_SIZE = 25;
export const MAX_ADMIN_REVIEW_PAGE_SIZE = 50;
export const MAX_ADMIN_REVIEW_NESTED_ITEMS = 100;
export const MAX_ADMIN_REVIEW_OFFSET = 2_147_483_000;

export type AdminReviewRpcClient = {
  rpc: (functionName: string, args: Record<string, unknown>) => Promise<unknown>;
};

export type AdminReviewQueueClient = AdminReviewRpcClient & {
  auth: {
    getUser: () => Promise<unknown>;
  };
};

export type AdminFoodReviewQueue = {
  viewerRole: "admin";
  rows: AdminFoodReviewRow[];
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export type NonAdminFoodReviewQueue = {
  viewerRole: "customer" | "unknown";
  rows: [];
  page: number;
  pageSize: number;
  hasMore: false;
};

type UnknownRecord = Record<string, unknown>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/;
const MONEY_PATTERN = /^(?:0|[1-9]\d*)$/;
const SERVICE_TYPES = new Set(["stall", "shop", "food_court", "street_vendor"]);
const SERVING_UNITS = new Set(["portion", "bowl", "piece", "drink", "shared_set"]);
const SUPPORT_STATUSES = new Set<FoodReviewSupportStatus>(["supported", "unsupported", "unknown"]);
const REVIEW_STATUSES = new Set(["draft", "published", "archived", "research_only", "sellable", "temporarily_closed"]);
const REVIEW_DECISIONS = new Set<FoodReviewDecision>(["research_only", "sellable"]);
const REVIEW_ROW_FIELDS = ["item_id", "vendor_id", "place_id", "vendor", "item", "audit_history"] as const;
const VENDOR_FIELDS = [
  "slug", "title", "description", "location_note", "service_type", "capacity_note",
  "dietary_support", "mobility_support", "opening_hours", "opening_exceptions", "status",
  "source_url", "verified_at", "attribution",
] as const;
const ITEM_FIELDS = [
  "slug", "title", "description", "serving_unit", "price_vnd_min", "price_vnd_max",
  "portion_description", "dietary_support", "allergen_support", "allergens", "available", "status",
  "source_url", "verified_at", "attribution",
] as const;
const HISTORY_FIELDS = ["event_id", "decision", "rejection_note", "actor_user_id", "reviewed_at"] as const;
const CHECKLIST_FIELDS = [
  "source", "bilingualName", "location", "hours", "price", "availability", "dietaryAllergen", "mobility",
] as const;

type RpcEnvelope = { data: unknown; error: UnknownRecord | null };

function rpcEnvelope(value: unknown, path: string): Result<RpcEnvelope, DataAdapterError> {
  if (!isRecord(value)) return invalid("INVALID_SHAPE", "data.rpc.invalid_response", path);
  if (!Object.prototype.hasOwnProperty.call(value, "data") || !Object.prototype.hasOwnProperty.call(value, "error")) {
    return invalid("INVALID_SHAPE", "data.rpc.invalid_response", path);
  }
  if (value.error !== null && !isRecord(value.error)) return invalid("INVALID_SHAPE", "data.rpc.invalid_response", `${path}.error`);
  return { ok: true, value: { data: value.data, error: value.error as UnknownRecord | null } };
}

function rpcErrorCode(error: UnknownRecord | null): string | null {
  const code = error?.code;
  return typeof code === "string" ? code : null;
}

function rpcErrorMessage(error: UnknownRecord | null): string | null {
  const message = error?.message;
  return typeof message === "string" ? message : null;
}

function rpcFailure(path: string): Result<never, DataAdapterError> {
  return invalid("INVALID_SHAPE", "data.review.rpc_failed", path);
}

function invalid(
  code: DataAdapterError["code"],
  messageKey: string,
  fieldPath?: string,
): Result<never, DataAdapterError> {
  return {
    ok: false,
    error: fieldPath === undefined ? { code, messageKey } : { code, messageKey, fieldPath },
  };
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactFields(value: unknown, fields: readonly string[], path: string): Result<UnknownRecord, DataAdapterError> {
  if (!isRecord(value)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  const keys = Object.keys(value);
  const unknown = keys.find((key) => !fields.includes(key));
  if (unknown !== undefined) return invalid("UNKNOWN_FIELD", "data.adapter.unknown_field", `${path}.${unknown}`);
  const missing = fields.find((field) => !Object.prototype.hasOwnProperty.call(value, field));
  if (missing !== undefined) return invalid("MISSING_FIELD", "data.adapter.missing_field", `${path}.${missing}`);
  return { ok: true, value };
}

function safeUuid(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string" || value.trim() !== value || !UUID_PATTERN.test(value)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value };
}

function safeText(value: unknown, path: string, maxLength = 2_000): Result<string, DataAdapterError> {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maxLength ||
    value.trim() !== value ||
    /[\u0000-\u001F\u007F-\u009F]/.test(value)
  ) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value };
}

function nullableText(value: unknown, path: string, maxLength = 2_000): Result<string | null, DataAdapterError> {
  if (value === null) return { ok: true, value: null };
  return safeText(value, path, maxLength);
}

function nullableUrl(value: unknown, path: string): Result<string | null, DataAdapterError> {
  if (value === null) return { ok: true, value: null };
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length > 2_048 ||
    /[\u0000-\u001F\u007F\s]/.test(value) ||
    !/^https:\/\//.test(value)
  ) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value };
}

function nullableDate(value: unknown, path: string): Result<string | null, DataAdapterError> {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string") return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  const match = value.match(DATE_PATTERN);
  if (!match) return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  return { ok: true, value };
}

function auditTimestamp(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string" || value.trim() !== value || /[\u0000-\u001F\u007F-\u009F]/.test(value)) {
    return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  }
  const match = value.match(TIMESTAMP_PATTERN);
  if (!match) return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const localDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    localDate.getUTCFullYear() !== year
    || localDate.getUTCMonth() !== month - 1
    || localDate.getUTCDate() !== day
    || localDate.getUTCHours() !== hour
    || localDate.getUTCMinutes() !== minute
    || localDate.getUTCSeconds() !== second
  ) return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  const offset = match[8];
  if (offset !== "Z") {
    const offsetHours = Number(offset.slice(1, 3));
    const offsetMinutes = offset.length === 3 ? 0 : Number(offset.slice(-2));
    if (offsetHours > 23 || offsetMinutes > 59) return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  }
  const normalized = offset.length === 3 && offset !== "Z" ? `${value}:00` : value;
  if (!Number.isFinite(Date.parse(normalized.replace(" ", "T")))) {
    return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  }
  return { ok: true, value };
}

function nullableBilingual(value: unknown, path: string): Result<NullableBilingualLabel, DataAdapterError> {
  if (!isRecord(value)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  const result: NullableBilingualLabel = { en: null, vi: null };
  for (const key of Object.keys(value)) {
    if (key !== "en" && key !== "vi") return invalid("UNKNOWN_FIELD", "data.adapter.unknown_field", `${path}.${key}`);
    const entry = value[key];
    if (entry === null) continue;
    const parsed = safeText(entry, `${path}.${key}`, 2_000);
    if (!parsed.ok) return parsed;
    result[key] = parsed.value;
  }
  return { ok: true, value: result };
}

function supportRecord(value: unknown, path: string): Result<SupportRecord, DataAdapterError> {
  if (!isRecord(value)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  if (Object.keys(value).length > MAX_ADMIN_REVIEW_NESTED_ITEMS) return invalid("INVALID_SHAPE", "data.adapter.too_many_items", path);
  const result: SupportRecord = {};
  for (const [key, status] of Object.entries(value)) {
    if (
      key.length < 1 ||
      key.length > 80 ||
      key.trim() !== key ||
      /[\u0000-\u001F\u007F]/.test(key) ||
      typeof status !== "string" ||
      !SUPPORT_STATUSES.has(status as FoodReviewSupportStatus)
    ) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}.${key}`);
    result[key] = status as FoodReviewSupportStatus;
  }
  return { ok: true, value: result };
}

function denseArray(value: unknown, path: string): Result<unknown[], DataAdapterError> {
  if (!Array.isArray(value)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  if (value.length > MAX_ADMIN_REVIEW_NESTED_ITEMS) return invalid("INVALID_SHAPE", "data.adapter.too_many_items", path);
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}[${index}]`);
  }
  return { ok: true, value };
}

function localTime(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string" || !TIME_PATTERN.test(value)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  const suffix = value.slice(5);
  if (suffix !== "" && !/^:00(?:\.0+)?$/.test(suffix)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  return { ok: true, value: value.slice(0, 5) };
}

function openingHours(value: unknown, path: string): Result<OpeningHour[], DataAdapterError> {
  const array = denseArray(value, path);
  if (!array.ok) return array;
  const result: OpeningHour[] = [];
  for (let index = 0; index < array.value.length; index += 1) {
    const itemPath = `${path}[${index}]`;
    const fields = exactFields(array.value[index], ["weekday", "opens_at", "closes_at"], itemPath);
    if (!fields.ok) return fields;
    const weekday = fields.value.weekday;
    if (typeof weekday !== "number" || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${itemPath}.weekday`);
    const opensAt = localTime(fields.value.opens_at, `${itemPath}.opens_at`);
    const closesAt = localTime(fields.value.closes_at, `${itemPath}.closes_at`);
    if (!opensAt.ok) return opensAt;
    if (!closesAt.ok) return closesAt;
    if (opensAt.value === closesAt.value) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${itemPath}.closes_at`);
    result.push({ weekday, opensAt: opensAt.value, closesAt: closesAt.value });
  }
  return { ok: true, value: result };
}

function openingExceptions(value: unknown, path: string): Result<OpeningException[], DataAdapterError> {
  const array = denseArray(value, path);
  if (!array.ok) return array;
  const result: OpeningException[] = [];
  const dates = new Set<string>();
  for (let index = 0; index < array.value.length; index += 1) {
    const itemPath = `${path}[${index}]`;
    const fields = exactFields(array.value[index], ["local_date", "closed", "windows"], itemPath);
    if (!fields.ok) return fields;
    const date = nullableDate(fields.value.local_date, `${itemPath}.local_date`);
    if (!date.ok || date.value === null) return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", `${itemPath}.local_date`);
    if (dates.has(date.value)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${itemPath}.local_date`);
    dates.add(date.value);
    if (typeof fields.value.closed !== "boolean") return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${itemPath}.closed`);
    const windows = denseArray(fields.value.windows, `${itemPath}.windows`);
    if (!windows.ok) return windows;
    if (fields.value.closed && windows.value.length > 0) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${itemPath}.windows`);
    if (!fields.value.closed && windows.value.length === 0) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${itemPath}.windows`);
    const mappedWindows: Array<{ opensAt: string; closesAt: string }> = [];
    for (let windowIndex = 0; windowIndex < windows.value.length; windowIndex += 1) {
      const windowPath = `${itemPath}.windows[${windowIndex}]`;
      const windowFields = exactFields(windows.value[windowIndex], ["opens_at", "closes_at"], windowPath);
      if (!windowFields.ok) return windowFields;
      const opensAt = localTime(windowFields.value.opens_at, `${windowPath}.opens_at`);
      const closesAt = localTime(windowFields.value.closes_at, `${windowPath}.closes_at`);
      if (!opensAt.ok) return opensAt;
      if (!closesAt.ok) return closesAt;
      if (opensAt.value === closesAt.value) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${windowPath}.closes_at`);
      mappedWindows.push({ opensAt: opensAt.value, closesAt: closesAt.value });
    }
    result.push({ localDate: date.value, closed: fields.value.closed, windows: mappedWindows });
  }
  return { ok: true, value: result };
}

function reviewStatus(value: unknown, path: string): Result<FoodReviewStatus, DataAdapterError> {
  if (typeof value !== "string" || !REVIEW_STATUSES.has(value)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  if (value === "draft" || value === "research_only") return { ok: true, value: "research_only" };
  if (value === "published" || value === "sellable") return { ok: true, value: "sellable" };
  return { ok: true, value: "temporarily_closed" };
}

function safeMoney(value: unknown, path: string): Result<string | null, DataAdapterError> {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string" || !MONEY_PATTERN.test(value)) return invalid("INVALID_DB_DECIMAL", "data.decimal.invalid", path);
  try {
    if (BigInt(value) > BigInt(Number.MAX_SAFE_INTEGER)) return invalid("UNSAFE_DB_INTEGER", "data.integer.unsafe", path);
  } catch {
    return invalid("INVALID_DB_DECIMAL", "data.decimal.invalid", path);
  }
  return { ok: true, value };
}

function allergens(value: unknown, path: string): Result<string[], DataAdapterError> {
  const array = denseArray(value, path);
  if (!array.ok) return array;
  const result: string[] = [];
  for (let index = 0; index < array.value.length; index += 1) {
    const text = safeText(array.value[index], `${path}[${index}]`, 160);
    if (!text.ok) return text;
    if (result.includes(text.value)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}[${index}]`);
    result.push(text.value);
  }
  return { ok: true, value: result };
}

function mapVendor(value: unknown): Result<AdminFoodReviewRow["vendor"], DataAdapterError> {
  const fields = exactFields(value, VENDOR_FIELDS, "row.vendor");
  if (!fields.ok) return fields;
  const slug = safeText(fields.value.slug, "row.vendor.slug", 160);
  const title = nullableBilingual(fields.value.title, "row.vendor.title");
  const description = nullableBilingual(fields.value.description, "row.vendor.description");
  const locationNote = nullableText(fields.value.location_note, "row.vendor.location_note", 500);
  const capacityNote = nullableText(fields.value.capacity_note, "row.vendor.capacity_note", 500);
  const dietarySupport = supportRecord(fields.value.dietary_support, "row.vendor.dietary_support");
  const mobilitySupport = supportRecord(fields.value.mobility_support, "row.vendor.mobility_support");
  const hours = openingHours(fields.value.opening_hours, "row.vendor.opening_hours");
  const exceptions = openingExceptions(fields.value.opening_exceptions, "row.vendor.opening_exceptions");
  const sourceUrl = nullableUrl(fields.value.source_url, "row.vendor.source_url");
  const verifiedAt = nullableDate(fields.value.verified_at, "row.vendor.verified_at");
  const attribution = nullableText(fields.value.attribution, "row.vendor.attribution", 500);
  const status = reviewStatus(fields.value.status, "row.vendor.status");
  if (!slug.ok) return slug;
  if (!title.ok) return title;
  if (!description.ok) return description;
  if (!locationNote.ok) return locationNote;
  if (typeof fields.value.service_type !== "string" || !SERVICE_TYPES.has(fields.value.service_type)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "row.vendor.service_type");
  if (!capacityNote.ok) return capacityNote;
  if (!dietarySupport.ok) return dietarySupport;
  if (!mobilitySupport.ok) return mobilitySupport;
  if (!hours.ok) return hours;
  if (!exceptions.ok) return exceptions;
  if (!status.ok) return status;
  if (!sourceUrl.ok) return sourceUrl;
  if (!verifiedAt.ok) return verifiedAt;
  if (!attribution.ok) return attribution;
  return {
    ok: true,
    value: {
      slug: slug.value,
      title: title.value,
      description: description.value,
      locationNote: locationNote.value,
      serviceType: fields.value.service_type as AdminFoodReviewRow["vendor"]["serviceType"],
      capacityNote: capacityNote.value,
      dietarySupport: dietarySupport.value,
      mobilitySupport: mobilitySupport.value,
      openingHours: hours.value,
      openingExceptions: exceptions.value,
      status: status.value,
      sourceUrl: sourceUrl.value,
      verifiedAt: verifiedAt.value,
      attribution: attribution.value,
    },
  };
}

function mapItem(value: unknown): Result<AdminFoodReviewRow["item"], DataAdapterError> {
  const fields = exactFields(value, ITEM_FIELDS, "row.item");
  if (!fields.ok) return fields;
  const slug = safeText(fields.value.slug, "row.item.slug", 160);
  const title = nullableBilingual(fields.value.title, "row.item.title");
  const description = nullableBilingual(fields.value.description, "row.item.description");
  const priceMin = safeMoney(fields.value.price_vnd_min, "row.item.price_vnd_min");
  const priceMax = safeMoney(fields.value.price_vnd_max, "row.item.price_vnd_max");
  const portionDescription = nullableText(fields.value.portion_description, "row.item.portion_description", 500);
  const dietarySupport = supportRecord(fields.value.dietary_support, "row.item.dietary_support");
  const allergenSupport = supportRecord(fields.value.allergen_support, "row.item.allergen_support");
  const itemAllergens = allergens(fields.value.allergens, "row.item.allergens");
  const status = reviewStatus(fields.value.status, "row.item.status");
  const sourceUrl = nullableUrl(fields.value.source_url, "row.item.source_url");
  const verifiedAt = nullableDate(fields.value.verified_at, "row.item.verified_at");
  const attribution = nullableText(fields.value.attribution, "row.item.attribution", 500);
  if (!slug.ok) return slug;
  if (!title.ok) return title;
  if (!description.ok) return description;
  if (typeof fields.value.serving_unit !== "string" || !SERVING_UNITS.has(fields.value.serving_unit)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "row.item.serving_unit");
  if (!priceMin.ok) return priceMin;
  if (!priceMax.ok) return priceMax;
  if ((priceMin.value === null) !== (priceMax.value === null)) {
    return invalid(
      "INVALID_SHAPE",
      "data.adapter.invalid_shape",
      priceMin.value === null ? "row.item.price_vnd_min" : "row.item.price_vnd_max",
    );
  }
  if (priceMin.value !== null && priceMax.value !== null && BigInt(priceMin.value) > BigInt(priceMax.value)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "row.item.price_vnd_max");
  if (!portionDescription.ok) return portionDescription;
  if (!dietarySupport.ok) return dietarySupport;
  if (!allergenSupport.ok) return allergenSupport;
  if (!itemAllergens.ok) return itemAllergens;
  for (const allergen of itemAllergens.value) {
    if (!Object.prototype.hasOwnProperty.call(allergenSupport.value, allergen)) {
      return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `row.item.allergen_support.${allergen}`);
    }
  }
  if (fields.value.available !== null && typeof fields.value.available !== "boolean") return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "row.item.available");
  if (!status.ok) return status;
  if (!sourceUrl.ok) return sourceUrl;
  if (!verifiedAt.ok) return verifiedAt;
  if (!attribution.ok) return attribution;
  return {
    ok: true,
    value: {
      slug: slug.value,
      title: title.value,
      description: description.value,
      servingUnit: fields.value.serving_unit as AdminFoodReviewRow["item"]["servingUnit"],
      priceVndMin: priceMin.value,
      priceVndMax: priceMax.value,
      portionDescription: portionDescription.value,
      dietarySupport: dietarySupport.value,
      allergenSupport: allergenSupport.value,
      allergens: itemAllergens.value,
      available: fields.value.available as boolean | null,
      status: status.value,
      sourceUrl: sourceUrl.value,
      verifiedAt: verifiedAt.value,
      attribution: attribution.value,
    },
  };
}

function mapHistory(value: unknown): Result<AdminFoodReviewHistoryEntry[], DataAdapterError> {
  const array = denseArray(value, "row.audit_history");
  if (!array.ok) return array;
  const result: AdminFoodReviewHistoryEntry[] = [];
  for (let index = 0; index < array.value.length; index += 1) {
    const path = `row.audit_history[${index}]`;
    const fields = exactFields(array.value[index], HISTORY_FIELDS, path);
    if (!fields.ok) return fields;
    const eventId = safeUuid(fields.value.event_id, `${path}.event_id`);
    const actorUserId = safeUuid(fields.value.actor_user_id, `${path}.actor_user_id`);
    const note = nullableText(fields.value.rejection_note, `${path}.rejection_note`, 1_000);
    const reviewedAt = auditTimestamp(fields.value.reviewed_at, `${path}.reviewed_at`);
    if (!eventId.ok) return eventId;
    if (!actorUserId.ok) return actorUserId;
    if (!note.ok) return note;
    if (!reviewedAt.ok) return reviewedAt;
    if (fields.value.decision !== "approved" && fields.value.decision !== "rejected") return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}.decision`);
    result.push({ eventId: eventId.value, decision: fields.value.decision, rejectionNote: note.value, actorUserId: actorUserId.value, reviewedAt: reviewedAt.value });
  }
  return { ok: true, value: result };
}

/** Map the exact admin review projection. Missing evidence is retained as null for UI display. */
export function mapAdminFoodReviewRow(row: unknown): Result<AdminFoodReviewRow, DataAdapterError> {
  const fields = exactFields(row, REVIEW_ROW_FIELDS, "row");
  if (!fields.ok) return fields;
  const itemId = safeUuid(fields.value.item_id, "row.item_id");
  const vendorId = safeUuid(fields.value.vendor_id, "row.vendor_id");
  const placeId = safeUuid(fields.value.place_id, "row.place_id");
  const vendor = mapVendor(fields.value.vendor);
  const item = mapItem(fields.value.item);
  const auditHistory = mapHistory(fields.value.audit_history);
  if (!itemId.ok) return itemId;
  if (!vendorId.ok) return vendorId;
  if (!placeId.ok) return placeId;
  if (!vendor.ok) return vendor;
  if (!item.ok) return item;
  if (!auditHistory.ok) return auditHistory;
  return { ok: true, value: { itemId: itemId.value, vendorId: vendorId.value, placeId: placeId.value, vendor: vendor.value, item: item.value, auditHistory: auditHistory.value } };
}

function mapChecklist(value: unknown): Result<ReviewFoodCatalogItemArgs["checklist"], DataAdapterError> {
  const fields = exactFields(value, CHECKLIST_FIELDS, "input.checklist");
  if (!fields.ok) return fields;
  for (const field of CHECKLIST_FIELDS) {
    if (typeof fields.value[field] !== "boolean") return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `input.checklist.${field}`);
  }
  return {
    ok: true,
    value: {
      source_checked: fields.value.source as boolean,
      bilingual_name_checked: fields.value.bilingualName as boolean,
      location_checked: fields.value.location as boolean,
      hours_checked: fields.value.hours as boolean,
      price_checked: fields.value.price as boolean,
      availability_checked: fields.value.availability as boolean,
      dietary_allergen_checked: fields.value.dietaryAllergen as boolean,
      mobility_checked: fields.value.mobility as boolean,
    },
  };
}

/** Validate and translate a review action into the guarded RPC's exact args. */
export function reviewFoodCatalogItem(input: unknown): Result<ReviewFoodCatalogItemArgs, DataAdapterError> {
  const fields = exactFields(input, ["itemId", "vendorId", "decision", "checklist", "rejectionNote"], "input");
  if (!fields.ok) return fields;
  const itemId = safeUuid(fields.value.itemId, "input.itemId");
  const vendorId = safeUuid(fields.value.vendorId, "input.vendorId");
  const checklist = mapChecklist(fields.value.checklist);
  if (!itemId.ok) return itemId;
  if (!vendorId.ok) return vendorId;
  if (!checklist.ok) return checklist;
  if (typeof fields.value.decision !== "string" || !REVIEW_DECISIONS.has(fields.value.decision as FoodReviewDecision)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "input.decision");
  let rejectionNote: string | null = null;
  if (fields.value.rejectionNote !== null) {
    const parsed = safeText(fields.value.rejectionNote, "input.rejectionNote", 1_000);
    if (!parsed.ok) return parsed;
    rejectionNote = parsed.value;
  }
  const decision = fields.value.decision as FoodReviewDecision;
  const allConfirmed = Object.values(checklist.value).every((confirmed) => confirmed === true);
  if (decision === "sellable" && !allConfirmed) return invalid("INVALID_SHAPE", "data.review.incomplete", "input.checklist");
  if (decision === "research_only" && rejectionNote === null) return invalid("INVALID_SHAPE", "data.review.rejection_note_required", "input.rejectionNote");
  if (decision === "sellable" && rejectionNote !== null) return invalid("INVALID_SHAPE", "data.review.rejection_note_forbidden", "input.rejectionNote");
  return { ok: true, value: { itemId: itemId.value, vendorId: vendorId.value, decision, checklist: checklist.value, rejectionNote } };
}

function authenticatedUser(value: unknown): Result<boolean, DataAdapterError> {
  if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, "data") || !Object.prototype.hasOwnProperty.call(value, "error")) {
    return invalid("INVALID_SHAPE", "data.rpc.invalid_response", "auth.getUser");
  }
  if (value.error !== null) return invalid("INVALID_SHAPE", "data.auth.failed", "auth.getUser.error");
  if (!isRecord(value.data) || !Object.prototype.hasOwnProperty.call(value.data, "user")) {
    return invalid("INVALID_SHAPE", "data.rpc.invalid_response", "auth.getUser.data");
  }
  if (value.data.user === null) return { ok: true, value: false };
  if (!isRecord(value.data.user)) return invalid("INVALID_SHAPE", "data.rpc.invalid_response", "auth.getUser.data.user");
  return { ok: true, value: true };
}

function pageOptions(options: { page?: number; pageSize?: number } | undefined): Result<{ page: number; pageSize: number }, DataAdapterError> {
  const page = options?.page ?? 0;
  const pageSize = options?.pageSize ?? ADMIN_REVIEW_PAGE_SIZE;
  if (!Number.isSafeInteger(page) || page < 0) return invalid("INVALID_SHAPE", "data.pagination.invalid", "page");
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_ADMIN_REVIEW_PAGE_SIZE) {
    return invalid("INVALID_SHAPE", "data.pagination.invalid", "pageSize");
  }
  if (page * pageSize > MAX_ADMIN_REVIEW_OFFSET) return invalid("INVALID_SHAPE", "data.pagination.invalid", "page");
  return { ok: true, value: { page, pageSize } };
}

/**
 * Load one bounded review page through the browser's authenticated Supabase
 * session. The database RPC derives the admin role from private.user_roles;
 * no JWT role or client-provided role is accepted here.
 */
export async function loadAdminFoodReviewQueue(
  client: AdminReviewQueueClient,
  options?: { page?: number; pageSize?: number },
): Promise<Result<AdminFoodReviewQueue | NonAdminFoodReviewQueue, DataAdapterError>> {
  const paging = pageOptions(options);
  if (!paging.ok) return paging;
  let authResponse: unknown;
  try {
    authResponse = await client.auth.getUser();
  } catch {
    return rpcFailure("auth.getUser");
  }
  const auth = authenticatedUser(authResponse);
  if (!auth.ok) return auth;
  if (!auth.value) {
    return {
      ok: true,
      value: { viewerRole: "unknown", rows: [], page: paging.value.page, pageSize: paging.value.pageSize, hasMore: false },
    };
  }

  let response: unknown;
  try {
    response = await client.rpc("get_admin_food_catalog_review_queue", {
      p_limit: paging.value.pageSize,
      p_offset: paging.value.page * paging.value.pageSize,
    });
  } catch {
    return rpcFailure("get_admin_food_catalog_review_queue");
  }
  const envelope = rpcEnvelope(response, "get_admin_food_catalog_review_queue");
  if (!envelope.ok) return envelope;
  if (envelope.value.error !== null) {
    const code = rpcErrorCode(envelope.value.error);
    const message = rpcErrorMessage(envelope.value.error);
    if (code === "42501" || message === "admin role required") {
      return {
        ok: true,
        value: { viewerRole: "customer", rows: [], page: paging.value.page, pageSize: paging.value.pageSize, hasMore: false },
      };
    }
    return rpcFailure("get_admin_food_catalog_review_queue.error");
  }
  if (!Array.isArray(envelope.value.data)) return invalid("INVALID_SHAPE", "data.rpc.invalid_response", "get_admin_food_catalog_review_queue.data");
  if (envelope.value.data.length > paging.value.pageSize) return invalid("INVALID_SHAPE", "data.pagination.too_many_items", "get_admin_food_catalog_review_queue.data");

  const rows: AdminFoodReviewRow[] = [];
  for (let index = 0; index < envelope.value.data.length; index += 1) {
    const mapped = mapAdminFoodReviewRow(envelope.value.data[index]);
    if (!mapped.ok) return mapped;
    rows.push(mapped.value);
  }
  return {
    ok: true,
    value: {
      viewerRole: "admin",
      rows,
      page: paging.value.page,
      pageSize: paging.value.pageSize,
      hasMore: rows.length === paging.value.pageSize,
    },
  };
}

/** Validate a review and submit only the exact guarded RPC arguments. */
export async function submitFoodCatalogReview(
  client: AdminReviewRpcClient,
  input: unknown,
): Promise<Result<unknown, DataAdapterError>> {
  const validation = reviewFoodCatalogItem(input);
  if (!validation.ok) return validation;
  let response: unknown;
  try {
    response = await client.rpc("review_food_catalog_item", {
      p_item_id: validation.value.itemId,
      p_vendor_id: validation.value.vendorId,
      p_decision: validation.value.decision,
      p_checklist: validation.value.checklist,
      p_rejection_note: validation.value.rejectionNote,
    });
  } catch {
    return rpcFailure("review_food_catalog_item");
  }
  const envelope = rpcEnvelope(response, "review_food_catalog_item");
  if (!envelope.ok) return envelope;
  if (envelope.value.error !== null) return rpcFailure("review_food_catalog_item.error");
  return { ok: true, value: envelope.value.data };
}
