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

export type PortalMode = "demo" | "production";

/** State for a cancellation request; booking status remains a domain status. */
export type CancellationStatus = "pending" | "approved" | "rejected";
export type CancellationDecision = Exclude<CancellationStatus, "pending">;

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

export interface CancellationRequestInput {
  bookingId: string;
  reason: string;
}

export interface CancellationDecisionInput {
  requestId: string;
  decision: CancellationDecision;
  note: string | null;
}

const PROFILE_TEXT_CONTROL = /[\u0000-\u001F\u007F-\u009F]/;
const PORTAL_ID = /^[a-z0-9][a-z0-9-]{0,119}$/;

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
  return validateProfileUpdate(input, ["displayName", "phone", "language"], false) as PortalValidationResult<CustomerAccountUpdate>;
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

export function validateCancellationRequestInput(input: unknown): PortalValidationResult<CancellationRequestInput> {
  const exact = exactInput(input, ["bookingId", "reason"]);
  if (!exact.ok) return exact;
  const bookingId = safeId(exact.value.bookingId, "input.bookingId");
  if (!bookingId.ok) return bookingId;
  const reason = safeText(exact.value.reason, "input.reason", 1000);
  if (!reason.ok || reason.value === null) return reason as PortalValidationResult<never>;
  return { ok: true, value: { bookingId: bookingId.value, reason: reason.value } };
}

export function validateCancellationDecisionInput(input: unknown): PortalValidationResult<CancellationDecisionInput> {
  const exact = exactInput(input, ["requestId", "decision", "note"]);
  if (!exact.ok) return exact;
  const requestId = safeId(exact.value.requestId, "input.requestId");
  if (!requestId.ok) return requestId;
  if (exact.value.decision !== "approved" && exact.value.decision !== "rejected") {
    return invalidInput("input.decision", "portal.cancellation.decision");
  }
  const note = safeText(exact.value.note, "input.note", 1000, true);
  if (!note.ok) return note as PortalValidationResult<never>;
  if (exact.value.decision === "rejected" && note.value === null) return invalidInput("input.note", "portal.cancellation.note_required");
  if (exact.value.decision === "approved" && note.value !== null) return invalidInput("input.note", "portal.cancellation.note_forbidden");
  return { ok: true, value: { requestId: requestId.value, decision: exact.value.decision, note: note.value } };
}

export type PortalCapability =
  | "customer_profile_read"
  | "customer_profile_update"
  | "customer_cancellation_request"
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
  | "admin_cancellation_decide"
  | "admin_fixed_departure_assign"
  | "admin_reporting_read";

export const ROLE_CAPABILITIES: Readonly<Record<Role, readonly PortalCapability[]>> = Object.freeze({
  customer: Object.freeze(["customer_profile_read", "customer_profile_update", "customer_cancellation_request", "customer_review_submit"] as const) as readonly PortalCapability[],
  guide: Object.freeze(["guide_profile_read", "guide_profile_update", "guide_assignments_read"] as const) as readonly PortalCapability[],
  admin: Object.freeze([
    "admin_users_read", "admin_users_role_update", "admin_catalog_read", "admin_requests_read",
    "admin_requests_review", "admin_bookings_read", "admin_cancellation_read", "admin_cancellation_decide",
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

export interface CancellationEligibilityInput {
  actorUserId: string;
  bookingOwnerUserId: string;
  bookingStatus: BookingStatus;
  hasPendingRequest: boolean;
}

export function canRequestCancellation(input: unknown): input is CancellationEligibilityInput {
  if (!isRecord(input)) return false;
  return typeof input.actorUserId === "string" && typeof input.bookingOwnerUserId === "string" &&
    input.actorUserId.length > 0 && input.actorUserId === input.bookingOwnerUserId &&
    (BOOKING_STATUS_VALUES as readonly string[]).includes(input.bookingStatus as string) &&
    ["pending_payment", "payment_processing", "payment_review", "confirmed"].includes(input.bookingStatus as string) &&
    input.hasPendingRequest === false;
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

export interface PortalIdentity {
  userId: string;
  role: Role;
  locale: Locale;
  displayName: string;
  email: string;
  demo: true;
}

export interface DemoSessionPort {
  selectDemoIdentity(userId: string): Promise<PortalIdentity>;
  getSession(): Promise<PortalIdentity | null>;
  signOut(): Promise<void>;
}
export type SessionPort = DemoSessionPort;

export interface CustomerAccount {
  userId: string;
  role: "customer";
  displayName: string;
  email: string;
  phone: string | null;
  language: Locale;
}

export interface CustomerAccountUpdate {
  displayName?: string;
  phone?: string | null;
  language?: Locale;
}

export interface CancellationRequest {
  id: string;
  bookingId: string;
  customerUserId: string;
  reason: string;
  status: CancellationStatus;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
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
  cancellationRequest: CancellationRequest | null;
  review: TourReview | null;
}

export interface CustomerAccountPort {
  getAccount(): Promise<CustomerAccount>;
  updateAccount(input: CustomerAccountUpdate): Promise<CustomerAccount>;
  listBookings(): Promise<CustomerBookingView[]>;
  listCustomRequests(): Promise<CustomerCustomRequest[]>;
}

export interface CustomerCancellationPort {
  requestCancellation(input: CancellationRequestInput): Promise<CancellationRequest>;
  listOwnCancellationRequests(): Promise<CancellationRequest[]>;
}

export interface CustomerTourReviewPort {
  submitTourReview(input: TourReviewInput): Promise<TourReview>;
  listOwnReviews(): Promise<TourReview[]>;
}

export interface AdminCancellationDecision {
  request: CancellationRequest;
  booking: AdminBookingProjection;
}

export interface AdminCancellationPort {
  listCancellationRequests(): Promise<CancellationRequest[]>;
  decideCancellation(input: {
    requestId: string;
    decision: CancellationDecision;
    note: string | null;
  }): Promise<AdminCancellationDecision>;
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
  specialNeeds: string | null;
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
};

export interface AdminPersonalizedRequestsPort {
  listPersonalizedRequests(): Promise<AdminPersonalizedRequestProjection[]>;
  reviewPersonalizedRequest(input: {
    requestId: string;
    decision: AdminRequestDecision;
    note: string | null;
  }): Promise<AdminPersonalizedRequestProjection>;
}

export interface AdminBookingProjection extends CustomerBooking {
  ownerUserId: string;
  paymentStatus: PaymentStatus | null;
  assignedGuideUserId: string | null;
  cancellationRequestId: string | null;
  specialNeeds: string | null;
}

export interface AdminBookingsPort {
  listBookings(): Promise<AdminBookingProjection[]>;
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
  pendingCancellationCount: number;
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
  cancellations: AdminCancellationPort;
  assignments: AdminGuideAssignmentPort;
  reporting: AdminReportingPort;
}

export interface PortalPortBindings {
  session: DemoSessionPort;
  customer: CustomerPortalPorts;
  guide: GuidePortalPorts;
  admin: AdminPortalPorts;
}

/** Metadata only: these capabilities are not claimed as production implementations. */
export const PORTAL_PRODUCTION_GAP = Object.freeze({
  cancellation: "Cancellation still requires production migration/RPC/RLS.",
  tourReview: "Tour review still requires production migration/RPC/RLS.",
  profile: "Customer and guide profile updates still require production migration/RPC/RLS.",
  adminCrud: "Administrator CRUD still requires production migration/RPC/RLS.",
  personalizedTourGuideAssignment: "Personalized-tour guide assignment is not supported by the current production RPC.",
} as const);

export const PORTAL_PRODUCTION_STATUS = PORTAL_PRODUCTION_GAP;
