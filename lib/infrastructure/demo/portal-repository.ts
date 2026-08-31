import {
  BOOKING_STATUS_VALUES,
  DEPARTURE_STATUS_VALUES,
  LOCALE_VALUES,
  PAYMENT_STATUS_VALUES,
  PLACE_STATUS_VALUES,
  REQUEST_STATUS_VALUES,
  ROLE_VALUES,
  TOUR_STATUS_VALUES,
  type AssignmentStatus,
  type CheckoutCurrency,
  type CustomerBooking,
  type CustomerCustomRequest,
  type Locale,
  type PaymentStatus,
  type RequestStatus,
  type Role,
} from "@/lib/domain/data/contracts";
import {
  PortalError,
  validateCancellationDecisionInput,
  validateCancellationRequestInput,
  validateCustomerAccountUpdate,
  validateGuideProfileUpdate,
  validateTourReviewInput,
  type AdminBookingProjection,
  type AdminCancellationDecision,
  type AdminDepartureProjection,
  type AdminFixedTourProjection,
  type AdminLocationProjection,
  type AdminPersonalizedRequestProjection,
  type AdminReportProjection,
  type AdminUserProjection,
  type CancellationRequest,
  type CustomerAccount,
  type CustomerAccountPort,
  type CustomerBookingView,
  type CustomerCancellationPort,
  type CustomerPortalPorts,
  type CustomerTourReviewPort,
  type DemoPortalIdentity,
  type DemoSessionPort,
  type GuideAssignedTour,
  type GuideAssignmentPort,
  type GuideProfile,
  type GuideProfilePort,
  type GuidePortalPorts,
  type PortalIdentity,
  type AdminPortalPorts,
  type TourReview,
} from "@/lib/application/portal/contracts";

export { PortalError };

/** The only key owned by the demo portal repository. */
export const PORTAL_DEMO_STORAGE_KEY = "locallens.portal.demo.v1" as const;
/** Compatibility alias retained for the first demo test contract. */
export const DEMO_PORTAL_STORAGE_KEY = PORTAL_DEMO_STORAGE_KEY;
export const PORTAL_DEMO_STORAGE_VERSION = 1 as const;

export interface PortalSessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Compatibility alias for callers that used the initial boundary name. */
export type SessionStorageBoundary = PortalSessionStorage;
export type SessionStorage = PortalSessionStorage;
export const DEMO_PORTAL_STORAGE_VERSION = PORTAL_DEMO_STORAGE_VERSION;

export interface DemoPortalRepositoryOptions {
  storage: PortalSessionStorage;
  now?: () => string;
}

type DemoUserRecord = AdminUserProjection & { bio: string | null; nationality: string };

type DemoRequestRecord = CustomerCustomRequest & {
  ownerUserId: string;
  latestDecisionAt: string | null;
};

type DemoBookingRecord = CustomerBooking & {
  ownerUserId: string;
  paymentStatus: PaymentStatus | null;
  assignedGuideUserId: string | null;
  cancellationRequestId: string | null;
  specialNeeds: string | null;
  personalizedRequest: DemoRequestRecord | null;
};

type DemoCancellationRecord = CancellationRequest;
type DemoReviewRecord = TourReview;

type DemoAssignmentRecord = {
  bookingId: string;
  assignedGuideUserId: string;
  assignmentStatus: AssignmentStatus;
  specialNeeds: string | null;
};

type DemoLocationRecord = AdminLocationProjection;
type DemoFixedTourRecord = AdminFixedTourProjection;
type DemoDepartureRecord = AdminDepartureProjection;

type DemoEnvelopeBody = {
  version: typeof PORTAL_DEMO_STORAGE_VERSION;
  users: DemoUserRecord[];
  bookings: DemoBookingRecord[];
  cancellations: DemoCancellationRecord[];
  reviews: DemoReviewRecord[];
  assignments: DemoAssignmentRecord[];
  locations: DemoLocationRecord[];
  fixedTours: DemoFixedTourRecord[];
  departures: DemoDepartureRecord[];
};

type DemoEnvelope = DemoEnvelopeBody & {
  integrity: {
    algorithm: "fnv1a32";
    digest: string;
  };
};

export interface DemoPortalRepository {
  readonly session: DemoSessionPort;
  readonly customer: CustomerPortalPorts;
  readonly guide: GuidePortalPorts;
  readonly admin: AdminPortalPorts;
  reset(): Promise<void>;
}

const FIXTURE_DATE = "2026-09-05";
const REPORT_TIMESTAMP = "2026-08-31T00:00:00.000Z";
const DEMO_CATALOG_SNAPSHOT_ID = "demo-catalog-snapshot-v1";
const DEMO_TRAVEL_SNAPSHOT_ID = "demo-travel-snapshot-v1";
const DEMO_FX_SNAPSHOT_ID = "demo-fx-snapshot-v1";
const HASH_ALGORITHM = "fnv1a32" as const;
const MAX_RECORDS = 200;
const PORTAL_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/;
const MONEY_PATTERN = /^(?:0|[1-9]\d*)$/;
const FX_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const NATIONALITY_PATTERN = /^\p{L}(?:[\p{L} .'-]*\p{L})?$/u;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:?\d{2})$/;
const CONTROL_PATTERN = /[\u0000-\u001F\u007F-\u009F]/;
const CANCELLABLE_BOOKING_STATUSES = ["pending_payment", "payment_processing", "payment_review", "confirmed"] as const;

const ENVELOPE_FIELDS = [
  "version",
  "users",
  "bookings",
  "cancellations",
  "reviews",
  "assignments",
  "locations",
  "fixedTours",
  "departures",
  "integrity",
] as const;
const INTEGRITY_FIELDS = ["algorithm", "digest"] as const;
const USER_FIELDS = ["userId", "role", "displayName", "nationality", "email", "phone", "bio", "language", "active"] as const;
const REQUEST_FIELDS = [
  "id",
  "planId",
  "revisionNo",
  "status",
  "submittedAt",
  "updatedAt",
  "ownerUserId",
  "latestDecisionAt",
] as const;
const BOOKING_FIELDS = [
  "id",
  "status",
  "sourceKind",
  "sourceId",
  "tourVersionId",
  "quoteId",
  "titleEn",
  "titleVi",
  "cancellationPolicy",
  "catalogSnapshotId",
  "travelSnapshotId",
  "fxSnapshotId",
  "fxVndPerUsd",
  "perPersonVndMinor",
  "totalVndMinor",
  "checkoutCurrency",
  "checkoutAmountMinor",
  "partySize",
  "language",
  "meetingPoint",
  "holdExpiresAt",
  "createdAt",
  "ownerUserId",
  "paymentStatus",
  "assignedGuideUserId",
  "cancellationRequestId",
  "specialNeeds",
  "personalizedRequest",
] as const;
const CANCELLATION_FIELDS = [
  "id",
  "bookingId",
  "customerUserId",
  "reason",
  "status",
  "createdAt",
  "decidedAt",
  "decisionNote",
] as const;
const REVIEW_FIELDS = ["id", "bookingId", "customerUserId", "rating", "text", "createdAt"] as const;
const ASSIGNMENT_FIELDS = ["bookingId", "assignedGuideUserId", "assignmentStatus", "specialNeeds"] as const;
const LOCATION_FIELDS = ["id", "slug", "locale", "title", "status"] as const;
const FIXED_TOUR_FIELDS = ["id", "versionId", "slug", "locale", "title", "status"] as const;
const DEPARTURE_FIELDS = ["id", "tourVersionId", "date", "status"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidStorage(path: string, detail = "The demo portal storage envelope is invalid."): never {
  throw new PortalError("INVALID_STORAGE", `${detail} (${path})`);
}

function storageUnavailable(operation: string, error: unknown): never {
  const detail = error instanceof Error ? error.message : "unknown storage error";
  throw new PortalError("STORAGE_UNAVAILABLE", `Demo portal storage ${operation} failed: ${detail}`);
}

function invalidInput(message: string): never {
  throw new PortalError("INVALID_INPUT", message);
}

function unauthenticated(): never {
  throw new PortalError("UNAUTHENTICATED", "A selected demo identity is required.");
}

function forbidden(role: string, operation: string): never {
  throw new PortalError("FORBIDDEN", `${role} cannot perform ${operation}.`);
}

function notFound(resource: string, id: string): never {
  throw new PortalError("NOT_FOUND", `${resource} ${id} was not found.`);
}

function conflict(message: string): never {
  throw new PortalError("CONFLICT", message);
}

function exactRecord(value: unknown, fields: readonly string[], path: string): Record<string, unknown> {
  if (!isRecord(value)) invalidStorage(path, "Expected an object");
  const keys = Object.keys(value);
  const unknown = keys.find((key) => !fields.includes(key));
  if (unknown !== undefined) invalidStorage(`${path}.${unknown}`, "Unknown field");
  const missing = fields.find((field) => !Object.prototype.hasOwnProperty.call(value, field));
  if (missing !== undefined) invalidStorage(`${path}.${missing}`, "Missing field");
  return value;
}

function denseArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value) || value.length > MAX_RECORDS) invalidStorage(path, "Expected a bounded array");
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) invalidStorage(`${path}[${index}]`, "Sparse arrays are not allowed");
  }
  return value;
}

