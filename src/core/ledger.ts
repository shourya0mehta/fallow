import { eventFromPrompt, fnv1a } from "./events";
import { parseClock } from "./alertness";
import { DOMAIN_IDS } from "./taxonomy";
import type { Actor, AttentionDaySignal, Chronotype, DomainId, DomainWeight, Icap, Intensity, LedgerEvent, PauseSignal, Settings, Signal, SleepWindow, Source } from "./types";

/**
 * The ledger as a pure value, and every mutation as a pure function.
 *
 * Both backends use these: the file-backed store behind the local API, and
 * the IndexedDB store the hosted site keeps inside the visitor's browser.
 * No Node imports here, so this module runs anywhere.
 */

export interface Ledger {
  version: 1;
  events: LedgerEvent[];
  signals: Signal[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  keepList: ["composition", "analysis", "quantitative"],
  intensity: "standard",
  chronotype: "intermediate",
  sleep: { bed: "23:30", wake: "07:30" },
  sleepLog: {},
  entertainmentSites: ["youtube.com", "tiktok.com", "instagram.com", "x.com", "twitter.com", "reddit.com", "facebook.com", "netflix.com", "twitch.tv"],
  entertainmentBudgetMin: 60,
  pauseSeconds: 10,
  syncText: false,
};

export function emptyLedger(): Ledger {
  return {
    version: 1,
    events: [],
    signals: [],
    settings: { ...DEFAULT_SETTINGS, keepList: [...DEFAULT_SETTINGS.keepList], entertainmentSites: [...DEFAULT_SETTINGS.entertainmentSites], sleepLog: {} },
  };
}

export function normalizeLedger(parsed: Partial<Ledger> | null | undefined): Ledger {
  return {
    version: 1,
    events: Array.isArray(parsed?.events) ? parsed!.events : [],
    signals: Array.isArray(parsed?.signals) ? parsed!.signals : [],
    settings: { ...DEFAULT_SETTINGS, ...(parsed?.settings ?? {}), sleepLog: parsed?.settings?.sleepLog ?? {} },
  };
}

const ACTORS: Actor[] = ["self", "ai", "shared"];
const ICAPS: Icap[] = ["passive", "active", "constructive", "interactive"];
const SOURCES: Source[] = ["import-chatgpt", "import-claude", "hook-claude-code", "hook-cursor", "extension-chat", "activitywatch", "practice", "gate", "manual", "seed"];

export function isActor(v: unknown): v is Actor {
  return typeof v === "string" && (ACTORS as string[]).includes(v);
}
export function isIcap(v: unknown): v is Icap {
  return typeof v === "string" && (ICAPS as string[]).includes(v);
}
export function isSource(v: unknown): v is Source {
  return typeof v === "string" && (SOURCES as string[]).includes(v);
}
export function isDomainWeight(d: unknown): d is DomainWeight {
  return !!d && typeof d === "object" && (DOMAIN_IDS as string[]).includes((d as { id: string }).id) && typeof (d as { weight: unknown }).weight === "number";
}

export function isLedgerEvent(v: unknown): v is LedgerEvent {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.ts === "string" &&
    !Number.isNaN(Date.parse(e.ts)) &&
    typeof e.source === "string" &&
    Array.isArray(e.domains) &&
    e.domains.every(isDomainWeight) &&
    isIcap(e.icap) &&
    isActor(e.actor)
  );
}

/** The body of a "log this prompt" request, from the gate, the hooks, or the extension. */
export interface PromptEventInput {
  text: string;
  source?: string;
  ts?: string;
  actor?: string;
  icap?: string;
  minutes?: number;
  demanding?: boolean;
  ideaOrigin?: string;
  domains?: unknown[];
  keepExcerpt?: boolean;
}

export function buildPromptEvent(input: PromptEventInput, now: Date = new Date()): LedgerEvent | null {
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (!text) return null;
  const ts = typeof input.ts === "string" && !Number.isNaN(Date.parse(input.ts)) ? new Date(input.ts).toISOString() : now.toISOString();
  const source: Source = isSource(input.source) ? input.source : "manual";
  const event = eventFromPrompt(text, { source, ts, keepExcerpt: input.keepExcerpt !== false });
  if (isActor(input.actor)) event.actor = input.actor;
  if (isIcap(input.icap)) event.icap = input.icap;
  if (typeof input.minutes === "number" && input.minutes > 0) event.minutes = Math.round(input.minutes);
  if (typeof input.demanding === "boolean") event.demanding = input.demanding;
  if (input.ideaOrigin === "self" || input.ideaOrigin === "ai") event.ideaOrigin = input.ideaOrigin;
  if (Array.isArray(input.domains)) {
    const domains = input.domains.filter(isDomainWeight);
    if (domains.length) event.domains = domains;
  }
  return event;
}

