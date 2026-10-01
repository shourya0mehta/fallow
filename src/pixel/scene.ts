import { Grid, rng } from "./grid";
import { PLANT_H, PLANT_W } from "./plants";

export type TimeOfDay = "dawn" | "day" | "dusk" | "night";

export function timeOfDay(d: Date): TimeOfDay {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 5.5 && h < 8) return "dawn";
  if (h >= 8 && h < 17.5) return "day";
  if (h >= 17.5 && h < 20.5) return "dusk";
  return "night";
}

export interface Slot {
  /** plant centre x and soil line y, in logical pixels */
  x: number;
  y: number;
}

export interface Layout {
  W: number;
  H: number;
  scale: number;
  slots: Slot[];
  beds: Array<{ y: number; x0: number; x1: number }>;
  /** the line the creature walks on */
  groundY: number;
  minX: number;
  maxX: number;
}

const SLOT = 20;

/** Fit the garden to a CSS width: one long bed on wide screens, two on phones. */
export function layoutGarden(cssWidth: number, count = 11): Layout {
  const scale = cssWidth >= 900 ? Math.max(3, Math.min(5, Math.floor(cssWidth / 240))) : cssWidth >= 560 ? 3 : 2;
  const W = Math.max(120, Math.floor(cssWidth / scale));
  const maxCols = Math.max(1, Math.min(count, Math.floor((W - 12) / SLOT)));
  const rows = Math.ceil(count / maxCols);
  const cols = Math.ceil(count / rows);
  const skyTop = 30;
  const rowGap = PLANT_H + 10;
  const slots: Slot[] = [];
  const beds: Layout["beds"] = [];
  let i = 0;
  for (let r = 0; r < rows; r++) {
    const n = Math.min(cols, count - i);
    const span = n * SLOT;
    const x0 = Math.floor((W - span) / 2);
    const y = skyTop + PLANT_H + r * rowGap;
    beds.push({ y, x0: x0 - 4, x1: x0 + span + 4 });
    for (let c = 0; c < n; c++, i++) slots.push({ x: x0 + c * SLOT + SLOT / 2, y });
  }
  const groundY = beds[beds.length - 1].y + (rows > 1 ? 30 : 28);
  return { W, H: groundY + 6, scale, slots, beds, groundY, minX: 14, maxX: W - 14 };
}

interface Palette {
  sky: string[];
  hillFar: string;
  hillNear: string;
  fence: [string, string];
  grass: [string, string, string];
  soil: [string, string];
  board: [string, string, string];
  overlay: string | null;
}

export const SKY: Record<TimeOfDay, Palette> = {
  dawn: {
    sky: ["#f4a68a", "#f8c09a", "#fbd6ac", "#fde6c4"],
    hillFar: "#a7c48e",
    hillNear: "#86b06a",
    fence: ["#c99b6c", "#8f6440"],
    grass: ["#8cc56a", "#76b058", "#5d9446"],
    soil: ["#8a5d3c", "#6e4529"],
    board: ["#d29a62", "#a8713f", "#6f4423"],
    overlay: "rgba(255, 170, 120, 0.08)",
  },
  day: {
    sky: ["#6fc0ee", "#8dd0f3", "#ade0f7", "#cdeefb"],
    hillFar: "#9fd47e",
    hillNear: "#79bf5c",
    fence: ["#d9ab78", "#9a6c44"],
    grass: ["#8fd16a", "#77ba56", "#5c9c44"],
    soil: ["#8a5d3c", "#6e4529"],
    board: ["#d9a066", "#ad7742", "#704525"],
    overlay: null,
  },
  dusk: {
    sky: ["#5b4f9e", "#9a6aa8", "#e58f8a", "#f7c08a"],
    hillFar: "#7d9a78",
    hillNear: "#5f8a58",
    fence: ["#b98a62", "#7d5636"],
    grass: ["#79b05c", "#65984c", "#4f7d3c"],
    soil: ["#7a5236", "#5e3c25"],
    board: ["#c48d5a", "#94633a", "#5e3b20"],
    overlay: "rgba(90, 60, 140, 0.16)",
  },
  night: {
    sky: ["#0f1530", "#17204a", "#212e5e", "#2e3d70"],
    hillFar: "#2c4a46",
    hillNear: "#23403a",
    fence: ["#6b5340", "#4a372a"],
    grass: ["#3f6a4c", "#33593f", "#284834"],
    soil: ["#4f3a2c", "#3c2b20"],
    board: ["#7d5a3c", "#5f432c", "#3d2a1b"],
    overlay: "rgba(18, 24, 64, 0.34)",
  },
};

/**
 * The still part of the scene: sky bands, hills, fence, beds and grass.
 * Drawn once per layout and time of day, then blitted every frame.
 */
