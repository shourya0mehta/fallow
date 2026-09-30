import { json, preflight } from "@/core/http";
import { loadLedger } from "@/core/store";
import { buildSnapshot } from "@/core/summary";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ledger = await loadLedger();
  return json(req, buildSnapshot(ledger.events, ledger.settings, new Date(), ledger.signals));
}

export function OPTIONS(req: Request) {
  return preflight(req);
}
