// @vitest-environment node

import { describe, expect, it } from "vitest";

import { canTransition, type StateMachineName } from "@/lib/domain/data/state-machine";

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
  ] as const)("rejects %s: %s -> %s", (machine, from, to) => {
    expect(canTransition(machine as StateMachineName, from, to)).toBe(false);
  });
});
