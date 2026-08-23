// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  STATE_MACHINE_NAME_VALUES,
  STATE_MACHINE_TRANSITIONS,
  canTransition,
  type StateMachineName,
} from "@/lib/domain/data/state-machine";

describe("database state machines", () => {
  const cases: Array<[StateMachineName, string, string]> = [
    ["request", "draft", "pending_review"],
    ["request", "pending_review", "changes_requested"],
    ["request", "pending_review", "approved"],
    ["request", "pending_review", "rejected"],
    ["request", "changes_requested", "pending_review"],
    ["quote", "active", "checkout_pending"],
    ["quote", "checkout_pending", "accepted"],
    ["quote", "checkout_pending", "active"],
    ["quote", "active", "expired"],
    ["quote", "active", "revoked"],
    ["hold", "active", "consumed"],
    ["hold", "active", "released"],
    ["hold", "active", "expired"],
    ["booking", "pending_payment", "payment_processing"],
    ["booking", "pending_payment", "expired"],
    ["booking", "pending_payment", "cancelled"],
    ["booking", "payment_processing", "confirmed"],
    ["booking", "payment_processing", "payment_failed"],
    ["booking", "payment_processing", "expired"],
    ["booking", "payment_processing", "payment_review"],
    ["booking", "payment_processing", "cancelled"],
    ["booking", "confirmed", "completed"],
    ["booking", "confirmed", "cancelled"],
    ["booking", "payment_review", "confirmed"],
    ["booking", "payment_review", "cancelled"],
    ["payment", "pending", "paid"],
    ["payment", "pending", "failed"],
    ["payment", "pending", "review"],
    ["payment", "review", "paid"],
    ["payment", "review", "failed"],
    ["webhook_event", "received", "processed"],
    ["webhook_event", "received", "ignored"],
    ["webhook_event", "received", "failed"],
    ["webhook_event", "received", "conflict"],
    ["assignment", "assigned", "accepted"],
    ["assignment", "assigned", "closed"],
    ["assignment", "accepted", "completed"],
    ["assignment", "accepted", "closed"],
    ["content", "draft", "publishing"],
    ["content", "publishing", "published"],
    ["content", "publishing", "failed"],
  ];

  it.each(cases)("allows %s: %s -> %s", (machine, from, to) => {
    expect(canTransition(machine, from, to)).toBe(true);
  });

  it.each([
    ["request", "draft", "approved"],
    ["request", "approved", "draft"],
    ["quote", "accepted", "active"],
    ["quote", "revoked", "active"],
    ["hold", "released", "active"],
    ["booking", "completed", "confirmed"],
    ["booking", "payment_failed", "confirmed"],
    ["payment", "paid", "review"],
    ["webhook_event", "processed", "received"],
    ["assignment", "closed", "accepted"],
    ["content", "published", "failed"],
    ["request", "not-a-state", "approved"],
    ["unknown", "draft", "published"],
    ["webhook", "received", "processed"],
  ] as const)("rejects %s: %s -> %s", (machine, from, to) => {
    expect(canTransition(machine as StateMachineName, from, to)).toBe(false);
  });

  it("keeps the transition registry deeply immutable and exhaustive", () => {
    expect(Object.isFrozen(STATE_MACHINE_NAME_VALUES)).toBe(true);
    expect(Object.isFrozen(STATE_MACHINE_TRANSITIONS)).toBe(true);
    for (const transitions of Object.values(STATE_MACHINE_TRANSITIONS)) {
      expect(Object.isFrozen(transitions)).toBe(true);
      for (const transition of transitions) expect(Object.isFrozen(transition)).toBe(true);
    }

    const statuses: Record<StateMachineName, readonly string[]> = {
      request: ["draft", "pending_review", "changes_requested", "approved", "rejected"],
      quote: ["active", "checkout_pending", "accepted", "expired", "revoked"],
      hold: ["active", "consumed", "released", "expired"],
      booking: ["pending_payment", "payment_processing", "confirmed", "payment_failed", "payment_review", "expired", "cancelled", "completed"],
      payment: ["pending", "paid", "failed", "review"],
      webhook_event: ["received", "processed", "ignored", "failed", "conflict"],
      assignment: ["assigned", "accepted", "completed", "closed"],
      content: ["draft", "publishing", "published", "failed"],
    };

    for (const [machine, allowedTransitions] of Object.entries(STATE_MACHINE_TRANSITIONS) as Array<[StateMachineName, readonly (readonly [string, string])[]]>) {
      const allowed = new Set(allowedTransitions.map(([from, to]) => `${from}\u0000${to}`));
      for (const from of statuses[machine]) {
        for (const to of statuses[machine]) {
          expect(canTransition(machine, from, to)).toBe(allowed.has(`${from}\u0000${to}`));
        }
      }
    }
  });
});
