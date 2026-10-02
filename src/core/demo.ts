import type { Ledger } from "./ledger";
import { localDateKey } from "./time";

const DAY_MS = 86_400_000;

/**
 * Re-date the demo garden for whoever is looking at it.
 *
 * The demo ledger (src/data/demo.json) is written in UTC wall-clock time with
 * its last day standing for "today". Here that last day becomes the viewer's
 * today: every entry keeps how many days back it was and its clock time, read
 * as local time, and anything later than now is left out. So the demo never
 * goes stale, and nobody sees asks at 3 a.m. because of their time zone.
 */
export function localizeDemo(ledger: Ledger, now: Date = new Date()): Ledger {
  const dayOf = (iso: string) => Math.floor(Date.parse(iso) / DAY_MS);
  if (ledger.events.length === 0) return ledger;
  let anchor = -Infinity;
  for (const e of ledger.events) anchor = Math.max(anchor, dayOf(e.ts));
  const nowMs = now.getTime();
  const at = (iso: string): Date => {
    const t = new Date(iso);
    const back = anchor - dayOf(iso);
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, t.getUTCHours(), t.getUTCMinutes(), t.getUTCSeconds());
  };

  const events = ledger.events.map((e) => ({ ...e, ts: at(e.ts).toISOString() })).filter((e) => Date.parse(e.ts) <= nowMs);
  const signals = ledger.signals
    .map((s) => {
      const d = at(s.ts);
      return s.kind === "attention-day" ? { ...s, ts: d.toISOString(), day: localDateKey(d) } : { ...s, ts: d.toISOString() };
    })
    .filter((s) => Date.parse(s.ts) <= nowMs);
  return { ...ledger, events, signals };
}
