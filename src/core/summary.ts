import { capacityAt, dayCurve, type AlertnessPoint, type Capacity } from "./alertness";
import { deriveDomainStates } from "./scheduler";
import { DOMAIN_BY_ID } from "./taxonomy";
import { localDateKey } from "./time";
import type { AttentionDaySignal, DomainId, DomainState, LedgerEvent, PauseSignal, Settings, Signal, Source } from "./types";

/**
 * Everything the field board needs, computed from the ledger in one pass.
 * Pure: no I/O, so it can run in tests and on the server alike.
 */

export interface Nudge {
  domain: DomainId;
  headline: string;
  detail: string;
  practice: string;
}

export interface DomainSeriesPoint {
  /** YYYY-MM-DD */
  day: string;
  self: number;
  delegated: number;
}

export interface Snapshot {
  generatedAt: string;
  states: DomainState[];
  capacity: Capacity;
  curve: AlertnessPoint[];
  nudges: Nudge[];
  totals: {
    events: number;
    delegated: number;
    shared: number;
    self: number;
    delegatedShare: number;
    bySource: Partial<Record<Source, number>>;
    days: number;
    from?: string;
    to?: string;
  };
  /** Last 12 weeks, per domain, weekly counts of self vs delegated. */
  weekly: Record<DomainId, DomainSeriesPoint[]>;
  /** Delegation share trend over the last four weeks, per domain. */
  drift: Record<DomainId, Drift>;
  attention: {
    today?: AttentionDaySignal;
    week: AttentionDaySignal[];
    budgetMin: number;
  };
  pause: PauseSummary;
  recent: LedgerEvent[];
}

export type Drift = "rising" | "falling" | "flat" | "unknown";

export interface PauseSummary {
  todayOpens: number;
  todayClosed: number;
  weekOpens: number;
  weekClosed: number;
  /** Share of pauses in the last 7 days that ended with the site closed. */
  closeRate7d: number | null;
  sitesToday: Array<{ site: string; opens: number }>;
}

const DAY_MS = 86_400_000;

export function todaySleep(settings: Settings, now: Date): Settings["sleep"] {
  const key = localDateKey(now);
  return settings.sleepLog[key] ?? settings.sleep;
}

export function buildSnapshot(events: LedgerEvent[], settings: Settings, now: Date = new Date(), signals: Signal[] = []): Snapshot {
  const states = deriveDomainStates(events, now);
  const sleep = todaySleep(settings, now);
  const capacity = capacityAt(now, sleep, settings.chronotype, events);
  const curve = dayCurve(sleep, settings.chronotype, 30);

  const sorted = [...events].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const from = sorted[0]?.ts;
  const to = sorted.at(-1)?.ts;
  const bySource: Partial<Record<Source, number>> = {};
  let delegated = 0;
  let shared = 0;
  let self = 0;
  for (const e of events) {
    bySource[e.source] = (bySource[e.source] ?? 0) + 1;
    if (e.actor === "ai") delegated += 1;
    else if (e.actor === "shared") shared += 1;
    else self += 1;
  }
  const days = from && to ? Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1) : 0;

  return {
    generatedAt: now.toISOString(),
    states,
    capacity,
    curve,
    nudges: buildNudges(states, settings),
    totals: {
      events: events.length,
      delegated,
      shared,
      self,
      delegatedShare: events.length ? Math.round((delegated / events.length) * 100) / 100 : 0,
      bySource,
      days,
      from,
      to,
    },
    weekly: weeklySeries(events, now),
    drift: driftByDomain(events, now),
    attention: attentionSummary(signals, settings, now),
    pause: pauseSummary(signals, now),
    recent: sorted.slice(-25).reverse(),
  };
}

/**
 * Drift: is the delegated share of a domain's asks rising week over week?
 * "Rising" needs three consecutive weekly increases with at least three
 * asks in each of those weeks (Misiejuk et al. 2026 saw profiles diverge
 * within a few assignments; the ledger should catch that, not a yearly check).
 */
export function driftByDomain(events: LedgerEvent[], now: Date): Record<DomainId, Drift> {
  // Four trailing 7-day windows ending now, oldest first. Calendar weeks would
  // leave the current week mostly empty on a Tuesday.
  const nowMs = now.getTime();
  const counts = new Map<DomainId, Array<{ self: number; delegated: number }>>();
  for (const id of Object.keys(DOMAIN_BY_ID) as DomainId[]) counts.set(id, [0, 1, 2, 3].map(() => ({ self: 0, delegated: 0 })));
  for (const e of events) {
    const age = nowMs - Date.parse(e.ts);
    if (age < 0 || age >= 28 * DAY_MS) continue;
    const window = 3 - Math.floor(age / (7 * DAY_MS));
    for (const dw of e.domains) {
      const row = counts.get(dw.id)?.[window];
      if (!row) continue;
      if (e.actor === "ai") row.delegated += 1;
      else row.self += 1;
    }
  }
  const out = {} as Record<DomainId, Drift>;
  for (const [id, windows] of counts) {
    const shares = windows.map((w) => {
      const total = w.self + w.delegated;
      return total >= 3 ? w.delegated / total : null;
    });
    if (shares.some((v) => v === null)) {
      out[id] = "unknown";
      continue;
    }
    const s = shares as number[];
    const up = s[1] > s[0] && s[2] > s[1] && s[3] > s[2];
    const down = s[1] < s[0] && s[2] < s[1] && s[3] < s[2];
    out[id] = up ? "rising" : down ? "falling" : "flat";
  }
  return out;
}

