"use client";

import { Loading, useFallow } from "@/client/FallowProvider";
import { DOMAINS } from "@/core/taxonomy";
import { PracticeTimer } from "./PracticeTimer";

export default function PracticePage() {
  const { ready, snapshot: snap } = useFallow();
  const domains = DOMAINS.filter((d) => d.id !== "attention").map((d) => ({ id: d.id, label: d.label, practice: d.practice }));

  return (
    <main>
      <p className="dateline">Practice</p>
      <h1>Work a fallow field for a while.</h1>
      <p className="lede">
        Pick a domain, pick a length, do a real task from your own list without the model, and log it. One session roughly doubles a stale domain's stability, so the nudges for it thin out.
      </p>
      {!ready || !snap ? (
        <Loading what="practice" />
      ) : (
        <PracticeTimer
          domains={domains}
          suggested={snap.nudges[0]?.domain ?? "composition"}
          states={Object.fromEntries(snap.states.map((s) => [s.id, { retrievability: s.retrievability, status: s.status, daysFallow: s.daysFallow }]))}
          capacity={snap.capacity.value}
        />
      )}
    </main>
  );
}
