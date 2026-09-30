import { describe, expect, it } from "vitest";
import { classifyPrompt } from "../classify";
import { recommend } from "../policy";
import { deriveDomainStates } from "../scheduler";
import type { LedgerEvent, Settings } from "../types";

const NOW = new Date("2026-09-29T14:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const settings: Pick<Settings, "keepList" | "intensity"> = { keepList: ["composition"], intensity: "standard" };

function delegated(domain: LedgerEvent["domains"][number]["id"], d: number): LedgerEvent {
  return { id: `${domain}${d}`, ts: daysAgo(d), source: "seed", domains: [{ id: domain, weight: 1 }], icap: "passive", askType: "answer", actor: "ai" };
}
function practiced(domain: LedgerEvent["domains"][number]["id"], d: number): LedgerEvent {
  return { id: `p${domain}${d}`, ts: daysAgo(d), source: "seed", domains: [{ id: domain, weight: 1 }], icap: "constructive", askType: "other", actor: "self", minutes: 30 };
}

describe("recommend", () => {
  it("says do it yourself for a fallow keep-list domain with capacity to spare", () => {
    const events = [1, 3, 5, 8, 12, 20].map((d) => delegated("composition", d));
    const rec = recommend({
      classification: classifyPrompt("Write me an email to my advisor asking for an extension"),
      states: deriveDomainStates(events, NOW),
      settings,
      capacity: 0.8,
    });
    expect(rec.mode).toBe("self");
    expect(rec.reasons.join(" ")).toMatch(/keep list/);
    expect(rec.scaffold).toMatch(/15-minute timer/);
  });

  it("delegates the same request when capacity is low and a deadline is set", () => {
    const events = [1, 3, 5, 8, 12, 20].map((d) => delegated("composition", d));
    const rec = recommend({
      classification: classifyPrompt("Write me an email to my advisor asking for an extension"),
      states: deriveDomainStates(events, NOW),
      settings,
      capacity: 0.2,
      deadline: true,
    });
    expect(["delegate", "copilot"]).toContain(rec.mode);
    expect(rec.reasons.join(" ")).toMatch(/Capacity is low/);
  });

  it("scaffolds when the person asks for a hint, whatever the state", () => {
    const rec = recommend({
      classification: classifyPrompt("Give me a hint on this proof, don't give me the answer"),
      states: deriveDomainStates([], NOW),
      settings,
      capacity: 0.9,
    });
    expect(rec.mode).toBe("scaffold");
  });

  it("uses co-pilot for a review of the person's own work", () => {
    const rec = recommend({
      classification: classifyPrompt("Here's my draft, can you check my argument?"),
      states: deriveDomainStates([], NOW),
      settings,
      capacity: 0.9,
    });
    expect(rec.mode).toBe("copilot");
    expect(rec.scaffold).toMatch(/Critique/);
  });

  it("lets a fresh, non-keep-list procedural domain be delegated", () => {
    const events = [practiced("implementation", 1), practiced("implementation", 2)];
    const rec = recommend({
      classification: classifyPrompt("Write a bash script to rename all .jpeg files to .jpg"),
      states: deriveDomainStates(events, NOW),
      settings,
      capacity: 0.8,
    });
    expect(["delegate", "copilot"]).toContain(rec.mode);
  });

  it("never refuses an explanation outright", () => {
    const events = [1, 3, 5, 8, 12, 20].map((d) => delegated("composition", d));
    const rec = recommend({
      classification: classifyPrompt("Explain why my essay intro reads as passive"),
      states: deriveDomainStates(events, NOW),
      settings: { keepList: ["composition"], intensity: "firm" },
      capacity: 0.9,
    });
    expect(rec.mode).not.toBe("self");
  });

  it("is stricter at firm intensity than at gentle", () => {
    const events = [2, 9, 16].map((d) => delegated("planning", d));
    const states = deriveDomainStates(events, NOW);
    const classification = classifyPrompt("Make me a plan for the semester");
    const order = ["delegate", "copilot", "scaffold", "self"];
    const gentle = recommend({ classification, states, settings: { keepList: [], intensity: "gentle" }, capacity: 0.6 }).mode;
    const firm = recommend({ classification, states, settings: { keepList: [], intensity: "firm" }, capacity: 0.6 }).mode;
    expect(order.indexOf(firm)).toBeGreaterThanOrEqual(order.indexOf(gentle));
  });
});
