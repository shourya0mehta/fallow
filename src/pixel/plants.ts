import type { DomainId, DomainStatus } from "@/core/types";
import { Grid, rng } from "./grid";

/**
 * One plant species per cognitive domain, drawn procedurally so every status
 * (fresh, fading, stale, fallow) is the same plant in a different condition.
 *
 *   composition    lavender         analysis      bellflower
 *   quantitative   sunflower        recall        forget-me-not
 *   synthesis      wheat            navigation    morning glory on a stake
 *   planning       tomato trellis   ideation      dandelion
 *   implementation cactus           verbal        snapdragon
 *   attention      pine sapling
 */
export const PLANT_W = 18;
export const PLANT_H = 30;
const BX = 9; // stem x
const BY = PLANT_H - 1; // soil line

export const SPECIES: Record<DomainId, { name: string; flower: string }> = {
  composition: { name: "lavender", flower: "#9b6fdc" },
  analysis: { name: "bellflower", flower: "#4d7fe0" },
  quantitative: { name: "sunflower", flower: "#ffcf3a" },
  recall: { name: "forget-me-not", flower: "#5aa3f0" },
  synthesis: { name: "wheat", flower: "#e0b048" },
  navigation: { name: "morning glory", flower: "#c77ae6" },
  planning: { name: "tomato", flower: "#ec4a3c" },
  ideation: { name: "dandelion", flower: "#f4f1e8" },
  implementation: { name: "cactus", flower: "#ff8fb3" },
  verbal: { name: "snapdragon", flower: "#ec5b8f" },
  attention: { name: "pine", flower: "#3f7f52" },
};

interface Look {
  /** height factor */
  h: number;
  leaf: [string, string, string];
  stem: string;
  bloom: "full" | "wilt" | "none";
  droop: number;
  outline: string;
}

const LOOK: Record<DomainStatus, Look> = {
  fresh: { h: 1, leaf: ["#b9e86e", "#7cc04a", "#4c8f36"], stem: "#4c8f36", bloom: "full", droop: 0, outline: "#24401f" },
  fading: { h: 0.84, leaf: ["#e4e08c", "#c4b955", "#958c3e"], stem: "#958c3e", bloom: "wilt", droop: 1, outline: "#45401d" },
  stale: { h: 0.62, leaf: ["#dcbc80", "#b48e55", "#82623a"], stem: "#82623a", bloom: "none", droop: 2, outline: "#3f2d1a" },
  fallow: { h: 0.16, leaf: ["#cdb489", "#a8875a", "#7a5d3b"], stem: "#7a5d3b", bloom: "none", droop: 2, outline: "#3a2a19" },
};

const WOOD = ["#c48a52", "#94643a", "#6a4526"];

function leafPair(g: Grid, x: number, y: number, size: number, L: Look, side: -1 | 1) {
  // A small pointed leaf growing sideways from (x, y); droop bends it down.
  const [light, mid, dark] = L.leaf;
  for (let i = 1; i <= size; i++) {
    const yy = y - (L.droop === 0 ? Math.floor(i / 2) : -Math.floor((i * L.droop) / 3));
    g.set(x + side * i, yy, i === size ? dark : mid);
    if (i > 1 && i < size) g.set(x + side * i, yy - 1, light);
  }
}

function stemUp(g: Grid, x: number, top: number, L: Look, lean = 0) {
  for (let y = BY; y >= top; y--) {
    const t = (BY - y) / Math.max(1, BY - top);
    g.set(x + Math.round(lean * t * t), y, L.stem);
  }
}

type Draw = (g: Grid, L: Look, r: () => number) => void;

