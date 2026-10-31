// Pure landmark/geography helpers shared by the server (pricing, nearest match, search) and the tests. No network.
import { pointInPolygon, type Boundary } from "@/lib/fare";
import { validPoint } from "@/lib/geo-pick";
import { distanceMeters } from "@/lib/map-plot";
import type { Loc } from "@/lib/types";

/** The ONLY definition of "this landmark has a map position": real, in-range coordinates (never (0,0)). */
export const isLocated = (l: { latitude: number; longitude: number }): boolean => validPoint(l.latitude, l.longitude);

export interface Bounds { west: number; south: number; east: number; north: number }
/** Owner-supplied rough campus rectangle "west,south,east,north". Never guessed. */
export function parseBounds(raw: string | undefined | null): Bounds | null {
  if (!raw) return null;
  const n = raw.split(",").map((x) => Number(x.trim()));
  if (n.length !== 4 || n.some((x) => !Number.isFinite(x))) return null;
  const [a, b, c, d] = n as [number, number, number, number];
  if (Math.abs(a) > 180 || Math.abs(c) > 180 || Math.abs(b) > 90 || Math.abs(d) > 90 || a === c || b === d) return null;
  return { west: Math.min(a, c), east: Math.max(a, c), south: Math.min(b, d), north: Math.max(b, d) };
}

/** true = on campus, false = off campus, null = cannot tell (no polygon and no rectangle configured). Polygon wins over rectangle. */
export function onCampus(p: { latitude: number; longitude: number }, boundary: Boundary, bounds: Bounds | null): boolean | null {
  if (boundary) return pointInPolygon(p, boundary);
  if (bounds) return p.longitude >= bounds.west && p.longitude <= bounds.east && p.latitude >= bounds.south && p.latitude <= bounds.north;
  return null;
}

export interface NearbyLandmark { id: string; name: string; description: string; latitude: number; longitude: number; verified: boolean; distanceMeters: number }
export type NearestResult =
  | { status: "matched"; match: NearbyLandmark; nearby: NearbyLandmark[] }
  | { status: "too_far"; match: null; nearby: NearbyLandmark[] }
  | { status: "outside_campus"; match: null; nearby: [] }
  | { status: "none"; match: null; nearby: [] };

/** Nearest located, active, pickup-allowed landmark by great-circle distance; never snaps to anything beyond maxMeters. */
export function nearestLandmark(point: { latitude: number; longitude: number }, locs: Loc[], opts: { maxMeters: number; boundary?: Boundary; bounds?: Bounds | null; limit?: number }): NearestResult {
  if (!validPoint(point.latitude, point.longitude)) return { status: "none", match: null, nearby: [] };
  if (onCampus(point, opts.boundary ?? null, opts.bounds ?? null) === false) return { status: "outside_campus", match: null, nearby: [] };
  const ranked: NearbyLandmark[] = locs
    .filter((l) => l.active && l.pickupAllowed && isLocated(l))
    .map((l) => ({ id: l.id, name: l.name, description: l.description, latitude: l.latitude, longitude: l.longitude, verified: l.verified,
      distanceMeters: Math.round(distanceMeters({ lat: point.latitude, lng: point.longitude }, { lat: l.latitude, lng: l.longitude })) }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters || Number(b.verified) - Number(a.verified) || a.name.localeCompare(b.name));
  if (ranked.length === 0) return { status: "none", match: null, nearby: [] };
  const nearby = ranked.slice(0, opts.limit ?? 3);
  return ranked[0]!.distanceMeters <= opts.maxMeters ? { status: "matched", match: ranked[0]!, nearby } : { status: "too_far", match: null, nearby };
}

export interface LandmarkHit { id: string; name: string; description: string; located: boolean; verified: boolean; latitude: number | null; longitude: number | null }
/** Name search over the campus's own landmark list: campus-only by construction. All words must appear in the name or description. */
export function searchLandmarks(locs: Loc[], query: string, purpose?: "pickup" | "destination"): LandmarkHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const score = (l: Loc) => { const n = l.name.toLowerCase(); return n === query.trim().toLowerCase() ? 0 : n.startsWith(words[0]!) ? 1 : 2; };
  return locs
    .filter((l) => l.active && (purpose === "pickup" ? l.pickupAllowed : purpose === "destination" ? l.destinationAllowed : l.pickupAllowed || l.destinationAllowed))
    .filter((l) => { const hay = `${l.name} ${l.description}`.toLowerCase(); return words.every((w) => hay.includes(w)); })
    .sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name)).slice(0, 8)
    .map((l) => { const ok = isLocated(l); return { id: l.id, name: l.name, description: l.description, located: ok, verified: l.verified && ok, latitude: ok ? l.latitude : null, longitude: ok ? l.longitude : null }; });
}
