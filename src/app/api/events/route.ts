import { json, preflight } from "@/core/http";
import { buildPromptEvent, isLedgerEvent } from "@/core/ledger";
import { addEvents, loadLedger } from "@/core/store";

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

  const event = buildPromptEvent(body as unknown as Parameters<typeof buildPromptEvent>[0]);
  if (!event) return json(req, { error: "text or events is required" }, { status: 400 });
  const res = await addEvents([event]);
  return json(req, { ...res, event });
}
