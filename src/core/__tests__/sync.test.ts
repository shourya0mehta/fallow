import { describe, expect, it } from "vitest";
import { creatureStage, hasNoHistory } from "../creature";
import { emptyLedger, type Ledger } from "../ledger";
import { deriveDomainStates } from "../scheduler";
import { bucketCount, bucketize, forUpload, mergeGardens, monthOf, type RemoteGarden } from "../sync";
import type { AttentionDaySignal, LedgerEvent } from "../types";

function ev(id: string, ts: string, extra: Partial<LedgerEvent> = {}): LedgerEvent {
  return { id, ts, source: "gate", domains: [{ id: "composition", weight: 1 }], icap: "active", askType: "answer", actor: "ai", excerpt: `ask ${id}`, ...extra };
}

function ledger(events: LedgerEvent[], patch: Partial<Ledger["settings"]> = {}): Ledger {
  const l = emptyLedger();
  l.events = events;
  l.settings = { ...l.settings, ...patch };
  return l;
}

const EMPTY_REMOTE: RemoteGarden = { settings: null, settingsAt: 0, months: {} };

describe("sync helpers", () => {
  it("buckets by UTC month", () => {
    expect(monthOf("2026-09-30T23:59:59.000Z")).toBe("2026-09");
    expect(monthOf("2026-10-01T00:00:00.000Z")).toBe("2026-10");
    expect(monthOf("not a date")).toBe("1970-01");
    const b = bucketize([ev("a", "2026-09-02T10:00:00Z"), ev("b", "2026-10-02T10:00:00Z"), ev("c", "2026-10-05T10:00:00Z")], []);
    expect(Object.keys(b).sort()).toEqual(["2026-09", "2026-10"]);
    expect(b["2026-10"].events.map((e) => e.id)).toEqual(["b", "c"]);
    expect(bucketCount(b)).toBe(3);
  });

  it("keeps ask text on the device unless text sync is on, and drops undefined fields", () => {
    const e = ev("a", "2026-09-02T10:00:00Z", { conversationId: undefined });
    const off = forUpload(e, false);
    expect(off.excerpt).toBeUndefined();
    expect("conversationId" in off).toBe(false);
    expect(forUpload(e, true).excerpt).toBe("ask a");
  });
});

