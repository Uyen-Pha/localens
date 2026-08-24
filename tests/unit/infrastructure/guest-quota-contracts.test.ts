// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseGuestCapability,
  parseQuotaReservation,
} from "@/lib/infrastructure/supabase/guest-quota-contracts";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260823100000_guest_quota.sql"),
  "utf8",
);

const planId = "00000000-0000-0000-0000-000000000701";
const reservationId = "00000000-0000-0000-0000-000000000702";
const ipHash = "a".repeat(64);
const deviceHash = "b".repeat(64);

describe("guest capability contracts", () => {
  it("accepts only the internal hashed capability shape", () => {
    expect(parseGuestCapability({ planId, tokenHash: ipHash, pepperVersion: 1 })).toEqual({
      ok: true,
      value: { planId, tokenHash: ipHash, pepperVersion: 1 },
    });
    expect(parseGuestCapability({ planId, tokenHash: ipHash, pepperVersion: 0 })).toMatchObject({ ok: false });
    expect(parseGuestCapability({ planId, tokenHash: "raw-guest-token", pepperVersion: 1 })).toMatchObject({ ok: false });
    expect(parseGuestCapability({ planId, tokenHash: ipHash, pepperVersion: 1, guestToken: "raw" })).toMatchObject({ ok: false });
  });

  it("accepts canonical hourly planner and daily Gemini reservations only", () => {
    expect(parseQuotaReservation({
      reservationId,
      kind: "planner",
      bucketHashes: [ipHash, deviceHash],
      periodStart: "2026-08-24T15:00:00Z",
    })).toMatchObject({ ok: true });
    expect(parseQuotaReservation({
      reservationId,
      kind: "gemini",
      bucketHashes: [ipHash, deviceHash],
      periodStart: "2026-08-24T00:00:00Z",
    })).toMatchObject({ ok: true });
    expect(parseQuotaReservation({
      reservationId,
      kind: "planner",
      bucketHashes: [ipHash, ipHash],
      periodStart: "2026-08-24T15:00:00Z",
    })).toMatchObject({ ok: false });
    expect(parseQuotaReservation({
      reservationId,
      kind: "gemini",
      bucketHashes: [ipHash],
      periodStart: "2026-08-24T15:00:00Z",
    })).toMatchObject({ ok: false });
    expect(parseQuotaReservation({
      reservationId,
      kind: "planner",
      bucketHashes: [deviceHash, ipHash],
      periodStart: "2026-08-24T15:00:00Z",
    })).toMatchObject({ ok: true });
    for (const periodStart of [
      "2026-99-24T15:00:00Z",
      "2026-04-31T15:00:00Z",
      "2026-08-24T99:00:00Z",
      "2025-02-29T15:00:00Z",
    ]) {
      expect(parseQuotaReservation({
        reservationId,
        kind: "planner",
        bucketHashes: [ipHash, deviceHash],
        periodStart,
      })).toMatchObject({ ok: false });
    }
  });
});

describe("guest quota migration contract", () => {
  it("creates capability and quota tables with exact uniqueness boundaries", () => {
    expect(migration).toMatch(/CREATE TABLE private\.guest_bindings/);
    expect(migration).toMatch(/CREATE TABLE private\.guest_capabilities/);
    expect(migration).toMatch(/CREATE TABLE private\.quota_buckets/);
    expect(migration).toMatch(/CREATE TABLE private\.quota_reservations/);
    expect(migration).toMatch(/UNIQUE \(token_hash\)/);
    expect(migration).toMatch(/CREATE UNIQUE INDEX[^\n]*guest_capabilities_one_active_plan/);
    expect(migration).toMatch(/UNIQUE \(bucket_kind, bucket_hash, period_start\)/);
    expect(migration).toMatch(/UNIQUE \(reservation_id\)/);
    expect(migration).toMatch(/UNIQUE \(period_start\)/);
    expect(migration).toMatch(/pepper_version[\s\S]*CHECK[\s\S]*BETWEEN 1 AND 2/);
  });

  it("adds the guest plan FK, internal RPCs, and no browser capability", () => {
    expect(migration).toMatch(/ALTER TABLE public\.trip_plans[\s\S]*ADD CONSTRAINT trip_plans_guest_binding_fk[\s\S]*REFERENCES private\.guest_bindings\(id\)/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION private\.create_guest_plan/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.claim_guest_plan/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION private\.advance_trip_plan_revision/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.advance_trip_plan_revision/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION (?:private\.create_guest_plan|public\.claim_guest_plan|private\.advance_trip_plan_revision)/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.claim_guest_plan[^\n]*TO authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.advance_trip_plan_revision[^\n]*TO authenticated/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION private\.advance_trip_plan_revision[^\n]*authenticated/);
    expect(migration).not.toMatch(/GRANT EXECUTE ON FUNCTION private\.create_guest_plan[^\n]*(?:anon|authenticated)/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION private\.advance_guest_trip_plan_revision[^\n]*localens_guest_executor/);
    expect(migration).toMatch(/raw guest token|raw_token|token_hash[\s\S]*/);
    expect(migration).not.toMatch(/request\.headers|x-forwarded-for/i);
  });

  it("defines database-owned expiry, claim-once, and atomic quota limits", () => {
    expect(migration).toMatch(/expires_at timestamptz NOT NULL DEFAULT[^\n]*INTERVAL '24 hours'/);
    expect(migration).toMatch(/owner_user_id IS (?:NULL|NOT NULL)[\s\S]*expires_at (?:>|<=) pg_catalog\.clock_timestamp\(\)/);
    expect(migration).toMatch(/actor_user_id := \(SELECT auth\.uid\(\)\)/);
    expect(migration).toMatch(/UPDATE public\.trip_plans[\s\S]*owner_user_id = p_actor_user_id/);
    expect(migration).toMatch(/planner[\s\S]*30/);
    expect(migration).toMatch(/gemini[\s\S]*5/);
    expect(migration).toMatch(/global[\s\S]*100/);
    expect(migration).toMatch(/FOR UPDATE/);
    expect(migration).toMatch(/ON CONFLICT \(reservation_id\)/);
  });

  it("reserves both buckets deterministically and keeps failed model attempts consumed", () => {
    expect(migration).toMatch(/ORDER BY (?:buckets\.)?bucket_kind, (?:buckets\.)?bucket_hash/);
    expect(migration).toMatch(/provider_attempted[\s\S]*quota_exhausted/);
    expect(migration).toMatch(/outcome IN \('created', 'failed', 'quota_exhausted'\)/);
    expect(migration).toMatch(/REVOKE ALL ON TABLE private\.(?:guest_bindings|guest_capabilities|quota_buckets|quota_reservations)/);
  });
});
