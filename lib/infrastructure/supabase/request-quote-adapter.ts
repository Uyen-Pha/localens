import type {
  AdminCustomRequest,
  CheckoutCurrency,
  CreateCustomQuoteArgs,
  CreateCustomQuoteInput,
  CustomerCustomQuote,
  CustomerCustomRequest,
  DataAdapterError,
  RequestStatus,
  ReviewCustomRequestArgs,
  Result,
  ReviewCustomRequestInput,
  SubmitCustomRequestArgs,
  SubmitCustomRequestInput,
} from "@/lib/domain/data/contracts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UNSIGNED_INTEGER_PATTERN = /^(?:0|[1-9]\d*)$/;
const TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;
const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);
const REQUEST_STATUSES = new Set<RequestStatus>([
  "draft",
  "pending_review",
  "changes_requested",
  "approved",
  "rejected",
]);
const QUOTE_STATUSES = new Set(["active", "checkout_pending", "accepted", "expired", "revoked"]);
const CHECKOUT_CURRENCIES = new Set<CheckoutCurrency>(["vnd", "usd"]);

type UnknownRecord = Record<string, unknown>;

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
  const actual = Object.keys(value);
  const unknown = actual.find((field) => !fields.includes(field));
  if (unknown !== undefined) return invalid("UNKNOWN_FIELD", "data.adapter.unknown_field", `${path}.${unknown}`);
  const missing = fields.find((field) => !Object.prototype.hasOwnProperty.call(value, field));
  if (missing !== undefined) return invalid("MISSING_FIELD", "data.adapter.missing_field", `${path}.${missing}`);
  return { ok: true, value };
}

function safeUuid(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string" || value !== value.toLowerCase() || !UUID_PATTERN.test(value)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value };
}

function safeRevision(value: unknown, path: string): Result<number, DataAdapterError> {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) {
    return invalid("INVALID_DB_INTEGER", "data.integer.invalid", path);
  }
  return { ok: true, value };
}

function safeMoney(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string" || !UNSIGNED_INTEGER_PATTERN.test(value)) {
    return invalid("INVALID_DB_DECIMAL", "data.decimal.invalid", path);
  }
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    return invalid("INVALID_DB_DECIMAL", "data.decimal.invalid", path);
  }
  if (parsed < BigInt(1) || parsed > MAX_SAFE_INTEGER) return invalid("UNSAFE_DB_INTEGER", "data.integer.unsafe", path);
  return { ok: true, value: parsed.toString(10) };
}

function safeText(value: unknown, path: string, minimum: number, maximum: number): Result<string, DataAdapterError> {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < minimum ||
    value.length > maximum ||
    /[\u0000-\u001F\u007F-\u009F]/.test(value)
  ) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value };
}

function safeTimestamp(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string") return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  const match = value.match(TIMESTAMP_PATTERN);
  if (!match || Number(match[5]) > 59 || Number(match[6]) > 59) {
    return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, Number(match[6])));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== Number(match[6])
  ) {
    return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  }
  const offset = match[8];
  if (offset !== "Z" && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4, 6)) > 59)) {
    return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  }
  return { ok: true, value };
}