const lavender: Draw = (g, L) => {
  const H = Math.round(24 * L.h);
  const stems = [
    { x: BX, lean: 0, h: H },
    { x: BX - 1, lean: -4, h: Math.round(H * 0.85) },
    { x: BX + 1, lean: 4, h: Math.round(H * 0.8) },
  ];
  for (const s of stems) {
    const top = BY - s.h;
    stemUp(g, s.x, top, L, s.lean);
    if (L.bloom === "none") continue;
    const spike = Math.round(s.h * (L.bloom === "full" ? 0.42 : 0.25));
    const tipX = s.x + s.lean;
    const cols = L.bloom === "full" ? ["#d6b6ff", "#a77be6", "#7a52c2"] : ["#cbbad8", "#a895b8", "#86759a"];
    for (let i = 0; i < spike; i++) {
      const y = top + i;
      const x = tipX - Math.round((s.lean * i * 0.5) / Math.max(1, s.h));
      g.set(x, y, cols[1]);
      if (i % 2 === 0) {
        g.set(x - 1, y, cols[i < 2 ? 0 : 2]);
        g.set(x + 1, y, cols[0]);
      }
    }
  }
  for (let i = 0; i < 3; i++) leafPair(g, BX, BY - 2 - i * 2, 3, L, i % 2 ? 1 : -1);
};

const bellflower: Draw = (g, L) => {
  const H = Math.round(22 * L.h);
  const top = BY - H;
  // arching stem curving to the right
  for (let y = BY; y >= top; y--) {
    const t = (BY - y) / Math.max(1, H);
    g.set(BX - 2 + Math.round(5 * t * t), y, L.stem);
  }
  const tipX = BX + 3;
  g.set(tipX + 1, top, L.stem);
  g.set(tipX + 2, top + 1, L.stem);
  leafPair(g, BX - 2, BY - 3, 3, L, -1);
  leafPair(g, BX - 1, BY - 7, 3, L, 1);
  leafPair(g, BX - 1, BY - 11, 2, L, -1);
  if (L.bloom === "none") return;
  const blue = L.bloom === "full" ? ["#a9cbff", "#5d8ff0", "#3a5fc0"] : ["#b5c0d8", "#8f9cbc", "#6f7a98"];
  const bells: Array<[number, number]> = L.bloom === "full" ? [[tipX + 2, top + 2], [tipX - 1, top + 6], [tipX + 2, top + 9]] : [[tipX + 2, top + 3]];
  for (const [x, y] of bells) {
    g.set(x, y, L.stem);
    g.rect(x - 1, y + 1, 3, 2, blue[1]);
    g.set(x - 1, y + 1, blue[0]);
    g.set(x - 2, y + 3, blue[2]);
    g.set(x + 2, y + 3, blue[2]);
    g.rect(x - 1, y + 3, 3, 1, blue[1]);
    if (L.bloom === "full") g.set(x, y + 4, "#ffe680");
  }
};

const sunflower: Draw = (g, L) => {
  const H = Math.round(26 * L.h);
  const top = BY - H;
  stemUp(g, BX, top + 3, L);
  for (let y = BY; y > top + 3; y--) g.set(BX + 1, y, L.leaf[2]);
  // big leaves
  const leaf = (y: number, side: -1 | 1) => {
    const [light, mid, dark] = L.leaf;
    const dy = L.droop;
    for (let i = 1; i <= 4; i++) {
      g.set(BX + side * i, y - (i < 3 ? 1 : 0) + Math.floor((i * dy) / 2), mid);
      g.set(BX + side * i, y + Math.floor((i * dy) / 2), i === 4 ? dark : light);
    }
    g.set(BX + side * 5, y + dy * 2, dark);
  };
  leaf(BY - 5, -1);
  leaf(BY - 10, 1);
  if (L.h > 0.7) leaf(BY - 15, -1);
  if (L.bloom === "none") {
    // dried head
    g.disc(BX + 1, top + 3, 2, "#7a5a32");
    g.set(BX + 1, top + 3, "#5a3e22");
    return;
  }
  const wilt = L.bloom === "wilt";
  const cx = BX + (wilt ? 2 : 0.5);
  const cy = top + (wilt ? 4 : 3);
  const petals = wilt ? ["#f0c46a", "#d79a3c"] : ["#ffe36a", "#ffbf2a"];
  const R = wilt ? 3.6 : 4.6;
  for (let a = 0; a < 16; a++) {
    if (wilt && a % 2) continue;
    const ang = (a / 16) * Math.PI * 2;
    g.set(cx + Math.cos(ang) * (R - 0.5), cy + Math.sin(ang) * (R - 0.5) * (wilt ? 0.8 : 1), petals[a % 2]);
    g.set(cx + Math.cos(ang) * (R - 1.4), cy + Math.sin(ang) * (R - 1.4) * (wilt ? 0.8 : 1), petals[0]);
  }
  g.disc(cx, cy, wilt ? 1.7 : 2.3, "#7a4a22");
  g.set(Math.round(cx - 1), Math.round(cy - 1), "#a5682f");
};

