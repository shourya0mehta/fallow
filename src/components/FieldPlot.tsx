import { DOMAIN_BY_ID } from "@/core/taxonomy";
import type { DomainSeriesPoint, Drift } from "@/core/summary";
import type { AttentionDaySignal, DomainState } from "@/core/types";
import { daysAgoLabel } from "./format";
import { PlotTile } from "./Pixel";
import { Sparkline } from "./Sparkline";

export function FieldPlot({
  state,
  weekly,
  keep,
  now,
  drift,
  attention,
}: {
  state: DomainState;
  weekly: DomainSeriesPoint[];
  keep: boolean;
  now: Date;
  drift?: Drift;
  attention?: AttentionDaySignal;
}) {
  const spec = DOMAIN_BY_ID[state.id];
  const isAttention = state.id === "attention";
  const r = state.retrievability;
  return (
    <article className="plot" aria-label={spec.label}>
      <header>
        <PlotTile status={state.status} />
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
      {isAttention ? (
        <div className="facts">
          <div>
            longest block today <b className="num">{attention ? `${attention.longestBlockMin} min` : "no data"}</b>
          </div>
          <div>
            switches per hour <b className="num">{attention ? attention.switchesPerHour.toFixed(1) : "no data"}</b>
          </div>
          <div>
            blocks logged, 30 days <b className="num">{state.selfCount30d}</b>
          </div>
          <div>
            entertainment today <b className="num">{attention ? `${attention.entertainmentMin} min` : "no data"}</b>
          </div>
        </div>
      ) : (
        <div className="facts">
          <div>
            last worked <b>{daysAgoLabel(state.lastSelfAt, now)}</b>
          </div>
          <div>
            retrievability <b className="num">{r.toFixed(2)}</b>
          </div>
          <div>
            30 days, self <b className="num">{state.selfCount30d}</b>
          </div>
          <div>
            30 days, delegated <b className="num">{state.delegatedCount30d}</b>
          </div>
        </div>
      )}
      {drift === "rising" && <div className="small" style={{ color: "var(--rust)" }}>Delegation share rising three weeks running.</div>}
      {drift === "falling" && <div className="small" style={{ color: "var(--moss)" }}>Delegation share falling three weeks running.</div>}
      <Sparkline points={weekly} />
      <div className="engages">Engages the {spec.engages}.</div>
    </article>
  );
}
