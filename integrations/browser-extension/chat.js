// Fallow chat intercept: runs on ChatGPT, Claude, Gemini and the demo page.
// On send, asks the local app for an engagement mode and shows the verdict
// before the prompt leaves. Fails open: if the app is unreachable, the prompt
// goes through untouched.

(() => {
  const MIN_CHARS = 12;
  const TIMER_MINUTES = 15;
  const MODE_LABEL = { self: "Do it yourself", scaffold: "Scaffold", copilot: "Co-pilot", delegate: "Delegate" };
  const DOMAIN_LABEL = {
    composition: "Composition",
    analysis: "Analytical reasoning",
    quantitative: "Quantitative reasoning",
    recall: "Recall",
    synthesis: "Reading and synthesis",
    navigation: "Spatial navigation",
    planning: "Planning",
    ideation: "Creative ideation",
    implementation: "Implementation",
    verbal: "Verbal expression",
    attention: "Sustained attention",
  };
  const COMPOSER_SELECTORS = [
    "#prompt-textarea",
    "textarea[data-testid='chat-composer']",
    "div.ProseMirror[contenteditable='true']",
    "rich-textarea div[contenteditable='true']",
    "div[contenteditable='true'][role='textbox']",
    "textarea[data-fallow-composer]",
    "textarea",
  ];
  const SEND_SELECTORS = [
    "button[data-testid='send-button']",
    "button[aria-label='Send message']",
    "button[aria-label='Send Message']",
    "button[aria-label='Send prompt']",
    "button[data-fallow-send]",
  ];

  const state = { bypass: false, muteUntil: 0, busy: false };
  const host = location.hostname.replace(/^www\./, "");

  const send = (msg) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => resolve(res || { ok: false }));
      } catch {
        resolve({ ok: false });
      }
    });

  send({ type: "muteState", host }).then((r) => {
    if (r.ok && r.data.until) state.muteUntil = r.data.until;
  });

  function composer() {
    for (const sel of COMPOSER_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function sendButton() {
    for (const sel of SEND_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function textOf(el) {
    return (el.tagName === "TEXTAREA" || el.tagName === "INPUT" ? el.value : el.innerText || el.textContent || "").trim();
  }

  function insertText(el, addition) {
    if (el.tagName === "TEXTAREA") {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      setter.call(el, `${el.value}\n\n${addition}`);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand("insertText", false, `\n\n${addition}`);
  }

  function proceed(trigger) {
    state.bypass = true;
    if (trigger && trigger.kind === "click" && trigger.target) {
      trigger.target.click();
      return;
    }
    const btn = sendButton();
    if (btn) {
      btn.click();
      return;
    }
    const el = composer();
    if (el) el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    state.bypass = false;
  }

  function log(text, actor, icap, extra) {
    return send({ type: "log", payload: Object.assign({ text, source: "extension-chat", actor, icap }, extra || {}) });
  }

  function toast(message) {
    let el = document.querySelector(".fallow-toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "fallow-toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    requestAnimationFrame(() => el.classList.add("fallow-show"));
    setTimeout(() => el.classList.remove("fallow-show"), 2600);
  }

  function removeCard() {
    const card = document.querySelector(".fallow-card");
    if (card) card.remove();
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function showCard(text, result, trigger) {
    removeCard();
    const rec = result.recommendation;
    const cls = result.classification;
    const card = el("div", "fallow-card");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Fallow verdict");
    card.appendChild(el("p", "fallow-kicker", "Fallow · before you hand it over"));
    card.appendChild(el("p", `fallow-mode fallow-mode-${rec.mode}`, MODE_LABEL[rec.mode] || rec.mode));
    card.appendChild(el("p", "fallow-domains", cls.domains.map((d) => `${DOMAIN_LABEL[d.id] || d.id} ${Math.round(d.weight * 100)}%`).join(" · ")));
    for (const reason of rec.reasons.slice(0, 2)) card.appendChild(el("p", "fallow-reason", reason));
    card.appendChild(el("div", "fallow-scaffold", rec.scaffold));

    const actions = el("div", "fallow-actions");
    const tryFirst = el("button", rec.mode === "self" ? "" : "fallow-secondary", "I'll try first");
    tryFirst.setAttribute("data-fallow-action", "try");
    tryFirst.addEventListener("click", () => {
      removeCard();
      startTimer(text);
    });
    const withScaffold = el("button", rec.mode === "self" ? "fallow-secondary" : "", "Send with scaffold");
    withScaffold.setAttribute("data-fallow-action", "scaffold");
    withScaffold.addEventListener("click", async () => {
      removeCard();
      const target = composer();
      if (target) insertText(target, `[Fallow, ${MODE_LABEL[rec.mode].toLowerCase()} mode] ${rec.scaffold}`);
      await log(text, "shared", "active");
      proceed(trigger);
    });
    const anyway = el("button", "fallow-secondary", "Send anyway");
    anyway.setAttribute("data-fallow-action", "anyway");
    anyway.addEventListener("click", async () => {
      removeCard();
      await log(text, "ai", "passive");
      proceed(trigger);
    });
    actions.appendChild(tryFirst);
    actions.appendChild(withScaffold);
    actions.appendChild(anyway);
    card.appendChild(actions);

    const mute = el("button", "fallow-mute", "Quiet on this site for an hour");
    mute.addEventListener("click", async () => {
      state.muteUntil = Date.now() + 60 * 60 * 1000;
      await send({ type: "mute", host, minutes: 60 });
      removeCard();
      proceed(trigger);
    });
    card.appendChild(mute);
    document.body.appendChild(card);
  }

  function startTimer(text) {
    const badge = el("div", "fallow-badge");
    const label = el("span", "", "Trying it first");
    const time = el("span", "fallow-time");
    const done = el("button", "", "Did it");
    const hint = el("button", "", "Need a hint");
    badge.appendChild(label);
    badge.appendChild(time);
    badge.appendChild(done);
    badge.appendChild(hint);
    document.body.appendChild(badge);
    const started = Date.now();
    const total = TIMER_MINUTES * 60 * 1000;
    const tick = () => {
      const left = Math.max(0, total - (Date.now() - started));
      const m = Math.floor(left / 60000);
      const s = Math.floor((left % 60000) / 1000);
      time.textContent = `${m}:${String(s).padStart(2, "0")}`;
      if (left <= 0) label.textContent = "Time's up. How did it go?";
    };
    tick();
    const interval = setInterval(tick, 1000);
    const finish = async (actor) => {
      clearInterval(interval);
      badge.remove();
      const minutes = Math.max(1, Math.round((Date.now() - started) / 60000));
      await log(text, actor, actor === "self" ? "constructive" : "constructive", { minutes, demanding: minutes >= 10 });
      toast(actor === "self" ? `Logged: did it yourself, ${minutes} min.` : `Logged as an attempt. Ask for a hint, not the answer.`);
      if (actor !== "self") {
        const target = composer();
        if (target) insertText(target, "[Fallow] I tried this first. Give me a hint, not the answer.");
      }
    };
    done.addEventListener("click", () => finish("self"));
    hint.addEventListener("click", () => finish("shared"));
  }

  async function intercept(event, trigger) {
    if (state.bypass) {
      state.bypass = false;
      return;
    }
    if (state.busy || Date.now() < state.muteUntil) return;
    const target = composer();
    if (!target) return;
    const text = textOf(target);
    if (text.length < MIN_CHARS) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    state.busy = true;
    try {
      const res = await send({ type: "assess", text });
      if (!res.ok || !res.data || !res.data.recommendation) {
        proceed(trigger);
        return;
      }
      const rec = res.data.recommendation;
      if (rec.mode === "delegate") {
        await log(text, "ai", "passive");
        const top = res.data.classification.domains[0];
        toast(`Fallow: filed under ${DOMAIN_LABEL[top.id] || top.id}, delegated.`);
        proceed(trigger);
        return;
      }
      showCard(text, res.data, trigger);
    } finally {
      state.busy = false;
    }
  }

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      const target = composer();
      if (!target || !(target === event.target || target.contains(event.target))) return;
      intercept(event, { kind: "key" });
    },
    true,
  );

  document.addEventListener(
    "click",
    (event) => {
      const btn = event.target && event.target.closest ? event.target.closest(SEND_SELECTORS.join(",")) : null;
      if (!btn) return;
      intercept(event, { kind: "click", target: btn });
    },
    true,
  );
})();
