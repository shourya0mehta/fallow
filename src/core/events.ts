import { classifyPrompt } from "./classify";
import type { Actor, Classification, LedgerEvent, Source } from "./types";

/** FNV-1a 32-bit, hex. Deterministic ids so re-imports do not duplicate events. */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Who did the cognitive work, inferred from what was asked.
 * Bringing an attempt, asking for a hint, a review or an explanation is shared work.
 * Asking for the finished thing is delegation.
 */
export function actorFor(c: Classification): Actor {
  if (c.icap === "interactive" || c.icap === "constructive") return "shared";
  if (c.askType === "review" || c.askType === "explain") return "shared";
  return "ai";
}

export const EXCERPT_CHARS = 140;

export function excerptOf(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > EXCERPT_CHARS ? `${t.slice(0, EXCERPT_CHARS - 1)}…` : t;
}

export interface PromptEventOptions {
  source: Source;
  ts: string;
  conversationId?: string;
  /** Stable key for the id; defaults to source+ts+text. */
  key?: string;
  keepExcerpt?: boolean;
}

export function eventFromPrompt(text: string, opts: PromptEventOptions): LedgerEvent {
  const c = classifyPrompt(text);
  const key = opts.key ?? `${opts.source}|${opts.ts}|${text}`;
  return {
    id: fnv1a(key),
    ts: opts.ts,
    source: opts.source,
    excerpt: opts.keepExcerpt === false ? undefined : excerptOf(text),
    domains: c.domains,
    icap: c.icap,
    askType: c.askType,
    actor: actorFor(c),
    conversationId: opts.conversationId,
  };
}
