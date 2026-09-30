#!/usr/bin/env node
/**
 * Fallow hook for Cursor (beforeSubmitPrompt).
 *
 * Cursor hooks read JSON on stdin and write JSON on stdout. This one asks the
 * local Fallow app for an engagement mode and returns it as additional context.
 * Fails open. Written against the Cursor hooks docs; not yet exercised in a
 * real Cursor session, so treat it as a starting point.
 *
 * ~/.cursor/hooks.json:
 * {
 *   "version": 1,
 *   "hooks": {
 *     "beforeSubmitPrompt": [{ "command": "node /ABSOLUTE/PATH/fallow/integrations/cursor/fallow-cursor-hook.mjs", "timeout": 10 }]
 *   }
 * }
 */
const BASE = process.env.FALLOW_URL ?? "http://localhost:3000";

async function main() {
  const raw = await new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
    setTimeout(() => resolve(data), 1500);
  });
  let payload = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }
  const prompt = typeof payload.prompt === "string" ? payload.prompt : typeof payload.text === "string" ? payload.text : "";
  if (prompt.trim().length < 12) return;
  try {
    const res = await fetch(`${BASE}/api/assess`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: prompt }) });
    if (!res.ok) return;
    const result = await res.json();
    if (!process.env.FALLOW_NO_LOG) {
      await fetch(`${BASE}/api/events`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: prompt, source: "hook-cursor" }) }).catch(() => {});
    }
    process.stdout.write(JSON.stringify({ additional_context: result.context }));
  } catch {
    /* fail open */
  }
}

main().then(() => process.exit(0));
