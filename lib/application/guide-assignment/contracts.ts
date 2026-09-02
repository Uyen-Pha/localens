import type {
  DataAdapterError,
  Locale,
  Result,
} from "@/lib/domain/data/contracts";

export type ActiveGuideAssignmentStatus = "assigned" | "accepted";
export type GuideAssignmentOutcome = "assigned" | "reassigned" | "unchanged" | "replayed";

export interface AdminGuideAssignmentQueueItem {
  bookingId: string;
  tourVersionId: string;
  departureId: string;
  titleEn: string;
  titleVi: string;
  startAt: string;
  endAt: string;
  meetingPoint: string;
  partySize: number;
  language: Locale;
  assignmentId: string | null;
  guideUserId: string | null;
  guideDisplayName: string | null;
  assignmentStatus: ActiveGuideAssignmentStatus | null;
}

export interface EligibleGuideCandidate {
  guideUserId: string;
  displayName: string;
  language: Locale;
}

export interface GuideAssignmentInput {
  bookingId: string;
  guideUserId: string;
  idempotencyKey: string;
}

export interface GuideAssignmentResult {
  assignmentId: string;
  bookingId: string;
  guideUserId: string;
  status: ActiveGuideAssignmentStatus;
  outcome: GuideAssignmentOutcome;
}

export interface GuideOwnAssignment {
  assignmentId: string;
  bookingId: string;
  tourVersionId: string;
  departureId: string;
  title: string;
  startAt: string;
  endAt: string | null;
  meetingPoint: string;
  partySize: number;
  language: Locale;
  mobilityFlags: Array<"step-free">;
  dietaryFlags: Array<"halal" | "vegetarian">;
  assignmentStatus: ActiveGuideAssignmentStatus;
}

export interface RuntimeGuideAssignmentPort {
  listAdminQueue(): Promise<AdminGuideAssignmentQueueItem[]>;
  listEligibleGuides(): Promise<EligibleGuideCandidate[]>;
  assignGuide(input: GuideAssignmentInput): Promise<GuideAssignmentResult>;
  listOwnAssignments(): Promise<GuideOwnAssignment[]>;
}

export type RuntimeGuideAssignmentErrorCode =
  | "INVALID_INPUT"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "IDEMPOTENCY_CONFLICT"
  | "SCHEDULE_CONFLICT"
  | "CONFLICT"
  | "NOT_FOUND"
  | "SERVICE_UNAVAILABLE"
  | "INVALID_RESPONSE";

const ERROR_MESSAGES: Record<RuntimeGuideAssignmentErrorCode, string> = {
  INVALID_INPUT: "The guide-assignment request is invalid.",
  UNAUTHENTICATED: "A signed-in session is required.",
  FORBIDDEN: "The guide-assignment operation is not permitted.",
  IDEMPOTENCY_CONFLICT: "The guide-assignment request conflicts with an earlier request.",
  SCHEDULE_CONFLICT: "The guide is unavailable for the selected departure schedule.",
  CONFLICT: "The guide-assignment request conflicts with authoritative state.",
  NOT_FOUND: "The requested guide-assignment resource is unavailable.",
  SERVICE_UNAVAILABLE: "The guide-assignment service is unavailable.",
  INVALID_RESPONSE: "The guide-assignment service returned an invalid response.",
};

/** Stable browser-safe failure that never includes database or credential detail. */
export class RuntimeGuideAssignmentError extends Error {
  readonly code: RuntimeGuideAssignmentErrorCode;

  constructor(code: RuntimeGuideAssignmentErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "RuntimeGuideAssignmentError";
    this.code = code;
  }
}

type UnknownRecord = Record<string, unknown>;
type ContractResult<T> = Result<T, DataAdapterError>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;
const TEXT_CONTROL_PATTERN = /[\u0000-\u001F\u007F-\u009F]/;
const ACTIVE_STATUSES = new Set<ActiveGuideAssignmentStatus>(["assigned", "accepted"]);
const OUTCOMES = new Set<GuideAssignmentOutcome>([
  "assigned",
  "reassigned",
  "unchanged",
  "replayed",
]);
const LOCALES = new Set<Locale>(["en", "vi"]);
const MOBILITY_FLAGS = new Set<GuideOwnAssignment["mobilityFlags"][number]>(["step-free"]);
const DIETARY_FLAGS = new Set<GuideOwnAssignment["dietaryFlags"][number]>([
  "halal",
  "vegetarian",
]);

