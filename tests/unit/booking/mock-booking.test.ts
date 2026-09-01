// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  createLocalBooking,
  createTestPayment,
  DEMO_DEPARTURE_IDS,
  finalizeTestPayment,
  getDemoDeparture,
  startTestPayment,
  type BookingStorage,
} from "@/lib/application/booking/mock-booking";

function createStorage(): BookingStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

const now = new Date("2026-09-01T02:00:00.000Z");
const departureId = DEMO_DEPARTURE_IDS[0];

function withoutResponseFlag(booking: ReturnType<typeof createLocalBooking>) {
  const stored = { ...booking };
  delete (stored as { resumed?: boolean }).resumed;
  return stored;
}

describe("local demo booking boundary", () => {
  it("exposes only allowlisted internal demo departures", () => {
    expect(getDemoDeparture(departureId)).toMatchObject({
      departureId,
      tourSlug: "demo-markets-and-street-food",
      currency: "VND",
    });
    expect(getDemoDeparture("outside-db-departure")).toBeUndefined();
  });

  it("rejects unknown departures and invalid party sizes before quoting", () => {
    expect(() => createLocalBooking({ departureId: "outside-db-departure", partySize: 2, storage: createStorage(), now })).toThrow(
      "Unknown demo departure",
    );
    expect(() => createLocalBooking({ departureId, partySize: 0, storage: createStorage(), now })).toThrow(
      "Party size must be between 1 and 20",
    );
  });

  it("computes the quote from internal departure facts and never accepts a client price", () => {
    const storage = createStorage();
    const booking = createLocalBooking({ departureId, partySize: 2, storage, now });

    expect(booking.quote).toEqual({
      currency: "VND",
      unitPriceMinor: 480_000,
      partySize: 2,
      totalMinor: 960_000,
    });
    expect(booking.holdExpiresAt).toBe("2026-09-01T02:35:00.000Z");
    expect(booking.testSessionExpiresAt).toBe("2026-09-01T02:30:00.000Z");
  });

  it("resumes the same local booking for the same departure and party size", () => {
    const storage = createStorage();
    const first = createLocalBooking({ departureId, partySize: 2, storage, now });
    const second = createLocalBooking({ departureId, partySize: 2, storage, now: new Date("2026-09-01T02:05:00.000Z") });

    expect(second.bookingId).toBe(first.bookingId);
    expect(second.resumed).toBe(true);
    expect(second.status).toBe("held");
  });

  it("marks a held demo booking paid only through the explicit simulated payment action", () => {
    const storage = createStorage();
    const booking = createLocalBooking({ departureId, partySize: 1, storage, now });

    const paid = createTestPayment({ bookingId: booking.bookingId, storage, now: new Date("2026-09-01T02:10:00.000Z") });
    expect(paid).toMatchObject({ bookingId: booking.bookingId, status: "paid", paymentStatus: "succeeded" });

    const replay = createTestPayment({ bookingId: booking.bookingId, storage, now: new Date("2026-09-01T02:11:00.000Z") });
    expect(replay).toMatchObject({ bookingId: booking.bookingId, status: "paid", paymentStatus: "succeeded" });
  });

  it("keeps same-key starts idempotent and reuses one booking across failed and successful attempts", () => {
    const values = new Map<string, string>();
    const storage: BookingStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };
    const booking = createLocalBooking({ departureId, partySize: 1, storage, now });

    const first = startTestPayment({
      bookingId: booking.bookingId,
      idempotencyKey: "pay-1",
      storage,
      now: new Date("2026-09-01T02:05:00.000Z"),
    });
    const replay = startTestPayment({
      bookingId: booking.bookingId,
      idempotencyKey: "pay-1",
      storage,
      now: new Date("2026-09-01T02:06:00.000Z"),
    });
    expect(replay).toEqual(first);

    const failed = finalizeTestPayment({
      bookingId: booking.bookingId,
      idempotencyKey: "pay-1",
      outcome: "failed",
      storage,
      now: new Date("2026-09-01T02:07:00.000Z"),
    });
    expect(failed).toMatchObject({ status: "held", paymentStatus: "unpaid" });
    expect(failed.paymentAttempts.at(-1)?.outcome).toBe("failed");

    startTestPayment({
      bookingId: booking.bookingId,
      idempotencyKey: "pay-2",
      storage,
      now: new Date("2026-09-01T02:08:00.000Z"),
    });
    const paid = finalizeTestPayment({
      bookingId: booking.bookingId,
      idempotencyKey: "pay-2",
      outcome: "succeeded",
      storage,
      now: new Date("2026-09-01T02:09:00.000Z"),
    });
    expect(paid).toMatchObject({ status: "paid", paymentStatus: "succeeded" });
    expect(paid.paymentAttempts.map((attempt) => attempt.outcome)).toEqual(["failed", "succeeded"]);

    const persistedKeys = [...values.keys()].filter((key) => key.startsWith("locallens.demo.booking.v1:"));
    expect(persistedKeys).toEqual([`locallens.demo.booking.v1:${booking.bookingId}`]);
  });

  it("records cancelled and expired attempts while keeping the booking held for a new key", () => {
    const storage = createStorage();
    const booking = createLocalBooking({ departureId, partySize: 1, storage, now });
    startTestPayment({ bookingId: booking.bookingId, idempotencyKey: "cancel-1", storage, now });
    const cancelled = finalizeTestPayment({
      bookingId: booking.bookingId,
      idempotencyKey: "cancel-1",
      outcome: "cancelled",
      storage,
      now: new Date("2026-09-01T02:01:00.000Z"),
    });
    expect(cancelled).toMatchObject({ status: "held", paymentStatus: "unpaid" });
    expect(cancelled.paymentAttempts.at(-1)?.outcome).toBe("cancelled");

    const terminalReplay = finalizeTestPayment({
      bookingId: booking.bookingId,
      idempotencyKey: "cancel-1",
      outcome: "succeeded",
      storage,
      now: new Date("2026-09-01T02:02:00.000Z"),
    });
    expect(terminalReplay).toEqual({ ...cancelled, resumed: true });

    startTestPayment({
      bookingId: booking.bookingId,
      idempotencyKey: "expire-1",
      storage,
      now: new Date("2026-09-01T02:03:00.000Z"),
    });
    const expired = finalizeTestPayment({
      bookingId: booking.bookingId,
      idempotencyKey: "expire-1",
      outcome: "succeeded",
      storage,
      now: new Date("2026-09-01T02:31:00.000Z"),
    });
    expect(expired).toMatchObject({ status: "held", paymentStatus: "unpaid" });
    expect(expired.paymentAttempts.at(-1)?.outcome).toBe("expired");

    expect(startTestPayment({
      bookingId: booking.bookingId,
      idempotencyKey: "retry-2",
      storage,
      now: new Date("2026-09-01T02:31:30.000Z"),
    })).toMatchObject({ outcome: "pending" });
  });

  it("refuses payment after hold expiry and fails closed for tampered attempts", () => {
    const storage = createStorage();
    const booking = createLocalBooking({ departureId, partySize: 1, storage, now });
    expect(() => startTestPayment({
      bookingId: booking.bookingId,
      idempotencyKey: "late-1",
      storage,
      now: new Date("2026-09-01T02:36:00.000Z"),
    })).toThrow("Demo booking hold expired");

    const active = createLocalBooking({
      departureId,
      partySize: 2,
      storage,
      now: new Date("2026-09-01T03:00:00.000Z"),
    });
    startTestPayment({ bookingId: active.bookingId, idempotencyKey: "tamper-1", storage, now: new Date("2026-09-01T03:01:00.000Z") });
    const key = `locallens.demo.booking.v1:${active.bookingId}`;
    const stored = JSON.parse(storage.getItem(key) ?? "{}") as { paymentAttempts?: Array<Record<string, unknown>> };
    if (stored.paymentAttempts?.[0] === undefined) throw new Error("expected stored payment attempt");
    stored.paymentAttempts[0].outcome = "succeeded";
    storage.setItem(key, JSON.stringify(stored));

    expect(() => startTestPayment({
      bookingId: active.bookingId,
      idempotencyKey: "tamper-2",
      storage,
      now: new Date("2026-09-01T03:02:00.000Z"),
    })).toThrow("Unknown demo booking");
  });

  it("resumes a legitimately paid local booking with its paid state", () => {
    const storage = createStorage();
    const booking = createLocalBooking({ departureId, partySize: 1, storage, now });
    createTestPayment({ bookingId: booking.bookingId, storage, now: new Date("2026-09-01T02:10:00.000Z") });

    const resumed = createLocalBooking({ departureId, partySize: 1, storage, now: new Date("2026-09-01T02:11:00.000Z") });
    expect(resumed).toMatchObject({
      bookingId: booking.bookingId,
      resumed: true,
      status: "paid",
      paymentStatus: "succeeded",
    });
  });

  it("does not pay after the Stripe Test concept window expires", () => {
    const storage = createStorage();
    const booking = createLocalBooking({ departureId, partySize: 1, storage, now });

    expect(() => createTestPayment({
      bookingId: booking.bookingId,
      storage,
      now: new Date("2026-09-01T02:31:00.000Z"),
    })).toThrow("Demo payment session expired");
  });

  it("reprices a booking when local storage contains a tampered quote", () => {
    const storage = createStorage();
    const booking = createLocalBooking({ departureId, partySize: 2, storage, now });
    const key = `locallens.demo.booking.v1:${booking.bookingId}`;
    const storedBooking = withoutResponseFlag(booking);
    const tampered = { ...storedBooking, quote: { ...booking.quote, totalMinor: 1 } };
    storage.setItem(key, JSON.stringify(tampered));

    const repriced = createLocalBooking({ departureId, partySize: 2, storage, now: new Date("2026-09-01T02:05:00.000Z") });
    expect(repriced.resumed).toBe(false);
    expect(repriced.quote.totalMinor).toBe(960_000);
  });

  it("rejects a tampered state or timestamp instead of treating local storage as payment evidence", () => {
    const storage = createStorage();
    const booking = createLocalBooking({ departureId, partySize: 1, storage, now });
    const key = `locallens.demo.booking.v1:${booking.bookingId}`;
    const storedBooking = withoutResponseFlag(booking);
    storage.setItem(key, JSON.stringify({ ...storedBooking, status: "paid", paymentStatus: "unpaid" }));
    expect(() => createTestPayment({ bookingId: booking.bookingId, storage, now: new Date("2026-09-01T02:10:00.000Z") })).toThrow(
      "Unknown demo booking",
    );

    const recreated = createLocalBooking({ departureId, partySize: 1, storage, now: new Date("2026-09-01T02:10:00.000Z") });
    const storedRecreated = withoutResponseFlag(recreated);
    storage.setItem(key, JSON.stringify({ ...storedRecreated, holdExpiresAt: "not-a-date" }));
    expect(() => createTestPayment({ bookingId: recreated.bookingId, storage, now: new Date("2026-09-01T02:11:00.000Z") })).toThrow(
      "Unknown demo booking",
    );
  });
});
