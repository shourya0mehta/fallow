import { NextResponse } from "next/server";
import { assess } from "@/core/assess";
import { loadLedger } from "@/core/store";

export const dynamic = "force-dynamic";

/**
 * POST /api/assess
 * body: { text: string, deadline?: boolean }
 * Returns the classification, the recommended engagement mode, and a plain-text
 * context block for a host model. Used by the gate page and the Claude Code hook.
 */
export async function POST(req: Request) {
  let body: { text?: unknown; deadline?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON with a text field." }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });
  const ledger = await loadLedger();
  const result = assess(text, ledger, { deadline: body.deadline === true });
  return NextResponse.json(result);
}
