"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import AuthPanel from "@/components/auth/AuthPanel";
import type { Me } from "@/components/Gate";
import { btnAccent, btnGlass, glassPanel } from "@/components/ui";
import { api, ClientApiError } from "@/lib/client-api";
import { glassInput, glassLabel } from "@/components/ui";

type State = { s: "loading" } | { s: "anon" } | { s: "ready"; me: Me } | { s: "error"; msg: string };
const STEPS = ["Create or sign in to your account", "Submit your rider application", "Wait for administrator approval"];

export default function RiderJoin() {
  const [st, setSt] = useState<State>({ s: "loading" });
  const load = useCallback(async () => {
    try {
      const { mode } = await api<{ mode: string }>("/api/v1/mode");
      if (mode === "unconfigured") return setSt({ s: "error", msg: "Bab Ride is not configured on this server yet." });
      try { setSt({ s: "ready", me: await api<Me>("/api/v1/me") }); }
      catch (e) { if (e instanceof ClientApiError && e.status === 401) setSt({ s: "anon" }); else throw e; }
    } catch (e) { setSt({ s: "error", msg: e instanceof Error ? e.message : "Could not load." }); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const current = st.s === "ready" ? (st.me.actor.role === "rider" ? 3 : 2) : 1;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_minmax(0,28rem)] lg:items-start lg:gap-12">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-mist">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" /> For campus tricycle riders
        </p>
        <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">Join Bab Ride as a Rider</h1>
        <p className="mt-3 max-w-md text-lg leading-relaxed text-mist">Give rides around campus in your tricycle. Every ride has the same fixed fare, and you accept the requests you want.</p>
        <ol className="mt-6 space-y-3">
          {STEPS.map((t, i) => (
            <li key={t} className="flex items-center gap-3">
              <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${i + 1 === current ? "bg-royal text-white" : i + 1 < current ? "bg-white/20 text-white" : "bg-white/10 text-mist"}`}>{i + 1}</span>
              <span className={i + 1 === current ? "font-semibold text-white" : "text-mist"}>{t}{i + 1 === current && <span className="sr-only"> (current step)</span>}</span>
            </li>
          ))}
        </ol>
        <p className="mt-6 max-w-md text-sm text-mist">Applying doesn't make you an approved rider. You can only go online and accept rides after an administrator approves you.</p>
      </div>

      <div>
        {st.s === "loading" && <div className={glassPanel} role="status"><p className="text-mist">Loading…</p></div>}
        {st.s === "error" && <div className={glassPanel} role="alert"><h2 className="text-xl font-bold">Unavailable</h2><p className="mt-2 text-mist">{st.msg}</p></div>}
        {st.s === "anon" && (
          <AuthPanel as="h2" initialView="signup" heading="Step 1: your account" next="/rider/join" onSignedIn={load}
            intro="Create an account (or sign in if you have one). You start as a student account; applying does not approve you."
            footer={<>Already applied? <Link href="/rider/login" className="font-semibold text-white underline underline-offset-2">Rider sign-in</Link> · Just want to book rides? <Link href="/login" className="font-semibold text-white underline underline-offset-2">Student sign-in</Link></>} />
        )}
        {st.s === "ready" && <Onboarding me={st.me} reload={load} />}
      </div>
    </div>
  );
}

function Onboarding({ me, reload }: { me: Me; reload: () => Promise<void> }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false); // synchronous guard against double taps
  const [seats, setSeats] = useState(""); const [seatErr, setSeatErr] = useState<string | null>(null);
  const [maxSeats, setMaxSeats] = useState(6);
  useEffect(() => { api<{ maxVehicleSeats?: number }>("/api/v1/mode").then((m) => { if (m.maxVehicleSeats) setMaxSeats(m.maxVehicleSeats); }).catch(() => {}); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending.current) return;
    // Same rule as the server (which re-checks it): a whole number of passenger seats, driver not counted.
    const n = Number(seats);
    if (seats.trim() === "" || !Number.isInteger(n) || n < 1 || n > maxSeats) { setSeatErr(`Enter a whole number of passenger seats from 1 to ${maxSeats}.`); return; }
    setSeatErr(null);
    sending.current = true; setBusy(true); setErr(null);
    try {
      // The server answers only after the application row is saved; the request itself times out after 20 s.
      await api("/api/v1/rider/apply", { method: "POST", body: { seatCapacity: n } });
      await reload(); // re-reads the saved status from the server: what we show is what was stored
    } catch (x) { setErr(x instanceof Error ? x.message : "Could not submit your application."); }
    finally { sending.current = false; setBusy(false); }
  }

  if (me.actor.role === "admin") return (
    <section className={glassPanel}><h2 className="text-xl font-bold">Administrator account</h2>
      <p className="mt-2 text-mist">Administrator accounts can't apply as riders. Use a separate account to ride.</p></section>
  );

  if (me.actor.role === "rider") {
    const a = me.rider?.approval;
    return (
      <section className={glassPanel} aria-live="polite">
        <h2 className="text-xl font-bold">{a === "approved" ? "You're approved" : a === "pending" ? "Application received" : a ? `Application ${a}` : "Rider account"}</h2>
        {me.rider?.vehicle?.registration && <p className="mt-2 text-sm text-mist">Tricycle: <b className="text-white">{me.rider.vehicle.registration}</b></p>}
        {me.rider?.vehicle && <p className="mt-1 text-sm text-mist">Passenger seats: <b className="text-white">{me.rider.vehicle.capacity}</b></p>}
        <p className="mt-3 text-mist">
          {a === "approved" ? "You can go online and accept rides from the rider page."
            : a === "pending" ? "An administrator needs to approve your application. Until then you can't go online or accept rides. Check back later."
            : a ? "Your rider account can't accept rides right now. Contact an administrator."
            : "We couldn't find your application status. Open the rider page to check."}
        </p>
        <Link href="/rider" className={`${a === "approved" ? btnAccent : btnGlass} mt-5 w-full`}>Open rider page</Link>
      </section>
    );
  }

  return (
    <form onSubmit={submit} noValidate className={glassPanel} aria-labelledby="apply-h">
      <h2 id="apply-h" className="text-xl font-bold">Step 2: apply to ride</h2>
      <p className="mt-1 text-sm text-mist">Signed in as <b className="text-white">{me.actor.name}</b>.</p>
      <p className="mt-4 text-sm text-mist">We'll send your application to an administrator. You don't need to enter a tricycle number.</p>
      <div className="mt-4">
        <label className={glassLabel} htmlFor="seats">Passenger seat capacity</label>
        <input id="seats" required inputMode="numeric" autoComplete="off" maxLength={1} value={seats} aria-invalid={!!seatErr} aria-describedby={seatErr ? "seats-err" : "seats-hint"}
          onChange={(e) => { setSeats(e.target.value.replace(/\D/g, "").slice(0, 1)); setSeatErr(null); }} className={glassInput} placeholder="e.g. 3" />
        <p id="seats-hint" className="mt-1 text-xs text-mist">How many passengers your keke can legally and safely carry. Do not count yourself as the driver.</p>
        {seatErr && <p id="seats-err" role="alert" className="mt-1 text-sm text-red-200">{seatErr}</p>}
      </div>
      {err && <p role="alert" className="mt-3 rounded-lg bg-red-500/15 p-3 text-sm text-red-100">{err}</p>}
      <button className={`${btnAccent} mt-5 w-full`} disabled={busy} aria-busy={busy}>{busy ? "Submitting…" : err ? "Try again" : "Submit application"}</button>
      <p className="mt-3 text-xs text-mist">Submitting creates a <b className="text-white">pending</b> application. Nothing is approved automatically.</p>
    </form>
  );
}
