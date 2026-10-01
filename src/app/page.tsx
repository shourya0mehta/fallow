"use client";

import Link from "next/link";
import { Loading, useFallow } from "@/client/FallowProvider";
import { AttentionStrip } from "@/components/AttentionStrip";
import { DayCurve } from "@/components/DayCurve";
import { DemoBanner } from "@/components/DemoBanner";
import { FieldPlot } from "@/components/FieldPlot";
import { Brain } from "@/components/Pixel";
import { longDate, pct } from "@/components/format";
import { kssLabel } from "@/core/alertness";
import { creatureStage } from "@/core/creature";
import { DOMAIN_BY_ID } from "@/core/taxonomy";
import { isSameLocalDay } from "@/core/time";

export default function FieldPage() {
  const { ready, snapshot: snap, ledger, demo, mode, error } = useFallow();
  const now = new Date();

  if (error) return <p className="notice">{error}</p>;
  if (!ready || !snap || !ledger) return <Loading />;

  const keep = new Set(ledger.settings.keepList);
  const empty = ledger.events.length === 0;
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const creature = creatureStage({ states: snap.states, keepList: ledger.settings.keepList, drift: snap.drift, capacity: snap.capacity.value, asleep: snap.capacity.asleep });
  const healthClass = creature.stage === "fallow" ? "health-fallow" : creature.stage === "fading" ? "health-fading" : "";

  return (
    <main>
      {demo && <DemoBanner />}
      <p className="dateline">Field book · {longDate(now)}</p>
      <h1>Which parts of your thinking are lying fallow.</h1>
      <div className="hearth">
        <div className="hearth-creature" title={creature.reasons.join(" ")}>
          <Brain stage={empty ? "steady" : creature.stage} />
          <div className="stage-name">{empty ? "waiting" : creature.stage}</div>
          <div className={`health ${healthClass}`} aria-label={`Health ${Math.round(creature.health * 100)} of 100`}>
            <i style={{ width: `${Math.round((empty ? 0.6 : creature.health) * 100)}%` }} />
          </div>
          {!empty && <div className="small">{creature.reasons[0]}</div>}
        </div>
        {empty ? (
          <p className="lede">
            The ledger is empty, so the creature is waiting. <Link href="/import" style={{ textDecoration: "underline" }}>Import a ChatGPT or Claude export</Link> to see months of history at once
            {mode === "server" && (
              <>
                , run <code>npm run seed</code> for a demo ledger
              </>
            )}
            , or start at the <Link href="/gate" style={{ textDecoration: "underline" }}>gate</Link>.
          </p>
        ) : (
          <p className="lede">
            {snap.totals.events.toLocaleString()} asks over {snap.totals.days} days. {pct(snap.totals.delegatedShare)} handed over whole, the rest shared or done yourself.{" "}
            {snap.capacity.asleep
              ? "Your sleep window says you are asleep right now, so capacity reads 0 until you wake."
              : `Capacity now ${snap.capacity.value.toFixed(2)} (KSS ${snap.capacity.kss.toFixed(1)}, ${kssLabel(snap.capacity.kss)}).`}{" "}
            {creature.knocked ? creature.reasons.at(-1) : creature.reasons[1]}
          </p>
        )}
      </div>

      <div className="strip">
        <div>
          <div className="label">Asks logged</div>
          <div className="big num">{snap.totals.events.toLocaleString()}</div>
        </div>
        <div>
          <div className="label">Delegated whole</div>
          <div className="big num">{pct(snap.totals.delegatedShare)}</div>
        </div>
        <div>
          <div className="label">Shared or self-done</div>
          <div className="big num">{(snap.totals.shared + snap.totals.self).toLocaleString()}</div>
        </div>
        <div>
          <div className="label">Fallow or stale domains</div>
          <div className="big num">{snap.states.filter((s) => s.id !== "attention" && (s.status === "fallow" || s.status === "stale")).length}</div>
        </div>
        <div>
          <div className="label">Capacity now</div>
          <div className="big num">{snap.capacity.asleep ? "asleep" : snap.capacity.value.toFixed(2)}</div>
        </div>
      </div>

      {snap.nudges.length > 0 && (
        <section className="section">
          <p className="section-label">Worth doing yourself this week</p>
          <ol className="nudges">
            {snap.nudges.map((n, i) => (
              <li key={n.domain} className="nudge">
                <span className="ordinal">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <div className="headline">{n.headline}</div>
                  <div className="small">{n.detail}</div>
                  <div className="practice">
                    {n.practice}{" "}
                    <Link href="/practice" style={{ textDecoration: "underline" }}>
                      Start a session
                    </Link>
                    .
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="section">
        <p className="section-label">The field · eleven domains, twelve weeks each</p>
        <div className="field">
          {snap.states.map((s) => (
            <FieldPlot key={s.id} state={s} weekly={snap.weekly[s.id]} keep={keep.has(s.id)} now={now} drift={snap.drift[s.id]} attention={s.id === "attention" ? snap.attention.today : undefined} />
          ))}
        </div>
        <p className="small" style={{ marginTop: 16 }}>
          Retrievability follows the FSRS power law over a stability that grows only when you do the work yourself. Statuses: fresh at 0.85 and above, fading to 0.70, stale to 0.55, fallow below or never
          practiced. Sparklines: self-done above the line in green, delegated below in rust. The brain line under each plot is group-average fMRI engagement, and engagement is not training: reverse inference
          from region to process is weak.
        </p>
      </section>

      <section className="section">
        <p className="section-label">Attention and screens · today</p>
        <AttentionStrip attention={snap.attention} pause={snap.pause} />
      </section>

      <section className="section">
        <p className="section-label">Today's budget · three-process model, {DOMAIN_BY_ID.attention.label.toLowerCase()} aside</p>
        <DayCurve curve={snap.curve} nowHour={nowHour} events={ledger.events.filter((e) => isSameLocalDay(e.ts, now))} />
        <p className="small">
          Sleep {ledger.settings.sleep.bed} to {ledger.settings.sleep.wake}, {ledger.settings.chronotype} chronotype. Fatigue term {snap.capacity.fatigue.toFixed(2)} from today's demanding work (a hypothesis, not a
          validated measure). <Link href="/day" style={{ textDecoration: "underline" }}>Adjust today's sleep</Link>.
        </p>
      </section>
    </main>
  );
}