describe("mergeGardens", () => {
  it("never uploads the demo, and a new account starts empty with default settings", () => {
    const demo = ledger([ev("d1", "2026-08-01T10:00:00Z")], { keepList: ["recall"] });
    const r = mergeGardens({ local: demo, localIsDemo: true, localSettingsAt: 0, remote: EMPTY_REMOTE, now: 1000 });
    expect(r.ledger.events).toEqual([]);
    expect(bucketCount(r.upload)).toBe(0);
    expect(r.uploadSettings).toBe(true);
    expect(r.ledger.settings.keepList).toEqual(emptyLedger().settings.keepList);
  });

  it("keeps the demo's sample asks home but sends up the ones the visitor logged on it", () => {
    const demo = ledger([ev("d1", "2026-08-01T10:00:00Z"), ev("mine", "2026-09-30T10:00:00Z")]);
    const r = mergeGardens({ local: demo, localIsDemo: true, demoOwn: ["mine"], localSettingsAt: 0, remote: EMPTY_REMOTE });
    expect(r.ledger.events.map((e) => e.id)).toEqual(["mine"]);
    expect(r.upload["2026-09"].events.map((e) => e.id)).toEqual(["mine"]);
    expect(bucketCount(r.upload)).toBe(1);
  });

  it("swaps the demo for the account's garden on sign-in", () => {
    const demo = ledger([ev("d1", "2026-08-01T10:00:00Z")]);
    const remote: RemoteGarden = { settings: { ...emptyLedger().settings, intensity: "firm" }, settingsAt: 50, months: { "2026-09": { events: { r1: ev("r1", "2026-09-03T10:00:00Z", { excerpt: undefined }) } } } };
    const r = mergeGardens({ local: demo, localIsDemo: true, localSettingsAt: 0, remote });
    expect(r.ledger.events.map((e) => e.id)).toEqual(["r1"]);
    expect(r.ledger.settings.intensity).toBe("firm");
    expect(r.uploadSettings).toBe(false);
    expect(r.added).toBe(1);
  });

  it("uploads a local garden to an empty account", () => {
    const mine = ledger([ev("a", "2026-09-02T10:00:00Z"), ev("b", "2026-10-02T10:00:00Z")]);
    const r = mergeGardens({ local: mine, localIsDemo: false, localSettingsAt: 10, remote: EMPTY_REMOTE });
    expect(bucketCount(r.upload)).toBe(2);
    expect(r.uploadSettings).toBe(true);
    expect(r.settingsAt).toBe(10);
  });

  it("unions two devices by id, keeps local text, and applies tombstones", () => {
    const mine = ledger([ev("a", "2026-09-02T10:00:00Z"), ev("b", "2026-09-03T10:00:00Z"), ev("gone", "2026-09-04T10:00:00Z")]);
    const remote: RemoteGarden = {
      settings: null,
      settingsAt: 0,
      months: {
        "2026-09": {
          events: { a: ev("a", "2026-09-02T10:00:00Z", { excerpt: undefined }), c: ev("c", "2026-09-05T10:00:00Z", { excerpt: undefined }) },
          deleted: { gone: true },
        },
      },
    };
    const r = mergeGardens({ local: mine, localIsDemo: false, localSettingsAt: 5, remote });
    expect(r.ledger.events.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(r.ledger.events.find((e) => e.id === "a")?.excerpt).toBe("ask a");
    expect(r.upload["2026-09"].events.map((e) => e.id)).toEqual(["b"]);
    expect(r.added).toBe(1);
    expect(r.removed).toBe(1);
  });

  it("settings: the newer side wins", () => {
    const mine = ledger([], { intensity: "gentle" });
    const remote: RemoteGarden = { settings: { ...emptyLedger().settings, intensity: "firm" }, settingsAt: 100, months: {} };
    expect(mergeGardens({ local: mine, localIsDemo: false, localSettingsAt: 200, remote }).ledger.settings.intensity).toBe("gentle");
    expect(mergeGardens({ local: mine, localIsDemo: false, localSettingsAt: 50, remote }).ledger.settings.intensity).toBe("firm");
  });

  it("attention summaries for the same day keep the newer copy", () => {
    const day = (ts: string, activeMin: number): AttentionDaySignal => ({ id: "att-0930", ts, kind: "attention-day", day: "2026-09-30", activeMin, switchesPerHour: 10, longestBlockMin: 30, entertainmentMin: 20, top: [] });
    const mine = ledger([]);
    mine.signals = [day("2026-09-30T20:00:00.000Z", 300)];
    const remote: RemoteGarden = { settings: null, settingsAt: 0, months: { "2026-09": { signals: { "att-0930": day("2026-09-30T18:00:00.000Z", 200) } } } };
    const r = mergeGardens({ local: mine, localIsDemo: false, localSettingsAt: 0, remote });
    expect(r.ledger.signals).toHaveLength(1);
    expect((r.ledger.signals[0] as AttentionDaySignal).activeMin).toBe(300);
    expect(r.upload["2026-09"].signals).toHaveLength(1);
  });
});

describe("a brand-new garden", () => {
  it("shows sprouts and a steady Shumbo instead of a cracked one", () => {
    const now = new Date("2026-10-01T15:00:00Z");
    const states = deriveDomainStates([], now);
    expect(states.every(hasNoHistory)).toBe(true);
    const r = creatureStage({ states, keepList: ["composition"], drift: {}, capacity: 0.7 });
    expect(r.stage).toBe("steady");
    expect(r.reasons[0]).toMatch(/brand-new/);
  });

  it("a domain only ever handed off still counts against him", () => {
    const now = new Date("2026-10-01T15:00:00Z");
    const states = deriveDomainStates([ev("x", "2026-09-30T10:00:00Z")], now);
    const comp = states.find((s) => s.id === "composition")!;
    expect(hasNoHistory(comp)).toBe(false);
  });
});
