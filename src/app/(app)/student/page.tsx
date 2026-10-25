"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Gate from "@/components/Gate";
import ConfirmDialog from "@/components/ConfirmDialog";
import PassengerPicker from "@/components/PassengerPicker";
import StatusBadge from "@/components/StatusBadge";
import { api, uid } from "@/lib/client-api";
import { formatNaira } from "@/lib/fare";
import { isActive } from "@/lib/ride-state";
import { btnAccent, btnDanger, btnGhost, card, input, label } from "@/components/ui";
import type { Loc, Ride } from "@/lib/types";

// The map is a separate chunk: it is only downloaded when the booking screen is shown, and never re-rendered by polling.
const CampusMap = dynamic(() => import("@/components/CampusMap"), { ssr: false, loading: () => <div className="skeleton h-40 rounded-xl2 bg-navy-100" aria-hidden="true" /> });

interface Quote { fareKobo: number; currency: string }
type PickupChoice = { kind: "landmark"; locationId: string } | { kind: "gps"; latitude: number; longitude: number };
const ACTIVE_POLL_MS = 4000, IDLE_POLL_MS = 20000;

function Booking() {
  const [locs, setLocs] = useState<Loc[]>([]);
  const [rides, setRides] = useState<Ride[]>([]);
  const [ridesLoaded, setRidesLoaded] = useState(false);
  const [maxPax, setMaxPax] = useState(3);
  const [pickupMode, setPickupMode] = useState<"landmark" | "gps">("landmark");
  const [pickupId, setPickupId] = useState("");
  const [gps, setGps] = useState<{ latitude: number; longitude: number; acc: number } | null>(null);
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  const [destId, setDestId] = useState("");
  const [passengers, setPassengers] = useState(1);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const keyRef = useRef(uid()); // reused on retry so a double tap cannot create two rides
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    try { setRides((await api<{ rides: Ride[] }>("/api/v1/rides")).rides); } catch { /* keep the last known state */ }
    setRidesLoaded(true);
  }, []);

  // One load of the landmark list and limits; then a self-scheduling poll: fast while a ride is live, slow when idle.
  useEffect(() => {
    api<{ locations: Loc[] }>("/api/v1/campus/locations").then((r) => setLocs(r.locations)).catch((e: Error) => setErr(e.message));
    api<{ maxPassengers?: number }>("/api/v1/mode").then((m) => { if (m.maxPassengers) setMaxPax(m.maxPassengers); }).catch(() => {});
    // Prefill from the homepage (?from=<id>&to=<id>); ids only, never coordinates.
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get("from")) setPickupId(q.get("from")!); if (q.get("to")) setDestId(q.get("to")!);
    } catch { /* ignore */ }
  }, []);
  const hasLive = rides.some((r) => isActive(r.status));
  useEffect(() => {
    let stop = false; let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stop) return;
      if (document.visibilityState === "visible" && !inFlight.current) { inFlight.current = true; await refresh(); inFlight.current = false; }
      if (!stop) t = setTimeout(tick, hasLive ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    };
    void tick();
    return () => { stop = true; clearTimeout(t); };
  }, [refresh, hasLive]);

  const pickupLoc = locs.find((l) => l.id === pickupId);
  const destLoc = locs.find((l) => l.id === destId);
  const sameStop = pickupMode === "landmark" && !!pickupId && pickupId === destId;

  // Landmark pickups send the ID only (the server looks the position up). GPS sends the device position.
  const pickup = useMemo((): PickupChoice | null => {
    if (pickupMode === "gps" && gps) return { kind: "gps", latitude: gps.latitude, longitude: gps.longitude };
    if (pickupMode === "landmark" && pickupLoc) return { kind: "landmark", locationId: pickupLoc.id };
    return null;
  }, [pickupMode, gps, pickupLoc]);
  const pickupBody = pickup && (pickup.kind === "gps" ? { latitude: pickup.latitude, longitude: pickup.longitude } : { locationId: pickup.locationId });

  // Re-quote when the stops change (debounced, and stale answers are ignored).
  useEffect(() => {
    setQuote(null); setQuoteErr(null);
    if (!pickup || !destId || sameStop) { setQuoting(false); return; }
    const p = new URLSearchParams({ destinationLocationId: destId });
    if (pickup.kind === "landmark") p.set("locationId", pickup.locationId); else { p.set("latitude", String(pickup.latitude)); p.set("longitude", String(pickup.longitude)); }
    let live = true; setQuoting(true);
    const t = setTimeout(() => {
      api<Quote>(`/api/v1/fares/quote?${p}`).then((q) => live && setQuote(q)).catch((e: Error) => live && setQuoteErr(e.message)).finally(() => live && setQuoting(false));
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [pickup, destId, sameStop]);

  function locateMe() {
    setGpsMsg(null);
    if (!("geolocation" in navigator)) return setGpsMsg("Location isn't available on this device. Choose a landmark instead.");
    setGpsMsg("Getting your location…");
    navigator.geolocation.getCurrentPosition(
      (p) => { setGps({ latitude: p.coords.latitude, longitude: p.coords.longitude, acc: Math.round(p.coords.accuracy) }); setPickupMode("gps"); setGpsMsg(null); },
      () => { setGpsMsg("Location permission was denied or unavailable. Choose a landmark instead."); setPickupMode("landmark"); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 });
  }

  async function request() {
    if (!pickup || !destId || busy || !quote) return;
    setBusy(true); setErr(null);
    try {
      await api("/api/v1/rides", { method: "POST", body: { pickup: pickupBody, destinationLocationId: destId, passengerCount: passengers, paymentMethod: "cash", idempotencyKey: keyRef.current } });
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
  const opt = (l: Loc) => `${l.name}${l.status === "verified" ? "" : l.status === "selected" ? " (location selected)" : " (not located yet)"}`;

  return (
    <div className="space-y-5 py-6">
      <h1 className="text-3xl font-extrabold text-navy-900">Where are you going?</h1>
      {err && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{err}</p>}

      {!ridesLoaded && !active && <div className="skeleton h-40 rounded-xl2 bg-navy-100" role="status" aria-label="Loading your rides" />}

      {active ? (
        <section className={card} aria-live="polite">
          <div className="flex items-center justify-between gap-2"><StatusBadge status={active.status} /></div>
          <dl className="mt-4 space-y-2 text-navy-900">
            <div><dt className="text-sm text-navy-700">Pickup</dt><dd className="font-semibold">{active.pickup.label}</dd></div>
            <div><dt className="text-sm text-navy-700">Destination</dt><dd className="font-semibold">{active.destination.name}</dd></div>
            <div><dt className="text-sm text-navy-700">Passengers</dt><dd className="font-semibold">{active.passengerCount}</dd></div>
            <div><dt className="text-sm text-navy-700">Fare (whole ride)</dt><dd className="text-2xl font-extrabold">{formatNaira(active.fareKobo)} <span className="text-base font-medium">· pay cash</span></dd></div>
            {active.riderName && <div><dt className="text-sm text-navy-700">Your rider</dt><dd className="font-semibold">{active.riderName}{active.vehicleReg ? ` · ${active.vehicleReg}` : ""}</dd></div>}
          </dl>
          {active.status === "searching" && <p className="mt-3 text-navy-800">Looking for an available rider{active.passengerCount > 1 ? " whose vehicle can carry your group" : ""}. This request expires if nobody accepts soon.</p>}
          <button onClick={() => setCancelId(active.id)} className={`${btnDanger} mt-4 w-full`}>Cancel ride</button>
        </section>
      ) : ridesLoaded && (
        <section className={`${card} space-y-4`}>
          <div>
            <span className={label}>Pickup</span>
            <div className="mb-2 grid grid-cols-2 gap-2" role="group" aria-label="Pickup method">
              <button type="button" onClick={() => setPickupMode("landmark")} aria-pressed={pickupMode === "landmark"} className={`${btnGhost} ${pickupMode === "landmark" ? "!bg-navy-100" : ""}`}>Landmark</button>
              <button type="button" onClick={locateMe} aria-pressed={pickupMode === "gps"} className={`${btnGhost} ${pickupMode === "gps" ? "!bg-navy-100" : ""}`}>Use my location</button>
            </div>
            {gpsMsg && <p role="status" className="mb-2 text-sm text-navy-800">{gpsMsg}</p>}
            {pickupMode === "gps" && gps
              ? <p className="rounded-xl bg-navy-50 p-3 text-sm">GPS pin (accuracy about {gps.acc} m). This is a device position, not a named landmark.</p>
              : <select aria-label="Pickup landmark" className={input} value={pickupId} onChange={(e) => setPickupId(e.target.value)}>
                  <option value="">Select pickup landmark</option>
                  {locs.filter((l) => l.pickupAllowed).map((l) => <option key={l.id} value={l.id} disabled={l.id === destId}>{opt(l)}</option>)}
                </select>}
          </div>
          <div>
            <label className={label} htmlFor="dest">Destination</label>
            <select id="dest" className={input} value={destId} onChange={(e) => setDestId(e.target.value)}>
              <option value="">Select destination</option>
              {locs.filter((l) => l.destinationAllowed).map((l) => <option key={l.id} value={l.id} disabled={pickupMode === "landmark" && l.id === pickupId}>{opt(l)}</option>)}
            </select>
            {sameStop && <p role="alert" className="mt-2 text-sm text-red-700">Pickup and destination must be different.</p>}
          </div>

          <PassengerPicker value={passengers} onChange={setPassengers} max={maxPax} />

          <div className="rounded-xl bg-navy-50 p-4" aria-live="polite">
            <p className="text-sm text-navy-700">Fare for the whole ride{passengers > 1 ? ` (${passengers} passengers)` : ""}</p>
            <p className="text-3xl font-extrabold text-navy-900">{quote ? formatNaira(quote.fareKobo) : quoting ? "Checking…" : "₦200 fixed"}</p>
            {quoteErr && <p role="alert" className="mt-1 text-sm text-red-700">{quoteErr}</p>}
            {!quote && !quoteErr && !quoting && <p className="text-sm text-navy-800">Select pickup and destination to confirm your fare.</p>}
          </div>
          <fieldset>
            <legend className={label}>Payment</legend>
            <label className="flex min-h-[48px] items-center gap-3 rounded-xl border border-navy-700 bg-navy-50 px-4"><input type="radio" checked readOnly name="pay" /> Cash to rider</label>
            <label className="mt-2 flex min-h-[48px] items-center gap-3 rounded-xl border border-navy-100 px-4 opacity-60"><input type="radio" disabled name="pay" /> Electronic payment <span className="text-xs">(coming soon)</span></label>
          </fieldset>
          <button onClick={request} disabled={!quote || busy} className={`${btnAccent} w-full`}>{busy ? "Requesting…" : `Request tricycle${passengers > 1 ? ` for ${passengers}` : ""}`}</button>
        </section>
      )}

      {locs.length > 0 && <CampusMap locations={locs} pickupId={pickupMode === "landmark" ? pickupId : undefined} destinationId={destId} gps={pickupMode === "gps" ? gps : null} />}

      <section aria-labelledby="hist">
        <h2 id="hist" className="mb-2 text-xl font-bold">Ride history</h2>
        {history.length === 0 ? <p className="text-navy-800">No past rides yet.</p> : (
          <ul className="space-y-2">
            {history.map((r) => (
              <li key={r.id} className={`${card} !p-4`}>
                <div className="flex items-center justify-between gap-2"><StatusBadge status={r.status} /><span className="font-semibold">{formatNaira(r.fareKobo)}</span></div>
                <p className="mt-2 break-words text-sm">{r.pickup.label} → {r.destination.name}</p>
                <p className="text-xs text-navy-700">{new Date(r.requestedAt).toLocaleString()} · {r.passengerCount} {r.passengerCount === 1 ? "passenger" : "passengers"} · {r.paymentMethod} · {r.status === "completed" ? (r.paymentStatus === "collected" ? "cash collected" : "cash outstanding") : "no charge"}</p>
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
