/**
 * End-to-end check of the browser extension against a running Fallow app.
 *
 *   npm run dev            # in one terminal
 *   npm run test:extension # in another
 *
 * Needs a Chromium binary: on a Mac with Chrome installed nothing else is needed
 * (channel "chrome"); otherwise set CHROME_PATH to a Chromium executable.
 * Uses playwright-core, which downloads no browsers.
 */
import { chromium } from "playwright-core";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.FALLOW_URL ?? "http://localhost:3000";
const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function api(method, route, body) {
  const res = await fetch(BASE + route, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  return res.json();
}

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
  console.log(`  ok  ${msg}`);
}

async function main() {
  const health = await fetch(`${BASE}/api/settings`).catch(() => null);
  if (!health || !health.ok) throw new Error(`Fallow is not running at ${BASE}. Start it with npm run dev.`);
  const originalSettings = await api("GET", "/api/settings");

  const userDataDir = mkdtempSync(path.join(tmpdir(), "fallow-ext-"));
  const launch = {
    headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  else launch.channel = process.env.FALLOW_BROWSER_CHANNEL || "chrome";
  const context = await chromium.launchPersistentContext(userDataDir, launch);

  try {
    // Give the service worker a moment to register.
    if (!context.serviceWorkers().length) await context.waitForEvent("serviceworker", { timeout: 10000 }).catch(() => null);

    console.log("chat intercept");
    const page = await context.newPage();
    await page.goto(`${BASE}/demo/chat`, { waitUntil: "networkidle" });
    const ask = "Write me a cover letter for a data science internship at a climate startup";
    await page.fill("textarea[data-fallow-composer]", ask);
    await page.keyboard.press("Enter");
    const card = page.locator(".fallow-card");
    await card.waitFor({ timeout: 8000 });
    if (process.env.FALLOW_SHOTS) await page.screenshot({ path: path.join(process.env.FALLOW_SHOTS, "extension-card.png") });
    const mode = await card.locator(".fallow-mode").textContent();
    assert(["Do it yourself", "Scaffold", "Co-pilot"].includes(mode.trim()), `verdict card shown with mode "${mode.trim()}"`);
    const before = (await api("GET", "/api/events")).events.length;
    await card.locator("button[data-fallow-action='anyway']").click();
    await page.locator("[data-fallow-demo-log] p", { hasText: ask }).waitFor({ timeout: 5000 });
    assert(true, "send anyway lets the message through");
    await page.waitForTimeout(500);
    const after = (await api("GET", "/api/events")).events;
    assert(after.length === before + 1, "one event logged");
    const last = after[after.length - 1];
    assert(last.source === "extension-chat" && last.actor === "ai", "logged as delegated from the extension");

    console.log("send with scaffold");
    await page.fill("textarea[data-fallow-composer]", "Write me an email to my advisor asking for a two-week extension");
    await page.click("button[data-fallow-send]");
    await card.waitFor({ timeout: 8000 });
    await card.locator("button[data-fallow-action='scaffold']").click();
    await page.locator("[data-fallow-demo-log] p", { hasText: "[Fallow," }).waitFor({ timeout: 5000 });
    assert(true, "scaffold instruction appended to the prompt");
    await page.locator("[data-fallow-demo-log] p", { hasText: "scaffold instead of answering" }).waitFor({ timeout: 5000 });
    assert(true, "demo assistant acknowledged the scaffold");

    console.log("short prompts pass untouched");
    await page.fill("textarea[data-fallow-composer]", "thanks");
    await page.keyboard.press("Enter");
    await page.locator("[data-fallow-demo-log] p", { hasText: "thanks" }).waitFor({ timeout: 5000 });
    assert((await page.locator(".fallow-card").count()) === 0, "no card for a short prompt");

    console.log("pause overlay");
    await api("POST", "/api/settings", { entertainmentSites: ["localhost", "127.0.0.1"], pauseSeconds: 1 });
    // The worker caches settings for a minute; clear it so the new site list is seen at once.
    for (const worker of context.serviceWorkers()) await worker.evaluate(() => chrome.storage.local.remove("settingsCache"));
    const feed = await context.newPage();
    await feed.goto(`${BASE}/demo/feed`, { waitUntil: "domcontentloaded" });
    const overlay = feed.locator(".fallow-overlay");
    await overlay.waitFor({ timeout: 8000 });
    assert(true, "pause overlay shown on a listed site");
    if (process.env.FALLOW_SHOTS) await feed.screenshot({ path: path.join(process.env.FALLOW_SHOTS, "extension-pause.png") });
    const go = overlay.locator("button", { hasText: "Continue" });
    await feed.waitForTimeout(1500);
    assert(await go.isEnabled(), "continue unlocks after the countdown");
    await go.click();
    await overlay.waitFor({ state: "detached", timeout: 5000 });
    assert(true, "continue removes the overlay");
    await feed.waitForTimeout(500);
    const signals = (await api("GET", "/api/signals")).signals;
    const pause = signals.filter((s) => s.kind === "pause" && s.outcome === "continued");
    assert(pause.length >= 1, "pause signal logged as continued");
    await feed.reload({ waitUntil: "domcontentloaded" });
    await feed.waitForTimeout(800);
    assert((await feed.locator(".fallow-overlay").count()) === 0, "snoozed for 30 minutes after continue");

    console.log("all extension checks passed");
  } finally {
    await api("POST", "/api/settings", { entertainmentSites: originalSettings.entertainmentSites, pauseSeconds: originalSettings.pauseSeconds });
    await context.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