const forgetMeNot: Draw = (g, L, r) => {
  const H = Math.max(2, Math.round(13 * L.h));
  const stems: Array<[number, number]> = [];
  for (let i = 0; i < 6; i++) {
    const x = BX - 5 + i * 2;
    const h = Math.round(H * (0.6 + 0.4 * r()));
    stems.push([x, BY - h]);
    g.line(BX + (x - BX) / 3, BY, x, BY - h, L.stem);
  }
  for (let i = 0; i < 7; i++) {
    const x = BX - 6 + i * 2;
    const y = BY - 1 - Math.floor(r() * H * 0.5);
    g.set(x, y, L.leaf[1]);
    g.set(x + 1, y, L.leaf[0]);
    g.set(x, y + 1, L.leaf[2]);
  }
  if (L.bloom === "none") return;
  const petal = L.bloom === "full" ? "#7dbaff" : "#a3b1c4";
  const heads = L.bloom === "full" ? stems : stems.filter((_, i) => i % 3 === 0);
  for (const [x, y] of heads) {
    g.set(x, y - 1, petal);
    g.set(x - 1, y, petal);
    g.set(x + 1, y, petal);
    g.set(x, y + 1, petal);
    g.set(x, y, L.bloom === "full" ? "#ffe066" : "#d8cfa0");
  }
};

const wheat: Draw = (g, L) => {
  const H = Math.round(24 * L.h);
  const grain = L.bloom === "full" ? ["#ffe08a", "#e8b84a", "#b98a2c"] : L.bloom === "wilt" ? ["#e8d49a", "#c9ae6a", "#a08548"] : ["#d6bf8e", "#b39a68", "#8a744c"];
  const stems = [
    { x: BX - 3, h: H * 0.82, lean: -2 },
    { x: BX - 1, h: H, lean: -1 },
    { x: BX + 1, h: H * 0.92, lean: 1 },
    { x: BX + 3, h: H * 0.78, lean: 3 },
  ];
  for (const s of stems) {
    const top = BY - Math.round(s.h);
    const bend = L.droop * 1.5;
    for (let y = BY; y >= top; y--) {
      const t = (BY - y) / Math.max(1, BY - top);
      g.set(s.x + Math.round((s.lean + bend * Math.sign(s.lean || 1)) * t * t), y, L.bloom === "full" ? L.stem : grain[2]);
    }
    if (L.h < 0.3) continue;
    const tx = s.x + Math.round(s.lean + bend * Math.sign(s.lean || 1));
    const len = L.bloom === "none" ? 3 : 6;
    for (let i = 0; i < len; i++) {
      g.set(tx, top + i, grain[1]);
      if (i % 2 === 0) g.set(tx - 1, top + i + 1, grain[0]);
      else g.set(tx + 1, top + i, grain[2]);
    }
    if (L.bloom === "full") g.set(tx, top - 1, grain[0]);
  }
  leafPair(g, BX, BY - 3, 4, L, -1);
  leafPair(g, BX, BY - 6, 4, L, 1);
};

