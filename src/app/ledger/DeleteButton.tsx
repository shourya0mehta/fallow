"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="secondary"
      style={{ padding: "4px 8px", fontSize: 11 }}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch(`/api/events/${id}`, { method: "DELETE" });
        router.refresh();
        setBusy(false);
      }}
      aria-label="Delete this entry"
    >
      ×
    </button>
  );
}
