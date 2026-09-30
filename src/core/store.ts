import { promises as fs } from "node:fs";
import path from "node:path";
import type { LedgerEvent, Settings, Signal } from "./types";

/**
 * Local-first JSON store. One file, one person, no cloud.
 *
 * Server-only: imports node:fs. The path can be overridden with FALLOW_DATA.
 * Swapping in SQLite later means implementing these five functions.
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
};

export function dataPath(): string {
  return process.env.FALLOW_DATA ?? path.join(process.cwd(), "data", "fallow.json");
}

export function emptyLedger(): Ledger {
  return {
    version: 1,
    events: [],
    signals: [],
    settings: { ...DEFAULT_SETTINGS, keepList: [...DEFAULT_SETTINGS.keepList], entertainmentSites: [...DEFAULT_SETTINGS.entertainmentSites], sleepLog: {} },
  };
}

/**
 * Demo mode (FALLOW_DEMO=1): the ledger is read once from data/demo.json and
 * every write lands in memory only, so a deployed demo can be played with and
 * resets on restart. Nothing is persisted.
 */
const DEMO = process.env.FALLOW_DEMO === "1";
let demoLedger: Ledger | null = null;

function normalize(parsed: Partial<Ledger>): Ledger {
  return {
    version: 1,
    events: Array.isArray(parsed.events) ? parsed.events : [],
    signals: Array.isArray(parsed.signals) ? parsed.signals : [],
    settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}), sleepLog: parsed.settings?.sleepLog ?? {} },
  };
}

export function demoPath(): string {
  return process.env.FALLOW_DEMO_DATA ?? path.join(process.cwd(), "data", "demo.json");
}

export async function loadLedger(): Promise<Ledger> {
  if (DEMO) {
    if (!demoLedger) {
      try {
        demoLedger = normalize(JSON.parse(await fs.readFile(demoPath(), "utf8")));
      } catch {
        demoLedger = emptyLedger();
      }
    }
    return structuredClone(demoLedger);
  }
  try {
    const raw = await fs.readFile(dataPath(), "utf8");
    return normalize(JSON.parse(raw) as Partial<Ledger>);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyLedger();
    throw err;
  }
}

export function isDemo(): boolean {
  return DEMO;
}

export async function saveLedger(ledger: Ledger): Promise<void> {
  if (DEMO) {
    demoLedger = structuredClone(ledger);
    return;
  }
  const file = dataPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(ledger, null, 2), "utf8");
  await fs.rename(tmp, file);
}

/** Add events, skipping ids already present. Returns how many were new. */
export async function addEvents(events: LedgerEvent[]): Promise<{ added: number; total: number }> {
  const ledger = await loadLedger();
  const seen = new Set(ledger.events.map((e) => e.id));
  let added = 0;
  for (const e of events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    ledger.events.push(e);
    added += 1;
  }
  ledger.events.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  await saveLedger(ledger);
  return { added, total: ledger.events.length };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const ledger = await loadLedger();
  ledger.settings = { ...ledger.settings, ...patch };
  await saveLedger(ledger);
  return ledger.settings;
}

/** Add signals, skipping ids already present; an attention-day signal replaces the one for the same day. */
export async function addSignals(signals: Signal[]): Promise<{ added: number; total: number }> {
  const ledger = await loadLedger();
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
  await saveLedger(ledger);
  return { added, total: ledger.signals.length };
}

export async function deleteEvent(id: string): Promise<boolean> {
  const ledger = await loadLedger();
  const before = ledger.events.length;
  ledger.events = ledger.events.filter((e) => e.id !== id);
  if (ledger.events.length === before) return false;
  await saveLedger(ledger);
  return true;
}

export async function clearLedger(): Promise<void> {
  await saveLedger(emptyLedger());
}
