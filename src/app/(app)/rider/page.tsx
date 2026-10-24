"use client";
import { useCallback, useEffect, useState } from "react";
import Gate from "@/components/Gate";
import StatusBadge from "@/components/StatusBadge";
import { api } from "@/lib/client-api";
import { formatNaira } from "@/lib/fare";
import { btnAccent, btnDanger, btnGhost, btnPrimary, card } from "@/components/ui";
import type { Ride, RiderInfo } from "@/lib/types";

interface Feed { rider: RiderInfo | null; active: Ride | null; requests: Ride[]; recent: Ride[] }
const NEXT: Record<string, { action: string; text: string }> = {
  assigned: { action: "depart", text: "Head to pickup" },
  rider_arriving: { action: "arrive", text: "I've arrived" },
  rider_arrived: { action: "start", text: "Start ride" },
  in_progress: { action: "complete", text: "Complete ride" },
};

function Dashboard() {
  const [feed, setFeed] = useState<Feed | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setFeed(await api<Feed>("/api/v1/rider/requests")); } catch (e) { setErr(e instanceof Error ? e.message : "Connection problem."); } }, []);
  useEffect(() => { void load(); const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 3000); return () => clearInterval(t); }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setErr(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "Action failed."); } finally { setBusy(false); await load(); }
  }
  if (!feed) return <p className="p-8 text-center" role="status">{err ?? "Loading…"}</p>;
  const info = feed.rider;
  if (!info || info.approval !== "approved") {
    return <div className={`${card} my-6`}><h1 className="text-2xl font-bold">Rider status: {info?.approval ?? "not applied"}</h1>
      <p className="mt-2 text-navy-800">{info?.approval === "pending" ? "Your application is waiting for administrator approval. You'll be able to go online once approved." : "Your rider account cannot accept rides."}</p></div>;
  }
  const a = feed.active;
  return (
    <div className="space-y-5 py-6">
      <div className="flex items-center justify-between gap-3">
        <div><h1 className="text-3xl font-extrabold text-navy-900">Rider</h1><p className="text-sm text-navy-800">{info.name}{info.vehicle?.registration ? ` · ${info.vehicle.registration}` : ""}</p></div>
        <button disabled={busy || !!a} aria-pressed={info.online} onClick={() => run(() => api("/api/v1/rider/availability", { method: "POST", body: { online: !info.online } }))}
          className={`${info.online ? btnAccent : btnGhost}`}>{info.online ? "Online · tap to go offline" : "Offline · go online"}</button>
      </div>
      {err && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{err}</p>}

      {a && (
        <section className={card} aria-live="polite">
          <div className="flex items-center justify-between"><StatusBadge status={a.status} /></div>
          <p className="mt-3 font-semibold">{a.pickup.label} → {a.destination.name}</p>
          <p className="text-2xl font-extrabold">{formatNaira(a.fareKobo)} <span className="text-base font-medium">· {a.paymentMethod}</span></p>
          <p className="text-sm text-navy-800">Passenger: {a.studentName}</p>
          {NEXT[a.status] && <button disabled={busy} onClick={() => run(() => api(`/api/v1/rides/${a.id}/${NEXT[a.status]!.action}`, { method: "POST" }))} className={`${btnPrimary} mt-4 w-full`}>{NEXT[a.status]!.text}</button>}
          {(a.status === "assigned" || a.status === "rider_arriving") && <button disabled={busy} onClick={() => run(() => api(`/api/v1/rides/${a.id}/release`, { method: "POST" }))} className={`${btnDanger} mt-2 w-full`}>Release this ride</button>}
        </section>
      )}

      {!a && (
        <section aria-labelledby="req">
          <h2 id="req" className="mb-2 text-xl font-bold">Incoming requests</h2>
          {!info.online ? <p className="text-navy-800">Go online to see ride requests.</p>
            : feed.requests.length === 0 ? <p className="text-navy-800">No requests right now. This page checks every few seconds.</p>
            : <ul className="space-y-3">{feed.requests.map((r) => (
                <li key={r.id} className={card}>
                  <p className="font-semibold">{r.pickup.label} → {r.destination.name}</p>
                  <p className="text-2xl font-extrabold">{formatNaira(r.fareKobo)} <span className="text-base font-medium">· {r.paymentMethod}</span></p>
                  <button disabled={busy} onClick={() => run(() => api(`/api/v1/rides/${r.id}/accept`, { method: "POST" }))} className={`${btnAccent} mt-3 w-full`}>Accept ride</button>
                </li>))}</ul>}
        </section>
      )}

      <section aria-labelledby="rec">
        <h2 id="rec" className="mb-2 text-xl font-bold">Recent trips</h2>
        {feed.recent.length === 0 ? <p className="text-navy-800">No trips yet.</p> : (
          <ul className="space-y-2">{feed.recent.map((r) => (
            <li key={r.id} className={`${card} !p-4`}>
              <div className="flex items-center justify-between"><StatusBadge status={r.status} /><b>{formatNaira(r.fareKobo)}</b></div>
              <p className="mt-1 text-sm">{r.pickup.label} → {r.destination.name}</p>
              {r.status === "completed" && <p className="text-sm">Payment: {r.paymentMethod === "cash" ? (r.paymentStatus === "collected" ? "cash collected" : "cash outstanding") : "electronic"}</p>}
              {r.status === "completed" && r.paymentMethod === "cash" && r.paymentStatus === "outstanding" &&
                <button disabled={busy} onClick={() => run(() => api(`/api/v1/rides/${r.id}/collect-cash`, { method: "POST" }))} className={`${btnGhost} mt-2 w-full`}>Record cash collected</button>}
            </li>))}</ul>)}
      </section>
    </div>
  );
}
export default function RiderPage() {
  return <Gate allow={["rider"]} title="Rider sign-in" signInHref="/rider/login" deniedAction={{ href: "/rider/join", label: "Apply to become a rider" }}>{() => <Dashboard />}</Gate>;
}