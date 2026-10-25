"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import GoogleButton from "@/components/auth/OAuthButtons";
import type { Me } from "@/components/Gate";
import { btnAccent, btnGlass, glassInput, glassLabel, glassPanel } from "@/components/ui";
import { api } from "@/lib/client-api";
import {
  LOGIN_ERROR_TEXT, NEXT_KEY, callbackUrl, describeAuthError, describeSessionProblem, destinationFor,
  nameProblem, normalizeEmail, passwordProblem, safeNext,
} from "@/lib/auth-utils";
import { browserSupabase } from "@/lib/supabase-browser";
import type { Role } from "@/lib/types";

type View = "signin" | "signup";
type Notice = { kind: "error" | "info"; text: string } | null;

interface Props {
  /** Which form opens first. Sign-in and sign-up are separate views; the user switches with a plain link. */
  initialView?: View;
  /** When both are set, the switch link navigates to those pages (e.g. /login and /signup) instead of swapping in place. */
  switchHrefs?: { signin: string; signup: string };
  /** Overrides the default per-view heading. */
  heading?: string;
  as?: "h1" | "h2";
  intro?: ReactNode;
  /** Page to open after sign-in (checked against an allow-list). Falls back to ?next= and then the role's home page. */
  next?: string | null;
  nextByRole?: Partial<Record<Role, string>>;
  accountNote?: ReactNode;
  /** When set, called after a successful sign-in instead of redirecting (pages that continue in place). */
  onSignedIn?: () => void;
  footer?: ReactNode;
}

function PasswordField({ id, value, onChange, autoComplete, describedBy }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; describedBy?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input id={id} type={shown ? "text" : "password"} required minLength={8} maxLength={72} autoComplete={autoComplete} aria-describedby={describedBy}
        className={`${glassInput} pr-20`} value={value} onChange={(e) => onChange(e.target.value)} />
      <button type="button" onClick={() => setShown(!shown)} aria-pressed={shown} aria-controls={id}
        className="absolute right-1.5 top-1/2 min-h-[40px] -translate-y-1/2 rounded-lg px-3 text-sm font-semibold text-mist hover:bg-white/10 hover:text-white">{shown ? "Hide" : "Show"}</button>
    </div>
  );
}

