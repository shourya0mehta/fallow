/**
 * The attention layer: from ActivityWatch window, AFK and browser-tab events
 * to a day's fragmentation summary and its focus blocks.
 *
 * What the evidence supports (see the review): switching rate is a behavior
 * worth showing, not a measure of damage; long unbroken blocks are the thing
 * worth protecting; time on entertainment sites is a self-set budget, never a
 * lock. So this module reports switches per active hour, the longest block,
 * entertainment minutes, and the blocks themselves, which the sync script logs
 * as sustained-attention practice.
 */

export interface AwEvent {
  /** ISO timestamp with offset, as ActivityWatch emits it. */
  timestamp: string;
  /** Seconds. */
  duration: number;
  data: { app?: string; title?: string; url?: string; status?: string; audible?: boolean };
}

export interface AttentionInput {
  window: AwEvent[];
  afk?: AwEvent[];
  /** aw-watcher-web events (data.url). Optional; titles are used as a fallback. */
  web?: AwEvent[];
  entertainmentSites: string[];
  /** Apps that are entertainment wherever they run. */
  entertainmentApps?: string[];
  /** Runs shorter than this are not focus blocks. */
  minBlockMinutes?: number;
  /** An interruption up to this long that returns to the same activity does not break a block. */
  maxInterruptionSeconds?: number;
  /** A silence longer than this ends a run and does not count as a switch. */
  gapSeconds?: number;
}

export interface FocusBlock {
  start: string;
  end: string;
  minutes: number;
  key: string;
}

export interface AttentionSummary {
  activeMin: number;
  switches: number;
  switchesPerHour: number;
  longestBlockMin: number;
  entertainmentMin: number;
  top: Array<{ name: string; minutes: number }>;
  focusBlocks: FocusBlock[];
}

export const BROWSER_APPS = ["chrome", "google chrome", "chromium", "safari", "firefox", "arc", "brave", "brave browser", "microsoft edge", "edge", "opera", "vivaldi", "zen"];
export const DEFAULT_ENTERTAINMENT_APPS = ["netflix", "tiktok", "instagram", "youtube", "twitch", "tv", "steam", "discord"];

interface Segment {
  start: number; // ms
  end: number; // ms
  key: string; // what the person was doing: an app, or browser:<domain>
  entertainment: boolean;
}

export function domainOf(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function matchesSite(domain: string, sites: string[]): boolean {
  return sites.some((s) => domain === s || domain.endsWith(`.${s}`));
}

function isBrowser(app: string | undefined): boolean {
  return !!app && BROWSER_APPS.includes(app.toLowerCase());
}

function titleLooksEntertaining(title: string | undefined, sites: string[]): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  return sites.some((s) => {
    const word = s.split(".")[0];
    return word.length >= 4 && t.includes(word);
  });
}

/** Active intervals: not-afk events when present, otherwise the whole span of the window events. */
function activeIntervals(afk: AwEvent[] | undefined, window: AwEvent[]): Array<[number, number]> {
  if (afk && afk.length) {
    return afk
      .filter((e) => e.data.status === "not-afk")
      .map((e) => [Date.parse(e.timestamp), Date.parse(e.timestamp) + e.duration * 1000] as [number, number])
      .sort((a, b) => a[0] - b[0]);
  }
  if (!window.length) return [];
  const start = Math.min(...window.map((e) => Date.parse(e.timestamp)));
  const end = Math.max(...window.map((e) => Date.parse(e.timestamp) + e.duration * 1000));
  return [[start, end]];
}

function clip(start: number, end: number, intervals: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const [a, b] of intervals) {
    const s = Math.max(start, a);
    const e = Math.min(end, b);
    if (e > s) out.push([s, e]);
  }
  return out;
}

/**
 * Turn raw events into a sorted list of activity segments. Browser time is
 * split by the concurrent web-tab event's domain when web events exist,
 * otherwise by title keywords.
 */
