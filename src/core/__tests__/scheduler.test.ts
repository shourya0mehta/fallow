import { describe, expect, it } from "vitest";
import { DECAY_W, FACTOR, daysUntil, deriveDomainStates, nextStability, retrievability, statusFor } from "../scheduler";
import type { LedgerEvent } from "../types";

const NOW = new Date("2026-09-29T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

function ev(partial: Partial<LedgerEvent> & Pick<LedgerEvent, "ts" | "actor">): LedgerEvent {
  return {
    id: Math.random().toString(16).slice(2),
    source: "manual",
    domains: [{ id: "composition", weight: 1 }],
    icap: partial.actor === "ai" ? "passive" : "constructive",
    askType: partial.actor === "ai" ? "answer" : "other",
    ...partial,
  };
}

describe("retrievability", () => {
  it("is 1 at time zero and 0.9 at one stability", () => {
    expect(retrievability(0, 14)).toBe(1);
    expect(retrievability(14, 14)).toBeCloseTo(0.9, 6);
  });

  it("follows the FSRS power law", () => {
    const t = 40;
    const s = 14;
    expect(retrievability(t, s)).toBeCloseTo(Math.pow(1 + (FACTOR * t) / s, -DECAY_W), 10);
  });

  it("is monotone in time and never negative", () => {
    let prev = 1;
    for (let t = 0; t < 400; t += 7) {
      const r = retrievability(t, 30);
      expect(r).toBeLessThanOrEqual(prev);
      expect(r).toBeGreaterThan(0);
      prev = r;
    }
  });

  it("inverts through daysUntil", () => {
    const s = 21;
    const t = daysUntil(0.7, s);
    expect(retrievability(t, s)).toBeCloseTo(0.7, 6);
  });

  it("is 1 for a domain with infinite stability", () => {
    expect(retrievability(1000, Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe("nextStability", () => {
  it("grows more for a harder review and for higher engagement", () => {
    const easy = nextStability(14, { icap: "active", r: 0.95, weight: 1 });
    const hard = nextStability(14, { icap: "active", r: 0.6, weight: 1 });
    const interactive = nextStability(14, { icap: "interactive", r: 0.6, weight: 1 });
    expect(hard).toBeGreaterThan(easy);
    expect(interactive).toBeGreaterThan(hard);
    expect(easy).toBeGreaterThan(14);
  });

  it("caps stability and scales with classification weight", () => {
    expect(nextStability(360, { icap: "interactive", r: 0.5, weight: 1 })).toBe(365);
    const full = nextStability(14, { icap: "active", r: 0.8, weight: 1 });
    const half = nextStability(14, { icap: "active", r: 0.8, weight: 0.5 });
    expect(half - 14).toBeCloseTo((full - 14) / 2, 6);
  });
});

describe("statusFor", () => {
  it("maps retrievability bands to statuses", () => {
    expect(statusFor(0.95, true)).toBe("fresh");
    expect(statusFor(0.75, true)).toBe("fading");
    expect(statusFor(0.6, true)).toBe("stale");
    expect(statusFor(0.3, true)).toBe("fallow");
    expect(statusFor(0.99, false)).toBe("fallow");
  });
});

describe("deriveDomainStates", () => {
  it("marks a domain fallow when only delegations exist", () => {
    const events = [ev({ ts: daysAgo(40), actor: "ai" }), ev({ ts: daysAgo(3), actor: "ai" })];
    const comp = deriveDomainStates(events, NOW).find((s) => s.id === "composition")!;
    expect(comp.status).toBe("fallow");
    expect(comp.daysFallow).toBeNull();
    expect(comp.delegatedCount30d).toBe(1);
    expect(comp.selfCount30d).toBe(0);
    expect(comp.retrievability).toBeLessThan(0.9);
  });

  it("refreshes a domain after self-done work and counts it", () => {
    const events = [ev({ ts: daysAgo(40), actor: "ai" }), ev({ ts: daysAgo(1), actor: "self", minutes: 30 })];
    const comp = deriveDomainStates(events, NOW).find((s) => s.id === "composition")!;
    expect(comp.status).toBe("fresh");
    expect(comp.daysFallow).toBe(1);
    expect(comp.selfCount30d).toBe(1);
    expect(comp.stability).toBeGreaterThan(14);
  });

  it("lets a practiced domain decay with time", () => {
    const events = [ev({ ts: daysAgo(90), actor: "self" })];
    const comp = deriveDomainStates(events, NOW).find((s) => s.id === "composition")!;
    expect(comp.retrievability).toBeLessThan(0.75);
    expect(["stale", "fallow"]).toContain(comp.status);
  });

  it("never lets attention decay (tracked from fragmentation instead)", () => {
    const att = deriveDomainStates([], NOW).find((s) => s.id === "attention")!;
    expect(att.retrievability).toBe(1);
  });
});
