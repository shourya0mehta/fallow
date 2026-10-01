"use client";

import { useState } from "react";
import { useFallow } from "@/client/FallowProvider";
import { importChatGpt, type ImportResult } from "@/core/importers/chatgpt";
import { detectExport, importClaude, importFallow } from "@/core/importers/claude";
import { DOMAIN_BY_ID } from "@/core/taxonomy";
import type { DomainId, Signal } from "@/core/types";

/**
 * The export is parsed and classified in the browser. Only the resulting
 * events (domain tags, timestamps, and optional 140-character excerpts)
 * are posted to the local server.
 */
export default function ImportPage() {
  const { client, demo, mode, refresh } = useFallow();
  const [keepExcerpt, setKeepExcerpt] = useState(true);
  const [preview, setPreview] = useState<(ImportResult & { kind: string; signals?: Signal[] }) | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    setBusy(true);
    setStatus(null);
    setPreview(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const kind = detectExport(json);
      if (kind === "unknown") {
        setStatus("This does not look like a ChatGPT or Claude conversations.json export, or a Fallow ledger.");
        return;
      }
      const result = kind === "chatgpt" ? importChatGpt(json, { keepExcerpt }) : kind === "claude" ? importClaude(json, { keepExcerpt }) : importFallow(json);
      setPreview({ ...result, kind });
    } catch (e) {
      setStatus(`Could not read the file: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!preview || !client) return;
    setBusy(true);
    try {
      let note = "";
      if (demo) {
        await client.clear();
        note = " The demo ledger was replaced.";
      }
      const body = await client.addEvents(preview.events);
      if (preview.signals?.length) await client.addSignals(preview.signals);
      await refresh();
      setStatus(`Added ${body.added} new entries (${preview.events.length - body.added} were already in the ledger). Ledger now holds ${body.total}.${note}`);
    } catch (e) {
      setStatus(`Import failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const byDomain = preview ? tally(preview) : [];

  return (
    <main>
      <p className="dateline">Import</p>
      <h1>Months of history, filed in a minute.</h1>
      <p className="lede">
        Export your data from ChatGPT (Settings, Data controls, Export) or Claude (Settings, Privacy, Export data), unzip it, and drop <code>conversations.json</code> here. A ledger exported from the browser
        extension works too. Parsing happens in your browser.{" "}
        {mode === "browser" ? "Nothing is uploaded anywhere; the ledger lives in this browser's storage." : "Only domain tags, timestamps and short excerpts reach the local ledger."}
      </p>
      {demo && <p className="notice">The current ledger is the bundled demo. Importing replaces it with your own history.</p>}

      <label className="check">
        <input type="checkbox" checked={keepExcerpt} onChange={(e) => setKeepExcerpt(e.target.checked)} /> keep 140-character excerpts (turn off to store tags only)
      </label>
      <div className="row">
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
          disabled={busy}
        />
      </div>

      {status && <p className="notice">{status}</p>}

      {preview && (
        <section className="section">
          <p className="section-label">Preview · {preview.kind === "chatgpt" ? "ChatGPT" : preview.kind === "claude" ? "Claude" : "Fallow ledger"} {preview.kind === "fallow" ? "" : "export"}</p>
          <div className="strip">
            <div>
              <div className="label">Conversations</div>
              <div className="big num">{preview.conversations.toLocaleString()}</div>
            </div>
            <div>
              <div className="label">Your messages</div>
              <div className="big num">{preview.messages.toLocaleString()}</div>
            </div>
            <div>
              <div className="label">Entries to add</div>
              <div className="big num">{preview.events.length.toLocaleString()}</div>
            </div>
            <div>
              <div className="label">Skipped (short)</div>
              <div className="big num">{preview.skipped.toLocaleString()}</div>
            </div>
            <div>
              <div className="label">Span</div>
              <div className="big num" style={{ fontSize: 18 }}>
                {preview.from?.slice(0, 10)} to {preview.to?.slice(0, 10)}
              </div>
            </div>
          </div>
          <table className="ledger" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Domain</th>
                <th>Entries</th>
                <th>Delegated whole</th>
                <th>Shared</th>
              </tr>
            </thead>
            <tbody>
              {byDomain.map((r) => (
                <tr key={r.id}>
                  <td>{DOMAIN_BY_ID[r.id].label}</td>
                  <td className="num">{r.count}</td>
                  <td className="num">{r.delegated}</td>
                  <td className="num">{r.shared}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row">
            <button onClick={commit} disabled={busy || !client || preview.events.length === 0}>
              {demo ? `Replace the demo with ${preview.events.length.toLocaleString()} entries` : `Add ${preview.events.length.toLocaleString()} entries to the ledger`}
            </button>
            <span className="small">Re-importing the same file adds nothing twice.</span>
          </div>
        </section>
      )}
    </main>
  );
}

function tally(r: ImportResult) {
  const m = new Map<DomainId, { id: DomainId; count: number; delegated: number; shared: number }>();
  for (const e of r.events) {
    const top = e.domains[0]?.id;
    if (!top) continue;
    const row = m.get(top) ?? { id: top, count: 0, delegated: 0, shared: 0 };
    row.count += 1;
    if (e.actor === "ai") row.delegated += 1;
    else row.shared += 1;
    m.set(top, row);
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}
