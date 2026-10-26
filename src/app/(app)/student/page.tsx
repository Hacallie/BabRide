"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import Gate from "@/components/Gate";
import ConfirmDialog from "@/components/ConfirmDialog";
import FareBreakdown from "@/components/FareBreakdown";
import PassengerPicker from "@/components/PassengerPicker";
import StatusBadge from "@/components/StatusBadge";
import { api, uid } from "@/lib/client-api";
import { FIXED_FARE_KOBO, formatNaira, totalFareKobo } from "@/lib/fare";
import { isActive } from "@/lib/ride-state";
import { btnAccent, btnDanger, btnGhost, card, input, label } from "@/components/ui";
import type { NearestResult } from "@/lib/nearest";
import type { Loc, Ride } from "@/lib/types";

// The map is a separate chunk: only downloaded when the booking screen is shown, and never re-rendered by polling.
const CampusMap = dynamic(() => import("@/components/CampusMap"), { ssr: false, loading: () => <div className="skeleton h-40 rounded-xl2 bg-navy-100" aria-hidden="true" /> });

interface Quote { fareKobo: number; farePerPassengerKobo: number; passengerCount: number; currency: string }
interface Mode { maxPassengers?: number; serviceArea?: "boundary" | "landmarks"; nearestMaxMeters?: number }
const ACTIVE_POLL_MS = 4000, IDLE_POLL_MS = 20000;

