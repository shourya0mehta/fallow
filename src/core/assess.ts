import { capacityAt } from "./alertness";
import { classifyPrompt } from "./classify";
import { MODE_LABEL, recommend } from "./policy";
import { deriveDomainStates } from "./scheduler";
import type { Ledger } from "./ledger";
import { todaySleep } from "./summary";
import { DOMAIN_BY_ID } from "./taxonomy";
import type { Classification, Recommendation } from "./types";

/**
 * One call that the gate page, the API and the Claude Code hook all share:
 * classify the prompt, derive state, compute capacity, recommend a mode,
 * and phrase it for a model to read.
 */

export interface Assessment {
  classification: Classification;
  recommendation: Recommendation;
  /** Plain text a host model can read as context. */
  context: string;
}

export function assess(text: string, ledger: Ledger, opts: { deadline?: boolean; now?: Date } = {}): Assessment {
  const now = opts.now ?? new Date();
  const classification = classifyPrompt(text);
  const states = deriveDomainStates(ledger.events, now);
  const capacity = capacityAt(now, todaySleep(ledger.settings, now), ledger.settings.chronotype, ledger.events);
  const recommendation = recommend({
    classification,
    states,
    settings: ledger.settings,
    capacity: capacity.value,
    deadline: opts.deadline,
  });
  return { classification, recommendation, context: contextFor(classification, recommendation) };
}

export function contextFor(c: Classification, r: Recommendation): string {
  const domains = c.domains.map((d) => `${DOMAIN_BY_ID[d.id].label} (${Math.round(d.weight * 100)}%)`).join(", ");
  const lines = [
    `[Fallow] Engagement mode for this request: ${MODE_LABEL[r.mode].toUpperCase()}.`,
    `Domains: ${domains}. Ask type: ${c.askType}. Engagement level requested: ${c.icap}.`,
    `Why: ${r.reasons.join(" ")}`,
    `How to respond: ${r.scaffold}`,
  ];
  if (r.mode === "self") {
    lines.push("Do not produce the finished artifact. Offer the timer and one first step. If the person insists, ask them to log it as delegated first.");
  }
  return lines.join("\n");
}
