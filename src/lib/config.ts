import { validateEnv } from "@/lib/env";

/** supabase: configured, real database. unconfigured: every data API refuses (HTTP 503). There is no demo mode. */
export type AppMode = "supabase" | "unconfigured";

export function appMode(): AppMode {
  return validateEnv().ok ? "supabase" : "unconfigured";
}

export const searchTimeoutMinutes = () => {
  const n = Number(process.env.BABRIDE_SEARCH_TIMEOUT_MIN ?? 10);
  return Number.isInteger(n) && n > 0 ? n : 10;
};

/**
 * "boundary" (default, the owner's rule): no fare is quoted until a real service-area polygon is configured.
 * "landmarks": the active, admin-curated landmarks define the service area, so a trip between two different
 * landmarks is eligible without a polygon. GPS pickups still need a polygon. Chosen deliberately by the owner.
 */
export type ServiceAreaMode = "boundary" | "landmarks";
export const serviceAreaMode = (): ServiceAreaMode =>
  (process.env.BABRIDE_SERVICE_AREA ?? "boundary").trim().toLowerCase() === "landmarks" ? "landmarks" : "boundary";

/** Largest group one booking may carry. Default 4. Each vehicle's own confirmed seat capacity is still enforced when a rider accepts. */
export const maxPassengers = (): number => intEnv("BABRIDE_MAX_PASSENGERS", 4, 1, 8);
/** Largest seat count a rider may declare for their keke when registering (passengers only; the driver is not counted). */
export const maxVehicleSeats = (): number => intEnv("BABRIDE_MAX_VEHICLE_SEATS", 6, 1, 8);
/** A rider counts as online only while their last heartbeat is newer than this (covers closed tabs, dead phones, expired sessions). */
export const riderStaleSeconds = (): number => intEnv("BABRIDE_RIDER_STALE_SECONDS", 90, 20, 3600);
/** "Use my location" only picks a landmark closer than this many metres; otherwise the user is shown the nearest options. */
export const nearestMaxMeters = (): number => intEnv("BABRIDE_NEAREST_MAX_METERS", 250, 25, 5000);
/** Search results farther than this from every located landmark are hidden (campus-only search) when no polygon exists yet. */
export const searchRadiusMeters = (): number => intEnv("BABRIDE_SEARCH_RADIUS_M", 2500, 200, 20000);
function intEnv(name: string, dflt: number, min: number, max: number): number {
  const n = Number(process.env[name] ?? dflt);
  return Number.isInteger(n) && n >= min && n <= max ? n : dflt;
}

