"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Brand from "@/components/Brand";
import { api } from "@/lib/client-api";
import { navFor, showsBookCta, type AuthView } from "@/lib/nav";
import { signOutEverywhere } from "@/lib/sign-out";
import { browserSupabase } from "@/lib/supabase-browser";
import type { Actor, RiderInfo } from "@/lib/types";

interface Session { view: AuthView; actor: Actor | null; rider: RiderInfo | null }
const LOADING: Session = { view: { s: "loading" }, actor: null, rider: null };

/**
 * The first render (server and client) is always "loading" with NO menu, so there is no hydration mismatch and no flash of the
 * wrong navigation. The session is then read from OUR server (/api/v1/me), which is where the role really comes from.
 * Hiding links is a convenience only: every page and API route re-checks the role.
 */
function useSession(): Session {
  const [s, setS] = useState<Session>(LOADING);
  const load = useCallback(async () => {
    try {
      const me = await api<{ actor: Actor; rider: RiderInfo | null }>("/api/v1/me");
      setS({ view: { s: "auth", role: me.actor.role, name: me.actor.name }, actor: me.actor, rider: me.rider });
    } catch { setS({ view: { s: "anon" }, actor: null, rider: null }); }
  }, []);
  useEffect(() => {
    void load();
    const sub = browserSupabase()?.auth.onAuthStateChange(() => { void load(); });
    return () => sub?.data.subscription.unsubscribe();
  }, [load]);
  return s;
}

export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const path = usePathname();
  const { view, actor, rider } = useSession();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  const links = navFor(view);
  const authed = view.s === "auth";
  const bookHref = view.s === "anon" ? "/#book" : "/student";
  const item = "rounded-lg px-3 py-2 text-sm font-medium text-mist transition hover:bg-white/10 hover:text-white";
  const cta = "inline-flex min-h-[40px] items-center rounded-xl bg-royal px-4 text-sm font-semibold text-white transition hover:bg-[#1d4fc7] active:scale-[.98]";
  const ghost = "inline-flex min-h-[40px] items-center rounded-xl border border-white/20 px-4 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-50";
  async function out() { if (leaving) return; setLeaving(true); await signOutEverywhere(actor?.role); }

  const status = authed && view.role === "rider" && rider && (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white" role="status">
      <span className={`h-2 w-2 rounded-full ${rider.online ? "bg-accent" : "bg-white/40"}`} aria-hidden="true" />{rider.online ? "Online" : "Offline"}
    </span>);

  return (
    <header className="on-dark glass-nav sticky top-0 z-30">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4">
        <Brand />
        {view.s !== "loading" && (
          <>
            <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
              {links.map((l) => <Link key={l.href} href={l.href} className={item}>{l.label}</Link>)}
              {showsBookCta(view) && <Link href={bookHref} className={`${cta} ml-2`}>Book a Ride</Link>}
              {authed && (
                <span className="ml-2 flex items-center gap-2">
                  {status}
                  <span className="max-w-[10rem] truncate text-sm text-mist" title={view.name}>{view.name}</span>
                  <button type="button" onClick={out} disabled={leaving} className={ghost}>{leaving ? "Signing out…" : "Sign out"}</button>
                </span>)}
            </nav>
            <div className="flex items-center gap-2 lg:hidden">
              {showsBookCta(view) && <Link href={bookHref} className={cta}>Book</Link>}
              {authed && status}
              <button type="button" aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? "Close menu" : "Open menu"}
                onClick={() => setOpen(!open)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 text-white hover:bg-white/10">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
                </svg>
              </button>
            </div>
          </>)}
      </div>
      {open && view.s !== "loading" && (
        <nav id="mobile-nav" aria-label="Mobile" className="rise border-t border-white/10 px-4 pb-3 pt-2 lg:hidden">
          <ul className="grid">
            {links.map((l) => <li key={l.href}><Link href={l.href} className="block rounded-lg px-3 py-3 text-base font-medium text-white hover:bg-white/10">{l.label}</Link></li>)}
            {authed && <li className="mt-1 border-t border-white/10 pt-2">
              <p className="px-3 py-1 text-sm text-mist">Signed in as <b className="text-white">{view.name}</b></p>
              <button type="button" onClick={out} disabled={leaving} className="block w-full rounded-lg px-3 py-3 text-left text-base font-semibold text-white hover:bg-white/10 disabled:opacity-50">{leaving ? "Signing out…" : "Sign out"}</button>
            </li>}
          </ul>
        </nav>
      )}
    </header>
  );
}
