"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loading, useFallow } from "@/client/FallowProvider";
import { AskBar } from "@/components/garden/AskBar";
import { Garden } from "@/components/garden/Garden";
import { GardenProvider, useGarden } from "@/components/garden/GardenContext";
import { PlantCard } from "@/components/garden/PlantCard";
import { PlantList } from "@/components/garden/PlantList";
import { Quests } from "@/components/garden/Quests";
import { Session } from "@/components/garden/Session";
import { Today } from "@/components/garden/Today";
import { creatureStage } from "@/core/creature";
import type { DomainId } from "@/core/types";

export default function Home() {
  return (
    <GardenProvider>
      <HomeInner />
    </GardenProvider>
  );
}

function HomeInner() {
  const { ready, snapshot: snap, ledger, demo, error } = useFallow();
  const { selected, session, engine } = useGarden();
  const [now, setNow] = useState(() => new Date());
  const [askFocus, setAskFocus] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("ask")) setAskFocus(true);
    return () => clearInterval(id);
  }, []);

  const reading = useMemo(() => (snap && ledger ? creatureStage({ states: snap.states, keepList: ledger.settings.keepList, drift: snap.drift, capacity: snap.capacity.value, asleep: snap.capacity.asleep }) : null), [snap, ledger]);
  const quests = useMemo<DomainId[]>(() => snap?.nudges.map((n) => n.domain) ?? [], [snap]);

  if (error) return <p className="notice">{error}</p>;
  if (!ready || !snap || !ledger || !reading) return <Loading what="your garden" />;

  const empty = ledger.events.length === 0;
  const keep = new Set(ledger.settings.keepList);
  const sel = selected ? snap.states.find((s) => s.id === selected) : null;
  const anchor = selected ? engine.current?.plantAnchor(selected) : null;
  const L = engine.current?.layout;
  const cardSide = anchor && L ? (anchor.x > (L.W * L.scale) / 2 ? "left" : "right") : "right";

  return (
    <div className="home">
      {demo && (
        <p className="demo-pill">
          <span className="live-dot status-fresh" />
          A demo garden: ninety days of a student&apos;s asks. <Link href="/journal#import">Grow your own</Link>
        </p>
      )}

      <section className="card stage" aria-label="Your garden">
        <div className="stage-scene">
          <Garden states={snap.states} stage={reading.stage} asleep={snap.capacity.asleep} quests={quests} reading={reading} demoEmpty={empty} />
          {sel && (
            <div className={`plant-card-wrap side-${cardSide}`}>
              <PlantCard state={sel} weekly={snap.weekly[sel.id]} keep={keep.has(sel.id)} drift={snap.drift[sel.id]} now={now} />
            </div>
          )}
        </div>
        {session ? <Session /> : <AskBar autoFocus={askFocus} />}
      </section>

      <div className="home-row">
        <Today snap={snap} reading={reading} sleep={ledger.settings.sleep} now={now} />
        <Quests nudges={snap.nudges} states={snap.states} events={ledger.events} now={now} />
      </div>

      <PlantList states={snap.states} keep={keep} now={now} />
    </div>
  );
}
