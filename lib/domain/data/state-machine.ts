export type StateMachineName =
  | "request"
  | "quote"
  | "hold"
  | "booking"
  | "payment"
  | "webhook"
  | "webhook_event"
  | "assignment"
  | "content";

type Transition = readonly [from: string, to: string];

const transitions: Record<StateMachineName, readonly Transition[]> = {
  request: [
    ["draft", "pending_review"],
    ["pending_review", "changes_requested"],
    ["pending_review", "approved"],
    ["pending_review", "rejected"],
    ["changes_requested", "pending_review"],
  ],
  quote: [
    ["active", "checkout_pending"],
    ["active", "expired"],
    ["active", "revoked"],
    ["checkout_pending", "accepted"],
    ["checkout_pending", "active"],
    ["checkout_pending", "expired"],
    ["checkout_pending", "revoked"],
  ],
  hold: [
    ["active", "consumed"],
    ["active", "released"],
    ["active", "expired"],
  ],
  booking: [
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
  ],
  payment: [
    ["pending", "paid"],
    ["pending", "failed"],
    ["pending", "review"],
    ["review", "paid"],
    ["review", "failed"],
  ],
  webhook: [
    ["received", "processed"],
    ["received", "ignored"],
    ["received", "failed"],
    ["received", "conflict"],
  ],
  webhook_event: [
    ["received", "processed"],
    ["received", "ignored"],
    ["received", "failed"],
    ["received", "conflict"],
  ],
  assignment: [
    ["assigned", "accepted"],
    ["assigned", "closed"],
    ["accepted", "completed"],
    ["accepted", "closed"],
  ],
  content: [
    ["draft", "publishing"],
    ["publishing", "published"],
    ["publishing", "failed"],
  ],
};

export const STATE_MACHINE_TRANSITIONS = transitions;

export function canTransition(
  machine: string,
  from: string,
  to: string,
): boolean {
  const machineTransitions = transitions[machine as StateMachineName];
  return machineTransitions?.some(([source, target]) => source === from && target === to) ?? false;
}
