/**
 * A stand-in "entertainment" page. Add localhost to your entertainment sites in
 * Settings to see the pause overlay here without leaving the app.
 */
export default function DemoFeedPage() {
  const items = Array.from({ length: 12 }, (_, i) => i + 1);
  return (
    <main>
      <p className="dateline">Demo · an endless feed</p>
      <h1>Something to scroll.</h1>
      <p className="lede">If this hostname is on your entertainment list, the extension shows its pause before you get here. Otherwise this is just a page of placeholders.</p>
      {items.map((i) => (
        <div key={i} style={{ border: "1px solid var(--rule)", background: "var(--paper-2)", height: 160, marginBottom: 14, display: "grid", placeItems: "center", color: "var(--ink-3)" }}>
          clip {i}
        </div>
      ))}
    </main>
  );
}
