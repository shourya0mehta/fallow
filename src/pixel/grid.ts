/**
 * A tiny pixel canvas: a W x H grid of CSS colours (null = transparent).
 * Everything in Fallow's garden is drawn into these grids, then blitted to a
 * real canvas at an integer scale, so art and animation share one model.
 */
export type Px = string | null;

export class Grid {
  readonly w: number;
  readonly h: number;
  readonly px: Px[];

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.px = new Array(w * h).fill(null);
  }

  get(x: number, y: number): Px {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.px[y * this.w + x];
  }

  set(x: number, y: number, c: Px): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = c;
  }

  /** Set only where empty, for drawing behind existing pixels. */
  under(x: number, y: number, c: Px): void {
    if (this.get(Math.round(x), Math.round(y)) === null) this.set(x, y, c);
  }

  rect(x: number, y: number, w: number, h: number, c: Px): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  /** Bresenham line. */
  line(x0: number, y0: number, x1: number, y1: number, c: Px): void {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  disc(cx: number, cy: number, r: number, c: Px): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.set(x, y, c);
  }

  /** Draw another grid on top at (ox, oy). */
  blit(src: Grid, ox: number, oy: number): void {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const c = src.px[y * src.w + x];
        if (c) this.set(ox + x, oy + y, c);
      }
  }

  /** Add a 1px outline in colour c around every filled pixel. */
  outline(c: Px): void {
    const add: Array<[number, number]> = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) !== null) continue;
        if (this.get(x + 1, y) || this.get(x - 1, y) || this.get(x, y + 1) || this.get(x, y - 1)) add.push([x, y]);
      }
    for (const [x, y] of add) this.set(x, y, c);
  }

  clone(): Grid {
    const g = new Grid(this.w, this.h);
    for (let i = 0; i < this.px.length; i++) g.px[i] = this.px[i];
    return g;
  }
}

/** Deterministic PRNG so the same plant always grows the same way. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

/**
 * Paint a grid onto a 2D context at (ox, oy), with an optional per-row
 * horizontal offset (used for swaying plants: the top moves, the base stays).
 */
export function paint(ctx: CanvasRenderingContext2D, g: Grid, ox: number, oy: number, rowShift?: (y: number) => number): void {
  for (let y = 0; y < g.h; y++) {
    const dx = rowShift ? rowShift(y) : 0;
    for (let x = 0; x < g.w; x++) {
      const c = g.px[y * g.w + x];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(ox + x + dx, oy + y, 1, 1);
    }
  }
}
