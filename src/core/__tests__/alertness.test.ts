import { describe, expect, it } from "vitest";
import {
  alertnessAt,
  capacityAt,
  dayCurve,
  fatigueLevel,
  formatClock,
  kssFromAlertness,
  parseClock,
  steadyStateWakeLevel,
  wakeHours,
} from "../alertness";
import type { LedgerEvent } from "../types";

const SLEEP = { bed: "23:30", wake: "07:30" };

describe("clock helpers", () => {
  it("parses and formats", () => {
    expect(parseClock("23:30")).toBe(23.5);
    expect(parseClock("07:05")).toBeCloseTo(7.0833, 3);
    expect(formatClock(13.5)).toBe("13:30");
    expect(formatClock(24)).toBe("00:00");
    expect(() => parseClock("25:00")).toThrow();
  });

  it("computes hours awake across midnight", () => {
    expect(wakeHours(SLEEP)).toBe(16);
    expect(wakeHours({ bed: "01:00", wake: "09:00" })).toBe(16);
  });
});

describe("three-process model", () => {
  it("reaches the published steady state for a 16 h day", () => {
    // Iterating the published constants gives S at waking of about 14.05.
    expect(steadyStateWakeLevel(SLEEP)).toBeCloseTo(14.05, 1);
  });

  it("decays S toward 2.4 while awake and recovers toward 14.3 asleep", () => {
    const morning = alertnessAt(8, SLEEP);
    const night = alertnessAt(23, SLEEP);
    expect(morning.S).toBeGreaterThan(night.S);
    expect(night.S).toBeGreaterThan(2.4);
    const deepSleep = alertnessAt(4, SLEEP);
    expect(deepSleep.asleep).toBe(true);
    expect(deepSleep.S).toBeGreaterThan(night.S);
    expect(deepSleep.S).toBeLessThan(14.3);
  });

  it("applies sleep inertia right after waking and clears it within two hours", () => {
    expect(alertnessAt(7.5, SLEEP).W).toBeCloseTo(-5.72, 2);
    expect(Math.abs(alertnessAt(9.5, SLEEP).W)).toBeLessThan(0.3);
  });

  it("peaks in the early afternoon and loses about a third by bedtime", () => {
    const curve = dayCurve(SLEEP, "intermediate", 30).filter((p) => !p.asleep);
    const peak = curve.reduce((m, p) => (p.alertness > m.alertness ? p : m), curve[0]);
    expect(peak.h).toBeGreaterThanOrEqual(12.5);
    expect(peak.h).toBeLessThanOrEqual(14.5);
    const last = curve.at(-1)!;
    expect(last.alertness / peak.alertness).toBeLessThan(0.7);
    expect(last.alertness / peak.alertness).toBeGreaterThan(0.55);
  });

  it("shifts the circadian peak earlier for morning types", () => {
    const m = dayCurve(SLEEP, "morning", 15).filter((p) => !p.asleep);
    const e = dayCurve(SLEEP, "evening", 15).filter((p) => !p.asleep);
    const peakOf = (c: typeof m) => c.reduce((a, p) => (p.C > a.C ? p : a), c[0]).h;
    expect(peakOf(m)).toBeLessThan(peakOf(e));
  });

  it("maps alertness to the 1 to 9 KSS range", () => {
    expect(kssFromAlertness(13.3)).toBeCloseTo(3.56, 1);
    expect(kssFromAlertness(0)).toBe(9);
    expect(kssFromAlertness(30)).toBe(1);
  });
});

describe("fatigue and capacity", () => {
  const now = new Date("2026-09-29T17:00:00");
  const demanding = (hoursAgo: number, minutes: number): LedgerEvent => ({
    id: `d${hoursAgo}`,
    ts: new Date(now.getTime() - hoursAgo * 3_600_000).toISOString(),
    source: "manual",
    domains: [{ id: "analysis", weight: 1 }],
    icap: "constructive",
    askType: "other",
    actor: "self",
    minutes,
    demanding: true,
  });

  it("is zero with no demanding work and saturates near six hours", () => {
    expect(fatigueLevel([], now)).toBe(0);
    const heavy = [demanding(6, 120), demanding(4, 120), demanding(2, 120), demanding(1, 60)];
    expect(fatigueLevel(heavy, now)).toBeGreaterThan(0.6);
    expect(fatigueLevel(heavy, now)).toBeLessThanOrEqual(1);
  });

  it("recovers with rest", () => {
    const recent = [demanding(1, 60)];
    const older = [demanding(6, 60)];
    expect(fatigueLevel(older, now)).toBeLessThan(fatigueLevel(recent, now));
  });

  it("reports zero capacity while asleep and lower capacity when fatigued", () => {
    const asleep = capacityAt(new Date("2026-09-29T03:00:00"), SLEEP, "intermediate", []);
    expect(asleep.asleep).toBe(true);
    expect(asleep.value).toBe(0);
    const fresh = capacityAt(now, SLEEP, "intermediate", []);
    const tired = capacityAt(now, SLEEP, "intermediate", [demanding(2, 180), demanding(5, 180)]);
    expect(tired.value).toBeLessThan(fresh.value);
    expect(fresh.value).toBeGreaterThan(0.5);
  });
});
