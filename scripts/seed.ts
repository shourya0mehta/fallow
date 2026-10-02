/**
 * Seed a ledger with ninety days of sample asks: everyday requests from the
 * bank in src/data/demo-asks.ts, a few practice sessions and a week of screen
 * summaries. Deterministic (seeded PRNG) so screenshots are reproducible.
 *
 *   npm run seed          # writes data/fallow.json (refuses if it already has entries)
 *   npm run seed -- --force
 *   npm run seed:demo     # writes src/data/demo.json, the garden behind "Peek at a demo"
 *
 * Times are written as UTC wall-clock times with the last day as "today".
 * localizeDemo() re-dates them for whoever is looking, so the demo never ages.
 */
import { promises as fs } from "node:fs";
import { localizeDemo } from "../src/core/demo";
import { buildPromptEvent } from "../src/core/ledger";
import { dataPath, demoPath, emptyLedger, loadLedger, saveLedger } from "../src/core/store";
import type { DomainId, LedgerEvent, Source, Signal } from "../src/core/types";
import { DEMO_ASKS, DEMO_PRACTICE, type AskDomain } from "../src/data/demo-asks";
import { DOMAIN_BY_ID } from "../src/core/taxonomy";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAYS = 90;

/** How often each plant comes up in everyday asks (relative). */
const WEIGHT: Record<AskDomain, number> = {
  implementation: 16,
  composition: 16,
  analysis: 12,
  synthesis: 11,
  recall: 10,
  planning: 8,
  quantitative: 8,
  ideation: 7,
  verbal: 6,
  navigation: 5,
};

/**
 * Share of asks that keep the person in the loop, for the plants they practice
 * all along. The rest get only the planned asks below, so the demo shows every
 * condition at once: fresh, fading, stale and fallow.
 */
const SHARED_RATE: Partial<Record<AskDomain, number>> = { analysis: 0.4, composition: 0.25, implementation: 0.25, ideation: 0.2 };

/** One-off shared asks, as days before the last day: they set how far the less-practiced plants have dried. */
const PLANNED_SHARED: Array<[number, AskDomain]> = [
  [84, "quantitative"],
  [66, "quantitative"],
  [78, "synthesis"],
  [86, "recall"],
  [87, "planning"],
];

/** Practice sessions from the garden: days before the last day, plant, minutes. */
const SESSIONS: Array<[number, DomainId, number]> = [
  [58, "quantitative", 25],
  [40, "composition", 30],
  [14, "composition", 25],
  [2, "composition", 20],
  [26, "analysis", 30],
  [8, "analysis", 25],
  [21, "implementation", 45],
  [6, "implementation", 30],
  [1, "implementation", 25],
  [4, "ideation", 15],
  [12, "attention", 45],
  [3, "attention", 60],
];

/** Asks checked in the ask bar and then done without the AI: days before the last day, plant. */
const DID_IT_MYSELF: Array<[number, AskDomain]> = [
  [16, "analysis"],
  [11, "implementation"],
  [9, "composition"],
];

/** Where an ask came from: imported history first, the extension and the ask bar for the last month. */
function sourceFor(domain: AskDomain, day: number, rand: () => number): Source {
  if (domain === "implementation") return "hook-claude-code";
  if (day > 30) return rand() < 0.65 ? "import-chatgpt" : "import-claude";
  return rand() < 0.75 ? "extension-chat" : "gate";
}

/** Each plant's bank, dealt out like a shuffled deck so the same ask never comes up twice in a row. */
function dealer(rand: () => number) {
  const decks = new Map<string, string[]>();
  return (key: string, cards: string[]): string => {
    let deck = decks.get(key);
    if (!deck || deck.length === 0) {
      deck = [...cards];
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      decks.set(key, deck);
    }
    return deck.pop()!;
  };
}

function utcAt(anchor: Date, day: number, hour: number, minute: number, second = 0): string {
  return new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate() - day, hour, minute, second)).toISOString();
}

