import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260928120000_guide_assignment_recovery.sql",
);
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

function functionBody(signature: string): string {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  if (start < 0) return "";
  const end = migration.indexOf("$function$;", start);
  return end < 0 ? migration.slice(start) : migration.slice(start, end + "$function$;".length);
}

describe("guide assignment recovery migration", () => {
  it("is a forward-only migration with the shared booking-window helper", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(migration).toMatch(/^BEGIN;[\s\S]*COMMIT;\s*$/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION private\.guide_booking_window\(p_booking_id uuid\)/);
    expect(migration).toMatch(/source_kind = 'quote'/);
    expect(migration).toMatch(/quotes\.status IN \([\s\S]*'accepted'::public\.quote_status[\s\S]*'revoked'::public\.quote_status/);
    expect(migration).toMatch(/requests\.status = 'approved'::public\.request_status/);
    expect(migration).toMatch(/min\(items\.start_at\)[\s\S]*max\(items\.end_at\)/);
  });

  it("keeps the public assignment contract while accepting fixed sold-out and personalized bookings", () => {
    const assign = functionBody("public.assign_fixed_departure_guide");
    expect(assign).toMatch(/booking_row\.status <> 'confirmed'::public\.booking_status/);
    expect(assign).toMatch(/booking_row\.source_kind = 'quote'/);
    expect(assign).toMatch(/departure_row\.status NOT IN \('scheduled'::public\.departure_status, 'sold_out'::public\.departure_status\)/);
    expect(assign).toMatch(/private\.assign_guide_runtime/);
    expect(assign).toMatch(/guide_assignment_idempotency_conflict/);
    expect(assign).toMatch(/'reassigned'/);
  });

  it("uses the same source-aware window for overlap protection and preserves history", () => {
    const assign = functionBody("private.assign_guide_runtime");
    expect(assign).toMatch(/guide_booking_window\(p_booking_id\)/);
    expect(assign).toMatch(/assignments\.status IN \('assigned'::public\.assignment_status, 'accepted'::public\.assignment_status\)/);
    expect(assign).toMatch(/booking_status NOT IN|bookings\.status NOT IN/);
    expect(assign).toMatch(/SET status = 'closed'::public\.assignment_status/);
    expect(assign).toMatch(/INSERT INTO public\.guide_assignments/);
  });

  it("projects both sources in admin queue and guide schedule, including cancelled history", () => {
    const queue = functionBody("public.get_admin_guide_assignment_queue");
    const schedule = functionBody("public.get_guide_schedule");
    expect(queue).toMatch(/source_kind = 'departure'[\s\S]*source_kind = 'quote'/);
    expect(queue).toMatch(/'scheduled'::public\.departure_status, 'sold_out'::public\.departure_status/);
    expect(schedule).toMatch(/LEFT JOIN public\.departures/);
    expect(schedule).toMatch(/bookings\.status::text = 'cancelled'/);
    expect(schedule).toMatch(/source_kind = 'quote'/);
    expect(schedule).toMatch(/false\s*$/m);
    expect(schedule).toMatch(/assignments\.guide_user_id = actor_user_id/);
  });

  it("grants only the bounded definer roles access to personalized schedule source facts", () => {
    expect(migration).toMatch(/custom_quotes_guide_recovery_projection_select/);
    expect(migration).toMatch(/custom_requests_guide_recovery_projection_select/);
    expect(migration).toMatch(/trip_plan_items_guide_recovery_projection_select/);
    expect(migration).toMatch(/GRANT SELECT \(revision_id, catalog_snapshot_id, place_id, position, start_at, end_at\)[\s\S]*localens_guide_projection_owner/);
    expect(migration).not.toMatch(/GRANT SELECT ON TABLE public\.(?:custom_quotes|custom_requests|trip_plan_items) TO authenticated/);
  });
});
