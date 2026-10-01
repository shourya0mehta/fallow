/**
 * Pointer gestures on the pet, kept pure so they can be tested.
 *
 * Taps fire immediately (so a single click feels instant) and are upgraded:
 * a second click inside DOUBLE_MS becomes a double, four clicks inside
 * RAPID_WINDOW_MS become "rapid" (the pet gets dizzy).
 */
export type ClickKind = "tap" | "double" | "rapid";

export const DOUBLE_MS = 340;
export const RAPID_WINDOW_MS = 1500;
export const RAPID_COUNT = 4;
export const HOLD_MS = 280;

export function classifyClick(recent: number[], now: number): { kind: ClickKind; recent: number[] } {
  const kept = recent.filter((t) => now - t <= RAPID_WINDOW_MS);
  kept.push(now);
  if (kept.length >= RAPID_COUNT) return { kind: "rapid", recent: [] };
  const prev = kept.length >= 2 ? kept[kept.length - 2] : null;
  if (prev !== null && now - prev <= DOUBLE_MS) return { kind: "double", recent: kept };
  return { kind: "tap", recent: kept };
}

/**
 * Rubbing: moving the pointer back and forth across the pet. Counts direction
 * reversals of horizontal movement inside a short window.
 */
export class RubDetector {
  private lastX: number | null = null;
  private dir = 0;
  private reversals: number[] = [];

  constructor(
    private readonly windowMs = 900,
    private readonly needed = 3,
    private readonly minStep = 1.5,
  ) {}

  /** Feed a pointer x (any unit) and time; returns true when a rub completes. */
  feed(x: number, t: number): boolean {
    if (this.lastX === null) {
      this.lastX = x;
      return false;
    }
    const dx = x - this.lastX;
    if (Math.abs(dx) < this.minStep) return false;
    const d = Math.sign(dx);
    if (this.dir !== 0 && d !== this.dir) this.reversals.push(t);
    this.dir = d;
    this.lastX = x;
    this.reversals = this.reversals.filter((r) => t - r <= this.windowMs);
    if (this.reversals.length >= this.needed) {
      this.reversals = [];
      return true;
    }
    return false;
  }

  reset(): void {
    this.lastX = null;
    this.dir = 0;
    this.reversals = [];
  }
}
