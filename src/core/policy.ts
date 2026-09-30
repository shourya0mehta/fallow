import { DOMAIN_BY_ID } from "./taxonomy";
import type { Classification, DomainId, DomainState, Intensity, Mode, Recommendation, Settings } from "./types";

/**
 * The engagement policy: given what is being asked, how fresh the relevant
 * domains are, the person's keep list, and current capacity, pick a mode.
 *
 * Grounding (see the review, "Designing the push-back"):
 * - Intervene before the answer (Buçinca et al. 2021).
 * - Scaffold, withhold the recommendation (Gajos & Mamykina 2022; Bastani et al. 2025).
 * - Make checking cheap in co-pilot mode (Vasconcelos et al. 2023).
 * - Attempt-first pays off for conceptual work, not rote procedures (Sinha & Kapur 2021).
 * - Low capacity is a reason to delegate, not to push (fatigue shifts choice toward low effort).
 * - Intensity is user-set, because the most effective forcing functions are the least liked.
 */

export interface PolicyInput {
  classification: Classification;
  states: DomainState[];
  settings: Pick<Settings, "keepList" | "intensity">;
  /** 0..1 from the budget model. */
  capacity: number;
  deadline?: boolean;
}

const CONCEPTUAL: Set<DomainId> = new Set([
  "analysis",
  "composition",
  "quantitative",
  "planning",
  "ideation",
  "synthesis",
  "navigation",
  "verbal",
]);

const THRESHOLDS: Record<Intensity, { self: number; scaffold: number; copilot: number }> = {
  gentle: { self: 0.7, scaffold: 0.45, copilot: 0.2 },
  standard: { self: 0.55, scaffold: 0.35, copilot: 0.15 },
  firm: { self: 0.45, scaffold: 0.25, copilot: 0.1 },
};

export function recommend(input: PolicyInput): Recommendation {
  const { classification, states, settings, capacity } = input;
  const byId = new Map(states.map((s) => [s.id, s]));
  const primary = classification.domains[0];
  const state = primary ? byId.get(primary.id) : undefined;
  const reasons: string[] = [];

  // Direct routes: the person already chose an engagement level.
  if (classification.askType === "hint") {
    reasons.push("You asked for a hint, so the model scaffolds instead of answering.");
    return build("scaffold", classification, reasons, capacity, primary?.id);
  }
  if (classification.askType === "review") {
    reasons.push("You did the work and asked for a review. The model critiques; it does not rewrite.");
    return build("copilot", classification, reasons, capacity, primary?.id, "Critique the person's version. Point at specific lines. Do not produce a replacement unless asked twice.");
  }

  let score = 0;
  if (state) {
    const staleness = 1 - state.retrievability;
    score += staleness;
    const label = DOMAIN_BY_ID[state.id].label;
    if (state.status === "fallow" && state.daysFallow === null) {
      reasons.push(`${label} has no self-done work in the ledger at all.`);
    } else if (state.status === "fallow" || state.status === "stale") {
      reasons.push(`${label} has lain fallow ${state.daysFallow} days (retrievability ${state.retrievability.toFixed(2)}).`);
    } else if (state.status === "fading") {
      reasons.push(`${label} is fading (retrievability ${state.retrievability.toFixed(2)}).`);
    } else {
      reasons.push(`${label} is fresh (retrievability ${state.retrievability.toFixed(2)}).`);
    }
    if (state.delegatedCount30d >= 5 && state.selfCount30d === 0) {
      score += 0.15;
      reasons.push(`Delegated ${state.delegatedCount30d} times in 30 days, done yourself 0 times.`);
    }
  }

  if (primary && settings.keepList.includes(primary.id)) {
    score += 0.35;
    reasons.push(`${DOMAIN_BY_ID[primary.id].label} is on your keep list.`);
  }

  if (primary && CONCEPTUAL.has(primary.id) && classification.askType !== "explain") {
    score += 0.15;
  } else if (primary && (primary.id === "implementation" || primary.id === "recall")) {
    score -= 0.1;
    reasons.push("Procedural work gains little from attempt-first, so the bar for pushing back is higher.");
  }

  if (capacity < 0.4) {
    score -= 0.3;
    reasons.push("Capacity is low right now. Delegating is the sane call; practice when rested.");
  } else if (capacity > 0.7) {
    score += 0.1;
  }

  if (input.deadline) {
    score -= 0.4;
    reasons.push("Deadline flag set.");
  }

  if (classification.icap === "constructive" || classification.icap === "interactive") {
    score -= 0.2;
    reasons.push("You brought your own attempt, which already counts as practice.");
  }

  const t = THRESHOLDS[settings.intensity];
  const mode: Mode = score >= t.self ? "self" : score >= t.scaffold ? "scaffold" : score >= t.copilot ? "copilot" : "delegate";
  if (classification.askType === "explain" && mode === "self") {
    // Explanations are learning; never refuse them outright.
    reasons.push("Explanations are learning. Scaffolded rather than refused.");
    return build("scaffold", classification, reasons, capacity, primary?.id);
  }
  return build(mode, classification, reasons, capacity, primary?.id);
}

function build(mode: Mode, c: Classification, reasons: string[], capacity: number, domainId?: DomainId, scaffoldOverride?: string): Recommendation {
  const practice = domainId ? DOMAIN_BY_ID[domainId].practice : "";
  const scaffold = scaffoldOverride ?? SCAFFOLDS[mode](practice);
  return { mode, domains: c.domains, reasons, scaffold, capacity };
}

const SCAFFOLDS: Record<Mode, (practice: string) => string> = {
  self: (practice) =>
    `Do this one yourself. Set a 15-minute timer. If you are still stuck at the end, come back and ask for a hint, not the answer. ${practice}`.trim(),
  scaffold: () =>
    "Give hints, questions and structure. Withhold the finished answer. Ask the person to attempt each step before revealing the next. Do not write the final artifact.",
  copilot: () =>
    "Draft it, then require one of these before the person accepts it: explain it back in their own words, change three specific things, or answer a three-item checklist about it.",
  delegate: () => "Do the task. It is logged as delegated. If ideas are involved, mark which ones came from the model.",
};

export const MODE_LABEL: Record<Mode, string> = {
  self: "Do it yourself",
  scaffold: "Scaffold",
  copilot: "Co-pilot",
  delegate: "Delegate",
};