export default function AuthPanel({ initialView = "signin", switchHrefs, heading, as: Heading = "h1", intro, next: nextProp, nextByRole, accountNote, onSignedIn, footer }: Props) {
  const router = useRouter();
  const sb = browserSupabase();
  const next = useRef<string | null>(null);
  const submitting = useRef(false); // synchronous guard: two quick taps can never send two requests
  const [view, setView] = useState<View>(initialView);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [fieldErr, setFieldErr] = useState<Partial<Record<"name" | "email" | "password", string>>>({});
  const [existing, setExisting] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    next.current = safeNext(nextProp) ?? safeNext(q.get("next"));
    try { if (next.current) sessionStorage.setItem(NEXT_KEY, next.current); } catch { /* storage unavailable */ }
    const e = q.get("e");
    if (e && LOGIN_ERROR_TEXT[e]) setNotice({ kind: "error", text: LOGIN_ERROR_TEXT[e] });
    sb?.auth.getSession().then(({ data }) => { if (data.session) setExisting(data.session.user.email ?? "your account"); });
  }, [sb, nextProp]);

  // After any successful sign-in: ask OUR server who this is (the role comes from the database), then continue.
  // If that call fails we say so; we never show a "success" state on the strength of the browser session alone.
  const finish = useCallback(async () => {
    try {
      const me = await api<Me>("/api/v1/me");
      let dest = next.current;
      try { dest = safeNext(sessionStorage.getItem(NEXT_KEY)) ?? dest; sessionStorage.removeItem(NEXT_KEY); } catch { /* ignore */ }
      if (onSignedIn) { submitting.current = false; setBusy(false); onSignedIn(); return; }
      router.replace(destinationFor(me.actor.role, nextByRole?.[me.actor.role] ?? dest));
    } catch (e) {
      submitting.current = false; setBusy(false);
      setNotice({ kind: "error", text: describeSessionProblem(e) });
    }
  }, [router, onSignedIn, nextByRole]);

  function switchView(v: View) { setView(v); setNotice(null); setFieldErr({}); setPassword(""); }
  const done = () => { submitting.current = false; setBusy(false); };

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!sb || submitting.current) return;
    const signup = view === "signup";
    const em = normalizeEmail(email);
    const errs: typeof fieldErr = {};
    if (signup && nameProblem(name)) errs.name = nameProblem(name)!;
    if (!em) errs.email = "Enter a valid email address.";
    if (signup) { const p = passwordProblem(password); if (p) errs.password = p; } else if (!password) errs.password = "Enter your password.";
    setFieldErr(errs); setNotice(null);
    if (Object.keys(errs).length) return;

    submitting.current = true; setBusy(true);
    try {
      if (signup) {
        const res = await sb.auth.signUp({ email: em!, password, options: { data: { full_name: name.trim() }, emailRedirectTo: callbackUrl(window.location.origin) } });
        if (res.error) { done(); return setNotice({ kind: "error", text: describeAuthError(res.error) }); }
        // Supabase hides "already registered" by returning a user with no identities. Say so instead of looking stuck.
        if (res.data.user && (res.data.user.identities?.length ?? 1) === 0) { done(); return setNotice({ kind: "error", text: describeAuthError({ code: "user_already_exists" }) }); }
        if (!res.data.session) { done(); return setNotice({ kind: "info", text: `Almost done. We sent a confirmation link to ${em}. Open it, then come back and sign in. Check spam too.` }); }
      } else {
        const res = await sb.auth.signInWithPassword({ email: em!, password });
        if (res.error) { done(); return setNotice({ kind: "error", text: describeAuthError(res.error) }); }
      }
      await finish();
    } catch (e) { done(); setNotice({ kind: "error", text: describeAuthError(e) }); }
  }

  if (!sb) return (
    <section className={glassPanel}>
      <Heading className="text-2xl font-bold">{heading ?? "Sign in"}</Heading>
      <p role="alert" className="mt-3 rounded-lg bg-red-500/15 p-3 text-sm text-red-100">Sign-in is unavailable because this server's Supabase configuration is missing or invalid. See the setup instructions in the README.</p>
    </section>
  );

  const signup = view === "signup";
  const title = heading ?? (signup ? "Create your Bab Ride account" : "Sign in to Bab Ride");
  const alert = notice && (
    <p role={notice.kind === "error" ? "alert" : "status"} className={`rounded-lg p-3 text-sm ${notice.kind === "error" ? "bg-red-500/15 text-red-100" : "bg-white/10 text-mist"}`}>{notice.text}</p>
  );
  const err = (k: "name" | "email" | "password") => fieldErr[k] && <p id={`err-${k}`} role="alert" className="mt-1 text-sm text-red-200">{fieldErr[k]}</p>;
  const switchLink = "font-semibold text-white underline underline-offset-2";

  return (
    <section className={glassPanel} aria-labelledby="auth-h">
      <Heading id="auth-h" className="text-2xl font-bold">{title}</Heading>
      {intro && <div className="mt-1 text-sm text-mist">{intro}</div>}

      {existing && (
        <div className="mt-4 rounded-xl border border-white/15 bg-white/5 p-4" role="status">
          <p className="text-sm text-mist">You're already signed in as <b className="text-white">{existing}</b>.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className={btnAccent} disabled={busy} onClick={() => { submitting.current = true; setBusy(true); void finish(); }}>Continue</button>
            <button type="button" className={btnGlass} onClick={async () => { await sb.auth.signOut(); setExisting(null); }}>Sign out</button>
          </div>
        </div>
      )}

      <div className="mt-5 space-y-3">
        <GoogleButton disabled={busy} onError={(text) => setNotice({ kind: "error", text })} />
        <div className="flex items-center gap-3 text-sm text-mist" aria-hidden="true"><span className="h-px flex-1 bg-white/15" />or with email<span className="h-px flex-1 bg-white/15" /></div>
      </div>

      <form onSubmit={submit} noValidate className="mt-4 space-y-4" aria-label={signup ? "Create account" : "Sign in"}>
        {signup && (
          <div><label className={glassLabel} htmlFor="name">Full name</label>
            <input id="name" required autoComplete="name" aria-invalid={!!fieldErr.name} aria-describedby={fieldErr.name ? "err-name" : undefined} className={glassInput} value={name} onChange={(e) => setName(e.target.value)} />{err("name")}</div>)}
        <div><label className={glassLabel} htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email" inputMode="email" aria-invalid={!!fieldErr.email} aria-describedby={fieldErr.email ? "err-email" : undefined} className={glassInput} value={email} onChange={(e) => setEmail(e.target.value)} />{err("email")}</div>
        <div><label className={glassLabel} htmlFor="pw">Password</label>
          <PasswordField id="pw" value={password} onChange={setPassword} autoComplete={signup ? "new-password" : "current-password"} describedBy={fieldErr.password ? "err-password" : signup ? "pw-hint" : undefined} />
          {err("password")}{signup && !fieldErr.password && <p id="pw-hint" className="mt-1 text-xs text-mist">At least 8 characters.</p>}</div>
        {alert}
        <button className={`${btnAccent} w-full`} disabled={busy} aria-busy={busy}>{busy ? (signup ? "Creating account…" : "Signing in…") : signup ? "Create account" : "Sign in"}</button>
        <p className="text-center text-sm text-mist">
          {signup ? "Already have an account? " : "New to Bab Ride? "}
          {switchHrefs
            ? <Link href={signup ? switchHrefs.signin : switchHrefs.signup} className={switchLink}>{signup ? "Sign in" : "Create an account"}</Link>
            : <button type="button" className={switchLink} onClick={() => switchView(signup ? "signin" : "signup")}>{signup ? "Sign in" : "Create an account"}</button>}
        </p>
        {signup && <p className="text-center text-xs text-mist">{accountNote ?? "New accounts start as students."}</p>}
      </form>
      {footer && <div className="mt-6 border-t border-white/10 pt-4 text-sm text-mist">{footer}</div>}
    </section>
  );
}
