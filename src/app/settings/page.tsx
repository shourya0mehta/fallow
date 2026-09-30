import { loadLedger } from "@/core/store";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ledger = await loadLedger();
  return (
    <main>
      <p className="dateline">Settings</p>
      <h1>What to keep sharp, and how hard to push.</h1>
      <p className="lede">The keep list is protected first. Intensity sets the thresholds: the forcing functions that work best are the ones people like least, so this stays your call.</p>
      <SettingsForm initial={ledger.settings} eventCount={ledger.events.length} />
    </main>
  );
}
