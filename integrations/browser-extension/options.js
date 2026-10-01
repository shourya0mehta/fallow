const base = document.getElementById("base");
const standalone = document.getElementById("standalone");
const status = document.getElementById("status");
const mode = document.getElementById("mode");

const send = (msg) => new Promise((resolve) => chrome.runtime.sendMessage(msg, (res) => resolve(res || { ok: false })));

function flash(text) {
  status.textContent = text;
  setTimeout(() => (status.textContent = ""), 1500);
}

async function showStatus() {
  const res = await send({ type: "status" });
  if (!res.ok) return;
  mode.textContent = res.data.connected
    ? `Connected to the app at ${res.data.base}. The ledger is the app's file.`
    : `Standalone. ${res.data.standaloneEvents} asks stored in the extension${res.data.base ? ` (no app answering at ${res.data.base})` : ""}.`;
}

chrome.storage.local.get(["baseUrl", "standalone"]).then(({ baseUrl, standalone: s }) => {
  base.value = baseUrl || "http://localhost:3000";
  standalone.checked = s === true;
  showStatus();
});

document.getElementById("save").addEventListener("click", async () => {
  const value = base.value.trim().replace(/\/$/, "") || "http://localhost:3000";
  await chrome.storage.local.set({ baseUrl: value, standalone: standalone.checked, settingsCache: null });
  await send({ type: "refreshSettings" });
  flash("Saved.");
  showStatus();
});

document.getElementById("export").addEventListener("click", async () => {
  const res = await send({ type: "exportLedger" });
  if (!res.ok) return flash("Nothing to export.");
  const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fallow-ledger-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

document.getElementById("clear").addEventListener("click", async () => {
  await chrome.storage.local.set({ snooze: {}, mute: {} });
  flash("Cleared.");
});

document.getElementById("erase").addEventListener("click", async () => {
  if (!confirm("Erase every ask stored in the extension? This cannot be undone.")) return;
  await send({ type: "clearLocalLedger" });
  flash("Erased.");
  showStatus();
});
