// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  DEMO_PORTAL_STORAGE_KEY,
  PortalError,
  createDemoPortalRepository,
  createMemorySessionStorage,
  type SessionStorageBoundary,
} from "@/lib/infrastructure/demo/portal-repository";

const CLOCK = () => "2026-08-31T12:00:00.000Z";

function repository(options: { storage?: SessionStorageBoundary; now?: () => string } = {}) {
  const storage = options.storage ?? createMemorySessionStorage();
  const repo = createDemoPortalRepository({ storage, now: options.now ?? CLOCK });
  return { storage, repo };
}

describe("demo portal repository", () => {
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
      "bookings",
      "cancellations",
      "departures",
      "fixedTours",
      "integrity",
      "locations",
      "reviews",
      "users",
      "version",
    ].sort());
    expect(envelope.version).toBe(1);
  });

  it("rejects invalid JSON, unknown fields, and tampered nested records instead of resetting", async () => {
    const { storage, repo } = repository();
    await repo.reset();
    await repo.selectDemoIdentity("demo-user-customer");
    const valid = storage.getItem(DEMO_PORTAL_STORAGE_KEY) as string;

    storage.setItem(DEMO_PORTAL_STORAGE_KEY, "not-json");
    await expect(repo.listBookings()).rejects.toMatchObject({ code: "INVALID_STORAGE" });

    storage.setItem(DEMO_PORTAL_STORAGE_KEY, valid);
    const envelope = JSON.parse(valid) as Record<string, unknown>;
    (envelope.bookings as Array<Record<string, unknown>>)[0]!.unexpected = true;
    storage.setItem(DEMO_PORTAL_STORAGE_KEY, JSON.stringify(envelope));
    await expect(repo.listBookings()).rejects.toMatchObject({ code: "INVALID_STORAGE" });

    expect(storage.getItem(DEMO_PORTAL_STORAGE_KEY)).toBe(JSON.stringify(envelope));
  });

  it("requires an explicitly selected seeded identity and sign-out keeps fixture data", async () => {
    const { storage, repo } = repository();
    await repo.reset();
    const before = storage.getItem(DEMO_PORTAL_STORAGE_KEY);

    await expect(repo.getAccount()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(repo.selectDemoIdentity("not-seeded")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repo.selectDemoIdentity("demo-user-customer")).resolves.toMatchObject({
      userId: "demo-user-customer",
      role: "customer",
      demo: true,
    });
    await expect(repo.getSession()).resolves.toMatchObject({ userId: "demo-user-customer", role: "customer" });
    await repo.signOut();
    await expect(repo.getSession()).resolves.toBeNull();
    await expect(repo.getAccount()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(storage.getItem(DEMO_PORTAL_STORAGE_KEY)).toBe(before);
  });

  it("enforces customer ownership and allowlisted profile updates", async () => {
    const { repo } = repository();
    await repo.reset();
    await repo.selectDemoIdentity("demo-user-customer");

    await expect(repo.updateCustomerAccount({ displayName: "Updated traveler", language: "vi" })).resolves.toMatchObject({
      userId: "demo-user-customer",
      displayName: "Updated traveler",
      language: "vi",
    });
    await expect(repo.updateCustomerAccount({ role: "admin" } as never)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(repo.requestCancellation({ bookingId: "demo-booking-secondary-customer", reason: "Not mine." })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(repo.submitTourReview({ bookingId: "demo-booking-secondary-customer", rating: 5, text: "Not mine." })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await repo.selectDemoIdentity("demo-user-guide");
    await expect(repo.getAccount()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(repo.updateGuideProfile({ email: "forged@example.invalid" } as never)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("separates a customer cancellation request from the admin booking decision", async () => {
    const { repo } = repository();
    await repo.reset();
    await repo.selectDemoIdentity("demo-user-customer");

    const before = (await repo.listBookings()).find((booking) => booking.id === "demo-booking-cancellation");
    const request = await repo.requestCancellation({ bookingId: "demo-booking-cancellation", reason: "Plans changed." });
    expect(request).toMatchObject({ status: "pending", bookingId: "demo-booking-cancellation" });
    expect((await repo.listBookings()).find((booking) => booking.id === request.bookingId)).toMatchObject({
      status: before?.status,
      paymentStatus: before?.paymentStatus,
    });
    await expect(repo.requestCancellation({ bookingId: request.bookingId, reason: "Again." })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(repo.decideCancellation({ requestId: request.id, decision: "approved", note: null })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await repo.selectDemoIdentity("demo-user-admin");
    const rejected = await repo.decideCancellation({ requestId: request.id, decision: "rejected", note: "Policy keeps this booking." });
    expect(rejected.request.status).toBe("rejected");
    expect(rejected.booking).toMatchObject({ status: "confirmed", paymentStatus: "paid" });
  });

  it("allows exactly one review only for an owned completed booking", async () => {
    const { repo } = repository();
    await repo.reset();
    await repo.selectDemoIdentity("demo-user-customer");

    const review = await repo.submitTourReview({ bookingId: "demo-booking-completed", rating: 5, text: "A thoughtful local tour." });
    expect(review).toMatchObject({ bookingId: "demo-booking-completed", rating: 5 });
    await expect(repo.submitTourReview({ bookingId: "demo-booking-completed", rating: 4, text: "Second review." })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(repo.submitTourReview({ bookingId: "demo-booking-cancellation", rating: 5, text: "Not completed." })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(repo.submitTourReview({ bookingId: "demo-booking-completed", rating: 0, text: "Invalid." })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("limits guide visibility to assigned tours and permits only allowlisted profile changes", async () => {
    const { repo } = repository();
    await repo.reset();
    await repo.selectDemoIdentity("demo-user-guide");

    const tours = await repo.listAssignedTours();
    expect(tours.map((tour) => tour.bookingId)).toEqual([
      "demo-booking-completed",
      "demo-booking-cancellation",
    ]);
    expect(tours[0]).toHaveProperty("specialNeeds", "Step-free route requested.");
    expect(tours.map((tour) => tour.bookingId)).not.toContain("demo-booking-secondary-customer");
    await expect(repo.getAssignedTour("demo-booking-secondary-customer")).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(repo.updateGuideProfile({ bio: "A calm city guide.", language: "vi" })).resolves.toMatchObject({
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
    await repo.selectDemoIdentity("demo-user-guide");
    await expect(repo.listUsers()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(repo.assignGuideToFixedDeparture({ bookingId: "demo-booking-cancellation", guideUserId: "demo-user-guide-secondary" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await repo.selectDemoIdentity("demo-user-admin");
    const users = await repo.listUsers();
    expect(users.some((user) => user.role === "admin")).toBe(true);
    const request = (await repo.listPersonalizedRequests())[0]!;
    expect(request.status).toBe("pending_review");
    const reviewed = await repo.reviewPersonalizedRequest({ requestId: request.id, decision: "approved", note: null });
    expect(reviewed.status).toBe("approved");

    const assigned = await repo.assignGuideToFixedDeparture({ bookingId: "demo-booking-cancellation", guideUserId: "demo-user-guide-secondary" });
    expect(assigned).toMatchObject({ bookingId: "demo-booking-cancellation", assignmentStatus: "assigned" });
    await expect(repo.assignGuideToFixedDeparture({ bookingId: "demo-booking-personalized", guideUserId: "demo-user-guide" })).rejects.toMatchObject({ code: "CONFLICT" });

    const report = await repo.getReport();
    expect(report).toMatchObject({ simulated: true, userCount: 5, bookingCount: 4 });
  });

  it("returns defensive copies and rejects unavailable storage", async () => {
    const { repo } = repository();
    await repo.reset();
    await repo.selectDemoIdentity("demo-user-customer");
    const bookings = await repo.listBookings();
    bookings[0]!.titleEn = "Caller mutation";
    expect((await repo.listBookings())[0]!.titleEn).not.toBe("Caller mutation");

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
