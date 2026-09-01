import { describe, expect, expectTypeOf, it } from "vitest";

import {
  parseFixedTourBeginBookingInput,
  parseFixedTourBeginBookingResult,
  type FixedTourBeginBookingInput,
  type FixedTourBeginBookingResult,
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

describe("fixed-tour runtime contracts", () => {
  it("reuses the domain projections in the four browser-safe port operations", async () => {
    const tours: PublishedTour[] = [];
    const availability: LiveDepartureAvailability[] = [];
    const bookings: CustomerBooking[] = [];
    const result: FixedTourBeginBookingResult = validResult;

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
    };

    expect(Object.keys(port).sort()).toEqual([
      "beginBooking",
      "listAvailability",
      "listOwnBookings",
      "listPublishedTours",
    ]);
    await expect(port.listPublishedTours("en")).resolves.toBe(tours);
    await expect(port.listAvailability()).resolves.toBe(availability);
    await expect(port.beginBooking(validInput)).resolves.toBe(result);
    await expect(port.listOwnBookings()).resolves.toBe(bookings);

    expectTypeOf<ReturnType<FixedTourRuntimePort["listPublishedTours"]>>()
      .toEqualTypeOf<Promise<PublishedTour[]>>();
    expectTypeOf<ReturnType<FixedTourRuntimePort["listAvailability"]>>()
      .toEqualTypeOf<Promise<LiveDepartureAvailability[]>>();
    expectTypeOf<ReturnType<FixedTourRuntimePort["beginBooking"]>>()
      .toEqualTypeOf<Promise<FixedTourBeginBookingResult>>();
    expectTypeOf<ReturnType<FixedTourRuntimePort["listOwnBookings"]>>()
      .toEqualTypeOf<Promise<CustomerBooking[]>>();
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
});
