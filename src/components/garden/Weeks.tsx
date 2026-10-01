import type { DomainSeriesPoint } from "@/core/summary";

/** Twelve weeks at a glance: what you did above the line, what you handed off below it. */
export function Weeks({ points, height = 40 }: { points: DomainSeriesPoint[]; height?: number }) {
  const max = Math.max(1, ...points.map((p) => Math.max(p.self, p.delegated)));
  const mid = height / 2;
  const n = Math.max(1, points.length);
  const w = 100 / n;
  const h = (v: number) => (v / max) * (mid - 2);
  return (
    <div className="weeks">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" role="img" aria-label="Last twelve weeks: done yourself above the line, handed to AI below">
        <line x1={0} x2={100} y1={mid} y2={mid} className="weeks-mid" />
        {points.map((p, i) => (
          <g key={p.day}>
            {p.self > 0 && <rect x={i * w + w * 0.18} y={mid - h(p.self)} width={w * 0.64} height={h(p.self)} rx={0.6} className="weeks-self" />}
            {p.delegated > 0 && <rect x={i * w + w * 0.18} y={mid + 1} width={w * 0.64} height={h(p.delegated)} rx={0.6} className="weeks-ai" />}
            <title>{`week of ${p.day}: ${p.self} yourself, ${p.delegated} handed off`}</title>
          </g>
        ))}
      </svg>
      <div className="weeks-legend">
        <span>
          <i className="weeks-self-dot" /> you
        </span>
        <span>12 weeks</span>
        <span>
          <i className="weeks-ai-dot" /> AI
        </span>
      </div>
    </div>
  );
}
