"use client";

import { useFallow } from "@/client/FallowProvider";

/** The line under every page, honest about where the data lives right now. */
export function Footer() {
  const { account, ledger, mode } = useFallow();
  let where = "Everything stays on your device.";
  if (mode === "browser" && account.user) where = ledger?.settings.syncText ? "Your garden and the text of your asks sync to your Google account." : "Your garden syncs to your Google account. What you type stays on this device.";
  return <footer className="foot">Fallow tracks what you ask AI to do and what you do yourself. It does not measure your brain or diagnose anything. {where}</footer>;
}
