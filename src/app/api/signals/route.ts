import { json, preflight } from "@/core/http";
import { parseSignal } from "@/core/ledger";
import { addSignals, loadLedger } from "@/core/store";
import type { Signal } from "@/core/types";

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
