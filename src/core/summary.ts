import { capacityAt, dayCurve, type AlertnessPoint, type Capacity } from "./alertness";
import { deriveDomainStates } from "./scheduler";
import { DOMAIN_BY_ID } from "./taxonomy";
import { localDateKey } from "./time";
import type { DomainId, DomainState, LedgerEvent, Settings, Source } from "./types";

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
  recent: LedgerEvent[];
}

const DAY_MS = 86_400_000;

export function todaySleep(settings: Settings, now: Date): Settings["sleep"] {
  const key = localDateKey(now);
  return settings.sleepLog[key] ?? settings.sleep;
}

export function buildSnapshot(events: LedgerEvent[], settings: Settings, now: Date = new Date()): Snapshot {
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
    recent: sorted.slice(-25).reverse(),
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
