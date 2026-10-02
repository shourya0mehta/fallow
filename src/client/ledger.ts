import { assess, type Assessment } from "@/core/assess";
import { addEventsTo, addSignalsTo, applySettingsPatch, buildPromptEvent, deleteEventFrom, emptyLedger, normalizeLedger, parseSignal, type Ledger, type PromptEventInput } from "@/core/ledger";
import { buildSnapshot, type Snapshot } from "@/core/summary";
import { monthOf } from "@/core/sync";
import type { LedgerEvent, Settings, Signal } from "@/core/types";

/**
 * One interface, two backends.
 *
 * ServerLedger talks to the local API, so the hooks, the extension and the UI
 * share one file on disk. BrowserLedger keeps the whole ledger in the visitor's
 * own IndexedDB and runs the core in the page, so the hosted site works with no
 * server at all. Nothing leaves the browser unless the person signs in to sync
 * (see ./sync.ts).
 */
export type LedgerMode = "server" | "browser";

export interface LedgerClient {
  readonly mode: LedgerMode;
  load(): Promise<Ledger>;
  snapshot(now?: Date): Promise<Snapshot>;
  assess(text: string, deadline?: boolean): Promise<Assessment>;
  addEvents(events: LedgerEvent[]): Promise<{ added: number; total: number }>;
  logPrompt(input: PromptEventInput): Promise<LedgerEvent | null>;
  deleteEvent(id: string): Promise<boolean>;
  updateSettings(patch: Record<string, unknown>): Promise<Settings>;
  addSignals(signals: unknown[]): Promise<{ added: number; total: number }>;
  clear(): Promise<void>;
  /** True while the ledger is the bundled demo and nothing of the visitor's own has been added. */
  isDemo(): Promise<boolean>;
}

// ---------- Server ----------

export class ServerLedger implements LedgerClient {
  readonly mode = "server" as const;
  constructor(private base = "") {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.base + path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? res.statusText);
    return (await res.json()) as T;
  }

  async load(): Promise<Ledger> {
    const [events, signals, settings] = await Promise.all([
      this.call<{ events: LedgerEvent[] }>("GET", "/api/events"),
      this.call<{ signals: Signal[] }>("GET", "/api/signals"),
      this.call<Settings>("GET", "/api/settings"),
    ]);
    return normalizeLedger({ events: events.events, signals: signals.signals, settings });
  }
  snapshot(): Promise<Snapshot> {
    return this.call<Snapshot>("GET", "/api/snapshot");
  }
  assess(text: string, deadline?: boolean): Promise<Assessment> {
    return this.call<Assessment>("POST", "/api/assess", { text, deadline: deadline === true });
  }
  addEvents(events: LedgerEvent[]) {
    return this.call<{ added: number; total: number }>("POST", "/api/events", { events });
  }
  async logPrompt(input: PromptEventInput) {
    const res = await this.call<{ event: LedgerEvent }>("POST", "/api/events", input);
    return res.event;
  }
  async deleteEvent(id: string) {
    const res = await fetch(`${this.base}/api/events/${encodeURIComponent(id)}`, { method: "DELETE" });
    return res.ok;
  }
  updateSettings(patch: Record<string, unknown>) {
    return this.call<Settings>("POST", "/api/settings", patch);
  }
  addSignals(signals: unknown[]) {
    return this.call<{ added: number; total: number }>("POST", "/api/signals", { signals });
  }
  async clear() {
    await this.call("POST", "/api/clear", { confirm: "erase" });
  }
  async isDemo() {
    return false;
  }
}

// ---------- Browser ----------

const DB_NAME = "fallow";
const STORE = "kv";
const KEY = "ledger";
const META_KEY = "meta";

export interface Meta {
  demo: boolean;
  /** Epoch ms of the last settings change here, for "newest wins" when syncing. */
  settingsAt?: number;
  /** Deletions the cloud has not heard about yet. */
  pendingDeletes?: Array<{ id: string; month: string; item: "event" | "signal" }>;
}

/** What changed, for the sync engine. Bulk replacements (sign-in merges, demo resets) do not emit. */
export type LedgerChange =
  | { kind: "events"; events: LedgerEvent[] }
  | { kind: "signals"; signals: Signal[] }
  | { kind: "settings"; settings: Settings; at: number }
  | { kind: "delete"; id: string; month: string; item: "event" | "signal" }
  | { kind: "clear" };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

const hasIdb = () => typeof indexedDB !== "undefined";

