"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { DomainId } from "@/core/types";
import type { GardenEngine } from "./engine";

/**
 * Lets everything on the home screen talk to the garden: the ask bar makes the
 * pet think and speak, quests highlight their plant, a finished practice
 * session waters it.
 */
interface GardenControl {
  engine: React.MutableRefObject<GardenEngine | null>;
  bubble: { text: string; id: number } | null;
  say(text: string, ms?: number): void;
  selected: DomainId | null;
  select(id: DomainId | null): void;
  session: { id: DomainId; minutes: number } | null;
  startSession(id: DomainId, minutes?: number): void;
  endSession(): void;
}

const Ctx = createContext<GardenControl | null>(null);

export function GardenProvider({ children }: { children: React.ReactNode }) {
  const engine = useRef<GardenEngine | null>(null);
  const [bubble, setBubble] = useState<{ text: string; id: number } | null>(null);
  const [selected, setSelected] = useState<DomainId | null>(null);
  const [session, setSession] = useState<{ id: DomainId; minutes: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((text: string, ms = 4200) => {
    if (timer.current) clearTimeout(timer.current);
    const id = Date.now();
    setBubble({ text, id });
    timer.current = setTimeout(() => setBubble((b) => (b?.id === id ? null : b)), ms);
  }, []);

  const select = useCallback((id: DomainId | null) => {
    setSelected(id);
    engine.current?.selectPlant(id);
  }, []);

  const startSession = useCallback((id: DomainId, minutes?: number) => {
    setSelected(null);
    engine.current?.selectPlant(id);
    setSession({ id, minutes: minutes ?? 0 });
  }, []);

  const endSession = useCallback(() => setSession(null), []);

  const value = useMemo(() => ({ engine, bubble, say, selected, select, session, startSession, endSession }), [bubble, say, selected, select, session, startSession, endSession]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGarden(): GardenControl {
  const c = useContext(Ctx);
  if (!c) throw new Error("useGarden must be used inside GardenProvider");
  return c;
}
