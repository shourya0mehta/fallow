"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useFallow } from "@/client/FallowProvider";
import { timeOfDay } from "@/pixel/scene";
import { AccountChip } from "./Account";
import { PetIcon } from "./garden/PlantIcon";

const LINKS: Array<[string, string]> = [
  ["/", "Garden"],
  ["/journal", "Journal"],
  ["/settings", "Settings"],
  ["/how", "How it works"],
];

export function Header() {
  const path = usePathname() || "/";
  const { mode, demo, ready } = useFallow();
  const here = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  useEffect(() => {
    const set = () => {
      try {
        const forced = window.localStorage.getItem("fallow.sky");
        document.documentElement.dataset.tod = forced || timeOfDay(new Date());
      } catch {
        document.documentElement.dataset.tod = timeOfDay(new Date());
      }
    };
    set();
    const id = setInterval(set, 5 * 60_000);
    window.addEventListener("fallow:sky", set);
    return () => {
      clearInterval(id);
      window.removeEventListener("fallow:sky", set);
    };
  }, []);

  return (
    <header className="top">
      <Link href="/" className="brand" aria-label="Fallow, home">
        <PetIcon scale={2} />
        <span>Fallow</span>
      </Link>
      <nav aria-label="Sections">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className={here(href) ? "on" : undefined} aria-current={here(href) ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="top-right">
        <div className="live" aria-live="polite">
          {ready && (
            <>
              <span className="live-dot status-fresh" />
              {mode === "server" ? "Live · local app" : demo ? "Live · demo garden" : "Live · your garden"}
            </>
          )}
        </div>
        <AccountChip />
      </div>
    </header>
  );
}
