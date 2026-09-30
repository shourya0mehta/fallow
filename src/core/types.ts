/**
 * Core types for Fallow.
 *
 * Vocabulary (see the literature review):
 * - Domain: a cognitive ability family, anchored to CHC theory and O*NET abilities.
 * - ICAP: how much of the work the person did (Chi & Wylie 2014).
 * - AskType: what was asked of the AI. "answer" and "hint" diverge in every learning study.
 * - Mode: the engagement mode the policy recommends before the AI is allowed to work.
 */

export type DomainId =
  | "composition"
  | "analysis"
  | "quantitative"
  | "recall"
  | "synthesis"
  | "navigation"
  | "planning"
  | "ideation"
  | "implementation"
  | "verbal"
  | "attention";

/** Interactive > Constructive > Active > Passive. */
export type Icap = "passive" | "active" | "constructive" | "interactive";

export type AskType = "answer" | "hint" | "review" | "explain" | "other";

export type Actor = "self" | "ai" | "shared";

export type Mode = "self" | "scaffold" | "copilot" | "delegate";

export type Source =
  | "import-chatgpt"
  | "import-claude"
  | "hook-claude-code"
  | "gate"
  | "manual"
  | "seed";

export type DecayClass = "fast" | "medium" | "slow" | "none";

export interface DomainWeight {
  id: DomainId;
  weight: number; // 0..1, weights across a classification sum to about 1
}

export interface LedgerEvent {
  id: string;
  /** ISO 8601 timestamp of the event. */
  ts: string;
  source: Source;
  /** Short, optionally redacted excerpt of the prompt or task. Never required. */
  excerpt?: string;
  domains: DomainWeight[];
  icap: Icap;
  askType: AskType;
  /** Who did the cognitive work: the person, the AI, or both. */
  actor: Actor;
  /** Minutes the person spent on it, when known. */
  minutes?: number;
  /** Whether the person marked the work as demanding (feeds the fatigue term). */
  demanding?: boolean;
  conversationId?: string;
  /** Set when the idea originated with the AI (Doshi & Hauser homogenisation flag). */
  ideaOrigin?: "self" | "ai";
}

export interface Classification {
  domains: DomainWeight[];
  icap: Icap;
  askType: AskType;
  /** 0..1 confidence in the top domain. */
  confidence: number;
  /** Lexicon hits that drove the decision, for transparency. */
  signals: string[];
}

export interface DomainState {
  id: DomainId;
  /** Stability in days: the interval at which retrievability falls to 0.9. */
  stability: number;
  /** ISO timestamp of the last self or shared event, if any. */
  lastSelfAt?: string;
  lastDelegatedAt?: string;
  selfCount30d: number;
  delegatedCount30d: number;
  /** Retrievability now, 0..1. */
  retrievability: number;
  /** Days since the last self event; null when there has never been one. */
  daysFallow: number | null;
  status: DomainStatus;
}

export type DomainStatus = "fresh" | "fading" | "stale" | "fallow";

export type Chronotype = "morning" | "intermediate" | "evening";

export interface SleepWindow {
  /** "HH:MM" local clock time. */
  bed: string;
  wake: string;
}

export type Intensity = "gentle" | "standard" | "firm";

export interface Settings {
  /** Domains the person wants to keep sharp. The policy protects these first. */
  keepList: DomainId[];
  intensity: Intensity;
  chronotype: Chronotype;
  sleep: SleepWindow;
  /** Per-day sleep overrides, keyed by YYYY-MM-DD. */
  sleepLog: Record<string, SleepWindow>;
}

export interface Recommendation {
  mode: Mode;
  domains: DomainWeight[];
  /** Plain-language reasons, in priority order. */
  reasons: string[];
  /** A concrete scaffold the AI should follow when mode is not "delegate". */
  scaffold: string;
  /** The capacity estimate used, 0..1. */
  capacity: number;
}
