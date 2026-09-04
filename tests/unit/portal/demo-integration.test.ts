// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createPortalComposition,
  type DemoPortalComposition,
} from "@/lib/application/portal/composition";
import {
  localDraftFingerprint,
  type CustomRequestDraft,
  type CustomRequestDraftInput,
} from "@/lib/application/planner/custom-request-demo";
import {
  createDemoPlannerAdapter,
  type DemoPlannerState,
} from "@/lib/application/planner/demo-planner";
import {
  isPersonalizationRequest,
  type PersonalizationRequest,
} from "@/lib/application/planner/personalization-session";
import {
  PORTAL_DEMO_STORAGE_KEY,
  createMemorySessionStorage,
} from "@/lib/infrastructure/demo/portal-repository";
import {
  FOOD_FIXTURE,
  createFoodFixturePlannerState,
} from "../../e2e/food-fixture";

const NOW = "2026-08-31T12:00:00.000Z";
const DEPARTURE_ID = "demo-departure-markets-and-street-food-2026-09-05";
const originalE2EFixtureFlag = process.env.NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES;

beforeAll(() => {
  process.env.NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES = "1";
});

afterAll(() => {
  if (originalE2EFixtureFlag === undefined) delete process.env.NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES;
  else process.env.NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES = originalE2EFixtureFlag;
});

const personalizedPreferences: PersonalizationRequest = {
  startAt: "2026-09-05T10:30:00+07:00",
  durationMinutes: 360,
  areas: ["demo-hcmc-district-1"],
  budget: { currency: "VND", amountMinor: 2_000_000 },
  partySize: 3,
  guideLanguage: "en",
  priorityWeights: { street_food: 0, history: 3, traditional_craft: 0, traditional_market: 4 },
  pace: "active",
  dietaryRequirements: [],
  mobilityRequirements: [],
  lockedStopIds: [],
  specialNeeds: "Prefer a quiet route.",
};

function confirmedDraft(state: DemoPlannerState): CustomRequestDraft {
  if (state.preferences === null) throw new Error("Expected confirmed planner preferences.");
  const input: CustomRequestDraftInput = {
    planId: state.planId,
    revision: state.current.revision,
    preferences: state.preferences,
    revisionSnapshot: state.current,
  };
  return { ...input, integrityFingerprint: localDraftFingerprint(input) };
}

function confirmedDraftInputForTest(draft: CustomRequestDraft): CustomRequestDraftInput {
  return {
    planId: draft.planId,
    revision: draft.revision,
    preferences: draft.preferences,
    revisionSnapshot: draft.revisionSnapshot,
  };
}

function personalizedRequestInput(
  state = createDemoPlannerAdapter().createInitial("en", personalizedPreferences),
  requestId = `demo-request-${state.planId}-${state.current.revision}`,
) {
  return {
    requestId,
    locale: state.locale,
    confirmedDraft: confirmedDraft(state),
    createdAt: "2026-09-05T12:00:00.000Z",
  };
}

async function composition(now: () => string = () => NOW): Promise<DemoPortalComposition> {
  const value = createPortalComposition({
    mode: "demo",
    storage: createMemorySessionStorage(),
    now,
  });
  await value.initialized;
  return value;
}

