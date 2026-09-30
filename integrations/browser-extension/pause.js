// Fallow pause: a one-sec-style breath before an entertainment site opens.
// Grüning et al. 2023 (PNAS): a short pause led people to close the app in
// about a third of attempts and cut openings by more than half over six weeks.
// The site list, the pause length and the daily budget live in the Fallow app.

(() => {
  const host = location.hostname.replace(/^www\./, "").toLowerCase();
  if (!host) return;

  const send = (msg) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => resolve(res || { ok: false }));
      } catch {
        resolve({ ok: false });
      }
    });

  const matches = (sites) => sites.some((s) => host === s || host.endsWith(`.${s}`));

  function onBody(fn) {
    if (document.body) return fn();
    const obs = new MutationObserver(() => {
      if (document.body) {
        obs.disconnect();
        fn();
      }
    });
    obs.observe(document.documentElement, { childList: true });
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  async function main() {
    const cfg = await send({ type: "pauseConfig" });
    if (!cfg.ok) return;
    const { base, sites, pauseSeconds, budgetMin, todayOpens, entertainmentMin, snooze } = cfg.data;
    // Never pause the Fallow app itself, except its own demo feed page.
    try {
      if (new URL(base).host === location.host && !location.pathname.startsWith("/demo/feed")) return;
    } catch {
      /* ignore */
    }
    if (!matches(sites || [])) return;
    if (snooze && snooze[host] && Date.now() < snooze[host]) return;

    onBody(() => {
      const overlay = el("div", "fallow-overlay");
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-label", "Fallow pause");
      const inner = el("div", "fallow-inner");
      inner.appendChild(el("p", "fallow-kicker", `Fallow · ${host}`));
      inner.appendChild(el("h1", "", "One breath."));
      const count = el("div", "fallow-count", String(pauseSeconds));
      inner.appendChild(count);
      const nth = todayOpens + 1;
      const ordinal = nth === 1 ? "1st" : nth === 2 ? "2nd" : nth === 3 ? "3rd" : `${nth}th`;
      inner.appendChild(el("p", "", `${ordinal} open today on the sites you listed.`));
      if (typeof entertainmentMin === "number") {
        inner.appendChild(el("p", "", `${entertainmentMin} of your ${budgetMin} minutes used, by ActivityWatch's count.`));
      } else {
        inner.appendChild(el("p", "", `Budget ${budgetMin} minutes a day. Run the attention sync to see minutes here.`));
      }
      const actions = el("div", "fallow-actions");
      const notNow = el("button", "", "Not now");
      const go = el("button", "fallow-secondary", "Continue");
      go.disabled = pauseSeconds > 0;
      actions.appendChild(notNow);
      actions.appendChild(go);
      inner.appendChild(actions);
      overlay.appendChild(inner);
      document.body.appendChild(overlay);
      const previousOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";

      const started = Date.now();
      let left = pauseSeconds;
      const timer = setInterval(() => {
        left -= 1;
        count.textContent = String(Math.max(0, left));
        if (left <= 0) {
          clearInterval(timer);
          go.disabled = false;
          count.textContent = "";
        }
      }, 1000);

      const waited = () => Math.round((Date.now() - started) / 1000);
      notNow.addEventListener("click", async () => {
        clearInterval(timer);
        await send({ type: "signal", payload: { kind: "pause", site: host, outcome: "closed", waitedSeconds: waited() } });
        await send({ type: "closeTab" });
        // If the tab could not be closed (e.g. the last tab), fall back to a blank page.
        overlay.querySelector("h1").textContent = "Closed.";
        actions.remove();
        setTimeout(() => {
          location.replace("about:blank");
        }, 400);
      });
      go.addEventListener("click", async () => {
        await send({ type: "signal", payload: { kind: "pause", site: host, outcome: "continued", waitedSeconds: waited() } });
        await send({ type: "snooze", host, minutes: 30 });
        overlay.remove();
        document.documentElement.style.overflow = previousOverflow;
      });
    });
  }

  main();
})();
