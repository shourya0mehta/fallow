// Record the live garden into a GIF: idle, a hover, a tap, a spin, petting, a walk.
// usage: node scripts/pixel/record.mjs [baseUrl] [out.gif]
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import gifenc from "gifenc";
const { GIFEncoder, quantize, applyPalette } = gifenc;

const base = process.argv[2] || "http://localhost:4321";
const out = process.argv[3] || "docs/garden.gif";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
await page.clock.setFixedTime(new Date("2026-10-01T13:20:00"));
await page.goto(base + "/", { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.removeItem("fallow.sky"));
await page.goto(base + "/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

const frames = [];
const grab = async (n = 1, gap = 90) => {
  for (let i = 0; i < n; i++) {
    frames.push(await page.evaluate(() => document.querySelector(".garden-canvas").toDataURL("image/png")));
    await page.waitForTimeout(gap);
  }
};
const geo = async () =>
  page.evaluate(() => {
    const w = document.querySelector(".garden");
    const r = document.querySelector(".garden-canvas").getBoundingClientRect();
    const e = w.__garden;
    const px = parseFloat(getComputedStyle(w).getPropertyValue("--pet-x"));
    const py = parseFloat(getComputedStyle(w).getPropertyValue("--pet-y"));
    const plant = (id) => { const a = e.plantAnchor(id); return [r.left + a.x, r.top + a.y + 40]; };
    return { pet: [r.left + px, r.top + py + 34], lavender: plant("composition"), wheat: plant("synthesis") };
  });

await grab(10);
let g = await geo();
await page.mouse.move(...g.lavender);
await grab(8);
await page.mouse.move(g.pet[0], g.pet[1] - 60);
await grab(4);
g = await geo();
await page.mouse.click(...g.pet);
await grab(10, 70);
await page.mouse.dblclick(...g.pet);
await grab(16, 70);
g = await geo();
await page.mouse.move(...g.pet);
await page.mouse.down();
await grab(14, 90);
await page.mouse.up();
await grab(6, 80);
await page.mouse.click(...g.wheat);
await grab(22, 90);
await page.keyboard.press("Escape");

const SCALE = 3;
let w = 0;
let h = 0;
const rgba = frames.map((url) => {
  const png = PNG.sync.read(Buffer.from(url.split(",")[1], "base64"));
  w = png.width * SCALE;
  h = png.height * SCALE;
  const big = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const s = (Math.floor(y / SCALE) * png.width + Math.floor(x / SCALE)) * 4;
      const d = (y * w + x) * 4;
      big[d] = png.data[s];
      big[d + 1] = png.data[s + 1];
      big[d + 2] = png.data[s + 2];
      big[d + 3] = 255;
    }
  return big;
});
const gif = GIFEncoder();
for (const f of rgba) {
  const palette = quantize(f, 256);
  gif.writeFrame(applyPalette(f, palette), w, h, { palette, delay: 90 });
}
gif.finish();
writeFileSync(out, gif.bytes());
console.log("wrote", out, frames.length, "frames", w + "x" + h, Math.round(gif.bytes().length / 1024) + " KB");
await browser.close();
