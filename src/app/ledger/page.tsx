import { shortDate } from "@/components/format";
import { loadLedger } from "@/core/store";
import { DOMAIN_BY_ID } from "@/core/taxonomy";
import { DeleteButton } from "./DeleteButton";

export const dynamic = "force-dynamic";

const PAGE = 200;

export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ domain?: string; page?: string }> }) {
  const { domain, page } = await searchParams;
  const ledger = await loadLedger();
  const pageNo = Math.max(1, Number(page ?? 1) || 1);
  const all = [...ledger.events].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  const filtered = domain ? all.filter((e) => e.domains.some((d) => d.id === domain)) : all;
  const rows = filtered.slice((pageNo - 1) * PAGE, pageNo * PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));

  return (
    <main>
      <p className="dateline">The ledger</p>
      <h1>Every ask, filed.</h1>
      <p className="lede">
        {filtered.length.toLocaleString()} entries{domain ? ` in ${DOMAIN_BY_ID[domain as keyof typeof DOMAIN_BY_ID]?.label ?? domain}` : ""}. Excerpts are the first 140 characters; delete any row you would rather not keep.
      </p>
      <p className="small">
        Filter:{" "}
        <a href="/ledger" style={{ textDecoration: domain ? "none" : "underline" }}>
          all
        </a>
        {Object.values(DOMAIN_BY_ID)
          .filter((d) => d.id !== "attention")
          .map((d) => (
            <span key={d.id}>
              {" · "}
              <a href={`/ledger?domain=${d.id}`} style={{ textDecoration: domain === d.id ? "underline" : "none" }}>
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
                <DeleteButton id={e.id} />
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
          Page {pageNo} of {pages}.{" "}
          {pageNo > 1 && (
            <a href={`/ledger?${domain ? `domain=${domain}&` : ""}page=${pageNo - 1}`} style={{ textDecoration: "underline" }}>
              newer
            </a>
          )}{" "}
          {pageNo < pages && (
            <a href={`/ledger?${domain ? `domain=${domain}&` : ""}page=${pageNo + 1}`} style={{ textDecoration: "underline" }}>
              older
            </a>
          )}
        </p>
      )}
    </main>
  );
}
