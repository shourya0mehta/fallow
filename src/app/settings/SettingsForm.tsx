"use client";

import { useEffect, useRef, useState } from "react";
import { useFallow } from "@/client/FallowProvider";
import { PlantIcon } from "@/components/garden/PlantIcon";
import { PLANT_NAME } from "@/components/garden/names";
import { localDateKey } from "@/core/time";
import { DOMAINS } from "@/core/taxonomy";
import type { Chronotype, DomainId, Intensity, Settings } from "@/core/types";

const INTENSITY: Array<{ id: Intensity; label: string; note: string }> = [
  { id: "gentle", label: "Gentle", note: "Speaks up only for bare keep-list plants" },
  { id: "standard", label: "Standard", note: "Speaks up for dry plants and conceptual work" },
  { id: "firm", label: "Firm", note: "Asks you to try first most of the time" },
];

export function SettingsForm({ initial, eventCount, mode }: { initial: Settings; eventCount: number; mode: "server" | "browser" }) {
  const { client, refresh, ledger, account, signIn, signOut, eraseAll, resyncText } = useFallow();
  const [syncText, setSyncText] = useState(initial.syncText === true);
  const [keep, setKeep] = useState<DomainId[]>(initial.keepList);
  const [intensity, setIntensity] = useState<Intensity>(initial.intensity);
  const [chronotype, setChronotype] = useState<Chronotype>(initial.chronotype);
  const [bed, setBed] = useState(initial.sleep.bed);
  const [wake, setWake] = useState(initial.sleep.wake);
  const today = localDateKey(new Date());
  const lastNight = initial.sleepLog?.[today];
  const [nightBed, setNightBed] = useState(lastNight?.bed ?? initial.sleep.bed);
  const [nightWake, setNightWake] = useState(lastNight?.wake ?? initial.sleep.wake);
  const [sites, setSites] = useState(initial.entertainmentSites.join("\n"));
  const [budget, setBudget] = useState(String(initial.entertainmentBudgetMin));
  const [pauseSeconds, setPauseSeconds] = useState(String(initial.pauseSeconds));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");

  function toggle(id: DomainId) {
    setKeep((k) => (k.includes(id) ? k.filter((x) => x !== id) : [...k, id]));
  }

  // save a moment after any change: no button to hunt for
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => void save(), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keep, intensity, chronotype, bed, wake, nightBed, nightWake, sites, budget, pauseSeconds]);

  async function save() {
    if (!client) return;
    setBusy(true);
    await client.updateSettings({
      keepList: keep,
      intensity,
      chronotype,
      sleep: { bed, wake },
      entertainmentSites: sites
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean),
      entertainmentBudgetMin: Number(budget) || 0,
      pauseSeconds: Number(pauseSeconds) || 0,
    });
    if (nightBed !== bed || nightWake !== wake || lastNight) await client.updateSettings({ sleepDate: today, sleepForDate: { bed: nightBed, wake: nightWake } });
    await refresh();
    setBusy(false);
    setMsg("Saved ✓");
    setTimeout(() => setMsg(null), 2500);
  }

  function exportLedger() {
    if (!ledger) return;
    const blob = new Blob([JSON.stringify(ledger, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fallow-ledger-${today}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function erase() {
    if (!client || confirm !== "erase") return;
    setBusy(true);
    try {
      await eraseAll();
      setMsg(account.user ? "Erased here and in your account." : "Erased.");
    } catch {
      setMsg("Couldn't reach your account to erase it. Nothing was deleted. Try again online.");
    }
    setBusy(false);
    setConfirm("");
    setTimeout(() => setMsg(null), 3500);
  }

  async function toggleSyncText(on: boolean) {
    if (!client) return;
    setSyncText(on);
    await client.updateSettings({ syncText: on });
    await resyncText();
    await refresh();
    setMsg(on ? "Ask text now syncs too." : "Ask text removed from your account.");
    setTimeout(() => setMsg(null), 3000);
  }

  return (
    <div className="page">
      <section className="card">
        <h2>Keep list</h2>
        <p className="card-sub">The plants you most want to keep growing. They count most toward Shumbo&apos;s health.</p>
        <div className="keep-grid">
          {DOMAINS.filter((d) => d.id !== "attention").map((d) => {
            const on = keep.includes(d.id);
            return (
              <button key={d.id} className={`keep-tile ${on ? "on" : ""}`} onClick={() => toggle(d.id)} aria-pressed={on}>
                <PlantIcon id={d.id} status={on ? "fresh" : "fading"} scale={2} />
                <b>{d.label}</b>
                <span>{PLANT_NAME[d.id].one}</span>
                <i className="tick" aria-hidden="true">
                  {on ? "♥" : ""}
                </i>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2>How hard to push back</h2>
        <p className="card-sub">The nudges that work best are the ones people like least, so this is your call.</p>
        <div className="segmented" role="radiogroup" aria-label="Intensity">
          {INTENSITY.map((o) => (
            <button key={o.id} role="radio" aria-checked={intensity === o.id} className={intensity === o.id ? "on" : ""} onClick={() => setIntensity(o.id)}>
              <b>{o.label}</b>
              <span>{o.note}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>Sleep</h2>
          <p className="card-sub">Sets your energy curve, and when Shumbo naps.</p>
          <div className="time-row">
            <label>
              <span className="field-label">Usually asleep</span>
              <input type="time" value={bed} onChange={(e) => setBed(e.target.value)} />
            </label>
            <label>
              <span className="field-label">Usually up</span>
              <input type="time" value={wake} onChange={(e) => setWake(e.target.value)} />
            </label>
          </div>
          <div className="time-row">
            <label>
              <span className="field-label">Last night, asleep</span>
              <input type="time" value={nightBed} onChange={(e) => setNightBed(e.target.value)} />
            </label>
            <label>
              <span className="field-label">This morning, up</span>
              <input type="time" value={nightWake} onChange={(e) => setNightWake(e.target.value)} />
            </label>
          </div>
          <span className="field-label">You are a</span>
          <div className="chips">
            {(["morning", "intermediate", "evening"] as Chronotype[]).map((c) => (
              <button key={c} className={`chip ${chronotype === c ? "on" : ""}`} onClick={() => setChronotype(c)}>
                {c === "morning" ? "Morning person" : c === "evening" ? "Night owl" : "In between"}
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          <h2>Screens</h2>
          <p className="card-sub">The browser extension pauses you for a breath on these sites.</p>
          <label className="field-label" htmlFor="sites">
            Sites, one per line
          </label>
          <textarea id="sites" value={sites} onChange={(e) => setSites(e.target.value)} style={{ minHeight: 120, fontFamily: "var(--mono)", fontSize: 14 }} />
          <div className="time-row">
            <label>
              <span className="field-label">Daily budget, min</span>
              <input type="text" inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value.replace(/\D/g, ""))} />
            </label>
            <label>
              <span className="field-label">Pause, seconds</span>
              <input type="text" inputMode="numeric" value={pauseSeconds} onChange={(e) => setPauseSeconds(e.target.value.replace(/\D/g, ""))} />
            </label>
          </div>
        </section>
      </div>

      <div className="save-bar" aria-live="polite">
        {msg && (
          <span className="saved" role="status">
            {msg}
          </span>
        )}
      </div>

      {account.available && (
        <section className="card">
          <h2>Account and sync</h2>
          {account.user ? (
            <>
              <p className="card-sub">
                Signed in as <b>{account.user.name ?? account.user.email}</b>
                {account.user.email && account.user.name ? ` (${account.user.email})` : ""}. Your garden syncs to every device you sign in on.
              </p>
              <label className="toggle-row">
                <input type="checkbox" checked={syncText} onChange={(e) => void toggleSyncText(e.target.checked)} />
                <span>
                  <b>Also sync the text of my asks</b>
                  <span className="fine">Off by default: only plant tags, times and settings leave this device. On: the first 140 characters of each ask sync too, so the Journal reads the same everywhere.</span>
                </span>
              </label>
              <div className="row">
                <button className="btn ghost" onClick={() => void signOut()}>
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="card-sub">Sign in with Google to keep your garden on every device. Free, and what you type stays on the device where you typed it.</p>
              {account.error && <p className="account-error">{account.error}</p>}
              <div className="row">
                <button className="btn" onClick={() => void signIn()} disabled={account.status === "signing-in"}>
                  {account.status === "signing-in" ? "Signing in…" : "Sign in with Google"}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      <section className="card">
        <h2>Your data</h2>
        <p className="card-sub">
          {eventCount.toLocaleString()} {eventCount === 1 ? "entry" : "entries"}{" "}
          {mode === "server" ? "in data/fallow.json on this machine." : account.user ? "in this browser and in your account." : "in this browser only. Clearing site data removes them."}
        </p>
        <div className="row">
          <button className="btn ghost" onClick={exportLedger}>
            Download as JSON
          </button>
          <input type="text" placeholder="type erase" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={{ width: 150 }} aria-label="Type erase to confirm" />
          <button className="btn danger" onClick={erase} disabled={busy || confirm !== "erase"}>
            {account.user ? "Erase everything, here and in my account" : "Erase everything"}
          </button>
        </div>
      </section>
    </div>
  );
}
