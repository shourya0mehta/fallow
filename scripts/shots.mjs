// Screenshot every page of the static build for a visual check.
// usage: node scripts/shots.mjs [baseUrl] [outDir]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = process.argv[2] || "http://localhost:4321";
const outDir = process.argv[3] || "scripts/pixel/out/pages";
mkdirSync(outDir, { recursive: true });
const pages = ["/", "/gate/", "/practice/", "/ledger/", "/day/", "/import/", "/settings/", "/about/", "/evidence/", "/demo/chat/"];

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`${page.url()} ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !/ERR_TUNNEL|fonts.googleapis/.test(m.text())) errors.push(`${page.url()} ${m.text()}`); });
for (const p of pages) {
  await page.goto(base + p, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const name = p === "/" ? "field" : p.replace(/\//g, "-").replace(/^-|-$/g, "");
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  console.log("shot", p);
}
await browser.close();
console.log("errors:", errors.length ? errors : "none");