const ADMIN_QUEUE_FIELDS = [
  "booking_id",
  "tour_version_id",
  "departure_id",
  "title_en",
  "title_vi",
  "start_at",
  "end_at",
  "meeting_point",
  "party_size",
  "language",
  "assignment_id",
  "guide_user_id",
  "guide_display_name",
  "assignment_status",
] as const;
const ELIGIBLE_GUIDE_FIELDS = ["guide_user_id", "display_name", "language"] as const;
const ASSIGNMENT_RESULT_FIELDS = [
  "assignment_id",
  "booking_id",
  "guide_user_id",
  "status",
  "outcome",
] as const;
const GUIDE_OWN_ASSIGNMENT_FIELDS = [
  "assignment_id",
  "booking_id",
  "tour_version_id",
  "departure_id",
  "title",
  "start_at",
  "end_at",
  "meeting_point",
  "party_size",
  "language",
  "mobility_flags",
  "dietary_flags",
  "assignment_status",
] as const;
const ASSIGNMENT_INPUT_FIELDS = ["bookingId", "guideUserId", "idempotencyKey"] as const;

function invalid(
  code: DataAdapterError["code"],
  messageKey: string,
  fieldPath: string,
): ContractResult<never> {
  return { ok: false, error: { code, messageKey, fieldPath } };
}

function exactFields(
  value: unknown,
  fields: readonly string[],
  path: string,
): ContractResult<UnknownRecord> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalid("INVALID_SHAPE", "guideAssignment.contract.invalid_shape", path);
  }
  const record = value as UnknownRecord;
  const unknown = Object.keys(record).find((field) => !fields.includes(field));
  if (unknown !== undefined) {
    return invalid("UNKNOWN_FIELD", "guideAssignment.contract.unknown_field", `${path}.${unknown}`);
  }
  const missing = fields.find((field) => !Object.prototype.hasOwnProperty.call(record, field));
  if (missing !== undefined) {
    return invalid("MISSING_FIELD", "guideAssignment.contract.missing_field", `${path}.${missing}`);
  }
  return { ok: true, value: record };
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = value.match(TIMESTAMP_PATTERN);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offset = match[8];
  if (year < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  if (offset !== "Z" && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4, 6)) > 59)) {
    return false;
  }
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return calendar.getUTCFullYear() === year &&
    calendar.getUTCMonth() === month - 1 &&
    calendar.getUTCDate() === day &&
    Number.isFinite(Date.parse(value));
}

function isSafeText(value: unknown, maximum = 1_000): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum &&
    value === value.trim() && !TEXT_CONTROL_PATTERN.test(value);
}

function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.has(value as Locale);
}

function isActiveStatus(value: unknown): value is ActiveGuideAssignmentStatus {
  return typeof value === "string" && ACTIVE_STATUSES.has(value as ActiveGuideAssignmentStatus);
}

function isPartySize(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 100;
}

function isExactFlagArray<T extends string>(value: unknown, allowed: ReadonlySet<T>): value is T[] {
  if (!Array.isArray(value) || value.length > 12) return false;
  const seen = new Set<string>();
  for (const flag of value) {
    if (typeof flag !== "string" || !allowed.has(flag as T) || seen.has(flag)) return false;
    seen.add(flag);
  }
  return true;
}

