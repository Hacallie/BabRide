"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client-api";
import { NEXT_KEY, describeSessionProblem, destinationFor, safeNext } from "@/lib/auth-utils";
import { browserSupabase } from "@/lib/supabase-browser";
import { startRiderSession } from "@/lib/client-session";
import type { Me } from "@/components/Gate";
import { btnAccent, glassPanel } from "@/components/ui";

// Landing page for Google sign-in and email-confirmation links. Exchanges the one-time ?code= for a session,
// loads the user's role from OUR server (never from the URL), then opens the right page.
export default function AuthCallback() {
  const router = useRouter();
  const started = useRef(false); // React strict mode runs effects twice; a code can only be exchanged once
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();

    function toLogin(key: string) { router.replace(`/login?e=${key}`); }

    async function run() {
      const sb = browserSupabase();
      if (!sb) return toLogin("config");
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const err = url.searchParams.get("error") ?? hash.get("error");
      const errCode = url.searchParams.get("error_code") ?? hash.get("error_code");
      if (err) return toLogin(errCode === "otp_expired" ? "expired" : err === "access_denied" ? "cancelled" : "failed");

      const code = url.searchParams.get("code");
      if (code) {
        const { error } = await sb.auth.exchangeCodeForSession(code);
        window.history.replaceState(null, "", url.pathname); // drop the used code from the address bar
        if (error) return toLogin(/code verifier|verifier/i.test(error.message) ? "wrongbrowser" : /expired|invalid/i.test(error.message) ? "expired" : "failed");
      } else {
        const { data } = await sb.auth.getSession(); // e.g. page refreshed after a successful exchange
        if (!data.session) return toLogin("failed");
      }

      let next: string | null = null;
      try { next = safeNext(sessionStorage.getItem(NEXT_KEY)); sessionStorage.removeItem(NEXT_KEY); } catch { /* storage unavailable */ }
      try {
        const me = await api<Me>("/api/v1/me");
        if (me.actor.role === "rider" && code) await startRiderSession(); // a real sign-in (Google / email link), not a page refresh
        router.replace(destinationFor(me.actor.role, next));
      } catch (e) {
        setProblem(describeSessionProblem(e));
      }
    }
  }, [router]);

  if (problem) {
    return (
      <div className={`${glassPanel} mx-auto max-w-md`} role="alert">
        <h1 className="text-xl font-bold">We couldn't finish signing you in</h1>
        <p className="mt-2 text-mist">{problem}</p>
        <Link href="/login" className={`${btnAccent} mt-4 w-full`}>Back to sign in</Link>
      </div>
    );
  }
  return (
    <div className={`${glassPanel} mx-auto max-w-md text-center`} role="status" aria-live="polite">
      <p className="font-semibold">Signing you in…</p>
      <p className="mt-1 text-sm text-mist">This only takes a moment.</p>
    </div>
  );
}
