"use client";

import { useState } from "react";
import { useFallow } from "@/client/FallowProvider";
import type { Chronotype, SleepWindow } from "@/core/types";

export function SleepForm({ date, sleep, chronotype }: { date: string; sleep: SleepWindow; chronotype: Chronotype }) {
  const { client, refresh } = useFallow();
  const [bed, setBed] = useState(sleep.bed);
  const [wake, setWake] = useState(sleep.wake);
  const [type, setType] = useState<Chronotype>(chronotype);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    if (!client) return;
    setBusy(true);
    await client.updateSettings({ sleepDate: date, sleepForDate: { bed, wake }, chronotype: type });
    await refresh();
    setBusy(false);
    setSaved(true);
  }

  return (
    <div>
      <label className="field-label" htmlFor="bed">
        Went to bed
      </label>
      <input id="bed" type="time" value={bed} onChange={(e) => setBed(e.target.value)} />
      <label className="field-label" htmlFor="wake">
        Woke up
      </label>
      <input id="wake" type="time" value={wake} onChange={(e) => setWake(e.target.value)} />
      <label className="field-label" htmlFor="chronotype">
        Chronotype
      </label>
      <select id="chronotype" value={type} onChange={(e) => setType(e.target.value as Chronotype)}>
        <option value="morning">Morning type</option>
        <option value="intermediate">Intermediate</option>
        <option value="evening">Evening type</option>
      </select>
      <div className="row">
        <button onClick={save} disabled={busy}>
          Save for {date}
        </button>
        {saved && <span className="small">Saved.</span>}
      </div>
      <p className="small" style={{ marginTop: 12 }}>Chronotype shifts the circadian peak by about 0.7 h per step (Ingre et al. 2014). The default schedule lives in Settings.</p>
    </div>
  );
}
