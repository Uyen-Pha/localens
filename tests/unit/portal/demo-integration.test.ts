// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  createPortalComposition,
  type DemoPortalComposition,
} from "@/lib/application/portal/composition";
import {
  createMemorySessionStorage,
} from "@/lib/infrastructure/demo/portal-repository";

const NOW = "2026-08-31T12:00:00.000Z";
const DEPARTURE_ID = "demo-departure-markets-and-street-food-2026-09-05";

async function composition(): Promise<DemoPortalComposition> {
  const value = createPortalComposition({
    mode: "demo",
    storage: createMemorySessionStorage(),
    now: () => NOW,
  });
  await value.initialized;
  return value;
}

function fixedBookingInput(status: "held" | "paid" = "held") {
  return {
    bookingId: `demo-booking-${DEPARTURE_ID}-2`,
    departureId: DEPARTURE_ID,
    tourSlug: "demo-markets-and-street-food",
    date: "2026-09-05",
    startsAt: "09:00",
    meetingPoint: "Ben Thanh Market north gate",
    partySize: 2,
    locale: "en" as const,
    unitPriceMinor: 480_000,
    totalMinor: 960_000,
    holdExpiresAt: "2026-09-05T12:35:00.000Z",
    createdAt: "2026-09-05T12:00:00.000Z",
    status,
    paymentStatus: status === "paid" ? ("succeeded" as const) : ("unpaid" as const),
  };
}

describe("demo portal integration boundary", () => {
  it("syncs a fixed booking without recomputing its quote, then exposes it to admin", async () => {
    const value = await composition();
    await value.session.selectDemoIdentity("demo-user-customer");

    await expect(value.demoIntegration.syncFixedBooking({
      ...fixedBookingInput(),
      totalMinor: 1,
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await value.demoIntegration.syncFixedBooking(fixedBookingInput("held"));
    const held = await value.customer.account.listCustomerBookings();
    expect(held.find((booking) => booking.id === fixedBookingInput().bookingId)).toMatchObject({
      status: "pending_payment",
      paymentStatus: "pending",
      totalVndMinor: "960000",
    });

    await value.demoIntegration.syncFixedBooking(fixedBookingInput("paid"));
    const admin = value.admin;
    await value.session.selectDemoIdentity("demo-user-admin");
    await expect(admin.bookings.listAdminBookings()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: fixedBookingInput().bookingId,
          status: "confirmed",
          paymentStatus: "paid",
          totalVndMinor: "960000",
        }),
      ]),
    );
  });

  it("runs fixed assignment and keeps a guide cancellation notice scoped to that assignment", async () => {
    const value = await composition();
    await value.session.selectDemoIdentity("demo-user-customer");
    await value.demoIntegration.syncFixedBooking(fixedBookingInput("paid"));

    await value.session.selectDemoIdentity("demo-user-admin");
    await value.admin.assignments.assignGuideToFixedDeparture({
      bookingId: fixedBookingInput().bookingId,
      guideUserId: "demo-user-guide",
    });
    const bookings = await value.admin.bookings.listAdminBookings();
    expect(bookings.find((booking) => booking.id === fixedBookingInput().bookingId)?.assignedGuideUserId).toBe("demo-user-guide");

    await value.session.selectDemoIdentity("demo-user-customer");
    const cancellation = await value.customer.cancellations.requestCancellation({
      bookingId: fixedBookingInput().bookingId,
      reason: "Plans changed.",
    });
    expect(cancellation.status).toBe("pending");

    await value.session.selectDemoIdentity("demo-user-admin");
    await value.admin.cancellations.decideCancellation({
      requestId: cancellation.id,
      decision: "approved",
      note: null,
    });
    await value.session.selectDemoIdentity("demo-user-guide");
    await expect(value.guide.assignments.listAssignedTours()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bookingId: fixedBookingInput().bookingId,
          cancellationStatus: "approved",
          startAt: "2026-09-05T09:00:00+07:00",
          endAt: null,
        }),
      ]),
    );
  });

  it("keeps personalized requests independent until admin approval and an issued quote", async () => {
    const value = await composition();
    await value.session.selectDemoIdentity("demo-user-customer");

    const submitted = await value.demoIntegration.submitPersonalizedRequest({
      requestId: "demo-request-plan-personalized-2",
      planId: "demo-plan-personalized",
      revisionNo: 2,
      locale: "en",
      partySize: 3,
      totalVndMinor: 1_250_000,
      specialNeeds: "Prefer a quiet route.",
      createdAt: "2026-09-05T12:00:00.000Z",
    });
    expect(submitted.request).toMatchObject({ status: "pending_review", revisionNo: 2 });
    const customerBookings = await value.customer.account.listCustomerBookings();
    expect(customerBookings.some((booking) => booking.id === "demo-booking-demo-request-plan-personalized-2")).toBe(false);

    await value.session.selectDemoIdentity("demo-user-admin");
    await expect(value.admin.personalizedRequests.listPersonalizedRequests()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "demo-request-plan-personalized-2", status: "pending_review" }),
      ]),
    );
    await value.admin.personalizedRequests.reviewPersonalizedRequest({
      requestId: "demo-request-plan-personalized-2",
      decision: "approved",
      note: null,
    });
    await expect(value.demoQuotes.issueDemoQuote({
      requestId: "demo-request-plan-personalized-2",
      amountVndMinor: 1_250_000,
    })).resolves.toMatchObject({
      requestId: "demo-request-plan-personalized-2",
      amountVndMinor: "1250000",
      titleEn: "A Personal Saigon Day",
      titleVi: "Một ngày Sài Gòn theo sở thích",
    });

    await expect(value.demoQuotes.issueDemoQuote({
      requestId: "demo-request-plan-personalized-2",
      amountVndMinor: 1_250_000,
      // @ts-expect-error quote metadata is repository-owned seeded fixture data
      titleEn: "Caller supplied title",
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });

    await value.session.selectDemoIdentity("demo-user-customer");
    await expect(value.demoIntegration.completePersonalizedCheckout({
      bookingId: "demo-booking-demo-request-plan-personalized-2",
    })).resolves.toMatchObject({
      status: "confirmed",
      paymentStatus: "paid",
      totalVndMinor: "1250000",
    });
    await value.session.selectDemoIdentity("demo-user-admin");
    await expect(value.admin.assignments.assignGuideToFixedDeparture({
      bookingId: "demo-booking-demo-request-plan-personalized-2",
      guideUserId: "demo-user-guide",
    })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("fails closed when a non-customer tries to use the customer ingress", async () => {
    const value = await composition();
    await value.session.selectDemoIdentity("demo-user-admin");

    await expect(value.demoIntegration.syncFixedBooking(fixedBookingInput())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
