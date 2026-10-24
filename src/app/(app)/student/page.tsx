"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Gate from "@/components/Gate";
import StatusBadge from "@/components/StatusBadge";
import { api, uid } from "@/lib/client-api";
import { formatNaira } from "@/lib/fare";
import { isActive } from "@/lib/ride-state";
import { btnAccent, btnDanger, btnGhost, card, input, label } from "@/components/ui";
import type { Loc, Ride } from "@/lib/types";

interface Quote { fareKobo: number; currency: string }

function Booking() {
  const [locs, setLocs] = useState<Loc[]>([]);
  const [rides, setRides] = useState<Ride[]>([]);
  const [pickupMode, setPickupMode] = useState<"landmark" | "gps">("landmark");
  const [pickupId, setPickupId] = useState("");
  const [gps, setGps] = useState<{ latitude: number; longitude: number; acc: number } | null>(null);
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  const [destId, setDestId] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const keyRef = useRef(uid()); // reused on retry so a double tap cannot create two rides

  const refresh = useCallback(async () => {
    try { setRides((await api<{ rides: Ride[] }>("/api/v1/rides")).rides); } catch { /* keep last known state */ }
  }, []);
  useEffect(() => {
    api<{ locations: Loc[] }>("/api/v1/campus/locations").then((r) => setLocs(r.locations)).catch((e: Error) => setErr(e.message));
    void refresh();
    const t = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  const pickupLoc = locs.find((l) => l.id === pickupId);
  const pickup = useMemo(() => {
    if (pickupMode === "gps" && gps) return { latitude: gps.latitude, longitude: gps.longitude };
    if (pickupMode === "landmark" && pickupLoc) return { latitude: pickupLoc.latitude, longitude: pickupLoc.longitude, locationId: pickupLoc.id };
    return null;
  }, [pickupMode, gps, pickupLoc]);

  useEffect(() => {
    setQuote(null); setQuoteErr(null);
    if (!pickup || !destId) return;
    const p = new URLSearchParams({ latitude: String(pickup.latitude), longitude: String(pickup.longitude), destinationLocationId: destId });
    if ("locationId" in pickup && pickup.locationId) p.set("locationId", pickup.locationId);
    let live = true;
    api<Quote>(`/api/v1/fares/quote?${p}`).then((q) => live && setQuote(q)).catch((e: Error) => live && setQuoteErr(e.message));
    return () => { live = false; };
  }, [pickup, destId]);

  function useGps() {
    setGpsMsg(null);
    if (!("geolocation" in navigator)) return setGpsMsg("Location isn't available on this device. Choose a landmark instead.");
    setGpsMsg("Getting your location…");
    navigator.geolocation.getCurrentPosition(
      (p) => { setGps({ latitude: p.coords.latitude, longitude: p.coords.longitude, acc: Math.round(p.coords.accuracy) }); setPickupMode("gps"); setGpsMsg(null); },
      () => { setGpsMsg("Location permission was denied or unavailable. Choose a landmark instead."); setPickupMode("landmark"); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 });
  }

  async function request() {
    if (!pickup || !destId || busy) return;
    setBusy(true); setErr(null);
    try {
      await api("/api/v1/rides", { method: "POST", body: { pickup, destinationLocationId: destId, paymentMethod: "cash", idempotencyKey: keyRef.current } });
      keyRef.current = uid(); await refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not request a ride."); } finally { setBusy(false); }
  }
  async function cancel(id: string) {
    if (!confirm("Cancel this ride?")) return;
    try { await api(`/api/v1/rides/${id}/cancel`, { method: "POST" }); await refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not cancel."); }
  }

  const active = rides.find((r) => isActive(r.status));
  const history = rides.filter((r) => !isActive(r.status));

  return (
    <div className="space-y-5 py-6">
      <h1 className="text-3xl font-extrabold text-navy-900">Where are you going?</h1>
      {err && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{err}</p>}

      {active ? (
        <section className={card} aria-live="polite">
          <div className="flex items-center justify-between gap-2"><StatusBadge status={active.status} /></div>
          <dl className="mt-4 space-y-2 text-navy-900">
            <div><dt className="text-sm text-navy-700">Pickup</dt><dd className="font-semibold">{active.pickup.label}</dd></div>
            <div><dt className="text-sm text-navy-700">Destination</dt><dd className="font-semibold">{active.destination.name}</dd></div>
            <div><dt className="text-sm text-navy-700">Fare</dt><dd className="text-2xl font-extrabold">{formatNaira(active.fareKobo)} <span className="text-base font-medium">· pay cash</span></dd></div>
            {active.riderName && <div><dt className="text-sm text-navy-700">Your rider</dt><dd className="font-semibold">{active.riderName}{active.vehicleReg ? ` · ${active.vehicleReg}` : ""}</dd></div>}
          </dl>
          {active.status === "searching" && <p className="mt-3 text-navy-800">Looking for an available rider. This request expires if nobody accepts soon.</p>}
          <button onClick={() => cancel(active.id)} className={`${btnDanger} mt-4 w-full`}>Cancel ride</button>
        </section>
      ) : (
        <section className={`${card} space-y-4`}>
          <div>
            <span className={label}>Pickup</span>
            <div className="mb-2 flex gap-2" role="group" aria-label="Pickup method">
              <button type="button" onClick={() => setPickupMode("landmark")} aria-pressed={pickupMode === "landmark"} className={`${btnGhost} flex-1 ${pickupMode === "landmark" ? "!bg-navy-100" : ""}`}>Landmark</button>
              <button type="button" onClick={useGps} aria-pressed={pickupMode === "gps"} className={`${btnGhost} flex-1 ${pickupMode === "gps" ? "!bg-navy-100" : ""}`}>Use my location</button>
            </div>
            {gpsMsg && <p role="status" className="mb-2 text-sm text-navy-800">{gpsMsg}</p>}
            {pickupMode === "gps" && gps
              ? <p className="rounded-xl bg-navy-50 p-3 text-sm">GPS pin (accuracy about {gps.acc} m). This is a device position, not a named landmark.</p>
              : <select aria-label="Pickup landmark" className={input} value={pickupId} onChange={(e) => setPickupId(e.target.value)}>
                  <option value="">Select pickup landmark</option>
                  {locs.filter((l) => l.pickupAllowed).map((l) => <option key={l.id} value={l.id}>{l.name}{l.verified ? "" : " (unverified)"}</option>)}
                </select>}
          </div>
          <div>
            <label className={label} htmlFor="dest">Destination</label>
            <select id="dest" className={input} value={destId} onChange={(e) => setDestId(e.target.value)}>
              <option value="">Select destination</option>
              {locs.filter((l) => l.destinationAllowed).map((l) => <option key={l.id} value={l.id}>{l.name}{l.verified ? "" : " (unverified)"}</option>)}
            </select>
            {locs.some((l) => !l.verified) && <p className="mt-2 text-xs text-navy-800">Landmarks marked “unverified” are placeholders until the real campus locations are supplied.</p>}
          </div>
          <div className="rounded-xl bg-navy-50 p-4" aria-live="polite">
            <p className="text-sm text-navy-700">Fare</p>
            <p className="text-3xl font-extrabold text-navy-900">{quote ? formatNaira(quote.fareKobo) : "₦200 fixed"}</p>
            {quoteErr && <p role="alert" className="mt-1 text-sm text-red-700">{quoteErr}</p>}
            {!quote && !quoteErr && <p className="text-sm text-navy-800">Select pickup and destination to confirm your fare.</p>}
          </div>
          <fieldset>
            <legend className={label}>Payment</legend>
            <label className="flex min-h-[48px] items-center gap-3 rounded-xl border border-navy-700 bg-navy-50 px-4"><input type="radio" checked readOnly name="pay" /> Cash to rider</label>
            <label className="mt-2 flex min-h-[48px] items-center gap-3 rounded-xl border border-navy-100 px-4 opacity-60"><input type="radio" disabled name="pay" /> Electronic payment <span className="text-xs">(coming soon)</span></label>
          </fieldset>
          <button onClick={request} disabled={!quote || busy} className={`${btnAccent} w-full`}>{busy ? "Requesting…" : "Request Tricycle"}</button>
        </section>
      )}

      <section aria-labelledby="hist">
        <h2 id="hist" className="mb-2 text-xl font-bold">Ride history</h2>
        {history.length === 0 ? <p className="text-navy-800">No past rides yet.</p> : (
          <ul className="space-y-2">
            {history.map((r) => (
              <li key={r.id} className={`${card} !p-4`}>
                <div className="flex items-center justify-between gap-2"><StatusBadge status={r.status} /><span className="font-semibold">{formatNaira(r.fareKobo)}</span></div>
                <p className="mt-2 text-sm">{r.pickup.label} → {r.destination.name}</p>
                <p className="text-xs text-navy-700">{new Date(r.requestedAt).toLocaleString()} · {r.paymentMethod} · {r.status === "completed" ? (r.paymentStatus === "collected" ? "cash collected" : "cash outstanding") : "no charge"}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
export default function StudentPage() {
  return <Gate allow={["student"]} title="Student sign-in">{() => <Booking />}</Gate>;
}
