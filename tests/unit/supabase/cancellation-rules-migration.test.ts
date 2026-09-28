import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260928100000_booking_cancellation_rules.sql"),
  "utf8",
);

describe("customer booking cancellation rules migration", () => {
  it("uses a 15-minute fixed-tour hold and preserves quote-derived deadlines", () => {
    expect(migration).toMatch(/900/);
    expect(migration).toMatch(/interval\s+'15 minutes'/i);
    expect(migration).toMatch(/hold_end\s*:=\s*created_time\s*\+\s*interval\s+'15 minutes'/i);
    expect(migration).toMatch(/hold_expires_at\s*:=\s*booking_row\.hold_expires_at/i);
    expect(migration).toMatch(/source_kind\s*=\s*'quote'[\s\S]*valid_until/i);
    expect(migration).toMatch(/payment_deadline_at/i);
  });

  it("allows confirmed cancellation only with at least 48 hours before either trip start", () => {
    expect(migration).toMatch(/booking_row\.status\s*=\s*'confirmed'/i);
    expect(migration).toMatch(/interval\s+'48 hours'/i);
    expect(migration).toMatch(/payment_status_value\s+IS DISTINCT FROM\s+'paid'/i);
    expect(migration).toMatch(/simulated_payment_status_value\s+IS DISTINCT FROM\s+'paid'/i);
    expect(migration).toMatch(/departure_row\.start_at/i);
    expect(migration).toMatch(/trip_plan_items/i);
    expect(migration).toMatch(/MIN\s*\(.*start_at/i);
  });

  it("blocks payment processing, review, and successful payment authority for pending bookings", () => {
    expect(migration).toMatch(/payment_row\.status\s+IN\s*\([\s\S]*'pending'[\s\S]*'review'[\s\S]*'paid'/i);
    expect(migration).toMatch(/payment_status/i);
    expect(migration).toMatch(/trip_start_at/i);
  });

  it("projects cancellation timing and payment authority without restoring a manual decision flow", () => {
    expect(migration).toMatch(/CREATE OR REPLACE VIEW public\.customer_bookings_v/i);
    expect(migration).toMatch(/payment_deadline_at/i);
    expect(migration).toMatch(/trip_start_at/i);
    expect(migration).not.toMatch(/request_fixed_tour_cancellation|decide_fixed_tour_cancellation/i);
  });
});
