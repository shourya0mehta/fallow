"use client";

import { useMemo, useState } from "react";
import { Loading, useFallow } from "@/client/FallowProvider";
import { shortDate } from "@/components/format";
import { SOURCE_LABEL } from "@/components/garden/names";
import { PlantIcon } from "@/components/garden/PlantIcon";
import { ImportCard } from "@/components/journal/ImportCard";
import { DOMAINS, DOMAIN_BY_ID } from "@/core/taxonomy";
import type { DomainId } from "@/core/types";

const PAGE = 60;
const WHO: Record<string, { label: string; cls: string }> = {
  ai: { label: "AI did it", cls: "chip-ai" },
  shared: { label: "Shared", cls: "chip-shared" },
  self: { label: "You did it", cls: "chip-self" },
};

export default function JournalPage() {
  const { ready, ledger, client, refresh } = useFallow();
  const [domain, setDomain] = useState<DomainId | null>(null);
  const [who, setWho] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [busyId, setBusyId] = useState<string | null>(null);

  const all = useMemo(() => (ledger ? [...ledger.events].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)) : []), [ledger]);
  const counts = useMemo(() => {
    const m = new Map<DomainId, number>();
    for (const e of all) for (const d of e.domains) m.set(d.id, (m.get(d.id) ?? 0) + 1);
    return m;
  }, [all]);

  if (!ready || !ledger) return <Loading what="the journal" />;

  const filtered = all.filter((e) => (!domain || e.domains.some((d) => d.id === domain)) && (!who || e.actor === who));
  const rows = filtered.slice(0, limit);

  async function remove(id: string) {
    if (!client) return;
    setBusyId(id);
    await client.deleteEvent(id);
    await refresh();
    setBusyId(null);
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Journal</h1>
        <p>Every ask, filed under the plant it waters (or doesn&apos;t). Delete anything you&apos;d rather not keep.</p>
      </div>

      <ImportCard />

      <section className="card">
        <div className="journal-filters">
          <div className="chips" role="group" aria-label="Filter by plant">
            <button className={`chip ${domain === null ? "on" : ""}`} onClick={() => setDomain(null)}>
              All {all.length.toLocaleString()}
            </button>
            {DOMAINS.filter((d) => counts.get(d.id)).map((d) => (
              <button key={d.id} className={`chip plant-chip ${domain === d.id ? "on" : ""}`} onClick={() => setDomain(domain === d.id ? null : d.id)} title={d.label}>
                <PlantIcon id={d.id} status="fresh" scale={1} />
                {d.label.split(" ")[0]} <span className="count">{counts.get(d.id)}</span>
              </button>
            ))}
          </div>
          <div className="chips" role="group" aria-label="Filter by who did it">
            {Object.entries(WHO).map(([k, v]) => (
              <button key={k} className={`chip ${who === k ? "on" : ""}`} onClick={() => setWho(who === k ? null : k)}>
                {v.label}
              </button>
            ))}
          </div>
        </div>

        <ul className="entries">
          {rows.map((e) => {
            const top = e.domains[0]?.id;
            return (
              <li key={e.id} className="entry">
                {top && <PlantIcon id={top} status="fresh" scale={1} />}
                <div className="entry-main">
                  <p className="entry-text">{e.excerpt ?? <span className="fine">(text not kept here)</span>}</p>
                  <p className="entry-meta">
                    <span className="num">{shortDate(e.ts)}</span>
                    {e.domains.map((d) => (
                      <span key={d.id}>{DOMAIN_BY_ID[d.id].label}</span>
                    ))}
                    {e.minutes ? <span>{e.minutes} min</span> : null}
                    <span className="src">{SOURCE_LABEL[e.source] ?? e.source}</span>
                  </p>
                </div>
                <span className={`tag-chip ${WHO[e.actor]?.cls ?? ""}`}>{WHO[e.actor]?.label ?? e.actor}</span>
                <button className="entry-x" disabled={busyId === e.id} onClick={() => remove(e.id)} aria-label="Delete this entry">
                  ×
                </button>
              </li>
            );
          })}
          {rows.length === 0 && <li className="empty">Nothing here yet.</li>}
        </ul>
        {filtered.length > rows.length && (
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="btn ghost" onClick={() => setLimit((l) => l + PAGE)}>
              Show more ({(filtered.length - rows.length).toLocaleString()} left)
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