export function backdrop(L: Layout, tod: TimeOfDay): Grid {
  const P = SKY[tod];
  const g = new Grid(L.W, L.H);
  const r = rng(L.W * 31 + L.H);
  const horizon = L.beds[0].y - PLANT_H + 16;
  // sky with dithered band edges
  const bandH = Math.ceil(horizon / P.sky.length);
  for (let y = 0; y < horizon; y++) {
    const b = Math.min(P.sky.length - 1, Math.floor(y / bandH));
    const next = Math.min(P.sky.length - 1, b + 1);
    const edge = (y % bandH) >= bandH - 2;
    for (let x = 0; x < L.W; x++) g.set(x, y, edge && (x + y) % 2 === 0 ? P.sky[next] : P.sky[b]);
  }
  // hills
  for (let x = 0; x < L.W; x++) {
    const far = Math.round(horizon - 10 + Math.sin(x / 23) * 4 + Math.sin(x / 9 + 1) * 1.5);
    for (let y = far; y < horizon + 4; y++) g.set(x, y, P.hillFar);
    const near = Math.round(horizon - 2 + Math.sin(x / 17 + 2) * 3);
    for (let y = near; y < L.H; y++) g.set(x, y, P.hillNear);
  }
  // fence behind the first bed
  const fy = L.beds[0].y - 14;
  for (let x = 0; x < L.W; x++) {
    g.set(x, fy, P.fence[0]);
    g.set(x, fy + 1, P.fence[1]);
    g.set(x, fy + 6, P.fence[0]);
    g.set(x, fy + 7, P.fence[1]);
  }
  for (let x = 4; x < L.W; x += 14) {
    for (let y = fy - 3; y < fy + 12; y++) {
      g.set(x, y, P.fence[0]);
      g.set(x + 1, y, P.fence[1]);
    }
    g.set(x, fy - 4, P.fence[1]);
  }
  // grass everywhere below the horizon line of the first bed
  for (let y = L.beds[0].y - 4; y < L.H; y++)
    for (let x = 0; x < L.W; x++) {
      const n = r();
      g.set(x, y, n < 0.035 ? P.grass[2] : n < 0.11 ? P.grass[0] : P.grass[1]);
    }
  // beds: soil with a wooden front board
  for (const b of L.beds) {
    for (let y = b.y - 3; y <= b.y; y++)
      for (let x = b.x0; x < b.x1; x++) g.set(x, y, (x * 7 + y * 3) % 11 === 0 ? P.soil[1] : P.soil[0]);
    for (let y = b.y + 1; y <= b.y + 6; y++)
      for (let x = b.x0 - 1; x <= b.x1; x++) {
        let c = P.board[1];
        if (y === b.y + 1) c = P.board[0];
        if (y === b.y + 6 || x === b.x0 - 1 || x === b.x1) c = P.board[2];
        if ((x - b.x0) % 24 === 23) c = P.board[2];
        g.set(x, y, c);
      }
    // nail heads
    for (let x = b.x0 + 3; x < b.x1; x += 24) g.set(x, b.y + 3, P.board[2]);
  }
  // tufts and tiny flowers in the foreground
  for (let i = 0; i < L.W / 6; i++) {
    const x = Math.floor(r() * L.W);
    const y = L.groundY - 8 + Math.floor(r() * 12);
    if (L.beds.some((b) => y >= b.y - 4 && y <= b.y + 7 && x >= b.x0 - 2 && x <= b.x1 + 2)) continue;
    g.set(x, y, P.grass[2]);
    g.set(x + 1, y - 1, P.grass[2]);
    g.set(x + 2, y, P.grass[2]);
    if (tod !== "night" && r() < 0.25) {
      g.set(x + 1, y - 2, r() < 0.5 ? "#fff3a6" : "#ffd0e0");
    }
  }
  return g;
}

/** Soil cracks under a fallow plant, and a darker damp patch under a fresh one. */
export function soilPatch(g: Grid, status: string, x: number, y: number) {
  const left = Math.round(x - PLANT_W / 2) + 1;
  if (status === "fallow" || status === "stale") {
    for (let i = 0; i < PLANT_W - 2; i++) for (let j = -3; j <= 0; j++) g.set(left + i, y + j, status === "fallow" ? "#b08b5e" : "#9a7550");
    if (status === "fallow") {
      g.line(left + 2, y - 3, left + 5, y, "#7d5d3a");
      g.line(left + 9, y - 2, left + 12, y - 1, "#7d5d3a");
      g.line(left + 12, y - 1, left + 14, y - 3, "#7d5d3a");
    }
  } else if (status === "fresh") {
    for (let i = 3; i < PLANT_W - 5; i++) g.set(left + i, y, "#5e3c25");
  }
}

export function hexToRgb(c: string): [number, number, number] {
  const h = c.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
