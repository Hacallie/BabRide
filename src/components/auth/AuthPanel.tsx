"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import OAuthButtons from "@/components/auth/OAuthButtons";
import type { Me } from "@/components/Gate";
import { btnAccent, btnGlass, glassInput, glassLabel, glassPanel } from "@/components/ui";
import { api } from "@/lib/client-api";
import {
  COOLDOWN_KEY, LOGIN_ERROR_TEXT, NEXT_KEY, OTP_COOLDOWN_SECONDS, callbackUrl, describeAuthError,
  describeSessionProblem, destinationFor, normalizeCode, normalizeEmail, safeNext,
} from "@/lib/auth-utils";
import { browserSupabase } from "@/lib/supabase-browser";
import type { Role } from "@/lib/types";

type Method = "code" | "link" | "password";
type Notice = { kind: "error" | "info"; text: string } | null;
const TABS: { id: Method; text: string }[] = [
  { id: "code", text: "Email code" }, { id: "link", text: "Email link" }, { id: "password", text: "Password" },
];

interface Props {
  heading: string;
  as?: "h1" | "h2";
  intro?: ReactNode;
  /** Page to open after sign-in (checked against an allow-list). Falls back to ?next= and then the role's home page. */
  next?: string | null;
  /** Per-role landing page chosen by the page (e.g. rider sign-in sends riders to /rider). Still filtered by canOpen(). */
  nextByRole?: Partial<Record<Role, string>>;
  /** Replaces the default "New accounts start as students." sentence. */
  accountNote?: ReactNode;
  /** When set, called after a successful sign-in instead of redirecting (used by pages that continue in place). */
  onSignedIn?: () => void;
  footer?: ReactNode;
}

