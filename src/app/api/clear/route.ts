import { NextResponse } from "next/server";
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
  if (body.confirm !== "erase") return NextResponse.json({ error: 'Send { "confirm": "erase" }.' }, { status: 400 });
  await clearLedger();
  return NextResponse.json({ ok: true });
}
