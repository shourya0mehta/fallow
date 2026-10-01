"use client";

import { DOMAIN_BY_ID } from "@/core/taxonomy";
import type { DomainId, DomainState } from "@/core/types";
import { daysAgoLabel } from "../format";
import { useGarden } from "./GardenContext";
import { PLANT_NAME, STATUS_WORD } from "./names";
import { PlantIcon } from "./PlantIcon";

/** The garden as a plain list, for numbers people and screen readers. */
export function PlantList({ states, keep, now }: { states: DomainState[]; keep: Set<DomainId>; now: Date }) {
  const { select } = useGarden();
  const order = { fallow: 0, stale: 1, fading: 2, fresh: 3 } as const;
  const sorted = [...states].sort((a, b) => order[a.status] - order[b.status] || a.retrievability - b.retrievability);
  return (
    <details className="card plant-list">
      <summary>
        <h2>All plants</h2>
        <span className="card-sub">as a list, driest first</span>
      </summary>
      <table>
        <thead>
          <tr>
            <th>Plant</th>
            <th>Status</th>
            <th>Freshness</th>
            <th>Last yourself</th>
            <th>30 days</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr key={s.id}>
              <td>
                <button
                  className="plant-row"
                  onClick={() => {
                    select(s.id);
                    document.querySelector(".garden")?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                >
                  <PlantIcon id={s.id} status={s.status} scale={1} ghost />
                  <span>
                    <b>{DOMAIN_BY_ID[s.id].label}</b>
                    <small>
                      {PLANT_NAME[s.id].one}
                      {keep.has(s.id) ? " · keep list" : ""}
                    </small>
                  </span>
                </button>
              </td>
              <td>
                <span className={`status-pill status-${s.status}`}>
                  <span className={`live-dot status-${s.status}`} />
                  {STATUS_WORD[s.status]}
                </span>
              </td>
              <td>
                {s.id === "attention" ? (
                  <span className="fine">from focus blocks</span>
                ) : (
                  <div className={`track mini track-${s.status}`}>
                    <i style={{ width: `${Math.round(s.retrievability * 100)}%` }} />
                  </div>
                )}
              </td>
              <td>{daysAgoLabel(s.lastSelfAt, now)}</td>
              <td className="num">
                <span className="self-c">{s.selfCount30d}</span> / <span className="ai-c">{s.delegatedCount30d}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