export default function AuthPanel({ heading, as: Heading = "h1", intro, next: nextProp, nextByRole, accountNote, onSignedIn, footer }: Props) {
  const router = useRouter();
  const sb = browserSupabase();
  const next = useRef<string | null>(null);
  const [method, setMethod] = useState<Method>("code");
  const [email, setEmail] = useState(""); const [code, setCode] = useState("");
  const [password, setPassword] = useState(""); const [name, setName] = useState(""); const [signup, setSignup] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [cooldown, setCooldown] = useState(0);
  const [existing, setExisting] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    next.current = safeNext(nextProp) ?? safeNext(q.get("next"));
    try { if (next.current) sessionStorage.setItem(NEXT_KEY, next.current); } catch { /* storage unavailable */ }
    const e = q.get("e");
    if (e && LOGIN_ERROR_TEXT[e]) setNotice({ kind: "error", text: LOGIN_ERROR_TEXT[e] });
    try {
      const left = Math.ceil((Number(sessionStorage.getItem(COOLDOWN_KEY)) - Date.now()) / 1000);
      if (left > 0) setCooldown(Math.min(left, OTP_COOLDOWN_SECONDS));
    } catch { /* ignore */ }
    sb?.auth.getSession().then(({ data }) => { if (data.session) setExisting(data.session.user.email ?? "your account"); });
  }, [sb, nextProp]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const startCooldown = () => {
    setCooldown(OTP_COOLDOWN_SECONDS);
    try { sessionStorage.setItem(COOLDOWN_KEY, String(Date.now() + OTP_COOLDOWN_SECONDS * 1000)); } catch { /* ignore */ }
  };

  // After any successful sign-in: ask OUR server who this is (the role comes from the database), then continue.
  // If that call fails we say so; we never show a "success" state on the strength of the browser session alone.
  const finish = useCallback(async () => {
    try {
      const me = await api<Me>("/api/v1/me");
      let dest = next.current;
      try { dest = safeNext(sessionStorage.getItem(NEXT_KEY)) ?? dest; sessionStorage.removeItem(NEXT_KEY); } catch { /* ignore */ }
      if (onSignedIn) { setBusy(false); onSignedIn(); return; }
      router.replace(destinationFor(me.actor.role, nextByRole?.[me.actor.role] ?? dest));
    } catch (e) {
      setBusy(false);
      setNotice({ kind: "error", text: describeSessionProblem(e) });
    }
  }, [router, onSignedIn, nextByRole]);

  function pick(m: Method) { setMethod(m); setSent(false); setCode(""); setNotice(null); }
  function changeEmail() {
    setSent(false); setCode(""); setNotice(null); setCooldown(0);
    try { sessionStorage.removeItem(COOLDOWN_KEY); } catch { /* ignore */ }
  }

  async function requestEmail(ev?: React.FormEvent) {
    ev?.preventDefault();
    if (!sb || busy || cooldown > 0) return;
    const em = normalizeEmail(email);
    if (!em) return setNotice({ kind: "error", text: "Enter a valid email address." });
    setBusy(true); setNotice(null);
    const { error } = await sb.auth.signInWithOtp({ email: em, options: { shouldCreateUser: true, emailRedirectTo: callbackUrl(window.location.origin) } });
    setBusy(false);
    if (error) return setNotice({ kind: "error", text: describeAuthError(error) });
    setEmail(em); setSent(true); setCode(""); startCooldown();
    setNotice({ kind: "info", text: `Email requested for ${em}. It can take a minute to arrive; check spam too.` });
  }

  async function verify(ev: React.FormEvent) {
    ev.preventDefault();
    if (!sb || busy) return;
    const token = normalizeCode(code);
    if (!token) return setNotice({ kind: "error", text: "Enter the code from the email (6 to 10 digits)." });
    setBusy(true); setNotice(null);
    const { error } = await sb.auth.verifyOtp({ email, token, type: "email" });
    if (error) { setBusy(false); return setNotice({ kind: "error", text: describeAuthError(error) }); }
    await finish();
  }

  async function submitPassword(ev: React.FormEvent) {
    ev.preventDefault();
    if (!sb || busy) return;
    setBusy(true); setNotice(null);
    const res = signup
      ? await sb.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name } } })
      : await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (res.error) { setBusy(false); return setNotice({ kind: "error", text: describeAuthError(res.error) }); }
    if (signup && !res.data.session) { setBusy(false); return setNotice({ kind: "info", text: "Check your email to confirm your account, then sign in." }); }
    await finish();
  }

  if (!sb) return (
    <section className={glassPanel}>
      <Heading className="text-2xl font-bold">{heading}</Heading>
      <p role="alert" className="mt-3 rounded-lg bg-red-500/15 p-3 text-sm text-red-100">Sign-in is unavailable because this server's Supabase configuration is missing or invalid. See the setup instructions in the README.</p>
    </section>
  );

  const alert = notice && (
    <p role={notice.kind === "error" ? "alert" : "status"}
      className={`rounded-lg p-3 text-sm ${notice.kind === "error" ? "bg-red-500/15 text-red-100" : "bg-white/10 text-mist"}`}>{notice.text}</p>
  );
  const resendText = cooldown > 0 ? `Resend in ${cooldown}s` : method === "code" ? "Resend code" : "Resend link";
  const linkBtn = "text-mist underline underline-offset-2 transition hover:text-white disabled:no-underline disabled:opacity-60";

  return (
    <section className={glassPanel} aria-labelledby="auth-h">
      <Heading id="auth-h" className="text-2xl font-bold">{heading}</Heading>
      {intro && <div className="mt-1 text-sm text-mist">{intro}</div>}

      {existing && (
        <div className="mt-4 rounded-xl border border-white/15 bg-white/5 p-4" role="status">
          <p className="text-sm text-mist">You're already signed in as <b className="text-white">{existing}</b>.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className={btnAccent} disabled={busy} onClick={() => { setBusy(true); void finish(); }}>Continue</button>
            <button type="button" className={btnGlass} onClick={async () => { await sb.auth.signOut(); setExisting(null); }}>Sign out</button>
          </div>
        </div>
      )}

      <div role="tablist" aria-label="Sign-in method" className="mt-5 grid grid-cols-3 gap-1 rounded-xl bg-white/10 p-1">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={method === t.id} onClick={() => pick(t.id)}
            className={`min-h-[44px] rounded-lg text-sm font-semibold transition ${method === t.id ? "bg-royal text-white" : "text-mist hover:bg-white/10 hover:text-white"}`}>{t.text}</button>
        ))}
      </div>

      {method !== "password" && !sent && (
        <form onSubmit={requestEmail} className="mt-5 space-y-4">
          <p className="text-sm text-mist">{method === "code" ? "We'll email you a one-time code." : "We'll email you a one-time sign-in link."} No password needed. {accountNote ?? "New accounts start as students."}</p>
          <div><label className={glassLabel} htmlFor="email">Email</label>
            <input id="email" type="email" required autoComplete="email" inputMode="email" className={glassInput} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {alert}
          <button className={`${btnAccent} w-full`} disabled={busy || cooldown > 0}>{busy ? "Sending…" : cooldown > 0 ? `Wait ${cooldown}s` : method === "code" ? "Send code" : "Send link"}</button>
        </form>
      )}

      {method === "code" && sent && (
        <form onSubmit={verify} className="mt-5 space-y-4">
          <p className="text-sm text-mist">Enter the code we emailed to <b className="text-white">{email}</b>.</p>
          <div><label className={glassLabel} htmlFor="otp">One-time code</label>
            <input id="otp" required autoFocus autoComplete="one-time-code" inputMode="numeric" pattern="[0-9 \-]*" maxLength={14}
              className={`${glassInput} text-center text-2xl font-semibold tracking-[0.3em]`} value={code} onChange={(e) => setCode(e.target.value)} /></div>
          {alert}
          <button className={`${btnAccent} w-full`} disabled={busy}>{busy ? "Verifying…" : "Verify and sign in"}</button>
          <div className="flex items-center justify-between text-sm">
            <button type="button" className={linkBtn} disabled={busy || cooldown > 0} onClick={() => requestEmail()}>{resendText}</button>
            <button type="button" className={linkBtn} onClick={changeEmail}>Use a different email</button>
          </div>
        </form>
      )}

      {method === "link" && sent && (
        <div className="mt-5 space-y-4">
          <p className="font-semibold">Check your email</p>
          <p className="text-sm text-mist">We sent a sign-in link to <b className="text-white">{email}</b>. Open it in <b className="text-white">this same browser</b>. If it opens elsewhere or says the link expired, use the <button type="button" className="underline hover:text-white" onClick={() => pick("code")}>Email code</button> option instead. (A link works once, and using the code from the same email cancels it.)</p>
          {alert}
          <div className="flex items-center justify-between text-sm">
            <button type="button" className={linkBtn} disabled={busy || cooldown > 0} onClick={() => requestEmail()}>{resendText}</button>
            <button type="button" className={linkBtn} onClick={changeEmail}>Use a different email</button>
          </div>
        </div>
      )}

      {method === "password" && (
        <form onSubmit={submitPassword} className="mt-5 space-y-4">
          {signup && <div><label className={glassLabel} htmlFor="name">Full name</label><input id="name" required className={glassInput} value={name} onChange={(e) => setName(e.target.value)} /></div>}
          <div><label className={glassLabel} htmlFor="email">Email</label><input id="email" type="email" required autoComplete="email" className={glassInput} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><label className={glassLabel} htmlFor="pw">Password</label><input id="pw" type="password" required minLength={8} autoComplete={signup ? "new-password" : "current-password"} className={glassInput} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          {alert}
          <button className={`${btnAccent} w-full`} disabled={busy}>{busy ? "Please wait…" : signup ? "Create account" : "Sign in"}</button>
          <button type="button" onClick={() => setSignup(!signup)} className={`${linkBtn} w-full text-sm`}>{signup ? "I already have an account" : "New here? Create an account"}</button>
        </form>
      )}

      <OAuthButtons disabled={busy} onError={(text) => setNotice({ kind: "error", text })} />
      {footer && <div className="mt-6 border-t border-white/10 pt-4 text-sm text-mist">{footer}</div>}
    </section>
  );
}