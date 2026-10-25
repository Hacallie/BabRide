"use client";
import { useMemo, useState } from "react";
import { osmEmbedUrl, osmLargeUrl } from "@/lib/geo-pick";
import { distanceMeters, formatDistance, project } from "@/lib/map-plot";
import type { Loc } from "@/lib/types";

const W = 320, H = 200;
interface Props { locations: Loc[]; pickupId?: string; destinationId?: string; gps?: { latitude: number; longitude: number } | null }

/**
 * Light-weight campus map: an SVG plot of the REAL saved landmark positions (no tiles, works offline and on slow phones),
 * plus an optional street map that loads only when asked. Landmarks without a position are never drawn.
 * The straight-line distance is information only; it never affects the fare.
 */
export default function CampusMap({ locations, pickupId, destinationId, gps }: Props) {
  const [street, setStreet] = useState(false);
  const located = useMemo(() => locations.filter((l) => l.status !== "placeholder"), [locations]);
  const pickup = locations.find((l) => l.id === pickupId); const dest = locations.find((l) => l.id === destinationId);

  const placed = useMemo(() => {
    const pts = located.map((l) => ({ id: l.id, lat: l.latitude, lng: l.longitude }));
    if (gps) pts.push({ id: "__gps", lat: gps.latitude, lng: gps.longitude });
    return project(pts, W, H);
  }, [located, gps]);
  const at = (id: string) => placed.find((p) => p.id === id);

  const a = gps ? at("__gps") : pickup && pickup.status !== "placeholder" ? at(pickup.id) : undefined;
  const b = dest && dest.status !== "placeholder" ? at(dest.id) : undefined;
  const meters = a && b && placed.length ? distanceMeters(
    gps ? { lat: gps.latitude, lng: gps.longitude } : { lat: pickup!.latitude, lng: pickup!.longitude }, { lat: dest!.latitude, lng: dest!.longitude }) : null;
  const missing = [pickup && pickup.status === "placeholder" ? pickup.name : null, dest && dest.status === "placeholder" ? dest.name : null].filter(Boolean) as string[];

  const centre = useMemo(() => {
    const pts = placed.length ? placed : [];
    if (!pts.length) return null;
    return { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length };
  }, [placed]);

  return (
    <section aria-labelledby="map-h" className="overflow-hidden rounded-xl2 border border-navy-100 bg-navy-950 text-white">
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <h2 id="map-h" className="text-sm font-semibold">Campus map</h2>
        <span className="text-xs text-mist">{located.length} of {locations.length} landmarks located</span>
      </div>
      {placed.length === 0 ? (
        <p role="status" className="px-4 py-8 text-center text-sm text-mist">No landmark has a map position yet. An administrator adds positions in the Landmarks tab. You can still pick places by name.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Map of ${located.length} located campus landmarks${a && b ? " with your route highlighted" : ""}`}>
          <rect width={W} height={H} fill="#0A2454" />
          {a && b && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#DDBB62" strokeWidth="2" strokeDasharray="5 6" strokeLinecap="round" className="route-line" />}
          {placed.filter((p) => p.id !== "__gps").map((p) => {
            const l = located.find((x) => x.id === p.id)!; const isA = p.id === pickup?.id && !gps, isB = p.id === dest?.id;
            return (
              <g key={p.id}>
                <circle cx={p.x} cy={p.y} r={isA || isB ? 7 : 4.5} fill={isB ? "#DDBB62" : isA ? "#FFFFFF" : l.verified ? "#245CE2" : "none"} stroke={isA || isB ? "#071A3D" : "#B9C9E8"} strokeWidth={isA || isB ? 2 : 1.5} />
                <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="9.5" fill={isA || isB ? "#FFFFFF" : "#B9C9E8"} fontWeight={isA || isB ? 700 : 400} style={{ paintOrder: "stroke", stroke: "#0A2454", strokeWidth: 3 }}>{l.name.length > 16 ? `${l.name.slice(0, 15)}…` : l.name}</text>
              </g>);
          })}
          {gps && at("__gps") && <g><circle cx={at("__gps")!.x} cy={at("__gps")!.y} r="7" fill="#FFFFFF" stroke="#245CE2" strokeWidth="3" /><text x={at("__gps")!.x} y={at("__gps")!.y - 11} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#fff" style={{ paintOrder: "stroke", stroke: "#0A2454", strokeWidth: 3 }}>You (GPS)</text></g>}
        </svg>
      )}
      <div className="space-y-1 px-4 pb-3 pt-2 text-xs text-mist">
        {placed.length > 0 && <p><span aria-hidden="true">● filled blue = ground verified · ○ hollow = location selected, not yet checked on site.</span> Schematic plot, not to scale.</p>}
        {meters !== null && <p>Straight-line distance: about <b className="text-white">{formatDistance(meters)}</b>. Information only: the fare is always ₦200 per ride.</p>}
        {missing.length > 0 && <p role="status" className="text-accent">{missing.join(" and ")} {missing.length > 1 ? "have" : "has"} no map position yet, so {missing.length > 1 ? "they aren't" : "it isn't"} drawn.</p>}
        {centre && (
          <div className="pt-1">
            {!street
              ? <button type="button" onClick={() => setStreet(true)} className="min-h-[44px] rounded-lg border border-white/20 px-3 font-medium text-white hover:bg-white/10">Show street map (uses mobile data)</button>
              : <div>
                  <iframe title="Street map around the selected landmarks" src={osmEmbedUrl(centre.lat, centre.lng, 0.004)} loading="lazy" referrerPolicy="no-referrer" className="h-52 w-full rounded-lg border border-white/15" />
                  <p className="mt-1">If the street map doesn't load, the plot above still works. <a className="underline" href={osmLargeUrl(centre.lat, centre.lng)} target="_blank" rel="noreferrer noopener">Open a larger map</a></p>
                </div>}
          </div>)}
      </div>
    </section>
  );
}
