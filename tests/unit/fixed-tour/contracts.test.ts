import { describe, expect, expectTypeOf, it } from "vitest";

import {
  parseCompleteSimulatedPaymentInput,
  parseCompleteSimulatedPaymentResult,
  parseFixedTourPaymentStatus,
  parseFixedTourBeginBookingInput,
  parseFixedTourBeginBookingResult,
  type CompleteSimulatedPaymentInput,
  type CompleteSimulatedPaymentResult,
  type FixedTourBeginBookingInput,
  type FixedTourBeginBookingResult,
  type FixedTourPaymentStatus,
  type FixedTourRuntimePort,
} from "@/lib/application/fixed-tour/contracts";
import type {
  CustomerBooking,
  LiveDepartureAvailability,
  Locale,
  PublishedTour,
} from "@/lib/domain/data/contracts";

const departureId = "00000000-0000-0000-0000-000000000201";
const bookingId = "00000000-0000-0000-0000-000000000202";

const validInput = {
  departureId,
  partySize: 2,
  locale: "vi",
  idempotencyKey: "fixed-tour-hold:customer-b:1",
} as const;

const validResult = {
  bookingId,
  holdExpiresAt: "2026-09-05T08:35:00.000Z",
  state: "created",
} as const;

const validPaymentInput = {
  bookingId,
  idempotencyKey: "fixed-tour-payment:customer-b:1",
} as const;

const validPaymentResult = {
  bookingId,
  bookingStatus: "confirmed",
  paymentStatus: "paid",
  simulatedAt: "2026-09-05T08:05:00.000Z",
  state: "completed",
} as const;

const validPaymentStatus = {
  bookingId,
  bookingStatus: "confirmed",
  paymentStatus: "paid",
  amountMinor: "1500000",
  currency: "vnd",
  simulatedAt: "2026-09-05T08:05:00.000Z",
} as const;