function Booking() {
  const [locs, setLocs] = useState<Loc[]>([]);
  const [rides, setRides] = useState<Ride[]>([]);
  const [ridesLoaded, setRidesLoaded] = useState(false);
  const [mode, setMode] = useState<Mode>({});
  const [pickupId, setPickupId] = useState("");
  const [destId, setDestId] = useState("");
  const [passengers, setPassengers] = useState(1);
  const [locating, setLocating] = useState(false);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const [nearby, setNearby] = useState<NearestResult["nearby"]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const keyRef = useRef(uid()); // reused on retry so a double tap cannot create two rides
  const inFlight = useRef(false);
  const maxPax = mode.maxPassengers ?? 4;

  const refresh = useCallback(async () => {
    try { setRides((await api<{ rides: Ride[] }>("/api/v1/rides")).rides); } catch { /* keep the last known state */ }
    setRidesLoaded(true);
  }, []);

  useEffect(() => {
    api<{ locations: Loc[] }>("/api/v1/campus/locations").then((r) => setLocs(r.locations)).catch((e: Error) => setErr(e.message));
    api<Mode>("/api/v1/mode").then(setMode).catch(() => {});
    try { // prefill from a link (?from=<id>&to=<id>): ids only, never coordinates
      const q = new URLSearchParams(window.location.search);
      const f = q.get("from"), t = q.get("to");
      if (f && f !== "gps") setPickupId(f); if (t) setDestId(t);
    } catch { /* ignore */ }
  }, []);
  const hasLive = rides.some((r) => isActive(r.status));
  useEffect(() => { // self-scheduling poll: fast while a ride is live, slow when idle, paused when the tab is hidden
    let stop = false; let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stop) return;
      if (document.visibilityState === "visible" && !inFlight.current) { inFlight.current = true; await refresh(); inFlight.current = false; }
      if (!stop) t = setTimeout(tick, hasLive ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    };
    void tick();
    return () => { stop = true; clearTimeout(t); };
  }, [refresh, hasLive]);

  const same = !!pickupId && pickupId === destId;
  // In strict mode a landmark with no saved position can't be priced, so it isn't offered. (Administrators are told in Admin > Landmarks.)
  const unavailable = (l: Loc) => mode.serviceArea !== "landmarks" && l.status === "placeholder";

  // Re-quote when stops OR passengers change (debounced; stale answers are ignored). The server alone computes the total.
  useEffect(() => {
    setQuote(null); setQuoteErr(null);
    if (!pickupId || !destId || same) { setQuoting(false); return; }
    const p = new URLSearchParams({ destinationLocationId: destId, locationId: pickupId, passengerCount: String(passengers) });
    let live = true; setQuoting(true);
    const t = setTimeout(() => {
      api<Quote>(`/api/v1/fares/quote?${p}`).then((q) => live && setQuote(q)).catch((e: Error) => live && setQuoteErr(e.message)).finally(() => live && setQuoting(false));
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [pickupId, destId, passengers, same]);

  function locateMe() {
    setLocMsg(null); setNearby([]);
    if (!("geolocation" in navigator)) return setLocMsg("Location isn't available on this device. Choose your pickup from the list.");
    setLocating(true); setLocMsg("Finding where you are…");
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        try { // the server finds the nearest located landmark; we only get ids, names and distances back
          const r = await api<NearestResult>("/api/v1/campus/nearest", { method: "POST", body: { latitude: p.coords.latitude, longitude: p.coords.longitude } });
          if (r.match) { setPickupId(r.match.id); setLocMsg(`Pickup set to ${r.match.name} (about ${r.match.distanceMeters} m away). Not right? Pick another from the list.`); }
          else if (r.reason === "outside_campus") setLocMsg("You seem to be outside the campus. Choose your pickup from the list.");
          else if (r.reason === "too_far") { setNearby(r.nearby); setLocMsg(`You're not close enough to a landmark to pick one automatically (within ${r.maxMeters} m). Choose one of the nearest, or pick from the list.`); }
          else setLocMsg("No landmarks have a map position yet. Choose your pickup from the list.");
        } catch (e) { setLocMsg(e instanceof Error ? e.message : "Couldn't use your location. Choose your pickup from the list."); }
        finally { setLocating(false); }
      },
      (e) => { setLocating(false); setLocMsg(e.code === 1 ? "Location permission was denied. Choose your pickup from the list." : e.code === 3 ? "Finding you took too long. Try again, or choose from the list." : "Your location isn't available. Choose your pickup from the list."); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 });
  }

  async function request() {
    if (!pickupId || !destId || busy || !quote) return;
    setBusy(true); setErr(null);
    try {
      await api("/api/v1/rides", { method: "POST", body: { pickup: { locationId: pickupId }, destinationLocationId: destId, passengerCount: passengers, paymentMethod: "cash", idempotencyKey: keyRef.current } });
      keyRef.current = uid(); await refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not request a ride."); } finally { setBusy(false); }
  }
  async function confirmCancel() {
    if (!cancelId) return;
    setCancelBusy(true);
    try { await api(`/api/v1/rides/${cancelId}/cancel`, { method: "POST" }); await refresh(); setCancelId(null); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not cancel."); setCancelId(null); }
    finally { setCancelBusy(false); }
  }

  const active = rides.find((r) => isActive(r.status));
  const history = rides.filter((r) => !isActive(r.status));
  const opt = (l: Loc) => `${l.name}${unavailable(l) ? " (not available yet)" : l.status === "placeholder" ? " (no map position yet)" : ""}`;

  return (
    <div className="space-y-5 py-6">
      <h1 className="text-3xl font-extrabold text-navy-900">Where are you going?</h1>
      {err && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{err}</p>}
      {!ridesLoaded && !active && <div className="skeleton h-40 rounded-xl2 bg-navy-100" role="status" aria-label="Loading your rides" />}

      {active ? (
        <section className={card} aria-live="polite">
          <div className="flex items-center justify-between gap-2"><StatusBadge status={active.status} /></div>
          <dl className="mt-4 space-y-2 text-navy-900">
            <div><dt className="text-sm text-navy-700">Pickup</dt><dd className="break-words font-semibold">{active.pickup.label}</dd></div>
            <div><dt className="text-sm text-navy-700">Destination</dt><dd className="break-words font-semibold">{active.destination.name}</dd></div>
            <div><dt className="text-sm text-navy-700">Passengers</dt><dd className="font-semibold">{active.passengerCount}</dd></div>
            <div><dt className="text-sm text-navy-700">Total fare</dt><dd><FareBreakdown perPassengerKobo={active.farePerPassengerKobo} passengers={active.passengerCount} totalKobo={active.fareKobo} /><span className="text-sm text-navy-800">Pay cash to your rider.</span></dd></div>
            {active.riderName && <div><dt className="text-sm text-navy-700">Your rider</dt><dd className="font-semibold">{active.riderName}{active.vehicleReg ? ` · ${active.vehicleReg}` : ""}</dd></div>}
          </dl>
          {active.status === "searching" && <p className="mt-3 text-navy-800">Looking for an available rider{active.passengerCount > 1 ? " whose keke can carry your group" : ""}. This request expires if nobody accepts soon.</p>}
          <button onClick={() => setCancelId(active.id)} className={`${btnDanger} mt-4 w-full`}>Cancel ride</button>
        </section>
      ) : ridesLoaded && (
        <section className={`${card} space-y-4`}>
          <div>
            <label className={label} htmlFor="pickup">Pickup</label>
            <div className="flex gap-2">
              <select id="pickup" className={input} value={pickupId} onChange={(e) => { setPickupId(e.target.value); setNearby([]); }}>
                <option value="">Select pickup landmark</option>
                {locs.filter((l) => l.pickupAllowed).map((l) => <option key={l.id} value={l.id} disabled={l.id === destId || unavailable(l)}>{opt(l)}</option>)}
              </select>
              <button type="button" onClick={locateMe} disabled={locating} aria-busy={locating} className={`${btnGhost} shrink-0 !px-3`} aria-label="Use my location to pick the nearest landmark">{locating ? "…" : "📍 Use my location"}</button>
            </div>
            {locMsg && <p role="status" className="mt-2 text-sm text-navy-800">{locMsg}</p>}
            {nearby.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2" aria-label="Nearest landmarks">
                {nearby.map((n) => <li key={n.id}><button type="button" onClick={() => { setPickupId(n.id); setNearby([]); setLocMsg(null); }} className={`${btnGhost} !min-h-[44px] text-sm`}>{n.name} · {n.distanceMeters} m</button></li>)}
              </ul>)}
          </div>
          <div>
            <label className={label} htmlFor="dest">Destination</label>
            <select id="dest" className={input} value={destId} onChange={(e) => setDestId(e.target.value)}>
              <option value="">Select destination</option>
              {locs.filter((l) => l.destinationAllowed).map((l) => <option key={l.id} value={l.id} disabled={l.id === pickupId || unavailable(l)}>{opt(l)}</option>)}
            </select>
            {same && <p role="alert" className="mt-2 text-sm text-red-700">Pickup and destination must be different.</p>}
          </div>

          <PassengerPicker value={passengers} onChange={setPassengers} max={maxPax} />

          <div className="rounded-xl bg-navy-50 p-4" aria-live="polite">
            <p className="text-sm text-navy-700">Total fare</p>
            <FareBreakdown perPassengerKobo={quote?.farePerPassengerKobo ?? FIXED_FARE_KOBO} passengers={passengers} totalKobo={quote?.fareKobo ?? totalFareKobo(passengers)} pending={!quote} />
            {quoting && <p className="text-sm text-navy-800">Checking your fare…</p>}
            {quoteErr && <p role="alert" className="mt-1 text-sm text-red-700">{quoteErr}</p>}
            {!quote && !quoteErr && !quoting && <p className="text-sm text-navy-800">Choose pickup and destination to confirm your fare.</p>}
          </div>
          <fieldset>
            <legend className={label}>Payment</legend>
            <label className="flex min-h-[48px] items-center gap-3 rounded-xl border border-navy-700 bg-navy-50 px-4"><input type="radio" checked readOnly name="pay" /> Cash to rider{quote ? ` · ${formatNaira(quote.fareKobo)}` : ""}</label>
            <label className="mt-2 flex min-h-[48px] items-center gap-3 rounded-xl border border-navy-100 px-4 opacity-60"><input type="radio" disabled name="pay" /> Electronic payment <span className="text-xs">(coming soon)</span></label>
          </fieldset>
          <button onClick={request} disabled={!quote || busy} className={`${btnAccent} w-full`}>{busy ? "Requesting…" : `Request tricycle${passengers > 1 ? ` for ${passengers}` : ""}${quote ? ` · ${formatNaira(quote.fareKobo)}` : ""}`}</button>
        </section>
      )}

      {locs.length > 0 && <CampusMap locations={locs} pickupId={pickupId || undefined} destinationId={destId || undefined} gps={null} />}

      <section aria-labelledby="hist" id="history">
        <h2 id="hist" className="mb-2 text-xl font-bold">My rides</h2>
        {history.length === 0 ? <p className="text-navy-800">No past rides yet.</p> : (
          <ul className="space-y-2">
            {history.map((r) => (
              <li key={r.id} className={`${card} !p-4`}>
                <div className="flex items-center justify-between gap-2"><StatusBadge status={r.status} /><span className="font-semibold">{formatNaira(r.fareKobo)}</span></div>
                <p className="mt-2 break-words text-sm">{r.pickup.label} → {r.destination.name}</p>
                <p className="text-xs text-navy-700">{new Date(r.requestedAt).toLocaleString()} · {r.passengerCount} × {formatNaira(r.farePerPassengerKobo)} · {r.paymentMethod} · {r.status === "completed" ? (r.paymentStatus === "collected" ? "cash collected" : "cash outstanding") : "no charge"}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog open={!!cancelId} title="Cancel this ride?" confirmLabel="Cancel ride" cancelLabel="Keep my ride" danger busy={cancelBusy} onConfirm={confirmCancel} onClose={() => setCancelId(null)}>
        Your rider (if one was assigned) will be told. You won't be charged.
      </ConfirmDialog>
    </div>
  );
}
export default function StudentPage() {
  return <Gate allow={["student"]} title="Student sign-in">{() => <Booking />}</Gate>;
}
