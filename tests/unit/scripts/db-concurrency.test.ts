import { describe, expect, it } from "vitest";

// @ts-expect-error Executable JavaScript concurrency boundaries are covered by focused tests.
import { CONCURRENCY_SCENARIO_IDS, REQUIRED_CONCURRENCY_SCENARIOS, runConcurrencyGate } from "@/scripts/test-db-concurrency.mjs";

describe("B2.4 guide-assignment concurrency registration", () => {
  it("runs the guide-assignment race with two independent local sessions", async () => {
    expect(REQUIRED_CONCURRENCY_SCENARIOS).toContain("guide assignment duplicate, same-booking, and schedule serialization");
    expect(CONCURRENCY_SCENARIO_IDS).toContain("guide_assignment_serialization");

    const sessions: Array<{ id: number; connect: () => Promise<void>; end: () => Promise<void> }> = [];
    const calls: string[] = [];
    const sessionFactory = () => {
      const session = {
        id: sessions.length + 1,
        connect: async () => undefined,
        end: async () => undefined,
      };
      sessions.push(session);
      return session;
    };
    const scenarios = Object.fromEntries(CONCURRENCY_SCENARIO_IDS.map((scenario: string) => [
      scenario,
      async ({ sessions: activeSessions }: { sessions: Array<{ id: number }> }) => {
        expect(new Set(activeSessions.map((session) => session.id)).size).toBe(2);
        calls.push(scenario);
      },
    ]));

    await runConcurrencyGate({
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      sessionFactory,
      scenarios,
    });

    expect(calls).toContain("guide_assignment_serialization");
  });
});
