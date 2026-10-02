"use client";

import { Loading, useFallow } from "@/client/FallowProvider";
import { SettingsForm } from "./SettingsForm";

export default function SettingsPage() {
  const { ready, ledger, mode } = useFallow();
  return (
    <div className="page">
      <div className="page-head">
        <h1>Settings</h1>
        <p>What to keep growing, how hard Shumbo pushes back, and when he sleeps.</p>
      </div>
      {!ready || !ledger ? <Loading what="settings" /> : <SettingsForm initial={ledger.settings} eventCount={ledger.events.length} mode={mode ?? "browser"} />}
    </div>
  );
}
