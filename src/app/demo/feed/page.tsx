/**
 * A stand-in "entertainment" page. Add localhost to your entertainment sites in
 * Settings to see the pause overlay here without leaving the app.
 */
export default function DemoFeedPage() {
  const items = Array.from({ length: 12 }, (_, i) => i + 1);
  return (
    <div className="page">
      <div className="page-head">
        <h1>Demo feed</h1>
        <p>If this site is on your list in Settings, the extension pauses you for a breath before you get here. Otherwise it&apos;s just placeholders.</p>
      </div>
      {items.map((i) => (
        <div key={i} className="card feed-item">
          clip {i}
        </div>
      ))}
    </div>
  );
}
