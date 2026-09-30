import { json, preflight } from "@/core/http";
import { clearLedger } from "@/core/store";

export const dynamic = "force-dynamic";

/** POST /api/clear with { confirm: "erase" } wipes the ledger and settings. */
export async function POST(req: Request) {
  let body: { confirm?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* fall through */
  }
  if (body.confirm !== "erase") return json(req, { error: 'Send { "confirm": "erase" }.' }, { status: 400 });
  await clearLedger();
  return json(req, { ok: true });
}

export function OPTIONS(req: Request) {
  return preflight(req);
}
