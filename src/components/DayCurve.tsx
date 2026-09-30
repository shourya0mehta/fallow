import type { AlertnessPoint } from "@/core/alertness";
import { formatClock } from "@/core/alertness";
import type { LedgerEvent } from "@/core/types";

/**
 * The day's modeled alertness as one line, sleep shaded, demanding work as ticks,
 * and a marker at the current time. Plain SVG, no chart library.
 */
export function DayCurve({
  curve,
  nowHour,
  events = [],
  width = 760,
  height = 260,
}: {
  curve: AlertnessPoint[];
  nowHour?: number;
  events?: LedgerEvent[];
  width?: number;
  height?: number;
}) {
  const left = 44;
  const right = 16;
  const top = 18;
  const bottom = 34;
  const x = (h: number) => left + (h / 24) * (width - left - right);
  const y = (a: number) => top + (1 - a / 16) * (height - top - bottom);
  const awake = curve.filter((p) => !p.asleep);
  const path = awake.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.h).toFixed(1)} ${y(p.alertness).toFixed(1)}`).join(" ");
  const sleepRuns: Array<[number, number]> = [];
  let start: number | null = null;
  for (const p of curve) {
    if (p.asleep && start === null) start = p.h;
    if (!p.asleep && start !== null) {
      sleepRuns.push([start, p.h]);
      start = null;
    }
  }
  if (start !== null) sleepRuns.push([start, 24]);
  const peak = awake.reduce((m, p) => (p.alertness > m.alertness ? p : m), awake[0]);
  const nowPoint = nowHour !== undefined ? curve.reduce((m, p) => (Math.abs(p.h - nowHour) < Math.abs(m.h - nowHour) ? p : m), curve[0]) : undefined;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Modeled alertness across today" style={{ fontFamily: "var(--sans)", fontSize: 11 }}>
      {sleepRuns.map(([a, b]) => (
        <rect key={a} x={x(a)} y={top} width={x(b) - x(a)} height={height - top - bottom} fill="var(--paper-2)" />
      ))}
      {[4, 8, 12, 16].map((v) => (
        <g key={v}>
          <line x1={left} x2={width - right} y1={y(v)} y2={y(v)} stroke="var(--rule)" />
          <text x={left - 8} y={y(v) + 4} textAnchor="end" fill="var(--ink-3)">
            {v}
          </text>
        </g>
      ))}
      <line x1={left} x2={width - right} y1={y(0)} y2={y(0)} stroke="var(--ink-2)" />
      {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
        <text key={h} x={x(h)} y={height - bottom + 16} textAnchor="middle" fill="var(--ink-3)">
          {formatClock(h)}
        </text>
      ))}
      {events
        .filter((e) => e.demanding && e.minutes)
        .map((e) => {
          const d = new Date(e.ts);
          const h = d.getHours() + d.getMinutes() / 60;
          const w = Math.max(2, ((e.minutes ?? 0) / 60) * (x(1) - x(0)));
          return <rect key={e.id} x={x(h)} y={y(0) - 6} width={w} height={6} fill="var(--rust)" opacity={0.8}><title>{`${e.minutes} min demanding work`}</title></rect>;
        })}
      <path d={path} fill="none" stroke="var(--ink)" strokeWidth={1.75} />
      {peak && (
        <g>
          <circle cx={x(peak.h)} cy={y(peak.alertness)} r={3} fill="var(--ink)" />
          <text x={x(peak.h)} y={y(peak.alertness) - 8} textAnchor="middle" fill="var(--ink-2)">
            peak {formatClock(peak.h)} · KSS {peak.kss.toFixed(1)}
          </text>
        </g>
      )}
      {nowPoint && !nowPoint.asleep && (
        <g>
          <line x1={x(nowPoint.h)} x2={x(nowPoint.h)} y1={top} y2={y(0)} stroke="var(--accent)" strokeDasharray="3 3" />
          <circle cx={x(nowPoint.h)} cy={y(nowPoint.alertness)} r={4} fill="var(--accent)" />
          <text x={x(nowPoint.h) + 8} y={y(nowPoint.alertness) + 4} fill="var(--accent)">
            now
          </text>
        </g>
      )}
      <text x={left} y={12} fill="var(--ink-3)">
        alertness (1 to 16)
      </text>
    </svg>
  );
}
