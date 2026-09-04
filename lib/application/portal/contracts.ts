import {
  BOOKING_STATUS_VALUES,
  LOCALE_VALUES,
  ROLE_VALUES,
} from "@/lib/domain/data/contracts";
import type {
  AssignmentStatus,
  BookingStatus,
  CustomerBooking,
  CustomerCustomRequest,
  DepartureStatus,
  GuideAssignedBooking,
  Locale,
  PaymentStatus,
  PlaceStatus,
  RequestStatus,
  Role,
  Result,
  TourStatus,
} from "@/lib/domain/data/contracts";
import type { DemoPlannerRevision } from "@/lib/application/planner/demo-planner";

export type PortalMode = "demo" | "production";

export const CANCELLATION_REASON_CODES = Object.freeze([
  "trip_plan_changed",
  "wrong_tour_or_departure",
  "booking_details_change",
  "tour_details_unsuitable",
  "price_unsuitable",
  "payment_unavailable",
  "other",
] as const);
export type CancellationReasonCode = (typeof CANCELLATION_REASON_CODES)[number];

export interface CancelBookingInput {
  bookingId: string;
  reasonCode: CancellationReasonCode | null;
  otherReason: string | null;
  idempotencyKey: string;
}

export interface BookingCancellation {
  id: string;
  bookingId: string;
  customerUserId: string;
  sourceKind: CustomerBooking["sourceKind"];
  reasonCode: CancellationReasonCode | null;
  otherReason: string | null;
  idempotencyKey: string;
  cancelledAt: string;
}

export interface AdminBookingManagementProjection {
  bookingId: string;
  customerUserId: string;
  sourceKind: CustomerBooking["sourceKind"];
  titleEn: string;
  titleVi: string;
  bookingStatus: BookingStatus;
  createdAt: string;
  cancellation: BookingCancellation | null;
}

export interface CancelBookingResult {
  cancellation: BookingCancellation;
  bookingStatus: "cancelled";
  state: "created" | "replayed";
}

export type PortalErrorCode =
  | "INVALID_INPUT"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_STORAGE"
  | "STORAGE_UNAVAILABLE"
  | "PRODUCTION_CONFIGURATION";

export class PortalError extends Error {
  readonly code: PortalErrorCode;

  constructor(code: PortalErrorCode, message: string) {
    super(message);
    this.name = "PortalError";
    this.code = code;
  }
}

export interface PortalValidationError {
  code: "INVALID_INPUT";
  messageKey: string;
  fieldPath?: string;
}

export type PortalValidationResult<T> = Result<T, PortalValidationError>;

export interface TourReviewInput {
  bookingId: string;
  rating: number;
  text: string;
}

