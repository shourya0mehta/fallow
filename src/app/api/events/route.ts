import { NextResponse } from "next/server";
import { eventFromPrompt } from "@/core/events";
import { addEvents, loadLedger } from "@/core/store";
import type { Actor, Icap, LedgerEvent, Source } from "@/core/types";
import { DOMAIN_IDS } from "@/core/taxonomy";

export const dynamic = "force-dynamic";

export async function GET() {
  const ledger = await loadLedger();
  return NextResponse.json({ events: ledger.events });
}

/**
 * POST /api/events
 * Either { events: LedgerEvent[] } (pre-classified, e.g. from a browser-side import)
 * or { text, source?, ts?, actor?, icap?, minutes?, demanding?, ideaOrigin? } for one prompt.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  if (Array.isArray(body.events)) {
    const valid = (body.events as unknown[]).filter(isLedgerEvent);
    const res = await addEvents(valid);
    return NextResponse.json({ ...res, rejected: body.events.length - valid.length });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "text or events is required" }, { status: 400 });
  const ts = typeof body.ts === "string" && !Number.isNaN(Date.parse(body.ts)) ? new Date(body.ts).toISOString() : new Date().toISOString();
  const source = (typeof body.source === "string" ? body.source : "manual") as Source;
  const event = eventFromPrompt(text, { source, ts, keepExcerpt: body.keepExcerpt !== false });
  if (isActor(body.actor)) event.actor = body.actor;
  if (isIcap(body.icap)) event.icap = body.icap;
  if (typeof body.minutes === "number" && body.minutes > 0) event.minutes = Math.round(body.minutes);
  if (typeof body.demanding === "boolean") event.demanding = body.demanding;
  if (body.ideaOrigin === "self" || body.ideaOrigin === "ai") event.ideaOrigin = body.ideaOrigin;
  const res = await addEvents([event]);
  return NextResponse.json({ ...res, event });
}

const ACTORS: Actor[] = ["self", "ai", "shared"];
const ICAPS: Icap[] = ["passive", "active", "constructive", "interactive"];
function isActor(v: unknown): v is Actor {
  return typeof v === "string" && (ACTORS as string[]).includes(v);
}
function isIcap(v: unknown): v is Icap {
  return typeof v === "string" && (ICAPS as string[]).includes(v);
}

function isLedgerEvent(v: unknown): v is LedgerEvent {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.ts === "string" &&
    !Number.isNaN(Date.parse(e.ts)) &&
    typeof e.source === "string" &&
    Array.isArray(e.domains) &&
    e.domains.every((d) => d && typeof d === "object" && (DOMAIN_IDS as string[]).includes((d as { id: string }).id) && typeof (d as { weight: unknown }).weight === "number") &&
    isIcap(e.icap) &&
    isActor(e.actor)
  );
}
