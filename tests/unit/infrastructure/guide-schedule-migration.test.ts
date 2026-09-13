import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readFileSync("supabase/migrations/20260912120000_guide_schedule.sql", "utf8");
describe("guide schedule security migration", () => {
  it("keeps legacy RPC untouched and limits execute to authenticated", () => {
    expect(sql).not.toContain("DROP FUNCTION");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.get_guide_schedule(uuid) FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.get_guide_schedule(uuid) TO authenticated");
    expect(sql).toContain("OWNER TO localens_guide_projection_owner");
    expect(sql).toContain("SET search_path = ''");
  });
  it("requires a single guide role and scopes both list and detail to actor", () => {
    expect(sql).toContain("actor_role_count <> 1");
    expect(sql).toContain("roles.role = 'guide'::public.app_role");
    expect(sql).toContain("assignments.guide_user_id = actor_user_id");
    expect(sql).toContain("p_assignment_id IS NULL OR assignments.id = p_assignment_id");
  });
  it("projects official snapshot stops in order and excludes reassigned history", () => {
    expect(sql).toContain("tour_status text");
    expect(sql).toContain("itinerary jsonb");
    expect(sql).toContain("ORDER BY stops.position");
    expect(sql).toContain("translations.locale = guide_language");
    expect(sql).toContain("assignments.status IN ('assigned'::public.assignment_status, 'accepted'::public.assignment_status, 'completed'::public.assignment_status)");
    expect(sql).toContain("bookings.status::text = 'cancelled' OR departures.status::text = 'cancelled'");
    expect(sql).not.toMatch(/GRANT (?:SELECT|ALL).*TO authenticated/);
  });
});