async function readStored<T>(key: string): Promise<T | undefined> {
  try {
    if (hasIdb()) return await idbGet<T>(key);
  } catch {
    /* fall through to localStorage */
  }
  try {
    const raw = localStorage.getItem(`fallow:${key}`);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

async function writeStored(key: string, value: unknown): Promise<void> {
  try {
    if (hasIdb()) {
      await idbSet(key, value);
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    localStorage.setItem(`fallow:${key}`, JSON.stringify(value));
  } catch {
    /* storage unavailable: keep in memory only */
  }
}

export class BrowserLedger implements LedgerClient {
  readonly mode = "browser" as const;
  private ledger: Ledger | null = null;
  private meta: Meta = { demo: false };
  private listeners = new Set<(c: LedgerChange) => void>();

  constructor(private loadDemo?: () => Promise<Partial<Ledger>>) {}

  /** Hear about every change made through this client. Returns an unsubscribe. */
  subscribe(fn: (c: LedgerChange) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(c: LedgerChange) {
    for (const fn of this.listeners) {
      try {
        fn(c);
      } catch {
        /* a listener's trouble is not the ledger's */
      }
    }
  }

  async getMeta(): Promise<Meta> {
    await this.ensure();
    return structuredClone(this.meta);
  }

  async setPendingDeletes(list: Meta["pendingDeletes"]): Promise<void> {
    await this.ensure();
    this.meta.pendingDeletes = list ?? [];
    await this.persist();
  }

  /** Swap in a whole garden (after a sign-in merge). Does not emit. */
  async replaceAll(ledger: Ledger, meta: Partial<Meta>): Promise<void> {
    await this.ensure();
    this.ledger = normalizeLedger(ledger);
    this.meta = { ...this.meta, ...meta };
    await this.persist();
  }

  /** Put the demo back (after signing out). Does not emit. */
  async resetToDemo(): Promise<void> {
    this.ledger = null;
    this.meta = { demo: false };
    let demo: Ledger | null = null;
    if (this.loadDemo) {
      try {
        demo = normalizeLedger(await this.loadDemo());
      } catch {
        demo = null;
      }
    }
    this.ledger = demo ?? emptyLedger();
    this.meta = { demo: demo !== null, settingsAt: 0, pendingDeletes: [] };
    await this.persist();
  }

  /** Swap the demo for an empty garden of your own. Does not emit: there is nothing to tell the cloud yet. */
  async startFresh(): Promise<void> {
    this.ledger = emptyLedger();
    this.meta = { demo: false, settingsAt: 0, pendingDeletes: [] };
    await this.persist();
  }

  private async ensure(): Promise<Ledger> {
    if (this.ledger) return this.ledger;
    const stored = await readStored<Partial<Ledger>>(KEY);
    const meta = await readStored<Meta>(META_KEY);
    if (stored) {
      this.ledger = normalizeLedger(stored);
      this.meta = { demo: false, ...(meta ?? {}) };
      return this.ledger;
    }
    if (this.loadDemo) {
      try {
        this.ledger = normalizeLedger(await this.loadDemo());
        this.meta = { demo: true };
        await this.persist();
        return this.ledger;
      } catch {
        /* no demo available */
      }
    }
    this.ledger = emptyLedger();
    this.meta = { demo: false };
    return this.ledger;
  }

  private async persist(): Promise<void> {
    if (!this.ledger) return;
    await writeStored(KEY, this.ledger);
    await writeStored(META_KEY, this.meta);
  }

  async load(): Promise<Ledger> {
    return structuredClone(await this.ensure());
  }
  async snapshot(now: Date = new Date()): Promise<Snapshot> {
    const l = await this.ensure();
    return buildSnapshot(l.events, l.settings, now, l.signals);
  }
  async assess(text: string, deadline?: boolean): Promise<Assessment> {
    return assess(text, await this.ensure(), { deadline });
  }
  async addEvents(events: LedgerEvent[]) {
    const l = await this.ensure();
    const before = new Set(l.events.map((e) => e.id));
    const res = addEventsTo(l, events);
    if (res.added > 0) this.meta.demo = false;
    await this.persist();
    const fresh: LedgerEvent[] = [];
    for (const e of events) {
      if (before.has(e.id)) continue;
      before.add(e.id);
      fresh.push(e);
    }
    if (fresh.length) this.emit({ kind: "events", events: fresh });
    return res;
  }
  async logPrompt(input: PromptEventInput) {
    const event = buildPromptEvent(input);
    if (!event) return null;
    await this.addEvents([event]);
    return event;
  }
  async deleteEvent(id: string) {
    const l = await this.ensure();
    const gone = l.events.find((e) => e.id === id);
    const ok = deleteEventFrom(l, id);
    if (ok) await this.persist();
    if (ok && gone) this.emit({ kind: "delete", id, month: monthOf(gone.ts), item: "event" });
    return ok;
  }
  async updateSettings(patch: Record<string, unknown>) {
    const l = await this.ensure();
    const settings = applySettingsPatch(l, patch);
    const at = Date.now();
    this.meta.settingsAt = at;
    await this.persist();
    this.emit({ kind: "settings", settings: structuredClone(settings), at });
    return settings;
  }
  async addSignals(signals: unknown[]) {
    const l = await this.ensure();
    const now = new Date().toISOString();
    const parsed = signals.map((s) => parseSignal(s, now)).filter((s): s is Signal => s !== null);
    const res = addSignalsTo(l, parsed);
    await this.persist();
    if (res.added > 0) this.emit({ kind: "signals", signals: parsed });
    return res;
  }
  async clear() {
    this.ledger = emptyLedger();
    this.meta = { demo: false, settingsAt: 0, pendingDeletes: [] };
    await this.persist();
    this.emit({ kind: "clear" });
  }
  async isDemo() {
    await this.ensure();
    return this.meta.demo;
  }
}

// ---------- Detection ----------

async function loadDemoLedger(): Promise<Partial<Ledger>> {
  const mod = await import("@/data/demo.json");
  return (mod.default ?? mod) as unknown as Partial<Ledger>;
}

/**
 * Pick the backend. The static build sets NEXT_PUBLIC_FALLOW_MODE=browser and
 * never probes. A local dev or production server answers /api/settings, so the
 * UI and the hooks share one file.
 */
export async function detectClient(): Promise<LedgerClient> {
  if (process.env.NEXT_PUBLIC_FALLOW_MODE === "browser") return new BrowserLedger(loadDemoLedger);
  if (process.env.NEXT_PUBLIC_FALLOW_MODE === "server") return new ServerLedger();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch("/api/settings", { signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    if (res.ok) {
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) return new ServerLedger();
    }
  } catch {
    /* no server */
  }
  return new BrowserLedger(loadDemoLedger);
}
