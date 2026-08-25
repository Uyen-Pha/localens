// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  createLocalBooking,
  createTestPayment,
  DEMO_DEPARTURE_IDS,
  getDemoDeparture,
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
