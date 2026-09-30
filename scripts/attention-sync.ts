/**
 * Pull today's window, AFK and browser-tab events from a local ActivityWatch
 * server, summarize them, and post the result to Fallow:
 *   - one attention-day signal (switches/hour, longest block, entertainment minutes)
 *   - one sustained-attention practice event per focus block of 25 minutes or more
 *
 *   npm run attention            # once, for today
 *   npm run attention -- --watch # every 5 minutes
 *   npm run attention -- --day 2026-09-28
 *
 * Environment: AW_URL (default http://localhost:5600), FALLOW_URL (default http://localhost:3000).
 * ActivityWatch is open source (MPL-2.0): https://activitywatch.net
 */
import { summarizeAttention, type AwEvent } from "../src/core/attention";
import { localDateKey } from "../src/core/time";

const AW = process.env.AW_URL ?? "http://localhost:5600";
const FALLOW = process.env.FALLOW_URL ?? "http://localhost:3000";

interface Bucket {
  id: string;
  type: string;
  client: string;
  hostname: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}

async function postJson(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}: ${await res.text()}`);
  return res.json();
}

function dayBounds(day: string): { start: Date; end: Date } {
  const [y, m, d] = day.split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  return { start, end };
}

async function events(bucketId: string, start: Date, end: Date): Promise<AwEvent[]> {
  const url = `${AW}/api/0/buckets/${encodeURIComponent(bucketId)}/events?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}&limit=20000`;
  return getJson<AwEvent[]>(url);
}

async function syncDay(day: string): Promise<void> {
  const buckets = await getJson<Record<string, Bucket>>(`${AW}/api/0/buckets/`);
  const list = Object.values(buckets);
  const windowBucket = list.find((b) => b.type === "currentwindow");
  const afkBucket = list.find((b) => b.type === "afkstatus");
  const webBucket = list.find((b) => b.type === "web.tab.current");
  if (!windowBucket) throw new Error("No aw-watcher-window bucket found. Is ActivityWatch running?");

  const { start, end } = dayBounds(day);
  const [win, afk, web, settings] = await Promise.all([
    events(windowBucket.id, start, end),
    afkBucket ? events(afkBucket.id, start, end) : Promise.resolve([] as AwEvent[]),
    webBucket ? events(webBucket.id, start, end) : Promise.resolve([] as AwEvent[]),
    getJson<{ entertainmentSites: string[] }>(`${FALLOW}/api/settings`),
  ]);

  const summary = summarizeAttention({ window: win, afk, web, entertainmentSites: settings.entertainmentSites });

  await postJson(`${FALLOW}/api/signals`, {
    kind: "attention-day",
    day,
    ts: start.toISOString(),
    activeMin: summary.activeMin,
    switchesPerHour: summary.switchesPerHour,
    longestBlockMin: summary.longestBlockMin,
    entertainmentMin: summary.entertainmentMin,
    top: summary.top,
  });

  for (const block of summary.focusBlocks) {
    await postJson(`${FALLOW}/api/events`, {
      text: `Focus block: ${block.minutes} min in ${block.key}`,
      source: "activitywatch",
      ts: block.start,
      actor: "self",
      icap: "active",
      minutes: block.minutes,
      demanding: block.minutes >= 45,
      domains: [{ id: "attention", weight: 1 }],
    });
  }

  console.log(
    `${day}: active ${summary.activeMin} min, ${summary.switchesPerHour} switches/h, longest block ${summary.longestBlockMin} min, entertainment ${summary.entertainmentMin} min, ${summary.focusBlocks.length} focus blocks logged.`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const watch = args.includes("--watch");
  const dayArg = args[args.indexOf("--day") + 1];
  const day = args.includes("--day") && dayArg ? dayArg : localDateKey(new Date());
  do {
    try {
      await syncDay(watch ? localDateKey(new Date()) : day);
    } catch (err) {
      console.error((err as Error).message);
      if (!watch) process.exit(1);
    }
    if (watch) await new Promise((r) => setTimeout(r, 5 * 60_000));
  } while (watch);
}

main();
