"use client";

import { useEffect, useRef } from "react";
import { BRAIN_FRAMES, BRAIN_PALETTE, BRAIN_SIZE, type Stage } from "@/pixel/brain";
import { TILES, TILE_PALETTE, TILE_SIZE } from "@/pixel/tiles";

/** Frame order per stage; a longer loop than the four drawings so blinks stay rare. */
const SEQUENCE: Record<Stage, number[]> = {
  thriving: [0, 1, 1, 0, 2, 3, 3, 0],
  steady: [0, 1, 0, 2, 0, 0, 3, 0],
  fading: [0, 0, 1, 1, 2, 2, 1, 3],
  fallow: [0, 0, 0, 0, 2, 3, 0, 0],
};
const FRAME_MS = 170;

export function drawGrid(ctx: CanvasRenderingContext2D, rows: string[], palette: Record<string, string | null>, scale: number, ox = 0, oy = 0) {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const c = palette[row[x]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    }
  }
}

function drawGround(ctx: CanvasRenderingContext2D, width: number, scale: number, baseY: number) {
  ctx.fillStyle = "#7a5a3a";
  ctx.fillRect(0, baseY, width, scale);
  ctx.fillStyle = "#a0784e";
  ctx.fillRect(0, baseY + scale, width, scale * 3);
  ctx.fillStyle = "#6e8a4a";
  for (let x = 2; x < width / scale; x += 7) {
    ctx.fillRect(x * scale, baseY - scale, scale, scale);
    ctx.fillRect((x + 2) * scale, baseY - scale, scale, scale);
    ctx.fillRect((x + 1) * scale, baseY - 2 * scale, scale, scale);
  }
}

/**
 * The brain creature. Four stages, four drawings each, looped on a canvas at an
 * integer scale so every pixel stays crisp. Honors prefers-reduced-motion by
 * holding the first frame.
 */
export function Brain({ stage, scale = 6, ground = true, animate = true, className }: { stage: Stage; scale?: number; ground?: boolean; animate?: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const height = ground ? BRAIN_SIZE - 4 : BRAIN_SIZE - 6;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const still = !animate || (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const seq = SEQUENCE[stage];
    const frames = BRAIN_FRAMES[stage];
    let tick = 0;
    const paint = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (ground) drawGround(ctx, canvas.width, scale, 23 * scale);
      drawGrid(ctx, frames[seq[tick % seq.length]], BRAIN_PALETTE, scale, 0, 0);
      tick++;
    };
    paint();
    if (still) return;
    const id = window.setInterval(paint, FRAME_MS);
    return () => window.clearInterval(id);
  }, [stage, scale, ground, animate]);
  return <canvas ref={ref} className={className} width={BRAIN_SIZE * scale} height={height * scale} role="img" aria-label={`Your brain, ${stage}`} />;
}

/** A 16x16 garden-plot tile for a domain status. */
export function PlotTile({ status, scale = 3, className }: { status: string; scale?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid(ctx, TILES[status] ?? TILES.fallow, TILE_PALETTE, scale, 0, 0);
  }, [status, scale]);
  return <canvas ref={ref} className={className} width={TILE_SIZE * scale} height={TILE_SIZE * scale} aria-hidden="true" />;
}
