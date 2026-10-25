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

/** Largest group a student may request in one booking. Default 3 matches vehicles.capacity's database default.
 *  Each vehicle's own admin-confirmed capacity is still enforced when a rider accepts. */
export const maxPassengers = (): number => {
  const n = Number(process.env.BABRIDE_MAX_PASSENGERS ?? 3);
  return Number.isInteger(n) && n >= 1 && n <= 8 ? n : 3;
};
