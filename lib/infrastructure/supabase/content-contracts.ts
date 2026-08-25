import type {
  AdminAuditEvent,
  AdminContentDraft,
  AuditEventType,
  ContentDraftWrite,
  ContentStatus,
  DataAdapterError,
  ImageAttribution,
  Locale,
  PublishedContent,
  Result,
  Role,
} from "@/lib/domain/data/contracts";

type UnknownRecord = Record<string, unknown>;

export interface ContentDraftRpcArgs {
  p_locale: Locale;
  p_slug: string;
  p_title: string;
  p_description: string;
  p_body: string;
  p_source_urls: string[];
  p_verified_at: string;
  p_image_attributions: ImageAttribution[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/;
const HTML = /[<>]/;
const TRACKING_OR_PII = /^(?:utm_[^=]*|fbclid|gclid|(?:[^=]*_)?(?:email|phone|name|token|session|user|customer)(?:_[^=]*)?)$/i;
const LOCALES = new Set<Locale>(["en", "vi"]);
const CONTENT_STATUSES = new Set<ContentStatus>(["draft", "publishing", "published", "failed"]);
const ROLES = new Set<Role>(["customer", "guide", "admin"]);
const AUDIT_EVENT_TYPES = new Set<AuditEventType>([
  "role_provisioned", "role_revoked", "plan_claimed", "request_submitted",
  "request_changes_requested", "request_approved", "request_rejected", "quote_created",
  "quote_checkout_started", "quote_accepted", "quote_reactivated", "quote_expired", "quote_revoked",
  "checkout_started", "checkout_session_recorded", "checkout_compensated", "booking_status_changed",
  "webhook_processed", "webhook_ignored", "webhook_failed", "webhook_conflict", "payment_reconciled",
  "guide_assigned", "guide_reassigned", "guide_accepted", "guide_completed", "content_publish_started",
  "content_published", "content_publish_failed",
]);
const METADATA_TEXT_VALUES: Record<string, ReadonlySet<string>> = {
  role: new Set(["customer", "guide", "admin"]),
  source: new Set(["ai", "deterministic", "system", "admin", "customer", "guide", "stripe", "webhook", "build"]),
  status: new Set(["draft", "publishing", "published", "failed", "active", "checkout_pending", "accepted", "expired", "revoked", "consumed", "released", "scheduled", "sold_out", "cancelled", "completed", "payment_processing", "payment_failed", "payment_review", "confirmed", "pending", "paid", "review", "received", "processed", "ignored", "conflict", "assigned", "archived", "retired", "building"]),
  state: new Set(["draft", "publishing", "published", "failed", "active", "checkout_pending", "accepted", "expired", "revoked", "consumed", "released", "scheduled", "sold_out", "cancelled", "completed", "payment_processing", "payment_failed", "payment_review", "confirmed", "pending", "paid", "review", "received", "processed", "ignored", "conflict", "assigned", "archived", "retired", "building"]),
  decision: new Set(["changes_requested", "approved", "rejected"]),
  provider: new Set(["stripe", "gemini", "turnstile", "map", "fx", "cloudflare"]),
  currency: new Set(["VND", "USD", "vnd", "usd"]),
};
const METADATA_NUMBER_KEYS = new Set(["count", "revision", "attempt_no", "amount_minor"]);
const METADATA_BOOLEAN_KEYS = new Set(["replayed", "is_demo"]);

const invalid = (
  code: DataAdapterError["code"],
  messageKey: string,
  fieldPath?: string,
): Result<never, DataAdapterError> => ({
  ok: false,
  error: fieldPath === undefined ? { code, messageKey } : { code, messageKey, fieldPath },
});

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactFields(value: unknown, fields: readonly string[], path: string): Result<UnknownRecord, DataAdapterError> {
  if (!isRecord(value)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  const actual = Object.keys(value);
  const unknown = actual.find((field) => !fields.includes(field));
  if (unknown !== undefined) return invalid("UNKNOWN_FIELD", "data.adapter.unknown_field", `${path}.${unknown}`);
  const missing = fields.find((field) => !Object.prototype.hasOwnProperty.call(value, field));
  if (missing !== undefined) return invalid("MISSING_FIELD", "data.adapter.missing_field", `${path}.${missing}`);
  return { ok: true, value };
}

function safeUuid(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string" || value !== value.toLowerCase() || !UUID.test(value)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value };
}

function safeNullableUuid(value: unknown, path: string): Result<string | null, DataAdapterError> {
  if (value === null) return { ok: true, value: null };
  return safeUuid(value, path);
}

function safeText(value: unknown, path: string, minimum: number, maximum: number, allowHtml = false): Result<string, DataAdapterError> {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < minimum ||
    value.length > maximum ||
    CONTROL.test(value) ||
    (!allowHtml && HTML.test(value))
  ) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  return { ok: true, value };
}

function safeDate(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string") return invalid("INVALID_SHAPE", "data.date.invalid", path);
  const match = value.match(DATE);
  if (!match) return invalid("INVALID_SHAPE", "data.date.invalid", path);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return invalid("INVALID_SHAPE", "data.date.invalid", path);
  }
  return { ok: true, value };
}

function safeTimestamp(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string") return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  const match = value.match(TIMESTAMP);
  if (!match || Number(match[5]) > 59 || Number(match[6]) > 59) return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  const offset = match[8];
  if (offset !== "Z" && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4, 6)) > 59)) {
    return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day, Number(match[4]), Number(match[5]), Number(match[6])));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day || !Number.isFinite(Date.parse(value))) {
    return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  }
  return { ok: true, value };
}

