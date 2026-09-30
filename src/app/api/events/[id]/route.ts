import { json, preflight } from "@/core/http";
import { deleteEvent } from "@/core/store";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ok = await deleteEvent(id);
  return json(req, { ok }, { status: ok ? 200 : 404 });
}

export function OPTIONS(req: Request) {
  return preflight(req);
}
