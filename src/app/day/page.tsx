"use client";

import { Loading, useFallow } from "@/client/FallowProvider";
import { AttentionStrip } from "@/components/AttentionStrip";
import { DayCurve } from "@/components/DayCurve";
import { longDate } from "@/components/format";
import { alertnessAt, kssLabel } from "@/core/alertness";
import { todaySleep } from "@/core/summary";
import { isSameLocalDay, localDateKey } from "@/core/time";
import { SleepForm } from "./SleepForm";

export default function DayPage() {
  const { ready, snapshot: snap, ledger } = useFallow();
  const now = new Date();

  if (!ready || !snap || !ledger) {
    return (
      <main>
        <p className="dateline">The day · {longDate(now)}</p>
        <h1>What you have to spend today.</h1>
        <Loading what="the day" />
      </main>
    );
  }

  const sleep = todaySleep(ledger.settings, now);
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const point = alertnessAt(nowHour, sleep, ledger.settings.chronotype);
  const today = localDateKey(now);
  const todays = ledger.events.filter((e) => isSameLocalDay(e.ts, now));

  return (
    <main>
      <p className="dateline">The day · {longDate(now)}</p>
      <h1>What you have to spend today.</h1>
      <p className="lede">
        Not dopamine. Sleep pressure and circadian phase from the three-process model, the one aviation uses, plus a fatigue term for demanding work that is labelled as the hypothesis it is.
      </p>

      <DayCurve curve={snap.curve} nowHour={nowHour} events={todays} />

      <div className="strip">
        <div>
          <div className="label">Capacity now</div>
          <div className="big num">{snap.capacity.asleep ? "asleep" : snap.capacity.value.toFixed(2)}</div>
        </div>
        <div>
          <div className="label">KSS</div>
          <div className="big num">{point.kss.toFixed(1)}</div>
          <div className="small">{kssLabel(point.kss)}</div>
        </div>
        <div>
          <div className="label">Sleep pressure S</div>
          <div className="big num">{point.S.toFixed(1)}</div>
          <div className="small">decays toward 2.4 awake</div>
        </div>
        <div>
          <div className="label">Circadian C</div>
          <div className="big num">
            {point.C >= 0 ? "+" : ""}
            {point.C.toFixed(1)}
          </div>
          <div className="small">peaks near 16:48</div>
        </div>
        <div>
          <div className="label">Fatigue F</div>
          <div className="big num">{snap.capacity.fatigue.toFixed(2)}</div>
          <div className="small">from demanding minutes</div>
        </div>
      </div>

      <section className="section">
        <p className="section-label">Attention and screens · today</p>
        <AttentionStrip attention={snap.attention} pause={snap.pause} showTop />
      </section>

      <section className="section two-col">
        <div>
          <p className="section-label">Today's sleep</p>
          <SleepForm date={today} sleep={sleep} chronotype={ledger.settings.chronotype} />
        </div>
        <div>
          <p className="section-label">How to read it</p>
          <p>
            The first hour after waking is the lowest point of the day because of sleep inertia (W). The peak comes in the early afternoon, when circadian drive catches up with falling sleep pressure. By bedtime the
            curve has lost about a third of its height.
          </p>
          <p className="small">
            Capacity = (alertness − 1) / 15 × (1 − 0.35 × F). The 0.35 is a guess. Wiehler et al. 2022 found about six hours of demanding work shifted choices toward low effort; nobody has fitted a penalty for it. Log
            demanding work from the gate with minutes, and the rust ticks appear on the baseline.
          </p>
        </div>
      </section>
    </main>
  );
}
