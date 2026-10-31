"use client";
import { useCallback, useEffect, useState } from "react";
import Gate from "@/components/Gate";
import StatusBadge from "@/components/StatusBadge";
import { api } from "@/lib/client-api";
import { formatNaira } from "@/lib/fare";
import { btnGhost, card } from "@/components/ui";
import LandmarksAdmin from "@/components/admin/LandmarksAdmin";
import type { Loc, Ride, RiderInfo } from "@/lib/types";

interface Dash { totalRides: number; byStatus: Record<string, number>; activeRides: number; riders: { approved: number }; cash: { collectedKobo: number; outstandingKobo: number } }
const TABS = ["Overview", "Riders", "Rides", "Landmarks", "Fare"] as const;

function Admin() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [dash, setDash] = useState<Dash | null>(null); const [riders, setRiders] = useState<RiderInfo[]>([]);
  const [rides, setRides] = useState<Ride[]>([]); const [locs, setLocs] = useState<Loc[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, r, ri, l] = await Promise.all([api<Dash>("/api/v1/admin/dashboard"), api<{ riders: RiderInfo[] }>("/api/v1/admin/riders"),
        api<{ rides: Ride[] }>("/api/v1/admin/rides"), api<{ locations: Loc[] }>("/api/v1/admin/locations")]);
      setDash(d); setRiders(r.riders); setRides(ri.rides); setLocs(l.locations); setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not load."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const [seats, setSeats] = useState<Record<string, string>>({});
  async function saveSeats(id: string) {
    try { await api(`/api/v1/admin/riders/${id}/capacity`, { method: "POST", body: { capacity: Number(seats[id]) } }); setSeats((s) => ({ ...s, [id]: "" })); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed."); }
  }
  async function riderAction(id: string, action: string) { try { await api(`/api/v1/admin/riders/${id}/${action}`, { method: "POST" }); await load(); } catch (e) { setErr(e instanceof Error ? e.message : "Failed."); } }

  return (
    <div className="space-y-4 py-6">
      <h1 className="text-3xl font-extrabold text-navy-900">Administration</h1>
      <div role="tablist" className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`${btnGhost} whitespace-nowrap ${tab === t ? "!bg-navy-900 !text-white" : ""}`}>{t}</button>)}
      </div>
      {err && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{err}</p>}

      {tab === "Overview" && (dash ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {([["Active rides", dash.activeRides], ["Total rides", dash.totalRides], ["Registered riders", dash.riders.approved],
            ["Cash collected", formatNaira(dash.cash.collectedKobo)], ["Cash outstanding", formatNaira(dash.cash.outstandingKobo)]] as [string, string | number][]).map(([k, v]) => (
            <div key={k} className={card}><p className="text-sm text-navy-700">{k}</p><p className="text-3xl font-extrabold">{v}</p></div>))}
          <div className={`${card} sm:col-span-3`}><p className="text-sm text-navy-700">Rides by status</p>
            {Object.keys(dash.byStatus).length === 0 ? <p className="mt-1">No rides yet.</p> : <p className="mt-1">{Object.entries(dash.byStatus).map(([s, n]) => `${s.replace("_", " ")}: ${n}`).join(" · ")}</p>}</div>
        </div>) : <p>Loading…</p>)}

      {tab === "Riders" && (riders.length === 0 ? <p>No riders registered yet.</p> : (
        <ul className="space-y-2">{riders.map((r) => (
          <li key={r.userId} className={card}>
            <p className="font-semibold">{r.name} <span className="text-sm font-normal text-navy-700">· {r.vehicle?.registration ?? "tricycle"}</span></p>
            <p className="text-sm">{r.online ? "Online" : "Offline"}</p>
            {r.vehicle && (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <p className="text-sm">Passenger seats: <b>{r.vehicle.capacity}</b> {r.vehicle.capacityVerified ? <span className="text-emerald-800">(declared by rider or set by admin)</span> : <span className="text-accent-dark">(never recorded: this rider cannot take groups until you set it)</span>}</p>
                <div className="flex items-end gap-2">
                  <div><label className="sr-only" htmlFor={`seats-${r.userId}`}>Set seat capacity for {r.name}</label>
                    <input id={`seats-${r.userId}`} inputMode="numeric" className="min-h-[44px] w-20 rounded-xl border border-navy-100 px-3" placeholder="Seats" value={seats[r.userId] ?? ""} onChange={(e) => setSeats((s) => ({ ...s, [r.userId]: e.target.value.replace(/\D/g, "").slice(0, 1) }))} /></div>
                  <button type="button" disabled={!seats[r.userId]} onClick={() => saveSeats(r.userId)} className={btnGhost}>Set seats</button>
                </div>
              </div>)}
            <div className="mt-3 flex flex-wrap gap-2">
              {r.approval === "approved" && <button onClick={() => riderAction(r.userId, "suspend")} className={btnGhost}>Suspend</button>}
            </div>
          </li>))}</ul>))}

      {tab === "Rides" && (rides.length === 0 ? <p>No rides yet.</p> : (
        <ul className="space-y-2">{rides.map((r) => (
          <li key={r.id} className={`${card} !p-4`}>
            <div className="flex items-center justify-between"><StatusBadge status={r.status} /><b>{formatNaira(r.fareKobo)}</b></div>
            <p className="mt-1 text-sm">{r.pickup.label} → {r.destination.name}</p>
            <p className="text-xs text-navy-700">{r.studentName} · {r.passengerCount} pax × {formatNaira(r.farePerPassengerKobo)} · rider: {r.riderName ?? "none"} · {r.paymentMethod}/{r.paymentStatus} · {new Date(r.requestedAt).toLocaleString()}</p>
          </li>))}</ul>))}

      {tab === "Landmarks" && <LandmarksAdmin locs={locs} reload={load} onError={setErr} />}

      {tab === "Fare" && (
        <div className={card}>
          <p className="text-sm text-navy-700">Active standard fare</p>
          <p className="text-4xl font-extrabold">₦200 <span className="text-lg font-semibold">per passenger</span></p>
          <p className="mt-2 text-navy-800">Total fare = ₦200 × passengers (20000 kobo each), recomputed on the server and enforced by a database constraint. Authorized, audited fare changes are not built yet, so there is deliberately no edit control.</p>
        </div>)}
    </div>
  );
}
export default function AdminPage() {
  return <Gate allow={["admin"]} title="Administrator sign-in" signInHref="/login?next=/admin">{() => <Admin />}</Gate>;
}
