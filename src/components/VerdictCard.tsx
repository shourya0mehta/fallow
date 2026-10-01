"use client";

import type { Assessment } from "@/core/assess";
import { MODE_LABEL } from "@/core/policy";
import { DOMAIN_BY_ID } from "@/core/taxonomy";

/**
 * The same card the browser extension draws over a chat window, as a React
 * component, so the hosted demo page can show the intercept without the
 * extension installed.
 */
export function VerdictCard({
  result,
  onTryFirst,
  onScaffold,
  onAnyway,
  onClose,
}: {
  result: Assessment;
  onTryFirst: () => void;
  onScaffold: () => void;
  onAnyway: () => void;
  onClose: () => void;
}) {
  const rec = result.recommendation;
  const cls = result.classification;
  return (
    <div className="fallow-card" role="dialog" aria-label="Fallow verdict" data-fallow-sim-card>
      <p className="fallow-kicker">Fallow · before you hand it over</p>
      <p className={`fallow-mode fallow-mode-${rec.mode}`}>{MODE_LABEL[rec.mode]}</p>
      <p className="fallow-domains">{cls.domains.map((d) => `${DOMAIN_BY_ID[d.id].label} ${Math.round(d.weight * 100)}%`).join(" · ")}</p>
      {rec.reasons.slice(0, 2).map((r) => (
        <p key={r} className="fallow-reason">
          {r}
        </p>
      ))}
      <div className="fallow-scaffold">{rec.scaffold}</div>
      <div className="fallow-actions">
        <button className={rec.mode === "self" ? "" : "fallow-secondary"} onClick={onTryFirst}>
          I'll try first
        </button>
        <button className={rec.mode === "self" ? "fallow-secondary" : ""} onClick={onScaffold}>
          Send with scaffold
        </button>
        <button className="fallow-secondary" onClick={onAnyway}>
          Send anyway
        </button>
      </div>
      <button className="fallow-mute" onClick={onClose}>
        Dismiss
      </button>
    </div>
  );
}
