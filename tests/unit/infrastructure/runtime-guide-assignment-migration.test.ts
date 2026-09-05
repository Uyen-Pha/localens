import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260902130000_runtime_guide_assignment.sql",
);
const pgTapPath = join(
  process.cwd(),
  "supabase",
  "tests",
  "database",
  "runtime_guide_assignment_test.sql",
);

const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const pgTap = existsSync(pgTapPath) ? readFileSync(pgTapPath, "utf8") : "";
const guideRunnerPath = join(process.cwd(), "scripts", "run-runtime-guide-assignment-e2e.mjs");
const guideRunner = existsSync(guideRunnerPath) ? readFileSync(guideRunnerPath, "utf8") : "";
const guideConfigPath = join(process.cwd(), "playwright.runtime-guide-assignment.config.ts");
const guideSpecPath = join(process.cwd(), "tests", "e2e", "runtime-guide-assignment.spec.ts");

function functionBody(signature: string): string {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  if (start < 0) return "";
  const end = migration.indexOf("$function$;", start);
  return end < 0 ? migration.slice(start) : migration.slice(start, end + "$function$;".length);
}

describe("B2.4 runtime guide-assignment migration", () => {
  it("adds the forward-only migration and executable pgTAP contract", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(existsSync(pgTapPath)).toBe(true);
    expect(migration).toMatch(/^BEGIN;[\s\S]*COMMIT;\s*$/);
    expect(pgTap).toMatch(/SELECT plan\(\d+\);[\s\S]*SELECT \* FROM finish\(\);/);
  });

  it("registers an independently runnable B2.4 browser gate", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    expect(existsSync(guideRunnerPath)).toBe(true);
    expect(existsSync(guideConfigPath)).toBe(true);
    expect(existsSync(guideSpecPath)).toBe(true);
    expect(packageJson.scripts["test:e2e:runtime-guide-assignment"])
      .toBe("node scripts/run-runtime-guide-assignment-e2e.mjs");
  });

  it("routes the guide browser gate through the isolated random-port harness", () => {
    expect(guideRunner).toMatch(/import \{ runRuntimeItineraryE2E \} from "\.\/run-runtime-itinerary-e2e\.mjs";/);
    expect(guideRunner).not.toContain("runRuntimeFixedTourE2E");
  });

  it("exposes only the agreed public contract and retires browser guide lifecycle mutations", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.get_admin_guide_assignment_queue\(\)/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.get_admin_eligible_guides\(\)/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.assign_fixed_departure_guide\(\s*booking_id uuid,\s*guide_user_id uuid,\s*idempotency_key text\s*\)/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.get_guide_assigned_bookings\(\)/);
    expect(migration).toMatch(/REVOKE (?:ALL|EXECUTE) ON FUNCTION public\.assign_guide\(uuid, uuid\)[\s\S]*authenticated/);
    expect(migration).toMatch(/REVOKE (?:ALL|EXECUTE) ON FUNCTION public\.accept_guide_assignment\(uuid\)[\s\S]*authenticated/);
    expect(migration).toMatch(/REVOKE (?:ALL|EXECUTE) ON FUNCTION public\.complete_guide_assignment\(uuid\)[\s\S]*authenticated/);
  });

  it("requires exact admin authority and an exact pure-guide target under a scheduled departure lock", () => {
    const assign = functionBody("public.assign_fixed_departure_guide");
    expect(assign).toMatch(/count\(\*\)[\s\S]*private\.user_roles[\s\S]*actor_user_id[\s\S]*<> 1/);
    expect(assign).toMatch(/role = 'admin'::public\.app_role/);
    expect(assign).toMatch(/count\(\*\)[\s\S]*private\.user_roles[\s\S]*requested_guide_user_id[\s\S]*<> 1/);
    expect(assign).toMatch(/role = 'guide'::public\.app_role/);
    expect(assign).toMatch(/public\.guide_profiles/);
    expect(assign).toMatch(/FROM public\.bookings[\s\S]*FOR UPDATE/);
    expect(assign).toMatch(/FROM public\.departures[\s\S]*status <> 'scheduled'::public\.departure_status/);
    expect(assign).toMatch(/booking_row\.status <> 'confirmed'::public\.booking_status/);
    expect(assign).toMatch(/booking_row\.source_kind <> 'departure'/);
  });

  it("makes replay, payload conflict, same-guide no-op, and reassignment outcomes durable", () => {
    const assign = functionBody("public.assign_fixed_departure_guide");
    expect(migration).toMatch(/CREATE TABLE private\.guide_assignment_idempotency/);
    expect(migration).toMatch(/PRIMARY KEY \(actor_user_id, idempotency_key\)/);
    expect(assign).toMatch(/pg_advisory_xact_lock[\s\S]*hashtextextended/);
    expect(assign).toMatch(/guide_assignment_idempotency_conflict/);
    expect(assign).toMatch(/'replayed'/);
    expect(assign).toMatch(/current_assignment\.guide_user_id IS NOT DISTINCT FROM requested_guide_user_id[\s\S]*'unchanged'/);
    expect(assign).toMatch(/'assigned'[\s\S]*'reassigned'/);
    expect(assign).toMatch(/INSERT INTO private\.guide_assignment_idempotency/);
    expect(assign.indexOf("FROM private.guide_assignment_idempotency AS ledger"))
      .toBeLessThan(assign.indexOf("SELECT count(*) INTO target_role_count"));
  });

  it("serializes each guide schedule and rejects overlapping active assignments", () => {
    const assign = functionBody("public.assign_fixed_departure_guide");
    expect(assign).toMatch(/pg_advisory_xact_lock[\s\S]*localens:guide-schedule:/);
    expect(assign).toMatch(/tstzrange\([\s\S]*&&[\s\S]*tstzrange\(/);
    expect(assign).toMatch(/assignments\.status IN \('assigned'::public\.assignment_status, 'accepted'::public\.assignment_status\)/);
    expect(assign).toMatch(/assignments\.booking_id <> requested_booking_id/);
  });

  it("returns sanitized exact-role admin and guide projections with assignment identity", () => {
    const queue = functionBody("public.get_admin_guide_assignment_queue");
    const guides = functionBody("public.get_admin_eligible_guides");
    const guideAssignments = functionBody("public.get_guide_assigned_bookings");

    for (const adminProjection of [queue, guides]) {
      expect(adminProjection).toMatch(/count\(\*\)[\s\S]*private\.user_roles[\s\S]*<> 1/);
      expect(adminProjection).toMatch(/role = 'admin'::public\.app_role/);
    }
    expect(queue).toMatch(/booking_id uuid[\s\S]*assignment_id uuid[\s\S]*guide_user_id uuid/);
    expect(guides).toMatch(/guide_user_id uuid[\s\S]*display_name text[\s\S]*language public\.locale/);
    expect(guideAssignments).toMatch(/assignment_id uuid[\s\S]*booking_id uuid/);
    expect(guideAssignments).toMatch(/role = 'guide'::public\.app_role/);
    expect(guideAssignments).toMatch(/count\(\*\)[\s\S]*private\.user_roles[\s\S]*<> 1/);
    expect(guideAssignments).not.toMatch(/owner_user_id|email|phone|payment|provider|decision_note|reason/);
  });

  it("keeps browser roles away from assignment base state and uses non-login bounded owners", () => {
    expect(migration).toMatch(/CREATE ROLE localens_guide_admin_projection_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS/);
    expect(migration).not.toMatch(/ALTER ROLE localens_/);
    expect(migration).toMatch(/REVOKE ALL ON private\.guide_assignment_idempotency FROM PUBLIC, anon, authenticated/);
    expect(migration).toMatch(/REVOKE ALL ON public\.guide_assignments FROM PUBLIC, anon, authenticated/);
    expect(migration).toMatch(/REVOKE SELECT ON TABLE public\.guide_profiles FROM authenticated/);
    expect(migration).toMatch(/SET search_path = ''/);
    expect(migration).toMatch(/SET statement_timeout = '5s'/);
    expect(migration).toMatch(/REVOKE CREATE ON SCHEMA public FROM localens_guide_admin_projection_owner/);
  });
});
