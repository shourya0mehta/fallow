"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { creatureGrid, CREATURE_BASE, type Eyes, type Stage } from "@/pixel/creature";
import { paint, type Grid } from "@/pixel/grid";
import * as SPR from "@/pixel/sprites";

/**
 * Shumbo, big and alive, for the intro. Same rig as the garden pet (dot eyes,
 * no mouth), animated on its own small canvas: bouncing, thinking, tired,
 * cheering, and a hop with a heart when poked.
 */
export type ShumboMood = "bounce" | "idle" | "think" | "tired" | "sad" | "cheer" | "look";

export interface ShumboHandle {
  /** A happy hop with hearts, for taps. */
  hop(): void;
  /** Shumbo's 32x32 body box in viewport px, for flying him into the garden. */
  bodyRect(): DOMRect | null;
}

/** Logical canvas: room around the 32x32 body for hops and particles. */
const CW = 56;
const CH = 60;
const BODY_X = 12;
const GROUND = 52;

interface Particle {
  spr: Grid;
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
}

const MOOD_STAGE: Record<ShumboMood, Stage> = {
  bounce: "thriving",
  cheer: "thriving",
  idle: "steady",
  think: "steady",
  look: "steady",
  tired: "fading",
  sad: "fading",
};

export const Shumbo = forwardRef<ShumboHandle, { mood: ShumboMood; scale: number; stage?: Stage; reduced?: boolean; className?: string; onPoke?: () => void; label?: string }>(function Shumbo(
  { mood, scale, stage, reduced = false, className, onPoke, label = "Shumbo" },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ mood, stage, reduced, hopAt: -1e9, lastP: 0, lastHeart: 0, lastSweat: 0, particles: [] as Particle[], top: GROUND - CREATURE_BASE });
  live.current.mood = mood;
  live.current.stage = stage;
  live.current.reduced = reduced;

  useImperativeHandle(ref, () => ({
    hop() {
      const now = performance.now();
      live.current.hopAt = now;
      for (let i = 0; i < 2; i++) live.current.particles.push({ spr: SPR.HEART, x: 26 + (i ? 9 : -5), y: live.current.top - 2, vx: i ? 5 : -5, vy: -16, born: now + i * 90, life: 1100 });
    },
    bodyRect() {
      const c = canvasRef.current;
      if (!c) return null;
      const r = c.getBoundingClientRect();
      const k = r.width / CW;
      return new DOMRect(r.left + BODY_X * k, r.top + live.current.top * k, 32 * k, 32 * k);
    },
  }));

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    let raf = 0;
    const t0 = performance.now();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const L = live.current;
      const t = now - t0;
      const m = L.mood;
      const st = L.stage ?? MOOD_STAGE[m];
      let sx = 1;
      let sy = 1;
      let height = 0;
      let eyes: Eyes | undefined;
      let lookX = 0;
      let lookY = 0;
      let blush: boolean | undefined;

      const blinking = t % 3300 < 130;
      if (m === "bounce" || m === "cheer") {
        const period = m === "cheer" ? 560 : 760;
        const p = (t % period) / period;
        if (!L.reduced) {
          height = Math.sin(Math.PI * p) * (m === "cheer" ? 11 : 8);
          if (height < 1.2) {
            sx = 1.12;
            sy = 0.86;
          } else if ((p > 0.1 && p < 0.32) || (p > 0.68 && p < 0.9)) {
            sx = 0.94;
            sy = 1.07;
          }
          if (p < L.lastP) {
            L.particles.push({ spr: SPR.DUST, x: 13, y: GROUND - 2, vx: -9, vy: -3, born: now, life: 380 });
            L.particles.push({ spr: SPR.DUST, x: 39, y: GROUND - 2, vx: 9, vy: -3, born: now, life: 380 });
          }
        }
        L.lastP = p;
        eyes = height > 6 ? "happy" : "gleam";
        if (m === "cheer" && now - L.lastHeart > 700) {
          L.lastHeart = now;
          L.particles.push({ spr: Math.random() < 0.5 ? SPR.HEART : SPR.SPARKLE, x: 8 + Math.random() * 36, y: L.top - 4, vx: (Math.random() - 0.5) * 8, vy: -14, born: now, life: 1000 });
        }
      } else {
        const breathe = L.reduced ? 0 : Math.sin(t / (m === "tired" || m === "sad" ? 900 : 600));
        sy = 1 + 0.025 * breathe;
        sx = 1 - 0.015 * breathe;
        if (m === "idle") {
          eyes = blinking ? "blink" : "open";
          const w = Math.sin(t / 1900);
          lookX = w > 0.6 ? 1 : w < -0.6 ? -1 : 0;
        } else if (m === "think") {
          eyes = blinking ? "blink" : "open";
          lookX = 1;
          lookY = -1;
        } else if (m === "look") {
          eyes = blinking ? "blink" : "open";
          lookY = 1;
          lookX = -1;
        } else if (m === "tired") {
          eyes = "tired";
          if (!L.reduced && now - L.lastSweat > 2600) {
            L.lastSweat = now;
            L.particles.push({ spr: SPR.SWEAT, x: 40, y: L.top + 4, vx: 0, vy: 9, born: now, life: 700 });
          }
        } else if (m === "sad") {
          eyes = "tired";
          sx *= 1.04;
          sy *= 0.95;
          blush = false;
        }
      }

      // a poke: a bigger hop, happy eyes
      const sinceHop = now - L.hopAt;
      if (sinceHop < 560) {
        if (!L.reduced) height += Math.sin((Math.PI * sinceHop) / 560) * 14;
        eyes = "happy";
      }

      const top = Math.round(GROUND - CREATURE_BASE - height);
      L.top = top;

      ctx.clearRect(0, 0, CW, CH);
      // shadow shrinks as he rises
      const sw = Math.max(8, Math.round(20 - height));
      ctx.fillStyle = "rgba(30, 40, 20, 0.22)";
      ctx.fillRect(Math.round(BODY_X + 16 - sw / 2), GROUND + 1, sw, 2);
      paint(ctx, creatureGrid(st, { sx, sy, eyes, lookX, lookY, blush }), BODY_X, top);

      // thinking dots
      if (m === "think") {
        const n = Math.floor(t / 380) % 4;
        for (let i = 0; i < n; i++) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(38 + i * 4, top + 1, 3, 3);
          ctx.fillStyle = "#2c2336";
          ctx.fillRect(38 + i * 4, top + 4, 3, 1);
        }
      }

      // particles
      L.particles = L.particles.filter((p) => now - p.born < p.life);
      for (const p of L.particles) {
        const age = now - p.born;
        if (age < 0) continue;
        const s = age / 1000;
        const x = p.x + p.vx * s;
        const y = p.y + p.vy * s;
        if (age > p.life * 0.7 && Math.floor(age / 80) % 2) continue;
        paint(ctx, p.spr, Math.round(x), Math.round(y));
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`pixel shumbo ${className ?? ""}`}
      width={CW}
      height={CH}
      style={{ width: CW * scale, height: CH * scale }}
      role="img"
      aria-label={label}
      onClick={onPoke}
    />
  );
});
