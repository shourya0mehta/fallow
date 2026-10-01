"use client";

import { useEffect, useRef, useState } from "react";
import { useFallow } from "@/client/FallowProvider";
import { DOMAIN_BY_ID } from "@/core/taxonomy";
import { useGarden } from "./GardenContext";
import { PLANT_NAME, SESSION_MIN } from "./names";
import { PlantIcon } from "./PlantIcon";

const LENGTHS = [5, 10, 15, 25, 45];

/** Practice without the model. Finishing it waters the plant. */
export function Session() {
  const { client, refresh, snapshot } = useFallow();
  const { session, endSession, engine, say } = useGarden();
  const [minutes, setMinutes] = useState(15);
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!session) return;
    setMinutes(session.minutes || SESSION_MIN[session.id]);
    setRunning(false);
    setNote("");
    startedAt.current = null;
  }, [session]);

  useEffect(() => {
    if (!running) return;
    const tick = () => setLeft(Math.max(0, minutes * 60_000 - (Date.now() - (startedAt.current ?? Date.now()))));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [running, minutes]);

  useEffect(() => {
    if (running && left === 0 && startedAt.current) say("Time! Log it when you're ready.", 4000);
  }, [running, left, say]);

  if (!session) return null;
  const spec = DOMAIN_BY_ID[session.id];
  const state = snapshot?.states.find((s) => s.id === session.id);

  async function finish() {
    if (!client || !session) return;
    setBusy(true);
    const elapsed = startedAt.current ? Math.max(1, Math.round((Date.now() - startedAt.current) / 60_000)) : minutes;
    const before = state?.retrievability ?? 0;
    try {
      await client.logPrompt({
        text: `Practice: ${spec.label}${note ? `, ${note}` : ""}`,
        source: "practice",
        actor: "self",
        icap: "constructive",
        minutes: elapsed,
        demanding: elapsed >= 25,
        domains: [{ id: session.id, weight: 1 }],
      });
      await engine.current?.water(session.id);
      const snap = await client.snapshot(new Date());
      await refresh();
      const after = snap.states.find((s) => s.id === session.id);
      say(after ? `${PLANT_NAME[session.id].the[0].toUpperCase()}${PLANT_NAME[session.id].the.slice(1)} drank it up! Freshness ${before.toFixed(2)} → ${after.retrievability.toFixed(2)}` : "Watered!", 6000);
      endSession();
    } catch {
      say("Hmm, I couldn't save that one.", 4000);
    } finally {
      setBusy(false);
      setRunning(false);
    }
  }

  const mm = Math.floor(left / 60_000);
  const ss = Math.floor((left % 60_000) / 1000);

  return (
    <div className="session" role="region" aria-label={`Practice session: ${spec.label}`}>
      <div className="session-head">
        <PlantIcon id={session.id} status={state?.status ?? "fresh"} scale={2} ghost />
        <div>
          <p className="eyebrow">Watering {PLANT_NAME[session.id].the}</p>
          <h3>{spec.label}, without the AI</h3>
          <p className="session-tip">{spec.practice}</p>
        </div>
      </div>
      <div className="session-body">
        <div className="clock num" aria-live="off">
          {running ? `${mm}:${String(ss).padStart(2, "0")}` : `${minutes}:00`}
        </div>
        {!running && (
          <div className="chips" role="group" aria-label="Length">
            {LENGTHS.map((m) => (
              <button key={m} className={`chip ${m === minutes ? "on" : ""}`} onClick={() => setMinutes(m)}>
                {m}m
              </button>
            ))}
          </div>
        )}
        <input type="text" className="session-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What are you working on? (optional)" />
        <div className="row">
          {!running ? (
            <button
              className="btn"
              onClick={() => {
                startedAt.current = Date.now();
                setRunning(true);
                say("I'll keep quiet. You've got this.", 3000);
              }}
            >
              Start
            </button>
          ) : null}
          <button className={running ? "btn" : "btn ghost"} onClick={finish} disabled={busy}>
            {busy ? "Watering…" : running ? "I did it" : "Already did it"}
          </button>
          <button className="btn ghost" onClick={endSession} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
