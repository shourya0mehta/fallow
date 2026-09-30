/**
 * Seed a demo ledger: about 90 days of a student developer's asks.
 * Deterministic (seeded PRNG) so screenshots are reproducible.
 *
 *   npm run seed          # writes data/fallow.json (refuses if it already has entries)
 *   npm run seed -- --force
 */
import { promises as fs } from "node:fs";
import { eventFromPrompt } from "../src/core/events";
import { dataPath, emptyLedger, loadLedger, saveLedger } from "../src/core/store";
import type { LedgerEvent } from "../src/core/types";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POOLS: Array<{ weight: number; source: LedgerEvent["source"]; prompts: string[] }> = [
  {
    weight: 9,
    source: "hook-claude-code",
    prompts: [
      "Write a function that parses the SNOTEL CSV and returns daily SWE as a pandas DataFrame",
      "Implement the Drizzle schema for playlists with a content-addressed object table",
      "Write the React component for the deadline card with a countdown",
      "Add a unit test for the LCS diff on empty inputs",
      "Refactor this into a provider-agnostic adapter interface\n```ts\nexport class SpotifyRemote {}\n```",
      "Write a bash script to batch convert the flac files to 16kHz mono wav",
      "Write the SQL to get weekly active users by cohort",
      "Generate the boilerplate for a Next.js API route that validates the body",
      "Write a regex that matches ISO dates but not times",
    ],
  },
  {
    weight: 7,
    source: "hook-claude-code",
    prompts: [
      "Why doesn't this work? TypeError: Cannot read properties of undefined (reading 'map')\n```js\nconst rows = data.items.map(r => r.id)\n```",
      "Fix this stack trace, the migration fails on the second run",
      "Why is the beat tracker drifting after 30 seconds? Here's the onset detection code",
      "Debug: the iCal feed validates locally but Google Calendar refuses it",
      "Root cause this flaky test, it passes alone and fails in the suite",
      "Why does the particle filter collapse to one particle after a few steps?",
    ],
  },
  {
    weight: 5,
    source: "import-chatgpt",
    prompts: [
      "Write me an email to my professor asking for a two week extension on the GIS project",
      "Write a cover letter for a data science internship at a climate startup",
      "Draft a LinkedIn post about presenting at AGU",
      "Rewrite this paragraph so it sounds less stiff",
      "Write the abstract for our urbanization and green fragmentation paper",
      "Compose a short bio for the hackathon team page",
    ],
  },
  {
    weight: 4,
    source: "import-chatgpt",
    prompts: [
      "Summarize the key points of this paper on snow water equivalent and climate indices",
      "TL;DR this thread about the Pinterest API deprecation",
      "Give me the main takeaways from this article on cognitive reserve",
      "Summarize this lecture transcript into study notes",
    ],
  },
  {
    weight: 3,
    source: "import-chatgpt",
    prompts: [
      "Make me a study plan for the next three weeks before the exam with milestones",
      "Break down the acoustic monitoring pilot into a two-month roadmap",
      "Prioritize these five tasks for this week and give me a schedule",
      "Plan an itinerary for a weekend in Chicago near the campus",
    ],
  },
  {
    weight: 2,
    source: "import-chatgpt",
    prompts: [
      "Calculate the sample size I need for 80% power with an effect size of 0.3",
      "What's 18% of 2,340 and then convert that to per-month?",
      "Solve for x: 3x^2 - 5x + 1 = 0",
      "What's the standard deviation of these numbers: 12, 15, 9, 22, 18",
    ],
  },
  {
    weight: 1,
    source: "import-chatgpt",
    prompts: [
      "Give me a hint on this integral, don't give me the answer: integral of x e^x dx",
      "Don't solve it, just point me in the right direction for this recurrence relation",
      "Hint only: why might the residuals be heteroscedastic here?",
    ],
  },
  {
    weight: 2,
    source: "import-chatgpt",
    prompts: [
      "Brainstorm ten names for an acoustic biodiversity monitoring app",
      "Give me ideas for a blog post about phantom green growth",
      "Come up with angles for a pitch about club recruitment deadlines",
      "Suggest titles for my AGU poster on SWE and teleconnections",
    ],
  },
  {
    weight: 2,
    source: "import-chatgpt",
    prompts: [
      "What's the syntax for a Python list comprehension with a condition?",
      "Remind me, what does the -p flag do in mkdir?",
      "What is the capital of Burkina Faso?",
      "What's the name of the effect where saving a file frees up memory?",
      "Which command shows disk usage per folder on mac?",
    ],
  },
  {
    weight: 1,
    source: "import-claude",
    prompts: [
      "What should I say to my landlord about the broken heater without sounding rude?",
      "How do I tell my teammate the PR needs to be split up?",
      "Reply to this message from the club president politely declining",
    ],
  },
  {
    weight: 1,
    source: "import-claude",
    prompts: ["How do I get to the airport from campus without the highway?", "Which way is the lake from the engineering quad?"],
  },
  {
    weight: 2,
    source: "import-claude",
    prompts: [
      "Here's my draft of the email to my advisor, can you check my tone?",
      "Review my argument in this essay intro, is it clear?",
      "Explain why the LSTM overfits after epoch 10",
      "I wrote this function, is the recursion base case right?",
    ],
  },
];

