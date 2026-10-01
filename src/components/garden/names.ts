import type { DomainId } from "@/core/types";

/** What the garden calls each plant, for quests and tags. */
export const PLANT_NAME: Record<DomainId, { one: string; the: string }> = {
  composition: { one: "lavender", the: "the lavender" },
  analysis: { one: "bellflower", the: "the bellflower" },
  quantitative: { one: "sunflower", the: "the sunflower" },
  recall: { one: "forget-me-nots", the: "the forget-me-nots" },
  synthesis: { one: "wheat", the: "the wheat" },
  navigation: { one: "morning glory", the: "the morning glory" },
  planning: { one: "tomatoes", the: "the tomatoes" },
  ideation: { one: "dandelion", the: "the dandelion" },
  implementation: { one: "cactus", the: "the cactus" },
  verbal: { one: "snapdragon", the: "the snapdragon" },
  attention: { one: "pine", the: "the pine" },
};

/** A sensible first session length per domain, in minutes. */
export const SESSION_MIN: Record<DomainId, number> = {
  composition: 20,
  analysis: 15,
  quantitative: 10,
  recall: 5,
  synthesis: 15,
  navigation: 10,
  planning: 10,
  ideation: 10,
  implementation: 20,
  verbal: 5,
  attention: 45,
};

export const STATUS_WORD: Record<string, string> = {
  fresh: "blooming",
  fading: "wilting",
  stale: "dry",
  fallow: "bare",
};