function safeId(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() !== value || !PORTAL_ID_PATTERN.test(value)) {
    invalidStorage(path, "Invalid identifier");
  }
  return value;
}

function inputId(value: unknown, fieldPath: string): string {
  if (typeof value !== "string" || value.trim() !== value || !PORTAL_ID_PATTERN.test(value)) {
    invalidInput(`Invalid ${fieldPath}.`);
  }
  return value;
}

function safeText(value: unknown, path: string, maximum: number, allowEmpty = false): string {
  if (
    typeof value !== "string" ||
    value.length > maximum ||
    (!allowEmpty && value.length === 0) ||
    value.trim() !== value ||
    CONTROL_PATTERN.test(value)
  ) {
    invalidStorage(path, "Invalid text");
  }
  return value;
}

function inputText(value: unknown, fieldPath: string, maximum: number, allowNull = false): string | null {
  if (allowNull && value === null) return null;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim() !== value ||
    CONTROL_PATTERN.test(value)
  ) {
    invalidInput(`Invalid ${fieldPath}.`);
  }
  return value;
}

function nullableStorageText(value: unknown, path: string, maximum: number): string | null {
  if (value === null) return null;
  return safeText(value, path, maximum);
}

function safeLocale(value: unknown, path: string): Locale {
  if (typeof value !== "string" || !(LOCALE_VALUES as readonly string[]).includes(value)) invalidStorage(path, "Invalid locale");
  return value as Locale;
}

function safeRole(value: unknown, path: string): Role {
  if (typeof value !== "string" || !(ROLE_VALUES as readonly string[]).includes(value)) invalidStorage(path, "Invalid role");
  return value as Role;
}

function safeEnum<T extends string>(value: unknown, values: readonly T[], path: string, name: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) invalidStorage(path, `Invalid ${name}`);
  return value as T;
}

function safeDate(value: unknown, path: string): string {
  if (typeof value !== "string") invalidStorage(path, "Invalid date");
  const match = value.match(DATE_PATTERN);
  if (!match) invalidStorage(path, "Invalid date");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) invalidStorage(path, "Invalid date");
  return value;
}

function safeTimestamp(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() !== value || CONTROL_PATTERN.test(value)) {
    invalidStorage(path, "Invalid timestamp");
  }
  const match = value.match(TIMESTAMP_PATTERN);
  if (!match || !Number.isFinite(Date.parse(value))) invalidStorage(path, "Invalid timestamp");
  const local = new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  ));
  if (
    local.getUTCFullYear() !== Number(match[1]) ||
    local.getUTCMonth() !== Number(match[2]) - 1 ||
    local.getUTCDate() !== Number(match[3]) ||
    local.getUTCHours() !== Number(match[4]) ||
    local.getUTCMinutes() !== Number(match[5]) ||
    local.getUTCSeconds() !== Number(match[6])
  ) invalidStorage(path, "Invalid timestamp");
  return value;
}

function safeMoney(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length > 30 || !MONEY_PATTERN.test(value)) invalidStorage(path, "Invalid money amount");
  return value;
}

function safeFx(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length > 40 || !FX_PATTERN.test(value)) invalidStorage(path, "Invalid exchange-rate amount");
  return value;
}

function safeEmail(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length > 254 || !EMAIL_PATTERN.test(value)) invalidStorage(path, "Invalid email");
  return value;
}

function safeNationality(value: unknown, path: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 80 ||
    value.trim() !== value ||
    CONTROL_PATTERN.test(value) ||
    !NATIONALITY_PATTERN.test(value)
  ) invalidStorage(path, "Invalid nationality");
  return value;
}

function safeInteger(value: unknown, path: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    invalidStorage(path, "Invalid integer");
  }
  return value;
}

function safeNullableId(value: unknown, path: string): string | null {
  return value === null ? null : safeId(value, path);
}

function safeNullableTimestamp(value: unknown, path: string): string | null {
  return value === null ? null : safeTimestamp(value, path);
}

function safeNullableMoney(value: unknown, path: string): string | null {
  return value === null ? null : safeMoney(value, path);
}

