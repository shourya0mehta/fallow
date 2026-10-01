// Render preview sheets of the pixel art to PNG (no browser needed).
// usage: npx tsx scripts/pixel/sheet.ts plants|scene|all|stages|appicons [outDir]
import { writeFileSync, mkdirSync } from "node:fs";
import { PNG } from "pngjs";
import { Grid } from "../../src/pixel/grid";
import { plantGrid, PLANT_W, PLANT_H } from "../../src/pixel/plants";
import type { DomainId, DomainStatus } from "../../src/core/types";
import { layoutGarden, backdrop, soilPatch, SKY, hexToRgb } from "../../src/pixel/scene";
import { creatureGrid, CREATURE_BASE } from "../../src/pixel/creature";

const IDS: DomainId[] = ["composition", "analysis", "quantitative", "recall", "synthesis", "navigation", "planning", "ideation", "implementation", "verbal", "attention"];
const STATUSES: DomainStatus[] = ["fresh", "fading", "stale", "fallow"];

function hex(c: string): [number, number, number] {
  const h = c.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function savePng(g: Grid, scale: number, path: string, bg = "#3d2a1f") {
  const png = new PNG({ width: g.w * scale, height: g.h * scale });
  const [br, bgc, bb] = hex(bg);
  for (let y = 0; y < g.h * scale; y++)
    for (let x = 0; x < g.w * scale; x++) {
      const c = g.px[Math.floor(y / scale) * g.w + Math.floor(x / scale)];
      const [r, gg, b] = c ? hex(c) : [br, bgc, bb];
      const i = (y * g.w * scale + x) * 4;
      png.data[i] = r;
      png.data[i + 1] = gg;
      png.data[i + 2] = b;
      png.data[i + 3] = 255;
    }
  writeFileSync(path, PNG.sync.write(png));
}

const out = process.argv[3] || "scripts/pixel/out";
mkdirSync(out, { recursive: true });
const what = process.argv[2] || "plants";

if (what === "plants" || what === "all") {
  const pad = 4;
  const sheet = new Grid(IDS.length * (PLANT_W + pad) + pad, STATUSES.length * (PLANT_H + pad + 3) + pad);
  STATUSES.forEach((st, row) => {
    IDS.forEach((id, col) => {
      const x = pad + col * (PLANT_W + pad);
      const y = pad + row * (PLANT_H + pad + 3);
      // soil strip
      sheet.rect(x - 1, y + PLANT_H, PLANT_W + 2, 2, st === "fallow" || st === "stale" ? "#b08b5e" : "#7a5236");
      sheet.blit(plantGrid(id, st), x, y);
    });
  });
  savePng(sheet, 5, `${out}/plants-sheet.png`, "#cfe6f0");
  console.log("wrote", `${out}/plants-sheet.png`);
}

if (what === "scene" || what === "all") {
  const demo: Record<string, DomainStatus> = { composition: "fresh", analysis: "fading", quantitative: "fallow", recall: "stale", synthesis: "fallow", navigation: "fallow", planning: "fallow", ideation: "fading", implementation: "fresh", verbal: "stale", attention: "fresh" };
  for (const [tod, width] of [["day", 960], ["dusk", 960], ["night", 960], ["dawn", 960], ["day", 360]] as const) {
    const L = layoutGarden(width);
    const g = backdrop(L, tod);
    IDS.forEach((id, i) => {
      const s = L.slots[i];
      soilPatch(g, demo[id], s.x, s.y);
      g.blit(plantGrid(id, demo[id]), Math.round(s.x - PLANT_W / 2), s.y - PLANT_H + 1);
    });
    const cx = Math.round(L.W / 2 - 16);
    g.blit(creatureGrid("steady", {}), cx, L.groundY - CREATURE_BASE - 1);
    const ov = SKY[tod].overlay;
    if (ov) {
      const m = ov.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/)!;
      const [orr, og, ob, oa] = [+m[1], +m[2], +m[3], +m[4]];
      for (let i = 0; i < g.px.length; i++) {
        const c = g.px[i];
        if (!c) continue;
        const [r0, g0, b0] = hexToRgb(c);
        const mix = (a: number, b: number) => Math.round(a * (1 - oa) + b * oa).toString(16).padStart(2, "0");
        g.px[i] = `#${mix(r0, orr)}${mix(g0, og)}${mix(b0, ob)}`;
      }
    }
    savePng(g, L.scale, `${out}/scene-${tod}-${width}.png`);
    console.log("wrote", `${out}/scene-${tod}-${width}.png`, L.W, L.H, L.scale);
  }
}



if (what === "appicons") {
  // square crop of the pet's body, centred, for favicons and the extension
  const square = (stage: "steady" | "thriving") => {
    const g = creatureGrid(stage, {});
    const sq = new Grid(24, 24);
    sq.blit(g, -4, -1);
    return sq;
  };
  const writeIcon = (g: Grid, size: number, path: string) => {
    const scale = Math.max(1, Math.floor(size / g.w));
    const png = new PNG({ width: size, height: size });
    const off = Math.floor((size - g.w * scale) / 2);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const gx = Math.floor((x - off) / scale);
        const gy = Math.floor((y - off) / scale);
        const c = gx >= 0 && gy >= 0 && gx < g.w && gy < g.h ? g.px[gy * g.w + gx] : null;
        const i = (y * size + x) * 4;
        if (!c) { png.data[i + 3] = 0; continue; }
        const [r, gg, b] = hex(c);
        png.data[i] = r; png.data[i + 1] = gg; png.data[i + 2] = b; png.data[i + 3] = 255;
      }
    writeFileSync(path, PNG.sync.write(png));
  };
  writeIcon(square("steady"), 48, "src/app/icon.png");
  for (const s of [16, 32, 48, 128]) writeIcon(square("thriving"), s, `integrations/browser-extension/icons/icon${s}.png`);
  console.log("app and extension icons written");
}

if (what === "stages") {
  const stages = ["thriving", "steady", "fading", "fallow"] as const;
  const sheet = new Grid(stages.length * 28 + 4, 26);
  stages.forEach((s, i) => sheet.blit(creatureGrid(s, {}), 4 + i * 28 - 4, -1));
  savePng(sheet, 6, "docs/pet-stages.png", "#cfe9f5");
  console.log("wrote docs/pet-stages.png");
}