function safeUrl(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string" || value.trim() !== value || value.length > 2048 || CONTROL.test(value)) {
    return invalid("INVALID_SHAPE", "data.url.invalid", path);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return invalid("INVALID_SHAPE", "data.url.invalid", path);
  }
  const hostname = parsed.hostname.toLowerCase();
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  const privateIpv4 = ipv4 !== null && (
    Number(ipv4[1]) === 0 ||
    Number(ipv4[1]) === 10 ||
    Number(ipv4[1]) === 127 ||
    (Number(ipv4[1]) === 169 && Number(ipv4[2]) === 254) ||
    (Number(ipv4[1]) === 172 && Number(ipv4[2]) >= 16 && Number(ipv4[2]) <= 31) ||
    (Number(ipv4[1]) === 192 && Number(ipv4[2]) === 168)
  );
  const privateIpv6 = hostname === "[::1]" || hostname.startsWith("[fc") || hostname.startsWith("[fd") || hostname.startsWith("[fe80:");
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    parsed.port ||
    !hostname ||
    hostname === "localhost" ||
    /xn--/i.test(hostname) ||
    privateIpv4 ||
    privateIpv6
  ) {
    return invalid("INVALID_SHAPE", "data.url.invalid", path);
  }
  for (const key of parsed.searchParams.keys()) {
    if (TRACKING_OR_PII.test(key)) return invalid("INVALID_SHAPE", "data.url.invalid", path);
  }
  return { ok: true, value };
}

function safeSlug(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string" || value.length < 1 || value.length > 160 || !SLUG.test(value)) {
    return invalid("INVALID_SHAPE", "data.slug.invalid", path);
  }
  return { ok: true, value };
}

function denseArray(value: unknown, path: string): Result<unknown[], DataAdapterError> {
  if (!Array.isArray(value)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  if (Object.keys(value).some((key) => !/^\d+$/.test(key))) return invalid("UNKNOWN_FIELD", "data.adapter.unknown_field", path);
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}[${index}]`);
  }
  return { ok: true, value };
}

function mapAttributions(value: unknown, path: string): Result<ImageAttribution[], DataAdapterError> {
  const values = denseArray(value, path);
  if (!values.ok) return values;
  if (values.value.length > 32) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  const result: ImageAttribution[] = [];
  for (let index = 0; index < values.value.length; index += 1) {
    const itemPath = `${path}[${index}]`;
    const fields = exactFields(values.value[index], ["imageUrl", "sourceUrl", "creator", "license"], itemPath);
    if (!fields.ok) return fields;
    const imageUrl = safeUrl(fields.value.imageUrl, `${itemPath}.imageUrl`);
    const sourceUrl = safeUrl(fields.value.sourceUrl, `${itemPath}.sourceUrl`);
    const creator = safeText(fields.value.creator, `${itemPath}.creator`, 1, 240);
    const license = safeText(fields.value.license, `${itemPath}.license`, 1, 160);
    if (!imageUrl.ok) return imageUrl;
    if (!sourceUrl.ok) return sourceUrl;
    if (!creator.ok) return creator;
    if (!license.ok) return license;
    result.push({ imageUrl: imageUrl.value, sourceUrl: sourceUrl.value, creator: creator.value, license: license.value });
  }
  return { ok: true, value: result };
}

function mapSourceUrls(value: unknown, path: string): Result<string[], DataAdapterError> {
  const values = denseArray(value, path);
  if (!values.ok) return values;
  if (values.value.length < 1 || values.value.length > 32) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  const seen = new Set<string>();
  const result: string[] = [];
  for (let index = 0; index < values.value.length; index += 1) {
    const url = safeUrl(values.value[index], `${path}[${index}]`);
    if (!url.ok) return url;
    if (seen.has(url.value)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}[${index}]`);
    seen.add(url.value);
    result.push(url.value);
  }
  return { ok: true, value: result };
}

