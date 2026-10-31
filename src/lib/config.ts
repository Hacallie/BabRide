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

/** Largest group a customer may request in one booking (1 to 8). Default 4. */
export const maxPassengers = (): number => {
  const n = Number(process.env.BABRIDE_MAX_PASSENGERS ?? 4);
  return Number.isInteger(n) && n >= 1 && n <= 8 ? n : 4;
};

/** Largest seat capacity a rider may declare for a keke (1 to 8, the database ceiling). Default 6. The driver is not counted. */
export const maxVehicleSeats = (): number => {
  const n = Number(process.env.BABRIDE_MAX_VEHICLE_SEATS ?? 6);
  return Number.isInteger(n) && n >= 1 && n <= 8 ? n : 6;
};

/** "Use my location" only snaps to a landmark at most this far away (metres, 25 to 2000). Default 200. */
export const nearestMaxMeters = (): number => {
  const n = Number(process.env.BABRIDE_NEAREST_MAX_METERS ?? 200);
  return Number.isFinite(n) && n >= 25 && n <= 2000 ? n : 200;
};

/** A rider counts as online only if they were seen this recently (seconds, 30 to 900). Default 120. Covers closed tabs and expired sessions. */
export const presenceTtlSec = (): number => {
  const n = Number(process.env.BABRIDE_PRESENCE_TTL_SEC ?? 120);
  return Number.isInteger(n) && n >= 30 && n <= 900 ? n : 120;
};
