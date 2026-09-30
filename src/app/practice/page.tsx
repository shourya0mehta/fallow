import { loadLedger } from "@/core/store";
import { buildSnapshot } from "@/core/summary";
import { DOMAINS } from "@/core/taxonomy";
import { PracticeTimer } from "./PracticeTimer";

export const dynamic = "force-dynamic";

export default async function PracticePage() {
  const now = new Date();
  const ledger = await loadLedger();
  const snap = buildSnapshot(ledger.events, ledger.settings, now, ledger.signals);
  const suggested = snap.nudges[0]?.domain ?? "composition";
  const domains = DOMAINS.filter((d) => d.id !== "attention").map((d) => ({ id: d.id, label: d.label, practice: d.practice }));
  const states = Object.fromEntries(snap.states.map((s) => [s.id, { retrievability: s.retrievability, status: s.status, daysFallow: s.daysFallow }]));

  return (
    <main>
      <p className="dateline">Practice</p>
      <h1>Work a fallow field for a while.</h1>
      <p className="lede">
        Pick a domain, pick a length, do a real task from your own list without the model, and log it. One session roughly doubles a stale domain's stability, so the nudges for it thin out.
      </p>
      <PracticeTimer domains={domains} suggested={suggested} states={states} capacity={snap.capacity.value} />
    </main>
  );
}