export function segmentize(input: AttentionInput): Segment[] {
  const sites = input.entertainmentSites.map((s) => s.toLowerCase());
  const apps = (input.entertainmentApps ?? DEFAULT_ENTERTAINMENT_APPS).map((a) => a.toLowerCase());
  const active = activeIntervals(input.afk, input.window);
  const web = [...(input.web ?? [])].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const segments: Segment[] = [];

  const sortedWindow = [...input.window].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  for (const e of sortedWindow) {
    const s0 = Date.parse(e.timestamp);
    const e0 = s0 + e.duration * 1000;
    const app = (e.data.app ?? "unknown").trim();
    for (const [s, en] of clip(s0, e0, active)) {
      if (isBrowser(app) && web.length) {
        // Split the browser segment by overlapping web events.
        let cursor = s;
        for (const w of web) {
          const ws = Date.parse(w.timestamp);
          const we = ws + w.duration * 1000;
          if (we <= cursor || ws >= en) continue;
          const a = Math.max(cursor, ws);
          const b = Math.min(en, we);
          if (a > cursor) segments.push({ start: cursor, end: a, key: `${app}`, entertainment: false });
          const domain = domainOf(w.data.url) || "browser";
          segments.push({ start: a, end: b, key: `${app}: ${domain}`, entertainment: matchesSite(domain, sites) });
          cursor = b;
        }
        if (cursor < en) segments.push({ start: cursor, end: en, key: `${app}`, entertainment: false });
      } else {
        const ent = apps.includes(app.toLowerCase()) || (isBrowser(app) && titleLooksEntertaining(e.data.title, sites));
        const key = isBrowser(app) && ent ? `${app}: entertainment` : app;
        segments.push({ start: s, end: en, key, entertainment: ent });
      }
    }
  }
  return segments.filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
}

export function summarizeAttention(input: AttentionInput): AttentionSummary {
  const minBlock = (input.minBlockMinutes ?? 25) * 60_000;
  const maxInterrupt = (input.maxInterruptionSeconds ?? 60) * 1000;
  const gap = (input.gapSeconds ?? 300) * 1000;
  const segments = segmentize(input);

  let activeMs = 0;
  let entertainmentMs = 0;
  let switches = 0;
  const byKey = new Map<string, number>();
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const ms = s.end - s.start;
    activeMs += ms;
    if (s.entertainment) entertainmentMs += ms;
    byKey.set(s.key, (byKey.get(s.key) ?? 0) + ms);
    if (i > 0) {
      const prev = segments[i - 1];
      const silence = s.start - prev.end;
      if (prev.key !== s.key && silence <= gap) switches += 1;
    }
  }

  // Focus blocks: runs of one key, allowing brief interruptions that return to it.
  const blocks: FocusBlock[] = [];
  let i = 0;
  while (i < segments.length) {
    const key = segments[i].key;
    if (segments[i].entertainment) {
      i += 1;
      continue;
    }
    const start = segments[i].start;
    let end = segments[i].end;
    let j = i + 1;
    while (j < segments.length) {
      const next = segments[j];
      if (next.start - end > gap) break;
      if (next.key === key) {
        end = next.end;
        j += 1;
        continue;
      }
      // An interruption: skip ahead over other keys if they are short and we return to `key`.
      let k = j;
      let interruption = 0;
      while (k < segments.length && segments[k].key !== key) {
        if (segments[k].entertainment) break;
        interruption += segments[k].end - segments[k].start;
        k += 1;
      }
      if (k < segments.length && segments[k].key === key && interruption <= maxInterrupt && segments[k].start - end <= gap + interruption) {
        end = segments[k].end;
        j = k + 1;
        continue;
      }
      break;
    }
    const length = end - start;
    if (length >= minBlock) {
      blocks.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString(), minutes: Math.round(length / 60_000), key });
    }
    i = Math.max(j, i + 1);
  }

  const activeMin = Math.round(activeMs / 60_000);
  const hours = activeMs / 3_600_000;
  return {
    activeMin,
    switches,
    switchesPerHour: hours > 0 ? Math.round((switches / hours) * 10) / 10 : 0,
    longestBlockMin: blocks.reduce((m, b) => Math.max(m, b.minutes), 0),
    entertainmentMin: Math.round(entertainmentMs / 60_000),
    top: [...byKey.entries()]
      .map(([name, ms]) => ({ name, minutes: Math.round(ms / 60_000) }))
      .filter((t) => t.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 8),
    focusBlocks: blocks,
  };
}
