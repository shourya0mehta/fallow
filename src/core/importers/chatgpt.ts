import { eventFromPrompt } from "../events";
import type { LedgerEvent } from "../types";

/**
 * ChatGPT data export: `conversations.json`.
 *
 * Shape (as of the 2024-2026 exports): an array of conversations, each with a
 * `mapping` of message nodes. Only user-authored text messages become events.
 */

export interface ImportResult {
  events: LedgerEvent[];
  conversations: number;
  messages: number;
  skipped: number;
  from?: string;
  to?: string;
}

interface ChatGptNode {
  id?: string;
  message?: {
    id?: string;
    author?: { role?: string };
    create_time?: number | null;
    content?: { content_type?: string; parts?: unknown[] };
  } | null;
}

interface ChatGptConversation {
  id?: string;
  conversation_id?: string;
  title?: string;
  create_time?: number;
  mapping?: Record<string, ChatGptNode>;
}

export interface ImportOptions {
  keepExcerpt?: boolean;
  /** Ignore prompts shorter than this many characters (greetings, "ok", "thanks"). */
  minChars?: number;
}

export function importChatGpt(json: unknown, opts: ImportOptions = {}): ImportResult {
  const minChars = opts.minChars ?? 12;
  const conversations = Array.isArray(json) ? (json as ChatGptConversation[]) : [];
  const events: LedgerEvent[] = [];
  let messages = 0;
  let skipped = 0;
  let from: number | undefined;
  let to: number | undefined;

  for (const convo of conversations) {
    const convoId = convo.conversation_id ?? convo.id ?? "unknown";
    const mapping = convo.mapping ?? {};
    for (const node of Object.values(mapping)) {
      const m = node?.message;
      if (!m || m.author?.role !== "user") continue;
      const parts = m.content?.parts ?? [];
      const text = parts.filter((p): p is string => typeof p === "string").join("\n").trim();
      messages += 1;
      if (text.length < minChars) {
        skipped += 1;
        continue;
      }
      const seconds = m.create_time ?? convo.create_time;
      if (!seconds) {
        skipped += 1;
        continue;
      }
      const ts = new Date(seconds * 1000).toISOString();
      from = from === undefined ? seconds : Math.min(from, seconds);
      to = to === undefined ? seconds : Math.max(to, seconds);
      events.push(
        eventFromPrompt(text, {
          source: "import-chatgpt",
          ts,
          conversationId: convoId,
          key: `chatgpt|${convoId}|${m.id ?? node.id ?? ts}`,
          keepExcerpt: opts.keepExcerpt,
        }),
      );
    }
  }

  return {
    events,
    conversations: conversations.length,
    messages,
    skipped,
    from: from ? new Date(from * 1000).toISOString() : undefined,
    to: to ? new Date(to * 1000).toISOString() : undefined,
  };
}
