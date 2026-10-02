"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Ledger } from "@/core/ledger";
import type { Snapshot } from "@/core/summary";
import { rememberSignedIn, restoredUser, signInErrorText, signInWithGoogle, signOutOfGoogle, wasSignedIn, type AccountUser } from "./account";
import { SYNC_ENABLED } from "./firebase-config";
import { BrowserLedger, detectClient, type LedgerClient, type LedgerMode } from "./ledger";
import { FirestoreRemote } from "./remote";
import { SyncEngine, type SyncReport } from "./sync";

export type AccountStatus = "signed-out" | "checking" | "signing-in" | "syncing" | "synced" | "offline" | "error";

export interface AccountState {
  /** Sign-in is offered: the hosted (browser) build with sync switched on. */
  available: boolean;
  status: AccountStatus;
  user: AccountUser | null;
  lastSync: number | null;
  error: string | null;
}

interface FallowContextValue {
  client: LedgerClient | null;
  mode: LedgerMode | null;
  ready: boolean;
  ledger: Ledger | null;
  snapshot: Snapshot | null;
  demo: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  account: AccountState;
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
  /** Swap the demo for an empty garden of your own. */
  startFresh: () => Promise<void>;
  /** Erase everything here and, when signed in, the cloud copy too. */
  eraseAll: () => Promise<void>;
  /** Re-upload the cloud copy after a privacy setting changes. */
  resyncText: () => Promise<void>;
}

const FallowContext = createContext<FallowContextValue | null>(null);

const SIGNED_OUT: AccountState = { available: false, status: "signed-out", user: null, lastSync: null, error: null };
const RESYNC_AFTER_MS = 2 * 60_000;

export function FallowProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<LedgerClient | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountState>(SIGNED_OUT);
  const clientRef = useRef<LedgerClient | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);
  const lastSyncRef = useRef(0);

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

  const report = useCallback((r: SyncReport) => {
    if (r.at) lastSyncRef.current = r.at;
    setAccount((a) => (a.user ? { ...a, status: r.phase, lastSync: r.at ?? a.lastSync, error: r.error ?? null } : a));
  }, []);

  /** Wire a signed-in person's garden to the cloud and bring both sides together. */
  const attach = useCallback(
    async (user: AccountUser) => {
      const local = clientRef.current;
      if (!(local instanceof BrowserLedger)) return;
      engineRef.current?.stop();
      const engine = new SyncEngine(local, new FirestoreRemote(user.uid), report);
      engineRef.current = engine;
      engine.start();
      setAccount((a) => ({ ...a, user, status: "syncing", error: null }));
      try {
        await engine.fullSync();
      } catch {
        /* reported */
      }
      await refresh();
    },
    [refresh, report],
  );

  useEffect(() => {
    let cancelled = false;
    detectClient().then(async (c) => {
      if (cancelled) return;
      clientRef.current = c;
      setClient(c);
      await refresh();
      const available = SYNC_ENABLED && c instanceof BrowserLedger;
      setAccount({ ...SIGNED_OUT, available });
      if (!available || !wasSignedIn()) return;
      setAccount((a) => ({ ...a, status: "checking" }));
      try {
        const user = await restoredUser();
        if (cancelled) return;
        if (user) await attach(user);
        else {
          rememberSignedIn(false);
          setAccount((a) => ({ ...a, status: "signed-out" }));
        }
      } catch {
        setAccount((a) => ({ ...a, status: "signed-out" }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [attach, refresh]);

  const syncNow = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      await engine.fullSync();
    } catch {
      /* reported */
    }
    await refresh();
  }, [refresh]);

  // catch up when the tab comes back or the network returns
  useEffect(() => {
    const maybe = () => {
      if (!engineRef.current || document.visibilityState !== "visible") return;
      if (Date.now() - lastSyncRef.current > RESYNC_AFTER_MS) void syncNow();
    };
    const online = () => void syncNow();
    document.addEventListener("visibilitychange", maybe);
    window.addEventListener("focus", maybe);
    window.addEventListener("online", online);
    return () => {
      document.removeEventListener("visibilitychange", maybe);
      window.removeEventListener("focus", maybe);
      window.removeEventListener("online", online);
    };
  }, [syncNow]);

  const signIn = useCallback(async () => {
    setAccount((a) => ({ ...a, status: "signing-in", error: null }));
    try {
      const user = await signInWithGoogle();
      rememberSignedIn(true);
      await attach(user);
      return true;
    } catch (e) {
      const msg = signInErrorText(e);
      setAccount((a) => ({ ...a, status: msg ? "error" : "signed-out", error: msg, user: null }));
      return false;
    }
  }, [attach]);

  const signOut = useCallback(async () => {
    engineRef.current?.stop();
    engineRef.current = null;
    try {
      await signOutOfGoogle();
    } catch {
      /* signed out locally either way */
    }
    rememberSignedIn(false);
    const local = clientRef.current;
    if (local instanceof BrowserLedger) await local.resetToDemo();
    setAccount((a) => ({ ...a, status: "signed-out", user: null, lastSync: null, error: null }));
    await refresh();
  }, [refresh]);

  const startFresh = useCallback(async () => {
    const local = clientRef.current;
    if (local instanceof BrowserLedger) await local.startFresh();
    await refresh();
  }, [refresh]);

  const eraseAll = useCallback(async () => {
    const engine = engineRef.current;
    if (engine) await engine.eraseRemote();
    await clientRef.current?.clear();
    await refresh();
  }, [refresh]);

  const resyncText = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      await engine.flush();
      await engine.rewriteAll();
    } catch {
      /* reported */
    }
  }, []);

  const value = useMemo<FallowContextValue>(
    () => ({ client, mode: client?.mode ?? null, ready: client !== null && snapshot !== null, ledger, snapshot, demo, error, refresh, account, signIn, signOut, syncNow, startFresh, eraseAll, resyncText }),
    [client, ledger, snapshot, demo, error, refresh, account, signIn, signOut, syncNow, startFresh, eraseAll, resyncText],
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
