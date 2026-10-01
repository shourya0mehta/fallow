"use client";

import { useState } from "react";
import { Loading, useFallow } from "@/client/FallowProvider";
import type { Assessment } from "@/core/assess";
import { MODE_LABEL } from "@/core/policy";
import { DOMAIN_BY_ID } from "@/core/taxonomy";

const EXAMPLES = [
  "Write me an email to my advisor asking for a two-week extension on the SNOTEL analysis",
  "Why doesn't this regex match? /^\\d{3}-\\d{4}$/ against 555-12345",
  "Give me a hint on this integral, don't give me the answer: integral of x e^x dx",
  "Summarize the key points of this paper on cognitive offloading",
  "Brainstorm ten names for an acoustic biodiversity monitoring app",
];

export default function GatePage() {
  const { client, ready, refresh } = useFallow();
  const [text, setText] = useState("");
  const [deadline, setDeadline] = useState(false);
  const [result, setResult] = useState<Assessment | null>(null);
  const [busy, setBusy] = useState(false);
  const [logged, setLogged] = useState<string | null>(null);
  const [minutes, setMinutes] = useState("");
  const [demanding, setDemanding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!client) return;
    setBusy(true);
    setError(null);
    setLogged(null);
    try {
      setResult(await client.assess(text, deadline));
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function log(actor: "self" | "shared" | "ai") {
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      const icap = actor === "self" ? "constructive" : actor === "shared" ? "active" : "passive";
      await client.logPrompt({ text, source: "gate", actor, icap, minutes: minutes ? Number(minutes) : undefined, demanding });
      await refresh();
      setLogged(actor === "self" ? "Logged as done yourself. Stability grows." : actor === "shared" ? "Logged as shared work." : "Logged as delegated.");
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  const r = result?.recommendation;
  const c = result?.classification;

  return (
    <main>
      <p className="dateline">The gate</p>
      <h1>Before you hand it over.</h1>
      <p className="lede">Paste what you were about to ask an AI. Fallow files it by cognitive domain, checks how long that domain has lain fallow, and says which mode the model should work in.</p>
      {!ready && <Loading what="the gate" />}

      <div className="two-col">
        <div>
          <label className="field-label" htmlFor="task">
            The ask
          </label>
          <textarea id="task" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write me a cover letter for…" />
          <label className="check">
            <input type="checkbox" checked={deadline} onChange={(e) => setDeadline(e.target.checked)} /> Real deadline on this
          </label>
          <div className="row">
            <button onClick={run} disabled={busy || !ready || text.trim().length === 0}>
              Assess
            </button>
            <span className="small">Nothing leaves this machine.</span>
          </div>
          <p className="small" style={{ marginTop: 18 }}>Try one:</p>
          <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
            {EXAMPLES.map((ex) => (
              <li key={ex} style={{ marginBottom: 6 }}>
                <a href="#task" onClick={() => setText(ex)} style={{ textDecoration: "underline" }}>
                  {ex}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          {error && <p className="notice">{error}</p>}
          {r && c && (
            <div className="verdict" aria-live="polite">
              <p className="small">Engagement mode</p>
              <p className={`mode mode-${r.mode}`}>{MODE_LABEL[r.mode]}</p>
              <p className="small">
                {c.domains.map((d) => `${DOMAIN_BY_ID[d.id].label} ${Math.round(d.weight * 100)}%`).join(" · ")} · ask type {c.askType} · {c.icap} · confidence {c.confidence.toFixed(2)}
              </p>
              <ul>
                {r.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <div className="scaffold">{r.scaffold}</div>
              <p className="small">Signals: {c.signals.join(", ") || "none"}. Capacity {r.capacity.toFixed(2)}.</p>

              <p className="section-label" style={{ marginTop: 18 }}>
                Then log what actually happened
              </p>
              <div className="row">
                <input type="text" inputMode="numeric" placeholder="minutes" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))} style={{ width: 110 }} />
                <label className="check">
                  <input type="checkbox" checked={demanding} onChange={(e) => setDemanding(e.target.checked)} /> demanding
                </label>
              </div>
              <div className="row">
                <button onClick={() => log("self")} disabled={busy}>
                  Did it myself
                </button>
                <button className="secondary" onClick={() => log("shared")} disabled={busy}>
                  Shared it
                </button>
                <button className="secondary" onClick={() => log("ai")} disabled={busy}>
                  Delegated it
                </button>
              </div>
              {logged && <p className="small" style={{ marginTop: 10 }}>{logged}</p>}
            </div>
          )}
          {!r && <p className="small" style={{ marginTop: 40 }}>The verdict appears here. Four modes: do it yourself, scaffold, co-pilot, delegate. Hints and reviews route straight to scaffold and co-pilot, because you already chose to engage.</p>}
        </div>
      </div>

      {result && (
        <section className="section">
          <p className="section-label">What a host model receives (the Claude Code hook and the extension inject this)</p>
          <pre>{result.context}</pre>
        </section>
      )}
    </main>
  );
}
