import type {
  AssignmentStatus,
  DataAdapterError,
  GuideAssignedBooking,
  Locale,
  Result,
} from "@/lib/domain/data/contracts";

type UnknownRecord = Record<string, unknown>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;
const LOCALES = new Set<Locale>(["en", "vi"]);
const ASSIGNMENT_STATUSES = new Set<AssignmentStatus>(["assigned", "accepted", "completed", "closed"]);
const MOBILITY_REQUIREMENTS = ["step-free"] as const;
const DIETARY_REQUIREMENTS = ["halal", "vegetarian"] as const;

const PROJECTION_FIELDS = [
  "booking_id", "tour_version_id", "departure_id", "title", "start_at", "end_at",
  "meeting_point", "party_size", "language", "mobility_flags", "dietary_flags", "assignment_status",
] as const;

export interface GuideAssignedBookingsRpcClient {
  rpc(name: "get_guide_assigned_bookings"): Promise<{ data: unknown; error: unknown }>;
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

function exactFields(value: unknown, path: string): Result<UnknownRecord, DataAdapterError> {
  if (!isRecord(value)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  const unknown = Object.keys(value).find((field) => !PROJECTION_FIELDS.includes(field as typeof PROJECTION_FIELDS[number]));
  if (unknown !== undefined) return invalid("UNKNOWN_FIELD", "data.adapter.unknown_field", `${path}.${unknown}`);
  const missing = PROJECTION_FIELDS.find((field) => !Object.prototype.hasOwnProperty.call(value, field));
  if (missing !== undefined) return invalid("MISSING_FIELD", "data.adapter.missing_field", `${path}.${missing}`);
  return { ok: true, value };
}

function safeUuid(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string" || value !== value.toLowerCase() || !UUID_PATTERN.test(value)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value };
}

function safeText(value: unknown, path: string, maximum: number): Result<string, DataAdapterError> {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    value !== value.trim() ||
    /[\u0000-\u001F\u007F-\u009F]/.test(value)
  ) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  return { ok: true, value };
}

function safeTimestamp(value: unknown, path: string): Result<string, DataAdapterError> {
  if (typeof value !== "string") return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  const match = value.match(TIMESTAMP_PATTERN);
  if (!match) return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offset = match[8];
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  }
  if (offset !== "Z" && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4, 6)) > 59)) {
    return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  }
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day || date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second ||
    !Number.isFinite(Date.parse(value))
  ) return invalid("INVALID_TIMESTAMP", "data.timestamp.invalid", path);
  return { ok: true, value };
}

function safePartySize(value: unknown, path: string): Result<number, DataAdapterError> {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 100) {
    return invalid("INVALID_DB_INTEGER", "data.integer.invalid", path);
  }
  return { ok: true, value };
}

function safeFlags<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): Result<string[], DataAdapterError> {
  if (!Array.isArray(value) || value.length > allowed.length) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", path);
  }
  const allowedSet = new Set(allowed);
  const flags: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const flag = value[index];
    if (typeof flag !== "string" || !allowedSet.has(flag as T) || flags.includes(flag)) {
      return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", `${path}.${index}`);
    }
    flags.push(flag);
  }
  return { ok: true, value: [...flags].sort() };
}

/** Map only the exact named, sanitized guide-assignment projection. */
export function mapGuideAssignedBooking(row: unknown): Result<GuideAssignedBooking, DataAdapterError> {
  const fields = exactFields(row, "row");
  if (!fields.ok) return fields;
  const bookingId = safeUuid(fields.value.booking_id, "row.booking_id");
  const tourVersionId = safeUuid(fields.value.tour_version_id, "row.tour_version_id");
  const departureId = safeUuid(fields.value.departure_id, "row.departure_id");
  const title = safeText(fields.value.title, "row.title", 240);
  const startAt = safeTimestamp(fields.value.start_at, "row.start_at");
  const endAt = safeTimestamp(fields.value.end_at, "row.end_at");
  const meetingPoint = safeText(fields.value.meeting_point, "row.meeting_point", 500);
  const partySize = safePartySize(fields.value.party_size, "row.party_size");
  const language = typeof fields.value.language === "string" && LOCALES.has(fields.value.language as Locale)
    ? { ok: true, value: fields.value.language as Locale } as const
    : invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "row.language");
  const mobilityFlags = safeFlags(fields.value.mobility_flags, MOBILITY_REQUIREMENTS, "row.mobility_flags");
  const dietaryFlags = safeFlags(fields.value.dietary_flags, DIETARY_REQUIREMENTS, "row.dietary_flags");
  const assignmentStatus = typeof fields.value.assignment_status === "string" && ASSIGNMENT_STATUSES.has(fields.value.assignment_status as AssignmentStatus)
    ? { ok: true, value: fields.value.assignment_status as AssignmentStatus } as const
    : invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "row.assignment_status");

  if (!bookingId.ok) return bookingId;
  if (!tourVersionId.ok) return tourVersionId;
  if (!departureId.ok) return departureId;
  if (!title.ok) return title;
  if (!startAt.ok) return startAt;
  if (!endAt.ok) return endAt;
  if (Date.parse(endAt.value) <= Date.parse(startAt.value)) {
    return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "row.end_at");
  }
  if (!meetingPoint.ok) return meetingPoint;
  if (!partySize.ok) return partySize;
  if (!language.ok) return language;
  if (!mobilityFlags.ok) return mobilityFlags;
  if (!dietaryFlags.ok) return dietaryFlags;
  if (!assignmentStatus.ok) return assignmentStatus;

  return {
    ok: true,
    value: {
      bookingId: bookingId.value,
      tourVersionId: tourVersionId.value,
      departureId: departureId.value,
      title: title.value,
      startAt: startAt.value,
      endAt: endAt.value,
      meetingPoint: meetingPoint.value,
      partySize: partySize.value,
      language: language.value,
      mobilityFlags: mobilityFlags.value,
      dietaryFlags: dietaryFlags.value,
      assignmentStatus: assignmentStatus.value,
    },
  };
}

export function mapGuideAssignedBookings(rows: unknown): Result<GuideAssignedBooking[], DataAdapterError> {
  if (!Array.isArray(rows)) return invalid("INVALID_SHAPE", "data.adapter.invalid_shape", "rows");
  const mapped: GuideAssignedBooking[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const value = mapGuideAssignedBooking(rows[index]);
    if (!value.ok) return { ok: false, error: { ...value.error, fieldPath: value.error.fieldPath?.replace("row", `rows[${index}]`) } };
    mapped.push(value.value);
  }
  return { ok: true, value: mapped };
}

/** Call only the named, RLS-protected RPC; no base booking table is queried here. */
export async function getGuideAssignedBookings(
  client: GuideAssignedBookingsRpcClient,
): Promise<Result<GuideAssignedBooking[], DataAdapterError>> {
  const response = await client.rpc("get_guide_assigned_bookings");
  if (response.error !== null && response.error !== undefined) {
    return invalid("INVALID_SHAPE", "data.adapter.rpc_failed");
  }
  return mapGuideAssignedBookings(response.data ?? []);
}
