"use client";

import Link from "next/link";
import { PetIcon, PlantIcon } from "@/components/garden/PlantIcon";
import { Research } from "@/components/how/Research";
import { SpriteIcon } from "@/components/how/SpriteIcon";
import { HEART, WATERING_CAN } from "@/pixel/sprites";

const BASE = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/^\/$/, "").replace(/\/$/, "");
const REPO = process.env.NEXT_PUBLIC_REPO_URL || "";

export default function HowPage() {
  return (
    <div className="page how">
      <div className="page-head">
        <h1>How it works</h1>
        <p>Studies keep finding the same thing: when you hand AI the finished answer, the skill behind it quietly fades. Fallow turns that into a garden you can see.</p>
      </div>

      <section className="card">
        <h2>The loop</h2>
        <div className="steps">
          <div className="step">
            <div className="step-art">
              <PetIcon scale={3} />
            </div>
            <b>1. Ask</b>
            <p>Type what you were about to ask an AI, or let the browser extension catch it in ChatGPT, Claude or Gemini.</p>
          </div>
          <div className="step">
            <div className="step-art">
              <PlantIcon id="composition" scale={2} />
              <PlantIcon id="quantitative" scale={2} />
              <PlantIcon id="recall" scale={2} />
            </div>
            <b>2. It&apos;s filed</b>
            <p>Each ask lands under one of eleven skills, and each skill is a plant: writing is lavender, memory is forget-me-nots, ideas are a dandelion.</p>
          </div>
          <div className="step">
            <div className="step-art">
              <PlantIcon id="quantitative" status="fresh" scale={1} />
              <PlantIcon id="quantitative" status="fading" scale={1} />
              <PlantIcon id="quantitative" status="stale" scale={1} />
              <PlantIcon id="quantitative" status="fallow" scale={1} ghost />
            </div>
            <b>3. Plants dry out</b>
            <p>Doing the work yourself waters a plant. Handing it off doesn&apos;t. Left alone, plants wilt on the same curve memory follows.</p>
          </div>
          <div className="step">
            <div className="step-art">
              <SpriteIcon grid={WATERING_CAN} scale={3} />
            </div>
            <b>4. Water them</b>
            <p>Quests point at the thirstiest plants. A short session without the AI waters one, and it perks up.</p>
          </div>
        </div>
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>Your brain pet</h2>
          <div className="pet-row">
            {(["thriving", "steady", "fading", "fallow"] as const).map((s) => (
              <figure key={s}>
                <PetIcon stage={s} scale={3} />
                <figcaption>{s}</figcaption>
              </figure>
            ))}
          </div>
          <p>
            Its health is <b>70%</b> how fresh your keep-list plants are, <b>20%</b> how much of your last month&apos;s asks you did yourself, and <b>10%</b> your energy right now. If you start handing a
            keep-list skill off more each week, it drops a stage before the numbers catch up.
          </p>
          <p className="pet-moves">
            <span>
              <SpriteIcon grid={HEART} scale={2} /> tap to hop
            </span>
            <span>double-click to spin</span>
            <span>hold or rub to pet</span>
            <span>too many clicks: dizzy</span>
          </p>
        </section>

        <section className="card">
          <h2>Today</h2>
          <ul className="today-list">
            <li>
              <b>Energy</b> comes from the three-process sleep model: how long you&apos;ve been awake plus your body clock. Set your sleep in Settings.
            </li>
            <li>
              <b>Own work</b> is the share of your asks you did yourself or worked through with hints.
            </li>
            <li>
              <b>Screens</b> is time on the sites you list, against your own budget. The extension adds a short pause before they open.
            </li>
            <li id="focus">
              <b>Focus</b> is your longest unbroken block, from{" "}
              <a href="https://activitywatch.net" target="_blank" rel="noreferrer">
                ActivityWatch
              </a>{" "}
              (free, runs on your computer). Then run <code>npm run attention</code> in the local app.
            </li>
          </ul>
        </section>
      </div>

      <section className="card">
        <h2>Where the data comes from</h2>
        <div className="grid-2 tight">
          <div>
            <p>
              <b>Your history.</b> Export it from ChatGPT or Claude and drop it on the <Link href="/journal#import">Journal</Link>. It&apos;s read in your browser.
            </p>
            <p>
              <b>As you go.</b> The browser extension shows the pet&apos;s verdict before a prompt leaves ChatGPT, Claude or Gemini, and a Claude Code hook does the same in the terminal.
            </p>
            <p>
              <b>Private by design.</b> No accounts, no server that sees your prompts. The garden lives in this browser (or one file, if you run the app locally).
            </p>
            <p>
              Try the extension&apos;s card without installing it: <Link href="/demo/chat">demo chat</Link>.
            </p>
          </div>
          <div className="shots">
            <img src={`${BASE}/img/extension-card.png`} alt="The extension's verdict card over a chat window" />
            <img src={`${BASE}/img/extension-pause.png`} alt="The pause before a listed site opens" />
          </div>
        </div>
      </section>

      <section className="card">
        <h2>What it does not claim</h2>
        <p>
          Fallow measures what you ask, not what your brain can do. It doesn&apos;t diagnose anything or predict disease, and the plants aren&apos;t brain regions. The decay rates and thresholds are borrowed from
          memory research or guessed, and the code says which. Whether a dry plant predicts a real drop on a task you do without AI is the first study to run, and nobody has run it yet.
        </p>
      </section>

      <section className="card" id="research">
        <h2>The research</h2>
        <p className="card-sub">Every mechanism traces to a finding. Open any one.</p>
        <Research />
      </section>

      <p className="built-with">
        Built with TypeScript, Next.js, React and pixel art drawn as code.{" "}
        {REPO && (
          <a href={REPO} target="_blank" rel="noreferrer">
            Source on GitHub
          </a>
        )}
      </p>
    </div>
  );
}