function isCancellableBookingStatus(value: string): boolean {
  return (CANCELLABLE_BOOKING_STATUSES as readonly string[]).includes(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((entry) => canonical(entry)).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function bodyForIntegrity(envelope: DemoEnvelope): DemoEnvelopeBody {
  return {
    version: envelope.version,
    users: envelope.users,
    bookings: envelope.bookings,
    cancellations: envelope.cancellations,
    reviews: envelope.reviews,
    assignments: envelope.assignments,
    locations: envelope.locations,
    fixedTours: envelope.fixedTours,
    departures: envelope.departures,
  };
}

function digestBody(body: DemoEnvelopeBody): string {
  return fnv1a32(canonical(body));
}

function makeEnvelope(body: DemoEnvelopeBody): DemoEnvelope {
  return {
    ...body,
    integrity: { algorithm: HASH_ALGORITHM, digest: digestBody(body) },
  };
}

function parseUser(value: unknown, path: string): DemoUserRecord {
  const row = exactRecord(value, USER_FIELDS, path);
  const active = row.active;
  if (active !== true) invalidStorage(`${path}.active`, "Demo users must be active");
  return {
    userId: safeId(row.userId, `${path}.userId`),
    role: safeRole(row.role, `${path}.role`),
    displayName: safeText(row.displayName, `${path}.displayName`, 80),
    nationality: safeNationality(row.nationality, `${path}.nationality`),
    email: safeEmail(row.email, `${path}.email`),
    phone: nullableStorageText(row.phone, `${path}.phone`, 32),
    bio: nullableStorageText(row.bio, `${path}.bio`, 1000),
    language: safeLocale(row.language, `${path}.language`),
    active: true,
  };
}

function parseRequest(value: unknown, path: string): DemoRequestRecord {
  const row = exactRecord(value, REQUEST_FIELDS, path);
  return {
    id: safeId(row.id, `${path}.id`),
    planId: safeId(row.planId, `${path}.planId`),
    revisionNo: safeInteger(row.revisionNo, `${path}.revisionNo`, 1, 100),
    status: safeEnum(row.status, REQUEST_STATUS_VALUES, `${path}.status`, "request status"),
    submittedAt: safeTimestamp(row.submittedAt, `${path}.submittedAt`),
    updatedAt: safeTimestamp(row.updatedAt, `${path}.updatedAt`),
    ownerUserId: safeId(row.ownerUserId, `${path}.ownerUserId`),
    latestDecisionAt: safeNullableTimestamp(row.latestDecisionAt, `${path}.latestDecisionAt`),
  };
}

function parseBooking(value: unknown, path: string): DemoBookingRecord {
  const row = exactRecord(value, BOOKING_FIELDS, path);
  const sourceKind = row.sourceKind;
  if (sourceKind !== "departure" && sourceKind !== "quote") invalidStorage(`${path}.sourceKind`, "Invalid booking source");
  const checkoutCurrency = row.checkoutCurrency;
  if (checkoutCurrency !== "vnd" && checkoutCurrency !== "usd") invalidStorage(`${path}.checkoutCurrency`, "Invalid checkout currency");
  return {
    id: safeId(row.id, `${path}.id`),
    status: safeEnum(row.status, BOOKING_STATUS_VALUES, `${path}.status`, "booking status"),
    sourceKind,
    sourceId: safeId(row.sourceId, `${path}.sourceId`),
    tourVersionId: safeNullableId(row.tourVersionId, `${path}.tourVersionId`),
    quoteId: safeNullableId(row.quoteId, `${path}.quoteId`),
    titleEn: safeText(row.titleEn, `${path}.titleEn`, 240),
    titleVi: safeText(row.titleVi, `${path}.titleVi`, 240),
    cancellationPolicy: safeText(row.cancellationPolicy, `${path}.cancellationPolicy`, 4_000),
    catalogSnapshotId: safeId(row.catalogSnapshotId, `${path}.catalogSnapshotId`),
    travelSnapshotId: safeId(row.travelSnapshotId, `${path}.travelSnapshotId`),
    fxSnapshotId: safeNullableId(row.fxSnapshotId, `${path}.fxSnapshotId`),
    fxVndPerUsd: row.fxVndPerUsd === null ? null : safeFx(row.fxVndPerUsd, `${path}.fxVndPerUsd`),
    perPersonVndMinor: safeNullableMoney(row.perPersonVndMinor, `${path}.perPersonVndMinor`),
    totalVndMinor: safeMoney(row.totalVndMinor, `${path}.totalVndMinor`),
    checkoutCurrency: checkoutCurrency as CheckoutCurrency,
    checkoutAmountMinor: safeMoney(row.checkoutAmountMinor, `${path}.checkoutAmountMinor`),
    partySize: safeInteger(row.partySize, `${path}.partySize`, 1, 100),
    language: safeLocale(row.language, `${path}.language`),
    meetingPoint: safeText(row.meetingPoint, `${path}.meetingPoint`, 240),
    holdExpiresAt: safeTimestamp(row.holdExpiresAt, `${path}.holdExpiresAt`),
    createdAt: safeTimestamp(row.createdAt, `${path}.createdAt`),
    ownerUserId: safeId(row.ownerUserId, `${path}.ownerUserId`),
    paymentStatus: row.paymentStatus === null
      ? null
      : safeEnum(row.paymentStatus, PAYMENT_STATUS_VALUES, `${path}.paymentStatus`, "payment status"),
    assignedGuideUserId: safeNullableId(row.assignedGuideUserId, `${path}.assignedGuideUserId`),
    cancellationRequestId: safeNullableId(row.cancellationRequestId, `${path}.cancellationRequestId`),
    specialNeeds: nullableStorageText(row.specialNeeds, `${path}.specialNeeds`, 1_000),
    personalizedRequest: row.personalizedRequest === null ? null : parseRequest(row.personalizedRequest, `${path}.personalizedRequest`),
  };
}

function parseCancellation(value: unknown, path: string): DemoCancellationRecord {
  const row = exactRecord(value, CANCELLATION_FIELDS, path);
  const status = row.status;
  if (status !== "pending" && status !== "approved" && status !== "rejected") invalidStorage(`${path}.status`, "Invalid cancellation status");
  return {
    id: safeId(row.id, `${path}.id`),
    bookingId: safeId(row.bookingId, `${path}.bookingId`),
    customerUserId: safeId(row.customerUserId, `${path}.customerUserId`),
    reason: safeText(row.reason, `${path}.reason`, 1_000),
    status,
    createdAt: safeTimestamp(row.createdAt, `${path}.createdAt`),
    decidedAt: safeNullableTimestamp(row.decidedAt, `${path}.decidedAt`),
    decisionNote: nullableStorageText(row.decisionNote, `${path}.decisionNote`, 1_000),
  };
}

function parseReview(value: unknown, path: string): DemoReviewRecord {
  const row = exactRecord(value, REVIEW_FIELDS, path);
  return {
    id: safeId(row.id, `${path}.id`),
    bookingId: safeId(row.bookingId, `${path}.bookingId`),
    customerUserId: safeId(row.customerUserId, `${path}.customerUserId`),
    rating: safeInteger(row.rating, `${path}.rating`, 1, 5),
    text: safeText(row.text, `${path}.text`, 1_000),
    createdAt: safeTimestamp(row.createdAt, `${path}.createdAt`),
  };
}

function parseAssignment(value: unknown, path: string): DemoAssignmentRecord {
  const row = exactRecord(value, ASSIGNMENT_FIELDS, path);
  return {
    bookingId: safeId(row.bookingId, `${path}.bookingId`),
    assignedGuideUserId: safeId(row.assignedGuideUserId, `${path}.assignedGuideUserId`),
    assignmentStatus: safeEnum(row.assignmentStatus, ["assigned", "accepted", "completed", "closed"] as const, `${path}.assignmentStatus`, "assignment status"),
    specialNeeds: nullableStorageText(row.specialNeeds, `${path}.specialNeeds`, 1_000),
  };
}

function parseLocation(value: unknown, path: string): DemoLocationRecord {
  const row = exactRecord(value, LOCATION_FIELDS, path);
  return {
    id: safeId(row.id, `${path}.id`),
    slug: safeId(row.slug, `${path}.slug`),
    locale: safeLocale(row.locale, `${path}.locale`),
    title: safeText(row.title, `${path}.title`, 240),
    status: safeEnum(row.status, PLACE_STATUS_VALUES, `${path}.status`, "place status"),
  };
}

function parseFixedTour(value: unknown, path: string): DemoFixedTourRecord {
  const row = exactRecord(value, FIXED_TOUR_FIELDS, path);
  return {
    id: safeId(row.id, `${path}.id`),
    versionId: safeId(row.versionId, `${path}.versionId`),
    slug: safeId(row.slug, `${path}.slug`),
    locale: safeLocale(row.locale, `${path}.locale`),
    title: safeText(row.title, `${path}.title`, 240),
    status: safeEnum(row.status, TOUR_STATUS_VALUES, `${path}.status`, "tour status"),
  };
}

function parseDeparture(value: unknown, path: string): DemoDepartureRecord {
  const row = exactRecord(value, DEPARTURE_FIELDS, path);
  return {
    id: safeId(row.id, `${path}.id`),
    tourVersionId: safeId(row.tourVersionId, `${path}.tourVersionId`),
    date: safeDate(row.date, `${path}.date`),
    status: safeEnum(row.status, DEPARTURE_STATUS_VALUES, `${path}.status`, "departure status"),
  };
}

function ensureUnique(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) invalidStorage(path, "Duplicate identifiers");
}

function validateCrossReferences(envelope: DemoEnvelope): void {
  for (const role of ["customer", "guide", "admin"] as const) {
    if (!envelope.users.some((user) => user.role === role)) invalidStorage("users", `Fixture must contain a ${role}`);
  }
  const users = new Map(envelope.users.map((user) => [user.userId, user]));
  const bookings = new Map(envelope.bookings.map((booking) => [booking.id, booking]));
  const departures = new Map(envelope.departures.map((departure) => [departure.id, departure]));
  const tours = new Map(envelope.fixedTours.map((tour) => [tour.versionId, tour]));
  const cancellations = new Map(envelope.cancellations.map((request) => [request.id, request]));
  const assignments = new Map(envelope.assignments.map((assignment) => [assignment.bookingId, assignment]));
  const reviews = new Map<string, DemoReviewRecord>();

  for (const location of envelope.locations) {
    if (location.status === "published" && location.locale !== "en" && location.locale !== "vi") {
      invalidStorage(`locations.${location.id}.locale`, "Invalid published location locale");
    }
  }

  for (const tour of envelope.fixedTours) {
    if (tour.status === "published" && !envelope.locations.some((location) => location.status === "published")) {
      invalidStorage(`fixedTours.${tour.id}`, "Published tour requires a published location");
    }
  }

  for (const departure of envelope.departures) {
    if (!tours.has(departure.tourVersionId)) invalidStorage(`departures.${departure.id}.tourVersionId`, "Unknown tour version reference");
  }

  for (const booking of envelope.bookings) {
    const owner = users.get(booking.ownerUserId);
    if (!owner || owner.role !== "customer") invalidStorage(`bookings.${booking.id}.ownerUserId`, "Booking owner must be a customer");
    if (booking.sourceKind === "departure") {
      const departure = departures.get(booking.sourceId);
      if (!departure) invalidStorage(`bookings.${booking.id}.sourceId`, "Unknown departure reference");
      if (booking.tourVersionId === null || booking.tourVersionId !== departure.tourVersionId) {
        invalidStorage(`bookings.${booking.id}.tourVersionId`, "Departure booking tour reference mismatch");
      }
      if (booking.quoteId !== null || booking.personalizedRequest !== null) {
        invalidStorage(`bookings.${booking.id}`, "Departure booking cannot contain quote data");
      }
    } else {
      if (booking.quoteId === null || booking.quoteId !== booking.sourceId || booking.tourVersionId !== null) {
        invalidStorage(`bookings.${booking.id}`, "Quote booking source reference mismatch");
      }
      if (booking.personalizedRequest === null) invalidStorage(`bookings.${booking.id}.personalizedRequest`, "Quote booking requires its request");
      if (booking.personalizedRequest.ownerUserId !== booking.ownerUserId) {
        invalidStorage(`bookings.${booking.id}.personalizedRequest.ownerUserId`, "Request owner mismatch");
      }
      if (booking.personalizedRequest.status === "pending_review" && booking.personalizedRequest.latestDecisionAt !== null) {
        invalidStorage(`bookings.${booking.id}.personalizedRequest.latestDecisionAt`, "Pending request cannot have a decision timestamp");
      }
      if (booking.personalizedRequest.status !== "pending_review" && booking.personalizedRequest.latestDecisionAt === null) {
        invalidStorage(`bookings.${booking.id}.personalizedRequest.latestDecisionAt`, "Reviewed request requires a decision timestamp");
      }
    }
    if (booking.assignedGuideUserId !== null) {
      const guide = users.get(booking.assignedGuideUserId);
      if (!guide || guide.role !== "guide") invalidStorage(`bookings.${booking.id}.assignedGuideUserId`, "Assigned user must be a guide");
      const assignment = assignments.get(booking.id);
      if (!assignment || assignment.assignedGuideUserId !== booking.assignedGuideUserId) {
        invalidStorage(`bookings.${booking.id}.assignedGuideUserId`, "Assignment projection mismatch");
      }
    } else if (assignments.has(booking.id)) {
      invalidStorage(`bookings.${booking.id}.assignedGuideUserId`, "Missing booking assignment reference");
    }
    if (booking.cancellationRequestId !== null) {
      const cancellation = cancellations.get(booking.cancellationRequestId);
      if (!cancellation || cancellation.bookingId !== booking.id || cancellation.customerUserId !== booking.ownerUserId) {
        invalidStorage(`bookings.${booking.id}.cancellationRequestId`, "Cancellation reference mismatch");
      }
    }
    const linkedCancellations = envelope.cancellations.filter((request) => request.bookingId === booking.id);
    const hasApprovedCancellation = linkedCancellations.some((request) => request.status === "approved");
    if (hasApprovedCancellation !== (booking.status === "cancelled")) {
      invalidStorage(`bookings.${booking.id}.status`, "Approved cancellation and booking status must agree");
    }
    if (booking.status === "cancelled") {
      const cancellation = booking.cancellationRequestId === null ? null : cancellations.get(booking.cancellationRequestId);
      if (!cancellation || cancellation.status !== "approved") invalidStorage(`bookings.${booking.id}.status`, "Cancelled booking requires an approved cancellation");
    }
  }

  for (const cancellation of envelope.cancellations) {
    const booking = bookings.get(cancellation.bookingId);
    const owner = users.get(cancellation.customerUserId);
    if (!booking || !owner || owner.role !== "customer" || booking.ownerUserId !== cancellation.customerUserId) {
      invalidStorage(`cancellations.${cancellation.id}`, "Cancellation ownership reference mismatch");
    }
    if (cancellation.status === "pending" && booking.cancellationRequestId !== cancellation.id) {
      invalidStorage(`cancellations.${cancellation.id}`, "Pending cancellation must be the latest booking request");
    }
    if (cancellation.status === "pending") {
      if (cancellation.decidedAt !== null || cancellation.decisionNote !== null) invalidStorage(`cancellations.${cancellation.id}`, "Pending cancellation cannot have a decision");
      if (!isCancellableBookingStatus(booking.status)) {
        invalidStorage(`cancellations.${cancellation.id}`, "Pending cancellation requires a cancellable booking");
      }
    } else if (cancellation.decidedAt === null) {
      invalidStorage(`cancellations.${cancellation.id}.decidedAt`, "Decided cancellation requires a timestamp");
    } else if (cancellation.status === "approved" && booking.status !== "cancelled") {
      invalidStorage(`cancellations.${cancellation.id}`, "Approved cancellation requires a cancelled booking");
    } else if (cancellation.status === "rejected" && booking.status === "cancelled") {
      invalidStorage(`cancellations.${cancellation.id}`, "Rejected cancellation cannot leave a booking cancelled");
    }
  }

  for (const assignment of envelope.assignments) {
    const booking = bookings.get(assignment.bookingId);
    const guide = users.get(assignment.assignedGuideUserId);
    if (!booking || booking.sourceKind !== "departure" || booking.assignedGuideUserId !== assignment.assignedGuideUserId) {
      invalidStorage(`assignments.${assignment.bookingId}`, "Assignment booking reference mismatch");
    }
    if (!guide || guide.role !== "guide") invalidStorage(`assignments.${assignment.bookingId}.assignedGuideUserId`, "Assignment user must be a guide");
    if (assignment.specialNeeds !== booking.specialNeeds) invalidStorage(`assignments.${assignment.bookingId}.specialNeeds`, "Assignment special-needs mismatch");
  }

  for (const review of envelope.reviews) {
    const booking = bookings.get(review.bookingId);
    const owner = users.get(review.customerUserId);
    if (!booking || booking.status !== "completed" || booking.ownerUserId !== review.customerUserId || !owner || owner.role !== "customer") {
      invalidStorage(`reviews.${review.id}`, "Review ownership or eligibility reference mismatch");
    }
    if (reviews.has(review.bookingId)) invalidStorage(`reviews.${review.id}.bookingId`, "Only one review is allowed per booking");
    reviews.set(review.bookingId, review);
  }

  const requestCount = envelope.bookings.filter((booking) => booking.personalizedRequest !== null).length;
  if (requestCount < 1) invalidStorage("bookings", "The demo fixture must include a personalized request");
}

function parseEnvelope(raw: string): DemoEnvelope {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    invalidStorage("root", "Storage is not valid JSON");
  }
  const root = exactRecord(value, ENVELOPE_FIELDS, "root");
  if (root.version !== PORTAL_DEMO_STORAGE_VERSION) invalidStorage("root.version", "Unsupported storage version");
  const integrity = exactRecord(root.integrity, INTEGRITY_FIELDS, "root.integrity");
  if (integrity.algorithm !== HASH_ALGORITHM || typeof integrity.digest !== "string" || !/^[0-9a-f]{8}$/.test(integrity.digest)) {
    invalidStorage("root.integrity", "Invalid storage integrity marker");
  }
  const envelope: DemoEnvelope = {
    version: PORTAL_DEMO_STORAGE_VERSION,
    users: denseArray(root.users, "root.users").map((entry, index) => parseUser(entry, `root.users[${index}]`)),
    bookings: denseArray(root.bookings, "root.bookings").map((entry, index) => parseBooking(entry, `root.bookings[${index}]`)),
    cancellations: denseArray(root.cancellations, "root.cancellations").map((entry, index) => parseCancellation(entry, `root.cancellations[${index}]`)),
    reviews: denseArray(root.reviews, "root.reviews").map((entry, index) => parseReview(entry, `root.reviews[${index}]`)),
    assignments: denseArray(root.assignments, "root.assignments").map((entry, index) => parseAssignment(entry, `root.assignments[${index}]`)),
    locations: denseArray(root.locations, "root.locations").map((entry, index) => parseLocation(entry, `root.locations[${index}]`)),
    fixedTours: denseArray(root.fixedTours, "root.fixedTours").map((entry, index) => parseFixedTour(entry, `root.fixedTours[${index}]`)),
    departures: denseArray(root.departures, "root.departures").map((entry, index) => parseDeparture(entry, `root.departures[${index}]`)),
    integrity: {
      algorithm: HASH_ALGORITHM,
      digest: integrity.digest,
    },
  };
  ensureUnique(envelope.users.map((user) => user.userId), "root.users");
  ensureUnique(envelope.bookings.map((booking) => booking.id), "root.bookings");
  ensureUnique(envelope.cancellations.map((request) => request.id), "root.cancellations");
  ensureUnique(envelope.reviews.map((review) => review.id), "root.reviews");
  ensureUnique(envelope.assignments.map((assignment) => assignment.bookingId), "root.assignments");
  ensureUnique(envelope.locations.map((location) => location.id), "root.locations");
  ensureUnique(envelope.fixedTours.map((tour) => tour.id), "root.fixedTours");
  ensureUnique(envelope.fixedTours.map((tour) => tour.versionId), "root.fixedTours.versionId");
  ensureUnique(envelope.departures.map((departure) => departure.id), "root.departures");
  validateCrossReferences(envelope);
  if (digestBody(bodyForIntegrity(envelope)) !== integrity.digest) invalidStorage("root.integrity.digest", "Storage integrity check failed");
  return envelope;
}

