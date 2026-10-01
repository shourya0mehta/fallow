"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Ledger } from "@/core/ledger";
import type { Snapshot } from "@/core/summary";
import { detectClient, type LedgerClient, type LedgerMode } from "./ledger";

interface FallowContextValue {
  client: LedgerClient | null;
  mode: LedgerMode | null;
  ready: boolean;
  ledger: Ledger | null;
  snapshot: Snapshot | null;
  demo: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const FallowContext = createContext<FallowContextValue | null>(null);

export function FallowProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<LedgerClient | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<LedgerClient | null>(null);

  const refresh = useCallback(async () => {
    const c = clientRef.current;
    if (!c) return;
    try {
      const [l, s, d] = await Promise.all([c.load(), c.snapshot(new Date()), c.isDemo()]);
      setLedger(l);
      setSnapshot(s);
      setDemo(d);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    detectClient().then(async (c) => {
      if (cancelled) return;
      clientRef.current = c;
      setClient(c);
      await refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const value = useMemo<FallowContextValue>(
    () => ({ client, mode: client?.mode ?? null, ready: client !== null && snapshot !== null, ledger, snapshot, demo, error, refresh }),
    [client, ledger, snapshot, demo, error, refresh],
  );

  return <FallowContext.Provider value={value}>{children}</FallowContext.Provider>;
}

export function useFallow(): FallowContextValue {
  const ctx = useContext(FallowContext);
  if (!ctx) throw new Error("useFallow must be used inside FallowProvider");
  return ctx;
}

/** A quiet loading line in the house style. */
export function Loading({ what = "the field book" }: { what?: string }) {
  return (
    <p className="small" style={{ marginTop: 24 }}>
      Opening {what}…
    </p>
  );
}
