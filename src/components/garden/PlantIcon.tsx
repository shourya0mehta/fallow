"use client";

import { useEffect, useRef } from "react";
import type { DomainId, DomainStatus } from "@/core/types";
import { paint } from "@/pixel/grid";
import { PLANT_H, PLANT_W, plantGrid } from "@/pixel/plants";
import { creatureGrid, type Stage } from "@/pixel/creature";

/**
 * A plant drawn crisp at an integer scale, for cards, quests and chips. With
 * `ghost`, a dry or bare plant shows a faint outline of what could grow there,
 * standing on a strip of soil, so the icon never reads as empty.
 */
export function PlantIcon({ id, status = "fresh", scale = 2, ghost = false, className }: { id: DomainId; status?: DomainStatus; scale?: number; ghost?: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const H = ghost ? PLANT_H + 2 : PLANT_H;
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    if (ghost && status !== "fresh") {
      ctx.globalAlpha = 0.22;
      paint(ctx, plantGrid(id, "fresh"), 0, 0);
      ctx.globalAlpha = 1;
    }
    paint(ctx, plantGrid(id, status), 0, 0);
    if (ghost) {
      ctx.fillStyle = status === "fallow" || status === "stale" ? "#b08b5e" : "#7a5236";
      ctx.fillRect(1, PLANT_H, PLANT_W - 2, 2);
    }
  }, [id, status, ghost]);
  return <canvas ref={ref} className={`pixel ${className ?? ""}`} width={PLANT_W} height={H} style={{ width: PLANT_W * scale, height: H * scale }} aria-hidden="true" />;
}

/** The pet's face, still, for the wordmark and small places. */
export function PetIcon({ stage = "steady", scale = 2, className }: { stage?: Stage; scale?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    paint(ctx, creatureGrid(stage, {}), -4, -4);
  }, [stage]);
  return <canvas ref={ref} className={`pixel ${className ?? ""}`} width={24} height={21} style={{ width: 24 * scale, height: 21 * scale }} aria-hidden="true" />;
}
