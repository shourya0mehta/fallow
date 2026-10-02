import { promises as fs } from "node:fs";
import path from "node:path";
import { localizeDemo } from "./demo";
import { addEventsTo, addSignalsTo, applySettingsPatch, deleteEventFrom, emptyLedger, normalizeLedger, type Ledger } from "./ledger";
import type { LedgerEvent, Settings, Signal } from "./types";

export { DEFAULT_SETTINGS, emptyLedger, type Ledger } from "./ledger";

/**
 * Local-first JSON store. One file, one person, no cloud.
 *
 * Server-only: imports node:fs. The path can be overridden with FALLOW_DATA.
 * The mutations themselves live in ./ledger so the browser store shares them.
 */

export function dataPath(): string {
  return process.env.FALLOW_DATA ?? path.join(process.cwd(), "data", "fallow.json");
}

/**
 * Demo mode (FALLOW_DEMO=1): the ledger is read once from data/demo.json and
 * every write lands in memory only, so a deployed demo can be played with and
 * resets on restart. Nothing is persisted.
 */
const DEMO = process.env.FALLOW_DEMO === "1";
let demoLedger: Ledger | null = null;

export function demoPath(): string {
  return process.env.FALLOW_DEMO_DATA ?? path.join(process.cwd(), "src", "data", "demo.json");
}

export async function loadLedger(): Promise<Ledger> {
  if (DEMO) {
    if (!demoLedger) {
      try {
        demoLedger = localizeDemo(normalizeLedger(JSON.parse(await fs.readFile(demoPath(), "utf8"))));
      } catch {
        demoLedger = emptyLedger();
      }
    }
    return structuredClone(demoLedger);
  }
  try {
    const raw = await fs.readFile(dataPath(), "utf8");
    return normalizeLedger(JSON.parse(raw) as Partial<Ledger>);
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
  const res = addEventsTo(ledger, events);
  await saveLedger(ledger);
  return res;
}

export async function updateSettings(patch: Record<string, unknown>): Promise<Settings> {
  const ledger = await loadLedger();
  const settings = applySettingsPatch(ledger, patch);
  await saveLedger(ledger);
  return settings;
}

/** Add signals, skipping ids already present; an attention-day signal replaces the one for the same day. */
export async function addSignals(signals: Signal[]): Promise<{ added: number; total: number }> {
  const ledger = await loadLedger();
  const res = addSignalsTo(ledger, signals);
  await saveLedger(ledger);
  return res;
}

export async function deleteEvent(id: string): Promise<boolean> {
  const ledger = await loadLedger();
  if (!deleteEventFrom(ledger, id)) return false;
  await saveLedger(ledger);
  return true;
}

export async function clearLedger(): Promise<void> {
  await saveLedger(emptyLedger());
}
