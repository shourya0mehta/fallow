import { emptyLedger, isLedgerEvent, normalizeLedger, type Ledger } from "./ledger";
import type { LedgerEvent, Settings, Signal } from "./types";

/**
 * Sync as pure functions, so the rules are testable without a network.
 *
 * The cloud copy of a garden is one settings record stamped with the time it
 * last changed, plus month buckets (users/{uid}/months/{YYYY-MM}) that hold
 * events and signals keyed by id and tombstones for anything deleted.
 *
 * Merging is a union by id. A tombstone beats a copy. Settings go to whichever
 * side changed last. The demo's sample asks never reach the cloud (asks the
 * visitor logged on the demo do). The text of an ask stays on the device that
 * saw it unless the person turns on syncText.
 */

export interface MonthBucket {
  events: Record<string, LedgerEvent>;
  signals: Record<string, Signal>;
  deleted: Record<string, true>;
}

export interface RemoteGarden {
  settings: Partial<Settings> | null;
  /** Epoch ms of the last settings change, 0 when the account has none. */
  settingsAt: number;
  months: Record<string, Partial<MonthBucket>>;
}

export type Buckets = Record<string, { events: LedgerEvent[]; signals: Signal[] }>;

/** UTC year-month of an ISO timestamp, the bucket an event lives in. */
export function monthOf(ts: string): string {
  const t = Date.parse(ts);
  return Number.isNaN(t) ? "1970-01" : new Date(t).toISOString().slice(0, 7);
}

/** Drop undefined fields (the cloud rejects them) and, unless asked, the ask text. */
export function forUpload<T extends LedgerEvent | Signal>(item: T, syncText: boolean): T {
  const clean = JSON.parse(JSON.stringify(item)) as Record<string, unknown>;
  if (!syncText && "excerpt" in clean) delete clean.excerpt;
  return clean as T;
}

export function bucketize(events: LedgerEvent[], signals: Signal[]): Buckets {
  const out: Buckets = {};
  const at = (m: string) => (out[m] ??= { events: [], signals: [] });
  for (const e of events) at(monthOf(e.ts)).events.push(e);
  for (const s of signals) at(monthOf(s.ts)).signals.push(s);
  return out;
}

export function bucketCount(b: Buckets): number {
  return Object.values(b).reduce((n, m) => n + m.events.length + m.signals.length, 0);
}

const isSignal = (s: unknown): s is Signal =>
  !!s && typeof s === "object" && typeof (s as Signal).id === "string" && typeof (s as Signal).ts === "string" && ((s as Signal).kind === "pause" || (s as Signal).kind === "attention-day");

/** Two signals with the same id, or attention summaries for the same day: keep the newer. */
function newer(a: Signal, b: Signal): Signal {
  return Date.parse(b.ts) > Date.parse(a.ts) ? b : a;
}

function signalKey(s: Signal): string {
  return s.kind === "attention-day" ? `day:${s.day}` : `id:${s.id}`;
}

export interface MergeInput {
  local: Ledger;
  /** The local garden is the demo: discard its sample asks rather than upload them. */
  localIsDemo: boolean;
  /** On a demo garden, ids of the asks the visitor logged themselves: those are theirs and go up. */
  demoOwn?: string[];
  /** Epoch ms of the last local settings change, 0 when never changed. */
  localSettingsAt: number;
  remote: RemoteGarden;
  now?: number;
}

export interface MergeResult {
  ledger: Ledger;
  settingsAt: number;
  /** Local items the cloud is missing (or holds an older copy of). */
  upload: Buckets;
  uploadSettings: boolean;
  /** Events that came down from the cloud. */
  added: number;
  /** Local events dropped because another device deleted them. */
  removed: number;
}

export function mergeGardens({ local, localIsDemo, demoOwn = [], localSettingsAt, remote, now = Date.now() }: MergeInput): MergeResult {
  const months = Object.values(remote.months ?? {});
  const deleted = new Set<string>();
  for (const m of months) for (const id of Object.keys(m.deleted ?? {})) deleted.add(id);

  const remoteEvents = new Map<string, LedgerEvent>();
  const remoteSignals = new Map<string, Signal>();
  for (const m of months) {
    for (const e of Object.values(m.events ?? {})) if (isLedgerEvent(e) && !deleted.has(e.id)) remoteEvents.set(e.id, e);
    for (const s of Object.values(m.signals ?? {})) {
      if (!isSignal(s) || deleted.has(s.id)) continue;
      const k = signalKey(s);
      const have = remoteSignals.get(k);
      remoteSignals.set(k, have ? newer(have, s) : s);
    }
  }

  const own = new Set(demoOwn);
  const mine = localIsDemo ? { events: local.events.filter((e) => own.has(e.id)), signals: [] as Signal[] } : local;

  // events: union by id, tombstones win, local text is kept
  const events = new Map<string, LedgerEvent>();
  const upEvents: LedgerEvent[] = [];
  let removed = 0;
  for (const e of mine.events) {
    if (deleted.has(e.id)) {
      removed += 1;
      continue;
    }
    const r = remoteEvents.get(e.id);
    if (r) events.set(e.id, e.excerpt && !r.excerpt ? { ...r, excerpt: e.excerpt } : r);
    else {
      events.set(e.id, e);
      upEvents.push(e);
    }
  }
  let added = 0;
  for (const [id, r] of remoteEvents) {
    if (events.has(id)) continue;
    events.set(id, r);
    added += 1;
  }

  // signals: union, the newer copy wins, and the cloud hears about local news
  const signals = new Map<string, Signal>(remoteSignals);
  const upSignals: Signal[] = [];
  for (const s of mine.signals) {
    if (deleted.has(s.id)) continue;
    const k = signalKey(s);
    const r = remoteSignals.get(k);
    if (!r || newer(r, s) === s) {
      if (!r || r.ts !== s.ts) upSignals.push(s);
      signals.set(k, s);
    }
  }

  // settings: newest wins; a demo never overrides the cloud
  let settings: Settings;
  let settingsAt: number;
  let uploadSettings: boolean;
  if (remote.settings && (localIsDemo || remote.settingsAt >= localSettingsAt)) {
    settings = normalizeLedger({ settings: remote.settings as Settings }).settings;
    settingsAt = remote.settingsAt;
    uploadSettings = false;
  } else if (localIsDemo) {
    settings = emptyLedger().settings;
    settingsAt = now;
    uploadSettings = true;
  } else {
    settings = local.settings;
    settingsAt = localSettingsAt || now;
    uploadSettings = true;
  }

  const ledger: Ledger = {
    version: 1,
    events: [...events.values()].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts)),
    signals: [...signals.values()].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts)),
    settings,
  };
  return { ledger, settingsAt, upload: bucketize(upEvents, upSignals), uploadSettings, added, removed };
}

/** A month bucket's rough size in bytes, to stay well under the 1 MiB document cap. */
export function approxBytes(v: unknown): number {
  return JSON.stringify(v).length;
}

export const MONTH_BUDGET_BYTES = 900_000;
