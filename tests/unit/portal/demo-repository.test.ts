// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  DEMO_PORTAL_STORAGE_KEY,
  PortalError,
  createDemoPortalRepository,
  createMemorySessionStorage,
  type SessionStorageBoundary,
} from "@/lib/infrastructure/demo/portal-repository";
import type { CancelBookingInput, CancelBookingResult } from "@/lib/application/portal/contracts";

const CLOCK = () => "2026-08-31T12:00:00.000Z";

function repository(options: { storage?: SessionStorageBoundary; now?: () => string } = {}) {
  const storage = options.storage ?? createMemorySessionStorage();
  const repo = createDemoPortalRepository({ storage, now: options.now ?? CLOCK });
  return { storage, repo };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((entry) => canonical(entry)).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
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

function tamperWithValidIntegrity(
  storage: SessionStorageBoundary,
  mutate: (envelope: Record<string, unknown>) => void,
): void {
  const raw = storage.getItem(DEMO_PORTAL_STORAGE_KEY);
  if (raw === null) throw new Error("Expected a seeded demo envelope.");
  const envelope = JSON.parse(raw) as Record<string, unknown>;
  mutate(envelope);
  const body = { ...envelope };
  delete body.integrity;
  envelope.integrity = { algorithm: "fnv1a32", digest: fnv1a32(canonical(body)) };
  storage.setItem(DEMO_PORTAL_STORAGE_KEY, JSON.stringify(envelope));
}

async function cancelBooking(
  repo: ReturnType<typeof createDemoPortalRepository>,
  input: CancelBookingInput,
): Promise<CancelBookingResult> {
  const operation = repo.customer.cancellations.cancelBooking;
  if (operation === undefined) throw new Error("Expected the demo automatic-cancellation operation.");
  return operation(input);
}

function makePendingDepartureCheckout(storage: SessionStorageBoundary): void {
  tamperWithValidIntegrity(storage, (envelope) => {
    const bookings = envelope.bookings as Array<Record<string, unknown>>;
    const booking = bookings.find((entry) => entry.id === "demo-booking-cancellation");
    if (booking === undefined) throw new Error("Expected the cancellation booking.");
    booking.paymentStatus = "pending";
  });
}

function makeAcceptedQuoteCancellable(storage: SessionStorageBoundary): void {
  tamperWithValidIntegrity(storage, (envelope) => {
    const requests = envelope.requests as Array<Record<string, unknown>>;
    const request = requests.find((entry) => entry.id === "demo-request-personalized");
    const bookings = envelope.bookings as Array<Record<string, unknown>>;
    const booking = bookings.find((entry) => entry.id === "demo-booking-personalized");
    if (request === undefined || booking === undefined) throw new Error("Expected the personalized quote fixture.");

    request.status = "approved";
    request.updatedAt = CLOCK();
    request.latestDecisionAt = CLOCK();
    const requestSnapshot = booking.personalizedRequest as Record<string, unknown>;
    requestSnapshot.status = "approved";
    requestSnapshot.updatedAt = CLOCK();
    requestSnapshot.latestDecisionAt = CLOCK();
    booking.status = "pending_payment";
    booking.paymentStatus = null;
    booking.quoteAcceptedAt = booking.createdAt;
  });
}

const REQUEST_SNAPSHOT_TAMPERS: Array<{
  label: string;
  mutate: (request: Record<string, unknown>) => void;
}> = [
  { label: "id", mutate: (request) => { request.id = "demo-request-divergent"; } },
  { label: "owner", mutate: (request) => { request.ownerUserId = "demo-user-secondary-customer"; } },
  { label: "plan", mutate: (request) => { request.planId = "demo-plan-divergent"; } },
  { label: "revision", mutate: (request) => { request.revisionNo = 2; } },
  { label: "locale", mutate: (request) => { request.locale = "vi"; } },
  { label: "party size", mutate: (request) => { request.partySize = 2; } },
  { label: "amount", mutate: (request) => { request.totalVndMinor = "900000"; } },
  { label: "special needs", mutate: (request) => { request.specialNeeds = "Wheelchair access."; } },
  { label: "submitted timestamp", mutate: (request) => { request.submittedAt = "2026-08-24T00:00:00.000Z"; } },
  { label: "updated timestamp", mutate: (request) => { request.updatedAt = "2026-08-30T12:00:00.000Z"; } },
  { label: "status", mutate: (request) => { request.status = "changes_requested"; } },
  { label: "decision timestamp", mutate: (request) => { request.latestDecisionAt = "2026-08-30T12:00:00.000Z"; } },
];

describe("demo portal repository", () => {
  it("keeps session, customer, guide, and admin facades distinct and actor-scoped", async () => {
    const { repo } = repository();
    await repo.reset();

    expect(repo.session).not.toBe(repo.customer);
    expect(repo.session).not.toBe(repo.guide);
    expect(repo.session).not.toBe(repo.admin);
    expect(repo.customer).not.toBe(repo.guide);
    expect(repo.customer).not.toBe(repo.admin);
    expect(repo.guide).not.toBe(repo.admin);
    expect(repo.customer.account).not.toBe(repo.customer.cancellations);
    expect(repo.customer.account).not.toBe(repo.customer.reviews);
    expect(repo.guide.profile).not.toBe(repo.guide.assignments);

    expect(repo).not.toHaveProperty("listBookings");
    expect(repo).not.toHaveProperty("listAdminBookings");
    expect(repo).not.toHaveProperty("listBookingsForAdmin");
    expect(repo.customer.account).not.toHaveProperty("selectDemoIdentity");
    expect(repo.customer.account).not.toHaveProperty("listAdminBookings");
    expect(repo.customer.cancellations).toEqual(expect.objectContaining({ cancelBooking: expect.any(Function) }));
    expect(repo.guide.assignments).not.toHaveProperty("listUsers");
    expect(repo.admin.bookings).not.toHaveProperty("listCustomerBookings");
    expect(repo.admin).not.toHaveProperty("cancellations");
  });

  it("immediately cancels an owned pending departure and compensates its demo checkout exactly once", async () => {
    const { storage, repo } = repository();
    await repo.reset();
    makePendingDepartureCheckout(storage);
    await repo.session.selectDemoIdentity("demo-user-customer");

    const input: CancelBookingInput = {
      bookingId: "demo-booking-cancellation",
      reasonCode: null,
      otherReason: null,
      idempotencyKey: "cancel-departure-001",
    };
    const created = await cancelBooking(repo, input);

    expect(created).toEqual({
      cancellation: {
        id: "demo-booking-cancellation-event-1",
        bookingId: "demo-booking-cancellation",
        customerUserId: "demo-user-customer",
        sourceKind: "departure",
        reasonCode: null,
        otherReason: null,
        idempotencyKey: "cancel-departure-001",
        cancelledAt: CLOCK(),
      },
      bookingStatus: "cancelled",
      state: "created",
    });
    const customerBooking = (await repo.customer.account.listCustomerBookings())
      .find((booking) => booking.id === input.bookingId);
    expect(customerBooking).toMatchObject({
      status: "cancelled",
      paymentStatus: null,
      cancellation: created.cancellation,
    });

    const replayed = await cancelBooking(repo, input);
    expect(replayed).toEqual({ ...created, state: "replayed" });
    const envelope = JSON.parse(storage.getItem(DEMO_PORTAL_STORAGE_KEY) ?? "null") as Record<string, unknown>;
    expect(envelope.bookingCancellations).toEqual([created.cancellation]);

    await repo.session.selectDemoIdentity("demo-user-admin");
    const adminBooking = (await repo.admin.bookings.listAdminBookings())
      .find((booking) => booking.id === input.bookingId);
    expect(adminBooking?.cancellation).toEqual(created.cancellation);
    expect(adminBooking?.cancellation).not.toHaveProperty("providerSessionId");
    expect(adminBooking?.cancellation).not.toHaveProperty("checkoutAttemptId");
  });

  it("immediately cancels an owned accepted quote with an other reason and revokes checkout state", async () => {
    const { storage, repo } = repository();
    await repo.reset();
    makeAcceptedQuoteCancellable(storage);
    await repo.session.selectDemoIdentity("demo-user-customer");

    const result = await cancelBooking(repo, {
      bookingId: "demo-booking-personalized",
      reasonCode: "other",
      otherReason: "The arrival date changed.",
      idempotencyKey: "cancel-quote-001",
    });

    expect(result).toEqual({
      cancellation: {
        id: "demo-booking-cancellation-event-1",
        bookingId: "demo-booking-personalized",
        customerUserId: "demo-user-customer",
        sourceKind: "quote",
        reasonCode: "other",
        otherReason: "The arrival date changed.",
        idempotencyKey: "cancel-quote-001",
        cancelledAt: CLOCK(),
      },
      bookingStatus: "cancelled",
      state: "created",
    });
    expect((await repo.customer.account.listCustomerBookings())
      .find((booking) => booking.id === "demo-booking-personalized")).toMatchObject({
      status: "cancelled",
      paymentStatus: null,
      quoteAcceptedAt: null,
      cancellation: result.cancellation,
    });
  });

  it("denies guide, admin, and cross-owner automatic cancellation", async () => {
    for (const actorUserId of ["demo-user-guide", "demo-user-admin"] as const) {
      const { repo } = repository();
      await repo.reset();
      await repo.session.selectDemoIdentity(actorUserId);
      await expect(cancelBooking(repo, {
        bookingId: "demo-booking-cancellation",
        reasonCode: "trip_plan_changed",
        otherReason: null,
        idempotencyKey: `cancel-${actorUserId}`,
      })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }

    const { repo } = repository();
    await repo.reset();
    await repo.session.selectDemoIdentity("demo-user-customer");
    await expect(cancelBooking(repo, {
      bookingId: "demo-booking-secondary-customer",
      reasonCode: "trip_plan_changed",
      otherReason: null,
      idempotencyKey: "cancel-cross-owner-001",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each(["payment_processing", "confirmed", "payment_failed", "payment_review", "expired", "completed"] as const)(
    "denies automatic cancellation when booking status is %s",
    async (status) => {
      const { storage, repo } = repository();
      await repo.reset();
      tamperWithValidIntegrity(storage, (envelope) => {
        const bookings = envelope.bookings as Array<Record<string, unknown>>;
        const booking = bookings.find((entry) => entry.id === "demo-booking-cancellation");
        if (booking === undefined) throw new Error("Expected the cancellation booking.");
        booking.status = status;
      });
      await repo.session.selectDemoIdentity("demo-user-customer");

      await expect(cancelBooking(repo, {
        bookingId: "demo-booking-cancellation",
        reasonCode: "trip_plan_changed",
        otherReason: null,
        idempotencyKey: `cancel-status-${status}`,
      })).rejects.toMatchObject({ code: "CONFLICT" });
    },
  );

  it("rejects paid authority, changed idempotency payloads, second booking payloads, and second cancellation events", async () => {
    const paid = repository();
    await paid.repo.reset();
    tamperWithValidIntegrity(paid.storage, (envelope) => {
      const bookings = envelope.bookings as Array<Record<string, unknown>>;
      const booking = bookings.find((entry) => entry.id === "demo-booking-cancellation");
      if (booking === undefined) throw new Error("Expected the cancellation booking.");
      booking.paymentStatus = "paid";
    });
    await paid.repo.session.selectDemoIdentity("demo-user-customer");
    await expect(cancelBooking(paid.repo, {
      bookingId: "demo-booking-cancellation",
      reasonCode: null,
      otherReason: null,
      idempotencyKey: "cancel-paid-001",
    })).rejects.toMatchObject({ code: "CONFLICT" });

    const { storage, repo } = repository();
    await repo.reset();
    await repo.session.selectDemoIdentity("demo-user-customer");
    const original: CancelBookingInput = {
      bookingId: "demo-booking-cancellation",
      reasonCode: "trip_plan_changed",
      otherReason: null,
      idempotencyKey: "cancel-conflict-001",
    };
    await cancelBooking(repo, original);
    await expect(cancelBooking(repo, { ...original, reasonCode: "price_unsuitable" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(cancelBooking(repo, { ...original, idempotencyKey: "cancel-conflict-002" })).rejects.toMatchObject({ code: "CONFLICT" });

    tamperWithValidIntegrity(storage, (envelope) => {
      const bookings = envelope.bookings as Array<Record<string, unknown>>;
      const booking = bookings.find((entry) => entry.id === "demo-booking-completed");
      if (booking === undefined) throw new Error("Expected the completed booking.");
      booking.status = "pending_payment";
      booking.paymentStatus = null;
      booking.assignedGuideUserId = null;
      envelope.assignments = [];
    });
    await expect(cancelBooking(repo, { ...original, bookingId: "demo-booking-completed" })).rejects.toMatchObject({ code: "CONFLICT" });

    const envelope = JSON.parse(storage.getItem(DEMO_PORTAL_STORAGE_KEY) ?? "null") as Record<string, unknown>;
    expect(envelope.bookingCancellations).toHaveLength(1);
  });

  it("isolates private booking fields from customer rows while retaining them for admin rows", async () => {
    const { repo } = repository();
    await repo.reset();
    await repo.session.selectDemoIdentity("demo-user-customer");

    const customerRows = await repo.customer.account.listCustomerBookings();
    expect(customerRows).toHaveLength(3);
    for (const row of customerRows) {
      expect(row).not.toHaveProperty("ownerUserId");
      expect(row).not.toHaveProperty("assignedGuideUserId");
      expect(row).not.toHaveProperty("specialNeeds");
      expect(row).not.toHaveProperty("cancellationRequestId");
    }

    await repo.session.selectDemoIdentity("demo-user-admin");
    const adminRows = await repo.admin.bookings.listAdminBookings();
    const completed = adminRows.find((row) => row.id === "demo-booking-completed");
    expect(completed).toMatchObject({
      ownerUserId: "demo-user-customer",
      assignedGuideUserId: "demo-user-guide",
      specialNeeds: "Step-free route requested.",
    });
  });

  it("round-trips the customer's full name, nationality, email, phone, and language through storage", async () => {
    const { storage, repo } = repository();
    await repo.reset();
    await repo.session.selectDemoIdentity("demo-user-customer");

    const updated = await repo.customer.account.updateAccount({
      displayName: "Nguyễn An",
      nationality: "French",
      email: "nguyen.an@example.invalid",
      phone: "+84901234567",
      language: "vi",
    });
    expect(updated).toMatchObject({
      userId: "demo-user-customer",
      displayName: "Nguyễn An",
      nationality: "French",
      email: "nguyen.an@example.invalid",
      phone: "+84901234567",
      language: "vi",
    });

    const reopened = createDemoPortalRepository({ storage, now: CLOCK });
    await reopened.session.selectDemoIdentity("demo-user-customer");
    await expect(reopened.customer.account.getAccount()).resolves.toMatchObject({
      displayName: "Nguyễn An",
      nationality: "French",
      email: "nguyen.an@example.invalid",
      phone: "+84901234567",
      language: "vi",
    });
  });

  it.each(REQUEST_SNAPSHOT_TAMPERS)("rejects a recomputed-integrity quote when the independent request $label diverges from its booking snapshot", async ({ mutate }) => {
    const { storage, repo } = repository();
    await repo.reset();
    await repo.session.selectDemoIdentity("demo-user-admin");
    const pending = (await repo.admin.personalizedRequests.listPersonalizedRequests())
      .find((request) => request.id === "demo-request-personalized");
    if (pending === undefined) throw new Error("Expected the seeded personalized request.");
    await repo.admin.personalizedRequests.reviewPersonalizedRequest({
      requestId: pending.id,
      decision: "approved",
      note: null,
    });
    await repo.demoQuotes.issueDemoQuote({
      requestId: pending.id,
    });

    tamperWithValidIntegrity(storage, (envelope) => {
      const requests = envelope.requests as Array<Record<string, unknown>>;
      const request = requests.find((entry) => entry.id === pending.id);
      if (request === undefined) throw new Error("Expected the independent request.");
      mutate(request);
    });

    await expect(repo.admin.bookings.listAdminBookings()).rejects.toMatchObject({ code: "INVALID_STORAGE" });
  });

  it("resets a deterministic fixture into one exact envelope and preserves unrelated session keys", async () => {
    const first = repository();
    const second = repository();
    first.storage.setItem("unrelated", "keep");

    await first.repo.reset();
    await second.repo.reset();

    const raw = first.storage.getItem(DEMO_PORTAL_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(first.storage.getItem("unrelated")).toBe("keep");
    expect(raw).toBe(second.storage.getItem(DEMO_PORTAL_STORAGE_KEY));
    const envelope = JSON.parse(raw ?? "null") as Record<string, unknown>;
    expect(Object.keys(envelope).sort()).toEqual([
      "assignments",
      "bookingCancellations",
      "bookings",
      "departures",
      "fixedTours",
      "integrity",
      "locations",
      "requests",
      "reviews",
      "sessionUserId",
      "users",
      "version",
    ].sort());
    expect(envelope.version).toBe(3);
    expect(envelope.sessionUserId).toBeNull();
  });

  it("initializes an absent fixture once and preserves a valid existing session envelope", async () => {
    const { storage, repo } = repository();
    await repo.initialize();
    await repo.session.selectDemoIdentity("demo-user-guide");
    const selectedRaw = storage.getItem(DEMO_PORTAL_STORAGE_KEY);

    const reopened = createDemoPortalRepository({ storage, now: CLOCK });
    await reopened.initialize();

    await expect(reopened.session.getSession()).resolves.toMatchObject({
      userId: "demo-user-guide",
      role: "guide",
      demo: true,
    });
    expect(storage.getItem(DEMO_PORTAL_STORAGE_KEY)).toBe(selectedRaw);
  });

  it("fails closed for a same-version legacy envelope without sessionUserId", async () => {
    const { storage, repo } = repository();
    await repo.reset();
    const raw = storage.getItem(DEMO_PORTAL_STORAGE_KEY);
    if (raw === null) throw new Error("Expected a seeded demo envelope.");
    const envelope = JSON.parse(raw) as Record<string, unknown>;
    delete envelope.sessionUserId;
    const body = { ...envelope };
    delete body.integrity;
    envelope.integrity = { algorithm: "fnv1a32", digest: fnv1a32(canonical(body)) };
    const legacyRaw = JSON.stringify(envelope);
    storage.setItem(DEMO_PORTAL_STORAGE_KEY, legacyRaw);

    const reopened = createDemoPortalRepository({ storage, now: CLOCK });
    await expect(reopened.initialize()).rejects.toMatchObject({ code: "INVALID_STORAGE" });
    expect(storage.getItem(DEMO_PORTAL_STORAGE_KEY)).toBe(legacyRaw);
  });

  it("persists a selected seeded identity across a fresh repository instance", async () => {
    const { storage, repo } = repository();
    await repo.reset();
    await repo.session.selectDemoIdentity("demo-user-guide");

    const reopened = createDemoPortalRepository({ storage, now: CLOCK });
    await expect(reopened.session.getSession()).resolves.toMatchObject({
      userId: "demo-user-guide",
      role: "guide",
      demo: true,
    });
  });

  it("persists a null session identity after sign-out without removing the fixture", async () => {
    const { storage, repo } = repository();
    await repo.reset();
    await repo.session.selectDemoIdentity("demo-user-customer");
    await repo.session.signOut();

    const envelope = JSON.parse(storage.getItem(DEMO_PORTAL_STORAGE_KEY) ?? "null") as Record<string, unknown>;
    expect(envelope.sessionUserId).toBeNull();
    const reopened = createDemoPortalRepository({ storage, now: CLOCK });
    await expect(reopened.session.getSession()).resolves.toBeNull();
    await expect(reopened.customer.account.listCustomerBookings()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("clears the persisted session identity when reset recreates the fixture", async () => {
    const { storage, repo } = repository();
    await repo.reset();
    await repo.session.selectDemoIdentity("demo-user-admin");
    await repo.reset();

    const envelope = JSON.parse(storage.getItem(DEMO_PORTAL_STORAGE_KEY) ?? "null") as Record<string, unknown>;
    expect(envelope.sessionUserId).toBeNull();
    const reopened = createDemoPortalRepository({ storage, now: CLOCK });
    await expect(reopened.session.getSession()).resolves.toBeNull();
  });

  it.each([
    ["unknown", "demo-user-unknown"],
    ["non-seeded", "customer"],
    ["non-string", 42],
    ["tampered", { userId: "demo-user-customer" }],
  ] as const)("fails closed for a %s persisted session identity", async (_label, sessionUserId) => {
    const { storage, repo } = repository();
    await repo.reset();
    const envelope = JSON.parse(storage.getItem(DEMO_PORTAL_STORAGE_KEY) ?? "null") as Record<string, unknown>;
    envelope.sessionUserId = sessionUserId;
    storage.setItem(DEMO_PORTAL_STORAGE_KEY, JSON.stringify(envelope));

    await expect(repo.session.getSession()).rejects.toMatchObject({ code: "INVALID_STORAGE" });
  });

  it("rejects invalid JSON, unknown fields, and tampered nested records instead of resetting", async () => {
    const { storage, repo } = repository();
    await repo.reset();
    await repo.session.selectDemoIdentity("demo-user-customer");
    const valid = storage.getItem(DEMO_PORTAL_STORAGE_KEY) as string;

    storage.setItem(DEMO_PORTAL_STORAGE_KEY, "not-json");
    await expect(repo.customer.account.listCustomerBookings()).rejects.toMatchObject({ code: "INVALID_STORAGE" });

    storage.setItem(DEMO_PORTAL_STORAGE_KEY, valid);
    const envelope = JSON.parse(valid) as Record<string, unknown>;
    (envelope.bookings as Array<Record<string, unknown>>)[0]!.unexpected = true;
    storage.setItem(DEMO_PORTAL_STORAGE_KEY, JSON.stringify(envelope));
    await expect(repo.customer.account.listCustomerBookings()).rejects.toMatchObject({ code: "INVALID_STORAGE" });

    expect(storage.getItem(DEMO_PORTAL_STORAGE_KEY)).toBe(JSON.stringify(envelope));
  });

  it("requires an explicitly selected seeded identity and sign-out keeps fixture data", async () => {
    const { storage, repo } = repository();
    await repo.reset();
    const before = storage.getItem(DEMO_PORTAL_STORAGE_KEY);

    await expect(repo.customer.account.getAccount()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(repo.session.selectDemoIdentity("not-seeded")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repo.session.selectDemoIdentity("demo-user-customer")).resolves.toMatchObject({
      userId: "demo-user-customer",
      role: "customer",
      demo: true,
    });
    await expect(repo.session.getSession()).resolves.toMatchObject({
      userId: "demo-user-customer",
      role: "customer",
      demo: true,
    });
    await repo.session.signOut();
    await expect(repo.session.getSession()).resolves.toBeNull();
    await expect(repo.customer.account.getAccount()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(storage.getItem(DEMO_PORTAL_STORAGE_KEY)).toBe(before);
  });

  it("enforces customer ownership and allowlisted profile updates", async () => {
    const { repo } = repository();
    await repo.reset();
    await repo.session.selectDemoIdentity("demo-user-customer");

    await expect(repo.customer.account.updateAccount({ displayName: "Updated traveler", language: "vi" })).resolves.toMatchObject({
      userId: "demo-user-customer",
      displayName: "Updated traveler",
      language: "vi",
    });
    await expect(repo.customer.account.updateAccount({ role: "admin" } as never)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(cancelBooking(repo, {
      bookingId: "demo-booking-secondary-customer",
      reasonCode: null,
      otherReason: null,
      idempotencyKey: "cancel-not-owned-001",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(repo.customer.reviews.submitTourReview({ bookingId: "demo-booking-secondary-customer", rating: 5, text: "Not mine." })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const primaryBookings = await repo.customer.account.listCustomerBookings();
    expect(primaryBookings.map((booking) => booking.id)).not.toContain("demo-booking-secondary-customer");

    await repo.session.selectDemoIdentity("demo-user-secondary-customer");
    const secondaryBookings = await repo.customer.account.listCustomerBookings();
    expect(secondaryBookings.map((booking) => booking.id)).toEqual(["demo-booking-secondary-customer"]);
    expect((await repo.customer.account.listCustomRequests()).map((request) => request.id)).not.toContain("demo-request-personalized");

    await repo.session.selectDemoIdentity("demo-user-guide");
    await expect(repo.customer.account.getAccount()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(repo.guide.profile.updateGuideProfile({ email: "forged@example.invalid" } as never)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("allows exactly one review only for an owned completed booking", async () => {
    const { repo } = repository();
    await repo.reset();
    await repo.session.selectDemoIdentity("demo-user-customer");

    const review = await repo.customer.reviews.submitTourReview({ bookingId: "demo-booking-completed", rating: 5, text: "A thoughtful local tour." });
    expect(review).toMatchObject({ bookingId: "demo-booking-completed", rating: 5 });
    await expect(repo.customer.reviews.submitTourReview({ bookingId: "demo-booking-completed", rating: 4, text: "Second review." })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(repo.customer.reviews.submitTourReview({ bookingId: "demo-booking-cancellation", rating: 5, text: "Not completed." })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(repo.customer.reviews.submitTourReview({ bookingId: "demo-booking-completed", rating: 0, text: "Invalid." })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("limits guide visibility to assigned tours and permits only allowlisted profile changes", async () => {
    const { repo } = repository();
    await repo.reset();
    await repo.session.selectDemoIdentity("demo-user-admin");
    await repo.admin.assignments.assignGuideToFixedDeparture({
      bookingId: "demo-booking-secondary-customer",
      guideUserId: "demo-user-guide-secondary",
    });
    await repo.session.selectDemoIdentity("demo-user-guide");

    const tours = await repo.guide.assignments.listAssignedTours();
    expect(tours.map((tour) => tour.bookingId)).toEqual(["demo-booking-completed"]);
    expect(tours[0]).toHaveProperty("specialNeeds", "Step-free route requested.");
    for (const tour of tours) {
      expect(tour).not.toHaveProperty("paymentStatus");
      expect(tour).not.toHaveProperty("quoteId");
      expect(tour).not.toHaveProperty("totalVndMinor");
      expect(tour).not.toHaveProperty("ownerUserId");
    }
    expect(tours.map((tour) => tour.bookingId)).not.toContain("demo-booking-secondary-customer");
    await expect(repo.guide.assignments.getAssignedTour("demo-booking-secondary-customer")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repo.admin.bookings.listAdminBookings()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(repo.admin.personalizedRequests.listPersonalizedRequests()).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(repo.guide.profile.updateGuideProfile({ bio: "A calm city guide.", language: "vi" })).resolves.toMatchObject({
      role: "guide",
      bio: "A calm city guide.",
      language: "vi",
    });
    expect(repo).not.toHaveProperty("acceptAssignedTour");
    expect(repo).not.toHaveProperty("completeAssignedTour");
  });

  it("keeps admin actions authoritative, fixed-departure-only, and request states domain-aligned", async () => {
    const { repo } = repository();
    await repo.reset();
    await repo.session.selectDemoIdentity("demo-user-guide");
    await expect(repo.admin.users.listUsers()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(repo.admin.assignments.assignGuideToFixedDeparture({ bookingId: "demo-booking-cancellation", guideUserId: "demo-user-guide-secondary" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await repo.session.selectDemoIdentity("demo-user-admin");
    const users = await repo.admin.users.listUsers();
    expect(users.some((user) => user.role === "admin")).toBe(true);
    const request = (await repo.admin.personalizedRequests.listPersonalizedRequests())[0]!;
    expect(request.status).toBe("pending_review");
    const reviewed = await repo.admin.personalizedRequests.reviewPersonalizedRequest({ requestId: request.id, decision: "approved", note: null });
    expect(reviewed.status).toBe("approved");

    const assigned = await repo.admin.assignments.assignGuideToFixedDeparture({ bookingId: "demo-booking-secondary-customer", guideUserId: "demo-user-guide-secondary" });
    expect(assigned).toMatchObject({ bookingId: "demo-booking-secondary-customer", assignmentStatus: "assigned" });
    await expect(repo.admin.assignments.assignGuideToFixedDeparture({ bookingId: "demo-booking-personalized", guideUserId: "demo-user-guide" })).rejects.toMatchObject({ code: "CONFLICT" });

    const report = await repo.admin.reporting.getReport();
    expect(report).toMatchObject({ simulated: true, userCount: 5, bookingCount: 4 });
  });

  it("returns defensive copies and rejects unavailable storage", async () => {
    const { repo } = repository();
    await repo.reset();
    await repo.session.selectDemoIdentity("demo-user-customer");
    const bookings = await repo.customer.account.listCustomerBookings();
    bookings[0]!.titleEn = "Caller mutation";
    expect((await repo.customer.account.listCustomerBookings())[0]!.titleEn).not.toBe("Caller mutation");

    const unavailable: SessionStorageBoundary = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    const blocked = repository({ storage: unavailable }).repo;
    await expect(blocked.reset()).rejects.toBeInstanceOf(PortalError);
    await expect(blocked.reset()).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
  });
});
