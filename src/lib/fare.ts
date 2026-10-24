/** Server-side fare engine. The client never supplies a fare. */
export const FIXED_FARE_KOBO = 20000; // ₦200
export const CURRENCY = "NGN" as const;

export type LngLat = [number, number]; // [lng, lat]
export type Boundary = LngLat[] | null; // single outer ring; null = not configured

export interface Point { latitude: number; longitude: number }

export type QuoteResult =
  | { ok: true; fareKobo: number; currency: typeof CURRENCY }
  | { ok: false; code: "BOUNDARY_NOT_CONFIGURED" | "PICKUP_OUT_OF_AREA" | "DESTINATION_OUT_OF_AREA" | "SAME_LOCATION" | "INVALID_COORDINATES"; message: string };

export function isValidPoint(p: Point): boolean {
  return Number.isFinite(p.latitude) && Number.isFinite(p.longitude) &&
    Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;
}

/** Ray-casting point-in-polygon. */
export function pointInPolygon(p: Point, ring: LngLat[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!; const [xj, yj] = ring[j]!;
    const hit = yi > p.latitude !== yj > p.latitude &&
      p.longitude < ((xj - xi) * (p.latitude - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

export interface QuoteConfig {
  boundary: Boundary;
  fareKobo?: number; // institution fare; must equal the validated fixed value for v1
}

export function quoteFare(pickup: Point, destination: Point, cfg: QuoteConfig): QuoteResult {
  if (!isValidPoint(pickup) || !isValidPoint(destination))
    return { ok: false, code: "INVALID_COORDINATES", message: "Location coordinates are invalid." };
  if (pickup.latitude === destination.latitude && pickup.longitude === destination.longitude)
    return { ok: false, code: "SAME_LOCATION", message: "Pickup and destination must be different." };

  if (cfg.boundary === null) {
    // No bypass: until a real, approved service boundary is configured, no fare is quoted.
    return { ok: false, code: "BOUNDARY_NOT_CONFIGURED", message: "Campus service area is not configured yet." };
  } else {
    if (!pointInPolygon(pickup, cfg.boundary))
      return { ok: false, code: "PICKUP_OUT_OF_AREA", message: "Pickup is outside the campus service area." };
    if (!pointInPolygon(destination, cfg.boundary))
      return { ok: false, code: "DESTINATION_OUT_OF_AREA", message: "Destination is outside the campus service area." };
  }
  // Distance never changes the fare. Configured fare must match the v1 fixed value.
  const fare = cfg.fareKobo ?? FIXED_FARE_KOBO;
  if (fare !== FIXED_FARE_KOBO) throw new Error("Institution fare differs from the validated fixed fare");
  return { ok: true, fareKobo: fare, currency: CURRENCY };
}

export const formatNaira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG")}`;