export function attentionSummary(signals: Signal[], settings: Settings, now: Date): Snapshot["attention"] {
  const today = localDateKey(now);
  const cutoff = localDateKey(new Date(now.getTime() - 6 * DAY_MS));
  const days = signals.filter((s): s is AttentionDaySignal => s.kind === "attention-day" && s.day >= cutoff && s.day <= today).sort((a, b) => a.day.localeCompare(b.day));
  return { today: days.find((d) => d.day === today), week: days, budgetMin: settings.entertainmentBudgetMin };
}

export function pauseSummary(signals: Signal[], now: Date): PauseSummary {
  const nowMs = now.getTime();
  const weekMs = nowMs - 7 * DAY_MS;
  const pauses = signals.filter((s): s is PauseSignal => s.kind === "pause" && Date.parse(s.ts) <= nowMs);
  const week = pauses.filter((p) => Date.parse(p.ts) >= weekMs);
  const todays = week.filter((p) => localDateKey(new Date(p.ts)) === localDateKey(now));
  const sites = new Map<string, number>();
  for (const p of todays) sites.set(p.site, (sites.get(p.site) ?? 0) + 1);
  const weekClosed = week.filter((p) => p.outcome === "closed").length;
  return {
    todayOpens: todays.length,
    todayClosed: todays.filter((p) => p.outcome === "closed").length,
    weekOpens: week.length,
    weekClosed,
    closeRate7d: week.length ? Math.round((weekClosed / week.length) * 100) / 100 : null,
    sitesToday: [...sites.entries()].map(([site, opens]) => ({ site, opens })).sort((a, b) => b.opens - a.opens),
  };
}

export function buildNudges(states: DomainState[], settings: Settings, limit = 3): Nudge[] {
  const keep = new Set(settings.keepList);
  const candidates = states
    .filter((s) => s.id !== "attention")
    .filter((s) => s.status === "stale" || s.status === "fallow" || (s.status === "fading" && keep.has(s.id)))
    .sort((a, b) => {
      const ka = keep.has(a.id) ? 1 : 0;
      const kb = keep.has(b.id) ? 1 : 0;
      if (ka !== kb) return kb - ka;
      if (a.delegatedCount30d !== b.delegatedCount30d) return b.delegatedCount30d - a.delegatedCount30d;
      return a.retrievability - b.retrievability;
    })
    .slice(0, limit);

  return candidates.map((s) => {
    const spec = DOMAIN_BY_ID[s.id];
    const fallow = s.daysFallow === null ? "no self-done work on record" : `${s.daysFallow} days since you last did this yourself`;
    const delegated = s.delegatedCount30d > 0 ? `, delegated ${s.delegatedCount30d} times in the last 30 days` : "";
    return {
      domain: s.id,
      headline: `${spec.label}: ${fallow}${delegated}.`,
      detail: `Retrievability ${s.retrievability.toFixed(2)}. Typical ask: "${spec.typicalAsk}".`,
      practice: spec.practice,
    };
  });
}

function weekStart(ms: number): string {
  const d = new Date(ms);
  const day = d.getUTCDay(); // 0 Sunday
  const diff = (day + 6) % 7; // days since Monday
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
  return monday.toISOString().slice(0, 10);
}

export function weeklySeries(events: LedgerEvent[], now: Date, weeks = 12): Record<DomainId, DomainSeriesPoint[]> {
  const nowMs = now.getTime();
  const startMs = Date.parse(weekStart(nowMs)) - (weeks - 1) * 7 * DAY_MS;
  const keys: string[] = [];
  for (let i = 0; i < weeks; i++) keys.push(new Date(startMs + i * 7 * DAY_MS).toISOString().slice(0, 10));

  const out = {} as Record<DomainId, DomainSeriesPoint[]>;
  for (const id of Object.keys(DOMAIN_BY_ID) as DomainId[]) {
    out[id] = keys.map((day) => ({ day, self: 0, delegated: 0 }));
  }
  const index = new Map(keys.map((k, i) => [k, i]));
  for (const e of events) {
    const ms = Date.parse(e.ts);
    if (ms < startMs || ms > nowMs) continue;
    const i = index.get(weekStart(ms));
    if (i === undefined) continue;
    for (const dw of e.domains) {
      const row = out[dw.id]?.[i];
      if (!row) continue;
      if (e.actor === "ai") row.delegated += 1;
      else row.self += 1;
    }
  }
  return out;
}
