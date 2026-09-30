import type { Chronotype, LedgerEvent, SleepWindow } from "./types";

/**
 * The budget model: three-process model of alertness plus a fatigue term.
 *
 * Three-process model (Åkerstedt & Folkard 1997; parameters as validated by
 * Ingre et al. 2014 on 136 airline crew and 8,040 sleepiness ratings):
 *
 *   S_wake(t)  = 2.4 + (S_w - 2.4) * exp(-0.0353 t)     decays toward 2.4 while awake
 *   S_sleep(t) = 14.3 - (14.3 - S_s) * exp(-0.381 t)    recovers toward 14.3 while asleep
 *   C(t)       = 2.5 cos(2π (t - p) / 24),  p = 16.8 h by default, shifted by chronotype
 *   U(t)       = 0.5 cos(2π t / 12) - 0.5
 *   W(t)       = -5.72 exp(-1.51 t)                       sleep inertia after waking
 *   Alertness  = S + C + U + W   (roughly 1 to 16)
 *   KSS        ≈ 9.68 - 0.46 * Alertness                  Karolinska Sleepiness Scale, 1 to 9
 *
 * Fatigue term F is a hypothesis drawn from Wiehler et al. 2022 (about six hours
 * of demanding work raised lateral-prefrontal glutamate and shifted choices toward
 * low effort). It is a leaky integrator over minutes of demanding work, recovering
 * with rest. It is not validated and is labelled as such in the UI.
 */

export const LOWER_ASYMPTOTE = 2.4;
export const UPPER_ASYMPTOTE = 14.3;
export const WAKE_DECAY = 0.0353; // per hour
export const SLEEP_RECOVERY = 0.381; // per hour
export const C_AMPLITUDE = 2.5;
export const C_PHASE_DEFAULT = 16.8; // hours
export const U_AMPLITUDE = 0.5;
export const U_MESOR = -0.5;
export const W_START = -5.72;
export const W_DECAY = 1.51; // per hour
export const KSS_A = 9.68;
export const KSS_B = 0.46;

/** Ingre et al. 2014 found about 0.67 h of phase shift per chronotype step. */
export const CHRONOTYPE_SHIFT: Record<Chronotype, number> = {
  morning: -1.3,
  intermediate: 0,
  evening: 0.7,
};

export interface AlertnessPoint {
  /** Clock hour, 0..24, fractional. */
  h: number;
  S: number;
  C: number;
  U: number;
  W: number;
  alertness: number;
  kss: number;
  asleep: boolean;
}

