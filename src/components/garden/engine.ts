import type { DomainId } from "@/core/types";
import type { PlantStatus } from "@/pixel/plants";
import { creatureGrid, CREATURE_BASE, type Eyes, type Stage } from "@/pixel/creature";
import { Grid, paint } from "@/pixel/grid";
import { PLANT_H, PLANT_W, plantGrid, swayFor } from "@/pixel/plants";
import { backdrop, hexToRgb, layoutGarden, SKY, soilPatch, timeOfDay, type Layout, type TimeOfDay } from "@/pixel/scene";
import * as SPR from "@/pixel/sprites";
import { classifyClick, HOLD_MS, RubDetector } from "./gestures";

export interface PlantData {
  id: DomainId;
  status: PlantStatus;
}

export interface GardenData {
  plants: PlantData[];
  stage: Stage;
  asleep: boolean;
  quests: DomainId[];
}

export type PetMood = "idle" | "walk" | "hop" | "spin" | "pet" | "dizzy" | "sleep" | "wake" | "think" | "cheer" | "rub";

export interface GardenCallbacks {
  /** Plant under the pointer changed; anchor is the plant top in CSS px relative to the canvas. */
  onHoverPlant?(id: DomainId | null, anchor: { x: number; y: number } | null): void;
  onSelectPlant?(id: DomainId, anchor: { x: number; y: number }): void;
  onHoverPet?(over: boolean): void;
  /** Something happened to the pet (for hints, analytics-free counters, tests). */
  onPet?(mood: PetMood): void;
}

interface PlantSlot {
  id: DomainId;
  status: PlantStatus;
  x: number;
  y: number;
  phase: number;
  wiggleUntil: number;
  wiggleStart: number;
}

interface Particle {
  spr: Grid;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ay: number;
  born: number;
  life: number;
  blink?: boolean;
  wave?: number;
  light?: boolean;
}

const FRAME_MS = 1000 / 30;

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

const outlinedCache = new Map<Grid, Grid>();
function outlined(g: Grid): Grid {
  let o = outlinedCache.get(g);
  if (!o) {
    o = new Grid(g.w + 2, g.h + 2);
    o.blit(g, 1, 1);
    o.outline("#ffffff");
    outlinedCache.set(g, o);
  }
  return o;
}

export class GardenEngine {
  private ctx: CanvasRenderingContext2D;
  private L: Layout;
  private bg: HTMLCanvasElement | null = null;
  private bgKey = "";
  private tod: TimeOfDay;
  private todOverride: TimeOfDay | null = null;
  private data: GardenData = { plants: [], stage: "steady", asleep: false, quests: [] };
  private skyInsets = { left: 0, right: 0 };
  private plants: PlantSlot[] = [];
  private particles: Particle[] = [];
  private clouds: Array<{ x: number; y: number; spr: Grid; speed: number }> = [];
  private stars: Array<{ x: number; y: number; phase: number }> = [];
  private flies: Array<{ x: number; y: number; phase: number; speed: number }> = [];
  private raf = 0;
  private last = 0;
  private acc = 0;
  private t = 0;
  private running = false;
  private visible = true;
  private reduced = false;
  private hoverPlant: DomainId | null = null;
  private highlight: DomainId | null = null;
  private selected: DomainId | null = null;
  /** The intro is up: data can change underneath it without fanfare. */
  private quiet = false;
  /** Plants and pet the intro is flying in, kept out of sight until each lands. */
  private hiddenPlants = new Set<DomainId>();
  private petHidden = false;
  private watering: { id: DomainId; start: number } | null = null;
  private thinking = false;
  private nextAmbient = 0;

