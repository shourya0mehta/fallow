"use client";

import { useEffect, useRef, useState } from "react";
import { useFallow } from "@/client/FallowProvider";
import type { Assessment } from "@/core/assess";
import { MODE_LABEL } from "@/core/policy";
import { DOMAIN_BY_ID } from "@/core/taxonomy";
import type { Mode } from "@/core/types";
import { useGarden } from "./GardenContext";
import { PLANT_NAME, SESSION_MIN } from "./names";
import { PlantIcon } from "./PlantIcon";

const LINES: Record<Mode, string> = {
  self: "This one's yours. Try it first!",
  scaffold: "Ask for hints, not the answer.",
  copilot: "Draft it together, then make it yours.",
  delegate: "Go for it. I'll file it.",
};

const EXAMPLES = ["Write me a cover letter for a GIS internship", "Why doesn't this regex match?", "Summarize this paper on sleep and memory", "Plan my week around three exams"];

/** "About to ask an AI?" The pet reads it, files it and says how to ask. */
export function AskBar({ autoFocus }: { autoFocus?: boolean }) {
  const { client, ready, refresh, snapshot } = useFallow();
  const { engine, say, startSession } = useGarden();
  const [text, setText] = useState("");
  const [deadline, setDeadline] = useState(false);
  const [result, setResult] = useState<Assessment | null>(null);
  const [asked, setAsked] = useState("");
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  async function check(e?: React.FormEvent) {
    e?.preventDefault();
    const q = text.trim();
    if (!client || !q) return;
    if (q.length < 12) {
      say("Tell me a little more about it?", 3000);
      return;
    }
    setBusy(true);
    setWhy(false);
    setCopied(false);
    engine.current?.think(true);
    try {
      const [r] = await Promise.all([client.assess(q, deadline), new Promise((res) => setTimeout(res, 650))]);
      setResult(r);
      setAsked(q);
      say(LINES[r.recommendation.mode], 4500);
    } catch {
      say("Something went wrong reading that.", 3000);
    } finally {
      engine.current?.think(false);
      setBusy(false);
    }
  }

  async function log(actor: "self" | "shared" | "ai") {
    if (!client || !asked) return;
    setBusy(true);
    try {
      const icap = actor === "self" ? "constructive" : actor === "shared" ? "active" : "passive";
      await client.logPrompt({ text: asked, source: "gate", actor, icap });
      await refresh();
      if (actor === "self") {
        engine.current?.cheer();
        say("Nice! That one counts as practice.", 3500);
      } else if (actor === "shared") {
        say("Filed as shared work. Good middle ground.", 3500);
      } else {
        engine.current?.sigh();
        say("Filed. No judgment.", 3000);
      }
      setResult(null);
      setText("");
    } finally {
      setBusy(false);
    }
  }

  async function copyScaffold() {
    if (!result) return;
    const add = `[Fallow, ${MODE_LABEL[result.recommendation.mode].toLowerCase()} mode] ${result.recommendation.scaffold}`;
    try {
      await navigator.clipboard.writeText(`${asked}\n\n${add}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const r = result?.recommendation;
  const top = result?.classification.domains[0]?.id;
  const topState = top ? snapshot?.states.find((s) => s.id === top) : undefined;

  return (
    <div className="ask-wrap">
      <form className="ask" onSubmit={check}>
        <label htmlFor="ask-input" className="ask-label">
          About to ask an AI?
        </label>
        <input
          id="ask-input"
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste it here first. I'll tell you how to ask."
          autoComplete="off"
        />
        <button type="button" className={`chip ${deadline ? "on" : ""}`} onClick={() => setDeadline((d) => !d)} aria-pressed={deadline} title="A real deadline makes handing it off easier to justify">
          Deadline
        </button>
        <button type="submit" className="btn" disabled={!ready || busy || !text.trim()}>
          {busy && !result ? "…" : "Check"}
        </button>
      </form>
      {!result && (
        <div className="ask-examples" aria-label="Examples">
          {EXAMPLES.map((ex) => (
            <button key={ex} className="example" onClick={() => setText(ex)}>
              {ex}
            </button>
          ))}
        </div>
      )}

      {r && result && top && (
        <div className={`verdict mode-${r.mode}`} aria-live="polite">
          <button className="x" onClick={() => setResult(null)} aria-label="Close">
            ×
          </button>
          <div className="verdict-head">
            <PlantIcon id={top} status={topState?.status ?? "fresh"} scale={2} ghost />
            <div>
              <p className="eyebrow">
                {DOMAIN_BY_ID[top].label} · {PLANT_NAME[top].one}
              </p>
              <p className="verdict-mode">{MODE_LABEL[r.mode]}</p>
              <p className="verdict-reason">{r.reasons[0]}</p>
            </div>
          </div>
          {r.mode !== "delegate" && (
            <div className="scaffold-box">
              <p>{r.scaffold}</p>
              <button className="btn ghost small-btn" onClick={copyScaffold}>
                {copied ? "Copied ✓" : "Copy my ask with this added"}
              </button>
            </div>
          )}
          <div className="row">
            {r.mode !== "delegate" && (
              <button className="btn" onClick={() => startSession(top, SESSION_MIN[top])} disabled={busy}>
                I'll try first · {SESSION_MIN[top]} min
              </button>
            )}
            <span className="log-label">Then log it:</span>
            <button className="chip" onClick={() => log("self")} disabled={busy}>
              Did it myself
            </button>
            <button className="chip" onClick={() => log("shared")} disabled={busy}>
              Shared
            </button>
            <button className="chip" onClick={() => log("ai")} disabled={busy}>
              Handed off
            </button>
          </div>
          <button className="why" onClick={() => setWhy((w) => !w)} aria-expanded={why}>
            {why ? "Hide why" : "Why?"}
          </button>
          {why && (
            <div className="why-body">
              <ul>
                {r.reasons.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              <p className="fine">
                Filed under {result.classification.domains.map((d) => `${DOMAIN_BY_ID[d.id].label} ${Math.round(d.weight * 100)}%`).join(", ")}. Ask type {result.classification.askType}, engagement {result.classification.icap}. Energy {Math.round(r.capacity * 100)}.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
