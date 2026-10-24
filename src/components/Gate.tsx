"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, ClientApiError } from "@/lib/client-api";
import { homeFor } from "@/lib/auth-utils";
import { browserSupabase } from "@/lib/supabase-browser";
import { btnAccent, btnGlass, glassPanel } from "@/components/ui";
import type { Actor, Role, RiderInfo } from "@/lib/types";

export interface Me { actor: Actor; mode: string; rider: RiderInfo | null }
type State = { s: "loading" } | { s: "anon" } | { s: "denied"; me: Me } | { s: "ready"; me: Me } | { s: "error"; msg: string };

interface Props {
  allow: Role[]; title: string;
  /** Where "Sign in" goes for a signed-out visitor (e.g. /rider/login). */
  signInHref?: string;
  /** Extra action for a signed-in user with the wrong role (e.g. a student can apply to ride). */
  deniedAction?: { href: string; label: string };
  children: (me: Me) => ReactNode;
}

const AREA: Record<Role, string> = { student: "students", rider: "riders", admin: "administrators" };

// One shell for every signed-in screen: the same dark brand band as the homepage and sign-in pages,
// then the light content area. Loading, error, signed-out and wrong-role states all use it.
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="hero-bg on-dark flex min-h-[60vh] items-start px-4 py-10 text-white sm:py-16">
      <div className="mx-auto w-full max-w-md">{children}</div>
    </div>
  );
}

export default function Gate({ allow, title, signInHref = "/login", deniedAction, children }: Props) {
  const [st, setSt] = useState<State>({ s: "loading" });
  const allowKey = allow.join(","); // stable dependency: callers pass inline arrays
  const load = useCallback(async () => {
    setSt({ s: "loading" });
    try {
      const { mode } = await api<{ mode: string }>("/api/v1/mode");
      if (mode === "unconfigured") return setSt({ s: "error", msg: "Bab Ride is not configured on this server yet." });
      try {
        const me = await api<Me>("/api/v1/me");
        setSt(allowKey.split(",").includes(me.actor.role) ? { s: "ready", me } : { s: "denied", me });
      } catch (e) {
        if (e instanceof ClientApiError && e.status === 401) setSt({ s: "anon" });
        else throw e;
      }
    } catch (e) { setSt({ s: "error", msg: e instanceof Error ? e.message : "Could not load." }); }
  }, [allowKey]);
  useEffect(() => { void load(); }, [load]);

  async function signOut() {
    try { await browserSupabase()?.auth.signOut(); } catch { /* ignore: we leave the page either way */ }
    window.location.assign("/login");
  }

  if (st.s === "loading") return (
    <Shell><div className={glassPanel} role="status" aria-live="polite">
      <div className="skeleton h-5 w-40 rounded bg-white/20" /><div className="skeleton mt-3 h-4 w-56 rounded bg-white/10" />
      <span className="sr-only">Loading…</span>
    </div></Shell>
  );
  if (st.s === "error") return (
    <Shell><div className={glassPanel} role="alert">
      <h1 className="text-xl font-bold">Unavailable</h1><p className="mt-2 text-mist">{st.msg}</p>
      <button type="button" onClick={() => void load()} className={`${btnGlass} mt-4 w-full`}>Try again</button>
    </div></Shell>
  );
  if (st.s === "anon") return (
    <Shell><div className={glassPanel}>
      <h1 className="text-2xl font-bold">{title}</h1><p className="mt-2 text-mist">Please sign in to continue.</p>
      <Link href={signInHref} className={`${btnAccent} mt-5 w-full`}>Sign in</Link>
    </div></Shell>
  );
  if (st.s === "denied") {
    const r = st.me.actor.role;
    return (
      <Shell><div className={glassPanel} role="alert">
        <h1 className="text-2xl font-bold">This area isn't for your account</h1>
        <p className="mt-2 text-mist">You're signed in as <b className="text-white">{r}</b>. This page is for {allow.map((a) => AREA[a]).join(" or ")}.</p>
        <div className="mt-5 grid gap-2">
          <Link href={homeFor(r)} className={`${btnAccent} w-full`}>Go to my dashboard</Link>
          {deniedAction && <Link href={deniedAction.href} className={`${btnGlass} w-full`}>{deniedAction.label}</Link>}
          <button type="button" onClick={signOut} className={`${btnGlass} w-full`}>Sign out</button>
        </div>
      </div></Shell>
    );
  }
  return (
    <>
      <div className="hero-bg on-dark text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <p className="min-w-0 truncate text-sm text-mist">
            Signed in as <b className="text-white">{st.me.actor.name}</b>
            <span className="ml-2 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />{st.me.actor.role}
            </span>
          </p>
          <button type="button" onClick={signOut} className={`${btnGlass} !min-h-[40px] !px-4 !py-2 text-sm`}>Sign out</button>
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-4 pb-16">{children(st.me)}</div>
    </>
  );
}