  // pet
  private pet = {
    x: 0,
    targetX: 0,
    mood: "idle" as PetMood,
    moodStart: 0,
    moodUntil: 0,
    blinkAt: 0,
    blinkUntil: 0,
    lookX: 0,
    lookY: 0,
    nextWander: 0,
    nextHeart: 0,
    afterWalk: null as null | (() => void),
    hovered: false,
  };
  private pointer = { x: -1, y: -1, inside: false, down: false, downAt: 0, downOnPet: false, holdTimer: 0 as unknown as ReturnType<typeof setTimeout> };
  private clicks: number[] = [];
  private rub = new RubDetector();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly wrap: HTMLElement,
    private cb: GardenCallbacks = {},
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    this.ctx = ctx;
    this.tod = timeOfDay(new Date());
    this.L = layoutGarden(Math.max(320, wrap.clientWidth || 960));
    this.reduced = typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.applyLayout();
    this.pet.x = this.L.W / 2 - 16;
    this.pet.targetX = this.pet.x;
    this.bind();
  }

  // ---------- public API ----------

  setCallbacks(cb: GardenCallbacks) {
    this.cb = cb;
  }

  setData(d: GardenData) {
    const prev = new Map(this.plants.map((p) => [p.id, p]));
    this.data = d;
    this.plants = d.plants.map((p, i) => {
      const s = this.L.slots[i] ?? this.L.slots[this.L.slots.length - 1];
      const old = prev.get(p.id);
      if (old && old.status !== p.status && this.running && !this.quiet) this.burst(s.x, s.y - 16, 6, SPR.SPARKLE);
      return { id: p.id, status: p.status, x: s.x, y: s.y, phase: old?.phase ?? i * 1.7, wiggleUntil: old?.wiggleUntil ?? 0, wiggleStart: old?.wiggleStart ?? 0 };
    });
    this.bgKey = "";
    if (d.asleep && !["pet", "wake", "think"].includes(this.pet.mood)) this.setMood("sleep", Infinity);
    if (!d.asleep && this.pet.mood === "sleep") this.setMood("idle", 0);
    // paint now: a tab opened in the background gets no animation frames until it is shown
    this.draw();
  }

  setTimeOfDay(tod: TimeOfDay | null) {
    this.todOverride = tod;
    this.tod = tod ?? timeOfDay(new Date());
    this.bgKey = "";
    this.seedSky();
    this.draw();
  }

  /** While the intro is up, a data swap underneath it (demo to a fresh garden) makes no sparkles. */
  setQuiet(q: boolean) {
    this.quiet = q;
  }

  /** The intro flies its own plants and Shumbo in: keep the real ones out of sight, and the pet still, until each lands. */
  hideForLanding(ids: DomainId[]) {
    for (const id of ids) this.hiddenPlants.add(id);
    this.petHidden = true;
    const P = this.pet;
    P.targetX = P.x;
    P.afterWalk = null;
    if (P.mood === "walk") this.setMood("idle", Infinity);
    this.draw();
  }

  /** A plant touches down in its bed, with a little puff of soil. */
  land(id: DomainId) {
    if (!this.hiddenPlants.delete(id)) return;
    const p = this.plants.find((q) => q.id === id);
    if (p) {
      this.wiggle(p);
      if (!this.reduced) for (const side of [-1, 1]) for (let i = 0; i < 2; i++) this.emit(SPR.DUST, p.x - 1 + side * 3, p.y - 2, side * (12 + i * 10), -9 - i * 6, 40, 520);
    }
    this.draw();
  }

  /** Shumbo touches down. */
  landPet() {
    if (!this.petHidden) return;
    this.petHidden = false;
    this.setMood("hop", 420);
    this.draw();
  }

  /** Show everything again (the intro closed mid-flight). */
  showAll() {
    if (!this.petHidden && this.hiddenPlants.size === 0) return;
    this.hiddenPlants.clear();
    this.petHidden = false;
    this.draw();
  }

  /** CSS px to keep clear at the top left and right, so the sun and moon never hide under the corner chips. */
  setSkyInsets(left: number, right: number) {
    this.skyInsets = { left: Math.max(0, left), right: Math.max(0, right) };
    this.draw();
  }

  get timeOfDayNow(): TimeOfDay {
    return this.tod;
  }

  resize(cssWidth: number) {
    const L = layoutGarden(Math.max(300, cssWidth));
    if (L.W === this.L.W && L.scale === this.L.scale && L.H === this.L.H) return;
    const rel = (this.pet.x + 16) / this.L.W;
    this.L = L;
    this.applyLayout();
    this.setData(this.data);
    this.pet.x = clamp(rel * L.W - 16, L.minX - 8, L.maxX - 24);
    this.pet.targetX = this.pet.x;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(100, now - this.last);
      this.last = now;
      if (!this.visible || document.hidden) return;
      this.acc += dt;
      if (this.acc < FRAME_MS) return;
      const step = this.acc;
      this.acc = 0;
      this.t += step;
      this.update(step / 1000);
      this.draw();
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy() {
    this.stop();
    this.unbind();
  }

  /** Keyboard and button entry points mirror the pointer gestures. */
  poke(kind: "tap" | "double" | "rapid" | "pet") {
    if (kind === "pet") {
      this.startPet();
      setTimeout(() => this.endPet(), 1200);
      return;
    }
    this.onPetClick(kind);
  }

  selectPlant(id: DomainId | null) {
    this.selected = id;
    if (!id) return;
    const p = this.plants.find((q) => q.id === id);
    if (!p) return;
    this.wiggle(p);
    this.walkTo(p.x - 16, () => {
      this.pet.lookY = -1;
      this.pet.lookX = 0;
    });
  }

  setHighlight(id: DomainId | null) {
    this.highlight = id;
    const p = id ? this.plants.find((q) => q.id === id) : null;
    if (p) this.wiggle(p);
  }

  think(on: boolean) {
    this.thinking = on;
    if (on) this.setMood("think", Infinity);
    else if (this.pet.mood === "think") this.setMood(this.data.asleep ? "sleep" : "idle", 0);
  }

  cheer() {
    this.setMood("cheer", 1300);
    this.cb.onPet?.("cheer");
    this.burst(this.pet.x + 16, this.L.groundY - 22, 10, SPR.SPARKLE);
  }

  sigh() {
    this.setMood("hop", 420);
    this.emit(SPR.SWEAT, this.pet.x + 25, this.L.groundY - 20, 0, -6, 0, 700);
  }

  /** Watering animation over a plant; resolves when the water has landed. */
  water(id: DomainId): Promise<void> {
    const p = this.plants.find((q) => q.id === id);
    if (!p) return Promise.resolve();
    this.watering = { id, start: this.t };
    this.walkTo(p.x - 16, () => {
      this.pet.lookY = -1;
    });
    return new Promise((resolve) => {
      setTimeout(
        () => {
          this.watering = null;
          this.wiggle(p);
          this.burst(p.x, p.y - 18, 8, SPR.SPARKLE);
          this.cheer();
          resolve();
        },
        this.reduced ? 300 : 2100,
      );
    });
  }

  /** CSS px anchor above a plant (for cards and tags). */
  plantAnchor(id: DomainId): { x: number; y: number } | null {
    const p = this.plants.find((q) => q.id === id);
    if (!p) return null;
    return { x: p.x * this.L.scale, y: (p.y - PLANT_H) * this.L.scale };
  }

  /** The box a plant is drawn in, CSS px relative to the canvas (the intro flies plants into these). */
  plantBox(id: DomainId): { x: number; y: number; w: number; h: number } | null {
    const p = this.plants.find((q) => q.id === id);
    if (!p) return null;
    const s = this.L.scale;
    return { x: Math.round(p.x - PLANT_W / 2) * s, y: (p.y - PLANT_H + 1) * s, w: PLANT_W * s, h: PLANT_H * s };
  }

  /** The pet's 32x32 box as last drawn, CSS px relative to the canvas. */
  petBox(): { x: number; y: number; w: number; h: number } {
    const s = this.L.scale;
    const px = Math.round(this.pet.x);
    const py = this.L.groundY - CREATURE_BASE;
    return { x: px * s, y: py * s, w: 32 * s, h: 32 * s };
  }

  get canvasElement(): HTMLCanvasElement {
    return this.canvas;
  }

  get layout(): Layout {
    return this.L;
  }

  get mood(): PetMood {
    return this.pet.mood;
  }

  // ---------- setup ----------

  private applyLayout() {
    this.canvas.width = this.L.W;
    this.canvas.height = this.L.H;
    this.canvas.style.width = `${this.L.W * this.L.scale}px`;
    this.canvas.style.height = `${this.L.H * this.L.scale}px`;
    this.ctx.imageSmoothingEnabled = false;
    this.bgKey = "";
    this.seedSky();
  }

  private seedSky() {
    const W = this.L.W;
    const skyH = this.L.beds[0].y - PLANT_H;
    this.clouds = [
      { x: W * 0.12, y: 8, spr: SPR.CLOUDS[0], speed: 2.2 },
      { x: W * 0.55, y: 15, spr: SPR.CLOUDS[1], speed: 1.5 },
      { x: W * 0.85, y: 5, spr: SPR.CLOUDS[1], speed: 1.8 },
    ];
    this.stars = [];
    for (let i = 0; i < Math.round(W / 9); i++) this.stars.push({ x: (i * 37) % W, y: 2 + ((i * 53) % Math.max(8, skyH + 6)), phase: (i * 1.3) % 6.28 });
    this.flies = [];
    for (let i = 0; i < 7; i++) this.flies.push({ x: (i * 41) % W, y: this.L.beds[0].y - 8 - ((i * 13) % 20), phase: i * 0.9, speed: 0.6 + (i % 3) * 0.25 });
  }

  private ensureBackdrop() {
    const key = `${this.L.W}x${this.L.H}|${this.tod}|${this.plants.map((p) => p.status[0]).join("")}`;
    if (key === this.bgKey && this.bg) return;
    const g = backdrop(this.L, this.tod);
    for (const p of this.plants) soilPatch(g, p.status, p.x, p.y);
    const c = this.bg ?? document.createElement("canvas");
    c.width = this.L.W;
    c.height = this.L.H;
    const cx = c.getContext("2d")!;
    const img = cx.createImageData(this.L.W, this.L.H);
    for (let i = 0; i < g.px.length; i++) {
      const col = g.px[i];
      if (!col) continue;
      const [r, gg, b] = hexToRgb(col);
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = gg;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    this.bg = c;
    this.bgKey = key;
  }

  private onMove = (e: PointerEvent) => {
    const { x, y } = this.toLogical(e);
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.inside = true;
    const overPet = this.hitPet(x, y);
    if (overPet !== this.pet.hovered) {
      this.pet.hovered = overPet;
      this.cb.onHoverPet?.(overPet);
    }
    const plant = overPet ? null : this.hitPlant(x, y);
    if ((plant?.id ?? null) !== this.hoverPlant) {
      this.hoverPlant = plant?.id ?? null;
      if (plant) this.wiggle(plant);
      this.cb.onHoverPlant?.(this.hoverPlant, plant ? { x: plant.x * this.L.scale, y: (plant.y - PLANT_H) * this.L.scale } : null);
    }
    this.canvas.style.cursor = overPet ? (this.pointer.down ? "grabbing" : "grab") : plant ? "pointer" : "default";
    if (overPet && !this.pointer.down && this.rub.feed(x, performance.now())) this.onRub();
    if (!overPet) this.rub.reset();
  };

  private onLeave = () => {
    this.pointer.inside = false;
    if (this.hoverPlant) {
      this.hoverPlant = null;
      this.cb.onHoverPlant?.(null, null);
    }
    if (this.pet.hovered) {
      this.pet.hovered = false;
      this.cb.onHoverPet?.(false);
    }
    this.rub.reset();
  };

  private onDown = (e: PointerEvent) => {
    const { x, y } = this.toLogical(e);
    this.pointer.down = true;
    this.pointer.downAt = performance.now();
    if (this.hitPet(x, y)) {
      this.pointer.downOnPet = true;
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        /* capture is optional */
      }
      clearTimeout(this.pointer.holdTimer);
      this.pointer.holdTimer = setTimeout(() => {
        if (this.pointer.down && this.pointer.downOnPet) this.startPet();
      }, HOLD_MS);
      e.preventDefault();
    }
  };

  private onUp = (e: PointerEvent) => {
    const { x, y } = this.toLogical(e);
    const wasPet = this.pointer.downOnPet;
    this.pointer.down = false;
    this.pointer.downOnPet = false;
    clearTimeout(this.pointer.holdTimer);
    if (this.pet.mood === "pet") {
      this.endPet();
      return;
    }
    if (wasPet) {
      const r = classifyClick(this.clicks, performance.now());
      this.clicks = r.recent;
      this.onPetClick(r.kind);
      return;
    }
    const plant = this.hitPlant(x, y);
    if (plant) {
      this.selectPlant(plant.id);
      this.cb.onSelectPlant?.(plant.id, { x: plant.x * this.L.scale, y: (plant.y - PLANT_H) * this.L.scale });
    }
  };

  private onVisibility = () => {
    this.last = performance.now();
  };

  private io: IntersectionObserver | null = null;

  private bind() {
    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerleave", this.onLeave);
    this.canvas.addEventListener("pointerdown", this.onDown);
    this.canvas.addEventListener("pointerup", this.onUp);
    this.canvas.addEventListener("contextmenu", (e) => this.pet.hovered && e.preventDefault());
    document.addEventListener("visibilitychange", this.onVisibility);
    if ("IntersectionObserver" in window) {
      this.io = new IntersectionObserver((entries) => {
        this.visible = entries.some((en) => en.isIntersecting);
      });
      this.io.observe(this.canvas);
    }
  }

  private unbind() {
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerleave", this.onLeave);
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointerup", this.onUp);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.io?.disconnect();
  }

  private toLogical(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * this.L.W, y: ((e.clientY - r.top) / r.height) * this.L.H };
  }

  private hitPet(x: number, y: number) {
    const top = this.L.groundY - CREATURE_BASE;
    return x >= this.pet.x + 5 && x <= this.pet.x + 27 && y >= top + 3 && y <= this.L.groundY + 1;
  }

  private hitPlant(x: number, y: number): PlantSlot | null {
    for (const p of this.plants) if (x >= p.x - PLANT_W / 2 && x < p.x + PLANT_W / 2 && y >= p.y - PLANT_H && y <= p.y + 6) return p;
    return null;
  }

  // ---------- behaviour ----------

  private setMood(m: PetMood, ms: number) {
    this.pet.mood = m;
    this.pet.moodStart = this.t;
    this.pet.moodUntil = ms === Infinity ? Infinity : this.t + ms;
  }

  private onPetClick(kind: "tap" | "double" | "rapid") {
    if (this.pet.mood === "sleep") {
      this.setMood("wake", 2600);
      this.cb.onPet?.("wake");
      return;
    }
    if (kind === "rapid") {
      this.setMood("dizzy", 2000);
      this.cb.onPet?.("dizzy");
      return;
    }
    if (kind === "double") {
      this.setMood("spin", this.reduced ? 500 : 1150);
      this.cb.onPet?.("spin");
      return;
    }
    this.setMood("hop", this.reduced ? 300 : 560);
    this.cb.onPet?.("hop");
    const s = this.data.stage;
    const x = this.pet.x + 16;
    const y = this.L.groundY - 24;
    if (s === "fallow") this.emit(SPR.DUST, x + 8, y + 18, 6, -3, 0, 700);
    else if (s === "fading") this.emit(SPR.SWEAT, x + 9, y + 2, 0, -8, 0, 700);
    else {
      const pick = Math.floor((this.t / 97) % 3);
      if (pick === 0) this.emit(SPR.HEART, x - 3, y - 4, 0, -14, 0, 1100, { wave: 1 });
      else if (pick === 1) this.emit(SPR.NOTE, x + 6, y - 2, 4, -12, 0, 1100, { wave: 1 });
      else this.burst(x, y + 4, 5, SPR.SPARKLE);
    }
  }

  private startPet() {
    if (this.pet.mood === "sleep") {
      this.setMood("pet", Infinity);
      this.cb.onPet?.("pet");
      return;
    }
    this.setMood("pet", Infinity);
    this.pet.nextHeart = this.t;
    this.cb.onPet?.("pet");
  }

  private endPet() {
    if (this.pet.mood !== "pet") return;
    if (this.data.asleep) this.setMood("sleep", Infinity);
    else this.setMood("hop", 480);
  }

  private onRub() {
    if (this.pet.mood === "pet" || this.pet.mood === "spin") return;
    this.setMood("rub", 900);
    this.cb.onPet?.("rub");
    for (let i = 0; i < 3; i++) this.emit(SPR.HEART, this.pet.x + 8 + i * 6, this.L.groundY - 26, (i - 1) * 4, -16, 0, 1000, { wave: 1 });
  }

  private walkTo(x: number, then?: () => void) {
    this.pet.targetX = clamp(x, this.L.minX - 10, this.L.maxX - 22);
    this.pet.afterWalk = then ?? null;
    if (["sleep", "pet", "think"].includes(this.pet.mood)) return;
    if (this.reduced) {
      this.pet.x = this.pet.targetX;
      this.pet.afterWalk?.();
      this.pet.afterWalk = null;
      return;
    }
    this.setMood("walk", Infinity);
  }

  private wiggle(p: PlantSlot) {
    p.wiggleStart = this.t;
    p.wiggleUntil = this.t + 700;
  }

  private emit(spr: Grid, x: number, y: number, vx: number, vy: number, ay: number, life: number, extra: Partial<Particle> = {}) {
    if (this.reduced) life = Math.min(life, 500);
    this.particles.push({ spr, x, y, vx, vy, ay, born: this.t, life, ...extra });
  }

  private burst(x: number, y: number, n: number, spr: Grid) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.emit(spr, x - 2, y - 2, Math.cos(a) * 22, Math.sin(a) * 18 - 6, 20, 700, { blink: true });
    }
  }

  private update(dt: number) {
    const now = this.t;
    if (!this.todOverride) {
      const tod = timeOfDay(new Date());
      if (tod !== this.tod) {
        this.tod = tod;
        this.bgKey = "";
      }
    }
    const P = this.pet;
    if (P.moodUntil !== Infinity && now >= P.moodUntil) {
      if (P.mood === "wake" || this.data.asleep) this.setMood(this.data.asleep ? "sleep" : "idle", Infinity);
      else this.setMood("idle", Infinity);
      if (this.pet.mood === "idle") this.pet.moodUntil = Infinity;
    }

    // walking
    if (P.mood === "walk") {
      const dx = P.targetX - P.x;
      if (Math.abs(dx) < 0.6) {
        P.x = P.targetX;
        this.setMood("idle", Infinity);
        const f = P.afterWalk;
        P.afterWalk = null;
        f?.();
      } else {
        P.x += Math.sign(dx) * Math.min(Math.abs(dx), 26 * dt);
        P.lookX = Math.sign(dx);
        P.lookY = 0;
      }
    }

    // idle life: blink, look at the pointer, wander
    if (now >= P.blinkAt) {
      P.blinkUntil = now + 130;
      P.blinkAt = now + 2200 + ((now * 7) % 2800);
    }
    if (P.mood === "idle" && !this.petHidden) {
      if (this.pointer.inside) {
        const cx = P.x + 16;
        const cy = this.L.groundY - 10;
        P.lookX = Math.abs(this.pointer.x - cx) > 8 ? Math.sign(this.pointer.x - cx) : 0;
        P.lookY = this.pointer.y < cy - 22 ? -1 : this.pointer.y > cy + 4 ? 1 : 0;
      } else if (now >= P.nextWander) {
        P.nextWander = now + 7000 + ((now * 13) % 8000);
        if (!this.reduced && !this.data.asleep && !this.selected) {
          const span = this.L.maxX - this.L.minX - 40;
          this.walkTo(this.L.minX + ((now * 0.37) % span), () => {
            P.lookX = 0;
          });
        } else {
          P.lookX = [-1, 0, 1][Math.floor(now / 1000) % 3];
        }
      }
    }
    if (P.mood === "pet" && now >= P.nextHeart) {
      P.nextHeart = now + 300;
      this.emit(SPR.HEART, P.x + 10 + ((now / 50) % 12), this.L.groundY - 26, ((now / 31) % 10) - 5, -16, 0, 1100, { wave: 1 });
    }
    if (P.mood === "sleep" && now >= P.nextHeart) {
      P.nextHeart = now + 1500;
      this.emit(SPR.ZZZ, P.x + 24, this.L.groundY - 24, 6, -7, 0, 2200, { light: true });
    }
    if (P.mood === "think" && now >= P.nextHeart) {
      P.nextHeart = now + 380;
    }

    // ambient life per status: glints on fresh plants, leaves off fading ones, dust off stale ones, seeds off a fresh dandelion
    if (now >= this.nextAmbient && !this.reduced) {
      this.nextAmbient = now + 900 + ((now * 3) % 1400);
      const pick = this.plants[Math.floor((now / 7) % Math.max(1, this.plants.length))];
      if (pick && !this.hiddenPlants.has(pick.id)) {
        if (pick.status === "fresh") {
          this.emit(SPR.SPARKLE, pick.x - 2 + ((now / 11) % 6) - 3, pick.y - PLANT_H + 2 + ((now / 13) % 10), 0, 0, 0, 520, { blink: true });
          if (pick.id === "ideation") this.emit(SPR.SEED, pick.x, pick.y - PLANT_H + 6, 9, -5, 0, 3200, { wave: 2 });
        } else if (pick.status === "fading") {
          const leaf = new Grid(2, 1);
          leaf.set(0, 0, "#c4b955");
          leaf.set(1, 0, "#958c3e");
          this.emit(leaf, pick.x + 2, pick.y - 14, 3, 4, 0, 2400, { wave: 1.5 });
        } else if (pick.status === "stale") {
          this.emit(SPR.DUST, pick.x - 2, pick.y - 4, 4, -2, 0, 900);
        }
      }
    }

    // particles
    for (const p of this.particles) {
      p.vy += p.ay * dt;
      p.x += (p.vx + (p.wave ? Math.sin((now - p.born) / 160) * 6 * p.wave : 0)) * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => now - p.born < p.life);

    // sky
    for (const c of this.clouds) {
      if (!this.reduced) c.x += c.speed * dt;
      if (c.x > this.L.W + 4) c.x = -c.spr.w - 4;
    }
    for (const f of this.flies) {
      f.phase += dt * f.speed;
      f.x += Math.cos(f.phase * 1.3) * 6 * dt;
      f.y += Math.sin(f.phase * 1.7) * 4 * dt;
      if (f.x < 4) f.x = this.L.W - 6;
      if (f.x > this.L.W - 4) f.x = 6;
    }

    // watering drops
    if (this.watering) {
      const p = this.plants.find((q) => q.id === this.watering!.id);
      if (p && (now - this.watering.start) % 140 < 40 && now - this.watering.start > 500) this.emit(SPR.DROP, p.x + 1 + ((now / 17) % 5) - 2, p.y - PLANT_H - 2, 0, 20, 60, 520);
    }
  }

  private petPose(): { dy: number; sx: number; sy: number; eyes?: Eyes; blush?: boolean; wobble: number } {
    const P = this.pet;
    const e = this.t - P.moodStart;
    const blink = this.t < P.blinkUntil;
    const base = { dy: 0, sx: 1, sy: 1, wobble: 0 } as { dy: number; sx: number; sy: number; eyes?: Eyes; blush?: boolean; wobble: number };
    const breathe = this.reduced ? 0 : Math.sin(this.t / 700) > 0.6 ? 1 : 0;
    switch (P.mood) {
      case "walk": {
        const ph = (this.t / 130) % (Math.PI * 2);
        base.dy = -Math.round(Math.abs(Math.sin(ph)) * 2);
        if (base.dy === 0) {
          base.sx = 1.06;
          base.sy = 0.95;
        }
        break;
      }
      case "hop": {
        const D = this.reduced ? 300 : 560;
        const p = e / D;
        if (p < 0.16) {
          base.sx = 1.12;
          base.sy = 0.88;
        } else if (p < 0.72) {
          const q = (p - 0.16) / 0.56;
          base.dy = -Math.round(Math.sin(q * Math.PI) * (this.reduced ? 2 : 9));
          base.sx = q < 0.5 ? 0.93 : 1;
          base.sy = q < 0.5 ? 1.08 : 1;
          if (this.data.stage !== "fading" && this.data.stage !== "fallow") base.eyes = "happy";
        } else if (p < 0.88) {
          base.sx = 1.1;
          base.sy = 0.9;
        }
        break;
      }
      case "spin": {
        const D = this.reduced ? 500 : 1150;
        const p = e / D;
        if (p < 0.1) {
          base.sx = 1.14;
          base.sy = 0.86;
        } else if (p < 0.85) {
          const q = (p - 0.1) / 0.75;
          base.dy = -Math.round(Math.sin(q * Math.PI) * (this.reduced ? 3 : 16));
          const turn = Math.cos(q * Math.PI * 4);
          base.sx = Math.max(0.3, Math.abs(turn));
          base.eyes = turn < 0 ? "none" : "happy";
          if (!this.reduced && Math.abs(turn) < 0.2 && (this.t / 33) % 3 < 1) this.emit(SPR.SPARKLE, this.pet.x + 6 + ((this.t / 7) % 20), this.L.groundY - 20 + base.dy, 0, 0, 0, 260, { blink: true });
        } else {
          base.sx = 1.12;
          base.sy = 0.88;
          if (e - D * 0.85 < 40) this.burst(this.pet.x + 16, this.L.groundY - 8, 8, SPR.SPARKLE);
        }
        base.blush = true;
        break;
      }
      case "pet":
        base.sx = 1.05;
        base.sy = this.reduced ? 0.95 : 0.93 + 0.04 * Math.sin(this.t / 90);
        base.eyes = this.data.asleep ? "shut" : "happy";
        base.blush = true;
        break;
      case "rub":
        base.sx = 1.04;
        base.sy = 0.96;
        base.eyes = "happy";
        base.blush = true;
        base.wobble = Math.round(Math.sin(this.t / 50));
        break;
      case "dizzy":
        base.eyes = "dizzy";
        base.wobble = this.reduced ? 0 : Math.round(Math.sin(this.t / 70) * 1.4);
        break;
      case "sleep":
        base.eyes = "shut";
        base.sy = breathe ? 0.97 : 1;
        break;
      case "wake":
        base.eyes = e < 700 ? "wide" : e < 900 ? "blink" : "tired";
        break;
      case "think":
        base.eyes = "open";
        break;
      case "cheer": {
        const p = (e % 650) / 650;
        base.dy = -Math.round(Math.sin(p * Math.PI) * 7);
        base.eyes = "happy";
        base.blush = true;
        break;
      }
      default:
        base.sy = breathe ? 0.97 : 1;
    }
    if (blink && !base.eyes && P.mood !== "sleep") base.eyes = "blink";
    return base;
  }

  // ---------- drawing ----------

  private draw() {
    const ctx = this.ctx;
    const L = this.L;
    this.ensureBackdrop();
    ctx.clearRect(0, 0, L.W, L.H);
    if (this.bg) ctx.drawImage(this.bg, 0, 0);

    const night = this.tod === "night";
    // the open stretch of sky between the corner chips
    const skyL = Math.ceil(this.skyInsets.left / L.scale) + 2;
    const skyR = Math.max(skyL, L.W - Math.ceil(this.skyInsets.right / L.scale) - 2);
    // sky decor behind everything else
    if (this.tod === "day" || this.tod === "dawn") {
      const h = new Date().getHours() + new Date().getMinutes() / 60;
      const f = this.todOverride ? 0.7 : clamp((h - 6) / 13, 0, 1);
      // an arc across the open sky, low at the ends
      const x1 = Math.max(skyL, skyR - 10);
      paint(ctx, SPR.SUN, Math.round(skyL + f * (x1 - skyL)), Math.round(3 + Math.abs(f - 0.5) * 24));
    }
    if (!night) for (const c of this.clouds) paint(ctx, c.spr, Math.round(c.x), c.y);

    // quest markers
    for (const p of this.plants) {
      if (!this.data.quests.includes(p.id) || this.hiddenPlants.has(p.id)) continue;
      const bob = this.reduced ? 0 : Math.round(Math.sin(this.t / 260 + p.phase));
      paint(ctx, SPR.QUEST, Math.round(p.x - 3), p.y - PLANT_H - 11 + bob);
    }

    // plants
    for (const p of this.plants) {
      if (this.hiddenPlants.has(p.id)) continue;
      const g = plantGrid(p.id, p.status);
      const sw = swayFor(p.status);
      const wig = this.t < p.wiggleUntil ? (1 - (this.t - p.wiggleStart) / 700) * 2.4 : 0;
      const amp = this.reduced ? 0 : sw.amp + wig;
      const phase = this.t / 1000 * (sw.speed * 2.2 + (wig ? 9 : 0)) + p.phase;
      const shift = (y: number) => Math.round(Math.sin(phase) * amp * Math.pow(1 - y / PLANT_H, 1.6));
      const hot = p.id === this.hoverPlant || p.id === this.highlight || p.id === this.selected;
      const ox = Math.round(p.x - PLANT_W / 2);
      const oy = p.y - PLANT_H + 1;
      if (hot) paint(ctx, outlined(g), ox - 1, oy - 1, (y) => shift(Math.max(0, y - 1)));
      else paint(ctx, g, ox, oy, shift);
    }

    // watering can
    if (this.watering) {
      const p = this.plants.find((q) => q.id === this.watering!.id);
      if (p) {
        const e = this.t - this.watering.start;
        const drop = Math.round(Math.min(1, e / 400) * 6);
        paint(ctx, SPR.WATERING_CAN, Math.round(p.x - 15), p.y - PLANT_H - 14 + drop);
      }
    }

    // pet and its shadow (unless the intro is still flying Shumbo in)
    let px = Math.round(this.pet.x);
    let py = L.groundY - CREATURE_BASE;
    if (!this.petHidden) {
      const pose = this.petPose();
      px += pose.wobble;
      py += pose.dy;
      const shadowW = Math.max(8, 18 + pose.dy);
      ctx.fillStyle = "rgba(30, 40, 20, 0.22)";
      ctx.fillRect(Math.round(this.pet.x + 16 - shadowW / 2), L.groundY + 1, shadowW, 1);
      const g = creatureGrid(this.data.stage, { sx: pose.sx, sy: pose.sy, eyes: pose.eyes, lookX: this.pet.lookX, lookY: this.pet.lookY, blush: pose.blush });
      paint(ctx, g, px, py);

      // dizzy stars orbit
      if (this.pet.mood === "dizzy") {
        for (let i = 0; i < 3; i++) {
          const a = this.t / 220 + (i * Math.PI * 2) / 3;
          paint(ctx, SPR.DIZZY_STAR, Math.round(px + 14 + Math.cos(a) * 11), Math.round(py + 2 + Math.sin(a) * 3));
        }
      }
      // thinking dots
      if (this.pet.mood === "think") {
        const n = Math.floor(this.t / 380) % 4;
        for (let i = 0; i < n; i++) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(px + 12 + i * 3, py, 2, 2);
          ctx.fillStyle = "#2c2336";
          ctx.fillRect(px + 12 + i * 3, py + 2, 2, 1);
        }
      }
    }

    // particles (not the light ones)
    for (const p of this.particles) {
      if (p.light) continue;
      if (p.blink && Math.floor((this.t - p.born) / 90) % 2) continue;
      paint(ctx, p.spr, Math.round(p.x), Math.round(p.y));
    }

    // time of day tint
    const ov = SKY[this.tod].overlay;
    if (ov) {
      ctx.fillStyle = ov;
      ctx.fillRect(0, 0, L.W, L.H);
    }

    // lights draw over the tint
    if (night) {
      for (const s of this.stars) {
        const tw = Math.sin(this.t / 600 + s.phase);
        if (tw > 0.85) paint(ctx, SPR.STAR_TWINKLE[1], s.x - 1, s.y - 1);
        else if (tw > -0.4) paint(ctx, SPR.STAR_TWINKLE[0], s.x, s.y);
      }
      paint(ctx, SPR.MOON, clamp(Math.round(L.W * 0.6), skyL, Math.max(skyL, skyR - 8)), 5);
    }
    if (night || this.tod === "dusk") {
      for (const f of this.flies) {
        const on = Math.sin(this.t / 300 + f.phase * 3) > -0.2;
        if (on) paint(ctx, SPR.FIREFLY[Math.sin(this.t / 200 + f.phase) > 0.5 ? 1 : 0], Math.round(f.x), Math.round(f.y));
      }
    }
    for (const p of this.particles) if (p.light) paint(ctx, p.spr, Math.round(p.x), Math.round(p.y));

    // anchor for the speech bubble
    this.wrap.style.setProperty("--pet-x", `${(px + 16) * L.scale}px`);
    this.wrap.style.setProperty("--pet-y", `${(py + 4) * L.scale}px`);
    this.wrap.dataset.petMood = this.pet.mood;
  }
}

export function plantStatusSummary(plants: PlantData[]): string {
  const counts: Record<string, number> = {};
  for (const p of plants) counts[p.status] = (counts[p.status] ?? 0) + 1;
  return ["fresh", "fading", "stale", "fallow"]
    .filter((s) => counts[s])
    .map((s) => `${counts[s]} ${s}`)
    .join(", ");
}
