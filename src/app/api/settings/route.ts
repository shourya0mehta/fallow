import { json, preflight } from "@/core/http";
import { loadLedger, updateSettings } from "@/core/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ledger = await loadLedger();
  return json(req, ledger.settings);
}

export function OPTIONS(req: Request) {
  return preflight(req);
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "Body must be JSON." }, { status: 400 });
  }
  const settings = await updateSettings(body);
  return json(req, settings);
}
