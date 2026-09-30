import { NextResponse } from "next/server";
import { deleteEvent } from "@/core/store";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ok = await deleteEvent(id);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
