import { eventFromPrompt } from "../events";
import { isLedgerEvent } from "../ledger";
import type { LedgerEvent, Signal } from "../types";
import type { ImportOptions, ImportResult } from "./chatgpt";

/**
 * Claude data export: `conversations.json`.
 *
 * Shape: an array of conversations with `chat_messages`, each carrying
 * `sender` ("human" or "assistant"), `text`, and `created_at` (ISO).
 */

interface ClaudeMessage {
  uuid?: string;
  text?: string;
  sender?: string;
  created_at?: string;
  content?: Array<{ type?: string; text?: string }>;
}

interface ClaudeConversation {
  uuid?: string;
  name?: string;
  created_at?: string;
  chat_messages?: ClaudeMessage[];
}

export function importClaude(json: unknown, opts: ImportOptions = {}): ImportResult {
  const minChars = opts.minChars ?? 12;
  const conversations = Array.isArray(json) ? (json as ClaudeConversation[]) : [];
  const events: LedgerEvent[] = [];
  let messages = 0;
  let skipped = 0;
  let from: string | undefined;
  let to: string | undefined;

  for (const convo of conversations) {
    const convoId = convo.uuid ?? "unknown";
    for (const m of convo.chat_messages ?? []) {
      if (m.sender !== "human") continue;
      messages += 1;
      const text = (m.text && m.text.trim()) || (m.content ?? []).filter((c) => c.type === "text" && c.text).map((c) => c.text!.trim()).join("\n");
      if (!text || text.length < minChars) {
        skipped += 1;
        continue;
      }
      const ts = m.created_at ?? convo.created_at;
      if (!ts || Number.isNaN(Date.parse(ts))) {
        skipped += 1;
        continue;
      }
      const iso = new Date(ts).toISOString();
      if (!from || iso < from) from = iso;
      if (!to || iso > to) to = iso;
      events.push(
        eventFromPrompt(text, {
          source: "import-claude",
          ts: iso,
          conversationId: convoId,
          key: `claude|${convoId}|${m.uuid ?? iso}`,
          keepExcerpt: opts.keepExcerpt,
        }),
      );
    }
  }

  return { events, conversations: conversations.length, messages, skipped, from, to };
}

/** Sniff which export a JSON payload is. */
export function detectExport(json: unknown): "chatgpt" | "claude" | "fallow" | "unknown" {
  if (json && typeof json === "object" && !Array.isArray(json) && Array.isArray((json as { events?: unknown }).events)) return "fallow";
  if (!Array.isArray(json) || json.length === 0) return "unknown";
  const first = json[0] as Record<string, unknown>;
  if (first && typeof first === "object") {
    if ("mapping" in first) return "chatgpt";
    if ("chat_messages" in first) return "claude";
  }
  return "unknown";
}

/**
 * Fallow's own ledger JSON, as exported by the extension's options page or
 * copied from data/fallow.json. Events and signals come through as they are.
 */
export function importFallow(json: unknown): ImportResult & { signals: Signal[] } {
  const raw = (json ?? {}) as { events?: unknown[]; signals?: unknown[] };
  const events = (Array.isArray(raw.events) ? raw.events : []).filter(isLedgerEvent);
  const signals = (Array.isArray(raw.signals) ? raw.signals : []).filter((s): s is Signal => !!s && typeof s === "object" && typeof (s as Signal).id === "string" && ((s as Signal).kind === "pause" || (s as Signal).kind === "attention-day"));
  const sorted = [...events].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  return {
    events,
    signals,
    conversations: 0,
    messages: events.length,
    skipped: (Array.isArray(raw.events) ? raw.events.length : 0) - events.length,
    from: sorted[0]?.ts,
    to: sorted.at(-1)?.ts,
  };
}
