"use client";

import { Loading, useFallow } from "@/client/FallowProvider";
import { SettingsForm } from "./SettingsForm";

export default function SettingsPage() {
  const { ready, ledger, mode } = useFallow();
  return (
    <main>
      <p className="dateline">Settings</p>
      <h1>What to keep sharp, and how hard to push.</h1>
      <p className="lede">The keep list is protected first. Intensity sets the thresholds: the forcing functions that work best are the ones people like least, so this stays your call.</p>
      {!ready || !ledger ? <Loading what="settings" /> : <SettingsForm initial={ledger.settings} eventCount={ledger.events.length} mode={mode ?? "browser"} />}
    </main>
  );
}
