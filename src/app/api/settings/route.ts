import { parseClock } from "@/core/alertness";
import { json, preflight } from "@/core/http";
import { loadLedger, updateSettings } from "@/core/store";
import { DOMAIN_IDS } from "@/core/taxonomy";
import type { Chronotype, DomainId, Intensity, Settings, SleepWindow } from "@/core/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ledger = await loadLedger();
  return json(req, ledger.settings);
}

export function OPTIONS(req: Request) {
  return preflight(req);
}

export async function POST(req: Request) {
  let body: Partial<Settings> & { sleepDate?: string; sleepForDate?: SleepWindow };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "Body must be JSON." }, { status: 400 });
  }
  const patch: Partial<Settings> = {};
  if (Array.isArray(body.keepList)) patch.keepList = body.keepList.filter((d): d is DomainId => (DOMAIN_IDS as string[]).includes(d as string));
  if (body.intensity && ["gentle", "standard", "firm"].includes(body.intensity)) patch.intensity = body.intensity as Intensity;
  if (body.chronotype && ["morning", "intermediate", "evening"].includes(body.chronotype)) patch.chronotype = body.chronotype as Chronotype;
  if (body.sleep && validSleep(body.sleep)) patch.sleep = body.sleep;
  if (body.sleepDate && body.sleepForDate && validSleep(body.sleepForDate) && /^\d{4}-\d{2}-\d{2}$/.test(body.sleepDate)) {
    const current = await loadLedger();
    patch.sleepLog = { ...current.settings.sleepLog, [body.sleepDate]: body.sleepForDate };
  }
  if (Array.isArray(body.entertainmentSites)) {
    patch.entertainmentSites = body.entertainmentSites
      .filter((h): h is string => typeof h === "string")
      .map((h) => h.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
      .filter((h) => /^[a-z0-9.-]+$/.test(h));
  }
  if (typeof body.entertainmentBudgetMin === "number" && body.entertainmentBudgetMin >= 0) patch.entertainmentBudgetMin = Math.round(body.entertainmentBudgetMin);
  if (typeof body.pauseSeconds === "number" && body.pauseSeconds >= 0 && body.pauseSeconds <= 120) patch.pauseSeconds = Math.round(body.pauseSeconds);
  const settings = await updateSettings(patch);
  return json(req, settings);
}

function validSleep(s: SleepWindow): boolean {
  try {
    parseClock(s.bed);
    parseClock(s.wake);
    return true;
  } catch {
    return false;
  }
}