function createFixtureBody(): DemoEnvelopeBody {
  const users: DemoUserRecord[] = [
    {
      userId: "demo-user-customer",
      role: "customer",
      displayName: "Demo Traveler",
      nationality: "Vietnamese",
      email: "traveler@example.invalid",
      phone: null,
      bio: null,
      language: "en",
      active: true,
    },
    {
      userId: "demo-user-guide",
      role: "guide",
      displayName: "Demo Guide",
      nationality: "Vietnamese",
      email: "guide@example.invalid",
      phone: "+84000000001",
      bio: "A careful local guide.",
      language: "en",
      active: true,
    },
    {
      userId: "demo-user-guide-secondary",
      role: "guide",
      displayName: "Second Demo Guide",
      nationality: "Vietnamese",
      email: "guide-secondary@example.invalid",
      phone: "+84000000002",
      bio: "A second local guide.",
      language: "en",
      active: true,
    },
    {
      userId: "demo-user-admin",
      role: "admin",
      displayName: "Demo Administrator",
      nationality: "Vietnamese",
      email: "admin@example.invalid",
      phone: null,
      bio: null,
      language: "en",
      active: true,
    },
    {
      userId: "demo-user-secondary-customer",
      role: "customer",
      displayName: "Second Demo Traveler",
      nationality: "Vietnamese",
      email: "traveler-secondary@example.invalid",
      phone: null,
      bio: null,
      language: "vi",
      active: true,
    },
  ];

  const fixedTours: DemoFixedTourRecord[] = [
    {
      id: "demo-tour-markets",
      versionId: "demo-tour-version-markets",
      slug: "markets-and-street-food",
      locale: "en",
      title: "Markets and Street Food",
      status: "published",
    },
    {
      id: "demo-tour-history",
      versionId: "demo-tour-version-history",
      slug: "history-and-memory",
      locale: "en",
      title: "History and Memory",
      status: "published",
    },
  ];
  const departures: DemoDepartureRecord[] = [
    { id: "demo-departure-completed", tourVersionId: "demo-tour-version-markets", date: "2026-08-30", status: "completed" },
    { id: "demo-departure-cancellation", tourVersionId: "demo-tour-version-history", date: FIXTURE_DATE, status: "scheduled" },
    { id: "demo-departure-secondary", tourVersionId: "demo-tour-version-markets", date: "2026-09-06", status: "scheduled" },
  ];
  const locations: DemoLocationRecord[] = [
    { id: "demo-location-ben-thanh", slug: "ben-thanh-market", locale: "en", title: "Ben Thanh Market", status: "published" },
    { id: "demo-location-war-remnants", slug: "war-remnants", locale: "en", title: "War Remnants Museum area", status: "published" },
  ];
  const bookings: DemoBookingRecord[] = [
    {
      id: "demo-booking-completed",
      status: "completed",
      sourceKind: "departure",
      sourceId: "demo-departure-completed",
      tourVersionId: "demo-tour-version-markets",
      quoteId: null,
      titleEn: "Markets and Street Food",
      titleVi: "Chợ địa phương và ẩm thực đường phố",
      cancellationPolicy: "Demo booking: changes are free before confirmation.",
      catalogSnapshotId: DEMO_CATALOG_SNAPSHOT_ID,
      travelSnapshotId: DEMO_TRAVEL_SNAPSHOT_ID,
      fxSnapshotId: DEMO_FX_SNAPSHOT_ID,
      fxVndPerUsd: "25000.00000000",
      perPersonVndMinor: "480000",
      totalVndMinor: "480000",
      checkoutCurrency: "vnd",
      checkoutAmountMinor: "480000",
      partySize: 1,
      language: "en",
      meetingPoint: "Ben Thanh Market north gate",
      holdExpiresAt: "2026-08-29T00:00:00.000Z",
      createdAt: "2026-08-20T00:00:00.000Z",
      ownerUserId: "demo-user-customer",
      paymentStatus: "paid",
      assignedGuideUserId: "demo-user-guide",
      cancellationRequestId: null,
      specialNeeds: "Step-free route requested.",
      personalizedRequest: null,
    },
    {
      id: "demo-booking-cancellation",
      status: "confirmed",
      sourceKind: "departure",
      sourceId: "demo-departure-cancellation",
      tourVersionId: "demo-tour-version-history",
      quoteId: null,
      titleEn: "History and Memory",
      titleVi: "Lịch sử và ký ức",
      cancellationPolicy: "Demo booking: changes are free before confirmation.",
      catalogSnapshotId: DEMO_CATALOG_SNAPSHOT_ID,
      travelSnapshotId: DEMO_TRAVEL_SNAPSHOT_ID,
      fxSnapshotId: DEMO_FX_SNAPSHOT_ID,
      fxVndPerUsd: "25000.00000000",
      perPersonVndMinor: "420000",
      totalVndMinor: "420000",
      checkoutCurrency: "vnd",
      checkoutAmountMinor: "420000",
      partySize: 1,
      language: "en",
      meetingPoint: "War Remnants Museum entrance",
      holdExpiresAt: "2026-09-04T00:00:00.000Z",
      createdAt: "2026-08-21T00:00:00.000Z",
      ownerUserId: "demo-user-customer",
      paymentStatus: "paid",
      assignedGuideUserId: "demo-user-guide",
      cancellationRequestId: null,
      specialNeeds: null,
      personalizedRequest: null,
    },
    {
      id: "demo-booking-secondary-customer",
      status: "confirmed",
      sourceKind: "departure",
      sourceId: "demo-departure-secondary",
      tourVersionId: "demo-tour-version-markets",
      quoteId: null,
      titleEn: "Markets and Street Food",
      titleVi: "Chợ địa phương và ẩm thực đường phố",
      cancellationPolicy: "Demo booking: changes are free before confirmation.",
      catalogSnapshotId: DEMO_CATALOG_SNAPSHOT_ID,
      travelSnapshotId: DEMO_TRAVEL_SNAPSHOT_ID,
      fxSnapshotId: DEMO_FX_SNAPSHOT_ID,
      fxVndPerUsd: "25000.00000000",
      perPersonVndMinor: "480000",
      totalVndMinor: "960000",
      checkoutCurrency: "vnd",
      checkoutAmountMinor: "960000",
      partySize: 2,
      language: "vi",
      meetingPoint: "Ben Thanh Market north gate",
      holdExpiresAt: "2026-09-05T00:00:00.000Z",
      createdAt: "2026-08-22T00:00:00.000Z",
      ownerUserId: "demo-user-secondary-customer",
      paymentStatus: "paid",
      assignedGuideUserId: null,
      cancellationRequestId: null,
      specialNeeds: null,
      personalizedRequest: null,
    },
    {
      id: "demo-booking-personalized",
      status: "confirmed",
      sourceKind: "quote",
      sourceId: "demo-quote-personalized",
      tourVersionId: null,
      quoteId: "demo-quote-personalized",
      titleEn: "A Personal Saigon Day",
      titleVi: "Một ngày Sài Gòn theo sở thích",
      cancellationPolicy: "Demo quote: request changes through the administrator.",
      catalogSnapshotId: DEMO_CATALOG_SNAPSHOT_ID,
      travelSnapshotId: DEMO_TRAVEL_SNAPSHOT_ID,
      fxSnapshotId: DEMO_FX_SNAPSHOT_ID,
      fxVndPerUsd: "25000.00000000",
      perPersonVndMinor: null,
      totalVndMinor: "750000",
      checkoutCurrency: "vnd",
      checkoutAmountMinor: "750000",
      partySize: 1,
      language: "en",
      meetingPoint: "To be confirmed",
      holdExpiresAt: "2026-09-07T00:00:00.000Z",
      createdAt: "2026-08-23T00:00:00.000Z",
      ownerUserId: "demo-user-customer",
      paymentStatus: "paid",
      assignedGuideUserId: null,
      cancellationRequestId: null,
      specialNeeds: null,
      personalizedRequest: {
        id: "demo-request-personalized",
        planId: "demo-plan-personalized",
        revisionNo: 1,
        status: "pending_review",
        submittedAt: "2026-08-23T00:00:00.000Z",
        updatedAt: "2026-08-23T00:00:00.000Z",
        ownerUserId: "demo-user-customer",
        latestDecisionAt: null,
      },
    },
  ];
  const assignments: DemoAssignmentRecord[] = [
    {
      bookingId: "demo-booking-completed",
      assignedGuideUserId: "demo-user-guide",
      assignmentStatus: "assigned",
      specialNeeds: "Step-free route requested.",
    },
    {
      bookingId: "demo-booking-cancellation",
      assignedGuideUserId: "demo-user-guide",
      assignmentStatus: "assigned",
      specialNeeds: null,
    },
  ];

  return {
    version: PORTAL_DEMO_STORAGE_VERSION,
    users,
    bookings,
    cancellations: [],
    reviews: [],
    assignments,
    locations,
    fixedTours,
    departures,
  };
}

