import { approxBytes, forUpload, MONTH_BUDGET_BYTES, monthOf, type Buckets, type MonthBucket, type RemoteGarden } from "@/core/sync";
import type { LedgerEvent, Settings, Signal } from "@/core/types";
import { firebase } from "./account";

/**
 * Where a signed-in garden lives in Firestore:
 *
 *   users/{uid}                  { settings, settingsAt, app, schema }
 *   users/{uid}/months/{YYYY-MM} { events: {id: event}, signals: {id: signal}, deleted: {id: true} }
 *
 * Month buckets keep reads cheap (a year of history is twelve documents) and
 * keyed maps make every write idempotent. Security rules let a person touch
 * only their own users/{uid} tree.
 */
export interface Tombstone {
  id: string;
  month: string;
  item: "event" | "signal";
}

export interface RemoteStore {
  pull(): Promise<RemoteGarden>;
  push(upload: Buckets, settings: { settings: Settings; at: number } | null, syncText: boolean): Promise<void>;
  tombstone(items: Tombstone[]): Promise<void>;
  /** Rewrite every month from a full local copy, e.g. after turning text sync on or off. */
  rewrite(events: LedgerEvent[], signals: Signal[], deleted: Record<string, string[]>, syncText: boolean): Promise<void>;
  eraseAll(): Promise<void>;
}

const MAX_OPS = 400;

function keyed<T extends { id: string }>(items: T[], syncText: boolean): Record<string, T> {
  const out: Record<string, T> = {};
  for (const it of items) out[it.id] = forUpload(it as unknown as LedgerEvent, syncText) as unknown as T;
  return out;
}

/** Events for one month, with ask text only if it fits comfortably under the document cap. */
function monthEvents(events: LedgerEvent[], syncText: boolean): Record<string, LedgerEvent> {
  if (syncText) {
    const withText = keyed(events, true);
    if (approxBytes(withText) < MONTH_BUDGET_BYTES) return withText;
  }
  return keyed(events, false);
}

export class FirestoreRemote implements RemoteStore {
  constructor(private readonly uid: string) {}

  private async refs() {
    const k = await firebase();
    const user = k.f.doc(k.db, "users", this.uid);
    return { ...k, user, month: (m: string) => k.f.doc(k.db, "users", this.uid, "months", m) };
  }

  async pull(): Promise<RemoteGarden> {
    const { f, user } = await this.refs();
    const [u, ms] = await Promise.all([f.getDoc(user), f.getDocs(f.collection(user, "months"))]);
    const data = u.exists() ? (u.data() as { settings?: Partial<Settings>; settingsAt?: number }) : null;
    const months: Record<string, Partial<MonthBucket>> = {};
    ms.forEach((d) => {
      months[d.id] = d.data() as Partial<MonthBucket>;
    });
    return { settings: data?.settings ?? null, settingsAt: typeof data?.settingsAt === "number" ? data.settingsAt : 0, months };
  }

  async push(upload: Buckets, settings: { settings: Settings; at: number } | null, syncText: boolean): Promise<void> {
    const { db, f, user, month } = await this.refs();
    let batch = f.writeBatch(db);
    let ops = 0;
    const roll = async () => {
      if (ops < MAX_OPS) return;
      await batch.commit();
      batch = f.writeBatch(db);
      ops = 0;
    };
    for (const [m, b] of Object.entries(upload)) {
      if (!b.events.length && !b.signals.length) continue;
      const data: Record<string, unknown> = {};
      if (b.events.length) data.events = monthEvents(b.events, syncText);
      if (b.signals.length) data.signals = keyed(b.signals, false);
      batch.set(month(m), data, { merge: true });
      ops += 1;
      await roll();
    }
    if (settings) {
      batch.set(user, { settings: JSON.parse(JSON.stringify(settings.settings)), settingsAt: settings.at, app: "fallow", schema: 1 }, { mergeFields: ["settings", "settingsAt", "app", "schema"] });
      ops += 1;
    }
    if (ops > 0) await batch.commit();
  }

  async tombstone(items: Tombstone[]): Promise<void> {
    if (!items.length) return;
    const { db, f, month } = await this.refs();
    const byMonth = new Map<string, Tombstone[]>();
    for (const t of items) byMonth.set(t.month, [...(byMonth.get(t.month) ?? []), t]);
    let batch = f.writeBatch(db);
    let ops = 0;
    for (const [m, ts] of byMonth) {
      const deleted: Record<string, true> = {};
      const events: Record<string, unknown> = {};
      const signals: Record<string, unknown> = {};
      for (const t of ts) {
        deleted[t.id] = true;
        (t.item === "event" ? events : signals)[t.id] = f.deleteField();
      }
      const data: Record<string, unknown> = { deleted };
      if (Object.keys(events).length) data.events = events;
      if (Object.keys(signals).length) data.signals = signals;
      batch.set(month(m), data, { merge: true });
      ops += 1;
      if (ops >= MAX_OPS) {
        await batch.commit();
        batch = f.writeBatch(db);
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
  }

  async rewrite(events: LedgerEvent[], signals: Signal[], deleted: Record<string, string[]>, syncText: boolean): Promise<void> {
    const { db, f, month } = await this.refs();
    const months = new Map<string, { events: LedgerEvent[]; signals: Signal[] }>();
    const at = (m: string) => {
      if (!months.has(m)) months.set(m, { events: [], signals: [] });
      return months.get(m)!;
    };
    for (const e of events) at(monthOf(e.ts)).events.push(e);
    for (const s of signals) at(monthOf(s.ts)).signals.push(s);
    for (const m of Object.keys(deleted)) at(m);
    let batch = f.writeBatch(db);
    let ops = 0;
    for (const [m, b] of months) {
      const tomb: Record<string, true> = {};
      for (const id of deleted[m] ?? []) tomb[id] = true;
      batch.set(month(m), { events: monthEvents(b.events, syncText), signals: keyed(b.signals, false), deleted: tomb });
      ops += 1;
      if (ops >= MAX_OPS) {
        await batch.commit();
        batch = f.writeBatch(db);
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
  }

  async eraseAll(): Promise<void> {
    const { db, f, user } = await this.refs();
    const ms = await f.getDocs(f.collection(user, "months"));
    let batch = f.writeBatch(db);
    let ops = 0;
    for (const d of ms.docs) {
      batch.delete(d.ref);
      ops += 1;
      if (ops >= MAX_OPS) {
        await batch.commit();
        batch = f.writeBatch(db);
        ops = 0;
      }
    }
    batch.delete(user);
    await batch.commit();
  }
}
