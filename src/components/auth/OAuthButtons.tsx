"use client";
import { useEffect, useState } from "react";
import { browserSupabase } from "@/lib/supabase-browser";
import { callbackUrl, describeAuthError, flagOn } from "@/lib/auth-utils";
import { btnGlass } from "@/components/ui";

// Public on/off flags (not secrets). NEXT_PUBLIC_* values are fixed when the dev server / build STARTS,
// so after editing .env.local you must restart `npm run dev`. The property access must stay literal.
const GOOGLE_ON = flagOn(process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED);
const APPLE_ON = flagOn(process.env.NEXT_PUBLIC_AUTH_APPLE_ENABLED);
const PROVIDERS = [
  { id: "google" as const, label: "Continue with Google", on: GOOGLE_ON },
  { id: "apple" as const, label: "Continue with Apple", on: APPLE_ON },
].filter((p) => p.on);

export default function OAuthButtons({ disabled, onError }: { disabled?: boolean; onError: (text: string) => void }) {
  const [going, setGoing] = useState<string | null>(null);
  // Returning via the browser Back button restores this page from cache; clear the "redirecting" state.
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => { if (e.persisted) setGoing(null); };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  if (PROVIDERS.length === 0) {
    // Hidden in production. In development, say WHY so it is not mistaken for a bug.
    if (process.env.NODE_ENV !== "development") return null;
    return (
      <p className="mt-6 rounded-xl border border-dashed border-white/25 p-3 text-xs text-mist">
        Dev note: Google/Apple buttons are hidden because <code>NEXT_PUBLIC_AUTH_GOOGLE_ENABLED</code> is not <code>true</code> in <code>.env.local</code>. Set it, then restart <code>npm run dev</code>.
      </p>
    );
  }

  async function start(provider: "google" | "apple") {
    const sb = browserSupabase();
    if (!sb || going) return;
    setGoing(provider);
    const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: callbackUrl(window.location.origin) } });
    if (error) { setGoing(null); onError(describeAuthError(error)); }
    // On success the browser is redirected to the provider.
  }

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 text-sm text-mist" aria-hidden="true">
        <span className="h-px flex-1 bg-white/15" />or<span className="h-px flex-1 bg-white/15" />
      </div>
      <div className="mt-4 grid gap-3">
        {PROVIDERS.map((p) => (
          <button key={p.id} type="button" className={`${btnGlass} w-full`} disabled={disabled || !!going} onClick={() => start(p.id)}>
            {going === p.id ? "Redirecting…" : p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