function mapContentFields(row: UnknownRecord, path: string): Result<ContentDraftWrite, DataAdapterError> {
  const locale = row.locale;
  if (typeof locale !== "string" || !LOCALES.has(locale as Locale)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}.locale`);
  const slug = safeSlug(row.slug, `${path}.slug`);
  const title = safeText(row.title, `${path}.title`, 1, 240);
  const description = safeText(row.description, `${path}.description`, 1, 2000);
  const body = safeText(row.body, `${path}.body`, 1, 100_000);
  const sourceUrls = mapSourceUrls(row.source_urls, `${path}.source_urls`);
  const verifiedAt = safeDate(row.verified_at, `${path}.verified_at`);
  const imageAttributions = mapAttributions(row.image_attributions, `${path}.image_attributions`);
  if (!slug.ok) return slug;
  if (!title.ok) return title;
  if (!description.ok) return description;
  if (!body.ok) return body;
  if (!sourceUrls.ok) return sourceUrls;
  if (!verifiedAt.ok) return verifiedAt;
  if (!imageAttributions.ok) return imageAttributions;
  return { ok: true, value: { locale: locale as Locale, slug: slug.value, title: title.value, description: description.value, body: body.value, sourceUrls: sourceUrls.value, verifiedAt: verifiedAt.value, imageAttributions: imageAttributions.value } };
}

export function toContentDraft(input: unknown): Result<ContentDraftWrite, DataAdapterError> {
  const fields = exactFields(input, ["locale", "slug", "title", "description", "body", "sourceUrls", "verifiedAt", "imageAttributions"], "input");
  if (!fields.ok) return fields;
  const mapped = mapContentFields({ ...fields.value, source_urls: fields.value.sourceUrls, verified_at: fields.value.verifiedAt, image_attributions: fields.value.imageAttributions }, "input");
  return mapped;
}

export function toContentDraftRpcArgs(input: unknown): Result<ContentDraftRpcArgs, DataAdapterError> {
  const mapped = toContentDraft(input);
  if (!mapped.ok) return mapped;
  return {
    ok: true,
    value: {
      p_locale: mapped.value.locale,
      p_slug: mapped.value.slug,
      p_title: mapped.value.title,
      p_description: mapped.value.description,
      p_body: mapped.value.body,
      p_source_urls: mapped.value.sourceUrls,
      p_verified_at: mapped.value.verifiedAt,
      p_image_attributions: mapped.value.imageAttributions,
    },
  };
}

export function mapAdminContentDraft(row: unknown): Result<AdminContentDraft, DataAdapterError> {
  const fields = exactFields(row, ["id", "locale", "slug", "title", "description", "body", "source_urls", "verified_at", "image_attributions", "status", "updated_at"], "row");
  if (!fields.ok) return fields;
  const id = safeUuid(fields.value.id, "row.id");
  const content = mapContentFields(fields.value, "row");
  const updatedAt = safeTimestamp(fields.value.updated_at, "row.updated_at");
  if (!id.ok) return id;
  if (!content.ok) return content;
  if (!updatedAt.ok) return updatedAt;
  if (typeof fields.value.status !== "string" || !CONTENT_STATUSES.has(fields.value.status as ContentStatus)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "row.status");
  return { ok: true, value: { id: id.value, ...content.value, status: fields.value.status as ContentStatus, updatedAt: updatedAt.value } };
}

export function mapPublishedContent(row: unknown): Result<PublishedContent, DataAdapterError> {
  const fields = exactFields(row, ["release_id", "locale", "slug", "title", "description", "body", "source_urls", "verified_at", "image_attributions", "published_at"], "row");
  if (!fields.ok) return fields;
  const releaseId = safeUuid(fields.value.release_id, "row.release_id");
  const content = mapContentFields(fields.value, "row");
  const publishedAt = safeTimestamp(fields.value.published_at, "row.published_at");
  if (!releaseId.ok) return releaseId;
  if (!content.ok) return content;
  if (!publishedAt.ok) return publishedAt;
  return { ok: true, value: { releaseId: releaseId.value, ...content.value, publishedAt: publishedAt.value } };
}

function safeMetadata(value: unknown, path: string): Result<Record<string, string | number | boolean | null>, DataAdapterError> {
  if (!isRecord(value)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(value)) {
    if (METADATA_TEXT_VALUES[key]) {
      if (typeof item !== "string" || !METADATA_TEXT_VALUES[key].has(item)) return invalid("INVALID_SHAPE", "data.audit_metadata.invalid", `${path}.${key}`);
      result[key] = item;
    } else if (METADATA_NUMBER_KEYS.has(key)) {
      if (typeof item !== "number" || !Number.isSafeInteger(item) || item < 0) return invalid("INVALID_SHAPE", "data.audit_metadata.invalid", `${path}.${key}`);
      result[key] = item;
    } else if (METADATA_BOOLEAN_KEYS.has(key)) {
      if (typeof item !== "boolean") return invalid("INVALID_SHAPE", "data.audit_metadata.invalid", `${path}.${key}`);
      result[key] = item;
    } else {
      return invalid("INVALID_SHAPE", "data.audit_metadata.invalid", `${path}.${key}`);
    }
  }
  return { ok: true, value: result };
}

export function mapAdminAuditEvent(row: unknown): Result<AdminAuditEvent, DataAdapterError> {
  const fields = exactFields(row, ["id", "event_type", "actor_user_id", "actor_role", "target_type", "target_id", "from_state", "to_state", "correlation_id", "metadata", "created_at"], "row");
  if (!fields.ok) return fields;
  const id = safeUuid(fields.value.id, "row.id");
  const actorUserId = safeNullableUuid(fields.value.actor_user_id, "row.actor_user_id");
  const targetId = safeUuid(fields.value.target_id, "row.target_id");
  const correlationId = safeUuid(fields.value.correlation_id, "row.correlation_id");
  const createdAt = safeTimestamp(fields.value.created_at, "row.created_at");
  const metadata = safeMetadata(fields.value.metadata, "row.metadata");
  if (!id.ok) return id;
  if (!actorUserId.ok) return actorUserId;
  if (!targetId.ok) return targetId;
  if (!correlationId.ok) return correlationId;
  if (!createdAt.ok) return createdAt;
  if (!metadata.ok) return metadata;
  if (typeof fields.value.event_type !== "string" || !AUDIT_EVENT_TYPES.has(fields.value.event_type as AuditEventType)) return invalid("INVALID_SHAPE", "data.audit_event.invalid", "row.event_type");
  if (fields.value.actor_role !== null && (typeof fields.value.actor_role !== "string" || !ROLES.has(fields.value.actor_role as Role))) return invalid("INVALID_SHAPE", "data.audit_event.invalid", "row.actor_role");
  if (typeof fields.value.target_type !== "string" || fields.value.target_type !== "content_release") return invalid("INVALID_SHAPE", "data.audit_event.invalid", "row.target_type");
  const fromState = fields.value.from_state;
  const toState = fields.value.to_state;
  if (fromState !== null && (typeof fromState !== "string" || !/^[a-z][a-z0-9_]*$/.test(fromState))) return invalid("INVALID_SHAPE", "data.audit_event.invalid", "row.from_state");
  if (toState !== null && (typeof toState !== "string" || !/^[a-z][a-z0-9_]*$/.test(toState))) return invalid("INVALID_SHAPE", "data.audit_event.invalid", "row.to_state");
  return { ok: true, value: { id: id.value, eventType: fields.value.event_type as AuditEventType, actorUserId: actorUserId.value, actorRole: fields.value.actor_role as Role | null, targetType: "content_release", targetId: targetId.value, fromState, toState, correlationId: correlationId.value, metadata: metadata.value, createdAt: createdAt.value } };
}
