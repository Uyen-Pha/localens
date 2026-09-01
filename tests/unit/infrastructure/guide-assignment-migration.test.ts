import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260823104000_guide_assignments.sql"),
  "utf8",
);

describe("guide assignment migration ownership", () => {
  it("hardens owner roles and balances PostgreSQL 17 ownership privileges", () => {
    for (const role of [
      "localens_guide_assignment_rpc_owner",
      "localens_guide_projection_owner",
      "localens_guide_assignment_guard_owner",
    ]) {
      expect(migration).toContain(`CREATE ROLE ${role} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS`);
      expect(migration).toContain(`GRANT ${role} TO postgres WITH SET TRUE, INHERIT FALSE;`);
    }
    expect(migration).toContain("unsafe pre-existing LocalLens guide assignment role attributes");
    expect(migration).not.toMatch(/ALTER ROLE localens_/);
    expect(migration).toMatch(/member\.rolname = 'postgres'[\s\S]*memberships\.set_option[\s\S]*NOT memberships\.inherit_option/);
    expect(migration).toContain("GRANT CREATE ON SCHEMA private TO localens_guide_assignment_rpc_owner, localens_guide_assignment_guard_owner;");
    expect(migration).toContain("GRANT CREATE ON SCHEMA public TO localens_guide_assignment_rpc_owner, localens_guide_projection_owner;");
    expect(migration).toMatch(/ALTER FUNCTION public\.get_guide_assigned_bookings[\s\S]*OWNER TO localens_guide_projection_owner;[\s\S]*REVOKE CREATE ON SCHEMA private FROM localens_guide_assignment_rpc_owner, localens_guide_assignment_guard_owner;[\s\S]*REVOKE CREATE ON SCHEMA public FROM localens_guide_assignment_rpc_owner, localens_guide_projection_owner;[\s\S]*COMMIT/);
  });
});
