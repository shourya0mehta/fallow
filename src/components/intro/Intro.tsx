"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGarden } from "@/components/garden/GardenContext";
import { PLANT_NAME } from "@/components/garden/names";
import { PlantIcon } from "@/components/garden/PlantIcon";
import { DOMAINS } from "@/core/taxonomy";
import type { DomainId } from "@/core/types";
import type { PlantStatus } from "@/pixel/plants";
import { fly, nextFrame, sleep } from "./flight";
import { Shumbo, type ShumboHandle, type ShumboMood } from "./Shumbo";

/**
 * "Meet Shumbo": the first-visit walkthrough. Shumbo bounces in, the word
 * fallow gets defined, the eleven plants gather around him, you try watering
 * one, and then everything flies down into the real garden underneath.
 *
 * Tap or press → to move on, ← to go back, Esc to skip.
 */

type BeatId = "hello" | "busy" | "handoff" | "fallow" | "garden" | "grow" | "why" | "ready";
const BEATS: BeatId[] = ["hello", "busy", "handoff", "fallow", "garden", "grow", "why", "ready"];

export type IntroChoice = "start" | "demo" | "back" | "skip";

/** Friendly one-word names for the intro's plant circle. */
export const INTRO_LABEL: Record<DomainId, string> = {
  composition: "Writing",
  analysis: "Reasoning",
  quantitative: "Math",
  recall: "Memory",
  synthesis: "Reading",
  navigation: "Navigating",
  planning: "Planning",
  ideation: "Ideas",
  implementation: "Building",
  verbal: "Talking",
  attention: "Focus",
};

const BLURB: Record<DomainId, string> = {
  composition: "Putting your thoughts into words.",
  analysis: "Debugging, diagnosing, working out why.",
  quantitative: "Math, estimates, numbers.",
  recall: "Names, facts, the stuff you look up.",
  synthesis: "Reading closely and pulling ideas together.",
  navigation: "Finding your way without the blue dot.",
  planning: "Breaking big things into steps.",
  ideation: "Coming up with ideas and names.",
  implementation: "Turning a plan into code or formulas.",
  verbal: "Explaining things out loud.",
  attention: "Staying on one thing for a while.",
};

const BUSY_CHIPS = ["write", "math", "remember", "explore"];
const FIELD: DomainId[] = ["synthesis", "synthesis", "synthesis", "synthesis", "synthesis", "synthesis"];
const FIELD_STEPS: PlantStatus[] = ["fresh", "fading", "stale", "fallow"];
const GROW_STEPS: PlantStatus[] = ["fallow", "stale", "fading", "fresh"];

interface Geo {
  w: number;
  h: number;
  s: number; // Shumbo scale
  p: number; // plant scale
  ground: number; // y of Shumbo's feet in the stage
  cx: number;
  cy: number; // ring centre
  rx: number;
  ry: number;
}

function geometry(w: number, h: number): Geo {
  let s = w >= 1400 ? 8 : w >= 1100 ? 7 : w >= 900 ? 6 : w >= 600 ? 5 : 4;
  while (s > 3 && 60 * s + 150 > h) s -= 1;
  const p = s >= 8 ? 4 : s >= 6 ? 3 : 2;
  const ground = Math.round(h * 0.6);
  const cx = Math.round(w / 2);
  const cy = Math.round(ground - 11 * s);
  // the top plant (icon and label) has to fit under the stage's top edge, the bottom one above the card
  const ry = Math.max(70, Math.min(cy - 15 * p - 30, h - cy - 30, 250));
  const rx = Math.max(130, Math.min(w / 2 - 44, Math.max(ry * 1.7, 150), 470));
  return { w, h, s, p, ground, cx, cy, rx, ry };
}

