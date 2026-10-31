"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Brand from "@/components/Brand";
import { api, ClientApiError } from "@/lib/client-api";
import { RIDER_STATUS_EVENT, signOutAndLeave } from "@/lib/client-session";
import { PUBLIC_LINKS, authLinks, availabilityOf, homeLink } from "@/lib/nav";
import { browserSupabase } from "@/lib/supabase-browser";
import type { Actor, RiderInfo } from "@/lib/types";

type Me = { actor: Actor; rider: RiderInfo | null };
/**
 * loading: session not resolved yet. The server HTML and the first browser render are IDENTICAL for everyone (brand + placeholders),
 * so there is no hydration mismatch and neither navigation is flashed to the wrong person.
 * The role always comes from OUR server (/api/v1/me); the browser session alone is never trusted to pick a menu.
 */
type NavState = { s: "loading" } | { s: "anon" } | { s: "auth"; me: Me } | { s: "error" };

export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [nav, setNav] = useState<NavState>({ s: "loading" });
  const [leaving, setLeaving] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  const resolve = useCallback(async (silent: boolean) => {
    const sb = browserSupabase();
    if (!sb) return setNav({ s: "anon" });
    try {
      const { data } = await sb.auth.getSession();
      if (!data.session) return setNav({ s: "anon" });
      if (!silent) setNav((cur) => (cur.s === "auth" ? cur : { s: "loading" }));
      const me = await api<Me>("/api/v1/me");
      setNav({ s: "auth", me });
    } catch (e) {
      if (e instanceof ClientApiError && e.status === 401) setNav({ s: "anon" });
      else setNav((cur) => (cur.s === "auth" ? cur : { s: "error" }));
    }
  }, []);

  useEffect(() => {
    void resolve(false); // first load, refresh, direct navigation and session restoration all end up here
    const sb = browserSupabase();
    const sub = sb?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setNav({ s: "anon" });
      else if (event === "SIGNED_IN" || event === "USER_UPDATED") setTimeout(() => void resolve(true), 0); // not inside the callback: avoids a client deadlock
    });
    const onStatus = (e: Event) => setNav((cur) => cur.s === "auth" && cur.me.rider
      ? { s: "auth", me: { ...cur.me, rider: { ...cur.me.rider, online: !!(e as CustomEvent<boolean>).detail } } } : cur);
    window.addEventListener(RIDER_STATUS_EVENT, onStatus);
    return () => { sub?.data.subscription.unsubscribe(); window.removeEventListener(RIDER_STATUS_EVENT, onStatus); };
  }, [resolve]);

  const role = nav.s === "auth" ? nav.me.actor.role : null;
  const links = nav.s === "anon" ? PUBLIC_LINKS : role ? authLinks(role) : [];
  const availability = nav.s === "auth" ? availabilityOf(nav.me.rider) : null;

  async function signOut() { if (leaving) return; setLeaving(true); await signOutAndLeave(role === "rider"); }

  const item = "rounded-lg px-3 py-2 text-sm font-medium text-mist transition hover:bg-white/10 hover:text-white";
  const cta = "inline-flex min-h-[40px] items-center rounded-xl bg-royal px-4 text-sm font-semibold text-white transition hover:bg-[#1d4fc7] active:scale-[.98]";
  const pill = availability && (
    <Link href="/rider" aria-label={`Availability: ${availability}. Open rider dashboard`} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-white">
      <span className={`h-2 w-2 rounded-full ${availability === "online" ? "bg-emerald-400" : "bg-mist"}`} aria-hidden="true" />{availability === "online" ? "Online" : "Offline"}
    </Link>);
  const signOutBtn = nav.s === "auth" || nav.s === "error"
    ? <button type="button" onClick={signOut} disabled={leaving} className="rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50">{leaving ? "Signing out…" : "Sign Out"}</button> : null;
  const bookHref = role === "student" ? "/student" : "/#book";

  return (
    <header className="on-dark glass-nav sticky top-0 z-30">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Brand href={homeLink(role)} />
        <nav aria-label="Main" className="hidden min-h-[40px] items-center gap-1 lg:flex">
          {nav.s === "loading" && <span aria-hidden="true" className="flex gap-2">{[0, 1, 2].map((i) => <span key={i} className="skeleton h-5 w-20 rounded bg-white/10" />)}</span>}
          {links.map((l) => <Link key={l.href} href={l.href} className={item}>{l.label}</Link>)}
          {nav.s === "anon" && <Link href="/#book" className={`${cta} ml-2`}>Book a Ride</Link>}
          {nav.s === "auth" && <>{pill}<span className="ml-2 hidden max-w-[10rem] truncate text-sm text-mist xl:inline" title={nav.me.actor.name}>{nav.me.actor.name}</span></>}
          {signOutBtn && <span className="ml-1">{signOutBtn}</span>}
        </nav>
        <div className="flex items-center gap-2 lg:hidden">
          {nav.s === "anon" && <Link href={bookHref} className={cta}>Book</Link>}
          {nav.s === "auth" && pill}
          <button type="button" aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen(!open)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 text-white hover:bg-white/10">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="rise border-t border-white/10 px-4 pb-3 pt-2 lg:hidden">
          <ul className="grid">
            {links.map((l) => <li key={l.href}><Link href={l.href} className="block rounded-lg px-3 py-3 text-base font-medium text-white hover:bg-white/10">{l.label}</Link></li>)}
            {nav.s === "auth" && <li className="px-3 py-2 text-sm text-mist">Signed in as <b className="text-white">{nav.me.actor.name}</b> ({nav.me.actor.role})</li>}
            {signOutBtn && <li className="px-1 pt-1">{signOutBtn}</li>}
          </ul>
        </nav>
      )}
    </header>
  );
}