export function parseSignal(raw: unknown, now: string): Signal | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const ts = typeof r.ts === "string" && !Number.isNaN(Date.parse(r.ts)) ? new Date(r.ts).toISOString() : now;
  if (r.kind === "pause") {
    const site = typeof r.site === "string" ? r.site.toLowerCase().replace(/^www\./, "").slice(0, 120) : "";
    const outcome = r.outcome === "closed" ? "closed" : r.outcome === "continued" ? "continued" : null;
    if (!site || !outcome) return null;
    const waitedSeconds = typeof r.waitedSeconds === "number" ? Math.max(0, Math.round(r.waitedSeconds)) : 0;
    const s: PauseSignal = { id: fnv1a(`pause|${ts}|${site}|${outcome}`), ts, kind: "pause", site, outcome, waitedSeconds };
    return s;
  }
  if (r.kind === "attention-day") {
    const day = typeof r.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.day) ? r.day : null;
    if (!day) return null;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v * 10) / 10) : 0);
    const top = Array.isArray(r.top)
      ? (r.top as unknown[])
          .filter((t): t is { name: string; minutes: number } => !!t && typeof t === "object" && typeof (t as { name: unknown }).name === "string" && typeof (t as { minutes: unknown }).minutes === "number")
          .slice(0, 8)
          .map((t) => ({ name: t.name.slice(0, 80), minutes: Math.round(t.minutes) }))
      : [];
    const s: AttentionDaySignal = {
      id: fnv1a(`attention|${day}`),
      ts: typeof r.ts === "string" ? ts : `${day}T12:00:00.000Z`,
      kind: "attention-day",
      day,
      activeMin: num(r.activeMin),
      switchesPerHour: num(r.switchesPerHour),
      longestBlockMin: num(r.longestBlockMin),
      entertainmentMin: num(r.entertainmentMin),
      top,
    };
    return s;
  }
  return null;
}

/** Add events, skipping ids already present. Mutates and returns the ledger. */
export function addEventsTo(ledger: Ledger, events: LedgerEvent[]): { added: number; total: number } {
  const seen = new Set(ledger.events.map((e) => e.id));
  let added = 0;
  for (const e of events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    ledger.events.push(e);
    added += 1;
  }
  ledger.events.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  return { added, total: ledger.events.length };
}

/** Add signals; an attention-day signal replaces the one for the same day. */
export function addSignalsTo(ledger: Ledger, signals: Signal[]): { added: number; total: number } {
  const seen = new Set(ledger.signals.map((s) => s.id));
  let added = 0;
  for (const s of signals) {
    if (s.kind === "attention-day") {
      const idx = ledger.signals.findIndex((x) => x.kind === "attention-day" && x.day === s.day);
      if (idx >= 0) {
        ledger.signals[idx] = s;
        added += 1;
        continue;
      }
    }
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    ledger.signals.push(s);
    added += 1;
  }
  ledger.signals.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  return { added, total: ledger.signals.length };
}

export function deleteEventFrom(ledger: Ledger, id: string): boolean {
  const before = ledger.events.length;
  ledger.events = ledger.events.filter((e) => e.id !== id);
  return ledger.events.length !== before;
}

function validSleep(s: unknown): s is SleepWindow {
  if (!s || typeof s !== "object") return false;
  try {
    parseClock((s as SleepWindow).bed);
    parseClock((s as SleepWindow).wake);
    return true;
  } catch {
    return false;
  }
}

/** Validate a settings patch from any caller and apply it. */
export function applySettingsPatch(ledger: Ledger, body: Record<string, unknown>): Settings {
  const patch: Partial<Settings> = {};
  if (Array.isArray(body.keepList)) patch.keepList = body.keepList.filter((d): d is DomainId => (DOMAIN_IDS as string[]).includes(d as string));
  if (typeof body.intensity === "string" && ["gentle", "standard", "firm"].includes(body.intensity)) patch.intensity = body.intensity as Intensity;
  if (typeof body.chronotype === "string" && ["morning", "intermediate", "evening"].includes(body.chronotype)) patch.chronotype = body.chronotype as Chronotype;
  if (validSleep(body.sleep)) patch.sleep = body.sleep;
  if (typeof body.sleepDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.sleepDate) && validSleep(body.sleepForDate)) {
    patch.sleepLog = { ...ledger.settings.sleepLog, [body.sleepDate]: body.sleepForDate };
  }
  if (Array.isArray(body.entertainmentSites)) {
    patch.entertainmentSites = body.entertainmentSites
      .filter((h): h is string => typeof h === "string")
      .map((h) => h.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
      .filter((h) => /^[a-z0-9.-]+$/.test(h));
  }
  if (typeof body.entertainmentBudgetMin === "number" && body.entertainmentBudgetMin >= 0) patch.entertainmentBudgetMin = Math.round(body.entertainmentBudgetMin);
  if (typeof body.pauseSeconds === "number" && body.pauseSeconds >= 0 && body.pauseSeconds <= 120) patch.pauseSeconds = Math.round(body.pauseSeconds);
  if (typeof body.syncText === "boolean") patch.syncText = body.syncText;
  ledger.settings = { ...ledger.settings, ...patch };
  return ledger.settings;
}