export function Intro({ hasOwnGarden, prepare, onClose }: { hasOwnGarden: boolean; prepare: (c: IntroChoice) => Promise<void>; onClose: (c: IntroChoice) => void }) {
  const { engine } = useGarden();
  const [i, setI] = useState(0);
  const beat = BEATS[i];
  const stageRef = useRef<HTMLDivElement>(null);
  const shumbo = useRef<ShumboHandle>(null);
  const shumboEl = useRef<HTMLDivElement>(null);
  const plantEls = useRef(new Map<DomainId, HTMLCanvasElement>());
  const rootRef = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [reduced, setReduced] = useState(false);
  const [ringOut, setRingOut] = useState(false);
  const [picked, setPicked] = useState<DomainId | null>(null);
  const [grow, setGrow] = useState(1); // index into GROW_STEPS, starts dry
  const [tried, setTried] = useState(false);
  const [field, setField] = useState(0);
  const [pokes, setPokes] = useState(0);
  const [leaving, setLeaving] = useState<null | "fly" | "landed" | "fade">(null);

  // size the stage
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setGeo(geometry(el.clientWidth, el.clientHeight)));
    ro.observe(el);
    setGeo(geometry(el.clientWidth, el.clientHeight));
    setReduced(!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    rootRef.current?.focus();
    return () => {
      ro.disconnect();
      document.body.style.overflow = prev;
    };
  }, []);

  // never leave the real garden half hidden if the intro goes away mid-flight
  useEffect(() => {
    const eng = engine;
    return () => eng.current?.showAll();
  }, [engine]);

  // the ring of plants fans out from Shumbo once, and stays from the garden beat on
  const ringVisible = i >= BEATS.indexOf("garden");
  useEffect(() => {
    if (!ringVisible) {
      setRingOut(false);
      return;
    }
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setRingOut(true)));
    return () => cancelAnimationFrame(id);
  }, [ringVisible]);

  // the field goes fallow, plant by plant
  useEffect(() => {
    if (beat !== "fallow") return;
    setField(0);
    const id = setInterval(() => setField((c) => (c > 40 ? c : c + 1)), reduced ? 60 : 210);
    return () => clearInterval(id);
  }, [beat, reduced]);

  const go = useCallback((d: number) => {
    setPicked(null);
    setI((x) => Math.max(0, Math.min(BEATS.length - 1, x + d)));
  }, []);

  const finish = useCallback(
    async (choice: IntroChoice) => {
      if (leaving) return;
      if (choice === "skip") {
        setLeaving("fade");
        await sleep(320);
        onClose("skip");
        return;
      }
      setLeaving("fly");
      await prepare(choice);
      await nextFrame();
      await nextFrame();
      const eng = engine.current;
      const canvas = eng?.canvasElement;
      window.scrollTo(0, 0);
      await nextFrame();
      if (!eng || !canvas || reduced) {
        setLeaving("fade");
        await sleep(320);
        onClose(choice);
        return;
      }
      const cr = canvas.getBoundingClientRect();
      // the real plants and pet wait out of sight; each flyer hands over to its twin as it lands
      eng.hideForLanding(DOMAINS.map((d) => d.id));
      const landings: Promise<void>[] = [];
      const touchdown = (a: Animation, el: HTMLElement, done: () => void) =>
        a.finished
          .catch(() => undefined)
          .then(() => {
            el.style.visibility = "hidden";
            done();
          });
      DOMAINS.forEach((d, n) => {
        const el = plantEls.current.get(d.id);
        const box = eng.plantBox(d.id);
        if (!el || !box) return eng.land(d.id);
        landings.push(touchdown(fly(el, { x: cr.left + box.x, y: cr.top + box.y, w: box.w }, { delay: n * 45, duration: 950 }), el, () => eng.land(d.id)));
      });
      const body = shumbo.current?.bodyRect();
      const sEl = shumboEl.current?.querySelector("canvas");
      if (body && sEl) {
        const pet = eng.petBox();
        const r = sEl.getBoundingClientRect();
        const k = pet.w / body.width;
        landings.push(touchdown(fly(sEl, { x: cr.left + pet.x - (body.left - r.left) * k, y: cr.top + pet.y - (body.top - r.top) * k, w: r.width * k }, { delay: 160, duration: 1000, arc: 60 }), sEl, () => eng.landPet()));
      } else eng.landPet();
      await Promise.all(landings);
      setLeaving("landed");
      await sleep(260);
      onClose(choice);
    },
    [engine, leaving, onClose, prepare, reduced],
  );

  // keys: → next, ← back, Esc skip
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (leaving) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === "Escape") return void finish("skip");
      if (tag === "BUTTON" || tag === "INPUT" || tag === "A") return;
      if (e.key === "ArrowRight" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (beat !== "ready") go(1);
      } else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [beat, finish, go, leaving]);

  const growStatus = GROW_STEPS[grow];
  const mood: ShumboMood =
    beat === "hello" || beat === "why" || beat === "ready"
      ? "bounce"
      : beat === "busy"
        ? "think"
        : beat === "handoff"
          ? "tired"
          : beat === "fallow"
            ? "look"
            : beat === "grow"
              ? growStatus === "fresh"
                ? "cheer"
                : growStatus === "fallow"
                  ? "sad"
                  : growStatus === "stale"
                    ? "tired"
                    : "idle"
              : "idle";

  const onStageClick = (e: React.MouseEvent) => {
    if (leaving) return;
    if ((e.target as HTMLElement).closest("button, .intro-plant, .shumbo, .intro-grow, a")) return;
    if (beat !== "ready" && beat !== "grow") go(1);
  };

  const g = geo;
  const shumboW = g ? 56 * g.s : 0;
  const shumboH = g ? 60 * g.s : 0;

  return (
    <div
      ref={rootRef}
      className={`intro beat-${beat}${leaving ? ` leaving-${leaving}` : ""}${reduced ? " reduced" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Meet Shumbo"
      tabIndex={-1}
    >
      <div className="intro-backdrop" aria-hidden="true">
        <span className="intro-cloud c1" />
        <span className="intro-cloud c2" />
        <span className="intro-cloud c3" />
      </div>

      <div className="intro-top">
        <span className="intro-brand">Fallow</span>
        <button className="intro-skip" onClick={() => finish("skip")}>
          Skip intro
        </button>
      </div>

      <div className="intro-stage" ref={stageRef} onClick={onStageClick}>
        {g && (
          <>
            <div className="intro-meadow" style={{ top: g.ground - g.s }} aria-hidden="true" />
            {/* the field row for "fallow" */}
            {beat === "fallow" &&
              FIELD.map((id, n) => {
                const off = [-4.3, -3.2, -2.1, 2.1, 3.2, 4.3][n];
                const step = Math.max(0, Math.min(3, Math.floor((field - n * 2) / 4)));
                return (
                  <div key={n} className="intro-field" style={{ left: g.cx + off * 11 * g.s, top: g.ground }}>
                    <PlantIcon id={id} status={FIELD_STEPS[step]} scale={g.p} />
                  </div>
                );
              })}

            {/* thinking chips for "busy" */}
            {beat === "busy" &&
              BUSY_CHIPS.map((w, n) => {
                const a = (-150 + n * 40) * (Math.PI / 180);
                return (
                  <span key={w} className="intro-chip" style={{ left: g.cx + Math.cos(a) * (g.s * 30), top: g.cy + Math.sin(a) * (g.s * 22), animationDelay: `${n * 0.18}s` }}>
                    {w}
                  </span>
                );
              })}

            {/* AI bubbles carrying sparkles off for "handoff" */}
            {beat === "handoff" &&
              [0, 1, 2].map((n) => (
                <span key={n} className="intro-ai" style={{ left: g.cx + g.s * 8, top: g.cy - g.s * 6, animationDelay: `${n * 0.9}s` }}>
                  AI
                </span>
              ))}

            {/* Shumbo */}
            <div className="intro-shumbo" ref={shumboEl} style={{ left: g.cx - shumboW / 2, top: g.ground - 52 * g.s }}>
              <Shumbo
                ref={shumbo}
                mood={mood}
                scale={g.s}
                reduced={reduced}
                label="Shumbo, your brain pet"
                onPoke={() => {
                  shumbo.current?.hop();
                  setPokes((n) => n + 1);
                }}
              />
            </div>

            {/* the garden: eleven plants around him */}
            {ringVisible &&
              DOMAINS.map((d, n) => {
                const a = (-90 + (360 / DOMAINS.length) * n) * (Math.PI / 180);
                const x = ringOut ? g.cx + Math.cos(a) * g.rx : g.cx;
                const y = ringOut ? g.cy + Math.sin(a) * g.ry + 15 * g.p : g.cy;
                return (
                  <button
                    key={d.id}
                    className={`intro-plant${ringOut ? " out" : ""}${picked === d.id ? " picked" : ""}${beat === "grow" ? " dim" : ""}`}
                    style={{ left: x, top: y, transitionDelay: ringOut && !reduced ? `${n * 70}ms` : "0ms" }}
                    onClick={() => setPicked(d.id)}
                    tabIndex={beat === "garden" ? 0 : -1}
                    aria-label={`${INTRO_LABEL[d.id]}: ${PLANT_NAME[d.id].one}`}
                  >
                    <PlantIcon
                      id={d.id}
                      status="fresh"
                      scale={g.p}
                      className="intro-plant-icon"
                      canvasRef={(el) => {
                        if (el) plantEls.current.set(d.id, el);
                        else plantEls.current.delete(d.id);
                      }}
                    />
                    <span className="intro-label">{INTRO_LABEL[d.id]}</span>
                  </button>
                );
              })}

            {/* the watering demo for "grow" */}
            {beat === "grow" && (
              <div className="intro-grow" style={{ left: g.cx + 21 * g.s, top: g.ground }}>
                <PlantIcon id="quantitative" status={growStatus} scale={g.p + 1} />
                {tried && growStatus === "fresh" && <span className="intro-sparkles" aria-hidden="true" />}
              </div>
            )}
          </>
        )}
      </div>

      <div className="intro-card" aria-live="polite">
        <div className="intro-copy" key={beat}>
          {beat === "hello" && (
            <>
              <h2>This is Shumbo.</h2>
              <p>He&apos;s your brain. Well, a tiny pixel version of it.</p>
              <p className="intro-hint">{pokes === 0 ? "Tap him to say hi." : pokes < 3 ? "He likes you." : "Okay, he really likes you."}</p>
            </>
          )}
          {beat === "busy" && (
            <>
              <h2>Shumbo grows by thinking.</h2>
              <p>Writing, math, remembering, finding his way around. Every bit of it keeps him strong.</p>
            </>
          )}
          {beat === "handoff" && (
            <>
              <h2>Lately, AI does a lot of it for him.</h2>
              <p>Super handy. But the parts he stops using start to rest.</p>
            </>
          )}
          {beat === "fallow" && (
            <>
              <h2 className="intro-word">
                fal·low <span className="intro-ipa">/ˈfæl.oʊ/</span>
              </h2>
              <p className="intro-def">
                <i>adjective.</i> Farmland left unplanted for a season so it can rest.
              </p>
              <p>A season off is healthy. Too many, and the weeds move in.</p>
            </>
          )}
          {beat === "garden" && (
            <>
              <h2>So Shumbo keeps a garden.</h2>
              {picked ? (
                <p>
                  <b>{INTRO_LABEL[picked]}</b> grows <b>{PLANT_NAME[picked].one}</b>. {BLURB[picked]}
                </p>
              ) : (
                <p>One plant for each kind of thinking. Tap any plant to meet it.</p>
              )}
            </>
          )}
          {beat === "grow" && (
            <>
              <h2>You&apos;re the gardener.</h2>
              <p>Do the thinking yourself and a plant blooms. Hand it all to AI and it wilts. Try it:</p>
              <div className="intro-actions">
                <button
                  className="btn"
                  onClick={() => {
                    setGrow(3);
                    setTried(true);
                  }}
                >
                  Do it myself
                </button>
                <button
                  className="btn ghost"
                  onClick={() => {
                    setGrow((x) => Math.max(0, x === 3 ? 2 : x - 1));
                    setTried(true);
                  }}
                >
                  Hand it to AI
                </button>
              </div>
            </>
          )}
          {beat === "why" && (
            <>
              <h2>Use AI for what you don&apos;t need.</h2>
              <p>Keep doing the things you want to stay good at. Fallow spots what&apos;s going fallow and nudges you to try first.</p>
            </>
          )}
          {beat === "ready" && (
            <>
              <h2>{hasOwnGarden ? "Back to your garden." : "Shumbo needs a gardener."}</h2>
              <p>{hasOwnGarden ? "Your plants missed you." : "Start your own garden, or peek at one that's been growing for 90 days."}</p>
              <div className="intro-actions">
                {hasOwnGarden ? (
                  <button className="btn" onClick={() => finish("back")} disabled={!!leaving}>
                    Back to my garden
                  </button>
                ) : (
                  <>
                    <button className="btn" onClick={() => finish("start")} disabled={!!leaving}>
                      Start my garden
                    </button>
                    <button className="btn ghost" onClick={() => finish("demo")} disabled={!!leaving}>
                      Peek at a demo
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <div className="intro-nav">
          <button className="intro-back" onClick={() => go(-1)} disabled={i === 0 || !!leaving} aria-label="Back">
            ‹ Back
          </button>
          <div className="intro-dots" aria-label={`Step ${i + 1} of ${BEATS.length}`}>
            {BEATS.map((b, n) => (
              <span key={b} className={n === i ? "on" : n < i ? "done" : undefined} />
            ))}
          </div>
          {beat !== "ready" ? (
            <button className="intro-next" onClick={() => go(1)} disabled={!!leaving}>
              Next ›
            </button>
          ) : (
            <span className="intro-next-gap" />
          )}
        </div>
      </div>
    </div>
  );
}
