import { z } from "zod";

import type { DataAdapterError } from "@/lib/domain/data/contracts";

export interface GuestCapability {
  planId: string;
  tokenHash: string;
  pepperVersion: number;
}

export interface QuotaReservation {
  reservationId: string;
  kind: "planner" | "gemini";
  bucketHashes: string[];
  periodStart: string;
}

export interface QuotaReservationInput {
  reservationId: string;
  kind: "planner" | "gemini";
  ipHash: string;
  deviceHash: string;
}

export interface QuotaReservationDecision extends QuotaReservation {
  state: "created" | "replayed";
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const HOUR_PERIOD_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/;
const DAY_PERIOD_PATTERN = /^\d{4}-\d{2}-\d{2}T00:00:00Z$/;

function isRealUtcPeriod(value: string, pattern: RegExp): boolean {
  if (!pattern.test(value)) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  const date = new Date(parsed);
  return (
    date.getUTCFullYear() === Number(value.slice(0, 4)) &&
    date.getUTCMonth() + 1 === Number(value.slice(5, 7)) &&
    date.getUTCDate() === Number(value.slice(8, 10)) &&
    date.getUTCHours() === Number(value.slice(11, 13)) &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0
  );
}

const uuidSchema = z.string().refine((value) => UUID_PATTERN.test(value), {
  message: "must be a lowercase canonical UUID",
});
const hashSchema = z.string().refine((value) => HASH_PATTERN.test(value), {
  message: "must be a lowercase HMAC digest",
});

const quotaReservationInputSchema = z.object({
  reservationId: uuidSchema,
  kind: z.enum(["planner", "gemini"]),
  ipHash: hashSchema,
  deviceHash: hashSchema,
}).strict().refine((value) => value.ipHash !== value.deviceHash, {
  message: "IP and device hashes must be unique",
});

export const guestCapabilitySchema = z.object({
  planId: uuidSchema,
  tokenHash: hashSchema,
  pepperVersion: z.number().int().min(1).max(2),
}).strict();

export const quotaReservationSchema = z.object({
  reservationId: uuidSchema,
  kind: z.enum(["planner", "gemini"]),
  bucketHashes: z.array(hashSchema).length(2).refine(
    (values) => new Set(values).size === values.length,
    { message: "bucket hashes must be unique" },
  ),
  periodStart: z.string(),
}).strict().superRefine((value, context) => {
  const validPeriod = value.kind === "planner"
    ? isRealUtcPeriod(value.periodStart, HOUR_PERIOD_PATTERN)
    : isRealUtcPeriod(value.periodStart, DAY_PERIOD_PATTERN);
  if (!validPeriod) {
    context.addIssue({ code: "custom", path: ["periodStart"], message: "period start is not canonical for quota kind" });
  }
});

export const quotaReservationDecisionSchema = quotaReservationSchema.extend({
  state: z.enum(["created", "replayed"]),
}).strict();

function invalid(fieldPath: string): { ok: false; error: DataAdapterError } {
  return {
    ok: false,
    error: {
      code: "INVALID_SHAPE",
      messageKey: "data.adapter.invalid_shape",
      fieldPath,
    },
  };
}

export type GuestQuotaContractResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: DataAdapterError };

export function parseGuestCapability(value: unknown): GuestQuotaContractResult<GuestCapability> {
  const parsed = guestCapabilitySchema.safeParse(value);
  return parsed.success ? { ok: true, value: parsed.data } : invalid("guestCapability");
}

export function parseQuotaReservation(value: unknown): GuestQuotaContractResult<QuotaReservation> {
  const parsed = quotaReservationSchema.safeParse(value);
  return parsed.success ? { ok: true, value: parsed.data } : invalid("quotaReservation");
}

export function parseQuotaReservationInput(value: unknown): GuestQuotaContractResult<QuotaReservationInput> {
  const parsed = quotaReservationInputSchema.safeParse(value);
  return parsed.success ? { ok: true, value: parsed.data } : invalid("quotaReservationInput");
}

export function parseQuotaReservationDecision(value: unknown): GuestQuotaContractResult<QuotaReservationDecision> {
  const parsed = quotaReservationDecisionSchema.safeParse(value);
  return parsed.success ? { ok: true, value: parsed.data } : invalid("quotaReservationDecision");
}
