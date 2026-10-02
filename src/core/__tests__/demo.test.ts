import { describe, expect, it } from "vitest";
import demoJson from "../../data/demo.json";
import { DEMO_ASKS } from "../../data/demo-asks";
import { classifyPrompt } from "../classify";
import { localizeDemo } from "../demo";
import { actorFor } from "../events";
import { normalizeLedger } from "../ledger";
import { deriveDomainStates } from "../scheduler";
import { localDateKey } from "../time";

const demo = normalizeLedger(demoJson as never);

describe("the demo's asks", () => {
  it("each files under the plant it was written for, on the right side of the ledger", () => {
    for (const [plant, bank] of Object.entries(DEMO_ASKS)) {
      for (const text of bank.ai) {
        const c = classifyPrompt(text);
        expect([text, c.domains.map((d) => d.id)]).toEqual([text, [plant]]);
        expect([text, actorFor(c)]).toEqual([text, "ai"]);
      }
      for (const text of bank.shared) {
        const c = classifyPrompt(text);
        expect([text, c.domains.map((d) => d.id)]).toEqual([text, [plant]]);
        expect([text, actorFor(c)]).toEqual([text, "shared"]);
      }
    }
  });

  it("read as proper sentences", () => {
    for (const e of demo.events) {
      const t = e.excerpt ?? "";
      if (t.startsWith("Practice: ")) continue;
      expect(t, t).toMatch(/^[A-Z].*[.?!]$/);
    }
  });
});

describe("localizeDemo", () => {
  const now = new Date(2026, 10, 20, 15, 30); // a visitor's afternoon, weeks after the demo was written

  it("makes the demo's last day today and keeps every clock time", () => {
    const l = localizeDemo(demo, now);
    const last = l.events.reduce((m, e) => Math.max(m, Date.parse(e.ts)), 0);
    expect(localDateKey(new Date(last))).toBe(localDateKey(now));
    const original = new Map(demo.events.map((e) => [e.id, new Date(e.ts)]));
    for (const e of l.events) {
      const was = original.get(e.id)!;
      const is = new Date(e.ts);
      expect([is.getHours(), is.getMinutes()]).toEqual([was.getUTCHours(), was.getUTCMinutes()]);
    }
  });

  it("leaves out anything later than now, and dates the screen summaries", () => {
    const l = localizeDemo(demo, now);
    expect(l.events.every((e) => Date.parse(e.ts) <= now.getTime())).toBe(true);
    expect(l.signals.every((s) => Date.parse(s.ts) <= now.getTime())).toBe(true);
    const days = l.signals.flatMap((s) => (s.kind === "attention-day" ? [s.day] : []));
    expect(days).toContain(localDateKey(now));
  });

  it("shows every condition at once: fresh, fading, stale and fallow", () => {
    const l = localizeDemo(demo, now);
    const statuses = new Set(deriveDomainStates(l.events, now).map((s) => s.status));
    expect([...statuses].sort()).toEqual(["fading", "fallow", "fresh", "stale"]);
  });
});
