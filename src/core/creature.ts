import type { Stage } from "@/pixel/creature";
import type { Drift } from "./summary";
import type { DomainId, DomainState } from "./types";

/**
 * The creature's stage is a reading of the ledger, not a mood picked by hand.
 *
 * health = 0.7 · mean retrievability over the keep list (all non-attention
 *          domains when the keep list is empty)
 *        + 0.2 · share of the last 30 days' asks that were self-done or shared
 *        + 0.1 · capacity now (0 while asleep)
 *
 * Thriving at 0.80, steady at 0.60, fading at 0.40, fallow below. A rising
 * delegated share on any keep-list domain knocks the stage down one step: the
 * creature reacts to the trend before the retrievability numbers do.
 */
export interface CreatureReading {
  stage: Stage;
  health: number;
  retrievability: number;
  ownShare: number;
  capacity: number;
  knocked: boolean;
  reasons: string[];
}

const ORDER: Stage[] = ["fallow", "fading", "steady", "thriving"];

/** A domain nobody has logged anything for yet: no work done, nothing handed off. */
export function hasNoHistory(s: DomainState): boolean {
  return s.daysFallow === null && !s.lastDelegatedAt && s.selfCount30d === 0 && s.delegatedCount30d === 0;
}

/** What an unknown domain counts as: we have not seen it, so we do not mark it down. */
const UNKNOWN_R = 0.6;

export function creatureStage(input: { states: DomainState[]; keepList: DomainId[]; drift: Partial<Record<DomainId, Drift>>; capacity: number; asleep?: boolean }): CreatureReading {
  const pool = input.states.filter((s) => s.id !== "attention");
  const keep = pool.filter((s) => input.keepList.includes(s.id));
  const watched = keep.length > 0 ? keep : pool;
  const rOf = (s: DomainState) => (hasNoHistory(s) ? UNKNOWN_R : s.retrievability);
  const retrievability = watched.length ? watched.reduce((a, s) => a + rOf(s), 0) / watched.length : 0;
  const own = pool.reduce((a, s) => a + s.selfCount30d, 0);
  const delegated = pool.reduce((a, s) => a + s.delegatedCount30d, 0);
  const ownShare = own + delegated > 0 ? own / (own + delegated) : 0.5;
  const capacity = input.asleep ? 0 : Math.max(0, Math.min(1, input.capacity));
  let health = Math.max(0, Math.min(1, 0.7 * retrievability + 0.2 * ownShare + 0.1 * capacity));
  const brandNew = pool.length > 0 && pool.every(hasNoHistory);
  if (brandNew) health = Math.max(health, 0.6);

  let stage: Stage = health >= 0.8 ? "thriving" : health >= 0.6 ? "steady" : health >= 0.4 ? "fading" : "fallow";
  const rising = watched.filter((s) => input.drift[s.id] === "rising");
  const knocked = rising.length > 0 && stage !== "fallow";
  if (knocked) stage = ORDER[Math.max(0, ORDER.indexOf(stage) - 1)];

  const reasons: string[] = [];
  const stale = watched.filter((s) => !hasNoHistory(s) && (s.status === "stale" || s.status === "fallow"));
  if (brandNew) reasons.push("A brand-new garden: nothing logged yet.");
  else if (stale.length === 0) reasons.push(keep.length ? "Every keep-list domain is fresh or fading." : "No domain is stale.");
  else reasons.push(`${stale.length} ${keep.length ? "keep-list " : ""}domain${stale.length === 1 ? "" : "s"} stale or fallow.`);
  if (own + delegated > 0) reasons.push(`${Math.round(ownShare * 100)}% of the last 30 days' asks done yourself or shared.`);
  else reasons.push("Nothing logged in the last 30 days.");
  if (input.asleep) reasons.push("Asleep by your sleep window.");
  else if (capacity < 0.4) reasons.push("Low capacity right now.");
  if (knocked) reasons.push(`Delegation rising on ${rising.map((s) => s.id).join(", ")}: one stage down for the week.`);

  return { stage, health, retrievability, ownShare, capacity, knocked, reasons };
}