export function seedLedger(anchor: Date = new Date()) {
  const rand = rng(20261002);
  const deal = dealer(rand);
  const events: LedgerEvent[] = [];
  const domains = Object.keys(WEIGHT) as AskDomain[];
  const totalWeight = domains.reduce((a, d) => a + WEIGHT[d], 0);
  const push = (e: LedgerEvent | null) => e && events.push(e);

  // everyday asks: two to six on weekdays, up to two on weekends
  for (let day = DAYS; day >= 0; day--) {
    const dow = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate() - day)).getUTCDay();
    const asks = dow === 0 || dow === 6 ? Math.floor(rand() * 3) : 2 + Math.floor(rand() * 5);
    for (let i = 0; i < asks; i++) {
      let pick = rand() * totalWeight;
      const domain = domains.find((d) => (pick -= WEIGHT[d]) < 0) ?? domains[0];
      const bank = DEMO_ASKS[domain];
      const shared = bank.shared.length > 0 && rand() < (SHARED_RATE[domain] ?? 0);
      const text = shared ? deal(`${domain}:shared`, bank.shared) : deal(`${domain}:ai`, bank.ai);
      const hour = 8 + Math.floor(rand() * 15);
      push(buildPromptEvent({ text, source: sourceFor(domain, day, rand), ts: utcAt(anchor, day, hour, Math.floor(rand() * 60), Math.floor(rand() * 60)) }));
    }
  }

  for (const [day, domain] of PLANNED_SHARED) {
    push(buildPromptEvent({ text: deal(`${domain}:shared`, DEMO_ASKS[domain].shared), source: day > 30 ? "import-chatgpt" : "extension-chat", ts: utcAt(anchor, day, 9 + Math.floor(rand() * 12), Math.floor(rand() * 60)) }));
  }

  for (const [day, domain, minutes] of SESSIONS) {
    const note = deal(`${domain}:practice`, DEMO_PRACTICE[domain]);
    push(buildPromptEvent({ text: `Practice: ${DOMAIN_BY_ID[domain].label}, ${note}`, source: "practice", actor: "self", icap: "constructive", minutes, demanding: minutes >= 25, domains: [{ id: domain, weight: 1 }], ts: utcAt(anchor, day, 7 + Math.floor(rand() * 15), Math.floor(rand() * 60)) }));
  }

  for (const [day, domain] of DID_IT_MYSELF) {
    push(buildPromptEvent({ text: deal(`${domain}:ai`, DEMO_ASKS[domain].ai), source: "gate", actor: "self", icap: "constructive", ts: utcAt(anchor, day, 9 + Math.floor(rand() * 10), Math.floor(rand() * 60)) }));
  }

  // a week of screen summaries and a few pauses, so the screens strip is not empty
  const signals: Signal[] = [];
  for (let day = 6; day >= 0; day--) {
    const ts = utcAt(anchor, day, 0, 0);
    const key = ts.slice(0, 10);
    const fun = Math.round(25 + rand() * 60);
    signals.push({
      id: `attention|${key}`,
      ts,
      kind: "attention-day",
      day: key,
      activeMin: Math.round(300 + rand() * 200),
      switchesPerHour: Math.round((6 + rand() * 14) * 10) / 10,
      longestBlockMin: Math.round(20 + rand() * 60),
      entertainmentMin: fun,
      top: [
        { name: "Google Chrome: docs.google.com", minutes: Math.round(90 + rand() * 90) },
        { name: "Code", minutes: Math.round(40 + rand() * 60) },
        { name: "Google Chrome: youtube.com", minutes: fun - 10 },
        { name: "Slack", minutes: Math.round(20 + rand() * 30) },
        { name: "Google Chrome: reddit.com", minutes: 10 },
      ],
    });
    const opens = 1 + Math.floor(rand() * 4);
    for (let i = 0; i < opens; i++) {
      const t = utcAt(anchor, day, 12 + Math.floor(rand() * 10), Math.floor(rand() * 60));
      const closed = rand() < 0.36;
      const site = rand() < 0.6 ? "youtube.com" : rand() < 0.5 ? "reddit.com" : "instagram.com";
      signals.push({ id: `pause|${t}|${site}`, ts: t, kind: "pause", site, outcome: closed ? "closed" : "continued", waitedSeconds: closed ? 4 + Math.floor(rand() * 6) : 10 });
    }
  }

  const ledger = emptyLedger();
  ledger.events = events.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  ledger.signals = signals.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  ledger.settings.keepList = ["composition", "analysis", "quantitative"];
  return ledger;
}

async function main() {
  const force = process.argv.includes("--force");
  const demo = process.argv.includes("--demo");
  if (demo) process.env.FALLOW_DATA = demoPath();
  const existing = await loadLedger();
  if (existing.events.length > 0 && !force) {
    console.error(`Refusing to overwrite ${existing.events.length} entries in ${dataPath()}. Use --force.`);
    process.exit(1);
  }
  const seeded = seedLedger();
  // the demo file stays in UTC wall-clock time and is re-dated in the browser; a local ledger is dated now
  await saveLedger(demo ? seeded : localizeDemo(seeded, new Date()));
  const stat = await fs.stat(dataPath());
  console.log(`Seeded ${seeded.events.length} entries into ${dataPath()} (${Math.round(stat.size / 1024)} kB).`);
}

if (process.argv[1] && /(^|[\\/])seed\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
