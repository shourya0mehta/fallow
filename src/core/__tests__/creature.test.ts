import { describe, expect, it } from "vitest";
import { creatureStage } from "../creature";
import { DOMAINS } from "../taxonomy";
import type { DomainId, DomainState } from "../types";

function state(id: DomainId, r: number, self = 2, delegated = 2): DomainState {
  const status = r >= 0.85 ? "fresh" : r >= 0.7 ? "fading" : r >= 0.55 ? "stale" : "fallow";
  return { id, stability: 30, selfCount30d: self, delegatedCount30d: delegated, retrievability: r, daysFallow: 3, status };
}

const ALL = DOMAINS.map((d) => d.id);
const keep: DomainId[] = ["composition", "analysis", "quantitative"];

describe("creatureStage", () => {
  it("thrives when the keep list is fresh and the work was mostly your own", () => {
    const states = ALL.map((id) => state(id, 0.95, 8, 2));
    const r = creatureStage({ states, keepList: keep, drift: {}, capacity: 0.7 });
    expect(r.stage).toBe("thriving");
    expect(r.health).toBeGreaterThan(0.8);
    expect(r.reasons[0]).toMatch(/fresh or fading/);
  });

  it("goes fallow when the keep list is fallow and everything was delegated", () => {
    const states = ALL.map((id) => state(id, 0.3, 0, 6));
    const r = creatureStage({ states, keepList: keep, drift: {}, capacity: 0.7 });
    expect(r.stage).toBe("fallow");
    expect(r.ownShare).toBe(0);
  });

  it("uses every domain when the keep list is empty, and ignores attention", () => {
    const states = ALL.map((id) => state(id, id === "attention" ? 0 : 0.9, 3, 3));
    const r = creatureStage({ states, keepList: [], drift: {}, capacity: 0.5 });
    expect(r.retrievability).toBeCloseTo(0.9, 5);
    expect(r.stage).toBe("steady");
  });

  it("knocks one stage off when delegation is rising on a keep-list domain", () => {
    const states = ALL.map((id) => state(id, 0.95, 8, 2));
    const r = creatureStage({ states, keepList: keep, drift: { composition: "rising" }, capacity: 0.7 });
    expect(r.knocked).toBe(true);
    expect(r.stage).toBe("steady");
    expect(r.reasons.at(-1)).toMatch(/rising on composition/);
  });

  it("counts sleep as zero capacity", () => {
    const states = ALL.map((id) => state(id, 0.8, 3, 3));
    const awake = creatureStage({ states, keepList: keep, drift: {}, capacity: 0.9 });
    const asleep = creatureStage({ states, keepList: keep, drift: {}, capacity: 0.9, asleep: true });
    expect(asleep.health).toBeLessThan(awake.health);
    expect(asleep.reasons).toContain("Asleep by your sleep window.");
  });
});
