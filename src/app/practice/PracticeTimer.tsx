"use client";

import { useEffect, useRef, useState } from "react";
import { useFallow } from "@/client/FallowProvider";
import type { DomainId } from "@/core/types";

type DomainOption = { id: DomainId; label: string; practice: string };
type StateMap = Record<string, { retrievability: number; status: string; daysFallow: number | null }>;

const LENGTHS = [15, 25, 45];

export function PracticeTimer({ domains, suggested, states, capacity }: { domains: DomainOption[]; suggested: DomainId; states: StateMap; capacity: number }) {
  const { client, refresh } = useFallow();
  const [domain, setDomain] = useState<DomainId>(suggested);
  const [minutes, setMinutes] = useState(25);
  const [note, setNote] = useState("");
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const elapsed = Date.now() - (startedAt.current ?? Date.now());
      setLeft(Math.max(0, minutes * 60_000 - elapsed));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [running, minutes]);

  const spec = domains.find((d) => d.id === domain)!;
  const state = states[domain];

  function start() {
    startedAt.current = Date.now();
    setResult(null);
    setRunning(true);
  }

  async function finish() {
    const elapsedMin = Math.max(1, Math.round((Date.now() - (startedAt.current ?? Date.now())) / 60_000));
    setRunning(false);
    if (!client) return;
    const before = state.retrievability;
    try {
      await client.logPrompt({
        text: `Practice: ${spec.label}${note ? `, ${note}` : ""}`,
        source: "practice",
        actor: "self",
        icap: "constructive",
        minutes: elapsedMin,
        demanding: elapsedMin >= 25,
        domains: [{ id: domain, weight: 1 }],
      });
    } catch {
      setResult("Could not log the session.");
      return;
    }
    const snap = await client.snapshot(new Date());
    await refresh();
    const after = snap.states.find((s) => s.id === domain)!;
    setResult(`Logged ${elapsedMin} minutes of ${spec.label.toLowerCase()}. Retrievability ${before.toFixed(2)} to ${after.retrievability.toFixed(2)}, stability now ${after.stability} days.`);
  }

  const mm = Math.floor(left / 60_000);
  const ss = Math.floor((left % 60_000) / 1000);

  return (
    <div className="two-col">
      <div>
        <label className="field-label" htmlFor="domain">
          Domain
        </label>
        <select id="domain" value={domain} onChange={(e) => setDomain(e.target.value as DomainId)} disabled={running}>
          {domains.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
              {states[d.id] ? ` (${states[d.id].status}, ${states[d.id].retrievability.toFixed(2)})` : ""}
            </option>
          ))}
        </select>
        <p className="small" style={{ marginTop: 8 }}>
          {state.daysFallow === null ? "No self-done work on record." : `${state.daysFallow} days since you last did this yourself.`} Suggested: {spec.practice}
        </p>

        <label className="field-label">Length</label>
        <div className="row" style={{ marginTop: 0 }}>
          {LENGTHS.map((m) => (
            <button key={m} className={m === minutes ? "" : "secondary"} onClick={() => setMinutes(m)} disabled={running}>
              {m} min
            </button>
          ))}
        </div>

        <label className="field-label" htmlFor="note">
          What you worked on (optional)
        </label>
        <input id="note" type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="the methods section, by hand" disabled={running} />

        <div className="row">
          {!running ? (
            <button onClick={start}>Start</button>
          ) : (
            <button onClick={finish}>{left === 0 ? "Log it" : "Stop and log"}</button>
          )}
          {capacity < 0.4 && <span className="small">Capacity is low right now ({capacity.toFixed(2)}). A short one, or later.</span>}
        </div>
      </div>
      <div>
        <div className="verdict" style={{ marginTop: 0, textAlign: "center" }}>
          <p className="small">{running ? spec.label : "Ready"}</p>
          <p className="num" style={{ fontSize: 56, margin: "6px 0" }}>
            {running ? `${mm}:${String(ss).padStart(2, "0")}` : `${minutes}:00`}
          </p>
          <p className="small">{running ? "No model. If you get stuck, write down where, then keep going." : "Notifications off. The model stays closed."}</p>
        </div>
        {result && <p className="notice">{result}</p>}
      </div>
    </div>
  );
}
