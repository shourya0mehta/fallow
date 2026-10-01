"use client";

import { useEffect, useRef, useState } from "react";
import { useFallow } from "@/client/FallowProvider";
import { VerdictCard } from "@/components/VerdictCard";
import type { Assessment } from "@/core/assess";
import { MODE_LABEL } from "@/core/policy";
import { DOMAIN_BY_ID } from "@/core/taxonomy";

/**
 * A stand-in chat window. With the extension installed, the extension's own
 * content script intercepts the send. Without it, this page simulates the same
 * card using the ledger in the browser, so the hosted demo shows the whole loop.
 */
export default function DemoChatPage() {
  const { client, ready, refresh } = useFallow();
  const [messages, setMessages] = useState<Array<{ role: "you" | "assistant"; text: string }>>([]);
  const [draft, setDraft] = useState("");
  const [card, setCard] = useState<{ text: string; result: Assessment } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [timer, setTimer] = useState<{ text: string; started: number } | null>(null);
  const [left, setLeft] = useState("15:00");
  const hasExtension = useRef(false);

  useEffect(() => {
    const check = () => {
      hasExtension.current = document.documentElement.dataset.fallowExtension === "1";
    };
    check();
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!timer) return;
    const tick = () => {
      const ms = Math.max(0, 15 * 60_000 - (Date.now() - timer.started));
      setLeft(`${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timer]);

  function showToast(t: string) {
    setToast(t);
    setTimeout(() => setToast(null), 2600);
  }

  function deliver(text: string) {
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

  async function submit() {
    const text = draft.trim();
    if (!text) return;
    // The real extension handles the intercept when present, or when the ledger is not ready yet.
    if (hasExtension.current || !client || !ready || text.length < 12) {
      deliver(text);
      return;
    }
    const result = await client.assess(text);
    if (result.recommendation.mode === "delegate") {
      await client.logPrompt({ text, source: "extension-chat", actor: "ai", icap: "passive" });
      await refresh();
      showToast(`Fallow: filed under ${DOMAIN_BY_ID[result.classification.domains[0].id].label}, delegated.`);
      deliver(text);
      return;
    }
    setCard({ text, result });
  }

  async function finishTimer(actor: "self" | "shared") {
    if (!timer || !client) return;
    const minutes = Math.max(1, Math.round((Date.now() - timer.started) / 60_000));
    await client.logPrompt({ text: timer.text, source: "extension-chat", actor, icap: "constructive", minutes, demanding: minutes >= 10 });
    await refresh();
    setTimer(null);
    if (actor === "self") showToast(`Logged: did it yourself, ${minutes} min.`);
    else {
      showToast("Logged as an attempt. Ask for a hint, not the answer.");
      setDraft(`${timer.text}\n\n[Fallow] I tried this first. Give me a hint, not the answer.`);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Demo chat</h1>
        <p>Type an ask and press Enter. The pet&apos;s card appears before the message leaves, the same way the browser extension shows it on ChatGPT, Claude and Gemini.</p>
      </div>
      <section className="card demo-chat">
      <div className="demo-log" aria-live="polite" data-fallow-demo-log>
        {messages.length === 0 && <p className="fine">No messages yet.</p>}
        {messages.map((m, i) => (
          <p key={i} className={`bubble-line ${m.role}`}>
            <span className="who">{m.role}</span>
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
        <button className="btn" data-fallow-send onClick={submit}>
          Send
        </button>
        <span className="small">Enter sends. Try: &ldquo;Write me an email to my advisor asking for an extension&rdquo;.</span>
      </div>
      </section>

      {card && (
        <VerdictCard
          result={card.result}
          onTryFirst={() => {
            setCard(null);
            setTimer({ text: card.text, started: Date.now() });
          }}
          onScaffold={async () => {
            setCard(null);
            await client?.logPrompt({ text: card.text, source: "extension-chat", actor: "shared", icap: "active" });
            await refresh();
            deliver(`${card.text}\n\n[Fallow, ${MODE_LABEL[card.result.recommendation.mode].toLowerCase()} mode] ${card.result.recommendation.scaffold}`);
          }}
          onAnyway={async () => {
            setCard(null);
            await client?.logPrompt({ text: card.text, source: "extension-chat", actor: "ai", icap: "passive" });
            await refresh();
            deliver(card.text);
          }}
          onClose={() => setCard(null)}
        />
      )}
      {timer && (
        <div className="fallow-badge">
          <span>Trying it first</span>
          <span className="fallow-time">{left}</span>
          <button onClick={() => finishTimer("self")}>Did it</button>
          <button onClick={() => finishTimer("shared")}>Need a hint</button>
        </div>
      )}
      {toast && <div className="fallow-toast fallow-show">{toast}</div>}
    </div>
  );
}
