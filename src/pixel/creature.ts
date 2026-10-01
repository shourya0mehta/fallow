import { Grid } from "./grid";

/**
 * The brain creature as a live rig. Same silhouette as the v0.4 sprite (two
 * lobes, a soft body sitting flat, one fold per side, dot eyes, no mouth), but
 * computed on demand so it can squash, stretch, look around and change mood.
 */
export type Stage = "thriving" | "steady" | "fading" | "fallow";
export type Eyes = "open" | "gleam" | "happy" | "blink" | "tired" | "shut" | "dizzy" | "wide" | "none";

export interface Pose {
  /** horizontal and vertical scale around the base, 1 = rest */
  sx?: number;
  sy?: number;
  eyes?: Eyes;
  /** where the eyes look, -1..1 per axis (1 px of travel) */
  lookX?: number;
  lookY?: number;
  blush?: boolean;
}

export const CREATURE_SIZE = 32;
/** Row the body sits on (feet line) inside the 32x32 grid. */
export const CREATURE_BASE = 23;

const INK = "#2a2124";
const SHINE = "#fff8ef";
const BLUSH = "#ef8b84";

export const CREATURE_COLORS: Record<Stage, { light: string; base: string; shade: string; outline: string }> = {
  thriving: { light: "#ffe3da", base: "#f6a79d", shade: "#dc7b74", outline: "#4b2a2e" },
  steady: { light: "#fbd9d1", base: "#f0a89f", shade: "#d47f78", outline: "#4b2a2e" },
  fading: { light: "#efd9ce", base: "#d9b5ab", shade: "#b58b83", outline: "#4a3331" },
  fallow: { light: "#e4dac6", base: "#c3b296", shade: "#9a8a6c", outline: "#3d342a" },
};

const S = CREATURE_SIZE;

function bodyMask(sx: number, sy: number): boolean[] {
  const m = new Array(S * S).fill(false);
  const base = CREATURE_BASE;
  const cx = 16;
  const tx = (x: number) => cx + (x - cx) * sx;
  const ty = (y: number) => base + (y - base) * sy;
  const ellipse = (ccx: number, ccy: number, rx: number, ry: number) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (((x + 0.5 - ccx) / rx) ** 2 + ((y + 0.5 - ccy) / ry) ** 2 <= 1) m[y * S + x] = true;
  };
  // lobes scale with both axes, so a squash really squashes
  ellipse(tx(12.5), ty(12.5), 6.6 * sx, 6.6 * sy);
  ellipse(tx(19.5), ty(12.5), 6.6 * sx, 6.6 * sy);
  ellipse(tx(16), ty(16.5), 10.2 * sx, 7.0 * sy);
  const floor = Math.round(ty(22.5));
  for (let y = floor + 1; y < S; y++) for (let x = 0; x < S; x++) m[y * S + x] = false;
  for (let yy = 0; yy <= 7; yy++) {
    const y = Math.round(ty(yy));
    if (y >= 0 && y < S) m[y * S + 16] = false;
  }
  return m;
}

const cache = new Map<string, Grid>();

export function creatureGrid(stage: Stage, pose: Pose = {}): Grid {
  const sx = Math.round((pose.sx ?? 1) * 50) / 50;
  const sy = Math.round((pose.sy ?? 1) * 50) / 50;
  const eyes = pose.eyes ?? (stage === "thriving" ? "gleam" : stage === "fading" ? "tired" : stage === "fallow" ? "shut" : "open");
  const lx = Math.max(-1, Math.min(1, Math.round(pose.lookX ?? 0)));
  const ly = Math.max(-1, Math.min(1, Math.round(pose.lookY ?? 0)));
  const blush = pose.blush ?? stage === "thriving";
  const key = `${stage}|${sx}|${sy}|${eyes}|${lx}|${ly}|${blush}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const c = CREATURE_COLORS[stage];
  const g = new Grid(S, S);
  const m = bodyMask(sx, sy);
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && m[y * S + x];
  const cx = 16;
  const cy = 16;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (!m[y * S + x]) continue;
      const edge = !(inside(x + 1, y) && inside(x - 1, y) && inside(x, y + 1) && inside(x, y - 1));
      const diag = ((x + 0.5 - cx) / 10) * 0.9 + (y + 0.5 - cy) / 8;
      let col = c.base;
      if (edge) {
        if (diag < -0.5) col = c.light;
        else if (diag > 0.45) col = c.shade;
      }
      g.set(x, y, col);
    }
  g.outline(c.outline);

  // features move with the squash so the face stays centred on the body
  const fy = (y: number) => Math.round(CREATURE_BASE + (y - CREATURE_BASE) * sy);
  const fx = (x: number) => Math.round(cx + (x - cx) * sx);
  const put = (x: number, y: number, col: string) => {
    const X = fx(x);
    const Y = fy(y);
    if (inside(X, Y)) g.set(X, Y, col);
  };

  if (stage === "fallow") {
    for (const [x, y] of [[6, 15], [7, 16], [7, 17], [8, 18], [23, 7], [24, 8], [24, 9], [25, 10]] as const) put(x, y, c.outline);
  } else {
    for (const [x, y] of [[8, 10], [9, 9], [10, 9]] as const) {
      put(x, y, c.shade);
      put(31 - x, y, c.shade);
    }
  }
  for (const y of [8, 9, 10]) put(16, y, c.shade);

  const ex = lx;
  const ey = ly;
  const L = 11 + ex;
  const R = 19 + ex;
  const T = 14 + ey;
  const dot = (x0: number) => {
    put(x0, T, INK);
    put(x0 + 1, T, INK);
    put(x0, T + 1, INK);
    put(x0 + 1, T + 1, INK);
  };
  switch (eyes) {
    case "open":
      dot(L);
      dot(R);
      break;
    case "gleam":
      dot(L);
      dot(R);
      put(L, T, SHINE);
      put(R, T, SHINE);
      break;
    case "wide":
      for (const x0 of [L, R]) {
        put(x0, T - 1, INK);
        put(x0 + 1, T - 1, INK);
        dot(x0);
        put(x0, T - 1, SHINE);
      }
      break;
    case "happy":
      for (const x0 of [L, R]) {
        put(x0 - 1, T + 1, INK);
        put(x0, T, INK);
        put(x0 + 1, T, INK);
        put(x0 + 2, T + 1, INK);
      }
      break;
    case "blink":
      for (const x0 of [L, R]) {
        put(x0, T + 1, INK);
        put(x0 + 1, T + 1, INK);
      }
      break;
    case "tired":
      for (const x0 of [L, R]) {
        put(x0, T, c.shade);
        put(x0 + 1, T, c.shade);
        put(x0, T + 1, INK);
        put(x0 + 1, T + 1, INK);
      }
      break;
    case "shut":
      for (const x0 of [L, R]) for (let i = -1; i <= 2; i++) put(x0 + i, T + 1, INK);
      break;
    case "none":
      break;
    case "dizzy":
      for (const x0 of [L, R]) {
        put(x0 - 1, T - 1, INK);
        put(x0 + 1, T - 1, INK);
        put(x0, T, INK);
        put(x0 - 1, T + 1, INK);
        put(x0 + 1, T + 1, INK);
      }
      break;
  }
  if (blush) for (const [x, y] of [[9, 16], [10, 16], [21, 16], [22, 16]] as const) put(x, y + ey * 0, BLUSH);

  cache.set(key, g);
  return g;
}
