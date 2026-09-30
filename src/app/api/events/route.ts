import { eventFromPrompt } from "@/core/events";
import { json, preflight } from "@/core/http";
import { addEvents, loadLedger } from "@/core/store";
import type { Actor, DomainWeight, Icap, LedgerEvent, Source } from "@/core/types";
import { DOMAIN_IDS } from "@/core/taxonomy";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ledger = await loadLedger();
  return json(req, { events: ledger.events });
}

export function OPTIONS(req: Request) {
  return preflight(req);
}

/**
 * POST /api/events
 * Either { events: LedgerEvent[] } (pre-classified, e.g. from a browser-side import)
 * or { text, source?, ts?, actor?, icap?, minutes?, demanding?, ideaOrigin?, domains? } for one prompt.
 * `domains` overrides the classifier, e.g. for a practice block: [{ id: "composition", weight: 1 }].
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "Body must be JSON." }, { status: 400 });
  }

  if (Array.isArray(body.events)) {
    const valid = (body.events as unknown[]).filter(isLedgerEvent);
    const res = await addEvents(valid);
    return json(req, { ...res, rejected: body.events.length - valid.length });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return json(req, { error: "text or events is required" }, { status: 400 });
  const ts = typeof body.ts === "string" && !Number.isNaN(Date.parse(body.ts)) ? new Date(body.ts).toISOString() : new Date().toISOString();
  const source = (typeof body.source === "string" ? body.source : "manual") as Source;
  const event = eventFromPrompt(text, { source, ts, keepExcerpt: body.keepExcerpt !== false });
  if (isActor(body.actor)) event.actor = body.actor;
  if (isIcap(body.icap)) event.icap = body.icap;
  if (typeof body.minutes === "number" && body.minutes > 0) event.minutes = Math.round(body.minutes);
  if (typeof body.demanding === "boolean") event.demanding = body.demanding;
  if (body.ideaOrigin === "self" || body.ideaOrigin === "ai") event.ideaOrigin = body.ideaOrigin;
  if (Array.isArray(body.domains)) {
    const domains = (body.domains as unknown[]).filter(isDomainWeight);
    if (domains.length) event.domains = domains;
  }
  const res = await addEvents([event]);
  return json(req, { ...res, event });
}

const ACTORS: Actor[] = ["self", "ai", "shared"];
const ICAPS: Icap[] = ["passive", "active", "constructive", "interactive"];
function isActor(v: unknown): v is Actor {
  return typeof v === "string" && (ACTORS as string[]).includes(v);
}
function isIcap(v: unknown): v is Icap {
  return typeof v === "string" && (ICAPS as string[]).includes(v);
}

function isDomainWeight(d: unknown): d is DomainWeight {
  return !!d && typeof d === "object" && (DOMAIN_IDS as string[]).includes((d as { id: string }).id) && typeof (d as { weight: unknown }).weight === "number";
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
    e.domains.every(isDomainWeight) &&
    isIcap(e.icap) &&
    isActor(e.actor)
  );
}
