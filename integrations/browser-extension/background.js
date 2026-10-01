// Fallow background worker: the only piece that talks to the app, or stands in for it.
//
// Two modes, picked automatically:
//   connected   the local Fallow app answers on its address; the ledger is its file.
//   standalone  no app is running; the bundled core (core.js) classifies and decides,
//               and the ledger lives in chrome.storage.local. Export it from the options page.
// Content scripts send messages here so the page's CORS rules never apply.

import { addEventsTo, addSignalsTo, applySettingsPatch, assess, buildPromptEvent, buildSnapshot, emptyLedger, normalizeLedger, parseSignal } from "./core.js";

const DEFAULT_BASE = "http://localhost:3000";
const SETTINGS_TTL_MS = 60 * 1000;
const PROBE_TTL_MS = 60 * 1000;
const PROBE_TIMEOUT_MS = 1200;

let probe = { at: 0, connected: false };

async function baseUrl() {
  const { baseUrl } = await chrome.storage.local.get("baseUrl");
  return (baseUrl || DEFAULT_BASE).replace(/\/$/, "");
}

async function standaloneForced() {
  const { standalone } = await chrome.storage.local.get("standalone");
  return standalone === true;
}

async function api(method, path, body, timeoutMs = 4000) {
  const base = await baseUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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

/** Is the local app answering? Cached for a minute. */
async function connected() {
  if (await standaloneForced()) return false;
  if (Date.now() - probe.at < PROBE_TTL_MS) return probe.connected;
  const res = await api("GET", "/api/settings", undefined, PROBE_TIMEOUT_MS);
  probe = { at: Date.now(), connected: res.ok && !!res.data && typeof res.data === "object" };
  return probe.connected;
}

// ---------- standalone ledger ----------

async function loadLocalLedger() {
  const { ledger } = await chrome.storage.local.get("ledger");
  return ledger ? normalizeLedger(ledger) : emptyLedger();
}

async function saveLocalLedger(ledger) {
  await chrome.storage.local.set({ ledger });
}

function localSettingsOf(ledger) {
  return ledger.settings;
}

// ---------- settings cache (connected mode) ----------

async function cachedSettings() {
  if (!(await connected())) {
    const ledger = await loadLocalLedger();
    return { ok: true, data: localSettingsOf(ledger), standalone: true };
  }
  const { settingsCache } = await chrome.storage.local.get("settingsCache");
  if (settingsCache && Date.now() - settingsCache.at < SETTINGS_TTL_MS) return { ok: true, data: settingsCache.data };
  const res = await api("GET", "/api/settings");
  if (res.ok) await chrome.storage.local.set({ settingsCache: { at: Date.now(), data: res.data } });
  return res;
}

// ---------- message handlers ----------

async function handle(msg, sender) {
  switch (msg.type) {
    case "assess": {
      if (await connected()) return api("POST", "/api/assess", { text: msg.text });
      const ledger = await loadLocalLedger();
      return { ok: true, data: assess(msg.text, ledger), standalone: true };
    }
    case "log": {
      if (await connected()) return api("POST", "/api/events", msg.payload);
      const ledger = await loadLocalLedger();
      const event = buildPromptEvent(msg.payload || {});
      if (!event) return { ok: false, error: "text is required" };
      const res = addEventsTo(ledger, [event]);
      await saveLocalLedger(ledger);
      return { ok: true, data: { ...res, event }, standalone: true };
    }
    case "signal": {
      if (await connected()) return api("POST", "/api/signals", msg.payload);
      const ledger = await loadLocalLedger();
      const signal = parseSignal(msg.payload, new Date().toISOString());
      if (!signal) return { ok: false, error: "bad signal" };
      const res = addSignalsTo(ledger, [signal]);
      await saveLocalLedger(ledger);
      return { ok: true, data: res, standalone: true };
    }
    case "settings":
      return cachedSettings();
    case "updateSettings": {
      if (await connected()) {
        await chrome.storage.local.remove("settingsCache");
        return api("POST", "/api/settings", msg.patch);
      }
      const ledger = await loadLocalLedger();
      const settings = applySettingsPatch(ledger, msg.patch || {});
      await saveLocalLedger(ledger);
      return { ok: true, data: settings, standalone: true };
    }
    case "refreshSettings":
      await chrome.storage.local.remove("settingsCache");
      probe = { at: 0, connected: false };
      return cachedSettings();
    case "pauseConfig": {
      const settings = await cachedSettings();
      if (!settings.ok) return settings;
      let todayOpens = 0;
      let entertainmentMin = null;
      if (await connected()) {
        const snap = await api("GET", "/api/snapshot");
        if (snap.ok) {
          todayOpens = snap.data.pause.todayOpens;
          entertainmentMin = snap.data.attention.today ? snap.data.attention.today.entertainmentMin : null;
        }
      } else {
        const ledger = await loadLocalLedger();
        const snap = buildSnapshot(ledger.events, ledger.settings, new Date(), ledger.signals);
        todayOpens = snap.pause.todayOpens;
        entertainmentMin = snap.attention.today ? snap.attention.today.entertainmentMin : null;
      }
      const { snooze = {} } = await chrome.storage.local.get("snooze");
      const base = await baseUrl();
      return {
        ok: true,
        data: {
          base,
          sites: settings.data.entertainmentSites || [],
          pauseSeconds: typeof settings.data.pauseSeconds === "number" ? settings.data.pauseSeconds : 10,
          budgetMin: settings.data.entertainmentBudgetMin || 60,
          todayOpens,
          entertainmentMin,
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
    case "status": {
      const isConnected = await connected();
      const ledger = isConnected ? null : await loadLocalLedger();
      return { ok: true, data: { connected: isConnected, base: await baseUrl(), standaloneEvents: ledger ? ledger.events.length : null } };
    }
    case "exportLedger": {
      const ledger = await loadLocalLedger();
      return { ok: true, data: ledger };
    }
    case "clearLocalLedger": {
      await chrome.storage.local.remove("ledger");
      return { ok: true };
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
