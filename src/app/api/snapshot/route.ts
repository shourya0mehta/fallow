import { NextResponse } from "next/server";
import { loadLedger } from "@/core/store";
import { buildSnapshot } from "@/core/summary";

export const dynamic = "force-dynamic";

export async function GET() {
  const ledger = await loadLedger();
  return NextResponse.json(buildSnapshot(ledger.events, ledger.settings));
}
