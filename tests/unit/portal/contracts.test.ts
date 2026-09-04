// @vitest-environment node

import { describe, expect, expectTypeOf, it } from "vitest";

import {
  CANCELLATION_REASON_CODES,
  PORTAL_PRODUCTION_GAP,
  ROLE_CAPABILITIES,
  canCancelBooking,
  canSubmitTourReview,
  canViewGuideAssignment,
  hasRoleCapability,
  isTourReviewEligible,
  parseBookingCancellation,
  parseCancelBookingResult,
  validateCancelBookingInput,
  validateCustomerAccountUpdate,
  validateGuideProfileUpdate,
  validateTourReviewInput,
  type CustomerBookingView,
  type CustomerAccountPort,
  type CustomerAccountUpdate,
  type AdminBookingProjection,
  type AdminBookingsPort,
  type DemoPortalIdentity,
  type DemoSessionPort,
  type PortalPortBindings,
  type PortalIdentity,
  type PortalSessionPort,
} from "@/lib/application/portal/contracts";
import type {
  AssignmentStatus,
  BookingStatus,
  CustomerBooking,
  CustomerCustomRequest,
  GuideAssignedBooking,
  Locale,
  PaymentStatus,
  RequestStatus,
  Role,
} from "@/lib/domain/data/contracts";

