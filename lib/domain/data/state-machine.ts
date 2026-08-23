export type StateMachineName =
  | "request"
  | "quote"
  | "hold"
  | "booking"
  | "payment"
  | "webhook_event"
  | "assignment"
  | "content";

type Transition = readonly [from: string, to: string];

function frozenTransitions(rows: readonly Transition[]): readonly Transition[] {
  return Object.freeze(rows.map(([from, to]) => Object.freeze([from, to] as const)));
}

export const STATE_MACHINE_TRANSITIONS: Readonly<Record<StateMachineName, readonly Transition[]>> = Object.freeze({
  request: frozenTransitions([
    ["draft", "pending_review"],
    ["pending_review", "changes_requested"],
    ["pending_review", "approved"],
    ["pending_review", "rejected"],
    ["changes_requested", "pending_review"],
  ]),
  quote: frozenTransitions([
    ["active", "checkout_pending"],
    ["active", "expired"],
    ["active", "revoked"],
    ["checkout_pending", "accepted"],
    ["checkout_pending", "active"],
    ["checkout_pending", "expired"],
    ["checkout_pending", "revoked"],
  ]),
  hold: frozenTransitions([
    ["active", "consumed"],
    ["active", "released"],
    ["active", "expired"],
  ]),
  booking: frozenTransitions([
    ["pending_payment", "payment_processing"],
    ["pending_payment", "expired"],
    ["pending_payment", "cancelled"],
    ["payment_processing", "confirmed"],
    ["payment_processing", "payment_failed"],
    ["payment_processing", "expired"],
    ["payment_processing", "payment_review"],
    ["payment_processing", "cancelled"],
    ["confirmed", "completed"],
    ["confirmed", "cancelled"],
    ["payment_review", "confirmed"],
    ["payment_review", "cancelled"],
  ]),
  payment: frozenTransitions([
    ["pending", "paid"],
    ["pending", "failed"],
    ["pending", "review"],
    ["review", "paid"],
    ["review", "failed"],
  ]),
  webhook_event: frozenTransitions([
    ["received", "processed"],
    ["received", "ignored"],
    ["received", "failed"],
    ["received", "conflict"],
  ]),
  assignment: frozenTransitions([
    ["assigned", "accepted"],
    ["assigned", "closed"],
    ["accepted", "completed"],
    ["accepted", "closed"],
  ]),
  content: frozenTransitions([
    ["draft", "publishing"],
    ["publishing", "published"],
    ["publishing", "failed"],
  ]),
});

export function canTransition(
  machine: string,
  from: string,
  to: string,
): boolean {
  const machineTransitions = STATE_MACHINE_TRANSITIONS[machine as StateMachineName];
  return machineTransitions?.some(([source, target]) => source === from && target === to) ?? false;
}