function toIdentity(user: DemoUserRecord): PortalIdentity {
  return {
    userId: user.userId,
    role: user.role,
    locale: user.language,
    displayName: user.displayName,
    email: user.email,
  };
}

function toDemoIdentity(user: DemoUserRecord): DemoPortalIdentity {
  return { ...toIdentity(user), demo: true };
}

function toCustomerAccount(user: DemoUserRecord): CustomerAccount {
  return {
    userId: user.userId,
    role: "customer",
    displayName: user.displayName,
    nationality: user.nationality,
    email: user.email,
    phone: user.phone,
    language: user.language,
  };
}

function toGuideProfile(user: DemoUserRecord): GuideProfile {
  return {
    userId: user.userId,
    role: "guide",
    displayName: user.displayName,
    email: user.email,
    phone: user.phone,
    bio: user.bio,
    language: user.language,
  };
}

function toAdminUser(user: DemoUserRecord): AdminUserProjection {
  return {
    userId: user.userId,
    role: user.role,
    displayName: user.displayName,
    email: user.email,
    phone: user.phone,
    language: user.language,
    active: true,
  };
}

function toCustomerBookingView(envelope: DemoEnvelope, booking: DemoBookingRecord): CustomerBookingView {
  const cancellationRequest = booking.cancellationRequestId === null
    ? null
    : envelope.cancellations.find((request) => request.id === booking.cancellationRequestId) ?? null;
  const review = envelope.reviews.find((entry) => entry.bookingId === booking.id) ?? null;
  return {
    ...toCustomerBooking(booking),
    paymentStatus: booking.paymentStatus,
    cancellationRequest: cancellationRequest === null ? null : clone(cancellationRequest),
    review: review === null ? null : clone(review),
  };
}