function fixedBookingInput(status: "held" | "paid" = "held") {
  return {
    bookingId: `demo-booking-demo-user-customer-${DEPARTURE_ID}-2`,
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
  it("seeds a self-validating confirmed revision snapshot", async () => {
    const storage = createMemorySessionStorage();
    const value = createPortalComposition({ mode: "demo", storage, now: () => NOW });
    await value.initialized;
    const envelope = JSON.parse(storage.getItem(PORTAL_DEMO_STORAGE_KEY) ?? "null") as {
      requests: Array<{ locale: "en" | "vi"; confirmedDraft: CustomRequestDraft }>;
    };
    const seeded = envelope.requests[0];
    if (seeded === undefined) throw new Error("Expected seeded request.");
    const draftInput = confirmedDraftInputForTest(seeded.confirmedDraft);

    expect(isPersonalizationRequest(seeded.confirmedDraft.preferences)).toBe(true);
    expect(localDraftFingerprint(draftInput)).toBe(seeded.confirmedDraft.integrityFingerprint);
    expect(createDemoPlannerAdapter().createInitial(seeded.locale, seeded.confirmedDraft.preferences).current)
      .toEqual(seeded.confirmedDraft.revisionSnapshot);
    await expect(value.session.selectDemoIdentity("demo-user-customer")).resolves.toMatchObject({ role: "customer" });
  });

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
    expect(held.filter((booking) => booking.id === fixedBookingInput().bookingId)).toHaveLength(1);

    // Failed, cancelled, expired and retried browser attempts all resync the
    // same held booking projection until one attempt succeeds.
    await value.demoIntegration.syncFixedBooking(fixedBookingInput("held"));
    await value.demoIntegration.syncFixedBooking(fixedBookingInput("held"));
    const retried = await value.customer.account.listCustomerBookings();
    expect(retried.filter((booking) => booking.id === fixedBookingInput().bookingId)).toHaveLength(1);

    await value.demoIntegration.syncFixedBooking(fixedBookingInput("paid"));
    const admin = value.admin;
    await value.session.selectDemoIdentity("demo-user-admin");
    const adminBookings = await admin.bookings.listAdminBookings();
    expect(adminBookings.filter((booking) => booking.id === fixedBookingInput().bookingId)).toHaveLength(1);
    expect(adminBookings.find((booking) => booking.id === fixedBookingInput().bookingId)).toMatchObject({
      status: "confirmed",
      paymentStatus: "paid",
      totalVndMinor: "960000",
    });
  });

  it("keeps identical fixed-tour selections isolated by customer at the repository boundary", async () => {
    const value = await composition();
    const primary = fixedBookingInput();
    const secondary = {
      ...primary,
      bookingId: `demo-booking-demo-user-secondary-customer-${DEPARTURE_ID}-2`,
    };

    await value.session.selectDemoIdentity("demo-user-customer");
    await value.demoIntegration.syncFixedBooking(primary);
    await value.session.selectDemoIdentity("demo-user-secondary-customer");
    await value.demoIntegration.syncFixedBooking(secondary);
    const secondaryIds = (await value.customer.account.listCustomerBookings()).map((booking) => booking.id);
    expect(secondaryIds).toContain(secondary.bookingId);
    expect(secondaryIds).not.toContain(primary.bookingId);

    await value.session.selectDemoIdentity("demo-user-customer");
    const primaryIds = (await value.customer.account.listCustomerBookings()).map((booking) => booking.id);
    expect(primaryIds).toContain(primary.bookingId);
    expect(primaryIds).not.toContain(secondary.bookingId);
  });

  it("keeps an assigned paid booking visible to its guide but outside the immediate-cancellation window", async () => {
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
    await expect(value.customer.cancellations.cancelBooking({
      bookingId: fixedBookingInput().bookingId,
      reasonCode: null,
      otherReason: null,
      idempotencyKey: "cancel-paid-assigned-001",
    })).rejects.toMatchObject({ code: "CONFLICT" });

    await value.session.selectDemoIdentity("demo-user-guide");
    await expect(value.guide.assignments.listAssignedTours()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bookingId: fixedBookingInput().bookingId,
          cancellationStatus: null,
          startAt: "2026-09-05T09:00:00+07:00",
          endAt: null,
        }),
      ]),
    );
  });

  it("keeps personalized requests independent until admin approval and an issued quote", async () => {
    const value = await composition();
    await value.session.selectDemoIdentity("demo-user-customer");

    const requestInput = personalizedRequestInput(undefined, "demo-request-plan-personalized-1");
    const expectedAmount = requestInput.confirmedDraft.revisionSnapshot.totals.customerPayableVnd;
    const submitted = await value.demoIntegration.submitPersonalizedRequest(requestInput);
    expect(submitted.request).toMatchObject({ status: "pending_review", revisionNo: 1 });
    const customerBookings = await value.customer.account.listCustomerBookings();
    expect(customerBookings.some((booking) => booking.id === "demo-booking-demo-request-plan-personalized-1")).toBe(false);

    await value.session.selectDemoIdentity("demo-user-admin");
    await expect(value.admin.personalizedRequests.listPersonalizedRequests()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "demo-request-plan-personalized-1",
          status: "pending_review",
          requestedTotalVndMinor: String(expectedAmount),
          confirmedRevisionFingerprint: requestInput.confirmedDraft.integrityFingerprint,
          confirmedRevisionSnapshot: requestInput.confirmedDraft.revisionSnapshot,
        }),
      ]),
    );
    await value.admin.personalizedRequests.reviewPersonalizedRequest({
      requestId: "demo-request-plan-personalized-1",
      decision: "approved",
      note: null,
    });
    await expect(value.demoQuotes.issueDemoQuote({
      requestId: "demo-request-plan-personalized-1",
    })).resolves.toMatchObject({
      requestId: "demo-request-plan-personalized-1",
      amountVndMinor: String(expectedAmount),
      titleEn: "A Personal Saigon Day",
      titleVi: "Một ngày Sài Gòn theo sở thích",
      issuedAt: NOW,
      expiresAt: "2026-09-02T12:00:00.000Z",
      acceptedAt: null,
    });

    await expect(value.demoQuotes.issueDemoQuote({
      requestId: "demo-request-plan-personalized-1",
      // @ts-expect-error quote amount is repository-owned
      amountVndMinor: 1,
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });

    await value.session.selectDemoIdentity("demo-user-secondary-customer");
    await expect(value.demoIntegration.acceptPersonalizedQuote({
      bookingId: "demo-booking-demo-request-plan-personalized-1",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(value.demoIntegration.completePersonalizedCheckout({
      bookingId: "demo-booking-demo-request-plan-personalized-1",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await value.session.selectDemoIdentity("demo-user-customer");
    await expect(value.demoIntegration.completePersonalizedCheckout({
      bookingId: "demo-booking-demo-request-plan-personalized-1",
    })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(value.demoIntegration.acceptPersonalizedQuote({
      bookingId: "demo-booking-demo-request-plan-personalized-1",
    })).resolves.toMatchObject({ quoteAcceptedAt: NOW });
    await expect(value.demoIntegration.completePersonalizedCheckout({
      bookingId: "demo-booking-demo-request-plan-personalized-1",
    })).resolves.toMatchObject({
      status: "confirmed",
      paymentStatus: "paid",
      totalVndMinor: String(expectedAmount),
      quoteAcceptedAt: NOW,
    });
    await value.session.selectDemoIdentity("demo-user-admin");
    await expect(value.admin.assignments.assignGuideToFixedDeparture({
      bookingId: "demo-booking-demo-request-plan-personalized-1",
      guideUserId: "demo-user-guide",
    })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("stores an immutable confirmed snapshot and rejects a recomputed research-only draft", async () => {
    const value = await composition();
    await value.session.selectDemoIdentity("demo-user-customer");
    const state = createFoodFixturePlannerState("en", "mixed");
    const input = personalizedRequestInput(state, "demo-request-immutable-snapshot");
    const originalTitle = input.confirmedDraft.revisionSnapshot.items[0]?.title;

    await value.demoIntegration.submitPersonalizedRequest(input);
    const mutableInput = input as unknown as {
      confirmedDraft: { revisionSnapshot: { items: Array<{ title: string }> } };
    };
    if (mutableInput.confirmedDraft.revisionSnapshot.items[0] === undefined) throw new Error("Expected a planner item.");
    mutableInput.confirmedDraft.revisionSnapshot.items[0].title = "Caller mutation after submit";

    await value.session.selectDemoIdentity("demo-user-admin");
    expect((await value.admin.personalizedRequests.listPersonalizedRequests())
      .find((request) => request.id === "demo-request-immutable-snapshot")?.confirmedRevisionSnapshot.items[0]?.title)
      .toBe(originalTitle);

    await value.session.selectDemoIdentity("demo-user-customer");
    const approvedFoodState = createFoodFixturePlannerState("en", "approved");
    const forgedDraftInput: CustomRequestDraftInput = {
      planId: approvedFoodState.planId,
      revision: approvedFoodState.current.revision,
      preferences: approvedFoodState.preferences!,
      revisionSnapshot: {
        ...approvedFoodState.current,
        items: approvedFoodState.current.items.map((item, index) => index === 0 ? {
          ...item,
          placeId: FOOD_FIXTURE.researchMarketPlaceId,
          title: "E2E Research Market",
        } : item),
      },
    };
    await expect(value.demoIntegration.submitPersonalizedRequest({
      requestId: "demo-request-research-only-forged",
      locale: "en",
      confirmedDraft: {
        ...forgedDraftInput,
        integrityFingerprint: localDraftFingerprint(forgedDraftInput),
      },
      createdAt: "2026-09-05T12:00:00.000Z",
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("accepts a zero-payable food request but cannot issue a quote or fabricate payment", async () => {
    const value = await composition();
    await value.session.selectDemoIdentity("demo-user-customer");
    const state = createFoodFixturePlannerState("vi", "approved");

    await expect(value.demoIntegration.submitPersonalizedRequest(
      personalizedRequestInput(state, "demo-request-food-only-1"),
    )).resolves.toMatchObject({
      request: { id: "demo-request-food-only-1", status: "pending_review" },
    });
    expect((await value.customer.account.listCustomerBookings())
      .some((booking) => booking.id === "demo-booking-demo-request-food-only-1")).toBe(false);

    await value.session.selectDemoIdentity("demo-user-admin");
    expect((await value.admin.personalizedRequests.listPersonalizedRequests())
      .find((request) => request.id === "demo-request-food-only-1")).toMatchObject({
        requestedTotalVndMinor: "0",
        status: "pending_review",
      });
    await value.admin.personalizedRequests.reviewPersonalizedRequest({
      requestId: "demo-request-food-only-1",
      decision: "approved",
      note: null,
    });
    await expect(value.demoQuotes.issueDemoQuote({
      requestId: "demo-request-food-only-1",
    })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("persists acceptance but rejects checkout after the 48-hour quote expiry", async () => {
    let current = NOW;
    const value = await composition(() => current);
    await value.session.selectDemoIdentity("demo-user-customer");
    const input = personalizedRequestInput(undefined, "demo-request-expiring-quote");
    await value.demoIntegration.submitPersonalizedRequest(input);
    await value.session.selectDemoIdentity("demo-user-admin");
    await value.admin.personalizedRequests.reviewPersonalizedRequest({
      requestId: input.requestId,
      decision: "approved",
      note: null,
    });
    const quote = await value.demoQuotes.issueDemoQuote({ requestId: input.requestId });
    expect(Date.parse(quote.expiresAt) - Date.parse(quote.issuedAt)).toBe(48 * 60 * 60 * 1000);

    await value.session.selectDemoIdentity("demo-user-customer");
    await value.demoIntegration.acceptPersonalizedQuote({ bookingId: quote.bookingId });
    current = "2026-09-02T12:00:00.001Z";
    await expect(value.demoIntegration.completePersonalizedCheckout({
      bookingId: quote.bookingId,
    })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await value.customer.account.listCustomerBookings())
      .find((booking) => booking.id === quote.bookingId)?.quoteAcceptedAt).toBe(NOW);
  });

  it("fails closed when a non-customer tries to use the customer ingress", async () => {
    const value = await composition();
    await value.session.selectDemoIdentity("demo-user-admin");

    await expect(value.demoIntegration.syncFixedBooking(fixedBookingInput())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(value.demoIntegration.submitPersonalizedRequest({
      requestId: "demo-request-forged-admin",
      locale: "en",
      confirmedDraft: confirmedDraft(createDemoPlannerAdapter().createInitial("en", personalizedPreferences)),
      createdAt: NOW,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(value.demoIntegration.completePersonalizedCheckout({
      bookingId: "demo-booking-personalized",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await value.session.selectDemoIdentity("demo-user-customer");
    await expect(value.admin.personalizedRequests.listPersonalizedRequests()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(value.admin.personalizedRequests.reviewPersonalizedRequest({
      requestId: "demo-request-personalized",
      decision: "approved",
      note: null,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(value.demoQuotes.issueDemoQuote({
      requestId: "demo-request-personalized",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
