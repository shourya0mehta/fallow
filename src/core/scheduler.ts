import { DOMAIN_BY_ID, DOMAIN_IDS } from "./taxonomy";
import type { DomainId, DomainState, DomainStatus, Icap, LedgerEvent } from "./types";

/**
 * Spaced-repetition over skills.
 *
 * Each domain is treated like a flashcard with a stability S (days at which
 * retrievability falls to 0.9). Retrievability follows the FSRS power law:
 *
 *   R(t, S) = (1 + f * t / S)^(-w),   f = 0.9^(-1/w) - 1
 *
 * A self-done event is a "review": stability grows, and grows more when
 * retrievability was low at the time (the desirable-difficulty result in the
 * math). A delegated event is not a review: it leaves stability untouched and
 * only moves the delegation counters. Time does the rest.
 *
 * Parameters are priors, not measurements. See "Open questions" in the review.
 */

export const DECAY_W = 0.5;
export const FACTOR = Math.pow(0.9, -1 / DECAY_W) - 1; // about 0.2346
export const MAX_STABILITY_DAYS = 365;

/** How much a review of each engagement level grows stability. */
export const ICAP_GAIN: Record<Icap, number> = {
  interactive: 2.0,
  constructive: 1.6,
  active: 1.0,
  passive: 0.25,
};

export const STATUS_THRESHOLDS: Array<[DomainStatus, number]> = [
  ["fresh", 0.85],
  ["fading", 0.7],
  ["stale", 0.55],
];

const DAY_MS = 86_400_000;

export function retrievability(daysSince: number, stability: number): number {
  if (!Number.isFinite(stability)) return 1;
  if (daysSince <= 0) return 1;
  return Math.pow(1 + (FACTOR * daysSince) / stability, -DECAY_W);
}

/** Days until retrievability drops below `target`, from a fresh review. */
export function daysUntil(target: number, stability: number): number {
  if (!Number.isFinite(stability)) return Number.POSITIVE_INFINITY;
  // Invert R = (1 + f t / S)^(-w)  =>  t = S (R^(-1/w) - 1) / f
  return (stability * (Math.pow(target, -1 / DECAY_W) - 1)) / FACTOR;
}

export interface Review {
  icap: Icap;
  /** Retrievability at the moment of the review. */
  r: number;
  /** Fraction of the event attributed to this domain (its classification weight). */
  weight: number;
  minutes?: number;
  /** Shared work with an AI counts for less than solo work. */
  shared?: boolean;
}

export function nextStability(stability: number, review: Review): number {
  if (!Number.isFinite(stability)) return stability;
  const effort = review.minutes === undefined ? 1 : Math.min(1.5, 0.5 + review.minutes / 60);
  const difficultyBonus = Math.max(0.2, 1.2 - review.r); // low R at review time grows S more
  const share = review.shared ? 0.7 : 1;
  const growth = 1 + ICAP_GAIN[review.icap] * difficultyBonus * effort * share * review.weight;
  return Math.min(MAX_STABILITY_DAYS, stability * growth);
}

export function statusFor(r: number, everPracticed: boolean): DomainStatus {
  if (!everPracticed) return "fallow";
  for (const [status, threshold] of STATUS_THRESHOLDS) if (r >= threshold) return status;
  return "fallow";
}

function daysBetween(fromIso: string, toMs: number): number {
  return (toMs - Date.parse(fromIso)) / DAY_MS;
}

/**
 * Replay the ledger and produce the current state of every domain.
 * `ledgerStart` anchors domains that have never been practiced: as far as the
 * ledger knows, the last practice was before it began.
 */
export function deriveDomainStates(events: LedgerEvent[], now: Date = new Date()): DomainState[] {
  const nowMs = now.getTime();
  const sorted = [...events].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const ledgerStart = sorted.length ? sorted[0].ts : now.toISOString();
  const cutoff30 = nowMs - 30 * DAY_MS;

  const acc = new Map<
    DomainId,
    { stability: number; lastSelfAt?: string; lastDelegatedAt?: string; self30: number; del30: number }
  >();
  for (const id of DOMAIN_IDS) acc.set(id, { stability: DOMAIN_BY_ID[id].stabilityPrior, self30: 0, del30: 0 });

  for (const e of sorted) {
    const tsMs = Date.parse(e.ts);
    for (const dw of e.domains) {
      const a = acc.get(dw.id);
      if (!a) continue;
      const isPractice = e.actor === "self" || e.actor === "shared";
      if (isPractice) {
        const since = a.lastSelfAt ? (tsMs - Date.parse(a.lastSelfAt)) / DAY_MS : daysBetween(ledgerStart, tsMs);
        const r = retrievability(Math.max(0, since), a.stability);
        a.stability = nextStability(a.stability, {
          icap: e.icap,
          r,
          weight: dw.weight,
          minutes: e.minutes,
          shared: e.actor === "shared",
        });
        a.lastSelfAt = e.ts;
        if (tsMs >= cutoff30) a.self30 += 1;
      } else {
        a.lastDelegatedAt = e.ts;
        if (tsMs >= cutoff30) a.del30 += 1;
      }
    }
  }

  return DOMAIN_IDS.map((id) => {
    const a = acc.get(id)!;
    const ever = a.lastSelfAt !== undefined;
    const since = ever ? daysBetween(a.lastSelfAt!, nowMs) : daysBetween(ledgerStart, nowMs);
    const r = retrievability(Math.max(0, since), a.stability);
    return {
      id,
      stability: round1(a.stability),
      lastSelfAt: a.lastSelfAt,
      lastDelegatedAt: a.lastDelegatedAt,
      selfCount30d: a.self30,
      delegatedCount30d: a.del30,
      retrievability: round3(r),
      daysFallow: ever ? Math.floor(since) : null,
      status: statusFor(r, ever),
    };
  });
}

function round1(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : n;
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
