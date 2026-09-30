const base = document.getElementById("base");
const status = document.getElementById("status");

chrome.storage.local.get("baseUrl").then(({ baseUrl }) => {
  base.value = baseUrl || "http://localhost:3000";
});

document.getElementById("save").addEventListener("click", async () => {
  const value = base.value.trim().replace(/\/$/, "") || "http://localhost:3000";
  await chrome.storage.local.set({ baseUrl: value, settingsCache: null });
  status.textContent = "Saved.";
  setTimeout(() => (status.textContent = ""), 1500);
});

document.getElementById("clear").addEventListener("click", async () => {
  await chrome.storage.local.set({ snooze: {}, mute: {} });
  status.textContent = "Cleared.";
  setTimeout(() => (status.textContent = ""), 1500);
});