function mapRequestRow(value: unknown, path: string, admin: boolean): Result<CustomerCustomRequest | AdminCustomRequest, DataAdapterError> {
  const fields = admin
    ? ["id", "plan_id", "revision_no", "status", "submitted_at", "updated_at", "owner_user_id", "latest_decision_at"]
    : ["id", "plan_id", "revision_no", "status", "submitted_at", "updated_at"];
  const row = exactFields(value, fields, path);
  if (!row.ok) return row;
  const id = safeUuid(row.value.id, `${path}.id`);
  const planId = safeUuid(row.value.plan_id, `${path}.plan_id`);
  const revisionNo = safeRevision(row.value.revision_no, `${path}.revision_no`);
  const submittedAt = safeTimestamp(row.value.submitted_at, `${path}.submitted_at`);
  const updatedAt = safeTimestamp(row.value.updated_at, `${path}.updated_at`);
  if (!id.ok) return id;
  if (!planId.ok) return planId;
  if (!revisionNo.ok) return revisionNo;
  if (!submittedAt.ok) return submittedAt;
  if (!updatedAt.ok) return updatedAt;
  if (typeof row.value.status !== "string" || !REQUEST_STATUSES.has(row.value.status as RequestStatus)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}.status`);
  }
  const base = {
    id: id.value,
    planId: planId.value,
    revisionNo: revisionNo.value,
    status: row.value.status as RequestStatus,
    submittedAt: submittedAt.value,
    updatedAt: updatedAt.value,
  };
  if (!admin) return { ok: true, value: base };
  const ownerUserId = safeUuid(row.value.owner_user_id, `${path}.owner_user_id`);
  if (!ownerUserId.ok) return ownerUserId;
  let latestDecisionAt: string | null = null;
  if (row.value.latest_decision_at !== null) {
    const parsed = safeTimestamp(row.value.latest_decision_at, `${path}.latest_decision_at`);
    if (!parsed.ok) return parsed;
    latestDecisionAt = parsed.value;
  }
  return { ok: true, value: { ...base, ownerUserId: ownerUserId.value, latestDecisionAt } };
}

const CUSTOMER_QUOTE_FIELDS = [
  "id",
  "request_id",
  "status",
  "title",
  "amount_vnd_minor",
  "currency",
  "amount_minor",
  "policy",
  "valid_until",
] as const;

export function toSubmitCustomRequest(input: SubmitCustomRequestInput): Result<SubmitCustomRequestArgs, DataAdapterError> {
  const fields = exactFields(input, ["planId", "revisionNo"], "input");
  if (!fields.ok) return fields;
  const planId = safeUuid(fields.value.planId, "input.planId");
  const revisionNo = safeRevision(fields.value.revisionNo, "input.revisionNo");
  if (!planId.ok) return planId;
  if (!revisionNo.ok) return revisionNo;
  return { ok: true, value: { planId: planId.value, revisionNo: revisionNo.value } };
}

export function toReviewCustomRequest(input: ReviewCustomRequestInput): Result<ReviewCustomRequestArgs, DataAdapterError> {
  const fields = exactFields(input, ["requestId", "decision", "note"], "input");
  if (!fields.ok) return fields;
  const requestId = safeUuid(fields.value.requestId, "input.requestId");
  if (!requestId.ok) return requestId;
  if (fields.value.decision !== "changes_requested" && fields.value.decision !== "approved" && fields.value.decision !== "rejected") {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "input.decision");
  }
  let note: string | null = null;
  if (fields.value.note !== null) {
    const parsed = safeText(fields.value.note, "input.note", 1, 1000);
    if (!parsed.ok) return parsed;
    note = parsed.value;
  }
  if (
    (fields.value.decision === "changes_requested" || fields.value.decision === "rejected") && note === null
  ) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "input.note");
  }
  if (fields.value.decision === "approved" && note !== null) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "input.note");
  }
  return { ok: true, value: { requestId: requestId.value, decision: fields.value.decision, note } };
}

export function toCreateCustomQuote(input: CreateCustomQuoteInput): Result<CreateCustomQuoteArgs, DataAdapterError> {
  const fields = exactFields(input, ["requestId", "amountVndMinor", "checkoutCurrency", "titleEn", "titleVi", "policy"], "input");
  if (!fields.ok) return fields;
  const requestId = safeUuid(fields.value.requestId, "input.requestId");
  const amount = safeMoney(fields.value.amountVndMinor, "input.amountVndMinor");
  const titleEn = safeText(fields.value.titleEn, "input.titleEn", 1, 240);
  const titleVi = safeText(fields.value.titleVi, "input.titleVi", 1, 240);
  const policy = safeText(fields.value.policy, "input.policy", 1, 4000);
  if (!requestId.ok) return requestId;
  if (!amount.ok) return amount;
  if (!CHECKOUT_CURRENCIES.has(fields.value.checkoutCurrency as CheckoutCurrency)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "input.checkoutCurrency");
  }
  if (!titleEn.ok) return titleEn;
  if (!titleVi.ok) return titleVi;
  if (!policy.ok) return policy;
  return {
    ok: true,
    value: {
      requestId: requestId.value,
      amountVndMinor: amount.value,
      checkoutCurrency: fields.value.checkoutCurrency as CheckoutCurrency,
      titleEn: titleEn.value,
      titleVi: titleVi.value,
      policy: policy.value,
    },
  };
}

export function mapCustomerCustomRequest(row: unknown): Result<CustomerCustomRequest, DataAdapterError> {
  return mapRequestRow(row, "row", false) as Result<CustomerCustomRequest, DataAdapterError>;
}

export function mapAdminCustomRequest(row: unknown): Result<AdminCustomRequest, DataAdapterError> {
  return mapRequestRow(row, "row", true) as Result<AdminCustomRequest, DataAdapterError>;
}

export function mapCustomerCustomQuote(row: unknown): Result<CustomerCustomQuote, DataAdapterError> {
  const fields = exactFields(row, CUSTOMER_QUOTE_FIELDS, "row");
  if (!fields.ok) return fields;
  const id = safeUuid(fields.value.id, "row.id");
  const requestId = safeUuid(fields.value.request_id, "row.request_id");
  const amountVndMinor = safeMoney(fields.value.amount_vnd_minor, "row.amount_vnd_minor");
  const amountMinor = safeMoney(fields.value.amount_minor, "row.amount_minor");
  const title = safeText(fields.value.title, "row.title", 1, 240);
  const policy = safeText(fields.value.policy, "row.policy", 1, 4000);
  const validUntil = safeTimestamp(fields.value.valid_until, "row.valid_until");
  if (!id.ok) return id;
  if (!requestId.ok) return requestId;
  if (!amountVndMinor.ok) return amountVndMinor;
  if (!amountMinor.ok) return amountMinor;
  if (!title.ok) return title;
  if (!policy.ok) return policy;
  if (!validUntil.ok) return validUntil;
  if (typeof fields.value.status !== "string" || !QUOTE_STATUSES.has(fields.value.status)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "row.status");
  }
  if (!CHECKOUT_CURRENCIES.has(fields.value.currency as CheckoutCurrency)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "row.currency");
  }
  return {
    ok: true,
    value: {
      id: id.value,
      requestId: requestId.value,
      status: fields.value.status as CustomerCustomQuote["status"],
      title: title.value,
      amountVndMinor: amountVndMinor.value,
      currency: fields.value.currency as CheckoutCurrency,
      amountMinor: amountMinor.value,
      policy: policy.value,
      validUntil: validUntil.value,
    },
  };
}
