import { describe, expect, it, vi } from "vitest";

import {
  FixedTourRuntimeError,
  type FixedTourRuntimePort,
} from "@/lib/application/fixed-tour/contracts";
import { createFixedTourRuntimeComposition } from "@/lib/application/fixed-tour/composition";

function completePort(): FixedTourRuntimePort {
  return {
    listPublishedTours: vi.fn().mockResolvedValue([]),
    listAvailability: vi.fn().mockResolvedValue([]),
    beginBooking: vi.fn(),
    listOwnBookings: vi.fn().mockResolvedValue([]),
    listOwnPaymentStatuses: vi.fn().mockResolvedValue([]),
    completeSimulatedPayment: vi.fn(),
    listOwnCancellationRequests: vi.fn().mockResolvedValue([]),
    requestCancellation: vi.fn(),
    listCancellationQueue: vi.fn().mockResolvedValue([]),
    decideCancellation: vi.fn(),
  };
}

describe("fixed-tour runtime composition", () => {
  it("preserves the exact adapter instance", () => {
    const fixedTour = completePort();
    expect(createFixedTourRuntimeComposition(fixedTour)).toEqual({ fixedTour });
    expect(createFixedTourRuntimeComposition(fixedTour).fixedTour).toBe(fixedTour);
  });

  it.each([
    "listPublishedTours",
    "listAvailability",
    "beginBooking",
    "listOwnBookings",
    "listOwnPaymentStatuses",
    "completeSimulatedPayment",
    "listOwnCancellationRequests",
    "requestCancellation",
    "listCancellationQueue",
    "decideCancellation",
  ] as const)("fails closed when %s is missing", (method) => {
    const fixedTour = completePort() as unknown as Record<string, unknown>;
    delete fixedTour[method];

    expect(() => createFixedTourRuntimeComposition(fixedTour as never)).toThrowError(
      expect.objectContaining<Partial<FixedTourRuntimeError>>({ code: "SERVICE_UNAVAILABLE" }),
    );
  });
});
