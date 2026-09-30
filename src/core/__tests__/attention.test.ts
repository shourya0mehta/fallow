import { describe, expect, it } from "vitest";
import { domainOf, matchesSite, summarizeAttention, type AwEvent } from "../attention";

const T = (hhmm: string) => `2026-09-29T${hhmm}:00-04:00`;
const ev = (start: string, minutes: number, data: AwEvent["data"]): AwEvent => ({ timestamp: T(start), duration: minutes * 60, data });

const SITES = ["youtube.com", "reddit.com", "instagram.com"];

describe("helpers", () => {
  it("extracts domains and matches subdomains", () => {
    expect(domainOf("https://www.youtube.com/watch?v=x")).toBe("youtube.com");
    expect(domainOf("not a url")).toBe("");
    expect(matchesSite("m.youtube.com", SITES)).toBe(true);
    expect(matchesSite("docs.google.com", SITES)).toBe(false);
  });
});

describe("summarizeAttention", () => {
  const window: AwEvent[] = [
    ev("09:00", 40, { app: "Code", title: "scheduler.ts" }),
    { timestamp: T("09:40"), duration: 30, data: { app: "Slack", title: "general" } },
    { timestamp: `2026-09-29T09:40:30-04:00`, duration: 49.5 * 60, data: { app: "Code", title: "policy.ts" } },
    ev("10:30", 30, { app: "Google Chrome", title: "Docs" }),
    ev("11:00", 30, { app: "Google Chrome", title: "YouTube" }), // afk, should be dropped
    ev("11:30", 30, { app: "Code", title: "tests" }),
  ];
  const afk: AwEvent[] = [
    ev("09:00", 120, { status: "not-afk" }),
    ev("11:00", 30, { status: "afk" }),
    ev("11:30", 30, { status: "not-afk" }),
  ];
  const web: AwEvent[] = [
    ev("10:30", 15, { url: "https://docs.google.com/document/d/1" }),
    ev("10:45", 15, { url: "https://www.youtube.com/watch?v=abc" }),
  ];

  it("counts active minutes from not-afk time only", () => {
    const s = summarizeAttention({ window, afk, web, entertainmentSites: SITES });
    expect(s.activeMin).toBe(150);
  });

  it("splits browser time by tab domain and counts entertainment minutes", () => {
    const s = summarizeAttention({ window, afk, web, entertainmentSites: SITES });
    expect(s.entertainmentMin).toBe(15);
    expect(s.top.find((t) => t.name.includes("youtube.com"))?.minutes).toBe(15);
  });

  it("merges a brief interruption into one focus block and finds the longest", () => {
    const s = summarizeAttention({ window, afk, web, entertainmentSites: SITES });
    expect(s.longestBlockMin).toBe(90);
    expect(s.focusBlocks.map((b) => b.minutes)).toEqual([90, 30]);
    expect(s.focusBlocks[0].key).toBe("Code");
  });

  it("counts switches per active hour, ignoring returns after a long gap", () => {
    const s = summarizeAttention({ window, afk, web, entertainmentSites: SITES });
    // Code -> Slack, Slack -> Code, Code -> Chrome(docs), docs -> youtube; the return after AFK does not count.
    expect(s.switches).toBe(4);
    expect(s.switchesPerHour).toBeCloseTo(1.6, 1);
  });

  it("falls back to title keywords when no web events exist", () => {
    const s = summarizeAttention({ window: [ev("20:00", 20, { app: "Safari", title: "Cat videos - YouTube" })], entertainmentSites: SITES });
    expect(s.entertainmentMin).toBe(20);
    expect(s.focusBlocks).toHaveLength(0);
  });

  it("handles an empty day", () => {
    const s = summarizeAttention({ window: [], afk: [], entertainmentSites: SITES });
    expect(s.activeMin).toBe(0);
    expect(s.switchesPerHour).toBe(0);
    expect(s.top).toEqual([]);
  });
});
