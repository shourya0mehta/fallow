import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../store";
import { attentionSummary, buildSnapshot, driftByDomain, pauseSummary } from "../summary";
import { localDateKey } from "../time";
import type { LedgerEvent, Signal } from "../types";

const NOW = new Date("2026-09-29T15:00:00");
const daysAgo = (d: number, hour = 12) => {
  const t = new Date(NOW.getTime() - d * 86_400_000);
  t.setHours(hour, 0, 0, 0);
  return t.toISOString();
};

function ask(d: number, actor: "ai" | "self", n = 0): LedgerEvent {
  return { id: `e${d}-${actor}-${n}`, ts: daysAgo(d, 9 + n), source: "seed", domains: [{ id: "planning", weight: 1 }], icap: actor === "ai" ? "passive" : "constructive", askType: actor === "ai" ? "answer" : "other", actor };
}

describe("driftByDomain", () => {
  it("flags a domain whose delegated share rose three weeks running", () => {
    const events: LedgerEvent[] = [];
    // Weeks 1..4 ago (oldest first): shares 0/4, 1/4, 2/4, 3/4 delegated.
    const weeks = [
      { ago: 24, delegated: 0 },
      { ago: 17, delegated: 1 },
      { ago: 10, delegated: 2 },
      { ago: 3, delegated: 3 },
    ];
    for (const w of weeks) {
      for (let i = 0; i < 4; i++) events.push(ask(w.ago, i < w.delegated ? "ai" : "self", i));
    }
    const drift = driftByDomain(events, NOW);
    expect(drift.planning).toBe("rising");
    expect(drift.composition).toBe("unknown");
  });

  it("stays flat when the share wobbles", () => {
    const events: LedgerEvent[] = [];
    const weeks = [
      { ago: 24, delegated: 2 },
      { ago: 17, delegated: 3 },
      { ago: 10, delegated: 1 },
      { ago: 3, delegated: 2 },
    ];
    for (const w of weeks) for (let i = 0; i < 4; i++) events.push(ask(w.ago, i < w.delegated ? "ai" : "self", i));
    expect(driftByDomain(events, NOW).planning).toBe("flat");
  });
});

describe("pause and attention summaries", () => {
  const today = localDateKey(NOW);
  const signals: Signal[] = [
    { id: "p1", ts: daysAgo(0, 10), kind: "pause", site: "youtube.com", outcome: "closed", waitedSeconds: 5 },
    { id: "p2", ts: daysAgo(0, 11), kind: "pause", site: "youtube.com", outcome: "continued", waitedSeconds: 10 },
    { id: "p3", ts: daysAgo(3, 20), kind: "pause", site: "reddit.com", outcome: "continued", waitedSeconds: 10 },
    { id: "p4", ts: daysAgo(12, 20), kind: "pause", site: "reddit.com", outcome: "closed", waitedSeconds: 3 },
    { id: "a1", ts: daysAgo(0, 0), kind: "attention-day", day: today, activeMin: 400, switchesPerHour: 9.5, longestBlockMin: 48, entertainmentMin: 70, top: [{ name: "Code", minutes: 200 }] },
    { id: "a2", ts: daysAgo(1, 0), kind: "attention-day", day: localDateKey(new Date(NOW.getTime() - 86_400_000)), activeMin: 380, switchesPerHour: 12, longestBlockMin: 30, entertainmentMin: 40, top: [] },
  ];

  it("counts today's pauses and the week's close rate", () => {
    const p = pauseSummary(signals, NOW);
    expect(p.todayOpens).toBe(2);
    expect(p.todayClosed).toBe(1);
    expect(p.weekOpens).toBe(3);
    expect(p.closeRate7d).toBeCloseTo(0.33, 2);
    expect(p.sitesToday).toEqual([{ site: "youtube.com", opens: 2 }]);
  });

  it("returns today's attention and the week's series", () => {
    const a = attentionSummary(signals, DEFAULT_SETTINGS, NOW);
    expect(a.today?.longestBlockMin).toBe(48);
    expect(a.week).toHaveLength(2);
    expect(a.budgetMin).toBe(60);
  });

  it("threads signals through the snapshot", () => {
    const snap = buildSnapshot([], DEFAULT_SETTINGS, NOW, signals);
    expect(snap.pause.todayOpens).toBe(2);
    expect(snap.attention.today?.entertainmentMin).toBe(70);
    expect(snap.drift.planning).toBe("unknown");
  });
});