export function parseAdminGuideAssignmentQueueItem(
  value: unknown,
): ContractResult<AdminGuideAssignmentQueueItem> {
  const fields = exactFields(value, ADMIN_QUEUE_FIELDS, "row");
  if (!fields.ok) return fields;
  for (const key of ["booking_id", "tour_version_id", "departure_id"] as const) {
    if (!isUuid(fields.value[key])) {
      return invalid("INVALID_SHAPE", "guideAssignment.contract.invalid_shape", `row.${key}`);
    }
  }
  if (!isSafeText(fields.value.title_en) || !isSafeText(fields.value.title_vi)) {
    return invalid("INVALID_SHAPE", "guideAssignment.contract.invalid_shape", "row.title_en");
  }
  if (!isTimestamp(fields.value.start_at)) {
    return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", "row.start_at");
  }
  if (!isTimestamp(fields.value.end_at)) {
    return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", "row.end_at");
  }
  if (!isSafeText(fields.value.meeting_point)) {
    return invalid("INVALID_SHAPE", "guideAssignment.contract.invalid_shape", "row.meeting_point");
  }
  if (!isPartySize(fields.value.party_size)) {
    return invalid("INVALID_DB_INTEGER", "data.integer.invalid", "row.party_size");
  }
  if (!isLocale(fields.value.language)) {
    return invalid("INVALID_SHAPE", "guideAssignment.contract.invalid_shape", "row.language");
  }

  const assignmentFacts = [
    fields.value.assignment_id,
    fields.value.guide_user_id,
    fields.value.guide_display_name,
    fields.value.assignment_status,
  ];
  const allNull = assignmentFacts.every((fact) => fact === null);
  const allPresent = isUuid(fields.value.assignment_id) &&
    isUuid(fields.value.guide_user_id) &&
    (fields.value.guide_display_name === null || isSafeText(fields.value.guide_display_name, 200)) &&
    isActiveStatus(fields.value.assignment_status);
  if (!allNull && !allPresent) {
    return invalid("INVALID_SHAPE", "guideAssignment.contract.invalid_shape", "row.assignment_id");
  }

  return {
    ok: true,
    value: {
      bookingId: fields.value.booking_id as string,
      tourVersionId: fields.value.tour_version_id as string,
      departureId: fields.value.departure_id as string,
      titleEn: fields.value.title_en as string,
      titleVi: fields.value.title_vi as string,
      startAt: fields.value.start_at as string,
      endAt: fields.value.end_at as string,
      meetingPoint: fields.value.meeting_point as string,
      partySize: fields.value.party_size as number,
      language: fields.value.language as Locale,
      assignmentId: allNull ? null : fields.value.assignment_id as string,
      guideUserId: allNull ? null : fields.value.guide_user_id as string,
      guideDisplayName: allNull ? null : fields.value.guide_display_name as string | null,
      assignmentStatus: allNull ? null : fields.value.assignment_status as ActiveGuideAssignmentStatus,
    },
  };
}

export function parseEligibleGuideCandidate(value: unknown): ContractResult<EligibleGuideCandidate> {
  const fields = exactFields(value, ELIGIBLE_GUIDE_FIELDS, "row");
  if (!fields.ok) return fields;
  if (!isUuid(fields.value.guide_user_id)) {
    return invalid("INVALID_SHAPE", "guideAssignment.contract.invalid_shape", "row.guide_user_id");
  }
  if (!isSafeText(fields.value.display_name, 200)) {
    return invalid("INVALID_SHAPE", "guideAssignment.contract.invalid_shape", "row.display_name");
  }
  if (!isLocale(fields.value.language)) {
    return invalid("INVALID_SHAPE", "guideAssignment.contract.invalid_shape", "row.language");
  }
  return {
    ok: true,
    value: {
      guideUserId: fields.value.guide_user_id,
      displayName: fields.value.display_name,
      language: fields.value.language,
    },
  };
}

export function parseGuideAssignmentInput(value: unknown): ContractResult<GuideAssignmentInput> {
  const fields = exactFields(value, ASSIGNMENT_INPUT_FIELDS, "input");
  if (!fields.ok) return fields;
  if (!isUuid(fields.value.bookingId)) {
    return invalid("INVALID_SHAPE", "guideAssignment.contract.invalid_shape", "input.bookingId");
  }
  if (!isUuid(fields.value.guideUserId)) {
    return invalid("INVALID_SHAPE", "guideAssignment.contract.invalid_shape", "input.guideUserId");
  }
  if (typeof fields.value.idempotencyKey !== "string" ||
    !IDEMPOTENCY_KEY_PATTERN.test(fields.value.idempotencyKey)) {
    return invalid("INVALID_SHAPE", "guideAssignment.contract.invalid_shape", "input.idempotencyKey");
  }
  return {
    ok: true,
    value: {
      bookingId: fields.value.bookingId,
      guideUserId: fields.value.guideUserId,
      idempotencyKey: fields.value.idempotencyKey,
    },
  };
}

