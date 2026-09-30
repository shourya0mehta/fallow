#!/usr/bin/env node
/**
 * Fallow hook for Claude Code (UserPromptSubmit).
 *
 * Reads the hook payload from stdin, asks the local Fallow server which
 * engagement mode this prompt deserves, logs the prompt to the ledger, and
 * hands the verdict back to Claude as additional context. Fails open: if the
 * server is down or anything throws, it prints nothing and exits 0.
 *
 * Install (in ~/.claude/settings.json):
 * {
 *   "hooks": {
 *     "UserPromptSubmit": [
 *       { "hooks": [ { "type": "command", "command": "node /ABSOLUTE/PATH/fallow/integrations/claude-code/fallow-hook.mjs", "timeout": 10 } ] }
 *     ]
 *   }
 * }
 *
 * Environment:
 *   FALLOW_URL         base URL of the running app (default http://localhost:3000)
 *   FALLOW_NO_LOG=1    assess only, do not add the prompt to the ledger
 *   FALLOW_NO_EXCERPT=1  log domain tags and timestamp only, no excerpt
 *   FALLOW_BLOCK_SELF=1  when the verdict is "do it yourself", block the prompt (exit 2) instead of advising
 */

const BASE = process.env.FALLOW_URL ?? "http://localhost:3000";
const MIN_CHARS = 12;

async function main() {
  const raw = await readStdin();
  let payload = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }
  const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
  if (prompt.length < MIN_CHARS) return;
  if (/^(y|yes|no|ok|okay|continue|go ahead|thanks|thank you)\b/i.test(prompt) && prompt.length < 40) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${BASE}/api/assess`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: prompt }),
      signal: controller.signal,
    });
    if (!res.ok) return;
    const result = await res.json();

    if (!process.env.FALLOW_NO_LOG) {
      await fetch(`${BASE}/api/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: prompt, source: "hook-claude-code", keepExcerpt: !process.env.FALLOW_NO_EXCERPT }),
        signal: controller.signal,
      }).catch(() => {});
    }

    const mode = result?.recommendation?.mode;
    const context = typeof result?.context === "string" ? result.context : "";
    if (!context) return;

    if (mode === "self" && process.env.FALLOW_BLOCK_SELF) {
      process.stderr.write(`Fallow: ${result.recommendation.reasons.join(" ")} ${result.recommendation.scaffold}\n`);
      process.exit(2);
    }

    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: context } }));
  } catch {
    // Fail open.
  } finally {
    clearTimeout(timer);
  }
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
    setTimeout(() => resolve(data), 1500);
  });
}

main().then(() => process.exit(0));
