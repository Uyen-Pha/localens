// @vitest-environment node

import { describe, expect, expectTypeOf, it } from "vitest";

import {
  PORTAL_PRODUCTION_GAP,
  canRequestCancellation,
  canSubmitTourReview,
  canViewGuideAssignment,
  hasRoleCapability,
  isTourReviewEligible,
  validateCancellationDecisionInput,
  validateCancellationRequestInput,
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
      cancellationRequest: null,
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
    expect(PORTAL_PRODUCTION_GAP.cancellation).toMatch(/migration\/RPC\/RLS/i);
    expect(PORTAL_PRODUCTION_GAP.tourReview).toMatch(/migration\/RPC\/RLS/i);
    expect(PORTAL_PRODUCTION_GAP.profile).toMatch(/migration\/RPC\/RLS/i);
    expect(PORTAL_PRODUCTION_GAP.adminCrud).toMatch(/migration\/RPC\/RLS/i);
    expect(PORTAL_PRODUCTION_GAP.personalizedTourGuideAssignment).toMatch(/not supported.*current production RPC/i);
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

  it("validates tour review and cancellation inputs with strict fields and policy", () => {
    expect(validateTourReviewInput({ bookingId: "demo-booking", rating: 5, text: "Great tour." })).toMatchObject({ ok: true });
    expect(validateTourReviewInput({ bookingId: "demo-booking", rating: 0, text: "No." })).toMatchObject({ ok: false });
    expect(validateTourReviewInput({ bookingId: "demo-booking", rating: 5, text: " " })).toMatchObject({ ok: false });
    expect(validateTourReviewInput({ bookingId: "demo-booking", rating: 5, text: "ok", extra: true } as never)).toMatchObject({
      ok: false,
      error: { fieldPath: "input.extra" },
    });
    expect(validateCancellationRequestInput({ bookingId: "demo-booking", reason: "Plans changed." })).toMatchObject({ ok: true });
    expect(validateCancellationRequestInput({ bookingId: "demo-booking", reason: "bad\u0000reason" })).toMatchObject({ ok: false });
    expect(validateCancellationDecisionInput({ requestId: "demo-cancellation", decision: "approved", note: null })).toMatchObject({ ok: true });
    expect(validateCancellationDecisionInput({ requestId: "demo-cancellation", decision: "approved", note: "Approved with a record." })).toMatchObject({ ok: true });
    expect(validateCancellationDecisionInput({ requestId: "demo-cancellation", decision: "rejected", note: null })).toMatchObject({ ok: true });
    expect(validateCancellationDecisionInput({ requestId: "demo-cancellation", decision: "rejected", note: "Policy keeps this booking." })).toMatchObject({ ok: true });
    expect(validateCancellationDecisionInput({ requestId: "demo-cancellation", decision: "approved", note: "bad\u0000note" })).toMatchObject({ ok: false });
    expect(validateCancellationDecisionInput({ requestId: "demo-cancellation", decision: "rejected", note: "x".repeat(1001) })).toMatchObject({ ok: false });
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

  it("centralizes actor capability, ownership/completion/review, cancellation, and guide visibility policy", () => {
    expect(hasRoleCapability("customer", "customer_profile_update")).toBe(true);
    expect(hasRoleCapability("guide", "admin_cancellation_decide")).toBe(false);
    expect(hasRoleCapability("admin", "not-a-capability")).toBe(false);
    expect(isTourReviewEligible({ actorUserId: "customer", bookingOwnerUserId: "customer", bookingStatus: "completed", hasExistingReview: false })).toBe(true);
    expect(canSubmitTourReview({ actorUserId: "customer", bookingOwnerUserId: "other", bookingStatus: "completed", hasExistingReview: false })).toBe(false);
    expect(isTourReviewEligible({ actorUserId: "customer", bookingOwnerUserId: "customer", bookingStatus: "confirmed", hasExistingReview: false })).toBe(false);
    expect(canSubmitTourReview({ actorUserId: "customer", bookingOwnerUserId: "customer", bookingStatus: "completed", hasExistingReview: true })).toBe(false);
    expect(canRequestCancellation({ actorUserId: "customer", bookingOwnerUserId: "customer", bookingStatus: "confirmed", hasPendingRequest: false })).toBe(true);
    expect(canRequestCancellation({ actorUserId: "customer", bookingOwnerUserId: "customer", bookingStatus: "completed", hasPendingRequest: false })).toBe(false);
    expect(canViewGuideAssignment({ actorRole: "guide", actorUserId: "guide-1", assignedGuideUserId: "guide-1" })).toBe(true);
    expect(canViewGuideAssignment({ actorRole: "guide", actorUserId: "guide-1", assignedGuideUserId: "guide-2" })).toBe(false);
    expect(canViewGuideAssignment({ actorRole: "admin", actorUserId: "admin", assignedGuideUserId: "guide-1" })).toBe(false);
  });
});
