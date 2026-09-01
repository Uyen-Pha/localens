// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  canonicalCheckoutRequestHash,
  canonicalCheckoutRequestPayload,
  mapCustomerBooking,
  mapLiveDepartureAvailability,
  toRecordCheckoutSession,
  toStartCheckoutInput,
  toStripeCheckoutSession,
} from "@/lib/infrastructure/supabase/checkout-contracts";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260823102000_bookings_holds_idempotency.sql"),
  "utf8",
);
const foodPersistenceMigration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260828123000_food_plan_quote_snapshots.sql"),
  "utf8",
);
const pgTap = readFileSync(
  join(process.cwd(), "supabase", "tests", "database", "bookings_holds_idempotency_test.sql"),
  "utf8",
);

const ids = {
  booking: "00000000-0000-0000-0000-000000000901",
  attempt: "00000000-0000-0000-0000-000000000902",
  departure: "00000000-0000-0000-0000-000000000903",
  tourVersion: "00000000-0000-0000-0000-000000000904",
  quote: "00000000-0000-0000-0000-000000000905",
  catalog: "00000000-0000-0000-0000-000000000906",
  travel: "00000000-0000-0000-0000-000000000907",
  fx: "00000000-0000-0000-0000-000000000908",
};
const now = new Date("2026-08-25T10:00:00.000Z");
const bookingRow = {
  id: ids.booking,
  status: "pending_payment",
  source_kind: "departure",
  source_id: ids.departure,
  tour_version_id: ids.tourVersion,
  quote_id: null,
  title_en: "Old Saigon morning walk",
  title_vi: "Dạo bộ Sài Gòn xưa buổi sáng",
  cancellation_policy: "Cancel up to 48 hours before departure.",
  catalog_snapshot_id: ids.catalog,
  travel_snapshot_id: ids.travel,
  fx_snapshot_id: null,
  fx_vnd_per_usd: null,
  per_person_vnd_minor: "1250000",
  total_vnd_minor: "2500000",
  checkout_currency: "vnd",
  checkout_amount_minor: "2500000",
  party_size: 2,
  language: "en",
  meeting_point: "Ben Thanh Market gate",
  hold_expires_at: "2026-08-25T10:35:00+00:00",
  created_at: "2026-08-25T10:00:00+00:00",
};

const result = {
  bookingId: ids.booking,
  attemptId: ids.attempt,
  providerIdempotencyKey: `localens:stripe-checkout:v1:${ids.attempt}`,
  amountMinor: "2500000",
  currency: "vnd" as const,
  holdExpiresAt: "2026-08-25T10:35:00+00:00",
  state: "created" as const,
};

