import { DOMAIN_BY_ID } from "@/core/taxonomy";
import type { DomainSeriesPoint } from "@/core/summary";
import type { DomainState } from "@/core/types";
import { daysAgoLabel } from "./format";
import { Sparkline } from "./Sparkline";

export function FieldPlot({ state, weekly, keep, now }: { state: DomainState; weekly: DomainSeriesPoint[]; keep: boolean; now: Date }) {
  const spec = DOMAIN_BY_ID[state.id];
  const isAttention = state.id === "attention";
  const r = state.retrievability;
  return (
    <article className="plot" aria-label={spec.label}>
      <header>
        <h3>
          {spec.label}
          {keep && (
            <span className="small" title="On your keep list">
              {" "}
              · keep
            </span>
          )}
        </h3>
        <span className={`status status-${state.status}`}>{isAttention ? "tracked" : state.status}</span>
      </header>
      <div className="small">{spec.short}</div>
      {!isAttention && (
        <div className={`bar bar-${state.status}`} title={`Retrievability ${r.toFixed(2)}`}>
          <i style={{ width: `${Math.round(r * 100)}%` }} />
        </div>
      )}
      <div className="facts">
        <div>
          last worked <b>{daysAgoLabel(state.lastSelfAt, now)}</b>
        </div>
        <div>
          retrievability <b className="num">{isAttention ? "n/a" : r.toFixed(2)}</b>
        </div>
        <div>
          30 days, self <b className="num">{state.selfCount30d}</b>
        </div>
        <div>
          30 days, delegated <b className="num">{state.delegatedCount30d}</b>
        </div>
      </div>
      <Sparkline points={weekly} />
      <div className="engages">Engages the {spec.engages}.</div>
    </article>
  );
}
