// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  CHECKOUT_CURRENCY_VALUES,
  CURRENCY_VALUES,
  DATA_CONTRACT_LITERALS,
  RANKING_SOURCE_VALUES,
  STRIPE_CHECKOUT_MODE,
  parseDbSafeInteger,
  toDbBigint,
  type AssignmentStatus,
  type BookingStatus,
  type ContentStatus,
  type DataAdapterError,
  type DataContractError,
  type DepartureStatus,
  type HoldStatus,
  type Locale,
  type PaymentStatus,
  type PlaceStatus,
  type QuoteStatus,
  type RequestStatus,
  type Role,
  type SnapshotStatus,
  type TourStatus,
  type TourVersionStatus,
  type WebhookEventStatus,
  type StripeCheckoutSessionInput,
} from "@/lib/domain/data/contracts";

describe("database data contracts", () => {
  it("exports the exact public and state literal unions", () => {
    const role: Role = "admin";
    const locale: Locale = "vi";
    const place: PlaceStatus = "published";
    const tour: TourStatus = "archived";
    const version: TourVersionStatus = "retired";
    const departure: DepartureStatus = "sold_out";
    const snapshot: SnapshotStatus = "building";
    const request: RequestStatus = "changes_requested";
    const quote: QuoteStatus = "checkout_pending";
    const hold: HoldStatus = "consumed";
    const booking: BookingStatus = "payment_review";
    const payment: PaymentStatus = "review";
    const webhook: WebhookEventStatus = "conflict";
    const assignment: AssignmentStatus = "completed";
    const content: ContentStatus = "publishing";

    expect({
      role,
      locale,
      place,
      tour,
      version,
      departure,
      snapshot,
      request,
      quote,
      hold,
      booking,
      payment,
      webhook,
      assignment,
      content,
    }).toEqual({
      role: "admin",
      locale: "vi",
      place: "published",
      tour: "archived",
      version: "retired",
      departure: "sold_out",
      snapshot: "building",
      request: "changes_requested",
      quote: "checkout_pending",
      hold: "consumed",
      booking: "payment_review",
      payment: "review",
      webhook: "conflict",
      assignment: "completed",
      content: "publishing",
    });

    // @ts-expect-error Roles are an exact allowlist.
    const invalidRole: Role = "owner";
    // @ts-expect-error Locales are an exact allowlist.
    const invalidLocale: Locale = "fr";
    expect(invalidRole).toBe("owner");
    expect(invalidLocale).toBe("fr");
  });

  it("exports every registered runtime literal without extras", () => {
    expect(DATA_CONTRACT_LITERALS.role).toEqual(["customer", "guide", "admin"]);
    expect(DATA_CONTRACT_LITERALS.locale).toEqual(["en", "vi"]);
    expect(DATA_CONTRACT_LITERALS.placeStatus).toEqual(["draft", "published", "archived"]);
    expect(DATA_CONTRACT_LITERALS.tourStatus).toEqual(["draft", "published", "archived"]);
    expect(DATA_CONTRACT_LITERALS.tourVersionStatus).toEqual(["draft", "published", "retired"]);
    expect(DATA_CONTRACT_LITERALS.departureStatus).toEqual(["scheduled", "sold_out", "cancelled", "completed"]);
    expect(DATA_CONTRACT_LITERALS.snapshotStatus).toEqual(["building", "published", "retired"]);
    expect(DATA_CONTRACT_LITERALS.requestStatus).toEqual(["draft", "pending_review", "changes_requested", "approved", "rejected"]);
    expect(DATA_CONTRACT_LITERALS.quoteStatus).toEqual(["active", "checkout_pending", "accepted", "expired", "revoked"]);
    expect(DATA_CONTRACT_LITERALS.holdStatus).toEqual(["active", "consumed", "released", "expired"]);
    expect(DATA_CONTRACT_LITERALS.bookingStatus).toEqual(["pending_payment", "payment_processing", "confirmed", "payment_failed", "payment_review", "expired", "cancelled", "completed"]);
    expect(DATA_CONTRACT_LITERALS.paymentStatus).toEqual(["pending", "paid", "failed", "review"]);
    expect(DATA_CONTRACT_LITERALS.webhookEventStatus).toEqual(["received", "processed", "ignored", "failed", "conflict"]);
    expect(DATA_CONTRACT_LITERALS.assignmentStatus).toEqual(["assigned", "accepted", "completed", "closed"]);
    expect(DATA_CONTRACT_LITERALS.contentStatus).toEqual(["draft", "publishing", "published", "failed"]);
    expect(DATA_CONTRACT_LITERALS.rankingSource).toEqual(["ai", "deterministic"]);
    expect(DATA_CONTRACT_LITERALS.currency).toEqual(["VND", "USD"]);
    expect(DATA_CONTRACT_LITERALS.checkoutCurrency).toEqual(["vnd", "usd"]);
    expect(DATA_CONTRACT_LITERALS.auditEventType).toEqual([
      "role_provisioned", "role_revoked", "plan_claimed", "request_submitted",
      "request_changes_requested", "request_approved", "request_rejected", "quote_created",
      "quote_checkout_started", "quote_accepted", "quote_reactivated", "quote_expired", "quote_revoked",
      "checkout_started", "checkout_session_recorded", "checkout_compensated", "booking_status_changed",
      "webhook_processed", "webhook_ignored", "webhook_failed", "webhook_conflict", "payment_reconciled",
      "guide_assigned", "guide_reassigned", "guide_accepted", "guide_completed", "content_publish_started",
      "content_published", "content_publish_failed",
    ]);
    expect(CURRENCY_VALUES).toEqual(["VND", "USD"]);
    expect(CHECKOUT_CURRENCY_VALUES).toEqual(["vnd", "usd"]);
    expect(RANKING_SOURCE_VALUES).toEqual(["ai", "deterministic"]);
    expect(STRIPE_CHECKOUT_MODE).toBe("payment");
  });

  it("exports the exact card-only Stripe checkout session shape", () => {
    const session: StripeCheckoutSessionInput = {
      mode: "payment",
      payment_method_types: ["card"],
      expires_at: 1_000,
      client_reference_id: "booking-1",
      metadata: { booking_id: "booking-1", attempt_id: "attempt-1" },
      line_items: [{
        price_data: {
          currency: "vnd",
          unit_amount: 1_000,
          product_data: { name: "LocalLens" },
        },
        quantity: 1,
      }],
      success_url: "https://example.test/success",
      cancel_url: "https://example.test/cancel",
    };
    expect(session.payment_method_types).toEqual(["card"]);
    expect(session.mode).toBe("payment");
  });

  it("parses canonical nonnegative safe integers from all supported inputs", () => {
    expect(parseDbSafeInteger("0")).toEqual({ ok: true, value: 0 });
    expect(parseDbSafeInteger(String(Number.MAX_SAFE_INTEGER))).toEqual({
      ok: true,
      value: Number.MAX_SAFE_INTEGER,
    });
    expect(parseDbSafeInteger(42)).toEqual({ ok: true, value: 42 });
    expect(parseDbSafeInteger(BigInt(42))).toEqual({ ok: true, value: 42 });
    expect(toDbBigint("42")).toEqual({ ok: true, value: "42" });
    expect(toDbBigint(42)).toEqual({ ok: true, value: "42" });
    expect(toDbBigint(BigInt(42))).toEqual({ ok: true, value: "42" });
  });

  it("rejects malformed database integers without leaking the rejected value", () => {
    const invalid = ["", "01", "+1", "-1", "1.0", "1e2", " 1", 1.5, -1, NaN, Infinity, null, undefined, {}, []];

    for (const value of invalid) {
      const parsed = parseDbSafeInteger(value);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.error.code).toBe("INVALID_DB_INTEGER");
        expect(parsed.error).not.toHaveProperty("value");
        expect(parsed.error).not.toHaveProperty("rejectedValue");
      }
      const encoded = toDbBigint(value);
      expect(encoded.ok).toBe(false);
    }
  });

  it("rejects unsafe values with the dedicated unsafe error", () => {
    for (const value of [Number.MAX_SAFE_INTEGER + 1, BigInt("9007199254740992"), "9007199254740992"]) {
      expect(parseDbSafeInteger(value)).toEqual({
        ok: false,
        error: { code: "UNSAFE_DB_INTEGER", messageKey: "data.integer.unsafe" },
      });
      expect(toDbBigint(value)).toEqual({
        ok: false,
        error: { code: "UNSAFE_DB_INTEGER", messageKey: "data.integer.unsafe" },
      });
    }
  });

  it("bounds canonical decimal strings before attempting bigint conversion", () => {
    const giant = "9".repeat(1_000_000);
    expect(parseDbSafeInteger(giant)).toEqual({
      ok: false,
      error: { code: "UNSAFE_DB_INTEGER", messageKey: "data.integer.unsafe" },
    });
    expect(toDbBigint(giant)).toEqual({
      ok: false,
      error: { code: "UNSAFE_DB_INTEGER", messageKey: "data.integer.unsafe" },
    });
  });

  it("keeps the public adapter error shapes exact and value-free", () => {
    const contractError: DataContractError = {
      code: "INVALID_DB_INTEGER",
      messageKey: "data.integer.invalid",
    };
    const adapterError: DataAdapterError = {
      code: "INVALID_SHAPE",
      messageKey: "data.adapter.invalid_shape",
      fieldPath: "rows[0]",
    };

    expect(contractError).toEqual({
      code: "INVALID_DB_INTEGER",
      messageKey: "data.integer.invalid",
    });
    expect(adapterError).toEqual({
      code: "INVALID_SHAPE",
      messageKey: "data.adapter.invalid_shape",
      fieldPath: "rows[0]",
    });
  });
});
