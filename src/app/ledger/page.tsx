"use client";

import { useState } from "react";
import { Loading, useFallow } from "@/client/FallowProvider";
import { shortDate } from "@/components/format";
import { DOMAIN_BY_ID } from "@/core/taxonomy";
import type { DomainId } from "@/core/types";

const PAGE = 200;

export default function LedgerPage() {
  const { ready, ledger, client, refresh } = useFallow();
  const [domain, setDomain] = useState<DomainId | null>(null);
  const [pageNo, setPageNo] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!ready || !ledger) {
    return (
      <main>
        <p className="dateline">The ledger</p>
        <h1>Every ask, filed.</h1>
        <Loading what="the ledger" />
      </main>
    );
  }

  const all = [...ledger.events].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  const filtered = domain ? all.filter((e) => e.domains.some((d) => d.id === domain)) : all;
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const page = Math.min(pageNo, pages);
  const rows = filtered.slice((page - 1) * PAGE, page * PAGE);

  async function remove(id: string) {
    if (!client) return;
    setBusyId(id);
    await client.deleteEvent(id);
    await refresh();
    setBusyId(null);
  }

  return (
    <main>
      <p className="dateline">The ledger</p>
      <h1>Every ask, filed.</h1>
      <p className="lede">
        {filtered.length.toLocaleString()} entries{domain ? ` in ${DOMAIN_BY_ID[domain].label}` : ""}. Excerpts are the first 140 characters; delete any row you would rather not keep.
      </p>
      <p className="small">
        Filter:{" "}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setDomain(null);
            setPageNo(1);
          }}
          style={{ textDecoration: domain ? "none" : "underline" }}
        >
          all
        </a>
        {Object.values(DOMAIN_BY_ID)
          .filter((d) => d.id !== "attention")
          .map((d) => (
            <span key={d.id}>
              {" · "}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setDomain(d.id);
                  setPageNo(1);
                }}
                style={{ textDecoration: domain === d.id ? "underline" : "none" }}
              >
                {d.label}
              </a>
            </span>
          ))}
      </p>

      <table className="ledger" style={{ marginTop: 18 }}>
        <thead>
          <tr>
            <th>When</th>
            <th>Ask</th>
            <th>Domains</th>
            <th>Who did it</th>
            <th>Level</th>
            <th>Source</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id}>
              <td className="num" style={{ whiteSpace: "nowrap" }}>
                {shortDate(e.ts)}
              </td>
              <td>{e.excerpt ?? <span className="muted">(excerpt withheld)</span>}</td>
              <td className="small">{e.domains.map((d) => `${DOMAIN_BY_ID[d.id].label} ${Math.round(d.weight * 100)}%`).join(", ")}</td>
              <td>
                <span className={`chip chip-${e.actor}`}>{e.actor === "ai" ? "delegated" : e.actor}</span>
              </td>
              <td className="small">
                {e.icap} · {e.askType}
                {e.minutes ? ` · ${e.minutes} min` : ""}
              </td>
              <td className="small">{e.source}</td>
              <td>
                <button className="secondary" style={{ padding: "4px 8px", fontSize: 11 }} disabled={busyId === e.id} onClick={() => remove(e.id)} aria-label="Delete this entry">
                  ×
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                Nothing here yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {pages > 1 && (
        <p className="small" style={{ marginTop: 14 }}>
          Page {page} of {pages}.{" "}
          {page > 1 && (
            <a href="#" onClick={(e) => { e.preventDefault(); setPageNo(page - 1); }} style={{ textDecoration: "underline" }}>
              newer
            </a>
          )}{" "}
          {page < pages && (
            <a href="#" onClick={(e) => { e.preventDefault(); setPageNo(page + 1); }} style={{ textDecoration: "underline" }}>
              older
            </a>
          )}
        </p>
      )}
    </main>
  );
}
