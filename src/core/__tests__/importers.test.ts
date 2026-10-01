import { describe, expect, it } from "vitest";
import { importChatGpt } from "../importers/chatgpt";
import { detectExport, importClaude, importFallow } from "../importers/claude";
import { buildSnapshot } from "../summary";
import { DEFAULT_SETTINGS } from "../store";

const chatgpt = [
  {
    id: "c1",
    title: "Cover letter",
    create_time: 1_758_000_000,
    mapping: {
      root: { id: "root", message: null, parent: null, children: ["m1"] },
      m1: {
        id: "m1",
        message: {
          id: "m1",
          author: { role: "user" },
          create_time: 1_758_000_100,
          content: { content_type: "text", parts: ["Write me a cover letter for a GIS internship"] },
        },
        parent: "root",
        children: ["m2"],
      },
      m2: {
        id: "m2",
        message: { id: "m2", author: { role: "assistant" }, create_time: 1_758_000_150, content: { content_type: "text", parts: ["Sure..."] } },
        parent: "m1",
        children: ["m3"],
      },
      m3: {
        id: "m3",
        message: { id: "m3", author: { role: "user" }, create_time: null, content: { content_type: "text", parts: ["thanks"] } },
        parent: "m2",
        children: [],
      },
      m4: {
        id: "m4",
        message: { id: "m4", author: { role: "user" }, create_time: 1_758_000_300, content: { content_type: "multimodal_text", parts: [{ asset_pointer: "x" }, "Summarize the key points of this image's caption please"] } },
        parent: "m2",
        children: [],
      },
    },
  },
];

const claude = [
  {
    uuid: "u1",
    name: "Debugging",
    created_at: "2026-09-01T10:00:00Z",
    chat_messages: [
      { uuid: "a", sender: "human", text: "Why doesn't this regex match? /^\\d{3}-\\d{4}$/ against 555-12345", created_at: "2026-09-01T10:00:05Z" },
      { uuid: "b", sender: "assistant", text: "Because...", created_at: "2026-09-01T10:00:09Z" },
      { uuid: "c", sender: "human", text: "ok", created_at: "2026-09-01T10:01:00Z" },
      { uuid: "d", sender: "human", text: "", content: [{ type: "text", text: "Give me a hint, not the answer, for the next one" }], created_at: "2026-09-02T10:01:00Z" },
    ],
  },
];

describe("importers", () => {
  it("detects the export format", () => {
    expect(detectExport(chatgpt)).toBe("chatgpt");
    expect(detectExport(claude)).toBe("claude");
    expect(detectExport({ version: 1, events: [] })).toBe("fallow");
    expect(detectExport({})).toBe("unknown");
    expect(detectExport([])).toBe("unknown");
  });

  it("imports a Fallow ledger, keeping valid events and signals only", () => {
    const events = importChatGpt(chatgpt).events;
    const r = importFallow({ version: 1, events: [...events, { bogus: true }], signals: [{ id: "p1", ts: "2026-09-01T10:00:00Z", kind: "pause", site: "youtube.com", outcome: "closed", waitedSeconds: 4 }, { nope: 1 }] });
    expect(r.events).toHaveLength(2);
    expect(r.skipped).toBe(1);
    expect(r.signals).toHaveLength(1);
    expect(r.from).toBe(events[0].ts);
  });

  it("imports only user text messages from a ChatGPT export", () => {
    const r = importChatGpt(chatgpt);
    expect(r.conversations).toBe(1);
    expect(r.messages).toBe(3);
    expect(r.skipped).toBe(1); // "thanks"
    expect(r.events).toHaveLength(2);
    expect(r.events[0].domains[0].id).toBe("composition");
    expect(r.events[0].actor).toBe("ai");
    expect(r.events[1].domains[0].id).toBe("synthesis");
    expect(r.events.every((e) => e.source === "import-chatgpt")).toBe(true);
    expect(r.from).toBe(new Date(1_758_000_100 * 1000).toISOString());
  });

  it("gives deterministic ids so re-imports do not duplicate", () => {
    const a = importChatGpt(chatgpt).events.map((e) => e.id);
    const b = importChatGpt(chatgpt).events.map((e) => e.id);
    expect(a).toEqual(b);
  });

  it("imports human messages from a Claude export, including content-array messages", () => {
    const r = importClaude(claude);
    expect(r.events).toHaveLength(2);
    expect(r.skipped).toBe(1);
    expect(r.events[0].domains[0].id).toBe("analysis");
    expect(r.events[1].askType).toBe("hint");
    expect(r.events[1].actor).toBe("shared");
  });

  it("can drop excerpts for privacy", () => {
    const r = importClaude(claude, { keepExcerpt: false });
    expect(r.events.every((e) => e.excerpt === undefined)).toBe(true);
  });
});

describe("buildSnapshot", () => {
  it("summarises the ledger and produces nudges", () => {
    const events = [...importChatGpt(chatgpt).events, ...importClaude(claude).events];
    const snap = buildSnapshot(events, DEFAULT_SETTINGS, new Date("2026-09-29T15:00:00Z"));
    expect(snap.states).toHaveLength(11);
    expect(snap.totals.events).toBe(4);
    expect(snap.totals.delegated).toBe(2);
    expect(snap.totals.shared).toBe(2);
    expect(snap.curve.length).toBe(49);
    expect(snap.nudges.length).toBeGreaterThan(0);
    expect(snap.nudges.length).toBeLessThanOrEqual(3);
    expect(snap.weekly.composition).toHaveLength(12);
  });
});
