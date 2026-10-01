"use client";

import { useEffect, useRef } from "react";
import type { Grid } from "@/pixel/grid";
import { paint } from "@/pixel/grid";

/** Any small pixel sprite, painted crisp at an integer scale. */
export function SpriteIcon({ grid, scale = 3, label }: { grid: Grid; scale?: number; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    paint(ctx, grid, 0, 0);
  }, [grid]);
  return <canvas ref={ref} className="pixel" width={grid.w} height={grid.h} style={{ width: grid.w * scale, height: grid.h * scale }} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}