const ivy: Draw = (g, L) => {
  // morning glory climbing a stake: vines find their way, which is the point
  const stakeTop = BY - 24;
  g.rect(BX, stakeTop, 1, 25, WOOD[1]);
  g.set(BX, stakeTop, WOOD[2]);
  const H = Math.round(23 * L.h);
  if (H < 3) {
    g.set(BX - 1, BY, L.leaf[2]);
    g.set(BX + 1, BY - 1, L.leaf[2]);
    return;
  }
  const heart = (x: number, y: number, side: -1 | 1) => {
    const [light, mid, dark] = L.leaf;
    const yy = y + L.droop;
    g.set(x, yy, mid);
    g.set(x + side, yy, mid);
    g.set(x, yy - 1, light);
    g.set(x + side, yy - 1, light);
    g.set(x + side * 2, yy - 1, mid);
    g.set(x + side, yy + 1, dark);
  };
  for (let i = 0; i < H; i++) {
    const y = BY - i;
    const x = BX + Math.round(Math.sin(i / 2.2) * 1.6);
    g.set(x, y, L.stem);
    if (i % 3 === 1) heart(x + (i % 6 === 1 ? 1 : -1), y, i % 6 === 1 ? 1 : -1);
  }
  if (L.bloom === "none") return;
  const petals = L.bloom === "full" ? ["#f3c2ff", "#c77ae6", "#8f4fbf"] : ["#d9c8de", "#b39cbb", "#8c7894"];
  const spots: Array<[number, number, -1 | 1]> = L.bloom === "full" ? [[BX - 3, BY - H + 3, -1], [BX + 3, BY - Math.round(H * 0.55), 1]] : [[BX + 3, BY - Math.round(H * 0.6), 1]];
  for (const [x, y, side] of spots) {
    g.set(x, y, petals[1]);
    g.set(x + side, y, petals[1]);
    g.set(x, y - 1, petals[0]);
    g.set(x + side, y - 1, petals[0]);
    g.set(x, y + 1, petals[2]);
    g.set(x + side, y + 1, petals[2]);
    g.set(x + side * 2, y, petals[1]);
    if (L.bloom === "full") g.set(x, y, "#fff3a6");
  }
};

const tomato: Draw = (g, L) => {
  // a light cane trellis: two canes and one tie, so the plant is the subject
  const tTop = BY - 21;
  const cane = "#d9b27a";
  for (let y = tTop; y <= BY; y++) {
    g.set(BX - 4, y, cane);
    g.set(BX + 4, y, cane);
  }
  for (let x = BX - 4; x <= BX + 4; x++) g.set(x, tTop + 4, cane);
  const H = Math.round(20 * L.h);
  if (H < 3) {
    g.set(BX, BY, L.stem);
    g.set(BX + 1, BY - 1, L.leaf[2]);
    return;
  }
  for (let i = 0; i < H; i++) {
    const y = BY - i;
    const x = BX + Math.round(Math.sin(i / 3) * 1.5);
    g.set(x, y, L.stem);
    if (i % 2 === 1) {
      const side = i % 4 === 1 ? 1 : -1;
      g.set(x + side, y, L.leaf[1]);
      g.set(x + side * 2, y + L.droop, L.leaf[2]);
      g.set(x + side, y - 1, L.leaf[0]);
      g.set(x + side * 2, y - 1 + L.droop, L.leaf[1]);
      g.set(x + side * 3, y + L.droop, L.leaf[2]);
    }
  }
  if (L.bloom === "none") return;
  const fruit = L.bloom === "full" ? ["#ff8a73", "#ec4a3c", "#ad2c24"] : ["#c9cf78", "#9fa852", "#76803a"];
  const spots: Array<[number, number]> = L.bloom === "full" ? [[BX - 2, BY - 5], [BX + 2, BY - 10], [BX - 1, BY - 15]] : [[BX + 2, BY - 8]];
  for (const [x, y] of spots) {
    g.rect(x - 1, y, 3, 2, fruit[1]);
    g.set(x, y - 1, fruit[1]);
    g.set(x - 1, y, fruit[0]);
    g.set(x + 1, y + 1, fruit[2]);
    g.set(x, y - 2, "#4c8f36");
  }
};