export function parseClock(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`Bad clock time: ${hhmm}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) throw new Error(`Bad clock time: ${hhmm}`);
  return h + min / 60;
}

export function formatClock(h: number): string {
  const total = Math.round(((h % 24) + 24) % 24 * 60);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Hours awake per day for a sleep window; handles bed times after midnight. */
export function wakeHours(sleep: SleepWindow): number {
  const bed = parseClock(sleep.bed);
  const wake = parseClock(sleep.wake);
  const awake = ((bed - wake) % 24 + 24) % 24; // time from waking to bed, going forward
  return awake === 0 ? 24 : awake;
}

function isAsleep(h: number, sleep: SleepWindow): boolean {
  const bed = parseClock(sleep.bed);
  const wake = parseClock(sleep.wake);
  const x = ((h % 24) + 24) % 24;
  if (bed > wake) return x >= bed || x < wake; // e.g. 23:30 to 07:30
  return x >= bed && x < wake; // e.g. 01:00 to 09:00
}

/** Level of S at waking, after the schedule has repeated to steady state. */
export function steadyStateWakeLevel(sleep: SleepWindow): number {
  const awake = wakeHours(sleep);
  const asleep = 24 - awake;
  let sw = UPPER_ASYMPTOTE;
  for (let i = 0; i < 40; i++) {
    const ss = LOWER_ASYMPTOTE + (sw - LOWER_ASYMPTOTE) * Math.exp(-WAKE_DECAY * awake);
    sw = UPPER_ASYMPTOTE - (UPPER_ASYMPTOTE - ss) * Math.exp(-SLEEP_RECOVERY * asleep);
  }
  return sw;
}

export function circadian(h: number, chronotype: Chronotype = "intermediate"): number {
  const p = C_PHASE_DEFAULT + CHRONOTYPE_SHIFT[chronotype];
  return C_AMPLITUDE * Math.cos((2 * Math.PI * (h - p)) / 24);
}

export function ultradian(h: number): number {
  return U_AMPLITUDE * Math.cos((2 * Math.PI * h) / 12) + U_MESOR;
}

export function kssFromAlertness(a: number): number {
  return Math.min(9, Math.max(1, KSS_A - KSS_B * a));
}

export function kssLabel(kss: number): string {
  const k = Math.round(kss);
  if (k <= 2) return "extremely alert";
  if (k === 3) return "alert";
  if (k === 4) return "rather alert";
  if (k === 5) return "neither alert nor sleepy";
  if (k === 6) return "some signs of sleepiness";
  if (k === 7) return "sleepy, no effort to stay awake";
  if (k === 8) return "sleepy, some effort to stay awake";
  return "very sleepy, fighting sleep";
}

/**
 * Alertness at a clock hour for a repeating sleep schedule (steady state).
 */
export function alertnessAt(h: number, sleep: SleepWindow, chronotype: Chronotype = "intermediate"): AlertnessPoint {
  const wake = parseClock(sleep.wake);
  const bed = parseClock(sleep.bed);
  const sw = steadyStateWakeLevel(sleep);
  const awakeHours = wakeHours(sleep);
  const x = ((h % 24) + 24) % 24;
  const asleep = isAsleep(x, sleep);
  let S: number;
  let W = 0;
  if (!asleep) {
    const tAwake = ((x - wake) % 24 + 24) % 24;
    S = LOWER_ASYMPTOTE + (sw - LOWER_ASYMPTOTE) * Math.exp(-WAKE_DECAY * tAwake);
    W = W_START * Math.exp(-W_DECAY * tAwake);
  } else {
    const ss = LOWER_ASYMPTOTE + (sw - LOWER_ASYMPTOTE) * Math.exp(-WAKE_DECAY * awakeHours);
    const tAsleep = ((x - bed) % 24 + 24) % 24;
    S = UPPER_ASYMPTOTE - (UPPER_ASYMPTOTE - ss) * Math.exp(-SLEEP_RECOVERY * tAsleep);
  }
  const C = circadian(x, chronotype);
  const U = ultradian(x);
  const alertness = S + C + U + W;
  return { h: x, S: r2(S), C: r2(C), U: r2(U), W: r2(W), alertness: r2(alertness), kss: r2(kssFromAlertness(alertness)), asleep };
}

export function dayCurve(sleep: SleepWindow, chronotype: Chronotype = "intermediate", stepMinutes = 30): AlertnessPoint[] {
  const out: AlertnessPoint[] = [];
  for (let m = 0; m <= 24 * 60; m += stepMinutes) out.push(alertnessAt(m / 60, sleep, chronotype));
  return out;
}

/** Fatigue: leaky integrator over minutes of demanding work. 0..1. Hypothesis, not validated. */
export const FATIGUE_TAU_MIN = 120; // recovery time constant, minutes of rest
export const FATIGUE_FULL_MIN = 360; // six hours of demanding work saturates it (Wiehler et al. 2022)

export function fatigueLevel(events: LedgerEvent[], now: Date = new Date()): number {
  const nowMs = now.getTime();
  const dayStart = nowMs - 18 * 3_600_000;
  let f = 0;
  for (const e of events) {
    if (!e.demanding || !e.minutes) continue;
    const t = Date.parse(e.ts);
    if (t < dayStart || t > nowMs) continue;
    const endMs = t + e.minutes * 60_000;
    const restMin = Math.max(0, (nowMs - endMs) / 60_000);
    f += (e.minutes / FATIGUE_FULL_MIN) * Math.exp(-restMin / FATIGUE_TAU_MIN);
  }
  return Math.min(1, f);
}

export const FATIGUE_PENALTY = 0.35;

export interface Capacity {
  /** 0..1 */
  value: number;
  alertness: number;
  kss: number;
  fatigue: number;
  asleep: boolean;
}

export function capacityAt(now: Date, sleep: SleepWindow, chronotype: Chronotype, events: LedgerEvent[]): Capacity {
  const h = now.getHours() + now.getMinutes() / 60;
  const a = alertnessAt(h, sleep, chronotype);
  const fatigue = fatigueLevel(events, now);
  const base = Math.min(1, Math.max(0, (a.alertness - 1) / 15));
  const value = a.asleep ? 0 : r2(base * (1 - FATIGUE_PENALTY * fatigue));
  return { value, alertness: a.alertness, kss: a.kss, fatigue: r2(fatigue), asleep: a.asleep };
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
