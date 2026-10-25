"use client";
import { useEffect, useState } from "react";
import { browserSupabase } from "@/lib/supabase-browser";
import { callbackUrl, describeAuthError, flagOn } from "@/lib/auth-utils";
import { btnGlass } from "@/components/ui";

// Public on/off flag (not a secret). NEXT_PUBLIC_* values are fixed when the dev server / build STARTS, so after
// editing .env.local you must restart `npm run dev`. The property access must stay literal.
const GOOGLE_ON = flagOn(process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED);

export default function GoogleButton({ disabled, onError }: { disabled?: boolean; onError: (text: string) => void }) {
  const [going, setGoing] = useState(false);
  // Returning via the browser Back button restores this page from cache; clear the "redirecting" state.
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => { if (e.persisted) setGoing(false); };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  if (!GOOGLE_ON) {
    // Hidden in production. In development, say WHY so it is not mistaken for a bug.
    if (process.env.NODE_ENV !== "development") return null;
    return (
      <p className="rounded-xl border border-dashed border-white/25 p-3 text-xs text-mist">
        Dev note: the Google button is hidden because <code>NEXT_PUBLIC_AUTH_GOOGLE_ENABLED</code> is not <code>true</code> in <code>.env.local</code>. Set it, then restart <code>npm run dev</code>.
      </p>
    );
  }

  async function start() {
    const sb = browserSupabase();
    if (!sb || going) return;
    setGoing(true);
    // The return address is built from the CURRENT origin, so localhost stays on localhost and production on production.
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callbackUrl(window.location.origin) } });
    if (error) { setGoing(false); onError(describeAuthError(error)); }
    // On success the browser is redirected to Google.
  }

  return (
    <button type="button" className={`${btnGlass} w-full gap-3`} disabled={disabled || going} onClick={start}>
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><path fill="#fff" d="M21.35 11.1H12v2.98h5.35c-.5 2.4-2.55 3.5-5.35 3.5a5.9 5.9 0 1 1 3.9-10.3l2.1-2.1A8.9 8.9 0 1 0 12 20.9c5 0 8.6-3.5 8.6-8.5 0-.5-.1-.9-.25-1.3Z" /></svg>
      {going ? "Redirecting to Google…" : "Continue with Google"}
    </button>
  );
}
