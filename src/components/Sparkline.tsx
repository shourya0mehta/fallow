import type { DomainSeriesPoint } from "@/core/summary";

/**
 * Twelve weeks of self vs delegated counts as paired hairline bars.
 * Self in moss above the baseline, delegated in rust below it.
 */
export function Sparkline({ points, width = 180, height = 44 }: { points: DomainSeriesPoint[]; width?: number; height?: number }) {
  const max = Math.max(1, ...points.map((p) => Math.max(p.self, p.delegated)));
  const mid = height / 2;
  const band = width / points.length;
  const scale = (n: number) => (n / max) * (mid - 3);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Twelve weeks: self-done above the line, delegated below">
      <line x1={0} x2={width} y1={mid} y2={mid} stroke="var(--rule-2)" strokeWidth={1} />
      {points.map((p, i) => {
        const x = i * band + band * 0.25;
        const w = band * 0.5;
        return (
          <g key={p.day}>
            {p.self > 0 && <rect x={x} y={mid - scale(p.self)} width={w} height={scale(p.self)} fill="var(--moss)" />}
            {p.delegated > 0 && <rect x={x} y={mid + 1} width={w} height={scale(p.delegated)} fill="var(--rust)" opacity={0.85} />}
            <title>{`week of ${p.day}: ${p.self} self, ${p.delegated} delegated`}</title>
          </g>
        );
      })}
    </svg>
  );
}
