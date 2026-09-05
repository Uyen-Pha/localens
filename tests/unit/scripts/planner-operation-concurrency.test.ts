import { describe, expect, it } from "vitest";

// @ts-expect-error Task 14.2A executable JavaScript is covered by focused unit tests.
import { DEFAULT_PLANNER_OPERATION_SCENARIOS, PLANNER_OPERATION_CONCURRENCY_ENV, PLANNER_OPERATION_DB_PORT_ENV, PLANNER_OPERATION_DB_URL_ENV, PLANNER_OPERATION_SCENARIO_IDS, REQUIRED_PLANNER_OPERATION_SCENARIOS, assertClaimRaceInvariant, assertCompletionFirstInvariant, assertExpiryFirstInvariant, runPlannerOperationConcurrencyCheck, runPlannerOperationConcurrencyGate, validateIsolatedRuntimeDatabaseUrl } from "@/scripts/test-planner-operation-concurrency.mjs";

const ISOLATED_URL = "postgresql://planner:secret@127.0.0.1:55432/postgres";
const ISOLATED_PORT = "55432";

function fakeSession(id: number) {
  return {
    id,
    connect: async () => undefined,
    end: async () => undefined,
  };
}

describe("Task 14.2A planner-operation concurrency harness", () => {
  it("registers exactly the three required multi-session scenarios", () => {
    expect(PLANNER_OPERATION_SCENARIO_IDS).toEqual([
      "same_owner_same_key_claim_race",
      "completion_wins_expiry_reconciliation",
      "expiry_wins_old_worker_completion",
    ]);
    expect(Object.keys(DEFAULT_PLANNER_OPERATION_SCENARIOS)).toEqual(PLANNER_OPERATION_SCENARIO_IDS);
    for (const scenario of REQUIRED_PLANNER_OPERATION_SCENARIOS) expect(scenario.length).toBeGreaterThan(0);
  });

  it("requires a loopback URL and an explicit non-presentation expected port", () => {
    expect(validateIsolatedRuntimeDatabaseUrl(ISOLATED_URL, ISOLATED_PORT).port).toBe(ISOLATED_PORT);
    expect(() => validateIsolatedRuntimeDatabaseUrl(ISOLATED_URL, undefined)).toThrow(/explicit expected port/i);
    expect(() => validateIsolatedRuntimeDatabaseUrl(
      "postgresql://planner:secret@127.0.0.1:54322/postgres",
      "54322",
    )).toThrow(/PRESENTATION_PORT_REJECTED/);
    expect(() => validateIsolatedRuntimeDatabaseUrl(
      "postgresql://planner:secret@127.0.0.1:54321/postgres",
      "54321",
    )).toThrow(/PRESENTATION_PORT_REJECTED/);
    expect(() => validateIsolatedRuntimeDatabaseUrl(
      "postgresql://planner:secret@planner-db.example.invalid:55432/postgres",
      ISOLATED_PORT,
    )).toThrow(/loopback/i);
    expect(() => validateIsolatedRuntimeDatabaseUrl(
      `${ISOLATED_URL}?host=planner-db.example.invalid`,
      ISOLATED_PORT,
    )).toThrow(/override|parameter/i);
    expect(() => validateIsolatedRuntimeDatabaseUrl(
      `${ISOLATED_URL}?port=54322`,
      ISOLATED_PORT,
    )).toThrow(/override|parameter/i);
    expect(() => validateIsolatedRuntimeDatabaseUrl(
      `${ISOLATED_URL}?port=54321`,
      ISOLATED_PORT,
    )).toThrow(/override|parameter/i);
    expect(() => validateIsolatedRuntimeDatabaseUrl(ISOLATED_URL, "55431")).toThrow(/port/i);
  });

  it("fails closed before creating sessions when isolated configuration is absent or unsafe", async () => {
    const sessionFactory = () => {
      throw new Error("session factory must not be reached");
    };

    await expect(runPlannerOperationConcurrencyCheck({
      env: {},
      sessionFactory,
    })).resolves.toMatchObject({ ok: false, code: "NOT_CONFIGURED" });

    const rejected = await runPlannerOperationConcurrencyCheck({
      env: {
        [PLANNER_OPERATION_DB_URL_ENV]: "postgresql://planner:super-secret@127.0.0.1:54322/postgres",
        [PLANNER_OPERATION_DB_PORT_ENV]: "54322",
        [PLANNER_OPERATION_CONCURRENCY_ENV]: "1",
      },
      sessionFactory,
    });
    expect(rejected).toMatchObject({ ok: false, code: "PRESENTATION_PORT_REJECTED" });
    expect(rejected.message).not.toContain("super-secret");
    expect(rejected.message).not.toContain("postgresql://");
  });

  it("orchestrates every registered scenario with two independent injected sessions", async () => {
    const sessions: Array<ReturnType<typeof fakeSession>> = [];
    const seen: Array<{ scenario: string; ids: number[] }> = [];
    const scenarios = Object.fromEntries(
      PLANNER_OPERATION_SCENARIO_IDS.map((scenario: string) => [scenario, async ({
        sessions: activeSessions,
      }: { sessions: Array<ReturnType<typeof fakeSession>> }) => {
        seen.push({ scenario, ids: activeSessions.map((session) => session.id) });
      }]),
    );

    await expect(runPlannerOperationConcurrencyGate({
      databaseUrl: ISOLATED_URL,
      expectedPort: ISOLATED_PORT,
      sessionFactory: () => {
        const session = fakeSession(sessions.length + 1);
        sessions.push(session);
        return session;
      },
      scenarios,
    })).resolves.toEqual({ ok: true, scenarios: PLANNER_OPERATION_SCENARIO_IDS });

    expect(sessions).toHaveLength(2);
    expect(sessions[0]).not.toBe(sessions[1]);
    expect(seen).toEqual(PLANNER_OPERATION_SCENARIO_IDS.map((scenario: string) => ({ scenario, ids: [1, 2] })));
  });

  it("keeps the claim race invariant strict while accepting in-progress or completed replay", () => {
    expect(() => assertClaimRaceInvariant({
      first: { state: "claimed", planId: "plan-1", plannerReservationId: "planner-1", geminiReservationId: "gemini-1" },
      second: { state: "in_progress" },
      operationRow: { count: 1, state: "claimed", planId: "plan-1", plannerReservationId: "planner-1", geminiReservationId: "gemini-1" },
      planCount: 0,
      revisionCount: 0,
    })).not.toThrow();

    expect(() => assertClaimRaceInvariant({
      first: { state: "claimed", planId: "plan-1", plannerReservationId: "planner-1", geminiReservationId: "gemini-1" },
      second: { state: "completed", planId: "plan-1", revision: 1 },
      operationRow: { count: 1, state: "completed", resultPlanId: "plan-1", resultRevision: 1, planId: "plan-1", plannerReservationId: "planner-1", geminiReservationId: "gemini-1" },
      planCount: 1,
      revisionCount: 1,
    })).not.toThrow();

    expect(() => assertClaimRaceInvariant({
      first: { state: "claimed", planId: "plan-1", plannerReservationId: "planner-1", geminiReservationId: "gemini-1" },
      second: { state: "completed", planId: "plan-2", revision: 1 },
      operationRow: { count: 1, planId: "plan-1", plannerReservationId: "planner-1", geminiReservationId: "gemini-1" },
      planCount: 2,
      revisionCount: 2,
    })).toThrow(/CONCURRENCY_INVARIANT_FAILED/);
  });

  it("keeps completion-first and expiry-first outcomes mutually exclusive", () => {
    expect(() => assertCompletionFirstInvariant({
      completion: { state: "completed", planId: "plan-1", revision: 1 },
      replay: { state: "completed", planId: "plan-1", revision: 1 },
      operationRow: { count: 1, state: "completed", resultPlanId: "plan-1", resultRevision: 1 },
      planCount: 1,
      revisionCount: 1,
      recommendationRunCount: 1,
    })).not.toThrow();

    expect(() => assertExpiryFirstInvariant({
      reconcile: { state: "interrupted" },
      oldCompletion: { state: "interrupted" },
      operationRow: { count: 1, state: "interrupted", resultPlanId: null, resultRevision: null },
      planCount: 0,
      revisionCount: 0,
      recommendationRunCount: 0,
    })).not.toThrow();

    expect(() => assertExpiryFirstInvariant({
      reconcile: { state: "interrupted" },
      oldCompletion: { state: "completed", planId: "plan-1", revision: 1 },
      operationRow: { count: 1, state: "completed", resultPlanId: "plan-1", resultRevision: 1 },
      planCount: 1,
      revisionCount: 1,
      recommendationRunCount: 1,
    })).toThrow(/CONCURRENCY_INVARIANT_FAILED/);
  });
});