export function parseGuideAssignmentResult(value: unknown): ContractResult<GuideAssignmentResult> {
  const fields = exactFields(value, ASSIGNMENT_RESULT_FIELDS, "result");
  if (!fields.ok) return fields;
  for (const key of ["assignment_id", "booking_id", "guide_user_id"] as const) {
    if (!isUuid(fields.value[key])) {
      return invalid("INVALID_SHAPE", "guideAssignment.contract.invalid_shape", `result.${key.slice(0, -3)}Id`);
    }
  }
  if (!isActiveStatus(fields.value.status)) {
    return invalid("INVALID_SHAPE", "guideAssignment.contract.invalid_shape", "result.status");
  }
  if (typeof fields.value.outcome !== "string" || !OUTCOMES.has(fields.value.outcome as GuideAssignmentOutcome)) {
    return invalid("INVALID_SHAPE", "guideAssignment.contract.invalid_shape", "result.outcome");
  }
  return {
    ok: true,
    value: {
      assignmentId: fields.value.assignment_id as string,
      bookingId: fields.value.booking_id as string,
      guideUserId: fields.value.guide_user_id as string,
      status: fields.value.status as ActiveGuideAssignmentStatus,
      outcome: fields.value.outcome as GuideAssignmentOutcome,
    },
  };
}

export function parseGuideOwnAssignment(value: unknown): ContractResult<GuideOwnAssignment> {
  const fields = exactFields(value, GUIDE_OWN_ASSIGNMENT_FIELDS, "row");
  if (!fields.ok) return fields;
  for (const key of ["assignment_id", "booking_id", "tour_version_id", "departure_id"] as const) {
    if (!isUuid(fields.value[key])) {
      return invalid("INVALID_SHAPE", "guideAssignment.contract.invalid_shape", `row.${key}`);
    }
  }
  if (!isSafeText(fields.value.title)) {
    return invalid("INVALID_SHAPE", "guideAssignment.contract.invalid_shape", "row.title");
  }
  if (!isTimestamp(fields.value.start_at)) {
    return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", "row.start_at");
  }
  if (fields.value.end_at !== null && !isTimestamp(fields.value.end_at)) {
    return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", "row.end_at");
  }
  if (!isSafeText(fields.value.meeting_point)) {
    return invalid("INVALID_SHAPE", "guideAssignment.contract.invalid_shape", "row.meeting_point");
  }
  if (!isPartySize(fields.value.party_size)) {
    return invalid("INVALID_DB_INTEGER", "data.integer.invalid", "row.party_size");
  }
  if (!isLocale(fields.value.language)) {
    return invalid("INVALID_SHAPE", "guideAssignment.contract.invalid_shape", "row.language");
  }
  if (!isExactFlagArray(fields.value.mobility_flags, MOBILITY_FLAGS)) {
    return invalid("INVALID_SHAPE", "guideAssignment.contract.invalid_shape", "row.mobility_flags");
  }
  if (!isExactFlagArray(fields.value.dietary_flags, DIETARY_FLAGS)) {
    return invalid("INVALID_SHAPE", "guideAssignment.contract.invalid_shape", "row.dietary_flags");
  }
  if (!isActiveStatus(fields.value.assignment_status)) {
    return invalid("INVALID_SHAPE", "guideAssignment.contract.invalid_shape", "row.assignment_status");
  }
  return {
    ok: true,
    value: {
      assignmentId: fields.value.assignment_id as string,
      bookingId: fields.value.booking_id as string,
      tourVersionId: fields.value.tour_version_id as string,
      departureId: fields.value.departure_id as string,
      title: fields.value.title as string,
      startAt: fields.value.start_at as string,
      endAt: fields.value.end_at as string | null,
      meetingPoint: fields.value.meeting_point as string,
      partySize: fields.value.party_size as number,
      language: fields.value.language as Locale,
      mobilityFlags: fields.value.mobility_flags as GuideOwnAssignment["mobilityFlags"],
      dietaryFlags: fields.value.dietary_flags as GuideOwnAssignment["dietaryFlags"],
      assignmentStatus: fields.value.assignment_status as ActiveGuideAssignmentStatus,
    },
  };
}