describe("fixed-tour runtime contracts", () => {
  it("exposes booking and simulated-payment operations without cancellation authority", async () => {
    const tours: PublishedTour[] = [];
    const availability: LiveDepartureAvailability[] = [];
    const bookings: CustomerBooking[] = [];
    const payments: FixedTourPaymentStatus[] = [];
    const result: FixedTourBeginBookingResult = validResult;
    const paymentResult: CompleteSimulatedPaymentResult = validPaymentResult;

    const port: FixedTourRuntimePort = {
      async listPublishedTours(locale) {
        expectTypeOf(locale).toEqualTypeOf<Locale>();
        return tours;
      },
      async listAvailability() {
        return availability;
      },
      async beginBooking(input) {
        expectTypeOf(input).toEqualTypeOf<FixedTourBeginBookingInput>();
        return result;
      },
      async listOwnBookings() {
        return bookings;
      },
      async listOwnPaymentStatuses() {
        return payments;
      },
      async completeSimulatedPayment(input) {
        expectTypeOf(input).toEqualTypeOf<CompleteSimulatedPaymentInput>();
        return paymentResult;
      },
    };

    expect(Object.keys(port).sort()).toEqual([
      "beginBooking",
      "completeSimulatedPayment",
      "listAvailability",
      "listOwnBookings",
      "listOwnPaymentStatuses",
      "listPublishedTours",
    ]);
    await expect(port.listPublishedTours("en")).resolves.toBe(tours);
    await expect(port.listAvailability()).resolves.toBe(availability);
    await expect(port.beginBooking(validInput)).resolves.toBe(result);
    await expect(port.listOwnBookings()).resolves.toBe(bookings);
    await expect(port.listOwnPaymentStatuses()).resolves.toBe(payments);
    await expect(port.completeSimulatedPayment(validPaymentInput)).resolves.toBe(paymentResult);

    expectTypeOf<ReturnType<FixedTourRuntimePort["listPublishedTours"]>>()
      .toEqualTypeOf<Promise<PublishedTour[]>>();
    expectTypeOf<ReturnType<FixedTourRuntimePort["listAvailability"]>>()
      .toEqualTypeOf<Promise<LiveDepartureAvailability[]>>();
    expectTypeOf<ReturnType<FixedTourRuntimePort["beginBooking"]>>()
      .toEqualTypeOf<Promise<FixedTourBeginBookingResult>>();
    expectTypeOf<ReturnType<FixedTourRuntimePort["listOwnBookings"]>>()
      .toEqualTypeOf<Promise<CustomerBooking[]>>();
    expectTypeOf<ReturnType<FixedTourRuntimePort["listOwnPaymentStatuses"]>>()
      .toEqualTypeOf<Promise<FixedTourPaymentStatus[]>>();
    expectTypeOf<ReturnType<FixedTourRuntimePort["completeSimulatedPayment"]>>()
      .toEqualTypeOf<Promise<CompleteSimulatedPaymentResult>>();
  });

  it("accepts only the exact browser-authored begin-booking input", () => {
    expect(parseFixedTourBeginBookingInput(validInput)).toEqual({
      ok: true,
      value: validInput,
    });

    for (const forbiddenField of [
      "actorId",
      "ownerUserId",
      "role",
      "amount",
      "amountMinor",
      "currency",
      "status",
      "holdDurationMinutes",
      "providerIdempotencyKey",
      "canonicalHash",
      "requestHash",
    ]) {
      expect(parseFixedTourBeginBookingInput({
        ...validInput,
        [forbiddenField]: "server-owned",
      })).toEqual({
        ok: false,
        error: {
          code: "UNKNOWN_FIELD",
          messageKey: "fixedTour.contract.unknown_field",
          fieldPath: `input.${forbiddenField}`,
        },
      });
    }
  });

  it("rejects malformed or incomplete begin-booking input", () => {
    for (const input of [
      null,
      { ...validInput, departureId: "not-a-uuid" },
      { ...validInput, partySize: 0 },
      { ...validInput, partySize: 101 },
      { ...validInput, partySize: 1.5 },
      { ...validInput, locale: "fr" },
      { ...validInput, idempotencyKey: " contains spaces " },
      { departureId, partySize: 2, locale: "vi" },
    ]) {
      expect(parseFixedTourBeginBookingInput(input)).toMatchObject({ ok: false });
    }
  });

  it("accepts only the exact browser-visible begin-booking result", () => {
    expect(parseFixedTourBeginBookingResult(validResult)).toEqual({
      ok: true,
      value: validResult,
    });

    for (const forbiddenField of [
      "actorId",
      "ownerUserId",
      "role",
      "attemptId",
      "amount",
      "amountMinor",
      "currency",
      "status",
      "holdDurationMinutes",
      "providerIdempotencyKey",
      "canonicalHash",
      "requestHash",
    ]) {
      expect(parseFixedTourBeginBookingResult({
        ...validResult,
        [forbiddenField]: "server-owned",
      })).toEqual({
        ok: false,
        error: {
          code: "UNKNOWN_FIELD",
          messageKey: "fixedTour.contract.unknown_field",
          fieldPath: `result.${forbiddenField}`,
        },
      });
    }
  });

  it("rejects malformed or incomplete begin-booking results", () => {
    for (const result of [
      null,
      { ...validResult, bookingId: "not-a-uuid" },
      { ...validResult, holdExpiresAt: "2026-02-30T08:35:00.000Z" },
      { ...validResult, state: "paid" },
      { bookingId, holdExpiresAt: validResult.holdExpiresAt },
    ]) {
      expect(parseFixedTourBeginBookingResult(result)).toMatchObject({ ok: false });
    }

    expect(parseFixedTourBeginBookingResult({ ...validResult, state: "resumed" })).toEqual({
      ok: true,
      value: { ...validResult, state: "resumed" },
    });
  });

  it("accepts only booking identity and idempotency for simulated payment", () => {
    expect(parseCompleteSimulatedPaymentInput(validPaymentInput)).toEqual({
      ok: true,
      value: validPaymentInput,
    });

    for (const forbiddenField of [
      "actorId",
      "ownerUserId",
      "amountMinor",
      "currency",
      "outcome",
      "paymentStatus",
      "simulatedAt",
      "providerSessionId",
      "card",
    ]) {
      expect(parseCompleteSimulatedPaymentInput({
        ...validPaymentInput,
        [forbiddenField]: "server-owned",
      })).toMatchObject({
        ok: false,
        error: { code: "UNKNOWN_FIELD", fieldPath: `input.${forbiddenField}` },
      });
    }

    for (const malformed of [
      null,
      { ...validPaymentInput, bookingId: "not-a-uuid" },
      { ...validPaymentInput, idempotencyKey: " contains spaces " },
      { bookingId },
    ]) {
      expect(parseCompleteSimulatedPaymentInput(malformed)).toMatchObject({ ok: false });
    }
  });

  it("strictly validates completed, expired, and replayed mutation results", () => {
    expect(parseCompleteSimulatedPaymentResult(validPaymentResult)).toEqual({
      ok: true,
      value: validPaymentResult,
    });
    expect(parseCompleteSimulatedPaymentResult({
      ...validPaymentResult,
      bookingStatus: "expired",
      paymentStatus: null,
      state: "expired",
    })).toMatchObject({ ok: true });
    expect(parseCompleteSimulatedPaymentResult({
      ...validPaymentResult,
      state: "replayed",
    })).toMatchObject({ ok: true });

    for (const malformed of [
      { ...validPaymentResult, paymentStatus: "failed" },
      { ...validPaymentResult, simulatedAt: "2026-02-30T08:05:00.000Z" },
      { ...validPaymentResult, state: "created" },
      { ...validPaymentResult, amountMinor: "1500000" },
      { bookingId, bookingStatus: "confirmed", paymentStatus: "paid", simulatedAt: validPaymentResult.simulatedAt },
    ]) {
      expect(parseCompleteSimulatedPaymentResult(malformed)).toMatchObject({ ok: false });
    }
  });

  it("strictly validates owner-scoped simulated payment projection rows", () => {
    expect(parseFixedTourPaymentStatus(validPaymentStatus)).toEqual({
      ok: true,
      value: validPaymentStatus,
    });
    expect(parseFixedTourPaymentStatus({
      ...validPaymentStatus,
      bookingStatus: "expired",
      paymentStatus: null,
    })).toMatchObject({ ok: true });

    for (const malformed of [
      { ...validPaymentStatus, amountMinor: "9007199254740992" },
      { ...validPaymentStatus, currency: "eur" },
      { ...validPaymentStatus, paymentStatus: "failed" },
      { ...validPaymentStatus, paymentStatus: null },
      { ...validPaymentStatus, bookingStatus: "expired", paymentStatus: "paid" },
      { ...validPaymentStatus, ownerUserId: "leak" },
      { ...validPaymentStatus, simulatedAt: null },
    ]) {
      expect(parseFixedTourPaymentStatus(malformed)).toMatchObject({ ok: false });
    }
  });

});
