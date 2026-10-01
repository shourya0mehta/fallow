"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: Array<[string, string]> = [
  ["/", "Field"],
  ["/gate", "Gate"],
  ["/practice", "Practice"],
  ["/ledger", "Ledger"],
  ["/day", "Day"],
  ["/import", "Import"],
  ["/settings", "Settings"],
  ["/about", "About"],
  ["/evidence", "Evidence"],
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Sections">
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
