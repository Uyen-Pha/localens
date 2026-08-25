// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseGuestCapability,
  parseQuotaReservationDecision,
  parseQuotaReservationInput,
  parseQuotaReservation,
} from "@/lib/infrastructure/supabase/guest-quota-contracts";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260823100000_guest_quota.sql"),
  "utf8",
);
const databaseFixture = readFileSync(
  join(process.cwd(), "supabase", "tests", "database", "guest_quota_test.sql"),
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

  it("keeps semantic IP/device input named and distinguishes created from replayed output", () => {
    const input = parseQuotaReservationInput({
      reservationId,
      kind: "planner",
      ipHash,
      deviceHash,
    });
    expect(input).toEqual({
      ok: true,
      value: { reservationId, kind: "planner", ipHash, deviceHash },
    });
    expect(parseQuotaReservationInput({
      reservationId,
      kind: "planner",
      bucketHashes: [ipHash, deviceHash],
    })).toMatchObject({ ok: false });

    const decision = {
      reservationId,
      kind: "planner" as const,
      bucketHashes: [ipHash, deviceHash],
      periodStart: "2026-08-24T15:00:00Z",
      state: "created" as const,
    };
    expect(parseQuotaReservationDecision(decision)).toEqual({ ok: true, value: decision });
    expect(parseQuotaReservationDecision({ ...decision, state: "replayed" })).toMatchObject({ ok: true });
    expect(parseQuotaReservationDecision({ ...decision, state: "failed" })).toMatchObject({ ok: false });
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

  it("uses immutable reservation rows and named semantic quota inputs", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION private\.reserve_quota\([\s\S]*p_reservation_id uuid,[\s\S]*p_kind text,[\s\S]*p_ip_hash text,[\s\S]*p_device_hash text/);
    expect(migration).toMatch(/RETURNS TABLE \([\s\S]*state text/);
    expect(migration).toMatch(/quota_reservations_append_only_update_delete/);
    expect(migration).toMatch(/quota_reservations_append_only_truncate/);
    expect(migration).not.toMatch(/GRANT UPDATE \(id\) ON TABLE private\.quota_reservations/);
    const reservationFunction = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION private.reserve_quota"));
    expect(reservationFunction).not.toMatch(/FROM private\.quota_reservations[\s\S]{0,180}FOR UPDATE/);
    expect(reservationFunction).toMatch(/INSERT INTO private\.quota_reservations[\s\S]*ON CONFLICT \(reservation_id\) DO NOTHING[\s\S]*RETURNING/);
    expect(reservationFunction).toMatch(/state\s*:=\s*'created'/);
    expect(reservationFunction).toMatch(/state\s*:=\s*'replayed'/);
    expect(reservationFunction).toMatch(/existing\.kind IS DISTINCT FROM p_kind[\s\S]*existing\.bucket_hashes IS DISTINCT FROM expected_hashes/);
    expect(migration).not.toMatch(/CREATE POLICY quota_reservations_quota_owner_(?:denied_mutation|no_update|all)/);
    expect(migration).toMatch(/CREATE POLICY quota_reservations_quota_owner_select[\s\S]*FOR SELECT/);
    expect(migration).toMatch(/CREATE POLICY quota_reservations_quota_owner_insert[\s\S]*FOR INSERT/);
    expect(migration).toMatch(/pg_auth_members[\s\S]*JOIN pg_catalog\.pg_roles AS parent_role[\s\S]*JOIN pg_catalog\.pg_roles AS member_role/);
    expect(migration).toMatch(/WHERE parent_role\.rolname[\s\S]*ANY\(protected_roles\)[\s\S]*OR member_role\.rolname[\s\S]*ANY\(protected_roles\)/);
    expect(migration).toMatch(/localens_plan_rpc_owner[\s\S]*localens_plan_guard_owner/);
    expect(migration).not.toMatch(/GRANT UPDATE \(id\) ON TABLE private\.(?:guest_bindings|guest_capabilities) TO localens_plan_rpc_owner/);
    const persistFunction = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION private.persist_trip_plan_revision"),
      migration.indexOf("CREATE OR REPLACE FUNCTION private.advance_trip_plan_revision"),
    );
    expect(persistFunction).toMatch(/FROM public\.trip_plans[\s\S]*FOR UPDATE/);
    expect(persistFunction).toMatch(/FROM private\.guest_bindings[\s\S]*WHERE[\s\S]*;[\s\S]*SELECT \* INTO capability_row[\s\S]*FROM private\.guest_capabilities/);
    expect(persistFunction).not.toMatch(/FROM private\.(?:guest_bindings|guest_capabilities)[\s\S]*FOR UPDATE/);
    expect(migration).toMatch(/ALTER FUNCTION private\.reserve_quota\(uuid, text, text, text\)/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION private\.reserve_quota\(uuid, text, text, text\) TO localens_quota_executor/);
    expect(migration).not.toMatch(/reserve_quota\(uuid, text, text\[\]\)/);
    expect(databaseFixture).toMatch(/private\.reserve_quota\([^,]+,\s*'planner',\s*[^,]+,\s*[^)]+\)/);
    expect(databaseFixture).toMatch(/state[\s\S]*created[\s\S]*replayed/);
    expect(databaseFixture).not.toMatch(/private\.reserve_quota\([^,]+,\s*'(?:planner|gemini)',\s*ARRAY\[/);
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
