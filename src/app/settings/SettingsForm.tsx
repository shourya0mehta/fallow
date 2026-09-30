"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DOMAINS } from "@/core/taxonomy";
import type { Chronotype, DomainId, Intensity, Settings } from "@/core/types";

export function SettingsForm({ initial, eventCount }: { initial: Settings; eventCount: number }) {
  const router = useRouter();
  const [keep, setKeep] = useState<DomainId[]>(initial.keepList);
  const [intensity, setIntensity] = useState<Intensity>(initial.intensity);
  const [chronotype, setChronotype] = useState<Chronotype>(initial.chronotype);
  const [bed, setBed] = useState(initial.sleep.bed);
  const [wake, setWake] = useState(initial.sleep.wake);
  const [sites, setSites] = useState(initial.entertainmentSites.join("\n"));
  const [budget, setBudget] = useState(String(initial.entertainmentBudgetMin));
  const [pauseSeconds, setPauseSeconds] = useState(String(initial.pauseSeconds));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");

  function toggle(id: DomainId) {
    setKeep((k) => (k.includes(id) ? k.filter((x) => x !== id) : [...k, id]));
  }

  async function save() {
    setBusy(true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        keepList: keep,
        intensity,
        chronotype,
        sleep: { bed, wake },
        entertainmentSites: sites.split(/\n+/).map((s) => s.trim()).filter(Boolean),
        entertainmentBudgetMin: Number(budget) || 0,
        pauseSeconds: Number(pauseSeconds) || 0,
      }),
    });
    setBusy(false);
    setMsg("Saved.");
    router.refresh();
  }

  async function erase() {
    setBusy(true);
    const res = await fetch("/api/clear", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm }) });
    setBusy(false);
    setMsg(res.ok ? "Ledger erased." : "Type erase to confirm.");
    setConfirm("");
    router.refresh();
  }

  return (
    <div>
      <p className="section-label" style={{ marginTop: 24 }}>
        Keep list
      </p>
      <div>
        {DOMAINS.filter((d) => d.id !== "attention").map((d) => (
          <label key={d.id} className="check">
            <input type="checkbox" checked={keep.includes(d.id)} onChange={() => toggle(d.id)} /> {d.label}
          </label>
        ))}
      </div>

      <label className="field-label" htmlFor="intensity">
        Intensity
      </label>
      <select id="intensity" value={intensity} onChange={(e) => setIntensity(e.target.value as Intensity)}>
        <option value="gentle">Gentle: pushes back only on fallow keep-list domains</option>
        <option value="standard">Standard</option>
        <option value="firm">Firm: pushes back on most stale conceptual work</option>
      </select>

      <label className="field-label" htmlFor="chronotype">
        Chronotype
      </label>
      <select id="chronotype" value={chronotype} onChange={(e) => setChronotype(e.target.value as Chronotype)}>
        <option value="morning">Morning type</option>
        <option value="intermediate">Intermediate</option>
        <option value="evening">Evening type</option>
      </select>

      <label className="field-label">Usual sleep</label>
      <div className="row" style={{ marginTop: 0 }}>
        <span className="small">bed</span>
        <input type="time" value={bed} onChange={(e) => setBed(e.target.value)} />
        <span className="small">wake</span>
        <input type="time" value={wake} onChange={(e) => setWake(e.target.value)} />
      </div>

      <section className="section">
        <p className="section-label">Screens · the browser extension reads these</p>
        <label className="field-label" htmlFor="sites">
          Entertainment sites, one per line
        </label>
        <textarea id="sites" value={sites} onChange={(e) => setSites(e.target.value)} style={{ minHeight: 120, fontFamily: "var(--mono)", fontSize: 14 }} />
        <div className="row">
          <label className="check">
            <span className="small">daily budget, minutes</span>
            <input type="text" inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value.replace(/\D/g, ""))} style={{ width: 90 }} />
          </label>
          <label className="check">
            <span className="small">pause length, seconds</span>
            <input type="text" inputMode="numeric" value={pauseSeconds} onChange={(e) => setPauseSeconds(e.target.value.replace(/\D/g, ""))} style={{ width: 90 }} />
          </label>
        </div>
        <p className="small">A pause before the site opens, with a self-set budget shown on it. In the one field study of this design, people closed the app about a third of the time and opened it 57% less after six weeks. A budget is a number you see, never a lock.</p>
      </section>

      <div className="row">
        <button onClick={save} disabled={busy}>
          Save settings
        </button>
        {msg && <span className="small">{msg}</span>}
      </div>

      <section className="section">
        <p className="section-label">Data</p>
        <p className="small">
          {eventCount.toLocaleString()} entries in <code>data/fallow.json</code>. Back it up by copying the file. Erasing cannot be undone.
        </p>
        <div className="row">
          <input type="text" placeholder="type erase" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={{ width: 160 }} />
          <button className="danger" onClick={erase} disabled={busy || confirm !== "erase"}>
            Erase ledger
          </button>
        </div>
      </section>
    </div>
  );
}
