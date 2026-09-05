import {
  normalizeRefinementSignals,
  type RefinementSignals,
} from "@/lib/application/planner/refinement-signals";

export {
  normalizeRefinementSignals,
  type RefinementSignals,
};

function canonicalRefinementFeedback(signals: RefinementSignals): string {
  const phrases: string[] = [];
  if (signals.pace === "slower") phrases.push("slower");
  if (signals.pace === "faster") phrases.push("faster");
  if (signals.food === "more") phrases.push("more food");
  if (signals.food === "remove") phrases.push("remove food");
  if (signals.preferTypes[0] === "history") phrases.push("history");
  if (signals.preferTypes[0] === "traditional_craft") phrases.push("craft");
  if (signals.preferTypes[0] === "traditional_market") phrases.push("market");
  return phrases.join("; ");
}

/** Accept only the bounded canonical phrases emitted by the planner UI. */
export function parseCanonicalRefinementSignals(feedback: string): RefinementSignals | null {
  const signals = normalizeRefinementSignals(feedback);
  const canonicalFeedback = canonicalRefinementFeedback(signals);
  return canonicalFeedback.length > 0 && canonicalFeedback === feedback ? signals : null;
}
