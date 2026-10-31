"use client";
import { useRef, useState } from "react";
import { api } from "@/lib/client-api";
import { formatDistance } from "@/lib/map-plot";
import type { NearbyLandmark } from "@/lib/landmark-geo";

export interface LocationMatch { id: string; name: string; description: string; latitude: number; longitude: number; distanceMeters: number }
interface NearestResponse { status: "matched" | "too_far" | "outside_campus" | "none"; match: NearbyLandmark | null; nearby: NearbyLandmark[]; maxMeters: number }

/**
 * "Use my location": asks the browser for a position, then asks the SERVER which campus landmark is nearest.
 * A match is only made within the server's configured distance; otherwise the nearest options are listed so the person can choose.
 * The pickup that results carries the landmark id, name and the server's coordinates (the browser position is never the pickup).
 */
export default function UseMyLocation({ onMatch, className, tone = "light", label = "Use my location" }: {
  onMatch: (m: LocationMatch) => void; className?: string; tone?: "light" | "dark"; label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [options, setOptions] = useState<NearbyLandmark[]>([]);
  const guard = useRef(false);

  function fail(text: string) { guard.current = false; setBusy(false); setMsg(text); }

  function locate() {
    if (guard.current) return;
    setMsg(null); setOptions([]);
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return setMsg("Location isn't available on this device. Choose a landmark instead.");
    guard.current = true; setBusy(true); setMsg("Getting your location…");
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        try {
          const qs = new URLSearchParams({ latitude: String(p.coords.latitude), longitude: String(p.coords.longitude), accuracy: String(Math.round(p.coords.accuracy ?? 0)) });
          const r = await api<NearestResponse>(`/api/v1/campus/nearest?${qs}`);
          guard.current = false; setBusy(false);
          if (r.status === "matched" && r.match) { setMsg(`Pickup set to ${r.match.name} (about ${formatDistance(r.match.distanceMeters)} from you).`); return onMatch(r.match); }
          if (r.status === "outside_campus") return setMsg("You appear to be outside the campus service area. Please choose a landmark.");
          if (r.status === "too_far") { setOptions(r.nearby); return setMsg(`You're not close enough to a landmark (within ${formatDistance(r.maxMeters)}) to pick one automatically. Choose the nearest one below, or pick any landmark.`); }
          setMsg("No campus landmarks are available to match yet. Please choose a landmark.");
        } catch (e) { fail(e instanceof Error && e.message ? e.message : "Couldn't find a nearby landmark. Choose one manually."); }
      },
      (err) => fail(err?.code === 1 ? "Location permission was denied. Choose a landmark instead, or allow location access in your browser settings."
        : err?.code === 3 ? "Finding your location took too long. Move to open sky and try again, or choose a landmark."
        : "Your location isn't available right now. Choose a landmark instead."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 });
  }

  const dark = tone === "dark";
  return (
    <div className="min-w-0">
      <button type="button" onClick={locate} disabled={busy} aria-busy={busy}
        className={className ?? (dark ? "rounded-lg border border-white/15 px-2.5 py-1 text-xs font-medium text-mist transition hover:bg-white/10 disabled:opacity-50"
          : "inline-flex min-h-[48px] items-center justify-center rounded-xl border border-navy-100 bg-white px-5 py-3 text-base font-semibold text-navy-900 hover:bg-navy-50 disabled:opacity-50")}>{label}</button>
      {msg && <p role="status" className={`mt-2 text-sm ${dark ? "text-mist" : "text-navy-800"}`}>{msg}</p>}
      {options.length > 0 && (
        <ul className="mt-2 space-y-1" aria-label="Nearest landmarks">
          {options.map((o) => (
            <li key={o.id}><button type="button" onClick={() => { setOptions([]); setMsg(`Pickup set to ${o.name}.`); onMatch(o); }}
              className={`min-h-[44px] w-full rounded-xl border px-3 py-2 text-left text-sm ${dark ? "border-white/15 bg-white/10 text-white hover:bg-white/20" : "border-navy-100 bg-white text-navy-950 hover:bg-navy-50"}`}>
              {o.name} <span className={dark ? "text-mist" : "text-navy-700"}>· about {formatDistance(o.distanceMeters)} away</span></button></li>))}
        </ul>)}
    </div>
  );
}
