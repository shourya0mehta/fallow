"use client";

import { useEffect, useRef, useState } from "react";
import type { CreatureReading } from "@/core/creature";
import { DOMAINS, DOMAIN_BY_ID } from "@/core/taxonomy";
import type { DomainId, DomainState } from "@/core/types";
import type { TimeOfDay } from "@/pixel/scene";
import { GardenEngine, plantStatusSummary, type PetMood } from "./engine";
import { useGarden } from "./GardenContext";
import { PLANT_NAME, STATUS_WORD } from "./names";

const TOD_CYCLE: Array<TimeOfDay | null> = [null, "dawn", "day", "dusk", "night"];
const TOD_LABEL: Record<string, string> = { auto: "Live sky", dawn: "Dawn", day: "Day", dusk: "Dusk", night: "Night" };

const PET_LINES: Partial<Record<PetMood, string[]>> = {
  dizzy: ["Whoa… the garden is spinning", "Too fast!"],
  wake: ["Mmh? It's sleep time…", "Five more minutes…"],
  spin: ["Wheee!", "Again!"],
  rub: ["Hehe, that tickles"],
};

export function Garden({ states, stage, asleep, quests, reading, demoEmpty }: { states: DomainState[]; stage: CreatureReading["stage"]; asleep: boolean; quests: DomainId[]; reading: CreatureReading; demoEmpty?: boolean }) {
  const { engine, bubble, say, select, selected } = useGarden();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tag, setTag] = useState<{ id: DomainId; x: number; y: number } | null>(null);
  const [petHover, setPetHover] = useState(false);
  const [petKnown, setPetKnown] = useState(true);
  const [layoutTick, setLayoutTick] = useState(0);
  const [tod, setTod] = useState<TimeOfDay | null>(null);
  const [showHealth, setShowHealth] = useState(false);
  const spoke = useRef(0);

  // create the engine once
  useEffect(() => {
    if (!canvasRef.current || !wrapRef.current) return;
    const e = new GardenEngine(canvasRef.current, wrapRef.current);
    engine.current = e;
    // a handle for end-to-end tests and the curious
    (wrapRef.current as unknown as { __garden?: GardenEngine }).__garden = e;
    e.start();
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) {
        e.resize(w);
        setLayoutTick((n) => n + 1);
      }
    });
    ro.observe(wrapRef.current);
    try {
      setPetKnown(window.localStorage.getItem("fallow.petKnown") === "1");
      const saved = window.localStorage.getItem("fallow.sky") as TimeOfDay | null;
      if (saved && TOD_CYCLE.includes(saved)) {
        setTod(saved);
        e.setTimeOfDay(saved);
      }
    } catch {
      /* storage is optional */
    }
    return () => {
      ro.disconnect();
      e.destroy();
      engine.current = null;
    };
  }, [engine]);

  // callbacks change with state, so re-register them
  useEffect(() => {
    engine.current?.setCallbacks({
      onHoverPlant: (id, a) => setTag(id && a ? { id, x: a.x, y: a.y } : null),
      onSelectPlant: (id) => select(id),
      onHoverPet: (over) => setPetHover(over),
      onPet: (mood) => {
        if (!petKnown && ["pet", "spin", "rub", "hop"].includes(mood)) {
          setPetKnown(true);
          try {
            window.localStorage.setItem("fallow.petKnown", "1");
          } catch {
            /* fine */
          }
        }
        const lines = PET_LINES[mood];
        if (lines && Date.now() - spoke.current > 2500) {
          spoke.current = Date.now();
          say(lines[Math.floor(Math.random() * lines.length)], 2400);
        }
      },
    });
  }, [engine, select, say, petKnown]);

  // feed data
  useEffect(() => {
    const byId = new Map(states.map((s) => [s.id, s]));
    engine.current?.setData({
      plants: DOMAINS.map((d) => ({ id: d.id, status: byId.get(d.id)?.status ?? "fallow" })),
      stage,
      asleep,
      quests,
    });
  }, [engine, states, stage, asleep, quests]);

  // a greeting, once per visit
  useEffect(() => {
    if (spoke.current) return;
    spoke.current = Date.now();
    const thirsty = states.filter((s) => s.id !== "attention" && (s.status === "stale" || s.status === "fallow")).length;
    const t = setTimeout(() => {
      if (demoEmpty) say("Hi! Plant something: ask the box below, or import your history.", 6000);
      else if (asleep) say("zzz… (it's past your bedtime)", 4000);
      else if (thirsty >= 3) say(`${thirsty} plants are thirsty. Water one?`, 6000);
      else if (thirsty > 0) say("Almost everything is growing. One plant needs you.", 6000);
      else say("Everything is growing!", 5000);
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const L = engine.current?.layout;
  void layoutTick;
  const statusOf = (id: DomainId) => states.find((s) => s.id === id)?.status ?? "fallow";
  const plants = DOMAINS.map((d) => ({ id: d.id, status: statusOf(d.id) }));
  const healthPct = Math.round(reading.health * 100);

  function cycleSky() {
    const i = TOD_CYCLE.indexOf(tod);
    const next = TOD_CYCLE[(i + 1) % TOD_CYCLE.length];
    setTod(next);
    engine.current?.setTimeOfDay(next);
    try {
      if (next) window.localStorage.setItem("fallow.sky", next);
      else window.localStorage.removeItem("fallow.sky");
    } catch {
      /* fine */
    }
    window.dispatchEvent(new Event("fallow:sky"));
  }

  return (
    <div className="garden" ref={wrapRef}>
      <canvas ref={canvasRef} className="garden-canvas pixel" role="img" aria-label={`Your garden: ${plantStatusSummary(plants)}. Your brain pet is ${stage}${asleep ? " and asleep" : ""}.`} />

      <button className={`g-health stage-${stage}`} onClick={() => setShowHealth((v) => !v)} aria-expanded={showHealth} aria-label={`Brain health ${healthPct} of 100, ${stage}. Show what feeds it`}>
        <span className="heart" aria-hidden="true">
          ♥
        </span>
        <span className="num">{healthPct}</span>
        <span className="g-health-bar" aria-hidden="true">
          <i style={{ width: `${healthPct}%` }} />
        </span>
        <span className="g-health-stage">{stage}</span>
      </button>
      {showHealth && (
        <div className="g-pop g-health-pop" role="dialog" aria-label="What feeds your brain">
          <p className="g-pop-title">What feeds your brain</p>
          <div className="feed-row">
            <span>Keep-list plants</span>
            <b className="num">{Math.round(reading.retrievability * 100)}</b>
            <em>× 70%</em>
          </div>
          <div className="feed-row">
            <span>Work done yourself</span>
            <b className="num">{Math.round(reading.ownShare * 100)}</b>
            <em>× 20%</em>
          </div>
          <div className="feed-row">
            <span>Energy right now</span>
            <b className="num">{Math.round(reading.capacity * 100)}</b>
            <em>× 10%</em>
          </div>
          {reading.knocked && <p className="small warn-text">{reading.reasons.at(-1)}</p>}
          <p className="small">Thriving from 80, steady from 60, fading from 40.</p>
        </div>
      )}

      <button className="g-time" onClick={cycleSky} aria-label={`Sky: ${TOD_LABEL[tod ?? "auto"]}. Change`}>
        <span aria-hidden="true">{(tod ?? engine.current?.timeOfDayNow) === "night" ? "☾" : "☀"}</span> {TOD_LABEL[tod ?? "auto"]}
      </button>

      {tag && (
        <div className="g-tag" style={{ left: tag.x, top: tag.y }} aria-hidden="true">
          <span className={`live-dot status-${statusOf(tag.id)}`} />
          <b>{DOMAIN_BY_ID[tag.id].label}</b>
          <span className="g-tag-sub">
            {PLANT_NAME[tag.id].one} · {STATUS_WORD[statusOf(tag.id)]}
          </span>
        </div>
      )}

      {petHover && !petKnown && !bubble && (
        <div className="g-bubble g-hint" aria-hidden="true">
          Hold to pet me · double-click to spin
        </div>
      )}
      {bubble && (
        <div key={bubble.id} className="g-bubble" role="status">
          {bubble.text}
        </div>
      )}

      {/* keyboard and screen reader access to every plant and to the pet */}
      {L && (
        <div className="g-keys">
          {plants.map((p, i) => {
            const s = L.slots[i];
            if (!s) return null;
            return (
              <button
                key={p.id}
                className={`g-key ${selected === p.id ? "on" : ""}`}
                style={{ left: (s.x - 9) * L.scale, top: (s.y - 30) * L.scale, width: 18 * L.scale, height: 34 * L.scale }}
                aria-label={`${DOMAIN_BY_ID[p.id].label}: ${STATUS_WORD[p.status]}. Open`}
                onFocus={() => setTag({ id: p.id, x: s.x * L.scale, y: (s.y - 30) * L.scale })}
                onBlur={() => setTag(null)}
                onClick={() => select(p.id)}
              />
            );
          })}
          <button className="g-key g-key-pet" style={{ left: "calc(var(--pet-x, 50%) - 44px)", top: "calc(var(--pet-y, 70%) - 8px)", width: 88, height: 76 }} aria-label="Pet your brain" onClick={() => engine.current?.poke("tap")} onDoubleClick={() => engine.current?.poke("double")} onKeyDown={(e) => {
            if (e.key === " ") {
              e.preventDefault();
              engine.current?.poke("pet");
            }
          }} />
        </div>
      )}
    </div>
  );
}
