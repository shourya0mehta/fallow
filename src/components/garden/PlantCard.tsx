"use client";

import { useEffect, useRef } from "react";
import type { DomainSeriesPoint, Drift } from "@/core/summary";
import { DOMAIN_BY_ID } from "@/core/taxonomy";
import type { DomainState } from "@/core/types";
import { daysAgoLabel } from "../format";
import { useGarden } from "./GardenContext";
import { displayStatus, PLANT_NAME, SESSION_MIN, STATUS_WORD } from "./names";
import { PlantIcon } from "./PlantIcon";
import { Weeks } from "./Weeks";

/** The card that opens when a plant is clicked: how it is doing and how to water it. */
export function PlantCard({ state, weekly, keep, drift, now }: { state: DomainState; weekly: DomainSeriesPoint[]; keep: boolean; drift?: Drift; now: Date }) {
  const { select, startSession } = useGarden();
  const spec = DOMAIN_BY_ID[state.id];
  const ref = useRef<HTMLDivElement>(null);
  const r = state.retrievability;
  const isAttention = state.id === "attention";
  const minutes = SESSION_MIN[state.id];
  const shown = displayStatus(state);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && select(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select]);

  return (
    <div className="plant-card" ref={ref} tabIndex={-1} role="dialog" aria-label={`${spec.label} details`}>
      <button className="x" onClick={() => select(null)} aria-label="Close">
        ×
      </button>
      <div className="plant-card-head">
        <div className="plant-card-icon">
          <PlantIcon id={state.id} status={shown} scale={2} ghost />
        </div>
        <div>
          <p className="eyebrow">
            {PLANT_NAME[state.id].one}
            {keep && <span className="keep-chip">keep list</span>}
          </p>
          <h3>{spec.label}</h3>
          <span className={`status-pill status-${shown}`}>
            <span className={`live-dot status-${shown}`} />
            {STATUS_WORD[shown]}
          </span>
        </div>
      </div>

      <div className="plant-card-stats">
        <div>
          <span className="k">Last done yourself</span>
          <b>{daysAgoLabel(state.lastSelfAt, now)}</b>
        </div>
        <div>
          <span className="k">30 days</span>
          <b>
            <span className="self-c">{state.selfCount30d} you</span> · <span className="ai-c">{state.delegatedCount30d} AI</span>
          </b>
        </div>
      </div>
      {shown === "seed" && <p className="small">Nothing logged here yet. Do a little of it yourself and the sprout takes root.</p>}
      {!isAttention && shown !== "seed" && (
        <div className="meter-line" title={`Retrievability ${r.toFixed(2)}: the model's guess at how well this skill would come back right now`}>
          <span className="k">Freshness</span>
          <div className={`track track-${shown}`}>
            <i style={{ width: `${Math.round(r * 100)}%` }} />
          </div>
          <span className="num">{r.toFixed(2)}</span>
        </div>
      )}
      <Weeks points={weekly} />
      {drift === "rising" && <p className="small warn-text">Handing this off more each week, three weeks running.</p>}
      {drift === "falling" && <p className="small good-text">Doing more of this yourself each week.</p>}
      <p className="plant-card-tip">{spec.practice}</p>
      <div className="row">
        <button className="btn" onClick={() => startSession(state.id, minutes)}>
          {shown === "seed" ? "Plant it" : "Water it"} · {minutes} min
        </button>
        <button className="btn ghost" onClick={() => select(null)}>
          Later
        </button>
      </div>
      <p className="fine">Engages the {spec.engages}.</p>
    </div>
  );
}
