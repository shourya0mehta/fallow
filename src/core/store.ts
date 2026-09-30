import { promises as fs } from "node:fs";
import path from "node:path";
import type { LedgerEvent, Settings } from "./types";

/**
 * Local-first JSON store. One file, one person, no cloud.
 *
 * Server-only: imports node:fs. The path can be overridden with FALLOW_DATA.
 * Swapping in SQLite later means implementing these five functions.
 */

export interface Ledger {
  version: 1;
  events: LedgerEvent[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  keepList: ["composition", "analysis", "quantitative"],
  intensity: "standard",
  chronotype: "intermediate",
  sleep: { bed: "23:30", wake: "07:30" },
  sleepLog: {},
};

export function dataPath(): string {
  return process.env.FALLOW_DATA ?? path.join(process.cwd(), "data", "fallow.json");
}

export function emptyLedger(): Ledger {
  return { version: 1, events: [], settings: { ...DEFAULT_SETTINGS, keepList: [...DEFAULT_SETTINGS.keepList], sleepLog: {} } };
}

export async function loadLedger(): Promise<Ledger> {
  try {
    const raw = await fs.readFile(dataPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<Ledger>;
    return {
      version: 1,
      events: Array.isArray(parsed.events) ? parsed.events : [],
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}), sleepLog: parsed.settings?.sleepLog ?? {} },
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyLedger();
    throw err;
  }
}

export async function saveLedger(ledger: Ledger): Promise<void> {
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
