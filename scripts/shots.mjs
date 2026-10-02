// Screenshot every page of the static build for a visual check.
// usage: node scripts/shots.mjs [baseUrl] [outDir] [width] [sky]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = process.argv[2] || "http://localhost:4321";
const outDir = process.argv[3] || "scripts/pixel/out/pages";
const width = Number(process.argv[4] || 1180);
const sky = process.argv[5] || "day";
mkdirSync(outDir, { recursive: true });
const pages = ["/", "/journal/", "/settings/", "/how/", "/demo/chat/"];

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width, height: 900 } });
// the first-visit intro covers the page; INTRO=1 keeps it, for shots of the intro itself
if (!process.env.INTRO) await page.addInitScript(() => localStorage.setItem("fallow.introSeen", "1"));
// FIXED_TIME=2026-10-01T13:20:00 pins the clock so screenshots are taken in daylight with the pet awake
if (process.env.FIXED_TIME) await page.clock.setFixedTime(new Date(process.env.FIXED_TIME));
const errors = [];
page.on("pageerror", (e) => errors.push(`${page.url()} ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`${page.url()} ${m.text()}`);
});
await page.goto(base + "/", { waitUntil: "networkidle" });
await page.evaluate((s) => (s === "auto" ? localStorage.removeItem("fallow.sky") : localStorage.setItem("fallow.sky", s)), sky);
for (const p of pages) {
  await page.goto(base + p, { waitUntil: "networkidle" });
  await page.waitForTimeout(1300);
  const name = p === "/" ? "garden" : p.replace(/\//g, "-").replace(/^-|-$/g, "");
  await page.screenshot({ path: `${outDir}/${name}-${width}.png`, fullPage: true });
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  console.log("shot", p, "scrollWidth", sw);
}
await browser.close();
console.log("errors:", errors.length ? errors : "none");
