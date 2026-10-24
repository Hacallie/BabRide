"use client";
import { useCallback, useEffect, useState } from "react";
import Gate from "@/components/Gate";
import StatusBadge from "@/components/StatusBadge";
import { api } from "@/lib/client-api";
import { formatNaira } from "@/lib/fare";
import { btnGhost, btnPrimary, card } from "@/components/ui";
import LandmarksAdmin from "@/components/admin/LandmarksAdmin";
import type { Loc, Ride, RiderInfo } from "@/lib/types";

interface Dash { totalRides: number; byStatus: Record<string, number>; activeRides: number; riders: { approved: number; pending: number }; cash: { collectedKobo: number; outstandingKobo: number } }
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
          {([["Active rides", dash.activeRides], ["Total rides", dash.totalRides], ["Approved riders", dash.riders.approved], ["Pending riders", dash.riders.pending],
            ["Cash collected", formatNaira(dash.cash.collectedKobo)], ["Cash outstanding", formatNaira(dash.cash.outstandingKobo)]] as [string, string | number][]).map(([k, v]) => (
            <div key={k} className={card}><p className="text-sm text-navy-700">{k}</p><p className="text-3xl font-extrabold">{v}</p></div>))}
          <div className={`${card} sm:col-span-3`}><p className="text-sm text-navy-700">Rides by status</p>
            {Object.keys(dash.byStatus).length === 0 ? <p className="mt-1">No rides yet.</p> : <p className="mt-1">{Object.entries(dash.byStatus).map(([s, n]) => `${s.replace("_", " ")}: ${n}`).join(" · ")}</p>}</div>
        </div>) : <p>Loading…</p>)}

      {tab === "Riders" && (riders.length === 0 ? <p>No rider applications yet.</p> : (
        <ul className="space-y-2">{riders.map((r) => (
          <li key={r.userId} className={card}>
            <p className="font-semibold">{r.name} <span className="text-sm font-normal text-navy-700">· {r.vehicle?.registration ?? "tricycle"}</span></p>
            <p className="text-sm">Status: <b>{r.approval}</b> · {r.online ? "online" : "offline"}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {r.approval !== "approved" && <button onClick={() => riderAction(r.userId, "approve")} className={btnPrimary}>Approve rider + vehicle</button>}
              {r.approval === "pending" && <button onClick={() => riderAction(r.userId, "reject")} className={btnGhost}>Reject</button>}
              {r.approval === "approved" && <button onClick={() => riderAction(r.userId, "suspend")} className={btnGhost}>Suspend</button>}
            </div>
          </li>))}</ul>))}

      {tab === "Rides" && (rides.length === 0 ? <p>No rides yet.</p> : (
        <ul className="space-y-2">{rides.map((r) => (
          <li key={r.id} className={`${card} !p-4`}>
            <div className="flex items-center justify-between"><StatusBadge status={r.status} /><b>{formatNaira(r.fareKobo)}</b></div>
            <p className="mt-1 text-sm">{r.pickup.label} → {r.destination.name}</p>
            <p className="text-xs text-navy-700">{r.studentName} · rider: {r.riderName ?? "none"} · {r.paymentMethod}/{r.paymentStatus} · {new Date(r.requestedAt).toLocaleString()}</p>
          </li>))}</ul>))}

      {tab === "Landmarks" && <LandmarksAdmin locs={locs} reload={load} onError={setErr} />}

      {tab === "Fare" && (
        <div className={card}>
          <p className="text-sm text-navy-700">Active standard fare</p>
          <p className="text-4xl font-extrabold">₦200</p>
          <p className="mt-2 text-navy-800">The fare is locked at 20000 kobo in server code and by a database constraint. Authorized, audited fare changes are not built yet, so there is deliberately no edit control.</p>
        </div>)}
    </div>
  );
}
export default function AdminPage() {
  return <Gate allow={["admin"]} title="Administrator sign-in" signInHref="/login?next=/admin">{() => <Admin />}</Gate>;
}