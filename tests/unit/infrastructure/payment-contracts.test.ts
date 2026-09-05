// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  mapCustomerPaymentStatus,
  toFinalizeStripeEventInput,
} from "@/lib/infrastructure/supabase/payment-contracts";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260823103000_payments_webhooks.sql"),
  "utf8",
);
const pgTap = readFileSync(
  join(process.cwd(), "supabase", "tests", "database", "payments_webhooks_test.sql"),
  "utf8",
);

const ids = {
  event: "00000000-0000-0000-0000-000000000a01",
  booking: "00000000-0000-0000-0000-000000000a02",
  attempt: "00000000-0000-0000-0000-000000000a03",
};

const completed = {
  eventId: "evt_localens_001",
  payloadHash: "a".repeat(64),
  sessionId: "cs_localens_001",
  bookingId: ids.booking,
  attemptId: ids.attempt,
  amountMinor: "2500000",
  currency: "vnd",
  livemode: false,
  mode: "payment",
  accountId: "acct_localens_test",
  endpointId: "we_localens_test",
  eventType: "checkout.session.completed",
  sessionStatus: "complete",
  providerPaymentStatus: "paid",
  paymentIntentId: "pi_localens_001",
} as const;

describe("Stripe Test payment adapter contracts", () => {
  it("accepts only a verified, non-live completed event shape", () => {
    expect(toFinalizeStripeEventInput(completed)).toEqual({ ok: true, value: completed });
    expect(toFinalizeStripeEventInput({ ...completed, livemode: true })).toMatchObject({
      ok: false,
      error: { fieldPath: "input.livemode" },
    });
    expect(toFinalizeStripeEventInput({ ...completed, mode: "setup" })).toMatchObject({
      ok: false,
      error: { fieldPath: "input.mode" },
    });
    expect(toFinalizeStripeEventInput({ ...completed, providerPaymentStatus: "unpaid" })).toMatchObject({
      ok: false,
      error: { fieldPath: "input.providerPaymentStatus" },
    });
  });

  it("accepts the expired event only with its exact provider facts", () => {
    expect(toFinalizeStripeEventInput({
      ...completed,
      eventType: "checkout.session.expired",
      sessionStatus: "expired",
      providerPaymentStatus: "unpaid",
      paymentIntentId: null,
    })).toMatchObject({ ok: true });
    expect(toFinalizeStripeEventInput({
      ...completed,
      eventType: "checkout.session.expired",
      sessionStatus: "complete",
      paymentIntentId: null,
    })).toMatchObject({ ok: false, error: { fieldPath: "input.sessionStatus" } });
  });

  it("rejects authority, raw payload, signatures, malformed money, and unsafe IDs", () => {
    expect(toFinalizeStripeEventInput({ ...completed, bookingStatus: "confirmed" })).toMatchObject({
      ok: false,
      error: { code: "UNKNOWN_FIELD" },
    });
    expect(toFinalizeStripeEventInput({ ...completed, rawBody: "secret" })).toMatchObject({
      ok: false,
      error: { code: "UNKNOWN_FIELD" },
    });
    expect(toFinalizeStripeEventInput({ ...completed, amountMinor: "9007199254740992" })).toMatchObject({
      ok: false,
      error: { code: "UNSAFE_DB_INTEGER" },
    });
    expect(toFinalizeStripeEventInput({ ...completed, eventId: "evt bad" })).toMatchObject({
      ok: false,
      error: { fieldPath: "input.eventId" },
    });
    expect(toFinalizeStripeEventInput({ ...completed, payloadHash: "A".repeat(64) })).toMatchObject({
      ok: false,
      error: { fieldPath: "input.payloadHash" },
    });
  });

  it("validates each Stripe provider prefix and body-length boundary independently", () => {
    expect(toFinalizeStripeEventInput({ ...completed, eventId: "cs_localens_001" })).toMatchObject({
      ok: false,
      error: { fieldPath: "input.eventId" },
    });
    expect(toFinalizeStripeEventInput({ ...completed, sessionId: "evt_localens_001" })).toMatchObject({
      ok: false,
      error: { fieldPath: "input.sessionId" },
    });
    expect(toFinalizeStripeEventInput({ ...completed, accountId: "we_localens_test" })).toMatchObject({
      ok: false,
      error: { fieldPath: "input.accountId" },
    });
    expect(toFinalizeStripeEventInput({ ...completed, endpointId: "acct_localens_test" })).toMatchObject({
      ok: false,
      error: { fieldPath: "input.endpointId" },
    });
    expect(toFinalizeStripeEventInput({ ...completed, eventId: `evt_${"a".repeat(5)}` })).toMatchObject({
      ok: false,
      error: { fieldPath: "input.eventId" },
    });
    expect(toFinalizeStripeEventInput({ ...completed, eventId: `evt_${"a".repeat(6)}` })).toMatchObject({ ok: true });
    expect(toFinalizeStripeEventInput({ ...completed, eventId: `evt_${"a".repeat(255)}` })).toMatchObject({ ok: true });
    expect(toFinalizeStripeEventInput({ ...completed, eventId: `evt_${"a".repeat(256)}` })).toMatchObject({
      ok: false,
      error: { fieldPath: "input.eventId" },
    });
    expect(toFinalizeStripeEventInput({ ...completed, paymentIntentId: "cs_localens_001" })).toMatchObject({
      ok: false,
      error: { fieldPath: "input.paymentIntentId" },
    });
  });

  it("maps exactly the customer payment projection and rejects leaked columns", () => {
    const row = {
      booking_id: ids.booking,
      booking_status: "confirmed",
      payment_status: "paid",
      amount_minor: "2500000",
      currency: "vnd",
      updated_at: "2026-08-25T10:00:00+07:00",
    };
    expect(mapCustomerPaymentStatus(row)).toEqual({
      ok: true,
      value: {
        bookingId: ids.booking,
        bookingStatus: "confirmed",
        paymentStatus: "paid",
        amountMinor: "2500000",
        currency: "vnd",
        updatedAt: row.updated_at,
      },
    });
    expect(mapCustomerPaymentStatus({ ...row, provider_payment_intent_id: "pi_secret" })).toMatchObject({
      ok: false,
      error: { code: "UNKNOWN_FIELD" },
    });
    expect(mapCustomerPaymentStatus({ ...row, amount_minor: "0" })).toMatchObject({
      ok: false,
      error: { fieldPath: "row.amount_minor" },
    });
  });

  it("keeps the migration and pgTAP boundary explicit", () => {
    expect(migration).toContain("CREATE TABLE public.payments");
    expect(migration).toContain("CREATE TABLE private.webhook_events");
    expect(migration).toContain("private.finalize_stripe_event");
    expect(migration).toContain("livemode = false");
    expect(migration).toContain("stripe_test_account_id");
    expect(migration).toContain("stripe_test_endpoint_id");
    expect(migration).toContain("payments_checkout_owner_select");
    expect(migration).toContain("checkout RPC owner");
    expect(migration).toContain("membership_record");
    expect(migration).toMatch(/CREATE ROLE localens_payment_rpc_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS/);
    expect(migration).toMatch(/CREATE ROLE localens_payment_projection_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS/);
    expect(migration).toMatch(/CREATE ROLE localens_payment_guard_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS/);
    expect(migration).toMatch(/unsafe pre-existing LocalLens payment role attributes/);
    expect(migration).not.toMatch(/ALTER ROLE localens_/);
    expect(migration).toMatch(/member\.rolname = 'postgres'[\s\S]*memberships\.set_option[\s\S]*NOT memberships\.inherit_option/);
    for (const role of ["localens_payment_rpc_owner", "localens_payment_projection_owner", "localens_payment_guard_owner", "localens_webhook_executor"]) {
      expect(migration).toContain(`GRANT ${role} TO postgres WITH SET TRUE, INHERIT FALSE;`);
    }
    expect(migration).toMatch(/GRANT CREATE ON SCHEMA private TO localens_identity_rpc_owner, localens_checkout_rpc_owner, localens_payment_rpc_owner, localens_payment_guard_owner/);
    expect(migration).toMatch(/GRANT CREATE ON SCHEMA public TO localens_admin_rpc_owner, localens_payment_projection_owner/);
    expect(migration).toMatch(/SET LOCAL ROLE localens_checkout_rpc_owner;[\s\S]*CREATE OR REPLACE FUNCTION private\.assert_checkout_attempt_mutation[\s\S]*SET LOCAL ROLE postgres;/);
    expect(migration).toMatch(/SET LOCAL ROLE localens_checkout_rpc_owner;[\s\S]*CREATE OR REPLACE FUNCTION private\.record_checkout_session[\s\S]*SET LOCAL ROLE postgres;/);
    expect(migration).toMatch(/ALTER FUNCTION public\.reconcile_payment[\s\S]*OWNER TO localens_admin_rpc_owner;[\s\S]*REVOKE CREATE ON SCHEMA private FROM localens_identity_rpc_owner, localens_checkout_rpc_owner, localens_payment_rpc_owner, localens_payment_guard_owner;[\s\S]*REVOKE CREATE ON SCHEMA public FROM localens_admin_rpc_owner, localens_payment_projection_owner;[\s\S]*COMMIT/);
    expect(migration).toContain("hold_row.status");
    expect(migration).toContain("authority_time := pg_catalog.clock_timestamp()");
    expect(migration).not.toMatch(/\bcurrent_time\b/);
    expect(migration).not.toMatch(/raw_body|stripe_signature|authorization/i);
    expect(pgTap).toContain("webhook event idempotency");
    expect(pgTap).toContain("early webhook");
    expect(pgTap).toContain("payment_review");
    expect(pgTap).toContain("customer_payment_status_v");
  });
});
