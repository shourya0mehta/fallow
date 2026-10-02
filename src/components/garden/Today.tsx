"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatClock, type AlertnessPoint } from "@/core/alertness";
import type { CreatureReading } from "@/core/creature";
import type { Snapshot } from "@/core/summary";

function Meter({
  label,
  value,
  unit,
  fill,
  tone,
  sub,
  feeds,
  help,
  ghost,
  children,
}: {
  label: string;
  value: string;
  unit?: string;
  fill: number;
  tone: string;
  sub: React.ReactNode;
  feeds?: boolean;
  help: string;
  ghost?: boolean;
  children?: React.ReactNode;
}) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setShown(fill), 80);
    return () => clearTimeout(t);
  }, [fill]);
  return (
    <div className={`meter ${ghost ? "ghost" : ""}`} title={help}>
      <div className="meter-k">
        <span>{label}</span>
        {feeds && (
          <span className="feeds" title="Feeds Shumbo's health">
            ♥
          </span>
        )}
      </div>
      <div className="meter-v num">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      <div className="track">
        <i style={{ width: `${Math.round(Math.max(0, Math.min(1, shown)) * 100)}%`, background: tone }} />
      </div>
      {children}
      <div className="meter-s">{sub}</div>
    </div>
  );
}

function EnergyCurve({ curve, nowHour }: { curve: AlertnessPoint[]; nowHour: number }) {
  const W = 100;
  const H = 26;
  const awake = curve.filter((p) => !p.asleep);
  if (awake.length < 2) return null;
  const x = (h: number) => (h / 24) * W;
  const y = (a: number) => H - 2 - ((a - 1) / 15) * (H - 4);
  const d = awake.map((p, i) => `${i ? "L" : "M"}${x(p.h).toFixed(2)},${y(p.alertness).toFixed(2)}`).join(" ");
  const nowPt = curve.reduce((best, p) => (Math.abs(p.h - nowHour) < Math.abs(best.h - nowHour) ? p : best), curve[0]);
  return (
    <svg className="energy-curve" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      {curve
        .filter((p) => p.asleep)
        .map((p) => (
          <rect key={p.h} x={x(p.h) - 1} y={0} width={2.2} height={H} className="sleep-band" />
        ))}
      <path d={d} className="energy-line" vectorEffect="non-scaling-stroke" />
      <line x1={x(nowHour)} x2={x(nowHour)} y1={0} y2={H} className="now-line" vectorEffect="non-scaling-stroke" />
      {!nowPt.asleep && <circle cx={x(nowHour)} cy={y(nowPt.alertness)} r={1.6} className="now-dot" />}
    </svg>
  );
}

/** Everything about today in one place: energy, own work, screens, focus. */
export function Today({ snap, reading, sleep, now }: { snap: Snapshot; reading: CreatureReading; sleep: { bed: string; wake: string }; now: Date }) {
  const cap = snap.capacity;
  const peak = snap.curve.filter((p) => !p.asleep).reduce((a, b) => (b.alertness > a.alertness ? b : a), snap.curve[0]);
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const after = nowHour > peak.h;
  const att = snap.attention.today;
  const budget = snap.attention.budgetMin;
  const screenMin = att?.entertainmentMin ?? 0;
  const over = screenMin > budget;
  const own = reading.ownShare;

  return (
    <div className="card today" id="today">
      <h2>Today</h2>
      <p className="card-sub">
        <span className="feeds">♥</span> feeds Shumbo
      </p>
      <div className="meters">
        {cap.asleep ? (
          <Meter label="Energy" value="zzz" fill={0} tone="var(--sky)" feeds help="Your sleep window says you're asleep, so energy reads zero until you wake." sub={`Sleep window ${sleep.bed} to ${sleep.wake}`}>
            <EnergyCurve curve={snap.curve} nowHour={nowHour} />
          </Meter>
        ) : (
          <Meter
            label="Energy"
            value={String(Math.round(cap.value * 100))}
            fill={cap.value}
            tone="var(--sun)"
            feeds
            help="Alertness from the three-process sleep model (sleep pressure plus body clock), minus demanding work logged today. A model, not a measurement."
            sub={after ? `Peaked at ${formatClock(peak.h)}. Winding down.` : `Peaks around ${formatClock(peak.h)}.`}
          >
            <EnergyCurve curve={snap.curve} nowHour={nowHour} />
          </Meter>
        )}
        <Meter
          label="Own work"
          value={String(Math.round(own * 100))}
          unit="%"
          fill={own}
          tone={own >= 0.5 ? "var(--leaf)" : own >= 0.25 ? "var(--sun)" : "var(--coral)"}
          feeds
          help="Share of your asks over the last 30 days that you did yourself or shared (a hint, a review, your own draft)."
          sub="of your asks, last 30 days"
        />
        <Meter
          label="Screens"
          value={String(screenMin)}
          unit={`/${budget}m`}
          fill={budget ? screenMin / budget : 0}
          tone={over ? "var(--coral)" : "var(--sky)"}
          help="Minutes on the sites you listed in Settings, against your own budget. The extension pauses you for a breath before they open."
          sub={snap.pause.closeRate7d === null ? `${snap.pause.todayOpens} pauses today` : `${snap.pause.todayOpens} pauses today · ${Math.round(snap.pause.closeRate7d * 100)}% closed this week`}
        />
        {att ? (
          <Meter label="Focus" value={String(att.longestBlockMin)} unit="m" fill={Math.min(1, att.longestBlockMin / 90)} tone="var(--lilac)" help="Longest unbroken block on one activity today, from ActivityWatch." sub={`longest block · ${att.switchesPerHour.toFixed(1)} switches/hr`} />
        ) : (
          <Meter label="Focus" value="–" fill={0} tone="var(--lilac)" ghost help="Install ActivityWatch to see focus blocks and switching." sub={<Link href="/how#focus">Connect ActivityWatch</Link>} />
        )}
      </div>
    </div>
  );
}
