import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260928100000_booking_cancellation_rules.sql"),
  "utf8",
);

describe("customer booking cancellation rules migration", () => {
  it.each([
    "normalize_booking_payment_deadline",
    "normalize_capacity_hold_deadline",
  ])("creates and replays %s as its owner with scoped privileges", (name) => {
    const sql = migration.replace(/--[^\r\n]*/g, "").replace(/\s+/g, " ");
    expect(sql).toContain(
      `GRANT CREATE ON SCHEMA private TO localens_checkout_rpc_owner; SET LOCAL ROLE localens_checkout_rpc_owner; CREATE OR REPLACE FUNCTION private.${name}()`,
    );
    const schemaChanges = [...sql.matchAll(
      /\b(GRANT|REVOKE) CREATE ON SCHEMA private (?:TO|FROM) localens_checkout_rpc_owner;/g,
    )].map((match) => match[1]);
    expect(schemaChanges).toEqual(["GRANT", "REVOKE", "GRANT", "REVOKE", "GRANT", "REVOKE"]);
    expect(sql).toContain(
      `REVOKE ALL ON FUNCTION private.${name}() FROM PUBLIC, anon, authenticated, service_role; GRANT EXECUTE ON FUNCTION private.${name}() TO postgres; SET LOCAL ROLE postgres; REVOKE CREATE ON SCHEMA private FROM localens_checkout_rpc_owner;`,
    );
    const start = sql.indexOf(`CREATE OR REPLACE FUNCTION private.${name}()`);
    const end = sql.indexOf("SET LOCAL ROLE postgres;", start);
    expect(sql.slice(start, end)).toContain(`GRANT EXECUTE ON FUNCTION private.${name}() TO postgres;`);
    expect(sql).toContain(
      `FOR EACH ROW EXECUTE FUNCTION private.${name}(); SET LOCAL ROLE localens_checkout_rpc_owner; REVOKE EXECUTE ON FUNCTION private.${name}() FROM postgres; SET LOCAL ROLE postgres;`,
    );
  });

  it.each([
    ["FUNCTION private.start_checkout_tx", "private", "localens_checkout_rpc_owner"],
    ["VIEW public.customer_bookings_v", "public", "localens_booking_projection_owner"],
    ["FUNCTION public.cancel_booking", "public", "localens_cancellation_customer_rpc_owner"],
  ])("replaces %s and sets its ACL as its actual owner", (object, schema, owner) => {
    const sql = migration.replace(/--[^\r\n]*/g, "").replace(/\s+/g, " ");
    const start = sql.indexOf(`CREATE OR REPLACE ${object}`);
    expect(start).toBeGreaterThan(-1);
    expect(sql.slice(0, start).endsWith(
      `GRANT CREATE ON SCHEMA ${schema} TO ${owner}; SET LOCAL ROLE ${owner}; `,
    )).toBe(true);
    const end = sql.indexOf("SET LOCAL ROLE postgres;", start);
    expect(end).toBeGreaterThan(start);
    const ownedBlock = sql.slice(start, end);
    expect(ownedBlock).toContain("REVOKE ALL ON");
    if (schema === "private") {
      expect(ownedBlock).toContain(`TO ${owner};`);
    } else {
      expect(ownedBlock).toContain("TO authenticated;");
    }
    expect(sql.slice(end).startsWith(
      `SET LOCAL ROLE postgres; REVOKE CREATE ON SCHEMA ${schema} FROM ${owner};`,
    )).toBe(true);
  });

  it("does not backfill existing booking or capacity snapshots", () => {
    const ddl = migration.split("CREATE OR REPLACE FUNCTION")[0];
    expect(ddl).not.toMatch(/^UPDATE\s/im);
    expect(ddl).toMatch(/pg_catalog\.pg_constraint/);
    expect(ddl).toMatch(/pg_catalog\.pg_get_constraintdef/);
  });

  it("keeps the original view columns before appending cancellation facts", () => {
    const view = migration.split("CREATE OR REPLACE VIEW public.customer_bookings_v")[1].split("FROM public.bookings AS bookings")[0];
    expect(view.indexOf("bookings.created_at")).toBeLessThan(view.indexOf("AS payment_status"));
    expect(view.indexOf("bookings.hold_expires_at")).toBeLessThan(view.indexOf("bookings.created_at"));
    expect(migration).toMatch(/GRANT SELECT \(departure_id\) ON public.bookings TO localens_booking_projection_owner/);
    expect(migration).toMatch(/GRANT SELECT \(id, request_id, valid_until\) ON public.custom_quotes/);
  });

  it("can recreate its own constraints and policies without duplicate-object failures", () => {
    for (const [, name] of migration.matchAll(/ADD CONSTRAINT (\w+)/g)) {
      expect(migration).toContain(`DROP CONSTRAINT IF EXISTS ${name}`);
    }
    for (const [, name, table] of migration.matchAll(/CREATE POLICY (\w+)\s+ON ([\w.]+)/g)) {
      expect(migration).toContain(`DROP POLICY IF EXISTS ${name} ON ${table};`);
    }
  });

  it("preserves reserved QA checkout and cancellation identities and rejects wrong tuples", () => {
    expect(migration).toContain("p_party_size > qa_slot.max_party_size");
    expect(migration).toContain("new_hold_id := qa_slot.capacity_hold_id");
    expect(migration).toContain("qa_slot.terminal_flow IS DISTINCT FROM 'cancellation'");
    expect(migration).toContain("qa_slot.cancellation_idempotency_key IS DISTINCT FROM requested_idempotency_key");
    expect(migration).toContain("new_cancellation_id := qa_slot.cancellation_id");
    expect(migration.match(/THESIS_DEMO_QA_SLOT_MISMATCH/g)).toHaveLength(2);
  });

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
    expect(migration).toContain("departure_row.start_at < authority_time + interval '48 hours'");
    expect(migration).toContain("trip_start_at < authority_time + interval '48 hours'");
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
