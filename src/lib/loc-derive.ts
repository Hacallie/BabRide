// How a saved landmark row becomes a status. Decided by the SAVED COORDINATES, not only by the optional "source" label,
// so a landmark that already has a real position is never shown as "Not located yet".
import type { LocSource, LocStatus } from "@/lib/types";

/** 0,0 (and anything within ~100 m of it) is the "no position" placeholder, never a campus point. */
export const isPlaceholderCoords = (lat: number | null, lng: number | null): boolean =>
  lat === null || lng === null || (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001);

export function deriveLocation(row: { latitude: number | null; longitude: number | null; is_verified: boolean; location_source: LocSource | null }): { status: LocStatus; source: LocSource | null } {
  if (isPlaceholderCoords(row.latitude, row.longitude)) return { status: "placeholder", source: null };
  return { status: row.is_verified ? "verified" : "selected", source: row.location_source ?? "legacy" };
}
