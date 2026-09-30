// Fallow background worker: the only place that talks to the local app.
// Content scripts send messages here so the page's CORS rules never apply.

const DEFAULT_BASE = "http://localhost:3000";
const SETTINGS_TTL_MS = 60 * 1000;

async function baseUrl() {
  const { baseUrl } = await chrome.storage.local.get("baseUrl");
  return (baseUrl || DEFAULT_BASE).replace(/\/$/, "");
}

async function api(method, path, body) {
  const base = await baseUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(base + path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, error: String(err && err.message ? err.message : err) };
  } finally {
    clearTimeout(timer);
  }
}

async function cachedSettings() {
  const { settingsCache } = await chrome.storage.local.get("settingsCache");
  if (settingsCache && Date.now() - settingsCache.at < SETTINGS_TTL_MS) return { ok: true, data: settingsCache.data };
  const res = await api("GET", "/api/settings");
  if (res.ok) await chrome.storage.local.set({ settingsCache: { at: Date.now(), data: res.data } });
  return res;
}

async function handle(msg, sender) {
  switch (msg.type) {
    case "assess":
      return api("POST", "/api/assess", { text: msg.text });
    case "log":
      return api("POST", "/api/events", msg.payload);
    case "signal":
      return api("POST", "/api/signals", msg.payload);
    case "settings":
      return cachedSettings();
    case "refreshSettings":
      await chrome.storage.local.remove("settingsCache");
      return cachedSettings();
    case "pauseConfig": {
      const settings = await cachedSettings();
      if (!settings.ok) return settings;
      const snap = await api("GET", "/api/snapshot");
      const { snooze = {} } = await chrome.storage.local.get("snooze");
      const base = await baseUrl();
      return {
        ok: true,
        data: {
          base,
          sites: settings.data.entertainmentSites || [],
          pauseSeconds: typeof settings.data.pauseSeconds === "number" ? settings.data.pauseSeconds : 10,
          budgetMin: settings.data.entertainmentBudgetMin || 60,
          todayOpens: snap.ok ? snap.data.pause.todayOpens : 0,
          entertainmentMin: snap.ok && snap.data.attention.today ? snap.data.attention.today.entertainmentMin : null,
          snooze,
        },
      };
    }
    case "snooze": {
      const { snooze = {} } = await chrome.storage.local.get("snooze");
      snooze[msg.host] = Date.now() + (msg.minutes || 30) * 60 * 1000;
      await chrome.storage.local.set({ snooze });
      return { ok: true };
    }
    case "mute": {
      const { mute = {} } = await chrome.storage.local.get("mute");
      mute[msg.host] = Date.now() + (msg.minutes || 60) * 60 * 1000;
      await chrome.storage.local.set({ mute });
      return { ok: true };
    }
    case "muteState": {
      const { mute = {} } = await chrome.storage.local.get("mute");
      return { ok: true, data: { until: mute[msg.host] || 0 } };
    }
    case "closeTab":
      if (sender.tab && sender.tab.id !== undefined) {
        try {
          await chrome.tabs.remove(sender.tab.id);
        } catch {
          /* ignore */
        }
      }
      return { ok: true };
    default:
      return { ok: false, error: "unknown message" };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender).then(sendResponse, (err) => sendResponse({ ok: false, error: String(err) }));
  return true;
});
