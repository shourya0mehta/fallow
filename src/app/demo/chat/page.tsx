"use client";

import { useState } from "react";

/**
 * A stand-in chat window for trying the browser extension without an account.
 * The extension's content script matches this page. Nothing here calls a model:
 * the "assistant" just acknowledges what it received.
 */
export default function DemoChatPage() {
  const [messages, setMessages] = useState<Array<{ role: "you" | "assistant"; text: string }>>([]);
  const [draft, setDraft] = useState("");

  function submit() {
    const text = draft.trim();
    if (!text) return;
    const scaffolded = /\[Fallow, [a-z -]+ mode\]/i.test(text);
    const tried = /\[Fallow\] I tried this first/i.test(text);
    const reply = tried
      ? "Good. Here is a hint, not the answer: start from what you already know is true and look for what it rules out."
      : scaffolded
        ? "Understood, I'll scaffold instead of answering. First question back to you: what would a good version of this need to contain?"
        : "This is a demo window. In the real thing the model would answer here.";
    setMessages((m) => [...m, { role: "you", text }, { role: "assistant", text: reply }]);
    setDraft("");
  }

  return (
    <main>
      <p className="dateline">Demo · a chat window the extension can see</p>
      <h1>Try the extension here.</h1>
      <p className="lede">
        Load the extension from <code>integrations/browser-extension</code> (chrome://extensions, Developer mode, Load unpacked), then type an ask below and press Enter. The verdict card appears before the message leaves.
      </p>
      <div style={{ border: "1px solid var(--rule-2)", background: "var(--paper-2)", padding: 16, minHeight: 200, marginBottom: 12 }} aria-live="polite" data-fallow-demo-log>
        {messages.length === 0 && <p className="small">No messages yet.</p>}
        {messages.map((m, i) => (
          <p key={i} style={{ margin: "0 0 10px" }}>
            <span className="small" style={{ textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 8 }}>
              {m.role}
            </span>
            {m.text}
          </p>
        ))}
      </div>
      <textarea
        data-fallow-composer
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Write me a cover letter for…"
        style={{ minHeight: 90 }}
      />
      <div className="row">
        <button data-fallow-send onClick={submit}>
          Send
        </button>
        <span className="small">Enter sends, Shift+Enter for a new line.</span>
      </div>
    </main>
  );
}
