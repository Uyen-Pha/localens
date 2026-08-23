// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
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
