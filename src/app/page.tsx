"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loading, useFallow } from "@/client/FallowProvider";
import { SignInCard } from "@/components/Account";
import { AskBar } from "@/components/garden/AskBar";
import { Garden } from "@/components/garden/Garden";
import { GardenProvider, useGarden } from "@/components/garden/GardenContext";
import { PlantCard } from "@/components/garden/PlantCard";
import { PlantList } from "@/components/garden/PlantList";
import { Quests } from "@/components/garden/Quests";
import { Session } from "@/components/garden/Session";
import { Today } from "@/components/garden/Today";
import { Intro, type IntroChoice } from "@/components/intro/Intro";
import { creatureStage } from "@/core/creature";
import type { DomainId } from "@/core/types";

const INTRO_SEEN = "fallow.introSeen";

export default function Home() {
  return (
    <GardenProvider>
      <HomeInner />
    </GardenProvider>
  );
}

/** Whether to play the intro: first visit, or ?intro=1 to replay. */
function useIntroGate(): [boolean, () => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let show = false;
    try {
      const forced = new URLSearchParams(window.location.search).get("intro");
      show = forced === "1" || (forced !== "0" && window.localStorage.getItem(INTRO_SEEN) !== "1");
    } catch {
      show = false;
    }
    setOn(show);
  }, []);
  const done = useCallback(() => {
    try {
      window.localStorage.setItem(INTRO_SEEN, "1");
      const url = new URL(window.location.href);
      if (url.searchParams.has("intro")) {
        url.searchParams.delete("intro");
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
    } catch {
      /* fine */
    }
    setOn(false);
  }, []);
  return [on, done];
}

function HomeInner() {
  const { ready, snapshot: snap, ledger, demo, error, account, startFresh } = useFallow();
  const { selected, session, engine } = useGarden();
  const [now, setNow] = useState(() => new Date());
  const [askFocus, setAskFocus] = useState(false);
  const [intro, introDone] = useIntroGate();
  const [askSignIn, setAskSignIn] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("ask")) setAskFocus(true);
    return () => clearInterval(id);
  }, []);

  const reading = useMemo(() => (snap && ledger ? creatureStage({ states: snap.states, keepList: ledger.settings.keepList, drift: snap.drift, capacity: snap.capacity.value, asleep: snap.capacity.asleep }) : null), [snap, ledger]);
  const quests = useMemo<DomainId[]>(() => snap?.nudges.map((n) => n.domain) ?? [], [snap]);

  const prepare = useCallback(
    async (choice: IntroChoice) => {
      if (choice === "start" && demo) await startFresh();
    },
    [demo, startFresh],
  );
  const onIntroClose = useCallback(
    (choice: IntroChoice) => {
      introDone();
      if (choice === "start") setAskSignIn(true);
    },
    [introDone],
  );
  const startOwn = useCallback(async () => {
    await startFresh();
    setAskSignIn(true);
  }, [startFresh]);

  const overlay = (
    <>
      {intro && <Intro hasOwnGarden={ready && !demo && (ledger?.events.length ?? 0) > 0} prepare={prepare} onClose={onIntroClose} />}
      {askSignIn && !intro && account.available && !account.user && <SignInCard onClose={() => setAskSignIn(false)} />}
    </>
  );

  if (error)
    return (
      <>
        {overlay}
        <p className="notice">{error}</p>
      </>
    );
  if (!ready || !snap || !ledger || !reading)
    return (
      <>
        {overlay}
        <Loading what="your garden" />
      </>
    );

  const empty = ledger.events.length === 0;
  const keep = new Set(ledger.settings.keepList);
  const sel = selected ? snap.states.find((s) => s.id === selected) : null;
  const anchor = selected ? engine.current?.plantAnchor(selected) : null;
  const L = engine.current?.layout;
  const cardSide = anchor && L ? (anchor.x > (L.W * L.scale) / 2 ? "left" : "right") : "right";

  return (
    <>
      {overlay}
      <div className="home">
      {demo && (
        <p className="demo-pill">
          <span className="live-dot status-fresh" />
          A demo garden: ninety days of sample asks.{" "}
          <button className="link-btn" onClick={() => void startOwn()}>
            Start my own
          </button>
        </p>
      )}
      {!demo && empty && (
        <p className="demo-pill">
          <span className="live-dot status-seed" />
          A fresh garden. Check an ask below, or <Link href="/journal#import">bring in your chat history</Link>.
        </p>
      )}

      <section className="card stage" aria-label="Your garden">
        <div className="stage-scene">
          <Garden states={snap.states} stage={reading.stage} asleep={snap.capacity.asleep} quests={quests} reading={reading} demoEmpty={empty} quiet={intro} />
          {sel && (
            <div className={`plant-card-wrap side-${cardSide}`}>
              <PlantCard state={sel} weekly={snap.weekly[sel.id]} keep={keep.has(sel.id)} drift={snap.drift[sel.id]} now={now} />
            </div>
          )}
        </div>
        {session ? <Session /> : <AskBar autoFocus={askFocus && !intro} />}
      </section>

      <div className="home-row">
        <Today snap={snap} reading={reading} sleep={ledger.settings.sleep} now={now} />
        <Quests nudges={snap.nudges} states={snap.states} events={ledger.events} now={now} />
      </div>

      <PlantList states={snap.states} keep={keep} now={now} />
      </div>
    </>
  );
}
