"use client";

import { useEffect, useRef, useState } from "react";
import { prefetchFirebase } from "@/client/account";
import { useFallow } from "@/client/FallowProvider";
import { PetIcon } from "./garden/PlantIcon";

function ago(ms: number | null): string {
  if (!ms) return "not yet";
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

const STATUS_TEXT: Record<string, string> = {
  checking: "Checking…",
  "signing-in": "Signing in…",
  syncing: "Syncing…",
  synced: "Synced",
  offline: "Offline, will sync",
  error: "Sync trouble",
};

/** Initial in a circle when there is no photo (or it fails to load). */
function Avatar({ name, photo, size = 26 }: { name: string | null; photo: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const letter = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
  if (photo && !broken) return <img className="avatar" src={photo} alt="" width={size} height={size} referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
  return (
    <span className="avatar avatar-letter" style={{ width: size, height: size }} aria-hidden="true">
      {letter}
    </span>
  );
}

/** The header's account control: "Sign in" when signed out, an avatar with sync status when in. */
export function AccountChip() {
  const { account, signIn, signOut, syncNow } = useFallow();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!account.available) return null;

  if (!account.user) {
    const busy = account.status === "signing-in" || account.status === "checking";
    return (
      <button className="account-signin" onClick={() => void signIn()} onMouseEnter={prefetchFirebase} onFocus={prefetchFirebase} disabled={busy}>
        {busy ? STATUS_TEXT[account.status] : "Sign in"}
      </button>
    );
  }

  const u = account.user;
  return (
    <div className="account" ref={wrap}>
      <button className={`account-chip status-${account.status}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" aria-label={`Signed in as ${u.name ?? u.email ?? "you"}. ${STATUS_TEXT[account.status] ?? ""}`}>
        <Avatar name={u.name} photo={u.photo} />
        <span className={`sync-dot sync-${account.status}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="account-menu" role="menu">
          <div className="account-who">
            <Avatar name={u.name} photo={u.photo} size={36} />
            <div>
              <b>{u.name ?? "Signed in"}</b>
              {u.email && <span className="account-email">{u.email}</span>}
            </div>
          </div>
          <p className="account-state">
            <span className={`sync-dot sync-${account.status}`} aria-hidden="true" />
            {account.status === "synced" ? `Synced ${ago(account.lastSync)}` : STATUS_TEXT[account.status]}
          </p>
          {account.error && <p className="account-error">{account.error}</p>}
          <div className="account-actions">
            <button role="menuitem" className="btn ghost small" onClick={() => void syncNow()} disabled={account.status === "syncing"}>
              Sync now
            </button>
            <button
              role="menuitem"
              className="btn ghost small"
              onClick={() => {
                setOpen(false);
                void signOut();
              }}
            >
              Sign out
            </button>
          </div>
          <p className="fine">Signing out takes your garden off this device. It stays safe in your account.</p>
        </div>
      )}
    </div>
  );
}

/** The friendly prompt after "Start my garden": keep it on every device. */
export function SignInCard({ onClose }: { onClose: () => void }) {
  const { account, signIn } = useFallow();
  useEffect(() => prefetchFirebase(), []);
  useEffect(() => {
    if (account.user) onClose();
  }, [account.user, onClose]);
  if (!account.available || account.user) return null;
  const busy = account.status === "signing-in";
  return (
    <div className="signin-card" role="dialog" aria-label="Keep your garden on every device">
      <div className="signin-pet" aria-hidden="true">
        <PetIcon stage="thriving" scale={3} />
      </div>
      <div className="signin-body">
        <h3>Your garden is planted!</h3>
        <p>Sign in with Google to keep it on every device. What you type stays on this device; only plant data syncs.</p>
        {account.error && <p className="account-error">{account.error}</p>}
        <div className="row">
          <button className="btn" onClick={() => void signIn()} disabled={busy}>
            {busy ? "Signing in…" : "Sign in with Google"}
          </button>
          <button className="btn ghost" onClick={onClose}>
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
