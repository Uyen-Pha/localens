import {
  FixedTourRuntimeError,
  type FixedTourRuntimePort,
} from "@/lib/application/fixed-tour/contracts";

export interface FixedTourRuntimeComposition {
  readonly fixedTour: FixedTourRuntimePort;
}

const REQUIRED_METHODS = [
  "listPublishedTours",
  "listAvailability",
  "beginBooking",
  "listOwnBookings",
  "listOwnPaymentStatuses",
  "completeSimulatedPayment",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createFixedTourRuntimeComposition(
  fixedTour: FixedTourRuntimePort,
): FixedTourRuntimeComposition {
  if (
    !isRecord(fixedTour) ||
    REQUIRED_METHODS.some((method) => typeof fixedTour[method] !== "function")
  ) {
    throw new FixedTourRuntimeError("SERVICE_UNAVAILABLE");
  }

  return { fixedTour };
}
