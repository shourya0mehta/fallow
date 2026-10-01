"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Old pages moved; keep their links working. */
export function Redirect({ to, label }: { to: string; label: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return (
    <p className="notice">
      This page moved to <Link href={to}>{label}</Link>.
    </p>
  );
}
