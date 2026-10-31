// Nearest campus landmark to a GPS point. Pure and server-side: the browser's coordinates are only an INPUT; the landmark's own
// saved position decides the match, and the resulting landmark id is what gets booked and priced.
import { distanceMeters } from "@/lib/map-plot";
import type { Loc } from "@/lib/types";

export interface NearbyLandmark { id: string; name: string; distanceMeters: number; verified: boolean }
export interface NearestResult {
  match: NearbyLandmark | null;
  nearby: NearbyLandmark[]; // the 3 closest located landmarks, so the user can pick manually when nothing is close enough
  reason: "ok" | "too_far" | "no_located_landmarks" | "outside_campus";
  maxMeters: number;
}

/** Only landmarks that really have a saved position take part. 0,0 placeholders ("Not located yet") never do. */
export const isLocated = (l: Pick<Loc, "status" | "active">) => l.status !== "placeholder" && l.active;

export function nearestLandmarks(point: { latitude: number; longitude: number }, locs: Loc[], maxMeters: number): NearestResult {
  const located = locs.filter(isLocated).map((l): NearbyLandmark => ({
    id: l.id, name: l.name, verified: l.status === "verified",
    distanceMeters: Math.round(distanceMeters({ lat: point.latitude, lng: point.longitude }, { lat: l.latitude, lng: l.longitude })),
  }));
  if (located.length === 0) return { match: null, nearby: [], reason: "no_located_landmarks", maxMeters };
  // Nearest first; for (almost) equal distances prefer a ground-verified landmark.
  located.sort((a, b) => a.distanceMeters - b.distanceMeters || Number(b.verified) - Number(a.verified));
  const nearby = located.slice(0, 3);
  const best = located[0]!;
  return best.distanceMeters <= maxMeters ? { match: best, nearby, reason: "ok", maxMeters } : { match: null, nearby, reason: "too_far", maxMeters };
}
