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
import { getDemoDeparture } from "@/lib/application/booking/mock-booking";
import {
  localDraftFingerprint,
  type CustomRequestDraft,
  type CustomRequestDraftInput,
} from "@/lib/application/planner/custom-request-demo";
import {
  createDemoPlannerAdapter,
  type DemoPlannerItem,
} from "@/lib/application/planner/demo-planner";
import { demoCatalogRepository } from "@/lib/infrastructure/mock/hcmc-catalog";
import { isStrictPlannerState } from "@/lib/application/planner/e2e-planner-state-validator";
import {
  isPersonalizationRequest,
  type PersonalizationRequest,
} from "@/lib/application/planner/personalization-session";
import {
  PortalError,
  canCancelBooking,
  parseBookingCancellation,
  validateCancelBookingInput,
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
  type AdminPersonalizedQuoteInput,
  type AdminPersonalizedQuoteProjection,
  type AdminPersonalizedQuotesPort,
  type AdminPersonalizedRequestProjection,
  type AdminReportProjection,
  type AdminUserProjection,
  type BookingCancellation,
  type CancelBookingInput,
  type CancelBookingResult,
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
import type {
  DemoFixedBookingInput,
  DemoPersonalizedCheckoutInput,
  DemoPersonalizedQuoteAcceptanceInput,
  DemoPersonalizedRequestInput,
  DemoPortalIntegration,
  DemoPersonalizedRequestSubmission,
} from "@/lib/application/portal/demo-integration";

export { PortalError };

/** The only key owned by the demo portal repository. */
export const PORTAL_DEMO_STORAGE_KEY = "locallens.portal.demo.v2" as const;
/** Compatibility alias retained for the first demo test contract. */
export const DEMO_PORTAL_STORAGE_KEY = PORTAL_DEMO_STORAGE_KEY;
export const PORTAL_DEMO_STORAGE_VERSION = 2 as const;

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
  locale: Locale;
  partySize: number;
  totalVndMinor: string;
  specialNeeds: string | null;
  confirmedDraft: CustomRequestDraft;
};

type DemoBookingRecord = CustomerBooking & {
  ownerUserId: string;
  paymentStatus: PaymentStatus | null;
  assignedGuideUserId: string | null;
  cancellationRequestId: string | null;
  specialNeeds: string | null;
  quoteAcceptedAt: string | null;
  personalizedRequest: DemoRequestRecord | null;
};

type DemoCancellationRecord = CancellationRequest;
type DemoBookingCancellationRecord = BookingCancellation;
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
  sessionUserId: string | null;
  users: DemoUserRecord[];
  /** Requests remain independent until an admin issues an explicit quote. */
  requests: DemoRequestRecord[];
  bookings: DemoBookingRecord[];
  bookingCancellations: DemoBookingCancellationRecord[];
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
  readonly customer: Omit<CustomerPortalPorts, "cancellations"> & {
    readonly cancellations: CustomerCancellationPort & {
      cancelBooking(input: CancelBookingInput): Promise<CancelBookingResult>;
    };
  };
  readonly guide: GuidePortalPorts;
  readonly admin: AdminPortalPorts;
  readonly demoIntegration: DemoPortalIntegration;
  readonly demoQuotes: AdminPersonalizedQuotesPort;
  initialize(): Promise<void>;
  reset(): Promise<void>;
}

