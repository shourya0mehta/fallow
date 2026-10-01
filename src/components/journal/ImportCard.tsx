"use client";

import { useEffect, useRef, useState } from "react";
import { useFallow } from "@/client/FallowProvider";
import { importChatGpt, type ImportResult } from "@/core/importers/chatgpt";
import { detectExport, importClaude, importFallow } from "@/core/importers/claude";
import { DOMAIN_BY_ID } from "@/core/taxonomy";
import type { DomainId, Signal } from "@/core/types";
import { PlantIcon } from "../garden/PlantIcon";

/**
 * Drop a ChatGPT or Claude export (or a Fallow ledger from the extension).
 * Parsed and classified in this browser; nothing is uploaded.
 */
export function ImportCard() {
  const { client, demo, mode, refresh } = useFallow();
  const [open, setOpen] = useState(false);
  const [keepExcerpt, setKeepExcerpt] = useState(true);
  const [preview, setPreview] = useState<(ImportResult & { kind: string; signals?: Signal[] }) | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (window.location.hash === "#import" || demo) setOpen(true);
  }, [demo]);

  async function onFile(file: File) {
    setBusy(true);
    setStatus(null);
    setPreview(null);
    try {
      const json = JSON.parse(await file.text());
      const kind = detectExport(json);
      if (kind === "unknown") {
        setStatus("That doesn't look like a ChatGPT or Claude conversations.json, or a Fallow ledger.");
        return;
      }
      const result = kind === "chatgpt" ? importChatGpt(json, { keepExcerpt }) : kind === "claude" ? importClaude(json, { keepExcerpt }) : importFallow(json);
      setPreview({ ...result, kind });
    } catch (e) {
      setStatus(`Couldn't read the file: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!preview || !client) return;
    setBusy(true);
    try {
      if (demo) await client.clear();
      const body = await client.addEvents(preview.events);
      if (preview.signals?.length) await client.addSignals(preview.signals);
      await refresh();
      setStatus(`Planted ${body.added} new entries${preview.events.length - body.added ? ` (${preview.events.length - body.added} were already here)` : ""}. Your garden now grows from ${body.total}.${demo ? " The demo is gone." : ""}`);
      setPreview(null);
    } catch (e) {
      setStatus(`Import failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const byDomain = preview ? tally(preview) : [];
  const source = preview?.kind === "chatgpt" ? "ChatGPT" : preview?.kind === "claude" ? "Claude" : "Fallow";

  return (
    <details className="card" id="import" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="card-summary">
        <h2>Grow your own garden</h2>
        <span className="card-sub">from a ChatGPT or Claude export</span>
      </summary>
      <ol className="how-to">
        <li>
          <b>ChatGPT:</b> Settings → Data controls → Export. <b>Claude:</b> Settings → Privacy → Export data.
        </li>
        <li>Unzip the download and drop <code>conversations.json</code> below.</li>
        <li>{mode === "browser" ? "It's read right here in your browser. Nothing is uploaded anywhere." : "Only tags, dates and short excerpts reach the local ledger."}</li>
      </ol>
      <div
        className={`dropzone ${over ? "over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
      >
        <p>
          <b>Drop conversations.json here</b>
        </p>
        <button className="btn ghost small-btn" onClick={() => inputRef.current?.click()} disabled={busy}>
          or choose a file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        <label className="check" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={keepExcerpt} onChange={(e) => setKeepExcerpt(e.target.checked)} /> keep short excerpts (off = tags only)
        </label>
      </div>
      {status && (
        <p className="notice" role="status" style={{ marginTop: 12 }}>
          {status}
        </p>
      )}
      {preview && (
        <div className="import-preview">
          <p className="eyebrow">
            {source} · {preview.messages.toLocaleString()} of your messages · {preview.from?.slice(0, 10)} to {preview.to?.slice(0, 10)}
          </p>
          <div className="import-plants">
            {byDomain.map((r) => (
              <div key={r.id} className="import-plant" title={`${DOMAIN_BY_ID[r.id].label}: ${r.count} asks, ${r.delegated} handed off`}>
                <PlantIcon id={r.id} status="fresh" scale={1} />
                <b className="num">{r.count}</b>
                <span>{DOMAIN_BY_ID[r.id].label}</span>
              </div>
            ))}
          </div>
          <div className="row">
            <button className="btn" onClick={commit} disabled={busy || preview.events.length === 0}>
              {demo ? `Replace the demo with ${preview.events.length.toLocaleString()} asks` : `Plant ${preview.events.length.toLocaleString()} asks`}
            </button>
            <span className="small">{preview.skipped.toLocaleString()} short messages skipped. Re-importing never doubles anything.</span>
          </div>
        </div>
      )}
    </details>
  );
}

function tally(r: ImportResult) {
  const m = new Map<DomainId, { id: DomainId; count: number; delegated: number }>();
  for (const e of r.events) {
    const top = e.domains[0]?.id;
    if (!top) continue;
    const row = m.get(top) ?? { id: top, count: 0, delegated: 0 };
    row.count += 1;
    if (e.actor === "ai") row.delegated += 1;
    m.set(top, row);
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}