const dandelion: Draw = (g, L) => {
  // jagged rosette
  for (let i = 1; i <= 5; i++) {
    g.set(BX - i, BY - (i % 2), L.leaf[i % 2 ? 1 : 2]);
    g.set(BX + i, BY - (i % 2), L.leaf[i % 2 ? 1 : 2]);
    if (i < 4) {
      g.set(BX - i, BY - 1 - (i % 2), L.leaf[0]);
      g.set(BX + i, BY - 1 - (i % 2), L.leaf[0]);
    }
  }
  const H = Math.round(20 * L.h);
  const top = BY - H;
  if (H < 4) return;
  for (let y = BY; y >= top; y--) g.set(BX + (L.droop && y < top + 4 ? 1 : 0), y, L.stem);
  if (L.bloom === "none") {
    g.set(BX + 1, top - 1, "#a8875a");
    g.set(BX, top - 1, "#a8875a");
    return;
  }
  const cx = BX + 0.5;
  const cy = top - 3;
  const full = L.bloom === "full";
  for (let a = 0; a < 14; a++) {
    if (!full && a % 3) continue;
    const ang = (a / 14) * Math.PI * 2;
    const rr = 3.4;
    g.set(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr, "#ffffff");
    g.set(cx + Math.cos(ang) * (rr - 1.3), cy + Math.sin(ang) * (rr - 1.3), "#e6e4ee");
  }
  g.disc(cx, cy, 1.4, full ? "#d9d4c4" : "#bfb69c");
};

const cactus: Draw = (g, L) => {
  const body = L.bloom === "none" ? ["#b8b070", "#8f8a52", "#66643a"] : L.bloom === "wilt" ? ["#c2cf86", "#9aa95c", "#717c42"] : ["#94de8c", "#5fb86a", "#3b8a4e"];
  const H = Math.max(3, Math.round(20 * L.h));
  const top = BY - H;
  const lean = L.droop;
  for (let y = top; y <= BY; y++) {
    const t = (BY - y) / Math.max(1, H);
    const ox = Math.round(lean * t * t);
    g.rect(BX - 2 + ox, y, 5, 1, body[1]);
    g.set(BX - 2 + ox, y, body[0]);
    g.set(BX + 2 + ox, y, body[2]);
    if ((BY - y) % 3 === 0) g.set(BX + ox, y, body[2]);
  }
  for (let x = BX - 1; x <= BX + 1; x++) g.set(x + lean, top - 1, body[1]);
  if (H > 10) {
    // arms
    const ay = BY - Math.round(H * 0.45);
    g.rect(BX - 5, ay, 3, 2, body[1]);
    g.rect(BX - 5, ay - 5, 2, 5, body[1]);
    g.set(BX - 5, ay - 5, body[0]);
    const by = BY - Math.round(H * 0.6);
    g.rect(BX + 3, by, 3, 2, body[1]);
    g.rect(BX + 4, by - 4, 2, 4, body[2]);
  }
  if (L.bloom === "full") {
    g.set(BX, top - 2, "#ff8fb3");
    g.set(BX - 1, top - 2, "#ffb3cc");
    g.set(BX + 1, top - 2, "#e86f98");
    g.set(BX, top - 3, "#ff8fb3");
    g.set(BX, top - 1, "#ffe066");
  }
};

