import { NextResponse } from "next/server";
import { parseClock } from "@/core/alertness";
import { loadLedger, updateSettings } from "@/core/store";
import { DOMAIN_IDS } from "@/core/taxonomy";
import type { Chronotype, DomainId, Intensity, Settings, SleepWindow } from "@/core/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const ledger = await loadLedger();
  return NextResponse.json(ledger.settings);
}

export async function POST(req: Request) {
  let body: Partial<Settings> & { sleepDate?: string; sleepForDate?: SleepWindow };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
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
  const settings = await updateSettings(patch);
  return NextResponse.json(settings);
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
