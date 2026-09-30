import { NextResponse } from "next/server";

/**
 * CORS for the local API. Browser extensions call through their background
 * worker (no CORS), but the demo chat page and any local tool may call from
 * another origin. Only localhost, 127.0.0.1 and extension origins are echoed.
 */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const ok = /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?|chrome-extension:\/\/[a-z]+|moz-extension:\/\/[a-z0-9-]+)$/i.test(origin);
  return ok
    ? {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
        "access-control-allow-headers": "content-type",
        vary: "origin",
      }
    : {};
}

export function json(req: Request, body: unknown, init: { status?: number } = {}): NextResponse {
  return NextResponse.json(body, { status: init.status ?? 200, headers: corsHeaders(req) });
}

export function preflight(req: Request): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}
