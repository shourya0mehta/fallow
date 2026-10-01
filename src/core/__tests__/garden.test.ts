import { describe, expect, it } from "vitest";
import { classifyClick, DOUBLE_MS, RubDetector } from "../../components/garden/gestures";
import { PLANT_NAME, SESSION_MIN } from "../../components/garden/names";
import { creatureGrid, CREATURE_COLORS } from "../../pixel/creature";
import { plantGrid, PLANT_H, PLANT_W, SPECIES, swayFor } from "../../pixel/plants";
import { layoutGarden, timeOfDay } from "../../pixel/scene";
import { DOMAINS } from "../taxonomy";
import type { DomainStatus } from "../types";

const STATUSES: DomainStatus[] = ["fresh", "fading", "stale", "fallow"];
const filled = (px: Array<string | null>) => px.filter(Boolean).length;
function height(g: { w: number; h: number; px: Array<string | null> }) {
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.px[y * g.w + x]) return g.h - y;
  return 0;
}

describe("plants", () => {
  it("draws every domain in every condition, inside its box", () => {
    for (const d of DOMAINS)
      for (const s of STATUSES) {
        const g = plantGrid(d.id, s);
        expect(g.w).toBe(PLANT_W);
        expect(g.h).toBe(PLANT_H);
        expect(filled(g.px)).toBeGreaterThan(0);
      }
  });

  it("grows tall when fresh and shrinks to a stub when fallow (except the structures that stay)", () => {
    for (const d of DOMAINS) {
      const fresh = height(plantGrid(d.id, "fresh"));
      const fallow = height(plantGrid(d.id, "fallow"));
      if (d.id === "navigation" || d.id === "planning") continue; // the stake and the trellis remain
      expect(fresh).toBeGreaterThan(fallow);
    }
  });

  it("gives each domain its own species and a sway that stills as it dries", () => {
    expect(new Set(Object.values(SPECIES).map((s) => s.name)).size).toBe(DOMAINS.length);
    expect(swayFor("fresh").amp).toBeGreaterThan(swayFor("stale").amp);
    expect(swayFor("fallow").amp).toBe(0);
  });

  it("names a plant and a session length for every domain", () => {
    for (const d of DOMAINS) {
      expect(PLANT_NAME[d.id].the).toMatch(/^the /);
      expect(SESSION_MIN[d.id]).toBeGreaterThan(0);
    }
  });
});

describe("creature rig", () => {
  it("draws the same body in each stage's colours", () => {
    for (const s of ["thriving", "steady", "fading", "fallow"] as const) {
      const g = creatureGrid(s, {});
      expect(g.px).toContain(CREATURE_COLORS[s].base);
      expect(g.px).toContain(CREATURE_COLORS[s].outline);
    }
  });

  it("changes the face with the mood and caches each pose", () => {
    const open = creatureGrid("steady", { eyes: "open" });
    const happy = creatureGrid("steady", { eyes: "happy" });
    const none = creatureGrid("steady", { eyes: "none" });
    expect(open.px.join()).not.toBe(happy.px.join());
    expect(filled(open.px.map((c) => (c === "#2a2124" ? c : null)))).toBeGreaterThan(filled(none.px.map((c) => (c === "#2a2124" ? c : null))));
    expect(creatureGrid("steady", { eyes: "open" })).toBe(open);
  });

  it("looks where it is told and blushes when petted", () => {
    const left = creatureGrid("steady", { lookX: -1 });
    const right = creatureGrid("steady", { lookX: 1 });
    expect(left.px.join()).not.toBe(right.px.join());
    expect(creatureGrid("steady", { blush: true }).px).toContain("#ef8b84");
  });

  it("squashes and stretches around its base", () => {
    const squash = creatureGrid("steady", { sx: 1.12, sy: 0.88 });
    const rest = creatureGrid("steady", {});
    expect(height(squash)).toBeLessThan(height(rest));
  });
});

describe("garden layout", () => {
  it("puts all eleven plants in one bed on a wide screen", () => {
    const L = layoutGarden(1040);
    expect(L.slots).toHaveLength(11);
    expect(L.beds).toHaveLength(1);
    expect(L.scale).toBeGreaterThanOrEqual(3);
    for (const s of L.slots) expect(s.x).toBeGreaterThan(0), expect(s.x).toBeLessThan(L.W);
    expect(L.groundY).toBeGreaterThan(L.beds[0].y);
  });

  it("splits into balanced beds on a phone", () => {
    const L = layoutGarden(360);
    expect(L.slots).toHaveLength(11);
    expect(L.beds.length).toBe(2);
    const perBed = L.beds.map((b) => L.slots.filter((s) => s.y === b.y).length);
    expect(Math.abs(perBed[0] - perBed[1])).toBeLessThanOrEqual(1);
    expect(L.W * L.scale).toBeLessThanOrEqual(360);
  });

  it("knows the time of day", () => {
    const at = (h: number) => timeOfDay(new Date(2026, 9, 1, h, 0));
    expect(at(6)).toBe("dawn");
    expect(at(12)).toBe("day");
    expect(at(19)).toBe("dusk");
    expect(at(23)).toBe("night");
    expect(at(3)).toBe("night");
  });
});

describe("pet gestures", () => {
  it("tells a tap from a double click from mashing", () => {
    let r = classifyClick([], 1000);
    expect(r.kind).toBe("tap");
    r = classifyClick(r.recent, 1000 + DOUBLE_MS - 10);
    expect(r.kind).toBe("double");
    let recent: number[] = [];
    const kinds = [0, 100, 200, 300].map((t) => {
      const k = classifyClick(recent, 5000 + t);
      recent = k.recent;
      return k.kind;
    });
    expect(kinds.at(-1)).toBe("rapid");
    expect(classifyClick([], 9000).kind).toBe("tap");
  });

  it("counts back-and-forth rubbing", () => {
    const rub = new RubDetector(900, 3, 1);
    const xs = [10, 14, 10, 14, 10, 14];
    const hits = xs.map((x, i) => rub.feed(x, i * 80));
    expect(hits.some(Boolean)).toBe(true);
    const still = new RubDetector(900, 3, 1);
    expect([10, 11, 12, 13, 14].map((x, i) => still.feed(x, i * 80)).some(Boolean)).toBe(false);
  });
});
