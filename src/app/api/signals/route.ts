import { fnv1a } from "@/core/events";
import { json, preflight } from "@/core/http";
import { addSignals, loadLedger } from "@/core/store";
import type { AttentionDaySignal, PauseSignal, Signal } from "@/core/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ledger = await loadLedger();
  return json(req, { signals: ledger.signals });
}

/**
 * POST /api/signals
 * { kind: "pause", site, outcome: "continued" | "closed", waitedSeconds }
 * { kind: "attention-day", day, activeMin, switchesPerHour, longestBlockMin, entertainmentMin, top }
 * or { signals: [...] } for a batch.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "Body must be JSON." }, { status: 400 });
  }
  const list = Array.isArray(body.signals) ? (body.signals as unknown[]) : [body];
  const now = new Date().toISOString();
  const signals: Signal[] = [];
  for (const raw of list) {
    const s = parseSignal(raw, now);
    if (s) signals.push(s);
  }
  if (!signals.length) return json(req, { error: "no valid signals" }, { status: 400 });
  const res = await addSignals(signals);
  return json(req, { ...res, signals });
}

export function OPTIONS(req: Request) {
  return preflight(req);
}

function parseSignal(raw: unknown, now: string): Signal | null {
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