const snapdragon: Draw = (g, L) => {
  const H = Math.round(23 * L.h);
  const top = BY - H;
  stemUp(g, BX, top, L);
  leafPair(g, BX, BY - 2, 4, L, -1);
  leafPair(g, BX, BY - 4, 4, L, 1);
  leafPair(g, BX, BY - 7, 3, L, -1);
  if (L.bloom === "none") return;
  const cols = L.bloom === "full" ? ["#ffb3cf", "#ec5b8f", "#b83a6a"] : ["#d9b8c4", "#b78f9e", "#8f6b79"];
  const n = L.bloom === "full" ? 5 : 2;
  for (let i = 0; i < n; i++) {
    const y = top + i * 3;
    const side = i % 2 ? 1 : -1;
    const x = BX + side;
    g.set(x, y, cols[1]);
    g.set(x + side, y, cols[1]);
    g.set(x + side, y + 1, cols[2]);
    g.set(x, y - 1, cols[0]);
    g.set(x + side * 2, y + 1, cols[0]);
  }
  if (L.bloom === "full") g.set(BX, top - 1, cols[0]);
};

const pine: Draw = (g, L) => {
  const needle = L.bloom === "full" ? ["#6cc27a", "#3f8f52", "#2b6a3c"] : L.bloom === "wilt" ? ["#9fb877", "#748f52", "#566c3e"] : ["#c49a63", "#9a7445", "#6e5232"];
  const H = Math.max(3, Math.round(22 * L.h));
  const top = BY - H;
  g.rect(BX, BY - 3, 2, 4, WOOD[1]);
  g.set(BX, BY - 3, WOOD[0]);
  if (H < 6) {
    g.set(BX, BY - 4, needle[1]);
    g.set(BX + 1, BY - 5, needle[2]);
    return;
  }
  const tiers = 3;
  for (let t = 0; t < tiers; t++) {
    const tierTop = top + Math.round((t * (H - 4)) / tiers);
    const tierH = Math.round((H - 3) / tiers) + 3;
    for (let j = 0; j < tierH; j++) {
      const half = Math.round(((j + 1) / tierH) * (2 + t * 1.6));
      const y = tierTop + j;
      for (let x = -half; x <= half + 1; x++) {
        const c = x <= -half + 0 ? needle[0] : x >= half ? needle[2] : needle[1];
        g.set(BX + x, y, c);
      }
    }
  }
  g.set(BX, top - 1, needle[0]);
  g.set(BX + 1, top - 1, needle[1]);
};

const DRAW: Record<DomainId, Draw> = {
  composition: lavender,
  analysis: bellflower,
  quantitative: sunflower,
  recall: forgetMeNot,
  synthesis: wheat,
  navigation: ivy,
  planning: tomato,
  ideation: dandelion,
  implementation: cactus,
  verbal: snapdragon,
  attention: pine,
};

const cache = new Map<string, Grid>();

/** The plant for a domain in a given condition, with a dark outline for legibility. */
export function plantGrid(id: DomainId, status: DomainStatus): Grid {
  const key = `${id}:${status}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const g = new Grid(PLANT_W, PLANT_H);
  const L = LOOK[status];
  const r = rng(id.length * 7919 + id.charCodeAt(0) * 104729);
  DRAW[id](g, L, r);
  if (status === "fallow") {
    // a dry stub over bare soil reads as "nothing growing here yet"
    g.set(BX, BY, L.stem);
    g.set(BX, BY - 1, L.stem);
    g.set(BX + 1, BY - 2, L.leaf[2]);
  }
  g.outline(L.outline);
  cache.set(key, g);
  return g;
}

/** How a plant moves: amplitude in px at the top of the plant, and speed. */
export function swayFor(status: DomainStatus): { amp: number; speed: number } {
  switch (status) {
    case "fresh":
      return { amp: 1.2, speed: 1 };
    case "fading":
      return { amp: 0.8, speed: 0.6 };
    case "stale":
      return { amp: 0.4, speed: 0.35 };
    default:
      return { amp: 0, speed: 0 };
  }
}