const FIXTURE_DATE = "2026-09-05";
const REPORT_TIMESTAMP = "2026-08-31T00:00:00.000Z";
const DEMO_CATALOG_SNAPSHOT_ID = "demo-catalog-snapshot-v1";
const DEMO_TRAVEL_SNAPSHOT_ID = "demo-travel-snapshot-v1";
const DEMO_FX_SNAPSHOT_ID = "demo-fx-snapshot-v1";
const DEMO_PERSONALIZED_QUOTE_FIXTURE = Object.freeze({
  bookingId: "demo-booking-personalized",
  quoteId: "demo-quote-personalized",
  titleEn: "A Personal Saigon Day",
  titleVi: "Một ngày Sài Gòn theo sở thích",
  cancellationPolicy: "Demo quote: request changes through the administrator.",
  catalogSnapshotId: DEMO_CATALOG_SNAPSHOT_ID,
  travelSnapshotId: DEMO_TRAVEL_SNAPSHOT_ID,
  fxSnapshotId: DEMO_FX_SNAPSHOT_ID,
  fxVndPerUsd: "25000.00000000",
  meetingPoint: "To be confirmed",
  holdExpiresAt: "2026-08-25T00:00:00.000Z",
  createdAt: "2026-08-23T00:00:00.000Z",
});
const DEMO_QUOTE_VALIDITY_MS = 48 * 60 * 60 * 1000;
const E2E_APPROVED_FOOD_PLACE_ID = "e2e-food-approved-market";
const E2E_APPROVED_MUSEUM_PLACE_ID = "e2e-food-museum";
const E2E_APPROVED_PLACE_IDS = new Set([E2E_APPROVED_FOOD_PLACE_ID, E2E_APPROVED_MUSEUM_PLACE_ID]);
const HASH_ALGORITHM = "fnv1a32" as const;
const MAX_RECORDS = 200;
const PORTAL_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/;
const SEEDED_DEMO_USER_IDS = new Set([
  "demo-user-customer",
  "demo-user-guide",
  "demo-user-guide-secondary",
  "demo-user-admin",
  "demo-user-secondary-customer",
]);
const MONEY_PATTERN = /^(?:0|[1-9]\d*)$/;
const FX_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const NATIONALITY_PATTERN = /^\p{L}(?:[\p{L} .'-]*\p{L})?$/u;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:?\d{2})$/;
const CONTROL_PATTERN = /[\u0000-\u001F\u007F-\u009F]/;
const CANCELLABLE_BOOKING_STATUSES = ["pending_payment"] as const;

const DEMO_HANDOFF_TOURS: Readonly<Record<string, Readonly<{
  id: string;
  versionId: string;
  slug: string;
  catalogSlug: string;
  titleEn: string;
  titleVi: string;
  cancellationPolicy: string;
}>>> = Object.freeze({
  "demo-markets-and-street-food": Object.freeze({
    id: "demo-tour-markets",
    versionId: "demo-tour-version-markets",
    slug: "markets-and-street-food",
    catalogSlug: "demo-markets-and-street-food",
    titleEn: "Markets and Street Food",
    titleVi: "Chợ địa phương và ẩm thực đường phố",
    cancellationPolicy: "Demo booking: changes are free before confirmation.",
  }),
  "demo-history-and-memory": Object.freeze({
    id: "demo-tour-history",
    versionId: "demo-tour-version-history",
    slug: "history-and-memory",
    catalogSlug: "demo-history-and-memory",
    titleEn: "History and Memory",
    titleVi: "Lịch sử và ký ức",
    cancellationPolicy: "Demo booking: changes are free before confirmation.",
  }),
  "demo-cho-lon-craft": Object.freeze({
    id: "demo-tour-cho-lon-craft",
    versionId: "demo-tour-version-cho-lon-craft",
    slug: "cho-lon-craft",
    catalogSlug: "demo-cho-lon-craft",
    titleEn: "Cho Lon Craft Traditions",
    titleVi: "Nghề thủ công Chợ Lớn",
    cancellationPolicy: "Demo booking: changes are free before confirmation.",
  }),
  "demo-city-life-mix": Object.freeze({
    id: "demo-tour-city-life-mix",
    versionId: "demo-tour-version-city-life-mix",
    slug: "city-life-mix",
    catalogSlug: "demo-city-life-mix",
    titleEn: "City Life, From Market to Craft",
    titleVi: "Nhịp sống thành phố: từ chợ đến nghề thủ công",
    cancellationPolicy: "Demo booking: changes are free before confirmation.",
  }),
});

function catalogDurationForHandoffTour(tourVersionId: string, locale: Locale): number | undefined {
  const handoffTour = Object.values(DEMO_HANDOFF_TOURS).find((tour) => tour.versionId === tourVersionId);
  if (handoffTour === undefined) return undefined;
  const catalogTour = demoCatalogRepository.listTours(locale).find((tour) => tour.slug === handoffTour.catalogSlug);
  return catalogTour !== undefined && Number.isSafeInteger(catalogTour.durationMinutes) && catalogTour.durationMinutes > 0
    ? catalogTour.durationMinutes
    : undefined;
}

const ENVELOPE_FIELDS = [
  "version",
  "sessionUserId",
  "users",
  "requests",
  "bookings",
  "bookingCancellations",
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
  "locale",
  "partySize",
  "totalVndMinor",
  "specialNeeds",
  "confirmedDraft",
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
  "quoteAcceptedAt",
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
const BOOKING_CANCELLATION_FIELDS = [
  "id",
  "bookingId",
  "customerUserId",
  "sourceKind",
  "reasonCode",
  "otherReason",
  "idempotencyKey",
  "cancelledAt",
] as const;
const REVIEW_FIELDS = ["id", "bookingId", "customerUserId", "rating", "text", "createdAt"] as const;
const ASSIGNMENT_FIELDS = ["bookingId", "assignedGuideUserId", "assignmentStatus", "specialNeeds"] as const;
const LOCATION_FIELDS = ["id", "slug", "locale", "title", "status"] as const;
const FIXED_TOUR_FIELDS = ["id", "versionId", "slug", "locale", "title", "status"] as const;
const DEPARTURE_FIELDS = ["id", "tourVersionId", "date", "status", "startsAt", "endAt"] as const;

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

function safeSessionUserId(value: unknown, path: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !SEEDED_DEMO_USER_IDS.has(value)) {
    invalidStorage(path, "Selected identity must be a seeded demo user");
  }
  return value;
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

function confirmedDraftInput(draft: CustomRequestDraft): CustomRequestDraftInput {
  const input: CustomRequestDraftInput = {
    planId: draft.planId,
    revision: draft.revision,
    preferences: draft.preferences,
    revisionSnapshot: draft.revisionSnapshot,
  };
  if (draft.handoffId !== undefined) {
    return {
      ...input,
      handoffId: draft.handoffId,
      ownerScope: draft.ownerScope,
      originalExpiresAt: draft.originalExpiresAt,
      locale: draft.locale,
      requestId: draft.requestId,
    };
  }
  return input;
}

function isApprovedE2EFoodSelection(
  item: DemoPlannerItem,
  locale: Locale,
  partySize: number,
): boolean {
  if (item.foodSelection === null) {
    return item.foodCostMinVnd === 0
      && item.foodCostMaxVnd === 0
      && item.payAtVendorMinVnd === 0
      && item.payAtVendorMaxVnd === 0;
  }
  const selection = item.foodSelection;
  return selection.venueTitle === (locale === "vi" ? "Chợ Bờ Sông E2E" : "E2E Riverside Market")
    && selection.vendorTitle === (locale === "vi" ? "Quầy Bánh Mì Dì Ba" : "Aunt Ba's Banh Mi Stall")
    && selection.locationNote === "North lane, blue awning"
    && selection.menuTitle === (locale === "vi" ? "Bánh mì thịt nướng" : "Grilled pork banh mi")
    && selection.servingUnit === "portion"
    && selection.quantity === partySize
    && selection.priceVndMin === 45_000
    && selection.priceVndMax === 60_000
    && selection.paymentMode === "pay_at_vendor";
}

function isApprovedE2ERevision(draft: CustomRequestDraft, locale: Locale): boolean {
  if (process.env.NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES !== "1") return false;
  if (draft.planId !== "demo-plan-hcmc-cultural-day") return false;
  if (!draft.preferences.areas.every((areaId) => areaId === "e2e-food-district-1" || areaId === "e2e-food-district-3")) return false;
  if (draft.revisionSnapshot.items.length === 0) return false;
  return draft.revisionSnapshot.items.every((item) => {
    if (!E2E_APPROVED_PLACE_IDS.has(item.placeId) || item.travelCostVndBefore !== 0) return false;
    if (item.placeId === E2E_APPROVED_FOOD_PLACE_ID) {
      return item.title === (locale === "vi" ? "Chợ Bờ Sông E2E" : "E2E Riverside Market")
        && item.visitDurationMinutes === 60
        && item.placeCostVnd === 0
        && isApprovedE2EFoodSelection(item, locale, draft.preferences.partySize);
    }
    return item.title === (locale === "vi" ? "Bảo tàng Lịch sử E2E" : "E2E History Museum")
      && item.visitDurationMinutes === 75
      && item.placeCostVnd === 120_000 * draft.preferences.partySize
      && item.foodSelection === null;
  });
}

function isApprovedBaseRevision(draft: CustomRequestDraft, locale: Locale): boolean {
  const planner = createDemoPlannerAdapter();
  let state = planner.createInitial(locale, draft.preferences);
  const planMatches = state.planId === draft.planId || draft.planId === "demo-plan-personalized";
  if (!planMatches || state.current.items.length === 0 || state.current.revision > draft.revision) return false;
  while (state.current.revision < draft.revision) {
    if (draft.revisionSnapshot.feedback.length === 0) return false;
    const refined = planner.refine(state, {
      baseRevision: state.current.revision,
      feedback: draft.revisionSnapshot.feedback,
      lockedItemIds: draft.revisionSnapshot.items.filter((item) => item.locked).map((item) => item.id),
    });
    if (!refined.ok) return false;
    state = refined.state;
  }
  return canonical(state.current) === canonical(draft.revisionSnapshot);
}

function validatedConfirmedDraft(value: unknown, locale: Locale): CustomRequestDraft | null {
  if (!isRecord(value)) return null;
  const requiredFields = ["planId", "revision", "preferences", "revisionSnapshot", "integrityFingerprint"] as const;
  const optionalFields = ["handoffId", "ownerScope", "originalExpiresAt", "locale", "requestId"] as const;
  if (requiredFields.some((field) => !Object.prototype.hasOwnProperty.call(value, field))) return null;
  if (Object.keys(value).some((key) => !requiredFields.includes(key as (typeof requiredFields)[number])
    && !optionalFields.includes(key as (typeof optionalFields)[number]))) return null;
  if (typeof value.integrityFingerprint !== "string" || !/^[0-9a-f]{32}$/.test(value.integrityFingerprint)) return null;
  if (typeof value.planId !== "string" || !PORTAL_ID_PATTERN.test(value.planId)
    || typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 1 || value.revision > 100
    || !isPersonalizationRequest(value.preferences) || !isRecord(value.revisionSnapshot)) return null;
  try {
    const candidate = value as unknown as CustomRequestDraft;
    const hasHandoffMetadata = optionalFields.some((field) => Object.prototype.hasOwnProperty.call(value, field));
    if (hasHandoffMetadata && (
      typeof candidate.handoffId !== "string" || candidate.handoffId.length === 0 || candidate.handoffId.length > 96 ||
      (candidate.ownerScope !== "anonymous" && (typeof candidate.ownerScope !== "string" || !candidate.ownerScope.startsWith("customer:") || candidate.ownerScope.length > 160)) ||
      typeof candidate.originalExpiresAt !== "number" || !Number.isSafeInteger(candidate.originalExpiresAt) || candidate.originalExpiresAt <= 0 ||
      (candidate.locale !== locale) ||
      typeof candidate.requestId !== "string" || candidate.requestId !== `demo-request-${candidate.handoffId}-${candidate.revision}` || candidate.requestId.length > 120
    )) return null;
    if (candidate.revision !== candidate.revisionSnapshot.revision || !Array.isArray(candidate.revisionSnapshot.items)
      || candidate.revisionSnapshot.items.length === 0) return null;
    if (localDraftFingerprint(confirmedDraftInput(candidate)) !== candidate.integrityFingerprint) return null;
    const approvedBaseRevision = isApprovedBaseRevision(candidate, locale);
    const approvedE2ERevision = isStrictPlannerState({
      planId: candidate.planId,
      locale,
      preferences: candidate.preferences,
      current: candidate.revisionSnapshot,
      history: [],
    }, locale) && isApprovedE2ERevision(candidate, locale);
    if (!approvedBaseRevision && !approvedE2ERevision) return null;
    return clone(candidate);
  } catch {
    return null;
  }
}

function parseStoredConfirmedDraft(value: unknown, locale: Locale, path: string): CustomRequestDraft {
  const draft = validatedConfirmedDraft(value, locale);
  if (draft === null) invalidStorage(path, "Invalid confirmed planner revision");
  return draft;
}

function readConfirmedDraftInput(value: unknown, locale: Locale): CustomRequestDraft {
  const draft = validatedConfirmedDraft(value, locale);
  if (draft === null) invalidInput("The confirmed planner revision is invalid or is not from the approved demo fixture.");
  return draft;
}

function bodyForIntegrity(envelope: DemoEnvelope): DemoEnvelopeBody {
  return {
    version: envelope.version,
    sessionUserId: envelope.sessionUserId,
    users: envelope.users,
    requests: envelope.requests,
    bookings: envelope.bookings,
    bookingCancellations: envelope.bookingCancellations,
    cancellations: envelope.cancellations,
    reviews: envelope.reviews,
    assignments: envelope.assignments,
    locations: envelope.locations,
    fixedTours: envelope.fixedTours,
    departures: envelope.departures,
  };
}

function requestSnapshotsMatch(
  authoritative: DemoRequestRecord,
  bookingSnapshot: DemoRequestRecord,
): boolean {
  // `submittedAt` is the request's immutable creation timestamp in this demo schema.
  return authoritative.id === bookingSnapshot.id
    && authoritative.ownerUserId === bookingSnapshot.ownerUserId
    && authoritative.planId === bookingSnapshot.planId
    && authoritative.revisionNo === bookingSnapshot.revisionNo
    && authoritative.locale === bookingSnapshot.locale
    && authoritative.partySize === bookingSnapshot.partySize
    && authoritative.totalVndMinor === bookingSnapshot.totalVndMinor
    && authoritative.specialNeeds === bookingSnapshot.specialNeeds
    && authoritative.submittedAt === bookingSnapshot.submittedAt
    && authoritative.updatedAt === bookingSnapshot.updatedAt
    && authoritative.status === bookingSnapshot.status
    && authoritative.latestDecisionAt === bookingSnapshot.latestDecisionAt
    && canonical(authoritative.confirmedDraft) === canonical(bookingSnapshot.confirmedDraft);
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
  const locale = safeLocale(row.locale, `${path}.locale`);
  return {
    id: safeId(row.id, `${path}.id`),
    planId: safeId(row.planId, `${path}.planId`),
    revisionNo: safeInteger(row.revisionNo, `${path}.revisionNo`, 1, 100),
    status: safeEnum(row.status, REQUEST_STATUS_VALUES, `${path}.status`, "request status"),
    submittedAt: safeTimestamp(row.submittedAt, `${path}.submittedAt`),
    updatedAt: safeTimestamp(row.updatedAt, `${path}.updatedAt`),
    ownerUserId: safeId(row.ownerUserId, `${path}.ownerUserId`),
    latestDecisionAt: safeNullableTimestamp(row.latestDecisionAt, `${path}.latestDecisionAt`),
    locale,
    partySize: safeInteger(row.partySize, `${path}.partySize`, 1, 20),
    totalVndMinor: safeMoney(row.totalVndMinor, `${path}.totalVndMinor`),
    specialNeeds: nullableStorageText(row.specialNeeds, `${path}.specialNeeds`, 1_000),
    confirmedDraft: parseStoredConfirmedDraft(row.confirmedDraft, locale, `${path}.confirmedDraft`),
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
    quoteAcceptedAt: safeNullableTimestamp(row.quoteAcceptedAt, `${path}.quoteAcceptedAt`),
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

function parseAutomaticCancellation(value: unknown, path: string): DemoBookingCancellationRecord {
  const row = exactRecord(value, BOOKING_CANCELLATION_FIELDS, path);
  const parsed = parseBookingCancellation(row);
  if (!parsed.ok) {
    invalidStorage(`${path}.${parsed.error.fieldPath ?? "event"}`, "Invalid automatic cancellation event");
  }
  return parsed.value;
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
    startsAt: safeTimestamp(row.startsAt, `${path}.startsAt`),
    endAt: safeNullableTimestamp(row.endAt, `${path}.endAt`),
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
  const requests = new Map(envelope.requests.map((request) => [request.id, request]));
  const bookings = new Map(envelope.bookings.map((booking) => [booking.id, booking]));
  const departures = new Map(envelope.departures.map((departure) => [departure.id, departure]));
  const tours = new Map(envelope.fixedTours.map((tour) => [tour.versionId, tour]));
  const automaticCancellations = new Map(envelope.bookingCancellations.map((event) => [event.bookingId, event]));
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

  for (const request of envelope.requests) {
    const owner = users.get(request.ownerUserId);
    if (!owner || owner.role !== "customer") invalidStorage(`requests.${request.id}.ownerUserId`, "Request owner must be a customer");
    if (request.status === "pending_review" && request.latestDecisionAt !== null) {
      invalidStorage(`requests.${request.id}.latestDecisionAt`, "Pending request cannot have a decision timestamp");
    }
    if (request.status !== "pending_review" && request.latestDecisionAt === null) {
      invalidStorage(`requests.${request.id}.latestDecisionAt`, "Reviewed request requires a decision timestamp");
    }
    const draft = request.confirmedDraft;
    if (request.planId !== draft.planId
      || request.revisionNo !== draft.revision
      || request.partySize !== draft.preferences.partySize
      || request.totalVndMinor !== String(draft.revisionSnapshot.totals.customerPayableVnd)
      || request.specialNeeds !== (draft.preferences.specialNeeds.length === 0 ? null : draft.preferences.specialNeeds)) {
      invalidStorage(`requests.${request.id}.confirmedDraft`, "Request facts must be derived from its confirmed planner revision");
    }
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
      if (booking.quoteAcceptedAt !== null) invalidStorage(`bookings.${booking.id}.quoteAcceptedAt`, "Departure booking cannot contain quote acceptance");
    } else {
      if (booking.quoteId === null || booking.quoteId !== booking.sourceId || booking.tourVersionId !== null) {
        invalidStorage(`bookings.${booking.id}`, "Quote booking source reference mismatch");
      }
      if (booking.personalizedRequest === null) invalidStorage(`bookings.${booking.id}.personalizedRequest`, "Quote booking requires its request");
      if (booking.personalizedRequest.ownerUserId !== booking.ownerUserId) {
        invalidStorage(`bookings.${booking.id}.personalizedRequest.ownerUserId`, "Request owner mismatch");
      }
      const authoritativeRequest = requests.get(booking.personalizedRequest.id);
      if (!authoritativeRequest || !requestSnapshotsMatch(authoritativeRequest, booking.personalizedRequest)) {
        invalidStorage(`bookings.${booking.id}.personalizedRequest`, "Quote booking request snapshot diverges from its independent request");
      }
      if (booking.totalVndMinor !== authoritativeRequest.totalVndMinor || booking.checkoutAmountMinor !== authoritativeRequest.totalVndMinor) {
        invalidStorage(`bookings.${booking.id}.totalVndMinor`, "Quote amount must equal the confirmed request payable amount");
      }
      const issuedAt = Date.parse(booking.createdAt);
      const expiresAt = Date.parse(booking.holdExpiresAt);
      if (expiresAt - issuedAt !== DEMO_QUOTE_VALIDITY_MS) {
        invalidStorage(`bookings.${booking.id}.holdExpiresAt`, "Personalized quote must expire 48 hours after issue");
      }
      if (booking.quoteAcceptedAt !== null) {
        const acceptedAt = Date.parse(booking.quoteAcceptedAt);
        if (acceptedAt < issuedAt || acceptedAt >= expiresAt) {
          invalidStorage(`bookings.${booking.id}.quoteAcceptedAt`, "Quote acceptance must occur before expiry");
        }
      }
      if (booking.status === "confirmed" && booking.paymentStatus === "paid" && booking.quoteAcceptedAt === null) {
        invalidStorage(`bookings.${booking.id}.quoteAcceptedAt`, "Paid personalized booking requires persisted quote acceptance");
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
    const automaticCancellation = automaticCancellations.get(booking.id);
    if ((hasApprovedCancellation || automaticCancellation !== undefined) !== (booking.status === "cancelled")) {
      invalidStorage(`bookings.${booking.id}.status`, "Cancellation fact and booking status must agree");
    }
    if (booking.status === "cancelled") {
      const cancellation = booking.cancellationRequestId === null ? null : cancellations.get(booking.cancellationRequestId);
      if (automaticCancellation === undefined && (!cancellation || cancellation.status !== "approved")) {
        invalidStorage(`bookings.${booking.id}.status`, "Cancelled booking requires an authoritative cancellation fact");
      }
    }
  }

  for (const event of envelope.bookingCancellations) {
    const booking = bookings.get(event.bookingId);
    const owner = users.get(event.customerUserId);
    if (!booking || !owner || owner.role !== "customer" || booking.ownerUserId !== event.customerUserId) {
      invalidStorage(`bookingCancellations.${event.id}`, "Automatic cancellation ownership reference mismatch");
    }
    if (booking.sourceKind !== event.sourceKind) {
      invalidStorage(`bookingCancellations.${event.id}.sourceKind`, "Automatic cancellation source mismatch");
    }
    if (booking.status !== "cancelled" || booking.paymentStatus !== null) {
      invalidStorage(`bookingCancellations.${event.id}`, "Automatic cancellation requires compensated cancelled booking state");
    }
    if (booking.sourceKind === "quote" && booking.quoteAcceptedAt !== null) {
      invalidStorage(`bookingCancellations.${event.id}`, "Cancelled quote must revoke its accepted checkout state");
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
    } else if (cancellation.status === "rejected" && booking.status === "cancelled" && booking.cancellationRequestId === cancellation.id) {
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

  if (envelope.requests.length < 1) invalidStorage("requests", "The demo fixture must include a personalized request");
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
    sessionUserId: safeSessionUserId(root.sessionUserId, "root.sessionUserId"),
    users: denseArray(root.users, "root.users").map((entry, index) => parseUser(entry, `root.users[${index}]`)),
    requests: denseArray(root.requests, "root.requests").map((entry, index) => parseRequest(entry, `root.requests[${index}]`)),
    bookings: denseArray(root.bookings, "root.bookings").map((entry, index) => parseBooking(entry, `root.bookings[${index}]`)),
    bookingCancellations: denseArray(root.bookingCancellations, "root.bookingCancellations")
      .map((entry, index) => parseAutomaticCancellation(entry, `root.bookingCancellations[${index}]`)),
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
  ensureUnique(envelope.requests.map((request) => request.id), "root.requests");
  ensureUnique(envelope.bookings.map((booking) => booking.id), "root.bookings");
  ensureUnique(envelope.bookingCancellations.map((event) => event.id), "root.bookingCancellations");
  ensureUnique(envelope.bookingCancellations.map((event) => event.bookingId), "root.bookingCancellations.bookingId");
  ensureUnique(envelope.bookingCancellations.map((event) => `${event.customerUserId}:${event.idempotencyKey}`), "root.bookingCancellations.idempotencyKey");
  ensureUnique(envelope.cancellations.map((request) => request.id), "root.cancellations");
  ensureUnique(envelope.reviews.map((review) => review.id), "root.reviews");
  ensureUnique(envelope.assignments.map((assignment) => assignment.bookingId), "root.assignments");
  ensureUnique(envelope.locations.map((location) => location.id), "root.locations");
  ensureUnique(envelope.fixedTours.map((tour) => tour.id), "root.fixedTours");
  ensureUnique(envelope.fixedTours.map((tour) => tour.versionId), "root.fixedTours.versionId");
  ensureUnique(envelope.departures.map((departure) => departure.id), "root.departures");
  if (envelope.sessionUserId !== null && !envelope.users.some((user) => user.userId === envelope.sessionUserId)) {
    invalidStorage("root.sessionUserId", "Selected identity is not present in the fixture");
  }
  validateCrossReferences(envelope);
  if (digestBody(bodyForIntegrity(envelope)) !== integrity.digest) invalidStorage("root.integrity.digest", "Storage integrity check failed");
  return envelope;
}

function createFixtureBody(): DemoEnvelopeBody {
  const seededPreferences: PersonalizationRequest = {
    startAt: "2026-09-05T09:00:00+07:00",
    durationMinutes: 360,
    areas: ["demo-hcmc-district-1"],
    budget: { currency: "VND", amountMinor: 2_000_000 },
    partySize: 1,
    guideLanguage: "en",
    priorityWeights: { street_food: 0, history: 2, traditional_craft: 0, traditional_market: 4 },
    pace: "active",
    dietaryRequirements: [],
    mobilityRequirements: [],
    lockedStopIds: [],
    specialNeeds: "",
  };
  const seededState = createDemoPlannerAdapter().createInitial("en", seededPreferences);
  const seededDraftInput: CustomRequestDraftInput = {
    planId: "demo-plan-personalized",
    revision: seededState.current.revision,
    preferences: seededPreferences,
    revisionSnapshot: seededState.current,
  };
  const seededDraft: CustomRequestDraft = {
    ...seededDraftInput,
    integrityFingerprint: localDraftFingerprint(seededDraftInput),
  };
  const seededRequest: DemoRequestRecord = {
    id: "demo-request-personalized",
    planId: seededDraft.planId,
    revisionNo: seededDraft.revision,
    status: "pending_review",
    submittedAt: DEMO_PERSONALIZED_QUOTE_FIXTURE.createdAt,
    updatedAt: DEMO_PERSONALIZED_QUOTE_FIXTURE.createdAt,
    ownerUserId: "demo-user-customer",
    latestDecisionAt: null,
    locale: "en",
    partySize: seededDraft.preferences.partySize,
    totalVndMinor: String(seededDraft.revisionSnapshot.totals.customerPayableVnd),
    specialNeeds: null,
    confirmedDraft: seededDraft,
  };
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
    { id: "demo-departure-completed", tourVersionId: "demo-tour-version-markets", date: "2026-08-30", status: "completed", startsAt: "2026-08-30T09:00:00+07:00", endAt: null },
    { id: "demo-departure-cancellation", tourVersionId: "demo-tour-version-history", date: FIXTURE_DATE, status: "scheduled", startsAt: "2026-09-05T09:30:00+07:00", endAt: null },
    { id: "demo-departure-secondary", tourVersionId: "demo-tour-version-markets", date: "2026-09-06", status: "scheduled", startsAt: "2026-09-06T09:00:00+07:00", endAt: null },
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
      quoteAcceptedAt: null,
      personalizedRequest: null,
    },
    {
      id: "demo-booking-cancellation",
      status: "pending_payment",
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
      paymentStatus: null,
      assignedGuideUserId: null,
      cancellationRequestId: null,
      specialNeeds: null,
      quoteAcceptedAt: null,
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
      quoteAcceptedAt: null,
      personalizedRequest: null,
    },
    {
      id: DEMO_PERSONALIZED_QUOTE_FIXTURE.bookingId,
      status: "confirmed",
      sourceKind: "quote",
      sourceId: DEMO_PERSONALIZED_QUOTE_FIXTURE.quoteId,
      tourVersionId: null,
      quoteId: DEMO_PERSONALIZED_QUOTE_FIXTURE.quoteId,
      titleEn: DEMO_PERSONALIZED_QUOTE_FIXTURE.titleEn,
      titleVi: DEMO_PERSONALIZED_QUOTE_FIXTURE.titleVi,
      cancellationPolicy: DEMO_PERSONALIZED_QUOTE_FIXTURE.cancellationPolicy,
      catalogSnapshotId: DEMO_PERSONALIZED_QUOTE_FIXTURE.catalogSnapshotId,
      travelSnapshotId: DEMO_PERSONALIZED_QUOTE_FIXTURE.travelSnapshotId,
      fxSnapshotId: DEMO_PERSONALIZED_QUOTE_FIXTURE.fxSnapshotId,
      fxVndPerUsd: DEMO_PERSONALIZED_QUOTE_FIXTURE.fxVndPerUsd,
      perPersonVndMinor: null,
      totalVndMinor: seededRequest.totalVndMinor,
      checkoutCurrency: "vnd",
      checkoutAmountMinor: seededRequest.totalVndMinor,
      partySize: 1,
      language: "en",
      meetingPoint: DEMO_PERSONALIZED_QUOTE_FIXTURE.meetingPoint,
      holdExpiresAt: DEMO_PERSONALIZED_QUOTE_FIXTURE.holdExpiresAt,
      createdAt: DEMO_PERSONALIZED_QUOTE_FIXTURE.createdAt,
      ownerUserId: "demo-user-customer",
      paymentStatus: "paid",
      assignedGuideUserId: null,
      cancellationRequestId: null,
      specialNeeds: null,
      quoteAcceptedAt: DEMO_PERSONALIZED_QUOTE_FIXTURE.createdAt,
      personalizedRequest: clone(seededRequest),
    },
  ];
  const requests: DemoRequestRecord[] = [seededRequest];
  const assignments: DemoAssignmentRecord[] = [
    {
      bookingId: "demo-booking-completed",
      assignedGuideUserId: "demo-user-guide",
      assignmentStatus: "assigned",
      specialNeeds: "Step-free route requested.",
    },
  ];

  return {
    version: PORTAL_DEMO_STORAGE_VERSION,
    sessionUserId: null,
    users,
    requests,
    bookings,
    bookingCancellations: [],
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
  const cancellation = envelope.bookingCancellations.find((event) =>
    event.bookingId === booking.id && event.customerUserId === booking.ownerUserId,
  ) ?? null;
  const cancellationRequest = booking.cancellationRequestId === null
    ? null
    : envelope.cancellations.find((request) => request.id === booking.cancellationRequestId) ?? null;
  const review = envelope.reviews.find((entry) => entry.bookingId === booking.id) ?? null;
  return {
    ...toCustomerBooking(booking),
    paymentStatus: booking.paymentStatus,
    quoteAcceptedAt: booking.quoteAcceptedAt,
    cancellation: cancellation === null ? null : clone(cancellation),
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
  const cancellation = envelope.bookingCancellations.find((event) =>
    event.bookingId === booking.id && event.customerUserId === booking.ownerUserId,
  ) ?? null;
  return {
    ...toCustomerBooking(booking),
    ownerUserId: booking.ownerUserId,
    paymentStatus: booking.paymentStatus,
    assignedGuideUserId: booking.assignedGuideUserId,
    cancellation: cancellation === null ? null : clone(cancellation),
    cancellationRequestId: booking.cancellationRequestId,
    specialNeeds: booking.specialNeeds,
  };
}

function toCustomerRequest(request: DemoRequestRecord): CustomerCustomRequest {
  const { ownerUserId, latestDecisionAt, locale, partySize, totalVndMinor, specialNeeds, confirmedDraft, ...customerRequest } = request;
  void ownerUserId;
  void latestDecisionAt;
  void locale;
  void partySize;
  void totalVndMinor;
  void specialNeeds;
  void confirmedDraft;
  return customerRequest;
}

function toAdminRequest(request: DemoRequestRecord): AdminPersonalizedRequestProjection {
  return {
    ...toCustomerRequest(request),
    ownerUserId: request.ownerUserId,
    latestDecisionAt: request.latestDecisionAt,
    locale: request.locale,
    partySize: request.partySize,
    requestedTotalVndMinor: request.totalVndMinor,
    specialNeeds: request.specialNeeds,
    confirmedRevisionFingerprint: request.confirmedDraft.integrityFingerprint,
    confirmedRevisionSnapshot: clone(request.confirmedDraft.revisionSnapshot),
  };
}

function requestForId(envelope: DemoEnvelope, requestId: string): DemoRequestRecord | undefined {
  return envelope.requests.find((request) => request.id === requestId)
    ?? envelope.bookings.find((booking) => booking.personalizedRequest?.id === requestId)?.personalizedRequest
    ?? undefined;
}

function personalizedRequestsForOwner(envelope: DemoEnvelope, ownerUserId: string): DemoRequestRecord[] {
  const requests = envelope.requests.filter((request) => request.ownerUserId === ownerUserId);
  const known = new Set(requests.map((request) => request.id));
  for (const booking of envelope.bookings) {
    const request = booking.personalizedRequest;
    if (booking.ownerUserId === ownerUserId && request !== null && !known.has(request.id)) {
      requests.push(request);
      known.add(request.id);
    }
  }
  return requests;
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
  const cancellation = booking.cancellationRequestId === null
    ? null
    : envelope.cancellations.find((request) =>
      request.id === booking.cancellationRequestId && request.bookingId === booking.id && request.customerUserId === booking.ownerUserId,
    ) ?? null;
  return {
    bookingId: booking.id,
    tourVersionId: booking.tourVersionId,
    departureId: departure.id,
    catalogDurationMinutes: catalogDurationForHandoffTour(booking.tourVersionId, guide.language),
    title: guide.language === "vi" ? booking.titleVi : booking.titleEn,
    startAt: departure.startsAt,
    endAt: departure.endAt,
    meetingPoint: booking.meetingPoint,
    partySize: booking.partySize,
    language: booking.language,
    mobilityFlags: assignment.specialNeeds === null ? [] : ["step_free"],
    dietaryFlags: [],
    assignmentStatus: assignment.assignmentStatus,
    specialNeeds: assignment.specialNeeds,
    cancellationStatus: cancellation?.status ?? null,
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

function readValidatedCancelBooking(input: unknown): CancelBookingInput {
  const result = validateCancelBookingInput(input);
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

function inputInteger(value: unknown, fieldPath: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    invalidInput(`Invalid ${fieldPath}.`);
  }
  return value;
}

function inputMoney(value: unknown, fieldPath: string): number {
  return inputInteger(value, fieldPath, 1, Number.MAX_SAFE_INTEGER);
}

function inputTimestamp(value: unknown, fieldPath: string): string {
  if (typeof value !== "string" || value.trim() !== value || CONTROL_PATTERN.test(value) ||
    !TIMESTAMP_PATTERN.test(value) || !Number.isFinite(Date.parse(value))) {
    invalidInput(`Invalid ${fieldPath}.`);
  }
  return value;
}

function inputDate(value: unknown, fieldPath: string): string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) invalidInput(`Invalid ${fieldPath}.`);
  return value;
}

function inputClockTime(value: unknown, fieldPath: string): string {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    invalidInput(`Invalid ${fieldPath}.`);
  }
  return value;
}

function inputOptionalText(value: unknown, fieldPath: string, maximum: number): string {
  if (typeof value !== "string" || value.length > maximum || CONTROL_PATTERN.test(value)) {
    invalidInput(`Invalid ${fieldPath}.`);
  }
  return value;
}

function readFixedBookingInput(input: unknown): DemoFixedBookingInput {
  const row = exactInput(input, [
    "bookingId",
    "departureId",
    "tourSlug",
    "date",
    "startsAt",
    "meetingPoint",
    "partySize",
    "locale",
    "unitPriceMinor",
    "totalMinor",
    "holdExpiresAt",
    "createdAt",
    "status",
    "paymentStatus",
  ], "syncFixedBooking");
  const bookingId = inputId(row.bookingId, "bookingId");
  const departureId = inputId(row.departureId, "departureId");
  const tourSlug = inputId(row.tourSlug, "tourSlug");
  const departure = getDemoDeparture(departureId);
  if (departure === undefined || departure.tourSlug !== tourSlug) {
    invalidInput("The fixed booking must reference an allowlisted demo departure.");
  }
  const date = inputDate(row.date, "date");
  const startsAt = inputClockTime(row.startsAt, "startsAt");
  const meetingPoint = inputOptionalText(row.meetingPoint, "meetingPoint", 240);
  const partySize = inputInteger(row.partySize, "partySize", 1, 20);
  const unitPriceMinor = inputMoney(row.unitPriceMinor, "unitPriceMinor");
  const totalMinor = inputMoney(row.totalMinor, "totalMinor");
  if (
    date !== departure.date ||
    startsAt !== departure.startsAt ||
    meetingPoint !== departure.meetingPoint ||
    unitPriceMinor !== departure.unitPriceMinor ||
    totalMinor !== departure.unitPriceMinor * partySize ||
    partySize > departure.remainingCapacity
  ) {
    invalidInput("The fixed booking result does not match the allowlisted departure facts.");
  }
  const locale = row.locale;
  if (typeof locale !== "string" || !(LOCALE_VALUES as readonly string[]).includes(locale)) {
    invalidInput("Invalid locale.");
  }
  const status = row.status;
  const paymentStatus = row.paymentStatus;
  if (status !== "held" && status !== "paid") invalidInput("Invalid booking status.");
  if (paymentStatus !== "unpaid" && paymentStatus !== "succeeded") invalidInput("Invalid payment status.");
  if ((status === "held" && paymentStatus !== "unpaid") || (status === "paid" && paymentStatus !== "succeeded")) {
    invalidInput("Booking and payment status must agree.");
  }
  return {
    bookingId,
    departureId,
    tourSlug,
    date,
    startsAt,
    meetingPoint,
    partySize,
    locale: locale as DemoFixedBookingInput["locale"],
    unitPriceMinor,
    totalMinor,
    holdExpiresAt: inputTimestamp(row.holdExpiresAt, "holdExpiresAt"),
    createdAt: inputTimestamp(row.createdAt, "createdAt"),
    status,
    paymentStatus,
  };
}

function readPersonalizedRequestInput(input: unknown): DemoPersonalizedRequestInput {
  const row = exactInput(input, [
    "requestId",
    "locale",
    "confirmedDraft",
    "createdAt",
  ], "submitPersonalizedRequest");
  const requestId = inputId(row.requestId, "requestId");
  const locale = row.locale;
  if (typeof locale !== "string" || !(LOCALE_VALUES as readonly string[]).includes(locale)) invalidInput("Invalid locale.");
  return {
    requestId,
    locale: locale as DemoPersonalizedRequestInput["locale"],
    confirmedDraft: readConfirmedDraftInput(row.confirmedDraft, locale as Locale),
    createdAt: inputTimestamp(row.createdAt, "createdAt"),
  };
}

function readPersonalizedQuoteAcceptanceInput(input: unknown): DemoPersonalizedQuoteAcceptanceInput {
  const row = exactInput(input, ["bookingId"], "acceptPersonalizedQuote");
  return { bookingId: inputId(row.bookingId, "bookingId") };
}

function readPersonalizedCheckoutInput(input: unknown): DemoPersonalizedCheckoutInput {
  const row = exactInput(input, ["bookingId"], "completePersonalizedCheckout");
  return { bookingId: inputId(row.bookingId, "bookingId") };
}

function readPersonalizedQuoteInput(input: unknown): AdminPersonalizedQuoteInput {
  const row = exactInput(input, ["requestId"], "issueDemoQuote");
  return {
    requestId: inputId(row.requestId, "requestId"),
  };
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

function ensureFixedHandoffRecords(
  envelope: DemoEnvelope,
  input: DemoFixedBookingInput,
): DemoDepartureRecord {
  const tour = DEMO_HANDOFF_TOURS[input.tourSlug];
  if (tour === undefined) invalidInput("The fixed booking must reference a known demo tour.");

  const existingTour = envelope.fixedTours.find((entry) => entry.versionId === tour.versionId);
  if (existingTour === undefined) {
    envelope.fixedTours.push({
      id: tour.id,
      versionId: tour.versionId,
      slug: tour.slug,
      locale: "en",
      title: tour.titleEn,
      status: "published",
    });
  }

  const existingDeparture = envelope.departures.find((entry) => entry.id === input.departureId);
  if (existingDeparture !== undefined) {
    if (existingDeparture.tourVersionId !== tour.versionId || existingDeparture.date !== input.date) {
      conflict("The demo departure reference does not match the catalog fixture.");
    }
    const expectedStartsAt = `${input.date}T${input.startsAt}:00+07:00`;
    if (existingDeparture.startsAt !== expectedStartsAt || existingDeparture.endAt !== null) {
      conflict("The demo departure schedule cannot be changed.");
    }
    return existingDeparture;
  }

  const departure: DemoDepartureRecord = {
    id: input.departureId,
    tourVersionId: tour.versionId,
    date: input.date,
    status: "scheduled",
    startsAt: `${input.date}T${input.startsAt}:00+07:00`,
    endAt: null,
  };
  envelope.departures.push(departure);
  return departure;
}

function isSeededPersonalizedQuoteFixture(booking: DemoBookingRecord): boolean {
  return booking.id === DEMO_PERSONALIZED_QUOTE_FIXTURE.bookingId
    && booking.sourceKind === "quote"
    && booking.sourceId === DEMO_PERSONALIZED_QUOTE_FIXTURE.quoteId
    && booking.quoteId === DEMO_PERSONALIZED_QUOTE_FIXTURE.quoteId
    && booking.titleEn === DEMO_PERSONALIZED_QUOTE_FIXTURE.titleEn
    && booking.titleVi === DEMO_PERSONALIZED_QUOTE_FIXTURE.titleVi
    && booking.cancellationPolicy === DEMO_PERSONALIZED_QUOTE_FIXTURE.cancellationPolicy
    && booking.catalogSnapshotId === DEMO_PERSONALIZED_QUOTE_FIXTURE.catalogSnapshotId
    && booking.travelSnapshotId === DEMO_PERSONALIZED_QUOTE_FIXTURE.travelSnapshotId
    && booking.fxSnapshotId === DEMO_PERSONALIZED_QUOTE_FIXTURE.fxSnapshotId
    && booking.fxVndPerUsd === DEMO_PERSONALIZED_QUOTE_FIXTURE.fxVndPerUsd
    && booking.meetingPoint === DEMO_PERSONALIZED_QUOTE_FIXTURE.meetingPoint
    && booking.holdExpiresAt === DEMO_PERSONALIZED_QUOTE_FIXTURE.holdExpiresAt
    && booking.createdAt === DEMO_PERSONALIZED_QUOTE_FIXTURE.createdAt;
}

export function createDemoPortalRepository(options: DemoPortalRepositoryOptions): DemoPortalRepository {
  const { storage } = options;
  const now = options.now ?? (() => new Date().toISOString());

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
    if (envelope.sessionUserId === null) unauthenticated();
    const user = envelope.users.find((entry) => entry.userId === envelope.sessionUserId);
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
    async initialize(): Promise<void> {
      let raw: string | null;
      try {
        raw = storage.getItem(PORTAL_DEMO_STORAGE_KEY);
      } catch (error) {
        storageUnavailable("read", error);
      }
      if (raw === null) {
        await engine.reset();
        return;
      }
      if (typeof raw !== "string") invalidStorage("root", "Storage returned a non-string value");
      parseEnvelope(raw);
    },

    async reset(): Promise<void> {
      const envelope = makeEnvelope(createFixtureBody());
      // Validate the generated fixture through the same fail-closed path used for reads.
      validateCrossReferences(envelope);
      if (digestBody(bodyForIntegrity(envelope)) !== envelope.integrity.digest) {
        throw new Error("Generated demo fixture integrity mismatch.");
      }
      writeEnvelope(envelope);
    },

    async selectDemoIdentity(userId: string): Promise<DemoPortalIdentity> {
      const id = inputId(userId, "userId");
      const envelope = readEnvelope();
      const user = envelope.users.find((entry) => entry.userId === id);
      if (!user) notFound("Demo identity", id);
      writeEnvelope(makeEnvelope({
        ...bodyForIntegrity(envelope),
        sessionUserId: user.userId,
      }));
      return clone(toDemoIdentity(user));
    },

    async getSession(): Promise<DemoPortalIdentity | null> {
      const envelope = readEnvelope();
      if (envelope.sessionUserId === null) return null;
      const user = currentActor(envelope);
      return clone(toDemoIdentity(user));
    },

    async signOut(): Promise<void> {
      const envelope = readEnvelope();
      writeEnvelope(makeEnvelope({
        ...bodyForIntegrity(envelope),
        sessionUserId: null,
      }));
    },

    async syncFixedBooking(input: DemoFixedBookingInput): Promise<CustomerBookingView> {
      const bookingInput = readFixedBookingInput(input);
      const envelope = readEnvelope();
      const actor = actorWithRole(envelope, "customer", "syncFixedBooking");
      if (bookingInput.bookingId !== `demo-booking-${actor.userId}-${bookingInput.departureId}-${bookingInput.partySize}`) {
        invalidInput("The fixed booking owner does not match the signed-in customer.");
      }
      const tour = DEMO_HANDOFF_TOURS[bookingInput.tourSlug];
      if (tour === undefined) invalidInput("The fixed booking must reference a known demo tour.");
      ensureFixedHandoffRecords(envelope, bookingInput);

      const nextStatus = bookingInput.status === "paid" ? "confirmed" as const : "pending_payment" as const;
      const nextPaymentStatus = bookingInput.paymentStatus === "succeeded" ? "paid" as const : "pending" as const;
      const existing = envelope.bookings.find((booking) => booking.id === bookingInput.bookingId);
      if (existing !== undefined) {
        if (existing.ownerUserId !== actor.userId) forbidden("customer", "syncFixedBooking for another customer");
        if (existing.sourceKind !== "departure" || existing.sourceId !== bookingInput.departureId) {
          conflict("The demo booking source cannot be changed.");
        }
        if (existing.totalVndMinor !== String(bookingInput.totalMinor) || existing.partySize !== bookingInput.partySize) {
          conflict("The demo booking commercial facts cannot be changed.");
        }
        if (existing.status === "cancelled") conflict("A cancelled demo booking cannot be reopened.");
        if (existing.status === "confirmed" && nextStatus === "pending_payment") {
          return clone(toCustomerBookingView(envelope, existing));
        }
        existing.status = nextStatus;
        existing.paymentStatus = nextPaymentStatus;
        existing.holdExpiresAt = bookingInput.holdExpiresAt;
        validateCrossReferences(envelope);
        writeEnvelope(makeEnvelope(bodyForIntegrity(envelope)));
        return clone(toCustomerBookingView(envelope, existing));
      }

      const booking: DemoBookingRecord = {
        id: bookingInput.bookingId,
        status: nextStatus,
        sourceKind: "departure",
        sourceId: bookingInput.departureId,
        tourVersionId: tour.versionId,
        quoteId: null,
        titleEn: tour.titleEn,
        titleVi: tour.titleVi,
        cancellationPolicy: tour.cancellationPolicy,
        catalogSnapshotId: DEMO_CATALOG_SNAPSHOT_ID,
        travelSnapshotId: DEMO_TRAVEL_SNAPSHOT_ID,
        fxSnapshotId: DEMO_FX_SNAPSHOT_ID,
        fxVndPerUsd: "25000.00000000",
        perPersonVndMinor: String(bookingInput.unitPriceMinor),
        totalVndMinor: String(bookingInput.totalMinor),
        checkoutCurrency: "vnd",
        checkoutAmountMinor: String(bookingInput.totalMinor),
        partySize: bookingInput.partySize,
        language: bookingInput.locale,
        meetingPoint: bookingInput.meetingPoint,
        holdExpiresAt: bookingInput.holdExpiresAt,
        createdAt: bookingInput.createdAt,
        ownerUserId: actor.userId,
        paymentStatus: nextPaymentStatus,
        assignedGuideUserId: null,
        cancellationRequestId: null,
        specialNeeds: null,
        quoteAcceptedAt: null,
        personalizedRequest: null,
      };
      envelope.bookings.push(booking);
      validateCrossReferences(envelope);
      writeEnvelope(makeEnvelope(bodyForIntegrity(envelope)));
      return clone(toCustomerBookingView(envelope, booking));
    },

    async submitPersonalizedRequest(input: DemoPersonalizedRequestInput): Promise<DemoPersonalizedRequestSubmission> {
      const requestInput = readPersonalizedRequestInput(input);
      const confirmedDraft = requestInput.confirmedDraft;
      const partySize = confirmedDraft.preferences.partySize;
      const totalVndMinor = confirmedDraft.revisionSnapshot.totals.customerPayableVnd;
      const specialNeeds = confirmedDraft.preferences.specialNeeds.length === 0
        ? null
        : confirmedDraft.preferences.specialNeeds;
      const envelope = readEnvelope();
      const actor = actorWithRole(envelope, "customer", "submitPersonalizedRequest");
      const existing = envelope.requests.find((request) => request.id === requestInput.requestId)
        ?? envelope.bookings.find((booking) => booking.personalizedRequest?.id === requestInput.requestId)?.personalizedRequest
        ?? undefined;
      if (existing !== undefined) {
        if (existing.ownerUserId !== actor.userId) forbidden("customer", "submitPersonalizedRequest for another customer");
        if (existing.planId !== confirmedDraft.planId || existing.revisionNo !== confirmedDraft.revision ||
          existing.locale !== requestInput.locale || existing.partySize !== partySize ||
          existing.totalVndMinor !== String(totalVndMinor) || existing.specialNeeds !== specialNeeds ||
          canonical(existing.confirmedDraft) !== canonical(confirmedDraft)) {
          conflict("The personalized request facts cannot be changed.");
        }
        return { request: clone(toCustomerRequest(existing)) };
      }

      const request: DemoRequestRecord = {
        id: requestInput.requestId,
        planId: confirmedDraft.planId,
        revisionNo: confirmedDraft.revision,
        status: "pending_review",
        submittedAt: requestInput.createdAt,
        updatedAt: requestInput.createdAt,
        ownerUserId: actor.userId,
        latestDecisionAt: null,
        locale: requestInput.locale,
        partySize,
        totalVndMinor: String(totalVndMinor),
        specialNeeds,
        confirmedDraft: clone(confirmedDraft),
      };
      envelope.requests.push(request);
      validateCrossReferences(envelope);
      writeEnvelope(makeEnvelope(bodyForIntegrity(envelope)));
      return { request: clone(toCustomerRequest(request)) };
    },

    async issueDemoQuote(input: AdminPersonalizedQuoteInput): Promise<AdminPersonalizedQuoteProjection> {
      const quoteInput = readPersonalizedQuoteInput(input);
      const envelope = readEnvelope();
      actorWithRole(envelope, "admin", "issueDemoQuote");
      const seededQuote = envelope.bookings.find((booking) => isSeededPersonalizedQuoteFixture(booking));
      if (seededQuote === undefined) {
        conflict("The seeded demo quote fixture is unavailable or does not match its approved facts.");
      }
      const request = requestForId(envelope, quoteInput.requestId);
      if (!request) notFound("Personalized request", quoteInput.requestId);
      if (request.status !== "approved") conflict("The administrator must approve the personalized request before issuing a quote.");
      const amountVndMinor = Number(request.totalVndMinor);
      if (!Number.isSafeInteger(amountVndMinor) || amountVndMinor < 1) {
        conflict("A zero-payable personalized request cannot create a demo quote or payment.");
      }
      if (request.ownerUserId === undefined) invalidStorage(`requests.${request.id}.ownerUserId`, "Request owner is missing");
      const quoteId = `demo-quote-${request.id}`;
      const bookingId = `demo-booking-${request.id}`;
      if (quoteId.length > 120 || bookingId.length > 120) invalidInput("The personalized request identifier is too long.");

      const existing = envelope.bookings.find((booking) => booking.id === bookingId);
      if (existing !== undefined) {
        if (existing.sourceKind !== "quote" || existing.quoteId !== quoteId || existing.personalizedRequest?.id !== request.id) {
          conflict("The personalized quote source cannot be changed.");
        }
        if (existing.totalVndMinor !== request.totalVndMinor || existing.titleEn !== seededQuote.titleEn ||
          existing.titleVi !== seededQuote.titleVi || existing.cancellationPolicy !== seededQuote.cancellationPolicy ||
          existing.catalogSnapshotId !== seededQuote.catalogSnapshotId || existing.travelSnapshotId !== seededQuote.travelSnapshotId ||
          existing.fxSnapshotId !== seededQuote.fxSnapshotId || existing.fxVndPerUsd !== seededQuote.fxVndPerUsd ||
          existing.meetingPoint !== seededQuote.meetingPoint) {
          conflict("The issued demo quote facts cannot be changed.");
        }
        return clone({
          quoteId,
          requestId: request.id,
          bookingId: existing.id,
          amountVndMinor: existing.totalVndMinor,
          titleEn: existing.titleEn,
          titleVi: existing.titleVi,
          policy: existing.cancellationPolicy,
          issuedAt: existing.createdAt,
          expiresAt: existing.holdExpiresAt,
          acceptedAt: existing.quoteAcceptedAt,
        });
      }

      const issuedAt = timestamp();
      const expiresAt = new Date(Date.parse(issuedAt) + DEMO_QUOTE_VALIDITY_MS).toISOString();

      const booking: DemoBookingRecord = {
        id: bookingId,
        status: "pending_payment",
        sourceKind: "quote",
        sourceId: quoteId,
        tourVersionId: null,
        quoteId,
        titleEn: seededQuote.titleEn,
        titleVi: seededQuote.titleVi,
        cancellationPolicy: seededQuote.cancellationPolicy,
        catalogSnapshotId: seededQuote.catalogSnapshotId,
        travelSnapshotId: seededQuote.travelSnapshotId,
        fxSnapshotId: seededQuote.fxSnapshotId,
        fxVndPerUsd: seededQuote.fxVndPerUsd,
        perPersonVndMinor: null,
        totalVndMinor: String(amountVndMinor),
        checkoutCurrency: "vnd",
        checkoutAmountMinor: String(amountVndMinor),
        partySize: request.partySize,
        language: request.locale,
        meetingPoint: seededQuote.meetingPoint,
        holdExpiresAt: expiresAt,
        createdAt: issuedAt,
        ownerUserId: request.ownerUserId,
        paymentStatus: null,
        assignedGuideUserId: null,
        cancellationRequestId: null,
        specialNeeds: request.specialNeeds,
        quoteAcceptedAt: null,
        personalizedRequest: clone(request),
      };
      envelope.bookings.push(booking);
      validateCrossReferences(envelope);
      writeEnvelope(makeEnvelope(bodyForIntegrity(envelope)));
      return clone({
        quoteId,
        requestId: request.id,
        bookingId: booking.id,
        amountVndMinor: booking.totalVndMinor,
        titleEn: booking.titleEn,
        titleVi: booking.titleVi,
        policy: booking.cancellationPolicy,
        issuedAt: booking.createdAt,
        expiresAt: booking.holdExpiresAt,
        acceptedAt: booking.quoteAcceptedAt,
      });
    },

    async acceptPersonalizedQuote(input: DemoPersonalizedQuoteAcceptanceInput): Promise<CustomerBookingView> {
      const acceptanceInput = readPersonalizedQuoteAcceptanceInput(input);
      const envelope = readEnvelope();
      const actor = actorWithRole(envelope, "customer", "acceptPersonalizedQuote");
      const booking = findBooking(envelope, acceptanceInput.bookingId);
      if (booking.ownerUserId !== actor.userId) forbidden("customer", "acceptPersonalizedQuote for another customer");
      if (booking.sourceKind !== "quote" || booking.personalizedRequest === null) {
        conflict("Only a personalized quote can be accepted.");
      }
      const request = requestForId(envelope, booking.personalizedRequest.id);
      if (!request || request.ownerUserId !== actor.userId || request.status !== "approved") {
        conflict("The administrator must approve the personalized request before quote acceptance.");
      }
      if (booking.status !== "pending_payment" || booking.paymentStatus !== null) {
        conflict("The personalized quote is not active for acceptance.");
      }
      const acceptedAt = timestamp();
      if (Date.parse(acceptedAt) >= Date.parse(booking.holdExpiresAt)) {
        conflict("The personalized quote has expired.");
      }
      if (booking.quoteAcceptedAt === null) booking.quoteAcceptedAt = acceptedAt;
      validateCrossReferences(envelope);
      writeEnvelope(makeEnvelope(bodyForIntegrity(envelope)));
      return clone(toCustomerBookingView(envelope, booking));
    },

    async completePersonalizedCheckout(input: DemoPersonalizedCheckoutInput): Promise<CustomerBookingView> {
      const checkoutInput = readPersonalizedCheckoutInput(input);
      const envelope = readEnvelope();
      const actor = actorWithRole(envelope, "customer", "completePersonalizedCheckout");
      const booking = findBooking(envelope, checkoutInput.bookingId);
      if (booking.ownerUserId !== actor.userId) forbidden("customer", "completePersonalizedCheckout for another customer");
      if (booking.sourceKind !== "quote" || booking.personalizedRequest === null) {
        conflict("Only a personalized quote can use this demo checkout.");
      }
      const request = requestForId(envelope, booking.personalizedRequest.id);
      if (!request || request.ownerUserId !== actor.userId || request.status !== "approved") {
        conflict("The administrator must approve the personalized request before checkout.");
      }
      if (booking.status === "confirmed" && booking.paymentStatus === "paid") {
        return clone(toCustomerBookingView(envelope, booking));
      }
      if (booking.status !== "pending_payment" || booking.paymentStatus !== null) conflict("The personalized quote is not ready for demo checkout.");
      if (booking.quoteAcceptedAt === null) conflict("The customer must accept the personalized quote before checkout.");
      if (Date.parse(timestamp()) >= Date.parse(booking.holdExpiresAt)) conflict("The personalized quote has expired.");
      booking.status = "confirmed";
      booking.paymentStatus = "paid";
      validateCrossReferences(envelope);
      writeEnvelope(makeEnvelope(bodyForIntegrity(envelope)));
      return clone(toCustomerBookingView(envelope, booking));
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
      return clone(personalizedRequestsForOwner(envelope, actor.userId).map(toCustomerRequest));
    },

    async cancelBooking(input: unknown): Promise<CancelBookingResult> {
      const cancellationInput = readValidatedCancelBooking(input);
      const envelope = readEnvelope();
      const actor = actorWithRole(envelope, "customer", "cancelBooking");
      const booking = findBooking(envelope, cancellationInput.bookingId);
      if (booking.ownerUserId !== actor.userId) forbidden("customer", "cancelBooking for another customer");

      const keyedEvent = envelope.bookingCancellations.find((event) =>
        event.customerUserId === actor.userId && event.idempotencyKey === cancellationInput.idempotencyKey,
      );
      if (keyedEvent !== undefined) {
        if (
          keyedEvent.bookingId === cancellationInput.bookingId &&
          keyedEvent.reasonCode === cancellationInput.reasonCode &&
          keyedEvent.otherReason === cancellationInput.otherReason
        ) {
          return clone({ cancellation: keyedEvent, bookingStatus: "cancelled", state: "replayed" });
        }
        conflict("The cancellation idempotency key conflicts with an earlier payload.");
      }
      if (
        envelope.bookingCancellations.some((event) => event.bookingId === booking.id) ||
        envelope.cancellations.some((request) => request.bookingId === booking.id)
      ) {
        conflict("A cancellation payload already exists for this booking.");
      }
      if (!canCancelBooking({
        actorRole: actor.role,
        actorUserId: actor.userId,
        bookingOwnerUserId: booking.ownerUserId,
        bookingStatus: booking.status,
      })) {
        conflict("This booking cannot be cancelled in its current state.");
      }
      if (booking.paymentStatus === "paid" || booking.paymentStatus === "review") {
        conflict("This booking already has payment authority.");
      }

      const event: DemoBookingCancellationRecord = {
        id: `demo-booking-cancellation-event-${envelope.bookingCancellations.length + 1}`,
        bookingId: booking.id,
        customerUserId: actor.userId,
        sourceKind: booking.sourceKind,
        reasonCode: cancellationInput.reasonCode,
        otherReason: cancellationInput.otherReason,
        idempotencyKey: cancellationInput.idempotencyKey,
        cancelledAt: timestamp(),
      };
      booking.status = "cancelled";
      booking.paymentStatus = null;
      if (booking.sourceKind === "quote") booking.quoteAcceptedAt = null;
      envelope.bookingCancellations.push(event);
      validateCrossReferences(envelope);
      writeEnvelope(makeEnvelope(bodyForIntegrity(envelope)));
      return clone({ cancellation: event, bookingStatus: "cancelled", state: "created" });
    },

    async requestCancellation(input: unknown): Promise<CancellationRequest> {
      const requestInput = readValidatedCancellationRequest(input);
      const envelope = readEnvelope();
      const actor = actorWithRole(envelope, "customer", "requestCancellation");
      const booking = findBooking(envelope, requestInput.bookingId);
      if (booking.ownerUserId !== actor.userId) forbidden("customer", "requestCancellation for another customer");
      const hasRequest = envelope.cancellations.some((request) => request.bookingId === booking.id);
      if (hasRequest) conflict("A cancellation request already exists for this booking.");
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
      return clone(envelope.requests.map(toAdminRequest));
    },

    async reviewPersonalizedRequest(input: unknown): Promise<AdminPersonalizedRequestProjection> {
      const reviewInput = readPersonalizedReviewInput(input);
      const envelope = readEnvelope();
      actorWithRole(envelope, "admin", "reviewPersonalizedRequest");
      const request = requestForId(envelope, reviewInput.requestId);
      if (!request) notFound("Personalized request", reviewInput.requestId);
      if (request.status !== "pending_review" && request.status !== "changes_requested") {
        conflict("This personalized request is already in a terminal state.");
      }
      const changedAt = timestamp();
      request.status = reviewInput.decision;
      request.updatedAt = changedAt;
      request.latestDecisionAt = changedAt;
      for (const booking of envelope.bookings) {
        if (booking.personalizedRequest?.id === request.id) {
          booking.personalizedRequest.status = request.status;
          booking.personalizedRequest.updatedAt = request.updatedAt;
          booking.personalizedRequest.latestDecisionAt = request.latestDecisionAt;
        }
      }
      writeEnvelope(makeEnvelope(bodyForIntegrity(envelope)));
      return clone(toAdminRequest(request));
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
  const customerCancellations: CustomerCancellationPort & {
    cancelBooking(input: CancelBookingInput): Promise<CancelBookingResult>;
  } = {
    cancelBooking: engine.cancelBooking,
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
  const demoIntegration: DemoPortalIntegration = {
    syncFixedBooking: engine.syncFixedBooking,
    submitPersonalizedRequest: engine.submitPersonalizedRequest,
    acceptPersonalizedQuote: engine.acceptPersonalizedQuote,
    completePersonalizedCheckout: engine.completePersonalizedCheckout,
  };
  const demoQuotes: AdminPersonalizedQuotesPort = {
    issueDemoQuote: engine.issueDemoQuote,
  };
  return {
    initialize: engine.initialize,
    reset: engine.reset,
    session,
    customer,
    guide,
    admin,
    demoIntegration,
    demoQuotes,
  };
}
