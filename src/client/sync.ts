import { bucketCount, bucketize, mergeGardens } from "@/core/sync";
import type { LedgerEvent, Settings, Signal } from "@/core/types";
import type { BrowserLedger, LedgerChange } from "./ledger";
import type { RemoteStore, Tombstone } from "./remote";

/**
 * Keeps a browser garden and its cloud copy in step.
 *
 * Local-first: every read and write hits IndexedDB, and the cloud catches up.
 * A full sync (on sign-in, on load, when the tab comes back, when the network
 * returns) pulls everything, merges by id, saves the result locally and pushes
 * whatever the cloud was missing. Between full syncs, changes go up in small
 * batches a moment after they happen. If a push fails, nothing is lost: the
 * next full sync uploads anything the cloud lacks, and deletions wait in a
 * persisted queue so they cannot come back from the dead.
 */

export type SyncPhase = "syncing" | "synced" | "offline" | "error";

export interface SyncReport {
  phase: SyncPhase;
  at?: number;
  error?: string;
}

export interface SyncResult {
  added: number;
  removed: number;
  uploaded: number;
}

const FLUSH_MS = 700;

export class SyncEngine {
  private unsub: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private events = new Map<string, LedgerEvent>();
  private signals = new Map<string, Signal>();
  private settings: { settings: Settings; at: number } | null = null;
  private running: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly local: BrowserLedger,
    private readonly remote: RemoteStore,
    private readonly report: (r: SyncReport) => void = () => undefined,
  ) {}

  start(): void {
    this.unsub ??= this.local.subscribe((c) => this.onChange(c));
  }

  stop(): void {
    this.unsub?.();
    this.unsub = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** One job at a time, so a flush never interleaves with a full sync. */
  private serial<T>(job: () => Promise<T>): Promise<T> {
    const next = this.running.then(job, job);
    this.running = next.catch(() => undefined);
    return next;
  }

  fullSync(): Promise<SyncResult> {
    return this.serial(async () => {
      this.report({ phase: "syncing" });
      try {
        const queuedEvents = new Set(this.events.keys());
        const queuedSignals = new Set(this.signals.keys());
        const queuedSettings = this.settings;
        const meta = await this.local.getMeta();
        if (meta.pendingDeletes?.length) {
          await this.remote.tombstone(meta.pendingDeletes);
          await this.local.setPendingDeletes([]);
        }
        const remote = await this.remote.pull();
        const local = await this.local.load();
        const res = mergeGardens({ local, localIsDemo: meta.demo, demoOwn: meta.demoOwn, localSettingsAt: meta.settingsAt ?? 0, remote });
        // keep anything logged while we were talking to the cloud; it stays queued for the next push
        const latest = await this.local.load();
        const known = new Set(local.events.map((e) => e.id));
        const merged = new Set(res.ledger.events.map((e) => e.id));
        const fresh = latest.events.filter((e) => !known.has(e.id) && !merged.has(e.id));
        if (fresh.length) res.ledger.events = [...res.ledger.events, ...fresh].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
        await this.local.replaceAll(res.ledger, { demo: false, demoDay: undefined, demoOwn: undefined, settingsAt: res.settingsAt });
        await this.remote.push(res.upload, res.uploadSettings ? { settings: res.ledger.settings, at: res.settingsAt } : null, res.ledger.settings.syncText === true);
        // what was queued before the merge is in the merged garden now
        for (const id of queuedEvents) this.events.delete(id);
        for (const id of queuedSignals) this.signals.delete(id);
        if (this.settings === queuedSettings) this.settings = null;
        if (this.events.size || this.signals.size || this.settings) this.schedule();
        this.report({ phase: "synced", at: Date.now() });
        return { added: res.added, removed: res.removed, uploaded: bucketCount(res.upload) };
      } catch (e) {
        this.report(failure(e));
        throw e;
      }
    });
  }

  /** Re-upload every month in full, e.g. after the person turns text sync on or off. */
  rewriteAll(): Promise<void> {
    return this.serial(async () => {
      this.report({ phase: "syncing" });
      try {
        const remote = await this.remote.pull();
        const deleted: Record<string, string[]> = {};
        for (const [m, b] of Object.entries(remote.months)) deleted[m] = Object.keys(b.deleted ?? {});
        const l = await this.local.load();
        await this.remote.rewrite(l.events, l.signals, deleted, l.settings.syncText === true);
        this.report({ phase: "synced", at: Date.now() });
      } catch (e) {
        this.report(failure(e));
        throw e;
      }
    });
  }

  eraseRemote(): Promise<void> {
    return this.serial(() => this.remote.eraseAll());
  }

  private onChange(c: LedgerChange) {
    if (c.kind === "events") for (const e of c.events) this.events.set(e.id, e);
    else if (c.kind === "signals") for (const s of c.signals) this.signals.set(s.id, s);
    else if (c.kind === "settings") this.settings = { settings: c.settings, at: c.at };
    else if (c.kind === "delete") {
      this.events.delete(c.id);
      void this.queueDelete({ id: c.id, month: c.month, item: c.item });
      return;
    } else return; // "clear" is handled by whoever erased: it decides about the cloud copy
    this.schedule();
  }

  private async queueDelete(t: Tombstone) {
    const meta = await this.local.getMeta();
    await this.local.setPendingDeletes([...(meta.pendingDeletes ?? []), t]);
    this.schedule();
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush().catch(() => undefined), FLUSH_MS);
  }

  /** Push what changed since the last push. */
  flush(): Promise<void> {
    return this.serial(async () => {
      const events = [...this.events.values()];
      const signals = [...this.signals.values()];
      const settings = this.settings;
      this.events.clear();
      this.signals.clear();
      this.settings = null;
      const meta = await this.local.getMeta();
      const deletes = meta.pendingDeletes ?? [];
      if (!events.length && !signals.length && !settings && !deletes.length) return;
      this.report({ phase: "syncing" });
      try {
        if (deletes.length) {
          await this.remote.tombstone(deletes);
          const now = await this.local.getMeta();
          const sent = new Set(deletes.map((d) => d.id));
          await this.local.setPendingDeletes((now.pendingDeletes ?? []).filter((d) => !sent.has(d.id)));
        }
        const l = await this.local.load();
        await this.remote.push(bucketize(events, signals), settings, l.settings.syncText === true);
        this.report({ phase: "synced", at: Date.now() });
      } catch (e) {
        // the next full sync uploads whatever the cloud is missing
        this.report(failure(e));
      }
    });
  }
}

function failure(e: unknown): SyncReport {
  const code = (e as { code?: string })?.code ?? "";
  const offline = code === "unavailable" || code === "deadline-exceeded" || (typeof navigator !== "undefined" && navigator.onLine === false);
  return offline ? { phase: "offline" } : { phase: "error", error: code === "permission-denied" ? "The cloud copy refused this account. Try signing in again." : "Sync hit a snag. It will try again." };
}
