import type { PauseSummary, Snapshot } from "@/core/summary";

/**
 * Today's fragmentation and screen numbers. Behavior, not damage: switches per
 * active hour, the longest unbroken block, minutes on the sites the person
 * listed against their own budget, and how the pause went.
 */
export function AttentionStrip({ attention, pause, showTop = false }: { attention: Snapshot["attention"]; pause: PauseSummary; showTop?: boolean }) {
  const today = attention.today;
  const over = today ? today.entertainmentMin > attention.budgetMin : false;
  return (
    <div>
      <div className="strip" style={{ marginTop: 0 }}>
        <div>
          <div className="label">Switches per hour</div>
          <div className="big num">{today ? today.switchesPerHour.toFixed(1) : "–"}</div>
          <div className="small">{today ? `${today.activeMin} active min` : "no ActivityWatch data"}</div>
        </div>
        <div>
          <div className="label">Longest block</div>
          <div className="big num">{today ? `${today.longestBlockMin}m` : "–"}</div>
          <div className="small">unbroken, one activity</div>
        </div>
        <div>
          <div className="label">Listed sites</div>
          <div className="big num" style={over ? { color: "var(--rust)" } : undefined}>
            {today ? `${today.entertainmentMin}/${attention.budgetMin}m` : `–/${attention.budgetMin}m`}
          </div>
          <div className="small">{over ? "over your budget" : "of your budget"}</div>
        </div>
        <div>
          <div className="label">Pauses today</div>
          <div className="big num">
            {pause.todayOpens}
            {pause.todayOpens > 0 && <span className="small" style={{ marginLeft: 6 }}>{pause.todayClosed} closed</span>}
          </div>
          <div className="small">{pause.closeRate7d === null ? "no pauses this week" : `${Math.round(pause.closeRate7d * 100)}% closed over 7 days`}</div>
        </div>
      </div>
      {!today && (
        <p className="small" style={{ marginTop: 10 }}>
          Install <a href="https://activitywatch.net" style={{ textDecoration: "underline" }}>ActivityWatch</a> and run <code>npm run attention</code> to fill this in. Focus blocks of 25 minutes or more are logged as sustained-attention practice.
        </p>
      )}
      {showTop && today && today.top.length > 0 && (
        <table className="ledger" style={{ marginTop: 14, maxWidth: 520 }}>
          <thead>
            <tr>
              <th>Where the day went</th>
              <th>Minutes</th>
            </tr>
          </thead>
          <tbody>
            {today.top.map((t) => (
              <tr key={t.name}>
                <td>{t.name}</td>
                <td className="num">{t.minutes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showTop && attention.week.length > 1 && (
        <p className="small" style={{ marginTop: 10 }}>
          Last {attention.week.length} days: longest blocks {attention.week.map((d) => `${d.longestBlockMin}m`).join(", ")}; listed-site minutes {attention.week.map((d) => d.entertainmentMin).join(", ")}.
        </p>
      )}
    </div>
  );
}