function toCustomerBooking(booking: DemoBookingRecord): CustomerBooking {
  return {
    id: booking.id,
    status: booking.status,
    sourceKind: booking.sourceKind,
    sourceId: booking.sourceId,
    tourVersionId: booking.tourVersionId,
    quoteId: booking.quoteId,
    titleEn: booking.titleEn,
    titleVi: booking.titleVi,
    cancellationPolicy: booking.cancellationPolicy,
    catalogSnapshotId: booking.catalogSnapshotId,
    travelSnapshotId: booking.travelSnapshotId,
    fxSnapshotId: booking.fxSnapshotId,
    fxVndPerUsd: booking.fxVndPerUsd,
    perPersonVndMinor: booking.perPersonVndMinor,
    totalVndMinor: booking.totalVndMinor,
    checkoutCurrency: booking.checkoutCurrency,
    checkoutAmountMinor: booking.checkoutAmountMinor,
    partySize: booking.partySize,
    language: booking.language,
    meetingPoint: booking.meetingPoint,
    holdExpiresAt: booking.holdExpiresAt,
    createdAt: booking.createdAt,
  };
}

function toAdminBooking(envelope: DemoEnvelope, booking: DemoBookingRecord): AdminBookingProjection {
  void envelope;
  return {
    ...toCustomerBooking(booking),
    ownerUserId: booking.ownerUserId,
    paymentStatus: booking.paymentStatus,
    assignedGuideUserId: booking.assignedGuideUserId,
    cancellationRequestId: booking.cancellationRequestId,
    specialNeeds: booking.specialNeeds,
  };
}

function toAdminRequest(booking: DemoBookingRecord): AdminPersonalizedRequestProjection {
  if (booking.personalizedRequest === null) {
    throw new Error("Cannot project a booking without a personalized request.");
  }
  const { ownerUserId, latestDecisionAt, ...request } = booking.personalizedRequest;
  return {
    ...request,
    ownerUserId,
    latestDecisionAt,
  };
}

function toGuideAssignment(
  envelope: DemoEnvelope,
  assignment: DemoAssignmentRecord,
  guide: DemoUserRecord,
): GuideAssignedTour {
  const booking = envelope.bookings.find((entry) => entry.id === assignment.bookingId);
  if (!booking || booking.tourVersionId === null || booking.sourceKind !== "departure") {
    throw new Error("Cannot project an invalid guide assignment.");
  }
  const departure = envelope.departures.find((entry) => entry.id === booking.sourceId);
  if (!departure) throw new Error("Cannot project an assignment without a departure.");
  return {
    bookingId: booking.id,
    tourVersionId: booking.tourVersionId,
    departureId: departure.id,
    title: guide.language === "vi" ? booking.titleVi : booking.titleEn,
    startAt: `${departure.date}T09:00:00+07:00`,
    endAt: `${departure.date}T12:00:00+07:00`,
    meetingPoint: booking.meetingPoint,
    partySize: booking.partySize,
    language: booking.language,
    mobilityFlags: assignment.specialNeeds === null ? [] : ["step_free"],
    dietaryFlags: [],
    assignmentStatus: assignment.assignmentStatus,
    specialNeeds: assignment.specialNeeds,
  };
}

function exactInput(value: unknown, fields: readonly string[], operation: string): Record<string, unknown> {
  if (!isRecord(value)) invalidInput(`${operation} input must be an object.`);
  const unknown = Object.keys(value).find((key) => !fields.includes(key));
  if (unknown !== undefined) invalidInput(`${operation} input has an unknown field: ${unknown}.`);
  const missing = fields.find((field) => !Object.prototype.hasOwnProperty.call(value, field));
  if (missing !== undefined) invalidInput(`${operation} input is missing ${missing}.`);
  return value;
}

function readValidatedCustomerAccountUpdate(input: unknown) {
  const result = validateCustomerAccountUpdate(input);
  if (!result.ok) invalidInput(result.error.messageKey);
  return result.value;
}

function readValidatedGuideProfileUpdate(input: unknown) {
  const result = validateGuideProfileUpdate(input);
  if (!result.ok) invalidInput(result.error.messageKey);
  return result.value;
}

function readValidatedCancellationRequest(input: unknown) {
  const result = validateCancellationRequestInput(input);
  if (!result.ok) invalidInput(result.error.messageKey);
  return result.value;
}

function readValidatedCancellationDecision(input: unknown) {
  const result = validateCancellationDecisionInput(input);
  if (!result.ok) invalidInput(result.error.messageKey);
  return result.value;
}

function readValidatedTourReview(input: unknown) {
  const result = validateTourReviewInput(input);
  if (!result.ok) invalidInput(result.error.messageKey);
  return result.value;
}

function readAdminRoleUpdate(input: unknown): { userId: string; role: Role } {
  const row = exactInput(input, ["userId", "role"], "updateUserRole");
  const userId = inputId(row.userId, "userId");
  if (typeof row.role !== "string" || !(ROLE_VALUES as readonly string[]).includes(row.role)) invalidInput("Invalid role.");
  return { userId, role: row.role as Role };
}

function readGuideAssignmentInput(input: unknown): { bookingId: string; guideUserId: string } {
  const row = exactInput(input, ["bookingId", "guideUserId"], "assignGuideToFixedDeparture");
  return {
    bookingId: inputId(row.bookingId, "bookingId"),
    guideUserId: inputId(row.guideUserId, "guideUserId"),
  };
}

function readPersonalizedReviewInput(input: unknown): {
  requestId: string;
  decision: Extract<RequestStatus, "changes_requested" | "approved" | "rejected">;
  note: string | null;
} {
  const row = exactInput(input, ["requestId", "decision", "note"], "reviewPersonalizedRequest");
  const requestId = inputId(row.requestId, "requestId");
  const decisions = ["changes_requested", "approved", "rejected"] as const;
  if (typeof row.decision !== "string" || !decisions.includes(row.decision as (typeof decisions)[number])) invalidInput("Invalid request decision.");
  const note = row.note === null ? null : inputText(row.note, "note", 1_000);
  return { requestId, decision: row.decision as (typeof decisions)[number], note };
}

export function createMemorySessionStorage(initial: Record<string, string> = {}): PortalSessionStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key: string): string | null {
      return values.has(key) ? values.get(key) ?? null : null;
    },
    setItem(key: string, value: string): void {
      values.set(key, value);
    },
    removeItem(key: string): void {
      values.delete(key);
    },
  };
}

