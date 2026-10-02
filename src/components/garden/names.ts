import { hasNoHistory } from "@/core/creature";
import type { DomainId, DomainState, Source } from "@/core/types";
import type { PlantStatus } from "@/pixel/plants";

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

/** Where an entry came from, as the journal says it. */
export const SOURCE_LABEL: Record<Source, string> = {
  "import-chatgpt": "ChatGPT",
  "import-claude": "Claude",
  "hook-claude-code": "Claude Code",
  "hook-cursor": "Cursor",
  "extension-chat": "Browser extension",
  activitywatch: "ActivityWatch",
  practice: "Practice session",
  gate: "Ask bar",
  manual: "Added by hand",
  seed: "Sample",
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
  seed: "seedling",
  fresh: "blooming",
  fading: "wilting",
  stale: "dry",
  fallow: "bare",
};

/** What a plant looks like: a sprout until anything at all has been logged for its domain. */
export function displayStatus(s: DomainState | undefined): PlantStatus {
  if (!s) return "seed";
  return hasNoHistory(s) ? "seed" : s.status;
}
