import { DOMAINS } from "./taxonomy";
import type { AskType, Classification, DomainId, DomainWeight, Icap } from "./types";

/**
 * Lexicon classifier: prompt text -> cognitive domains, ask type, ICAP level.
 *
 * Deliberately transparent and local. It returns the terms that drove the decision
 * so the person can see why a prompt was filed where it was. An LLM-backed
 * classifier can implement the same `Classifier` interface later; the ledger
 * does not care which one produced the label.
 */

export interface Classifier {
  classify(text: string): Classification;
}

const MAX_DOMAINS = 3;
const MIN_WEIGHT = 0.15;
const LEAD_CHARS = 90; // terms in the opening of a prompt count more

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termPattern(term: string): RegExp {
  // Single tokens match on word boundaries; phrases and symbols match as substrings.
  const isWord = /^[a-z][a-z0-9'-]*$/.test(term);
  return isWord ? new RegExp(`\\b${escapeRegExp(term)}\\b`, "g") : new RegExp(escapeRegExp(term), "g");
}

const PATTERNS: Array<{ id: DomainId; term: string; weight: number; re: RegExp }> = DOMAINS.flatMap((d) =>
  d.lexicon.map((l) => ({ id: d.id, term: l.term, weight: l.weight, re: termPattern(l.term) })),
);

const ASK_PATTERNS: Array<{ type: AskType; re: RegExp }> = [
  { type: "hint", re: /\b(hint|hints|don'?t (tell|give) me the answer|without (giving|telling) (me )?the answer|guide me|socratic|nudge me|point me in|just a hint|don'?t solve it)\b/i },
  { type: "review", re: /\b(check my|review my|critique|feedback on|is this (right|correct|ok|okay)|proofread|what do you think of (my|this)|does this look|grade my|rate my|my (draft|attempt|version|code|solution|essay|answer) (is|below|here)|here'?s my)\b/i },
  { type: "explain", re: /\b(explain|why (does|doesn'?t|do|don'?t|is|isn'?t|are|aren'?t|did|didn'?t|won'?t|can'?t|couldn'?t|would|wouldn'?t)|how (does|did|come)|how do (they|you|we|these|those|it)|walk me through|help me understand|what'?s the difference|what is the difference|teach me|intuition (for|behind))\b/i },
  { type: "answer", re: /\b(write|draft|generate|create|make|produce|give me|solve|calculate|compute|fix this|just do|complete|finish|full (code|essay|draft|solution)|the answer|implement|build me|rewrite|translate|convert|summarize|summarise|list)\b/i },
];

const GENERIC_VERBS = new Set(["write", "rewrite"]);

const INTERACTIVE_RE = /\b(let'?s (discuss|argue|debate|work through)|push back|argue with me|challenge my|steelman|devil'?s advocate|back and forth|pair (on|with me))\b/i;
const CONSTRUCTIVE_RE = /\b(i (wrote|drafted|tried|attempted|made|built)|my (draft|attempt|version|solution|take)|here'?s (my|what i)|i think (the answer|it'?s)|my guess)\b/i;

export function classifyPrompt(raw: string): Classification {
  const text = raw.toLowerCase().replace(/\s+/g, " ").trim();
  const lead = text.slice(0, LEAD_CHARS);
  const scores = new Map<DomainId, number>();
  const signals = new Set<string>();

  let genericComposition = 0; // "write" and "rewrite" also introduce code requests
  for (const p of PATTERNS) {
    const hits = text.match(p.re);
    if (!hits) continue;
    const count = Math.min(hits.length, 2);
    const leadBoost = p.re.test(lead) ? 1.5 : 1;
    p.re.lastIndex = 0;
    const contribution = p.weight * count * leadBoost;
    scores.set(p.id, (scores.get(p.id) ?? 0) + contribution);
    if (p.id === "composition" && GENERIC_VERBS.has(p.term)) genericComposition += contribution;
    signals.add(p.term);
  }

  // Structural cues.
  if (/```|\bdef |\bfunction\b|=>|;\s*$|\bimport\b|\bconst\b|\breturn\b/.test(text)) {
    scores.set("implementation", (scores.get("implementation") ?? 0) + 1.5);
    signals.add("code-shaped text");
  }
  // "Write the SQL" is implementation, not prose: drop the generic verb's credit when code terms are present.
  if ((scores.get("implementation") ?? 0) > 0 && genericComposition > 0) {
    scores.set("composition", Math.max(0, (scores.get("composition") ?? 0) - genericComposition));
  }
  if (/\d+\s*[+\-*/×÷^%]\s*\d+|\b\d+(\.\d+)?\s*(%|percent|kg|km|miles|usd|\$)/.test(text)) {
    scores.set("quantitative", (scores.get("quantitative") ?? 0) + 1);
    signals.add("numbers with operators or units");
  }
  if (text.length > 1200 && /\b(summar|tl;dr|key points|main points)/.test(text)) {
    scores.set("synthesis", (scores.get("synthesis") ?? 0) + 1.5);
    signals.add("long pasted text");
  }

  let domains = rankDomains(scores);
  let confidence: number;
  if (domains.length === 0) {
    // Fallback on prompt shape. Questions read as recall; imperatives as composition; else analysis.
    const fallback: DomainId = /\?\s*$/.test(text) ? "recall" : /^(write|draft|make|create)\b/.test(text) ? "composition" : "analysis";
    domains = [{ id: fallback, weight: 1 }];
    confidence = 0.2;
    signals.add("no lexicon hit; prompt shape");
  } else {
    const total = [...scores.values()].reduce((a, b) => a + b, 0);
    confidence = Math.min(1, domains[0].weight * Math.min(1, total / 3));
  }

  const askType = detectAskType(text);
  const icap = detectIcap(text, askType);

  return { domains, icap, askType, confidence: round2(confidence), signals: [...signals].slice(0, 8) };
}

function rankDomains(scores: Map<DomainId, number>): DomainWeight[] {
  const entries = [...scores.entries()].filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return [];
  const total = entries.reduce((a, [, s]) => a + s, 0);
  let kept = entries.map(([id, s]) => ({ id, weight: s / total })).filter((d, i) => i === 0 || d.weight >= MIN_WEIGHT).slice(0, MAX_DOMAINS);
  const keptTotal = kept.reduce((a, d) => a + d.weight, 0);
  kept = kept.map((d) => ({ id: d.id, weight: round2(d.weight / keptTotal) }));
  return kept;
}

export function detectAskType(text: string): AskType {
  for (const p of ASK_PATTERNS) {
    if (p.re.test(text)) return p.type;
  }
  return "other";
}

export function detectIcap(text: string, askType: AskType): Icap {
  if (INTERACTIVE_RE.test(text)) return "interactive";
  if (CONSTRUCTIVE_RE.test(text) || askType === "hint") return "constructive";
  if (askType === "review" || askType === "explain") return "active";
  if (askType === "answer") return "passive";
  return "active";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const lexiconClassifier: Classifier = { classify: classifyPrompt };
