"use client";

import type { Nudge } from "@/core/summary";
import { DOMAIN_BY_ID } from "@/core/taxonomy";
import type { DomainState, LedgerEvent } from "@/core/types";
import { isSameLocalDay } from "@/core/time";
import { useGarden } from "./GardenContext";
import { PLANT_NAME, SESSION_MIN } from "./names";
import { PlantIcon } from "./PlantIcon";

/** This week's quests: the plants most worth watering, each one a button that starts a session. */
export function Quests({ nudges, states, events, now }: { nudges: Nudge[]; states: DomainState[]; events: LedgerEvent[]; now: Date }) {
  const { engine, startSession } = useGarden();
  if (nudges.length === 0)
    return (
      <div className="card quests" id="quests">
        <h2>Quests</h2>
        <p className="empty">Nothing thirsty this week. Your garden is in good shape.</p>
      </div>
    );
  return (
    <div className="card quests" id="quests">
      <h2>Quests</h2>
      <p className="card-sub">Plants worth watering this week</p>
      <ul>
        {nudges.map((n) => {
          const st = states.find((s) => s.id === n.domain);
          const done = events.some((e) => e.actor === "self" && e.domains.some((d) => d.id === n.domain) && isSameLocalDay(e.ts, now));
          const handed = st?.delegatedCount30d ?? 0;
          const own = st?.selfCount30d ?? 0;
          return (
            <li key={n.domain} className={`quest ${done ? "done" : ""}`} onMouseEnter={() => engine.current?.setHighlight(n.domain)} onMouseLeave={() => engine.current?.setHighlight(null)}>
              <PlantIcon id={n.domain} status="fresh" scale={2} />
              <div className="quest-text">
                <b>{done ? `Watered ${PLANT_NAME[n.domain].the} today` : `Water ${PLANT_NAME[n.domain].the}`}</b>
                <span>
                  {DOMAIN_BY_ID[n.domain].label} · {handed} to AI, {own === 0 ? "none" : own} yourself
                </span>
              </div>
              <button
                className="btn"
                onFocus={() => engine.current?.setHighlight(n.domain)}
                onBlur={() => engine.current?.setHighlight(null)}
                onClick={() => startSession(n.domain, SESSION_MIN[n.domain])}
                aria-label={`Start a ${SESSION_MIN[n.domain]} minute ${DOMAIN_BY_ID[n.domain].label} session`}
              >
                {done ? "Again" : `${SESSION_MIN[n.domain]} min`}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