const PROFILE_TEXT_CONTROL = /[\u0000-\u001F\u007F-\u009F]/;
const PORTAL_ID = /^[a-z0-9][a-z0-9-]{0,119}$/;
const PORTAL_IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;
const PORTAL_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const PORTAL_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PORTAL_NATIONALITY = /^\p{L}(?:[\p{L} .'-]*\p{L})?$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidInput(fieldPath: string, messageKey = "portal.input.invalid"): PortalValidationResult<never> {
  return { ok: false, error: { code: "INVALID_INPUT", messageKey, fieldPath } };
}

function exactInput(value: unknown, fields: readonly string[]): PortalValidationResult<Record<string, unknown>> {
  if (!isRecord(value)) return invalidInput("input", "portal.input.shape");
  const unknown = Object.keys(value).find((key) => !fields.includes(key));
  if (unknown !== undefined) return invalidInput(`input.${unknown}`, "portal.input.unknown_field");
  if (Object.keys(value).length === 0) return invalidInput("input", "portal.input.empty");
  return { ok: true, value };
}

function safeId(value: unknown, fieldPath: string): PortalValidationResult<string> {
  return typeof value === "string" && PORTAL_ID.test(value)
    ? { ok: true, value }
    : invalidInput(fieldPath, "portal.input.id");
}

function safeIdempotencyKey(value: unknown, fieldPath: string): PortalValidationResult<string> {
  return typeof value === "string" && PORTAL_IDEMPOTENCY_KEY.test(value)
    ? { ok: true, value }
    : invalidInput(fieldPath, "portal.input.idempotency_key");
}

function safeTimestamp(value: unknown, fieldPath: string): PortalValidationResult<string> {
  const parsed = typeof value === "string" && PORTAL_UTC_TIMESTAMP.test(value) ? Date.parse(value) : Number.NaN;
  return typeof value === "string" && Number.isFinite(parsed) && new Date(parsed).toISOString() === value
    ? { ok: true, value }
    : invalidInput(fieldPath, "portal.input.timestamp");
}

function isCancellationReasonCode(value: unknown): value is CancellationReasonCode {
  return typeof value === "string" && (CANCELLATION_REASON_CODES as readonly string[]).includes(value);
}

function validateCancellationReasonPair(
  reasonCode: unknown,
  otherReason: unknown,
  root: string,
): PortalValidationResult<Pick<CancelBookingInput, "reasonCode" | "otherReason">> {
  if (reasonCode === null) {
    return otherReason === null
      ? { ok: true, value: { reasonCode: null, otherReason: null } }
      : invalidInput(`${root}.otherReason`, "portal.cancellation.reason_pair");
  }
  if (!isCancellationReasonCode(reasonCode)) {
    return invalidInput(`${root}.reasonCode`, "portal.cancellation.reason_code");
  }
  if (reasonCode !== "other") {
    return otherReason === null
      ? { ok: true, value: { reasonCode, otherReason: null } }
      : invalidInput(`${root}.otherReason`, "portal.cancellation.reason_pair");
  }
  if (
    typeof otherReason !== "string" ||
    otherReason.length < 3 ||
    otherReason.length > 500 ||
    otherReason !== otherReason.trim() ||
    PROFILE_TEXT_CONTROL.test(otherReason)
  ) {
    return invalidInput(`${root}.otherReason`, "portal.cancellation.other_reason");
  }
  return { ok: true, value: { reasonCode, otherReason } };
}

function safeText(value: unknown, fieldPath: string, maximum: number, allowNull = false): PortalValidationResult<string | null> {
  if (allowNull && value === null) return { ok: true, value: null };
  return typeof value === "string" && value.length >= 1 && value.length <= maximum &&
    value === value.trim() && !PROFILE_TEXT_CONTROL.test(value)
    ? { ok: true, value }
    : invalidInput(fieldPath, "portal.input.text");
}

function safeLocale(value: unknown, fieldPath: string): PortalValidationResult<Locale> {
  return typeof value === "string" && (LOCALE_VALUES as readonly string[]).includes(value)
    ? { ok: true, value: value as Locale }
    : invalidInput(fieldPath, "portal.input.locale");
}

function safeEmail(value: unknown, fieldPath: string): PortalValidationResult<string> {
  return typeof value === "string" && value.length >= 3 && value.length <= 254 &&
    value === value.trim() && !PROFILE_TEXT_CONTROL.test(value) && PORTAL_EMAIL.test(value)
    ? { ok: true, value }
    : invalidInput(fieldPath, "portal.input.email");
}

function safeNationality(value: unknown, fieldPath: string): PortalValidationResult<string> {
  return typeof value === "string" && value.length >= 1 && value.length <= 80 &&
    value === value.trim() && !PROFILE_TEXT_CONTROL.test(value) && PORTAL_NATIONALITY.test(value)
    ? { ok: true, value }
    : invalidInput(fieldPath, "portal.input.nationality");
}

function validateProfileUpdate(
  input: unknown,
  fields: readonly string[],
  includeBio: boolean,
): PortalValidationResult<CustomerAccountUpdate | GuideProfileUpdate> {
  const exact = exactInput(input, fields);
  if (!exact.ok) return exact;
  const result: CustomerAccountUpdate & GuideProfileUpdate = {};
  if (Object.prototype.hasOwnProperty.call(exact.value, "displayName")) {
    const displayName = safeText(exact.value.displayName, "input.displayName", 80);
    if (!displayName.ok || displayName.value === null) return displayName as PortalValidationResult<never>;
    result.displayName = displayName.value;
  }
  if (Object.prototype.hasOwnProperty.call(exact.value, "phone")) {
    const phone = safeText(exact.value.phone, "input.phone", 32, true);
    if (!phone.ok) return phone;
    result.phone = phone.value;
  }
  if (Object.prototype.hasOwnProperty.call(exact.value, "language")) {
    const language = safeLocale(exact.value.language, "input.language");
    if (!language.ok) return language;
    result.language = language.value;
  }
  if (includeBio && Object.prototype.hasOwnProperty.call(exact.value, "bio")) {
    const bio = safeText(exact.value.bio, "input.bio", 1000, true);
    if (!bio.ok) return bio;
    result.bio = bio.value;
  }
  return { ok: true, value: result };
}

export function validateCustomerAccountUpdate(input: unknown): PortalValidationResult<CustomerAccountUpdate> {
  const exact = exactInput(input, ["displayName", "nationality", "email", "phone", "language"]);
  if (!exact.ok) return exact;
  const result: CustomerAccountUpdate = {};
  if (Object.prototype.hasOwnProperty.call(exact.value, "displayName")) {
    const displayName = safeText(exact.value.displayName, "input.displayName", 80);
    if (!displayName.ok || displayName.value === null) return displayName as PortalValidationResult<never>;
    result.displayName = displayName.value;
  }
  if (Object.prototype.hasOwnProperty.call(exact.value, "nationality")) {
    const nationality = safeNationality(exact.value.nationality, "input.nationality");
    if (!nationality.ok) return nationality;
    result.nationality = nationality.value;
  }
  if (Object.prototype.hasOwnProperty.call(exact.value, "email")) {
    const email = safeEmail(exact.value.email, "input.email");
    if (!email.ok) return email;
    result.email = email.value;
  }
  if (Object.prototype.hasOwnProperty.call(exact.value, "phone")) {
    const phone = safeText(exact.value.phone, "input.phone", 32, true);
    if (!phone.ok) return phone;
    result.phone = phone.value;
  }
  if (Object.prototype.hasOwnProperty.call(exact.value, "language")) {
    const language = safeLocale(exact.value.language, "input.language");
    if (!language.ok) return language;
    result.language = language.value;
  }
  return { ok: true, value: result };
}

export function validateGuideProfileUpdate(input: unknown): PortalValidationResult<GuideProfileUpdate> {
  return validateProfileUpdate(input, ["displayName", "phone", "bio", "language"], true) as PortalValidationResult<GuideProfileUpdate>;
}

export function validateTourReviewInput(input: unknown): PortalValidationResult<TourReviewInput> {
  const exact = exactInput(input, ["bookingId", "rating", "text"]);
  if (!exact.ok) return exact;
  const bookingId = safeId(exact.value.bookingId, "input.bookingId");
  if (!bookingId.ok) return bookingId;
  if (typeof exact.value.rating !== "number" || !Number.isSafeInteger(exact.value.rating) || exact.value.rating < 1 || exact.value.rating > 5) {
    return invalidInput("input.rating", "portal.review.rating");
  }
  const text = safeText(exact.value.text, "input.text", 1000);
  if (!text.ok || text.value === null) return text as PortalValidationResult<never>;
  return { ok: true, value: { bookingId: bookingId.value, rating: exact.value.rating, text: text.value } };
}

export function validateCancelBookingInput(input: unknown): PortalValidationResult<CancelBookingInput> {
  const exact = exactInput(input, ["bookingId", "reasonCode", "otherReason", "idempotencyKey"]);
  if (!exact.ok) return exact;
  const bookingId = safeId(exact.value.bookingId, "input.bookingId");
  if (!bookingId.ok) return bookingId;
  const reason = validateCancellationReasonPair(exact.value.reasonCode, exact.value.otherReason, "input");
  if (!reason.ok) return reason;
  const idempotencyKey = safeIdempotencyKey(exact.value.idempotencyKey, "input.idempotencyKey");
  if (!idempotencyKey.ok) return idempotencyKey;
  return {
    ok: true,
    value: {
      bookingId: bookingId.value,
      reasonCode: reason.value.reasonCode,
      otherReason: reason.value.otherReason,
      idempotencyKey: idempotencyKey.value,
    },
  };
}

export function parseBookingCancellation(input: unknown): PortalValidationResult<BookingCancellation> {
  const exact = exactInput(input, [
    "id", "bookingId", "customerUserId", "sourceKind", "reasonCode", "otherReason", "idempotencyKey", "cancelledAt",
  ]);
  if (!exact.ok) return exact;
  const id = safeId(exact.value.id, "input.id");
  if (!id.ok) return id;
  const bookingId = safeId(exact.value.bookingId, "input.bookingId");
  if (!bookingId.ok) return bookingId;
  const customerUserId = safeId(exact.value.customerUserId, "input.customerUserId");
  if (!customerUserId.ok) return customerUserId;
  if (exact.value.sourceKind !== "departure" && exact.value.sourceKind !== "quote") {
    return invalidInput("input.sourceKind", "portal.cancellation.source_kind");
  }
  const reason = validateCancellationReasonPair(exact.value.reasonCode, exact.value.otherReason, "input");
  if (!reason.ok) return reason;
  const idempotencyKey = safeIdempotencyKey(exact.value.idempotencyKey, "input.idempotencyKey");
  if (!idempotencyKey.ok) return idempotencyKey;
  const cancelledAt = safeTimestamp(exact.value.cancelledAt, "input.cancelledAt");
  if (!cancelledAt.ok) return cancelledAt;
  return {
    ok: true,
    value: {
      id: id.value,
      bookingId: bookingId.value,
      customerUserId: customerUserId.value,
      sourceKind: exact.value.sourceKind,
      reasonCode: reason.value.reasonCode,
      otherReason: reason.value.otherReason,
      idempotencyKey: idempotencyKey.value,
      cancelledAt: cancelledAt.value,
    },
  };
}

export function parseAdminBookingManagementProjection(
  input: unknown,
): PortalValidationResult<AdminBookingManagementProjection> {
  const exact = exactInput(input, [
    "bookingId", "customerUserId", "sourceKind", "titleEn", "titleVi", "bookingStatus", "createdAt", "cancellation",
  ]);
  if (!exact.ok) return exact;
  const bookingId = safeId(exact.value.bookingId, "input.bookingId");
  if (!bookingId.ok) return bookingId;
  const customerUserId = safeId(exact.value.customerUserId, "input.customerUserId");
  if (!customerUserId.ok) return customerUserId;
  if (exact.value.sourceKind !== "departure" && exact.value.sourceKind !== "quote") {
    return invalidInput("input.sourceKind", "portal.booking.source_kind");
  }
  const titleEn = safeText(exact.value.titleEn, "input.titleEn", 240);
  if (!titleEn.ok || titleEn.value === null) return titleEn as PortalValidationResult<never>;
  const titleVi = safeText(exact.value.titleVi, "input.titleVi", 240);
  if (!titleVi.ok || titleVi.value === null) return titleVi as PortalValidationResult<never>;
  if (
    typeof exact.value.bookingStatus !== "string" ||
    !(BOOKING_STATUS_VALUES as readonly string[]).includes(exact.value.bookingStatus)
  ) {
    return invalidInput("input.bookingStatus", "portal.booking.status");
  }
  const createdAt = safeTimestamp(exact.value.createdAt, "input.createdAt");
  if (!createdAt.ok) return createdAt;

  let cancellation: BookingCancellation | null = null;
  if (exact.value.cancellation !== null) {
    const parsedCancellation = parseBookingCancellation(exact.value.cancellation);
    if (!parsedCancellation.ok) return parsedCancellation;
    if (
      parsedCancellation.value.bookingId !== bookingId.value ||
      parsedCancellation.value.customerUserId !== customerUserId.value ||
      parsedCancellation.value.sourceKind !== exact.value.sourceKind ||
      exact.value.bookingStatus !== "cancelled"
    ) {
      return invalidInput("input.cancellation", "portal.booking.cancellation_consistency");
    }
    cancellation = parsedCancellation.value;
  }

  return {
    ok: true,
    value: {
      bookingId: bookingId.value,
      customerUserId: customerUserId.value,
      sourceKind: exact.value.sourceKind,
      titleEn: titleEn.value,
      titleVi: titleVi.value,
      bookingStatus: exact.value.bookingStatus as BookingStatus,
      createdAt: createdAt.value,
      cancellation,
    },
  };
}

export function parseCancelBookingResult(input: unknown): PortalValidationResult<CancelBookingResult> {
  const exact = exactInput(input, ["cancellation", "bookingStatus", "state"]);
  if (!exact.ok) return exact;
  const cancellation = parseBookingCancellation(exact.value.cancellation);
  if (!cancellation.ok) return cancellation;
  if (exact.value.bookingStatus !== "cancelled") {
    return invalidInput("input.bookingStatus", "portal.cancellation.booking_status");
  }
  if (exact.value.state !== "created" && exact.value.state !== "replayed") {
    return invalidInput("input.state", "portal.cancellation.state");
  }
  return {
    ok: true,
    value: {
      cancellation: cancellation.value,
      bookingStatus: "cancelled",
      state: exact.value.state,
    },
  };
}

export type PortalCapability =
  | "customer_profile_read"
  | "customer_profile_update"
  | "customer_booking_cancel"
  | "customer_review_submit"
  | "guide_profile_read"
  | "guide_profile_update"
  | "guide_assignments_read"
  | "admin_users_read"
  | "admin_users_role_update"
  | "admin_catalog_read"
  | "admin_requests_read"
  | "admin_requests_review"
  | "admin_bookings_read"
  | "admin_cancellation_read"
  | "admin_fixed_departure_assign"
  | "admin_reporting_read";

export const ROLE_CAPABILITIES: Readonly<Record<Role, readonly PortalCapability[]>> = Object.freeze({
  customer: Object.freeze(["customer_profile_read", "customer_profile_update", "customer_booking_cancel", "customer_review_submit"] as const) as readonly PortalCapability[],
  guide: Object.freeze(["guide_profile_read", "guide_profile_update", "guide_assignments_read"] as const) as readonly PortalCapability[],
  admin: Object.freeze([
    "admin_users_read", "admin_users_role_update", "admin_catalog_read", "admin_requests_read",
    "admin_requests_review", "admin_bookings_read", "admin_cancellation_read",
    "admin_fixed_departure_assign", "admin_reporting_read",
  ] as const) as readonly PortalCapability[],
} as const);

export function hasRoleCapability(role: unknown, capability: unknown): boolean {
  return typeof role === "string" && (ROLE_VALUES as readonly string[]).includes(role) &&
    typeof capability === "string" && ROLE_CAPABILITIES[role as Role].includes(capability as PortalCapability);
}

export const canUsePortalCapability = hasRoleCapability;

export interface TourReviewEligibilityInput {
  actorUserId: string;
  bookingOwnerUserId: string;
  bookingStatus: BookingStatus;
  hasExistingReview: boolean;
}

export function isTourReviewEligible(input: unknown): input is TourReviewEligibilityInput {
  if (!isRecord(input)) return false;
  return typeof input.actorUserId === "string" && input.actorUserId.length > 0 &&
    typeof input.bookingOwnerUserId === "string" && input.bookingOwnerUserId.length > 0 &&
    input.actorUserId === input.bookingOwnerUserId && input.bookingStatus === "completed" &&
    input.hasExistingReview === false;
}

export const canSubmitTourReview = isTourReviewEligible;

export interface CancelBookingEligibilityInput {
  actorRole: Role;
  actorUserId: string;
  bookingOwnerUserId: string;
  bookingStatus: BookingStatus;
}

export function canCancelBooking(input: unknown): input is CancelBookingEligibilityInput {
  if (!isRecord(input)) return false;
  return input.actorRole === "customer" &&
    typeof input.actorUserId === "string" && input.actorUserId.length > 0 &&
    typeof input.bookingOwnerUserId === "string" && input.actorUserId === input.bookingOwnerUserId &&
    (BOOKING_STATUS_VALUES as readonly string[]).includes(input.bookingStatus as string) &&
    input.bookingStatus === "pending_payment";
}

export interface GuideAssignmentVisibilityInput {
  actorRole: Role;
  actorUserId: string;
  assignedGuideUserId: string;
  assignmentStatus?: AssignmentStatus;
}

export function canViewGuideAssignment(input: unknown): input is GuideAssignmentVisibilityInput {
  if (!isRecord(input)) return false;
  return input.actorRole === "guide" && typeof input.actorUserId === "string" &&
    typeof input.assignedGuideUserId === "string" && input.actorUserId.length > 0 &&
    input.actorUserId === input.assignedGuideUserId;
}

export const canGuideViewAssignedTour = canViewGuideAssignment;

export interface PortalIdentityCore {
  userId: string;
  role: Role;
  locale: Locale;
  displayName: string;
  email: string;
}

export interface PortalIdentity extends PortalIdentityCore {
  /** Production sessions can never carry the deterministic demo marker. */
  demo?: never;
}

export interface DemoPortalIdentity extends PortalIdentityCore {
  demo: true;
}

export interface PortalSessionCore {
  signOut(): Promise<void>;
}

export interface PortalSessionPort extends PortalSessionCore {
  getSession(): Promise<PortalIdentity | null>;
  /** Production composition must reject any session exposing the demo selector. */
  selectDemoIdentity?: never;
}

export interface RuntimeSessionPort extends PortalSessionPort {
  signInWithPassword(input: { email: string; password: string }): Promise<PortalIdentity>;
}

export interface DemoSessionPort extends PortalSessionCore {
  getSession(): Promise<DemoPortalIdentity | null>;
  selectDemoIdentity(userId: string): Promise<DemoPortalIdentity>;
}
export type SessionPort = PortalSessionPort;

export interface CustomerAccount {
  userId: string;
  role: "customer";
  /** The customer's full name; retained as displayName for the existing domain vocabulary. */
  displayName: string;
  nationality: string;
  email: string;
  phone: string | null;
  language: Locale;
}

export interface CustomerAccountUpdate {
  displayName?: string;
  nationality?: string;
  email?: string;
  phone?: string | null;
  language?: Locale;
}

export interface TourReview {
  id: string;
  bookingId: string;
  customerUserId: string;
  rating: number;
  text: string;
  createdAt: string;
}

/** Customer-facing booking projection; private owner/assignment fields are omitted. */
export interface CustomerBookingView extends CustomerBooking {
  paymentStatus: PaymentStatus | null;
  /** Persisted only for personalized demo quotes; null for fixed bookings. */
  quoteAcceptedAt: string | null;
  cancellation: BookingCancellation | null;
  review: TourReview | null;
}

export interface CustomerBookingPort {
  listCustomerBookings(): Promise<CustomerBookingView[]>;
}

export type CustomerBookingsPort = CustomerBookingPort;

export interface CustomerAccountPort extends CustomerBookingPort {
  getAccount(): Promise<CustomerAccount>;
  updateAccount(input: CustomerAccountUpdate): Promise<CustomerAccount>;
  listCustomRequests(): Promise<CustomerCustomRequest[]>;
}

export interface CustomerCancellationPort {
  cancelBooking(input: CancelBookingInput): Promise<CancelBookingResult>;
}

export interface CustomerTourReviewPort {
  submitTourReview(input: TourReviewInput): Promise<TourReview>;
  listOwnReviews(): Promise<TourReview[]>;
}

export interface GuideProfile {
  userId: string;
  role: "guide";
  displayName: string;
  email: string;
  phone: string | null;
  bio: string | null;
  language: Locale;
}

export interface GuideProfileUpdate {
  displayName?: string;
  phone?: string | null;
  bio?: string | null;
  language?: Locale;
}

/** Extends the existing assignment projection with guide/admin-only special needs. */
export type GuideAssignedTour = GuideAssignedBooking & {
  /** Catalog duration is an estimate; it must not be used as a confirmed end time. */
  catalogDurationMinutes?: number;
  specialNeeds: string | null;
  /** A cancelled booking is never projected as an active guide assignment. */
  cancellationStatus: "cancelled" | null;
};

export interface GuideProfilePort {
  getGuideProfile(): Promise<GuideProfile>;
  updateGuideProfile(input: GuideProfileUpdate): Promise<GuideProfile>;
}

export interface GuideAssignmentPort {
  listAssignedTours(): Promise<GuideAssignedTour[]>;
  getAssignedTour(bookingId: string): Promise<GuideAssignedTour>;
}

export interface AdminUserProjection {
  userId: string;
  role: Role;
  displayName: string;
  email: string;
  phone: string | null;
  language: Locale;
  active: true;
}

export interface AdminUsersPort {
  listUsers(): Promise<AdminUserProjection[]>;
  updateUserRole(input: { userId: string; role: Role }): Promise<AdminUserProjection>;
}

export interface AdminLocationProjection {
  id: string;
  slug: string;
  locale: Locale;
  title: string;
  status: PlaceStatus;
}

export interface AdminFixedTourProjection {
  id: string;
  versionId: string;
  slug: string;
  locale: Locale;
  title: string;
  status: TourStatus;
}

export interface AdminDepartureProjection {
  id: string;
  tourVersionId: string;
  date: string;
  status: DepartureStatus;
  /** Authoritative departure start persisted by the demo/catalog seam. */
  startsAt: string;
  /** End time is optional until the catalog supplies one. */
  endAt: string | null;
}

export interface AdminCatalogPort {
  listLocations(): Promise<AdminLocationProjection[]>;
  listFixedTours(): Promise<AdminFixedTourProjection[]>;
  listDepartures(): Promise<AdminDepartureProjection[]>;
}

export type AdminRequestDecision = Extract<RequestStatus, "changes_requested" | "approved" | "rejected">;

export type AdminPersonalizedRequestProjection = CustomerCustomRequest & {
  ownerUserId: string;
  latestDecisionAt: string | null;
  locale: Locale;
  partySize: number;
  requestedTotalVndMinor: string;
  specialNeeds: string | null;
  confirmedRevisionFingerprint: string;
  confirmedRevisionSnapshot: DemoPlannerRevision;
};

export interface AdminPersonalizedRequestsPort {
  listPersonalizedRequests(): Promise<AdminPersonalizedRequestProjection[]>;
  reviewPersonalizedRequest(input: {
    requestId: string;
    decision: AdminRequestDecision;
    note: string | null;
  }): Promise<AdminPersonalizedRequestProjection>;
}

/** Admin-only demo operation that issues a quote from the seeded demo facts. */
export interface AdminPersonalizedQuoteInput {
  requestId: string;
}

export interface AdminPersonalizedQuoteProjection {
  quoteId: string;
  requestId: string;
  bookingId: string;
  amountVndMinor: string;
  titleEn: string;
  titleVi: string;
  policy: string;
  issuedAt: string;
  expiresAt: string;
  acceptedAt: string | null;
}

export interface AdminPersonalizedQuotesPort {
  issueDemoQuote(input: AdminPersonalizedQuoteInput): Promise<AdminPersonalizedQuoteProjection>;
}

export interface AdminBookingProjection extends CustomerBooking {
  ownerUserId: string;
  paymentStatus: PaymentStatus | null;
  assignedGuideUserId: string | null;
  cancellation: BookingCancellation | null;
  specialNeeds: string | null;
}

export interface AdminBookingsPort {
  listAdminBookings(): Promise<AdminBookingProjection[]>;
}
export type AdminBookingPort = AdminBookingsPort;

export interface AdminGuideAssignmentPort {
  assignGuideToFixedDeparture(input: { bookingId: string; guideUserId: string }): Promise<GuideAssignedTour>;
}

export interface AdminReportProjection {
  generatedAt: string;
  userCount: number;
  customerCount: number;
  guideCount: number;
  adminCount: number;
  bookingCount: number;
  confirmedBookingCount: number;
  completedBookingCount: number;
  paidBookingCount: number;
  simulated: true;
}

export interface AdminReportingPort {
  getReport(): Promise<AdminReportProjection>;
}

/** Groups each actor's small ports without introducing a service locator. */
export interface CustomerPortalPorts {
  account: CustomerAccountPort;
  cancellations: CustomerCancellationPort;
  reviews: CustomerTourReviewPort;
}

export interface GuidePortalPorts {
  profile: GuideProfilePort;
  assignments: GuideAssignmentPort;
}

export interface AdminPortalPorts {
  users: AdminUsersPort;
  catalog: AdminCatalogPort;
  personalizedRequests: AdminPersonalizedRequestsPort;
  bookings: AdminBookingsPort;
  assignments: AdminGuideAssignmentPort;
  reporting: AdminReportingPort;
}

export interface PortalPortBindings {
  session: PortalSessionPort;
  customer: CustomerPortalPorts;
  guide: GuidePortalPorts;
  admin: AdminPortalPorts;
}

/** Metadata only: these capabilities are not claimed as production implementations. */
export const PORTAL_PRODUCTION_GAP = Object.freeze({
  tourReview: "Tour review still requires production migration/RPC/RLS.",
  profile: "Customer and guide profile updates still require production migration/RPC/RLS.",
  adminCrud: "Administrator CRUD still requires production migration/RPC/RLS.",
  personalizedTourGuideAssignment: "Personalized-tour guide assignment is not supported by the current production RPC.",
} as const);

export const PORTAL_PRODUCTION_STATUS = PORTAL_PRODUCTION_GAP;