describe("portal contracts", () => {
  const cancellationEvent = {
    id: "demo-booking-cancellation-event-1",
    bookingId: "demo-booking-cancellation",
    customerUserId: "demo-user-customer",
    sourceKind: "departure",
    reasonCode: "trip_plan_changed",
    otherReason: null,
    idempotencyKey: "cancel-demo-booking-001",
    cancelledAt: "2026-09-04T08:30:00.000Z",
  } as const;

  it("publishes the exact frozen automatic-cancellation reason catalog", () => {
    expect(CANCELLATION_REASON_CODES).toEqual([
      "trip_plan_changed",
      "wrong_tour_or_departure",
      "booking_details_change",
      "tour_details_unsuitable",
      "price_unsuitable",
      "payment_unavailable",
      "other",
    ]);
    expect(Object.isFrozen(CANCELLATION_REASON_CODES)).toBe(true);
  });

  it.each([
    { bookingId: "demo-booking", reasonCode: null, otherReason: null, idempotencyKey: "cancel-booking-001" },
    { bookingId: "demo-booking", reasonCode: "trip_plan_changed", otherReason: null, idempotencyKey: "cancel-booking-002" },
    { bookingId: "demo-booking", reasonCode: "wrong_tour_or_departure", otherReason: null, idempotencyKey: "cancel-booking-003" },
    { bookingId: "demo-booking", reasonCode: "booking_details_change", otherReason: null, idempotencyKey: "cancel-booking-004" },
    { bookingId: "demo-booking", reasonCode: "tour_details_unsuitable", otherReason: null, idempotencyKey: "cancel-booking-005" },
    { bookingId: "demo-booking", reasonCode: "price_unsuitable", otherReason: null, idempotencyKey: "cancel-booking-006" },
    { bookingId: "demo-booking", reasonCode: "payment_unavailable", otherReason: null, idempotencyKey: "cancel-booking-007" },
    { bookingId: "demo-booking", reasonCode: "other", otherReason: "abc", idempotencyKey: "cancel-booking-008" },
    { bookingId: "demo-booking", reasonCode: "other", otherReason: "x".repeat(500), idempotencyKey: "cancel-booking-009" },
  ])("accepts the exact automatic-cancellation input payload %#", (input) => {
    expect(validateCancelBookingInput(input)).toEqual({ ok: true, value: input });
  });

  it.each([
    [{ bookingId: "demo-booking", reasonCode: null, otherReason: "changed", idempotencyKey: "cancel-booking-101" }, "input.otherReason"],
    [{ bookingId: "demo-booking", reasonCode: "trip_plan_changed", otherReason: "changed", idempotencyKey: "cancel-booking-102" }, "input.otherReason"],
    [{ bookingId: "demo-booking", reasonCode: "other", otherReason: null, idempotencyKey: "cancel-booking-103" }, "input.otherReason"],
    [{ bookingId: "demo-booking", reasonCode: "other", otherReason: "ab", idempotencyKey: "cancel-booking-104" }, "input.otherReason"],
    [{ bookingId: "demo-booking", reasonCode: "other", otherReason: "x".repeat(501), idempotencyKey: "cancel-booking-105" }, "input.otherReason"],
    [{ bookingId: "demo-booking", reasonCode: "other", otherReason: " padded ", idempotencyKey: "cancel-booking-106" }, "input.otherReason"],
    [{ bookingId: "demo-booking", reasonCode: "other", otherReason: "bad\u0000reason", idempotencyKey: "cancel-booking-107" }, "input.otherReason"],
    [{ bookingId: "demo-booking", reasonCode: "unknown", otherReason: null, idempotencyKey: "cancel-booking-108" }, "input.reasonCode"],
    [{ bookingId: "Bad booking", reasonCode: null, otherReason: null, idempotencyKey: "cancel-booking-109" }, "input.bookingId"],
    [{ bookingId: "demo-booking", reasonCode: null, otherReason: null, idempotencyKey: "bad key" }, "input.idempotencyKey"],
    [{ bookingId: "demo-booking", reasonCode: null, otherReason: null, idempotencyKey: "cancel-booking-110", extra: true }, "input.extra"],
  ] as const)("rejects invalid automatic-cancellation input %#", (input, fieldPath) => {
    expect(validateCancelBookingInput(input)).toMatchObject({ ok: false, error: { fieldPath } });
  });

  it("allows only the owning customer to cancel a pending-payment booking", () => {
    expect(canCancelBooking({
      actorRole: "customer",
      actorUserId: "demo-user-customer",
      bookingOwnerUserId: "demo-user-customer",
      bookingStatus: "pending_payment",
    })).toBe(true);
    expect(canCancelBooking({
      actorRole: "customer",
      actorUserId: "demo-user-secondary-customer",
      bookingOwnerUserId: "demo-user-customer",
      bookingStatus: "pending_payment",
    })).toBe(false);
    for (const actorRole of ["guide", "admin"] as const) {
      expect(canCancelBooking({
        actorRole,
        actorUserId: "demo-user-customer",
        bookingOwnerUserId: "demo-user-customer",
        bookingStatus: "pending_payment",
      })).toBe(false);
    }
    for (const bookingStatus of ["payment_processing", "confirmed", "payment_failed", "payment_review", "expired", "cancelled", "completed"] as const) {
      expect(canCancelBooking({
        actorRole: "customer",
        actorUserId: "demo-user-customer",
        bookingOwnerUserId: "demo-user-customer",
        bookingStatus,
      })).toBe(false);
    }
  });

  it("parses exact immutable cancellation events and results", () => {
    expect(parseBookingCancellation(cancellationEvent)).toEqual({ ok: true, value: cancellationEvent });
    expect(parseCancelBookingResult({
      cancellation: cancellationEvent,
      bookingStatus: "cancelled",
      state: "created",
    })).toEqual({
      ok: true,
      value: {
        cancellation: cancellationEvent,
        bookingStatus: "cancelled",
        state: "created",
      },
    });
    expect(parseCancelBookingResult({
      cancellation: cancellationEvent,
      bookingStatus: "cancelled",
      state: "replayed",
    })).toMatchObject({ ok: true, value: { state: "replayed" } });
  });

  it.each([
    { ...cancellationEvent, sourceKind: "request" },
    { ...cancellationEvent, reasonCode: null, otherReason: "changed" },
    { ...cancellationEvent, reasonCode: "other", otherReason: null },
    { ...cancellationEvent, cancelledAt: "not-a-timestamp" },
    { ...cancellationEvent, cancelledAt: "2026-02-30T08:30:00.000Z" },
    { ...cancellationEvent, cancelledAt: "2026-09-04T15:30:00.000+07:00" },
    { ...cancellationEvent, cancelledAt: "2026-09-04T08:30:00Z" },
    { ...cancellationEvent, privateCheckoutId: "secret" },
  ])("rejects malformed immutable cancellation event %#", (event) => {
    expect(parseBookingCancellation(event)).toMatchObject({ ok: false });
  });

  it.each([
    { cancellation: cancellationEvent, bookingStatus: "confirmed", state: "created" },
    { cancellation: cancellationEvent, bookingStatus: "cancelled", state: "resumed" },
    { cancellation: cancellationEvent, bookingStatus: "cancelled", state: "created", extra: true },
  ])("rejects inconsistent automatic-cancellation result %#", (result) => {
    expect(parseCancelBookingResult(result)).toMatchObject({ ok: false });
  });

  it("reuses the domain state and projection types without alternate state literals", () => {
    const role: Role = "customer";
    const locale: Locale = "vi";
    const requestStatus: RequestStatus = "pending_review";
    const bookingStatus: BookingStatus = "completed";
    const paymentStatus: PaymentStatus = "paid";
    const assignmentStatus: AssignmentStatus = "assigned";
    const customerRequest: CustomerCustomRequest = {
      id: "demo-request",
      planId: "demo-plan",
      revisionNo: 1,
      status: requestStatus,
      submittedAt: "2026-08-31T00:00:00Z",
      updatedAt: "2026-08-31T00:00:00Z",
    };
    const booking = {} as CustomerBooking;
    const assigned = {} as GuideAssignedBooking;
    const view: CustomerBookingView = {
      ...booking,
      paymentStatus,
      quoteAcceptedAt: null,
      cancellation: null,
      review: null,
    };

    expect({ role, locale, requestStatus, bookingStatus, paymentStatus, assignmentStatus }).toEqual({
      role: "customer",
      locale: "vi",
      requestStatus: "pending_review",
      bookingStatus: "completed",
      paymentStatus: "paid",
      assignmentStatus: "assigned",
    });
    expect(customerRequest.status).toBe("pending_review");
    expect(assigned).toEqual({});
    expect(view.paymentStatus).toBe("paid");
  });

  it("defines a frozen production-gap description for every unsupported seam", () => {
    expect(Object.isFrozen(PORTAL_PRODUCTION_GAP)).toBe(true);
    expect(PORTAL_PRODUCTION_GAP.tourReview).toMatch(/migration\/RPC\/RLS/i);
    expect(PORTAL_PRODUCTION_GAP.profile).toMatch(/migration\/RPC\/RLS/i);
    expect(PORTAL_PRODUCTION_GAP.adminCrud).toMatch(/migration\/RPC\/RLS/i);
    expect(PORTAL_PRODUCTION_GAP.personalizedTourGuideAssignment).toMatch(/not supported.*current production RPC/i);
  });

  it("exposes direct customer cancellation and no administrator decision capability", () => {
    expect(ROLE_CAPABILITIES.customer).toContain("customer_booking_cancel");
    expect(ROLE_CAPABILITIES.customer).not.toContain("customer_cancellation_request");
    expect(ROLE_CAPABILITIES.admin).toContain("admin_cancellation_read");
    expect(ROLE_CAPABILITIES.admin).not.toContain("admin_cancellation_decide");
  });

  it("keeps production sessions neutral and demo identity selection demo-only", async () => {
    const identity: PortalIdentity = {
      userId: "demo-user-customer",
      role: "customer",
      locale: "en",
      displayName: "Demo Traveler",
      email: "traveler@example.invalid",
    };
    const demoIdentity: DemoPortalIdentity = { ...identity, demo: true };
    const productionSession: PortalSessionPort = {
      getSession: async () => identity,
      signOut: async () => undefined,
    };
    const session: DemoSessionPort = {
      getSession: async () => demoIdentity,
      signOut: async () => undefined,
      selectDemoIdentity: async () => demoIdentity,
    };

    await expect(productionSession.getSession()).resolves.toEqual(identity);
    await expect(session.selectDemoIdentity("demo-user-customer")).resolves.toEqual(demoIdentity);
    await expect(session.getSession()).resolves.toEqual(demoIdentity);
    expect(productionSession).not.toHaveProperty("selectDemoIdentity");
    expect(session).not.toHaveProperty("setRole");

    // The production composition binding must not expose a demo identity selector.
    type ProductionSession = PortalPortBindings["session"];
    const productionBinding: ProductionSession = productionSession;
    expect(productionBinding).toBe(productionSession);
    type ProductionSessionRejectsDemoSelector = PortalSessionPort extends { selectDemoIdentity?: never } ? true : false;
    type ProductionIdentityRejectsDemoMarker = PortalIdentity extends { demo?: never } ? true : false;
    type DemoSessionIsNotProduction = DemoSessionPort extends PortalSessionPort ? false : true;
    type DemoIdentityIsNotProduction = DemoPortalIdentity extends PortalIdentity ? false : true;
    const typeBoundaryChecks: [
      ProductionSessionRejectsDemoSelector,
      ProductionIdentityRejectsDemoMarker,
      DemoSessionIsNotProduction,
      DemoIdentityIsNotProduction,
    ] = [true, true, true, true];
    expect(typeBoundaryChecks).toEqual([true, true, true, true]);
    expectTypeOf<DemoSessionPort>().not.toMatchTypeOf<PortalSessionPort>();
    expectTypeOf<DemoPortalIdentity>().not.toMatchTypeOf<PortalIdentity>();
    expectTypeOf(null as unknown as DemoSessionPort).toHaveProperty("selectDemoIdentity");
    expectTypeOf(null as unknown as DemoPortalIdentity).toHaveProperty("demo");
  });

  it("validates allowlisted profile fields and rejects unknown/control/oversized values", () => {
    const validCustomer: CustomerAccountUpdate = {
      displayName: "Nguyễn An",
      nationality: "Vietnamese",
      email: "traveler@example.invalid",
      phone: null,
      language: "en",
    };
    expect(validateCustomerAccountUpdate(validCustomer)).toEqual({ ok: true, value: validCustomer });
    expect(validateCustomerAccountUpdate({ ...validCustomer, role: "admin" } as never)).toMatchObject({
      ok: false,
      error: { fieldPath: "input.role" },
    });
    expect(validateCustomerAccountUpdate({ displayName: "bad\nname" })).toMatchObject({
      ok: false,
      error: { fieldPath: "input.displayName" },
    });
    expect(validateCustomerAccountUpdate({ email: "not-an-email" })).toMatchObject({
      ok: false,
      error: { fieldPath: "input.email" },
    });
    expect(validateCustomerAccountUpdate({ email: `${"a".repeat(250)}@x.io` })).toMatchObject({
      ok: false,
      error: { fieldPath: "input.email" },
    });
    expect(validateCustomerAccountUpdate({ nationality: "Vietnamese\u0000" })).toMatchObject({
      ok: false,
      error: { fieldPath: "input.nationality" },
    });
    expect(validateCustomerAccountUpdate({ nationality: "123" })).toMatchObject({
      ok: false,
      error: { fieldPath: "input.nationality" },
    });
    expect(validateGuideProfileUpdate({ bio: "x".repeat(1001) })).toMatchObject({
      ok: false,
      error: { fieldPath: "input.bio" },
    });
    expect(validateCustomerAccountUpdate({})).toMatchObject({ ok: false });
  });

  it("validates tour review inputs with strict fields and policy", () => {
    expect(validateTourReviewInput({ bookingId: "demo-booking", rating: 5, text: "Great tour." })).toMatchObject({ ok: true });
    expect(validateTourReviewInput({ bookingId: "demo-booking", rating: 0, text: "No." })).toMatchObject({ ok: false });
    expect(validateTourReviewInput({ bookingId: "demo-booking", rating: 5, text: " " })).toMatchObject({ ok: false });
    expect(validateTourReviewInput({ bookingId: "demo-booking", rating: 5, text: "ok", extra: true } as never)).toMatchObject({
      ok: false,
      error: { fieldPath: "input.extra" },
    });
  });

  it("keeps customer and admin booking projections on distinct actor-safe methods", () => {
    const customerPort: Pick<CustomerAccountPort, "listCustomerBookings"> = {
      listCustomerBookings: async () => [] as CustomerBookingView[],
    };
    const adminPort: AdminBookingsPort = {
      listAdminBookings: async () => [] as AdminBookingProjection[],
    };

    expect(customerPort).toHaveProperty("listCustomerBookings");
    expect(customerPort).not.toHaveProperty("listAdminBookings");
    expect(adminPort).toHaveProperty("listAdminBookings");
    expect(adminPort).not.toHaveProperty("listCustomerBookings");
  });

  it("centralizes actor capability, ownership/completion/review, and guide visibility policy", () => {
    expect(hasRoleCapability("customer", "customer_profile_update")).toBe(true);
    expect(hasRoleCapability("guide", "admin_cancellation_read")).toBe(false);
    expect(hasRoleCapability("admin", "not-a-capability")).toBe(false);
    expect(isTourReviewEligible({ actorUserId: "customer", bookingOwnerUserId: "customer", bookingStatus: "completed", hasExistingReview: false })).toBe(true);
    expect(canSubmitTourReview({ actorUserId: "customer", bookingOwnerUserId: "other", bookingStatus: "completed", hasExistingReview: false })).toBe(false);
    expect(isTourReviewEligible({ actorUserId: "customer", bookingOwnerUserId: "customer", bookingStatus: "confirmed", hasExistingReview: false })).toBe(false);
    expect(canSubmitTourReview({ actorUserId: "customer", bookingOwnerUserId: "customer", bookingStatus: "completed", hasExistingReview: true })).toBe(false);
    expect(canViewGuideAssignment({ actorRole: "guide", actorUserId: "guide-1", assignedGuideUserId: "guide-1" })).toBe(true);
    expect(canViewGuideAssignment({ actorRole: "guide", actorUserId: "guide-1", assignedGuideUserId: "guide-2" })).toBe(false);
    expect(canViewGuideAssignment({ actorRole: "admin", actorUserId: "admin", assignedGuideUserId: "guide-1" })).toBe(false);
  });
});