describe("Task 9 checkout contracts", () => {
  it("requires a strict checkout input and never accepts client-owned amount or actor fields", async () => {
    expect(toStartCheckoutInput({
      source: { kind: "departure", departureId: ids.departure },
      partySize: 2,
      locale: "en",
      idempotencyKey: "checkout-2026-09-01-001",
    })).toEqual({
      ok: true,
      value: {
        source: { kind: "departure", departureId: ids.departure },
        partySize: 2,
        locale: "en",
        idempotencyKey: "checkout-2026-09-01-001",
      },
    });

    expect(toStartCheckoutInput({
      source: { kind: "quote", quoteId: ids.quote },
      partySize: 1,
      locale: "vi",
      idempotencyKey: "checkout-quote-001",
    })).toMatchObject({ ok: true });

    for (const value of [
      { source: { kind: "departure", departureId: ids.departure }, partySize: 2, locale: "en", idempotencyKey: "x", amountMinor: "1" },
      { source: { kind: "departure", departureId: ids.departure }, partySize: 0, locale: "en", idempotencyKey: "x" },
      { source: { kind: "departure", departureId: ids.departure }, partySize: 2, locale: "en", idempotencyKey: "x x" },
      { source: { kind: "other", departureId: ids.departure }, partySize: 2, locale: "en", idempotencyKey: "x" },
    ]) {
      expect(toStartCheckoutInput(value as never).ok).toBe(false);
    }
  });

  it("uses one delimiter-safe, field-ordered UTF-8 hash payload for Edge and SQL", async () => {
    const owner = "00000000-0000-0000-0000-000000000999";
    const source = { kind: "quote" as const, quoteId: ids.quote };
    const payload = canonicalCheckoutRequestPayload(owner, source, 3, "en");
    expect(payload).toBe(`localens-checkout-v1|${owner}|quote|${ids.quote}|3|en`);
    expect(await canonicalCheckoutRequestHash(owner, source, 3, "en")).toBe(
      "99f0749c0121ab0743e50cab996292652be5b71de6fae33a1f8b85e8c361ce6e",
    );
    expect(migration).toMatch(/checkout_canonical_payload[\s\S]*localens-checkout-v1\|.*p_owner_user_id::text.*p_source_kind.*p_source_id::text.*p_party_size::text.*p_locale::text/i);
    expect(migration).toMatch(/canonical_hash\s*:=\s*[\s\S]*private\.checkout_canonical_payload\(actor_user_id, p_source_kind, p_source_id, p_party_size, p_locale\)/i);
    expect(migration).toMatch(/IF NOT inserted THEN[\s\S]*booking_row\.source_kind IS DISTINCT FROM p_source_kind[\s\S]*booking_row\.source_id IS DISTINCT FROM p_source_id[\s\S]*booking_row\.party_size IS DISTINCT FROM p_party_size[\s\S]*booking_row\.language IS DISTINCT FROM p_locale/i);
    expect(migration).toMatch(/IF NOT inserted THEN[\s\S]*SELECT \* INTO booking_row FROM public\.bookings[\s\S]*FOR UPDATE[\s\S]*SELECT \* INTO retry_attempt_row FROM private\.checkout_attempts[\s\S]*FOR UPDATE/i);
  });

  it("builds a card-only Stripe session with server-owned amount, metadata, allowlisted URLs, and a 30-minute expiry", () => {
    const parsed = toStripeCheckoutSession(result, {
      successUrl: "https://locallens.example/checkout/success",
      cancelUrl: "https://locallens.example/checkout/cancel",
    }, now);
    expect(parsed).toEqual({
      ok: true,
      value: {
        mode: "payment",
        payment_method_types: ["card"],
        expires_at: Math.floor(now.getTime() / 1000) + 30 * 60,
        client_reference_id: ids.booking,
        metadata: { booking_id: ids.booking, attempt_id: ids.attempt },
        line_items: [{
          price_data: {
            currency: "vnd",
            unit_amount: 2500000,
            product_data: { name: "LocalLens tour booking" },
          },
          quantity: 1,
        }],
        success_url: "https://locallens.example/checkout/success",
        cancel_url: "https://locallens.example/checkout/cancel",
      },
    });

    for (const urls of [
      { successUrl: "javascript:alert(1)", cancelUrl: "https://locallens.example/cancel" },
      { successUrl: "https://evil.example/success", cancelUrl: "https://locallens.example/cancel" },
      { successUrl: "https://locallens.vn:444/success", cancelUrl: "https://locallens.example/cancel" },
      { successUrl: "https://locallens.example/success#token", cancelUrl: "https://locallens.example/cancel" },
      { successUrl: "https://locallens.example/success?utm_source=x", cancelUrl: "https://locallens.example/cancel" },
    ]) {
      expect(toStripeCheckoutSession(result, urls, now).ok).toBe(false);
    }

    expect(toStripeCheckoutSession({ ...result, amountMinor: "9007199254740992" }, {
      successUrl: "https://locallens.example/success",
      cancelUrl: "https://locallens.example/cancel",
    }, now).ok).toBe(false);
    expect(toStripeCheckoutSession({ ...result, holdExpiresAt: "2026-08-25T10:29:59+00:00" }, {
      successUrl: "https://locallens.example/success",
      cancelUrl: "https://locallens.example/cancel",
    }, now).ok).toBe(false);
    expect(toStripeCheckoutSession({ ...result, holdExpiresAt: "2026-08-25T10:30:00+00:00" }, {
      successUrl: "https://locallens.example/success",
      cancelUrl: "https://locallens.example/cancel",
    }, now).ok).toBe(false);
  });

  it("accepts only the exact record-session input and maps its durable provider expiry", () => {
    const input = {
      bookingId: ids.booking,
      attemptId: ids.attempt,
      providerSessionId: "cs_test_localens_001",
      providerExpiresAt: "2026-08-25T10:30:00+00:00",
    };
    expect(toRecordCheckoutSession(input)).toEqual({ ok: true, value: input });
    expect(toRecordCheckoutSession({ ...input, providerSessionId: "" }).ok).toBe(false);
    expect(toRecordCheckoutSession({ ...input, extra: true }).ok).toBe(false);
  });

  it("maps the exact customer booking projection and rejects extra or unsafe fields", () => {
    expect(mapCustomerBooking(bookingRow)).toEqual({
      ok: true,
      value: {
        id: ids.booking,
        status: "pending_payment",
        sourceKind: "departure",
        sourceId: ids.departure,
        tourVersionId: ids.tourVersion,
        quoteId: null,
        titleEn: bookingRow.title_en,
        titleVi: bookingRow.title_vi,
        cancellationPolicy: bookingRow.cancellation_policy,
        catalogSnapshotId: ids.catalog,
        travelSnapshotId: ids.travel,
        fxSnapshotId: null,
        fxVndPerUsd: null,
        perPersonVndMinor: "1250000",
        totalVndMinor: "2500000",
        checkoutCurrency: "vnd",
        checkoutAmountMinor: "2500000",
        partySize: 2,
        language: "en",
        meetingPoint: bookingRow.meeting_point,
        holdExpiresAt: bookingRow.hold_expires_at,
        createdAt: bookingRow.created_at,
      },
    });
    expect(mapCustomerBooking({ ...bookingRow, leaked_owner_user_id: ids.booking }).ok).toBe(false);
    expect(mapCustomerBooking({ ...bookingRow, total_vnd_minor: "9007199254740992" }).ok).toBe(false);
  });

  it("maps sanitized live availability and never accepts negative or leaked columns", () => {
    const row = {
      id: ids.departure,
      tour_version_id: ids.tourVersion,
      start_at: "2026-09-01T02:00:00+00:00",
      end_at: "2026-09-01T05:00:00+00:00",
      status: "scheduled",
      remaining_capacity: 8,
    };
    expect(mapLiveDepartureAvailability(row)).toEqual({
      ok: true,
      value: {
        id: ids.departure,
        tourVersionId: ids.tourVersion,
        startAt: row.start_at,
        endAt: row.end_at,
        status: "scheduled",
        remainingCapacity: 8,
      },
    });
    expect(mapLiveDepartureAvailability({ ...row, remaining_capacity: -1 }).ok).toBe(false);
    expect(mapLiveDepartureAvailability({ ...row, hold_id: ids.attempt }).ok).toBe(false);
  });

  it("declares the atomic booking, hold, checkout, compensation, and availability contracts", () => {
    expect(migration).toMatch(/CREATE TABLE public\.bookings[\s\S]*CHECK\s*\(\(departure_id IS NOT NULL\) <> \(quote_id IS NOT NULL\)\)/i);
    expect(migration).toMatch(/CREATE TABLE private\.checkout_idempotency/i);
    expect(migration).toMatch(/CREATE TABLE private\.capacity_holds/i);
    expect(migration).toMatch(/interval\s+'35 minutes'/i);
    expect(migration).toMatch(/provider_idempotency_key/i);
    expect(migration).toMatch(/start_checkout_tx/i);
    expect(migration).toMatch(/record_checkout_session/i);
    expect(migration).toMatch(/compensate_checkout_failure/i);
    expect(migration).toMatch(/get_live_departure_availability/i);
    expect(migration).toMatch(/SECURITY DEFINER[\s\S]*SET search_path\s*=\s*''/i);
    expect(migration).toMatch(/remaining_capacity/i);
    expect(pgTap).toMatch(/SELECT plan\(/i);
    expect(pgTap).toMatch(/idempotency conflict|IDEMPOTENCY_CONFLICT/i);
    expect(pgTap).toMatch(/oversell|capacity/i);
    expect(pgTap).toMatch(/hostile search path|search_path/i);
    expect(migration).toMatch(/CREATE ROLE localens_booking_projection_owner[\s\S]*NOLOGIN[\s\S]*NOBYPASSRLS/i);
    expect(migration).toMatch(/CREATE ROLE localens_checkout_rpc_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS/);
    expect(migration).toMatch(/CREATE ROLE localens_availability_rpc_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS/);
    expect(migration).toMatch(/CREATE ROLE localens_booking_projection_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS/);
    expect(migration).toMatch(/unsafe pre-existing LocalLens booking role attributes/);
    expect(migration).not.toMatch(/ALTER ROLE localens_/);
    for (const role of ["localens_checkout_rpc_owner", "localens_availability_rpc_owner", "localens_booking_projection_owner"]) {
      expect(migration).toContain(`GRANT ${role} TO postgres WITH SET TRUE, INHERIT FALSE;`);
    }
    expect(migration).toMatch(/REVOKE ALL ON ALL TABLES IN SCHEMA public, private, auth[\s\S]*GRANT CREATE ON SCHEMA private TO localens_identity_rpc_owner, localens_checkout_rpc_owner/);
    expect(migration).toMatch(/GRANT CREATE ON SCHEMA public TO localens_availability_rpc_owner, localens_booking_projection_owner/);
    expect(migration).toMatch(/GRANT INSERT ON TABLE private\.audit_events TO localens_identity_rpc_owner;[\s\S]*REVOKE CREATE ON SCHEMA private FROM localens_identity_rpc_owner, localens_checkout_rpc_owner;[\s\S]*REVOKE CREATE ON SCHEMA public FROM localens_availability_rpc_owner, localens_booking_projection_owner;[\s\S]*COMMIT/);
    expect(migration).toMatch(/CREATE POLICY bookings_projection_owner_select[\s\S]*request\.jwt\.claim\.sub/i);
    expect(migration).toMatch(/WITH \(security_invoker\s*=\s*false,\s*security_barrier\s*=\s*true\)/i);
    expect(migration).not.toMatch(/security_invoker\s*=\s*true/i);
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.bookings[\s\S]*FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT USAGE ON SCHEMA public, private TO localens_availability_rpc_owner/i);
    expect(migration).toMatch(/booking_row\.status IN \([\s\S]*confirmed[\s\S]*payment_review[\s\S]*state := 'replayed'/i);
    expect(pgTap).toMatch(/base table|terminal.*replay|early-webhook/i);
  });

  it("keeps Stripe amount/currency validation limited to the LocalLens payable amount", () => {
    expect(foodPersistenceMigration).toMatch(/checkout amount remains the LocalLens-payable amount/);
    expect(foodPersistenceMigration).toMatch(/existing start_checkout_tx and webhook finalizer continue to validate/);
    expect(foodPersistenceMigration).toMatch(/They intentionally do not consult pay_at_vendor_min_vnd\/max_vnd/);
    expect(foodPersistenceMigration).not.toMatch(/amount_value\s*:=\s*[^;]*pay_at_vendor/);
  });
});
