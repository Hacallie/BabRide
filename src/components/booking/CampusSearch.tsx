"use client";
import { useState } from "react";
import PlaceSearch from "@/components/PlaceSearch";
import { api } from "@/lib/client-api";
import type { LandmarkHit } from "@/lib/landmark-geo";

/** Campus-only search for the booking screens. Results are landmarks from the campus's own table, so nothing off campus can be picked. */
export default function CampusSearch({ onPick, tone = "light", idPrefix = "cs" }: { onPick: (hit: LandmarkHit, as: "pickup" | "destination") => void; tone?: "light" | "dark"; idPrefix?: string }) {
  const [as, setAs] = useState<"pickup" | "destination">("destination");
  const dark = tone === "dark";
  const seg = (v: "pickup" | "destination") => `min-h-[40px] rounded-lg px-3 text-sm font-medium ${as === v ? (dark ? "bg-white/20 text-white" : "bg-navy-900 text-white") : (dark ? "text-mist" : "text-navy-800")}`;
  return (
    <div className="space-y-2">
      <PlaceSearch<LandmarkHit> id={`${idPrefix}-search`} label="Search campus places" placeholder="e.g. Emerald, CAF, Guest House" tone={tone} minLength={2}
        search={async (q, signal) => { void signal; return (await api<{ results: LandmarkHit[] }>(`/api/v1/campus/search?q=${encodeURIComponent(q)}`)).results; }}
        resultKey={(h) => h.id}
        renderResult={(h) => <><span className="block font-semibold">{h.name}</span>{h.description && <span className="block truncate text-xs opacity-80">{h.description}</span>}</>}
        onSelect={(h) => onPick(h, as)} emptyText="No campus place matches that. Try another name." />
      <div role="group" aria-label="Use the result as" className="flex items-center gap-1 text-sm">
        <span className={dark ? "text-mist" : "text-navy-700"}>Use result as:</span>
        <button type="button" aria-pressed={as === "pickup"} onClick={() => setAs("pickup")} className={seg("pickup")}>Pickup</button>
        <button type="button" aria-pressed={as === "destination"} onClick={() => setAs("destination")} className={seg("destination")}>Destination</button>
      </div>
    </div>
  );
}