export function createDemoPortalRepository(options: DemoPortalRepositoryOptions): DemoPortalRepository {
  const { storage } = options;
  const now = options.now ?? (() => new Date().toISOString());
  let sessionUserId: string | null = null;

  function readEnvelope(): DemoEnvelope {
    let raw: string | null;
    try {
      raw = storage.getItem(PORTAL_DEMO_STORAGE_KEY);
    } catch (error) {
      storageUnavailable("read", error);
    }
    if (raw === null) invalidStorage("root", "No demo fixture exists; call reset explicitly first");
    if (typeof raw !== "string") invalidStorage("root", "Storage returned a non-string value");
    return parseEnvelope(raw);
  }

  function writeEnvelope(envelope: DemoEnvelope): void {
    const payload = JSON.stringify(envelope);
    try {
      storage.setItem(PORTAL_DEMO_STORAGE_KEY, payload);
    } catch (error) {
      storageUnavailable("write", error);
    }
  }

  function timestamp(): string {
    const value = now();
    if (typeof value !== "string" || !TIMESTAMP_PATTERN.test(value) || !Number.isFinite(Date.parse(value))) {
      invalidInput("The injected demo clock must return an ISO timestamp.");
    }
    return value;
  }

  function currentActor(envelope: DemoEnvelope): DemoUserRecord {
    if (sessionUserId === null) unauthenticated();
    const user = envelope.users.find((entry) => entry.userId === sessionUserId);
    if (!user) invalidStorage("session", "Selected identity is not present in the fixture");
    return user;
  }

  function actorWithRole(envelope: DemoEnvelope, expectedRole: Role, operation: string): DemoUserRecord {
    const user = currentActor(envelope);
    if (user.role !== expectedRole) forbidden(user.role, operation);
    return user;
  }

  function findBooking(envelope: DemoEnvelope, bookingId: string): DemoBookingRecord {
    const booking = envelope.bookings.find((entry) => entry.id === bookingId);
    if (!booking) notFound("Booking", bookingId);
    return booking;
  }

  const engine = {
    async reset(): Promise<void> {
      const envelope = makeEnvelope(createFixtureBody());
      // Validate the generated fixture through the same fail-closed path used for reads.
      validateCrossReferences(envelope);
      if (digestBody(bodyForIntegrity(envelope)) !== envelope.integrity.digest) {
        throw new Error("Generated demo fixture integrity mismatch.");
      }
      writeEnvelope(envelope);
      sessionUserId = null;
    },

    async selectDemoIdentity(userId: string): Promise<DemoPortalIdentity> {
      const id = inputId(userId, "userId");
      const envelope = readEnvelope();
      const user = envelope.users.find((entry) => entry.userId === id);
      if (!user) notFound("Demo identity", id);
      sessionUserId = user.userId;
      return clone(toDemoIdentity(user));
    },

    async getSession(): Promise<PortalIdentity | null> {
      const envelope = readEnvelope();
      if (sessionUserId === null) return null;
      const user = currentActor(envelope);
      return clone(toIdentity(user));
    },

    async signOut(): Promise<void> {
      sessionUserId = null;
    },

    async getAccount(): Promise<CustomerAccount> {
      const envelope = readEnvelope();
      return clone(toCustomerAccount(actorWithRole(envelope, "customer", "getAccount")));
    },

    async updateAccount(input: unknown): Promise<CustomerAccount> {
      const update = readValidatedCustomerAccountUpdate(input);
      const envelope = readEnvelope();
      const actor = actorWithRole(envelope, "customer", "updateAccount");
      const user = envelope.users.find((entry) => entry.userId === actor.userId);
      if (!user) invalidStorage("users", "Current user disappeared from the fixture");
      if (update.displayName !== undefined) user.displayName = update.displayName;
      if (update.nationality !== undefined) user.nationality = update.nationality;
      if (update.email !== undefined) user.email = update.email;
      if (update.phone !== undefined) user.phone = update.phone;
      if (update.language !== undefined) user.language = update.language;
      writeEnvelope(makeEnvelope(bodyForIntegrity(envelope)));
      return clone(toCustomerAccount(user));
    },

    async listCustomerBookings(): Promise<CustomerBookingView[]> {
      const envelope = readEnvelope();
      const actor = actorWithRole(envelope, "customer", "listCustomerBookings");
      return clone(envelope.bookings
        .filter((booking) => booking.ownerUserId === actor.userId)
        .map((booking) => toCustomerBookingView(envelope, booking)));
    },

    async listCustomRequests(): Promise<CustomerCustomRequest[]> {
      const envelope = readEnvelope();
      const actor = actorWithRole(envelope, "customer", "listCustomRequests");
      return clone(envelope.bookings
        .filter((booking) => booking.ownerUserId === actor.userId && booking.personalizedRequest !== null)
        .map((booking) => {
          const request = booking.personalizedRequest!;
          return {
            id: request.id,
            planId: request.planId,
            revisionNo: request.revisionNo,
            status: request.status,
            submittedAt: request.submittedAt,
            updatedAt: request.updatedAt,
          };
        }));
    },

    async requestCancellation(input: unknown): Promise<CancellationRequest> {
      const requestInput = readValidatedCancellationRequest(input);
      const envelope = readEnvelope();
      const actor = actorWithRole(envelope, "customer", "requestCancellation");
      const booking = findBooking(envelope, requestInput.bookingId);
      if (booking.ownerUserId !== actor.userId) forbidden("customer", "requestCancellation for another customer");
      const hasPendingRequest = envelope.cancellations.some((request) => request.bookingId === booking.id && request.status === "pending");
      if (hasPendingRequest) conflict("A pending cancellation request already exists for this booking.");
      if (!isCancellableBookingStatus(booking.status)) {
        conflict("This booking cannot request cancellation in its current state.");
      }
      const request: DemoCancellationRecord = {
        id: `demo-cancellation-${envelope.cancellations.length + 1}`,
        bookingId: booking.id,
        customerUserId: actor.userId,
        reason: requestInput.reason,
        status: "pending",
        createdAt: timestamp(),
        decidedAt: null,
        decisionNote: null,
      };
      envelope.cancellations.push(request);
      booking.cancellationRequestId = request.id;
      writeEnvelope(makeEnvelope(bodyForIntegrity(envelope)));
      return clone(request);
    },

    async listOwnCancellationRequests(): Promise<CancellationRequest[]> {
      const envelope = readEnvelope();
      const actor = actorWithRole(envelope, "customer", "listOwnCancellationRequests");
      return clone(envelope.cancellations.filter((request) => request.customerUserId === actor.userId));
    },

    async submitTourReview(input: unknown): Promise<TourReview> {
      const reviewInput = readValidatedTourReview(input);
      const envelope = readEnvelope();
      const actor = actorWithRole(envelope, "customer", "submitTourReview");
      const booking = findBooking(envelope, reviewInput.bookingId);
      if (booking.ownerUserId !== actor.userId) forbidden("customer", "submitTourReview for another customer");
      if (booking.status !== "completed") conflict("Only completed bookings may receive a review.");
      if (envelope.reviews.some((review) => review.bookingId === booking.id)) conflict("A booking may receive only one review.");
      const review: DemoReviewRecord = {
        id: `demo-review-${envelope.reviews.length + 1}`,
        bookingId: booking.id,
        customerUserId: actor.userId,
        rating: reviewInput.rating,
        text: reviewInput.text,
        createdAt: timestamp(),
      };
      envelope.reviews.push(review);
      writeEnvelope(makeEnvelope(bodyForIntegrity(envelope)));
      return clone(review);
    },

    async listOwnReviews(): Promise<TourReview[]> {
      const envelope = readEnvelope();
      const actor = actorWithRole(envelope, "customer", "listOwnReviews");
      return clone(envelope.reviews.filter((review) => review.customerUserId === actor.userId));
    },

    async getGuideProfile(): Promise<GuideProfile> {
      const envelope = readEnvelope();
      return clone(toGuideProfile(actorWithRole(envelope, "guide", "getGuideProfile")));
    },

    async updateGuideProfile(input: unknown): Promise<GuideProfile> {
      const update = readValidatedGuideProfileUpdate(input);
      const envelope = readEnvelope();
      const actor = actorWithRole(envelope, "guide", "updateGuideProfile");
      const user = envelope.users.find((entry) => entry.userId === actor.userId);
      if (!user) invalidStorage("users", "Current guide disappeared from the fixture");
      if (update.displayName !== undefined) user.displayName = update.displayName;
      if (update.phone !== undefined) user.phone = update.phone;
      if (update.bio !== undefined) user.bio = update.bio;
      if (update.language !== undefined) user.language = update.language;
      writeEnvelope(makeEnvelope(bodyForIntegrity(envelope)));
      return clone(toGuideProfile(user));
    },

    async listAssignedTours(): Promise<GuideAssignedTour[]> {
      const envelope = readEnvelope();
      const actor = actorWithRole(envelope, "guide", "listAssignedTours");
      return clone(envelope.assignments
        .filter((assignment) => assignment.assignedGuideUserId === actor.userId)
        .map((assignment) => toGuideAssignment(envelope, assignment, actor)));
    },

    async getAssignedTour(bookingId: string): Promise<GuideAssignedTour> {
      const id = inputId(bookingId, "bookingId");
      const envelope = readEnvelope();
      const actor = actorWithRole(envelope, "guide", "getAssignedTour");
      const assignment = envelope.assignments.find((entry) => entry.bookingId === id && entry.assignedGuideUserId === actor.userId);
      if (!assignment) notFound("Assigned booking", id);
      return clone(toGuideAssignment(envelope, assignment, actor));
    },

    async listUsers(): Promise<AdminUserProjection[]> {
      const envelope = readEnvelope();
      actorWithRole(envelope, "admin", "listUsers");
      return clone(envelope.users.map(toAdminUser));
    },

    async updateUserRole(input: unknown): Promise<AdminUserProjection> {
      const roleInput = readAdminRoleUpdate(input);
      const envelope = readEnvelope();
      actorWithRole(envelope, "admin", "updateUserRole");
      const user = envelope.users.find((entry) => entry.userId === roleInput.userId);
      if (!user) notFound("User", roleInput.userId);
      if (user.role !== roleInput.role) {
        const currentRoleCount = envelope.users.filter((entry) => entry.role === user.role).length;
        if (currentRoleCount === 1) conflict(`The demo fixture must retain one ${user.role}.`);
      }
      const ownsBooking = envelope.bookings.some((booking) => booking.ownerUserId === user.userId);
      const hasAssignment = envelope.assignments.some((assignment) => assignment.assignedGuideUserId === user.userId);
      if (roleInput.role !== "customer" && ownsBooking) {
        conflict("A customer with bookings cannot change to a staff role in the demo fixture.");
      }
      if (roleInput.role !== "guide" && hasAssignment) {
        conflict("A guide with assignments cannot change to a non-guide role in the demo fixture.");
      }
      user.role = roleInput.role;
      if (user.role !== "guide") user.bio = null;
      if (user.role === "guide" && user.bio === null) user.bio = "A demo local guide.";
      writeEnvelope(makeEnvelope(bodyForIntegrity(envelope)));
      return clone(toAdminUser(user));
    },

    async listLocations(): Promise<AdminLocationProjection[]> {
      const envelope = readEnvelope();
      actorWithRole(envelope, "admin", "listLocations");
      return clone(envelope.locations);
    },

    async listFixedTours(): Promise<AdminFixedTourProjection[]> {
      const envelope = readEnvelope();
      actorWithRole(envelope, "admin", "listFixedTours");
      return clone(envelope.fixedTours);
    },

    async listDepartures(): Promise<AdminDepartureProjection[]> {
      const envelope = readEnvelope();
      actorWithRole(envelope, "admin", "listDepartures");
      return clone(envelope.departures);
    },

    async listPersonalizedRequests(): Promise<AdminPersonalizedRequestProjection[]> {
      const envelope = readEnvelope();
      actorWithRole(envelope, "admin", "listPersonalizedRequests");
      return clone(envelope.bookings.filter((booking) => booking.personalizedRequest !== null).map(toAdminRequest));
    },

    async reviewPersonalizedRequest(input: unknown): Promise<AdminPersonalizedRequestProjection> {
      const reviewInput = readPersonalizedReviewInput(input);
      const envelope = readEnvelope();
      actorWithRole(envelope, "admin", "reviewPersonalizedRequest");
      const booking = envelope.bookings.find((entry) => entry.personalizedRequest?.id === reviewInput.requestId);
      if (!booking || booking.personalizedRequest === null) notFound("Personalized request", reviewInput.requestId);
      if (booking.personalizedRequest.status !== "pending_review" && booking.personalizedRequest.status !== "changes_requested") {
        conflict("This personalized request is already in a terminal state.");
      }
      const changedAt = timestamp();
      booking.personalizedRequest.status = reviewInput.decision;
      booking.personalizedRequest.updatedAt = changedAt;
      booking.personalizedRequest.latestDecisionAt = changedAt;
      writeEnvelope(makeEnvelope(bodyForIntegrity(envelope)));
      return clone(toAdminRequest(booking));
    },

    async listCancellationRequests(): Promise<CancellationRequest[]> {
      const envelope = readEnvelope();
      actorWithRole(envelope, "admin", "listCancellationRequests");
      return clone(envelope.cancellations);
    },

    async decideCancellation(input: unknown): Promise<AdminCancellationDecision> {
      const decisionInput = readValidatedCancellationDecision(input);
      const envelope = readEnvelope();
      actorWithRole(envelope, "admin", "decideCancellation");
      const request = envelope.cancellations.find((entry) => entry.id === decisionInput.requestId);
      if (!request) notFound("Cancellation request", decisionInput.requestId);
      if (request.status !== "pending") conflict("This cancellation request has already been decided.");
      const booking = findBooking(envelope, request.bookingId);
      request.status = decisionInput.decision;
      request.decidedAt = timestamp();
      request.decisionNote = decisionInput.note;
      if (decisionInput.decision === "approved") booking.status = "cancelled";
      writeEnvelope(makeEnvelope(bodyForIntegrity(envelope)));
      return clone({ request, booking: toAdminBooking(envelope, booking) });
    },

    async listAdminBookings(): Promise<AdminBookingProjection[]> {
      const envelope = readEnvelope();
      actorWithRole(envelope, "admin", "listAdminBookings");
      return clone(envelope.bookings.map((booking) => toAdminBooking(envelope, booking)));
    },

    async assignGuideToFixedDeparture(input: unknown): Promise<GuideAssignedTour> {
      const assignmentInput = readGuideAssignmentInput(input);
      const envelope = readEnvelope();
      actorWithRole(envelope, "admin", "assignGuideToFixedDeparture");
      const booking = findBooking(envelope, assignmentInput.bookingId);
      const guide = envelope.users.find((user) => user.userId === assignmentInput.guideUserId);
      if (!guide) notFound("Guide", assignmentInput.guideUserId);
      if (guide.role !== "guide") conflict("Only a guide can receive an assignment.");
      if (booking.status !== "confirmed" || booking.sourceKind !== "departure") {
        conflict("Only a confirmed fixed-departure booking can be assigned.");
      }
      const departure = envelope.departures.find((entry) => entry.id === booking.sourceId);
      if (!departure || departure.status === "cancelled" || departure.status === "completed") {
        conflict("The booking departure is not assignable.");
      }
      const existing = envelope.assignments.find((entry) => entry.bookingId === booking.id);
      if (existing) {
        existing.assignedGuideUserId = guide.userId;
        existing.assignmentStatus = "assigned";
        existing.specialNeeds = booking.specialNeeds;
      } else {
        envelope.assignments.push({
          bookingId: booking.id,
          assignedGuideUserId: guide.userId,
          assignmentStatus: "assigned",
          specialNeeds: booking.specialNeeds,
        });
      }
      booking.assignedGuideUserId = guide.userId;
      writeEnvelope(makeEnvelope(bodyForIntegrity(envelope)));
      return clone(toGuideAssignment(envelope, envelope.assignments.find((entry) => entry.bookingId === booking.id)!, guide));
    },

    async getReport(): Promise<AdminReportProjection> {
      const envelope = readEnvelope();
      actorWithRole(envelope, "admin", "getReport");
      const report: AdminReportProjection = {
        generatedAt: REPORT_TIMESTAMP,
        userCount: envelope.users.length,
        customerCount: envelope.users.filter((user) => user.role === "customer").length,
        guideCount: envelope.users.filter((user) => user.role === "guide").length,
        adminCount: envelope.users.filter((user) => user.role === "admin").length,
        bookingCount: envelope.bookings.length,
        confirmedBookingCount: envelope.bookings.filter((booking) => booking.status === "confirmed").length,
        completedBookingCount: envelope.bookings.filter((booking) => booking.status === "completed").length,
        paidBookingCount: envelope.bookings.filter((booking) => booking.paymentStatus === "paid").length,
        pendingCancellationCount: envelope.cancellations.filter((request) => request.status === "pending").length,
        simulated: true,
      };
      return clone(report);
    },
  };

  const session: DemoSessionPort = {
    selectDemoIdentity: engine.selectDemoIdentity,
    getSession: engine.getSession,
    signOut: engine.signOut,
  };
  const customerAccount: CustomerAccountPort = {
    getAccount: engine.getAccount,
    updateAccount: engine.updateAccount,
    listCustomerBookings: engine.listCustomerBookings,
    listCustomRequests: engine.listCustomRequests,
  };
  const customerCancellations: CustomerCancellationPort = {
    requestCancellation: engine.requestCancellation,
    listOwnCancellationRequests: engine.listOwnCancellationRequests,
  };
  const customerReviews: CustomerTourReviewPort = {
    submitTourReview: engine.submitTourReview,
    listOwnReviews: engine.listOwnReviews,
  };
  const guideProfile: GuideProfilePort = {
    getGuideProfile: engine.getGuideProfile,
    updateGuideProfile: engine.updateGuideProfile,
  };
  const guideAssignments: GuideAssignmentPort = {
    listAssignedTours: engine.listAssignedTours,
    getAssignedTour: engine.getAssignedTour,
  };
  const admin: AdminPortalPorts = {
    users: {
      listUsers: engine.listUsers,
      updateUserRole: engine.updateUserRole,
    },
    catalog: {
      listLocations: engine.listLocations,
      listFixedTours: engine.listFixedTours,
      listDepartures: engine.listDepartures,
    },
    personalizedRequests: {
      listPersonalizedRequests: engine.listPersonalizedRequests,
      reviewPersonalizedRequest: engine.reviewPersonalizedRequest,
    },
    bookings: {
      listAdminBookings: engine.listAdminBookings,
    },
    cancellations: {
      listCancellationRequests: engine.listCancellationRequests,
      decideCancellation: engine.decideCancellation,
    },
    assignments: {
      assignGuideToFixedDeparture: engine.assignGuideToFixedDeparture,
    },
    reporting: {
      getReport: engine.getReport,
    },
  };
  const customer: CustomerPortalPorts = {
    account: customerAccount,
    cancellations: customerCancellations,
    reviews: customerReviews,
  };
  const guide: GuidePortalPorts = {
    profile: guideProfile,
    assignments: guideAssignments,
  };
  return {
    reset: engine.reset,
    session,
    customer,
    guide,
    admin,
  };
}