async function main() {
  const force = process.argv.includes("--force");
  const existing = await loadLedger();
  if (existing.events.length > 0 && !force) {
    console.error(`Refusing to overwrite ${existing.events.length} entries in ${dataPath()}. Use --force.`);
    process.exit(1);
  }
  const rand = rng(20260929);
  const now = new Date();
  const events: LedgerEvent[] = [];
  const totalWeight = POOLS.reduce((a, p) => a + p.weight, 0);

  for (let day = 90; day >= 0; day--) {
    const dow = new Date(now.getTime() - day * 86_400_000).getDay();
    const asksToday = dow === 0 || dow === 6 ? Math.floor(rand() * 3) : 2 + Math.floor(rand() * 6);
    for (let i = 0; i < asksToday; i++) {
      let pick = rand() * totalWeight;
      const pool = POOLS.find((p) => (pick -= p.weight) < 0) ?? POOLS[0];
      const prompt = pool.prompts[Math.floor(rand() * pool.prompts.length)];
      const hour = 9 + Math.floor(rand() * 13);
      const minute = Math.floor(rand() * 60);
      const ts = new Date(now.getTime() - day * 86_400_000);
      ts.setHours(hour, minute, Math.floor(rand() * 60), 0);
      if (ts > now) continue;
      const e = eventFromPrompt(prompt, { source: pool.source, ts: ts.toISOString(), key: `seed|${day}|${i}|${prompt}` });
      events.push(e);
    }
  }

  // A few self-done sessions, so the field is not uniformly fallow.
  const selfSessions: Array<[number, string, number]> = [
    [2, "Debugged the flaky iCal test myself, two hypotheses, found the timezone bug", 45],
    [9, "Wrote the AGU poster abstract by hand, then asked for a critique", 40],
    [16, "Worked through the particle filter update step on paper", 60],
    [30, "Drafted the club recruitment email myself", 25],
    [41, "Debugged the onset detector by bisecting the pipeline", 50],
    [55, "Wrote the first version of the fragmentation methods section", 35],
    [3, "Ninety-minute focus block on the thesis draft, notifications off", 90],
  ];
  for (const [day, text, minutes] of selfSessions) {
    const ts = new Date(now.getTime() - day * 86_400_000);
    ts.setHours(14, 10, 0, 0);
    const e = eventFromPrompt(text, { source: "seed", ts: ts.toISOString(), key: `seed-self|${day}|${text}` });
    e.actor = "self";
    e.icap = "constructive";
    e.askType = "other";
    e.minutes = minutes;
    e.demanding = minutes >= 40;
    if (text.includes("focus block")) e.domains = [{ id: "attention", weight: 0.5 }, { id: "composition", weight: 0.5 }];
    events.push(e);
  }

  // One argued-out exchange, logged as interactive shared work.
  {
    const ts = new Date(now.getTime() - 20 * 86_400_000);
    ts.setHours(16, 40, 0, 0);
    const e = eventFromPrompt("Let's argue this out. Push back on my claim that the fragmentation index is biased by patch size.", { source: "import-claude", ts: ts.toISOString(), key: "seed-argue" });
    events.push(e);
  }

  const ledger = emptyLedger();
  ledger.events = events.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  ledger.settings.keepList = ["composition", "analysis", "quantitative"];
  await saveLedger(ledger);
  const stat = await fs.stat(dataPath());
  console.log(`Seeded ${events.length} entries into ${dataPath()} (${Math.round(stat.size / 1024)} kB).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
