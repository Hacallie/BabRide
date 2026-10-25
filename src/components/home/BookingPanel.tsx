"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ClientApiError, uid } from "@/lib/client-api";
import { FIXED_FARE_KOBO, formatNaira } from "@/lib/fare";
import { STATUS_LABEL } from "@/components/StatusBadge";
import type { Ride } from "@/lib/types";
import PassengerPicker from "@/components/PassengerPicker";
import LandmarkPicker from "./LandmarkPicker";
import { SELECT_DESTINATION_EVENT, type Landmark } from "./types";

type Outcome = { kind: "ok"; ride: Ride } | { kind: "error"; msg: string } | { kind: "auth" } | null;
const DRAFT = "babride:draft";

export default function BookingPanel() {
  const [lms, setLms] = useState<Landmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [pickupId, setPickupId] = useState(""); const [destId, setDestId] = useState("");
  const [gps, setGps] = useState<{ latitude: number; longitude: number; acc: number } | null>(null);
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<string | null>(null);
  const [passengers, setPassengers] = useState(1); const [maxPax, setMaxPax] = useState(3);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Outcome>(null);
  const key = useRef(uid()); // reused on retry: a double tap cannot create two rides

  useEffect(() => {
    api<{ landmarks: Landmark[] }>("/api/v1/campus/landmarks").then((r) => setLms(r.landmarks))
      .catch((e: Error) => setLoadErr(e.message)).finally(() => setLoading(false));
    api<{ mode: string; maxPassengers?: number }>("/api/v1/mode").then((m) => { setMode(m.mode); if (m.maxPassengers) setMaxPax(m.maxPassengers); }).catch(() => {});
    try { const d = JSON.parse(sessionStorage.getItem(DRAFT) ?? "null"); if (d) { setPickupId(d.pickupId ?? ""); setDestId(d.destId ?? ""); } } catch { /* storage unavailable */ }
    const onPick = (e: Event) => { setDestId((e as CustomEvent<string>).detail); setOut(null); setFieldErr(null); };
    window.addEventListener(SELECT_DESTINATION_EVENT, onPick);
    return () => window.removeEventListener(SELECT_DESTINATION_EVENT, onPick);
  }, []);

  function validate(): string | null {
    if (!pickupId && !gps) return "Choose a pickup landmark or use your current location.";
    if (!destId) return "Choose a destination.";
    if (pickupId && !gps && pickupId === destId) return "Pickup and destination must be different.";
    return null;
  }

  function useLocation() {
    setGpsMsg(null);
    if (!("geolocation" in navigator)) return setGpsMsg("Location isn't available on this device. Choose a landmark instead.");
    setGpsMsg("Getting your location…");
    navigator.geolocation.getCurrentPosition(
      (p) => { setGps({ latitude: p.coords.latitude, longitude: p.coords.longitude, acc: Math.round(p.coords.accuracy) }); setPickupId(""); setGpsMsg(null); },
      () => setGpsMsg("Location permission was denied or unavailable. Choose a landmark instead."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 });
  }

  const submit = useCallback(async () => {
    const v = validate(); setFieldErr(v); setOut(null);
    if (v || busy) return;
    setBusy(true);
    try {
      try { sessionStorage.setItem(DRAFT, JSON.stringify({ pickupId, destId })); } catch { /* ignore */ }
      let me: { actor: { role: string } };
      try { me = await api("/api/v1/me"); }
      catch (e) { if (e instanceof ClientApiError && e.status === 401) { setOut({ kind: "auth" }); return; } throw e; }
      if (me.actor.role !== "student") { setOut({ kind: "error", msg: `You are signed in as ${me.actor.role}. Only student accounts can book rides.` }); return; }
      // A landmark pickup sends only its id (the server looks the position up); GPS sends the device position.
      const pickup = gps ? { latitude: gps.latitude, longitude: gps.longitude } : { locationId: pickupId };
      // No fare is sent: the server computes and stores it.
      const { ride } = await api<{ ride: Ride }>("/api/v1/rides", { method: "POST", body: { pickup, destinationLocationId: destId, passengerCount: passengers, paymentMethod: "cash", idempotencyKey: key.current } });
      key.current = uid();
      try { sessionStorage.removeItem(DRAFT); } catch { /* ignore */ }
      setOut({ kind: "ok", ride });
    } catch (e) { setOut({ kind: "error", msg: e instanceof Error ? e.message : "Could not request a ride." }); }
    finally { setBusy(false); }
  }, [pickupId, destId, gps, busy, passengers]); // eslint-disable-line react-hooks/exhaustive-deps

  function swap() { if (gps) return; setPickupId(destId); setDestId(pickupId); }

  if (out?.kind === "ok") {
    const r = out.ride;
    return (
      <section id="book" aria-live="polite" className="on-dark glass scroll-mt-20 rounded-xl2 p-5 text-white sm:p-6">
        <p className="text-sm font-medium text-mist">Ride requested</p>
        <h2 className="mt-1 text-2xl font-bold">{STATUS_LABEL[r.status]}</h2>
        <p className="mt-3 text-white">{r.pickup.label} → {r.destination.name}</p>
        <p className="mt-1 text-mist">Fare {formatNaira(r.fareKobo)} for the whole ride · {r.passengerCount} {r.passengerCount === 1 ? "passenger" : "passengers"} · pay cash to the rider</p>
        <Link href="/student" className="mt-5 inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-royal px-5 font-semibold text-white hover:bg-[#1d4fc7]">Track this ride</Link>
      </section>
    );
  }

  return (
    <section id="book" aria-labelledby="book-h" className="on-dark glass scroll-mt-20 rounded-xl2 p-5 text-white sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="book-h" className="text-lg font-bold">Book a tricycle</h2>
        <span className="rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-accent">Fixed fare</span>
      </div>

      <div className="mt-4 space-y-3">
        <LandmarkPicker label="Pickup" tone="origin" options={lms.filter((l) => l.pickupAllowed)} value={pickupId} loading={loading}
          onChange={(id) => { setPickupId(id); setGps(null); setFieldErr(null); }} placeholder="Where are you?"
          overrideText={gps ? `Current location (±${gps.acc} m, GPS pin)` : null} onClearOverride={() => setGps(null)} />
        <div className="flex items-center gap-2 pl-[18px]">
          <span aria-hidden="true" className="h-6 border-l-2 border-dashed border-white/30" />
          <button type="button" onClick={swap} disabled={!!gps} aria-label="Swap pickup and destination" className="rounded-lg border border-white/15 px-2.5 py-1 text-xs font-medium text-mist transition hover:bg-white/10 disabled:opacity-40">Swap</button>
          <button type="button" onClick={useLocation} className="rounded-lg border border-white/15 px-2.5 py-1 text-xs font-medium text-mist transition hover:bg-white/10">Use current location</button>
        </div>
        {gpsMsg && <p role="status" className="text-sm text-mist">{gpsMsg}</p>}
        <LandmarkPicker label="Destination" tone="destination" options={lms.filter((l) => l.destinationAllowed)} value={destId} loading={loading}
          onChange={(id) => { setDestId(id); setFieldErr(null); }} placeholder="Where to?" />
      </div>

      {loadErr && <p role="alert" className="mt-3 rounded-lg bg-red-500/15 p-3 text-sm text-red-100">Landmarks are unavailable right now: {loadErr}</p>}
      {!loading && !loadErr && lms.length === 0 && <p className="mt-3 rounded-lg bg-white/10 p-3 text-sm text-mist">No landmarks have been added yet. An administrator can add them.</p>}

      <div className="mt-4"><PassengerPicker tone="dark" value={passengers} onChange={setPassengers} max={maxPax} /></div>

      <div className="mt-4 flex items-end justify-between rounded-xl border border-white/12 bg-white/5 p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-mist">Fare</p>
          <p className="text-3xl font-extrabold leading-none">{formatNaira(FIXED_FARE_KOBO)}</p>
        </div>
        <p className="max-w-[11rem] text-right text-xs text-mist">per ride, whatever the distance or group size. The server confirms the fare.</p>
      </div>

      <fieldset className="mt-4">
        <legend className="mb-1.5 text-xs font-medium uppercase tracking-wide text-mist">Payment</legend>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex min-h-[48px] items-center gap-2 rounded-xl border border-white/40 bg-white/15 px-3 text-sm font-medium"><input type="radio" name="pay" checked readOnly className="accent-[#245CE2]" /> Cash</label>
          <label className="flex min-h-[48px] items-center gap-2 rounded-xl border border-white/10 px-3 text-sm text-mist opacity-70"><input type="radio" name="pay" disabled /> Electronic <span className="text-[11px]">(soon)</span></label>
        </div>
      </fieldset>

      {fieldErr && <p role="alert" className="mt-3 text-sm font-medium text-red-200">{fieldErr}</p>}
      {out?.kind === "error" && <p role="alert" className="mt-3 rounded-lg bg-red-500/15 p-3 text-sm text-red-100">{out.msg}</p>}
      {out?.kind === "auth" && (
        <div role="alert" className="mt-3 rounded-lg bg-white/10 p-3 text-sm">
          <p className="font-medium">Sign in as a student to request this ride.</p>
          <p className="mt-0.5 text-mist">Your pickup and destination are kept.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/login" className="inline-flex min-h-[44px] items-center rounded-xl bg-white px-4 font-semibold text-navy-950">Sign in</Link>
            <Link href="/signup" className="inline-flex min-h-[44px] items-center rounded-xl border border-white/30 px-4 font-semibold text-white">Create account</Link>
          </div>
        </div>
      )}

      <button type="button" onClick={submit} disabled={busy || loading || mode === "unconfigured"}
        className="mt-4 inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-royal px-5 text-base font-semibold text-white shadow-[0_10px_30px_-10px_rgba(36,92,226,.9)] transition hover:bg-[#1d4fc7] active:scale-[.98] disabled:opacity-50">
        {busy ? "Requesting…" : "Request tricycle"}
      </button>
      {mode === "unconfigured" && <p className="mt-2 text-xs text-red-200">Booking is unavailable: the server is not configured.</p>}
    </section>
  );
}
